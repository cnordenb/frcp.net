import { MersenneTwister, createLogic } from "./logic.js";

(async () => {
  const VERSION = "1.0.0";
  // simple/index.html loads this page with data-simple set: no images, no sounds.
  const SIMPLE = document.documentElement.hasAttribute("data-simple");

  // ---- Data ----

  // data.json holds the editions, DLCs and civs, as logic.js describes. The page starts once it has loaded.
  const DATA = await (await fetch("data.json")).json();
  const logic = createLogic(DATA);
  const { EDITIONS, EDITION_INFO, DLCS, CIVS, DISPLAY_ORDER, inEdition, editionTotal } = logic;
  const DLC_KEYS = ["A", "S", "D", "F", "G", "H", "J", "K", "L"];
  const EDITION_KEYS = ["Q", "W", "E"];
  const GRID_COLS = [10, 112, 214, 316, 418];

  // tools/atlas_builder.py lays the icon atlases out in rows of these lengths: the civ icons in civ ID order with
  // "random" last, and the edition icons (normal, hover and pressed for each edition) followed by the icons of the
  // DLCs that have one, in data.json order, so each edition's three looks share a row. The edition banners are
  // stacked in data.json order.
  const CIV_ATLAS_COLS = 8;
  const DLC_ATLAS_COLS = 6;
  const RANDOM_CELL = CIVS.length;
  const DLC_ICONS = Object.keys(DLCS).filter((d) => DLCS[d].icon);
  const dlcCell = (dlc) => 3 * EDITIONS.length + DLC_ICONS.indexOf(dlc);

  const PRESET_MAX_BYTES = 65536;
  const UNDO_CAP = 200;
  const KEY_SETTINGS = "frcp.settings";
  const KEY_STATE = "frcp.state";
  const KEY_QUICK = "frcp.quicksave";

  // ---- Hotkeys ----

  // Desktop mode follows the desktop app. Browser-friendly mode leaves reload, find, save page,
  // help and Tab to the browser.
  const GLOBAL_KEYS = {
    desktop: [
      ["Tab", "cycleTab"], ["1", "tab0"], ["2", "tab1"], ["3", "tab2"],
      ["F1", "options"], ["F2", "hotkeys"], ["F3", "about"], ["F4", "techtree"],
      ["F5", "quicksave"], ["F9", "quickload"],
      ["Ctrl+S", "savePreset"], ["Ctrl+R", "loadPreset"], ["P", "copyLink"], ["U", "openLink"], ["Ctrl+F", "lobby"],
      ["Ctrl+Z", "undo"], ["Ctrl+X", "redo"],
      ["Z", "quizName"], ["X", "quizIcon"], ["C", "quizCounter"], ["V", "quizJingles"], ["B", "quizUi"],
    ],
    browser: [
      ["1", "tab0"], ["2", "tab1"], ["3", "tab2"],
      ["O", "options"], ["F2", "hotkeys"], ["?", "hotkeys"], ["I", "about"], ["F4", "techtree"],
      ["F8", "quicksave"], ["F9", "quickload"],
      ["P", "copyLink"], ["U", "openLink"], ["M", "lobby"],
      ["Ctrl+Z", "undo"], ["Ctrl+X", "redo"],
      ["Z", "quizName"], ["X", "quizIcon"], ["C", "quizCounter"], ["V", "quizJingles"], ["B", "quizUi"],
    ],
  };
  const TAB_KEYS = [
    [["Space", "draw"], ["Enter", "reset"], ["Q", "options"], ["T", "techtree"]],
    [["Space", "draw"], ["Enter", "reset"], ["Q", "clearLog"], ["W", "toggleRemaining"]],
    [["Space", "enableAll"], ["Enter", "disableAll"], ...EDITIONS.map((ed, i) => [EDITION_KEYS[i], "ed" + ed]),
      ["R", "autoToggle"], ["T", "autoReset"], ...DLC_KEYS.map((k, i) => [k, "dlc" + i])],
  ];
  const ACTION_TEXT = {
    cycleTab: "Cycle tabs", tab0: "Go to Draw Civ tab", tab1: "Go to Log tab", tab2: "Go to Civ Pool tab",
    options: "Open Options", hotkeys: "Open Hotkeys", about: "Open About", techtree: "Open Tech Tree",
    quicksave: "Quicksave", quickload: "Quickload", savePreset: "Save preset", loadPreset: "Load preset",
    copyLink: "Copy share link", openLink: "Open a share link",
    lobby: "Join Lobby", undo: "Undo a draw or reset", redo: "Redo",
    quizName: "Toggle civ name", quizIcon: "Toggle civ icon", quizCounter: "Toggle round counter",
    quizJingles: "Toggle civ jingles", quizUi: "Toggle UI sounds",
    draw: "Draw civ", reset: "Reset drawn civs", clearLog: "Clear past rounds", toggleRemaining: "Toggle remaining log",
    enableAll: "Enable all civs", disableAll: "Disable all civs",
    ...Object.fromEntries(EDITIONS.map((ed) => ["ed" + ed, EDITION_INFO[ed].short])),
    autoToggle: "Auto-toggle older civs", autoReset: "Auto-reset on change",
  };

  // ---- Settings and saved state ----

  // A freshness setting at or above half the pool means "the most", so it follows the pool's size.
  const FRESH_MOST = 1000;

  const DEFAULT_SETTINGS = {
    v: 1,
    showName: true, showIcon: true, showCounter: true, tooltips: true,
    jingles: true, legacyJingles: true, uiSounds: true,
    drawOnLoad: false, newRoundOnVisit: false,
    fresh: true, freshN: FRESH_MOST,
    showRemaining: true, autoReset: false, autoToggle: false,
    hotkeys: "browser",
  };

  function storageGet(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  }
  function storageSet(key, value) {
    try { localStorage.setItem(key, value); return true; } catch { return false; }
  }
  function parseJson(raw) {
    try { return JSON.parse(raw); } catch { return null; }
  }

  function parseSettings(raw) {
    const s = { ...DEFAULT_SETTINGS };
    const data = parseJson(raw);
    if (!data || typeof data !== "object") return s;
    for (const k of Object.keys(DEFAULT_SETTINGS)) {
      if (k !== "v" && typeof data[k] === typeof DEFAULT_SETTINGS[k]) s[k] = data[k];
    }
    if (s.hotkeys !== "desktop" && s.hotkeys !== "browser") s.hotkeys = DEFAULT_SETTINGS.hotkeys;
    if (!Number.isInteger(s.freshN) || s.freshN < 1) s.freshN = 1;
    return s;
  }

  const { emptyState, applyEdition, parseState, serialiseState, hasContent } = logic;

  let settings = parseSettings(storageGet(KEY_SETTINGS));
  let state = parseState(storageGet(KEY_STATE)) || emptyState();
  const ui = { tab: 0, flash: null };
  const undoStacks = { undo: [], redo: [] };
  let rng = null;
  try { rng = new MersenneTwister(); } catch { rng = null; }

  // The state helpers of logic.js, for the current state
  const isOn = (id) => logic.isOn(state, id);
  const poolIds = () => logic.poolIds(state);
  const round = () => logic.round(state);
  const drawnIds = () => logic.drawnIds(state);
  const drawnCount = () => logic.drawnCount(state);
  const remainingIds = () => logic.remainingIds(state);
  function currentCiv() {
    const r = round();
    return r.length ? CIVS[r[r.length - 1][0]] : null;
  }
  const currentId = () => (currentCiv() ? currentCiv().id : null);

  let storageWarned = false;
  function saveState() {
    if (!storageSet(KEY_STATE, JSON.stringify(serialiseState(state))) && !storageWarned) {
      storageWarned = true;
      toast("This browser isn't letting the page save");
    }
  }
  function saveSettings() {
    storageSet(KEY_SETTINGS, JSON.stringify(settings));
  }

  function commit() {
    ui.flash = null;
    saveState();
    render();
  }

  // ---- Sound ----

  const UI_SOUNDS = {
    button: "button_sound", tab: "parchment_sound", click: "click_sound", hover: "hover_sound", error: "error_sound", view: "view_sound", mute: "mute",
  };
  const audioCache = new Map();
  let playing = null;

  function audioFor(url) {
    let a = audioCache.get(url);
    if (!a) {
      a = new Audio(url);
      a.preload = "auto";
      audioCache.set(url, a);
    }
    return a;
  }
  function stopSound() {
    if (hoverAudio) hoverAudio.pause();
    if (!playing) return;
    playing.pause();
    try { playing.currentTime = 0; } catch { /* not loaded yet */ }
    playing = null;
  }
  // One sound at a time, as on the desktop app: a new sound cuts off the one playing.
  // Browsers block sound until the first click or key press, so early calls fail quietly.
  function playUrl(url) {
    if (SIMPLE) return;
    stopSound();
    const a = audioFor(url);
    playing = a;
    // Seeking takes a moment, so a sound already at its start, such as a preloaded jingle, plays without one.
    try { if (a.currentTime) a.currentTime = 0; } catch { /* not loaded yet */ }
    const p = a.play();
    if (p) p.catch(() => {});
  }
  const uiUrl = (name) => `sounds/ui/${UI_SOUNDS[name]}.webm`;
  function sfx(name) {
    if (settings.uiSounds) playUrl(uiUrl(name));
  }
  // The hover sound has a channel of its own, so moving the mouse doesn't cut off a jingle.
  let hoverAudio = null;
  function hoverChannel() {
    if (!hoverAudio) {
      hoverAudio = new Audio(uiUrl("hover"));
      hoverAudio.preload = "auto";
    }
    return hoverAudio;
  }
  function hoverSound() {
    if (SIMPLE) return;
    if (!settings.uiSounds) return;
    const a = hoverChannel();
    try { a.currentTime = 0; } catch { /* not loaded yet */ }
    const p = a.play();
    if (p) p.catch(() => {});
  }
  // Plays the hover sound whenever the mouse cursor turns into the pointing hand. A touch has no hover, so it doesn't.
  let handCursor = false;
  function onPointerOver(e) {
    const hand = e.pointerType === "mouse" && e.target instanceof Element && getComputedStyle(e.target).cursor.endsWith("pointer");
    if (hand && !handCursor) hoverSound();
    handCursor = hand;
  }
  function jingleUrl(id) {
    const legacy = settings.legacyJingles;
    if (id == null) return legacy ? "sounds/civ/legacy/random.webm" : "sounds/civ/random.webm";
    const c = CIVS[id];
    return legacy && c.legacy ? `sounds/civ/legacy/${c.file}.webm` : `sounds/civ/${c.file}.webm`;
  }
  function jingle(id) {
    if (settings.jingles) playUrl(jingleUrl(id));
  }
  // Of the jingles, only the two that a draw or a reset plays next are loaded ahead: the next draw's and the random
  // one. The others load when they're played.
  function loadNextJingles() {
    if (SIMPLE || !settings.jingles) return;
    audioFor(jingleUrl(null));
    const id = nextDraw();
    if (id !== null) audioFor(jingleUrl(id));
  }

  let warmed = false;
  function warmUp() {
    if (warmed) return;
    warmed = true;
    if (SIMPLE) return;
    for (const name of Object.keys(UI_SOUNDS)) audioFor(uiUrl(name));
    hoverChannel();
  }

  // ---- Drawing ----

  const { freshMax } = logic;
  const freshLimit = (poolSize) => logic.freshLimit(poolSize, settings.freshN);
  const drawCandidates = () => logic.drawCandidates(state, settings);
  // The next draw is picked ahead of time, so its jingle can load before the draw is revealed (logic.js keeps the
  // pick fair as the civs it can come from change).
  const picker = logic.createPicker(rng);
  function nextDraw(from = drawCandidates()) {
    return picker.next(from);
  }
  const closeRound = () => logic.closeRound(state);

  // The draw was picked ahead and its jingle loaded, so it's revealed at once: name, icon and jingle together. The
  // render then picks the next draw and starts loading its jingle.
  function draw({ silent = false } = {}) {
    const pool = poolIds();
    if (!pool.length || !rng) {
      if (!silent) sfx("error");
      ui.flash = rng ? "Empty pool!" : "No random source";
      render();
      return;
    }
    const id = nextDraw();
    recordUndo();
    logic.recordDraw(state, id);
    commit();
    if (silent) return;
    if (settings.jingles) jingle(id);
    else sfx("button");
  }

  function reset() {
    if (!round().length) return;
    recordUndo();
    closeRound();
    commit();
    if (settings.jingles && ui.tab !== 2) jingle(null);
    else sfx("button");
  }

  // Re-rolling swaps the current civ for another of the civs it was drawn from. Those are nearly always among the
  // next draw's civs, so the next draw ahead usually stands, and the swap is revealed as quickly as a draw. The
  // swapped-out civ goes back into the round, so it can still come up later.
  //
  // The swap stands in for the draw rather than following it, so neither undo nor continuous freshness records it:
  // the log keeps only the civ the swaps end on, and undoing goes back to before the draw. It still clears redo, which
  // would otherwise undo the swap.
  function rerollCivs() {
    const entries = round();
    const current = entries[entries.length - 1];
    if (!current || !rng) return null;
    entries.pop();
    const others = drawCandidates().filter((id) => id !== current[0]);
    entries.push(current);
    return others.length ? others : null;
  }
  function reroll() {
    const others = rerollCivs();
    if (!others) {
      sfx("error");
      return;
    }
    undoStacks.redo.length = 0;
    const entries = round();
    entries.pop();
    const id = nextDraw(others);
    entries.push([id, drawnCount() + 1, poolIds().length]);
    commit();
    if (settings.jingles) jingle(id);
    else sfx("button");
  }

  // Undo and redo cover draws and resets for this visit, but not re-rolls. Changing the pool clears them.
  const snapshot = () => JSON.stringify(state.log);
  function recordUndo() {
    undoStacks.undo.push(snapshot());
    if (undoStacks.undo.length > UNDO_CAP) undoStacks.undo.shift();
    undoStacks.redo.length = 0;
  }
  function clearHistory() {
    undoStacks.undo.length = 0;
    undoStacks.redo.length = 0;
  }
  function step(from, to) {
    if (!from.length) {
      sfx("error");
      return;
    }
    to.push(snapshot());
    state.log = JSON.parse(from.pop());
    commit();
    if (settings.jingles) jingle(currentId());
    else sfx("button");
  }
  const undo = () => step(undoStacks.undo, undoStacks.redo);
  const redo = () => step(undoStacks.redo, undoStacks.undo);

  function clearLog() {
    sfx("button");
    state.log = [round()];
    clearHistory();
    commit();
  }

  // ---- Civ pool ----

  const poolKey = () => state.edition + "|" + [...state.off].sort((a, b) => a - b).join(",");
  function changePool(mutate) {
    const before = poolKey();
    mutate();
    applyEdition(state);
    if (poolKey() === before) {
      render();
      return;
    }
    clearHistory();
    if (settings.autoReset) closeRound();
    commit();
  }
  function setOn(ids, on) {
    for (const id of ids) {
      if (on) state.off.delete(id);
      else state.off.add(id);
    }
  }
  const dlcIds = (dlc) => CIVS.filter((c) => c.dlc === dlc && inEdition(c, state.edition)).map((c) => c.id);
  const olderIds = (ed) => CIVS.filter((c) => EDITION_INFO[ed].olderDlcs.includes(c.dlc)).map((c) => c.id);

  function toggleCiv(id) {
    sfx("click");
    changePool(() => setOn([id], !isOn(id)));
  }
  function toggleDlc(dlc) {
    const ids = dlcIds(dlc);
    const on = !ids.some(isOn);
    sfx("button");
    changePool(() => setOn(ids, on));
  }
  function toggleDlcSlot(i) {
    const dlc = EDITION_INFO[state.edition].dlcToggles[i];
    if (dlc) toggleDlc(dlc);
  }
  function enableAll() {
    sfx("button");
    changePool(() => setOn(CIVS.filter((c) => inEdition(c, state.edition)).map((c) => c.id), true));
  }
  function disableAll() {
    sfx("button");
    changePool(() => setOn(CIVS.map((c) => c.id), false));
  }
  function setEdition(ed) {
    sfx("view");
    if (ed === state.edition) {
      render();
      return;
    }
    changePool(() => {
      state.edition = ed;
      applyEdition(state);
      if (settings.autoToggle) setOn(olderIds(ed), true);
    });
  }
  // As on the desktop app, this also switches the edition's older civs on or off.
  function toggleAutoToggle() {
    settings.autoToggle = !settings.autoToggle;
    saveSettings();
    sfx("button");
    changePool(() => setOn(olderIds(state.edition), settings.autoToggle));
  }
  function toggleAutoReset() {
    settings.autoReset = !settings.autoReset;
    saveSettings();
    sfx("button");
    render();
  }

  // ---- Settings toggles ----

  function toggleSetting(key) {
    sfx("button");
    settings[key] = !settings[key];
    saveSettings();
    render();
    syncOptions();
  }
  function setJingles(on) {
    settings.jingles = on;
    saveSettings();
    if (on) jingle(currentId());
    else playUrl(uiUrl("mute"));
    render();
    syncOptions();
  }
  function setUiSounds(on) {
    settings.uiSounds = on;
    saveSettings();
    if (on) sfx("button");
    else playUrl(uiUrl("mute"));
    syncOptions();
  }

  function setTab(i) {
    if (i === ui.tab) return;
    ui.tab = i;
    sfx("tab");
    render();
  }

  // ---- Share links ----

  // logic.js writes and reads the codes.
  const shareUrl = (withDraws) => location.href.split("#")[0] + "#p=" + logic.shareCode(state, withDraws);
  const { parseShare } = logic;

  function applyLink(link) {
    logic.applyLink(state, link);
    clearHistory();
    commit();
  }

  function offerLink(link) {
    if (!hasContent(state)) {
      applyLink(link);
      toast("Loaded the shared link");
      return;
    }
    openPreview(link);
  }

  function readHash() {
    const h = location.hash;
    return h.startsWith("#p=") ? h.slice(3) : null;
  }
  function clearHash() {
    history.replaceState(null, "", location.pathname + location.search);
  }
  function handleLinkInUrl(code) {
    clearHash();
    const link = parseShare(code);
    if (!link) {
      sfx("error");
      msgBox("Link not recognised", "This link isn't a valid Fresh Random Civ Picker link, so nothing has changed.");
      return;
    }
    offerLink(link);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch { /* fall back below */ }
    const ta = h("textarea", { value: text, readOnly: true, style: { position: "fixed", opacity: "0" } });
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch { ok = false; }
    ta.remove();
    return ok;
  }

  // Copies a share link with the pool, and with this round's draws unless withDraws is false
  async function copyShareLink(withDraws = true) {
    sfx("button");
    const n = withDraws ? drawnIds().filter(isOn).length : 0;
    if (await copyText(shareUrl(withDraws))) toast(n ? `Link copied: civ pool + ${n} drawn civ${n === 1 ? "" : "s"}` : "Link copied: civ pool");
    else openShare();
  }

  // ---- Quicksave ----

  function quicksave() {
    sfx("button");
    toast(storageSet(KEY_QUICK, JSON.stringify(serialiseState(state))) ? "Quicksaved" : "Couldn't quicksave");
  }
  function quickload() {
    const saved = parseState(storageGet(KEY_QUICK));
    if (!saved) {
      sfx("error");
      toast("Nothing quicksaved yet");
      return;
    }
    state = saved;
    clearHistory();
    commit();
    if (settings.jingles) jingle(currentId());
    else sfx("button");
    toast("Quickloaded");
  }

  // ---- Presets ----

  // Preset files are the desktop app's .txt files, which logic.js writes and reads.
  function presetFileName() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `FRCP Preset v${VERSION}w @${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.txt`;
  }
  function savePreset() {
    sfx("button");
    const url = URL.createObjectURL(new Blob([logic.presetText(state, settings.fresh)], { type: "text/plain" }));
    const a = h("a", { href: url, download: presetFileName() });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  function loadPreset() {
    sfx("button");
    const input = $("presetFile");
    input.value = "";
    input.click();
  }
  async function loadPresetFile(file) {
    let preset = null;
    try { preset = file.size <= PRESET_MAX_BYTES ? logic.parsePreset(await file.text()) : null; } catch { preset = null; }
    if (!preset) {
      sfx("error");
      msgBox("Preset not recognised", `${file.name} isn't a Fresh Random Civ Picker preset, so nothing has changed.`);
      return;
    }
    logic.applyPreset(state, preset);
    clearHistory();
    commit();
    if (settings.jingles) jingle(currentId());
    else sfx("button");
    toast("Preset loaded");
  }

  // ---- Links out ----

  function openExternal(url) {
    window.open(url, "_blank", "noopener");
  }
  function techTreeUrl() {
    const c = currentCiv();
    return "https://aoe2techtree.net/" + (c ? "#" + c.techTree : "");
  }
  function openTechTree() {
    sfx("button");
    openExternal(techTreeUrl());
  }
  function openEditionPage() {
    sfx("button");
    const info = EDITION_INFO[state.edition];
    if (info.url) openExternal(info.url);
    else msgBox(info.short, info.storeNote);
  }
  function lobbyUrl(text, spectate) {
    const m = /^(?:aoe2de:\/\/[01]\/)?(\d{6,12})$/i.exec(text.trim());
    return m ? `aoe2de://${spectate ? 1 : 0}/${m[1]}` : null;
  }
  function launch(url) {
    const a = h("a", { href: url });
    document.body.append(a);
    a.click();
    a.remove();
  }

  // ---- DOM helpers ----

  const $ = (id) => document.getElementById(id);
  function h(tag, props = {}, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === "dataset") Object.assign(el.dataset, v);
      else if (k === "style") Object.assign(el.style, v);
      else if (k in el) el[k] = v;
      else el.setAttribute(k, v);
    }
    el.append(...kids);
    return el;
  }
  // Shows cell i of an atlas with rows of cols cells: the CSS draws the cell from --x and --y.
  function setCell(el, i, cols) {
    el.style.setProperty("--x", i % cols);
    el.style.setProperty("--y", Math.floor(i / cols));
  }
  function atlasCell(className, i, cols) {
    const el = h("span", { className });
    setCell(el, i, cols);
    return el;
  }
  function setText(el, text) {
    if (el.textContent !== text) el.textContent = text;
  }

  const els = {
    client: $("client"),
    panel: $("panel"),
    tabs: [$("tab-0"), $("tab-1"), $("tab-2")],
    civIcon: $("civIcon"),
    civGhost: $("civGhost"),
    civName: $("civName"),
    counter: $("roundCounter"),
    drawnCount: $("drawnCount"),
    drawnLog: $("drawnLog"),
    remainingCount: $("remainingCount"),
    remainingLog: $("remainingLog"),
    showRemaining: $("showRemaining"),
    edIcon: $("editionIcon"),
    enabledCount: $("enabledCount"),
    autoToggle: $("autoToggle"),
    autoReset: $("autoReset"),
    editionButtons: [],
    tip: $("tip"),
  };

  const civBoxes = [];
  const dlcBoxes = {};
  function dlcTip(dlc, slot) {
    const names = CIVS.filter((c) => c.dlc === dlc).map((c) => c.name);
    return `Toggles ${DLCS[dlc].name} civilisation${names.length === 1 ? "" : "s"}\n(${names.join(", ")})\nHotkey: ${DLC_KEYS[slot]}`;
  }
  // The atlas cell that stands in for a civ or DLC checkbox, with the off cross that shows while it's unchecked
  function chkIcon(className, i, cols, size) {
    if (SIMPLE) return "";
    return h("span", { className: "chk-icon", style: { width: size + "px", height: size + "px" } },
      atlasCell("chk-face sprite " + className, i, cols),
      h("img", { className: "chk-off", src: "images/ui/off.webp", alt: "", width: size, height: size, decoding: "async" }));
  }
  function buildPoolControls() {
    // Edition rows sit where the desktop app's radio buttons are, with an icon in place of the radio circle.
    EDITIONS.forEach((ed, i) => {
      const info = EDITION_INFO[ed];
      const button = h("button", {
        type: "button", className: "imgbtn edition", id: "ed" + ed, "aria-pressed": "false",
        dataset: { pick: ed, tip: `Selects the ${info.short} (${info.year}) civilisation pool\nHotkey: ${EDITION_KEYS[i]}` },
      }, atlasCell("ed-icon sprite dlc-cell", 3 * i, DLC_ATLAS_COLS), `${info.short} (${info.year})`);
      Object.assign(button.style, { left: "10px", top: 36 + 30 * i + "px" });
      $("editionGroup").append(button);
      els.editionButtons.push(button);
    });
    // Each civ keeps its place in the grid in every edition, as on the desktop app.
    DISPLAY_ORDER.forEach((c, i) => {
      const input = h("input", { type: "checkbox" });
      input.addEventListener("change", () => toggleCiv(c.id));
      const label = h("label", { className: "chk icon-chk civ" },
        input, chkIcon("civ-cell", c.id, CIV_ATLAS_COLS, 18), h("span", { className: "chk-name" }, c.name));
      Object.assign(label.style, { left: GRID_COLS[i % 5] + "px", top: 210 + 20 * Math.floor(i / 5) + "px" });
      $("civGrid").append(label);
      civBoxes[c.id] = { label, input };
    });
    for (const ed of EDITIONS) {
      const L = EDITION_INFO[ed].dlcToggleLayout;
      const group = h("div", { dataset: { on: "2", edition: ed } });
      EDITION_INFO[ed].dlcToggles.forEach((dlc, i) => {
        const input = h("input", { type: "checkbox" });
        input.addEventListener("change", () => toggleDlc(dlc));
        const label = h("label", { className: "chk icon-chk", dataset: { tip: dlcTip(dlc, i), dlc } },
          input, chkIcon("dlc-cell", dlcCell(dlc), DLC_ATLAS_COLS, L.size), h("span", { className: "chk-name" }, DLCS[dlc].name));
        Object.assign(label.style, { left: L.left + "px", top: L.top + L.step * i + "px", height: L.size + "px", gap: L.gap + "px" });
        group.append(label);
        dlcBoxes[dlc] = input;
      });
      els.panel.append(group);
    }
  }

  const STATIC_TIPS = {
    drawBtn: "Draws a fresh random civilisation\nHotkey: Space",
    resetBtn: "Resets the pool of drawn civs and renders all enabled civs available\nHotkey: Enter",
    clearLogBtn: "Clears the log of past rounds. The current round stays.\nHotkey: Q",
    showRemainingLabel: "Toggles the display of the remaining civs log\nHotkey: W",
    autoToggleLabel: "Toggles older civs as well as the automatic enabling of older civs when switching between editions\nHotkey: R",
    autoResetLabel: "Automatically resets the pool of drawn civs when the civilisation pool is changed\nHotkey: T",
    enableAllBtn: "Enables all civilisations so that they are made available in the pool of civilisations for drawing\nHotkey: Space",
    disableAllBtn: "Disables all civilisations so that they are removed from the pool of civilisations for drawing\nHotkey: Enter",
    poolShareBtn: "Copies a share link with this civ pool",
  };

  function keyLabel(action) {
    const pair = GLOBAL_KEYS[settings.hotkeys].find(([, a]) => a === action);
    return pair ? pair[0] : "";
  }

  // ---- Render ----

  // The drawn log's rounds, newest first, each listing its draws newest first as [civ id, text]
  function drawnRows() {
    const rounds = [];
    for (let r = state.log.length - 1; r >= 0; r--) {
      const entries = state.log[r];
      if (entries.length) rounds.push(entries.map(([id, k, n]) => [id, k ? `${CIVS[id].name} (${k}/${n})` : CIVS[id].name]).reverse());
    }
    return rounds;
  }
  // Fills a log with rounds of [civ id, text] rows, each led by the civ's icon, unless it shows those rows already
  const logKeys = new Map();
  function fillLog(log, rounds) {
    const key = JSON.stringify(rounds);
    if (logKeys.get(log) === key) return;
    logKeys.set(log, key);
    log.replaceChildren(...rounds.map((rows) => h("div", { className: "log-round" }, ...rows.map(([id, text]) =>
      h("div", { className: "log-row" }, SIMPLE ? "" : atlasCell("log-icon sprite civ-cell", id, CIV_ATLAS_COLS), text)))));
  }

  // ---- Log scrollbars ----

  // The parchment logs hide the browser's scrollbar, and each gets one in the game's style laid over its right side:
  // an up button, a track and a down button, with a knob that runs the whole track. The wheel, the keyboard and
  // touch still scroll the log itself, and the knob follows.
  const logBars = new Map();
  const lineHeight = (log) => parseFloat(getComputedStyle(log).lineHeight) || 16;

  // Calls step(pointer y) at once and then repeatedly while the press lasts, as a scrollbar's buttons and track do.
  // Step returns false to stop.
  function whileHeld(el, step) {
    el.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || e.target.closest(".sb-knob")) return;
      e.preventDefault();
      el.setPointerCapture(e.pointerId);
      let y = e.clientY;
      let timer = 0;
      const repeat = (delay) => { timer = setTimeout(() => { if (step(y) !== false) repeat(50); }, delay); };
      const move = (ev) => { y = ev.clientY; };
      el.addEventListener("pointermove", move);
      el.addEventListener("lostpointercapture", () => {
        clearTimeout(timer);
        el.removeEventListener("pointermove", move);
      }, { once: true });
      if (step(y) !== false) repeat(350);
    });
  }
  // Scrolls the log by dy and reports whether it moved
  function scrollLog(log, dy) {
    const before = log.scrollTop;
    log.scrollTop += dy;
    return log.scrollTop !== before;
  }

  // The logs scroll without animation or momentum: the wheel, the keys and a finger move a log straight to its new
  // place, where the browser would glide there or keep it coasting.
  const canScroll = (log) => log.scrollHeight > log.clientHeight;
  function wheelLog(log, e) {
    if (e.ctrlKey || !canScroll(log)) return;
    e.preventDefault();
    scrollLog(log, e.deltaY * (e.deltaMode === 1 ? lineHeight(log) : e.deltaMode === 2 ? log.clientHeight : 1));
  }
  function scrollInstantly(log) {
    log.addEventListener("wheel", (e) => wheelLog(log, e), { passive: false });
    // Arrow keys move by a line, Page Up and Down by a page, and Home and End to either end. With a modifier held
    // (Shift to select, say), the keys keep their usual jobs.
    log.addEventListener("keydown", (e) => {
      if (e.shiftKey || e.ctrlKey || e.altKey || e.metaKey || !canScroll(log)) return;
      const line = lineHeight(log);
      const page = Math.max(line, log.clientHeight - line);
      const dy = { ArrowUp: -line, ArrowDown: line, PageUp: -page, PageDown: page, Home: -log.scrollHeight, End: log.scrollHeight }[e.key];
      if (dy === undefined) return;
      e.preventDefault();
      scrollLog(log, dy);
    });
    // A finger drags the log, which stops as soon as it lifts. The CSS turns off the browser's own touch panning.
    log.addEventListener("pointerdown", (e) => {
      if (e.pointerType !== "touch" || !canScroll(log)) return;
      log.setPointerCapture(e.pointerId);
      const y0 = e.clientY;
      const top0 = log.scrollTop;
      const move = (ev) => { log.scrollTop = top0 - (ev.clientY - y0); };
      log.addEventListener("pointermove", move);
      log.addEventListener("lostpointercapture", () => log.removeEventListener("pointermove", move), { once: true });
    });
  }

  function buildLogBar(log) {
    const knob = h("div", { className: "sb-knob" });
    const track = h("div", { className: "sb-track" }, knob);
    const up = h("div", { className: "sb-btn sb-up" });
    const down = h("div", { className: "sb-btn sb-down" });
    const bar = h("div", { className: "sb", hidden: true, "aria-hidden": "true", dataset: { on: "1" } }, up, track, down);
    log.after(bar);
    logBars.set(log, { bar, track, knob });

    whileHeld(up, () => scrollLog(log, -lineHeight(log)));
    whileHeld(down, () => scrollLog(log, lineHeight(log)));
    // A press on the track pages towards the pointer until the knob reaches it.
    let dir = 0;
    whileHeld(track, (y) => {
      const k = knob.getBoundingClientRect();
      if (!dir) dir = y < k.top ? -1 : 1;
      if (dir < 0 ? y >= k.top : y < k.bottom) {
        dir = 0;
        return false;
      }
      if (scrollLog(log, dir * Math.max(lineHeight(log), log.clientHeight - lineHeight(log)))) return true;
      dir = 0;
      return false;
    });
    track.addEventListener("lostpointercapture", () => { dir = 0; });
    // Dragging the knob scrolls the log in proportion, the track's free length standing for the hidden part of the log.
    knob.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      knob.setPointerCapture(e.pointerId);
      const y0 = e.clientY;
      const top0 = log.scrollTop;
      const ratio = (log.scrollHeight - log.clientHeight) / (track.clientHeight - knob.offsetHeight);
      const move = (ev) => { log.scrollTop = top0 + (ev.clientY - y0) * ratio; };
      knob.addEventListener("pointermove", move);
      knob.addEventListener("lostpointercapture", () => knob.removeEventListener("pointermove", move), { once: true });
    });
    bar.addEventListener("wheel", (e) => wheelLog(log, e), { passive: false });
    log.addEventListener("scroll", () => paintLogBar(log));
  }

  // Shows the bar while the log overflows, over the log's padding on the right, with the knob at the scroll position
  function paintLogBar(log) {
    const { bar, track, knob } = logBars.get(log);
    log.classList.toggle("has-bar", log.scrollHeight > log.clientHeight);
    const max = log.scrollHeight - log.clientHeight;
    bar.hidden = max <= 0;
    if (bar.hidden) return;
    bar.style.left = log.offsetLeft + log.offsetWidth - log.clientLeft - bar.offsetWidth + "px";
    bar.style.top = log.offsetTop + log.clientTop + "px";
    bar.style.height = log.clientHeight + "px";
    knob.style.top = Math.round(Math.min(1, log.scrollTop / max) * (track.clientHeight - knob.offsetHeight)) + "px";
  }

  function render() {
    const tab = ui.tab;
    els.client.dataset.tab = tab;
    els.tabs.forEach((t, i) => {
      t.setAttribute("aria-selected", String(i === tab));
      t.tabIndex = i === tab ? 0 : -1;
    });
    els.panel.setAttribute("aria-labelledby", "tab-" + tab);

    const n = poolIds().length;
    const drawn = drawnCount();
    const left = remainingIds();
    const cur = currentCiv();

    // Draw Civ tab
    $("civIcon").hidden = !settings.showIcon;
    setCell(els.civIcon, cur ? cur.id : RANDOM_CELL, CIV_ATLAS_COLS);
    $("civIcon").setAttribute("aria-label", cur ? `${cur.name}: play the jingle` : "Random: play the jingle");
    setText(els.civName, ui.flash || (cur ? cur.name : "?"));
    els.civName.hidden = !settings.showName;
    setText(els.counter, `${drawn}/${n}`);
    els.counter.hidden = !settings.showCounter;

    // Log tab
    setText(els.drawnCount, `Drawn: ${drawn}/${n}`);
    setText(els.remainingCount, `Remaining: ${left.length}/${n}`);
    fillLog(els.drawnLog, drawnRows());
    const leftSet = new Set(left);
    fillLog(els.remainingLog, [DISPLAY_ORDER.filter((c) => leftSet.has(c.id)).map((c) => [c.id, c.name])]);
    els.showRemaining.checked = settings.showRemaining;
    els.remainingLog.hidden = !settings.showRemaining;
    for (const log of logBars.keys()) paintLogBar(log);

    // Civ Pool tab
    const ed = state.edition;
    const info = EDITION_INFO[ed];
    for (const b of els.editionButtons) b.setAttribute("aria-pressed", String(b.dataset.pick === ed));
    setCell(els.edIcon, EDITIONS.indexOf(ed), 1);
    $("editionIcon").setAttribute("aria-label", info.url ? `${info.series}: ${info.name} on Steam` : `About ${info.name}`);
    setText(els.enabledCount, `Enabled: ${n}/${editionTotal(ed)}`);
    els.autoToggle.checked = settings.autoToggle;
    els.autoReset.checked = settings.autoReset;
    for (const c of CIVS) {
      civBoxes[c.id].label.hidden = !inEdition(c, ed);
      civBoxes[c.id].input.checked = isOn(c.id);
    }
    for (const g of els.panel.querySelectorAll("div[data-edition]")) g.hidden = g.dataset.edition !== ed;
    for (const dlc of EDITION_INFO[ed].dlcToggles) dlcBoxes[dlc].checked = dlcIds(dlc).some(isOn);

    // Tooltips and hotkey labels that depend on the tab, the civ or the hotkey mode
    const optionsKey = keyLabel("options");
    $("optionsBig").dataset.tip = `Opens options\nHotkey: Q / ${optionsKey}`;
    $("techBtn").dataset.tip = `Opens the tech tree${cur ? " for the " + cur.name : ""}\nHotkey: T (Draw tab only) / ${keyLabel("techtree")}`;
    $("shareBtn").dataset.tip = `Copies a share link with the currently selected civ pool and this round's draws\nHotkey: ${keyLabel("copyLink")}`;
    for (const k of document.querySelectorAll("kbd[data-key]")) setText(k, keyLabel(k.dataset.key));
    if (tipTarget) setText(els.tip, tipTarget.dataset.tip || "");

    // The next draw may have changed, so its jingle starts loading.
    loadNextJingles();
  }

  // ---- Dialogs ----

  const anyDialogOpen = () => document.querySelector("dialog[open]") !== null;
  function showDialog(d) {
    hideTip();
    closeMenus();
    if (!d.open) d.showModal();
  }
  function closeDialog(d) {
    sfx("button");
    d.close();
  }
  function msgBox(title, text) {
    $("msgTitle").textContent = title;
    $("msgText").textContent = text;
    showDialog($("dlgMsg"));
  }

  const optForm = $("optForm");
  function syncOptions() {
    const f = optForm.elements;
    for (const k of ["showName", "showIcon", "showCounter", "tooltips", "jingles", "uiSounds", "drawOnLoad", "newRoundOnVisit", "fresh"]) {
      f[k].checked = settings[k];
    }
    f.jingleType.value = settings.legacyJingles ? "legacy" : "de";
    f.jingleType.disabled = !settings.jingles;
    f.hotkeys.value = settings.hotkeys;
    $("modeHint").textContent = settings.hotkeys === "desktop"
      ? "The desktop app's keys. Tab, F1, F3, F5, Ctrl+S, Ctrl+R and Ctrl+F do picker things instead of browser things."
      : "Leaves reload, find, save page, help and Tab to the browser.";
    const n = poolIds().length;
    const slider = f.freshN;
    slider.max = String(freshMax(n));
    slider.value = String(freshLimit(n));
    slider.disabled = !settings.fresh || n < 2;
    updateFreshLabel();
    paintSlider();
  }
  function updateFreshLabel() {
    const n = poolIds().length;
    const v = Number(optForm.elements.freshN.value);
    $("freshLabel").textContent = n < 2 ? "Needs at least 2 civs in the pool"
      : `Exclude the last ${v} civ${v === 1 ? "" : "s"}${v === freshMax(n) ? " (the most)" : ""}`;
  }
  // The parchment slider's on track runs up to the knob
  function paintSlider() {
    const s = optForm.elements.freshN;
    const span = Number(s.max) - Number(s.min);
    s.parentElement.style.setProperty("--fill", span > 0 ? (Number(s.value) - Number(s.min)) / span : 0);
  }
  function openOptions() {
    sfx("button");
    syncOptions();
    showDialog($("dlgOptions"));
  }

  function buildHotkeys() {
    const rows = (pairs) => {
      const byAction = new Map();
      for (const [key, act] of pairs) byAction.set(act, [...(byAction.get(act) || []), key]);
      return [...byAction].map(([act, keys]) => [keys, act.startsWith("dlc") ? dlcSlotText(Number(act.slice(3))) : ACTION_TEXT[act]]);
    };
    const section = (title, list, className = "") => h("section", { className },
      h("h3", {}, title),
      h("ul", {}, ...list.map(([keys, text]) => h("li", {},
        ...keys.flatMap((k, i) => [i ? " / " : "", h("kbd", { className: "key" }, k)]), " " + text))));
    $("hkGrid").replaceChildren(
      section("Global", [...rows(GLOBAL_KEYS[settings.hotkeys]), [["Esc"], "Close a dialog or menu"]], "global"),
      h("div", {}, section("Draw Civ tab", rows(TAB_KEYS[0])), section("Log tab", rows(TAB_KEYS[1]))),
      section("Civ Pool tab", rows(TAB_KEYS[2])),
    );
    $("hkMode").textContent = settings.hotkeys === "desktop"
      ? "Desktop hotkeys. Options can switch to browser-friendly hotkeys, which leave the browser's own keys alone."
      : "Browser-friendly hotkeys. Options can switch to the desktop app's hotkeys.";
  }
  const dlcSlotText = (i) => "Toggle " + EDITIONS.map((ed) => EDITION_INFO[ed].dlcToggles[i]).filter(Boolean).map((d) => DLCS[d].short).join(" / ");
  function openHotkeys() {
    sfx("button");
    buildHotkeys();
    showDialog($("dlgHotkeys"));
  }
  function openAbout() {
    sfx("button");
    showDialog($("dlgAbout"));
  }
  function openLobby() {
    sfx("button");
    $("lobbyCode").value = "";
    $("lobbyErr").hidden = true;
    showDialog($("dlgLobby"));
  }
  function openShare() {
    $("sharePool").value = shareUrl(false);
    $("shareRound").value = shareUrl(true);
    const n = drawnIds().filter(isOn).length;
    $("shareNote").textContent = n
      ? `The second link also carries the ${n} civ${n === 1 ? "" : "s"} drawn this round, in order.`
      : "Nothing has been drawn this round, so both links are the same.";
    sfx("button");
    showDialog($("dlgShare"));
  }
  function openLinkDialog() {
    sfx("button");
    $("openInput").value = "";
    $("openErr").hidden = true;
    showDialog($("dlgOpen"));
  }
  let pendingLink = null;
  function openPreview(link) {
    pendingLink = link;
    const enabled = CIVS.filter((c) => link.enabled[c.id]).length;
    const out = DISPLAY_ORDER.filter((c) => inEdition(c, link.edition) && !link.enabled[c.id]).map((c) => c.name);
    $("pvEdition").textContent = EDITION_INFO[link.edition].name;
    $("pvPool").textContent = `${enabled} of ${editionTotal(link.edition)} civs`
      + (out.length && out.length <= 12 ? `. Left out: ${out.join(", ")}` : "");
    $("pvRound").textContent = link.draws.length
      ? `${link.draws.length} drawn: ${link.draws.map((id) => CIVS[id].name).join(", ")}`
      : "Nothing drawn. Loading the link starts a new round.";
    showDialog($("dlgPreview"));
  }

  // ---- Menus ----

  let openMenuEl = null;
  function openMenu(menu) {
    if (openMenuEl === menu) return;
    closeMenus();
    hideTip();
    menu.classList.add("open");
    menu.querySelector(".menu-list").hidden = false;
    menu.querySelector(".menu-title").setAttribute("aria-expanded", "true");
    openMenuEl = menu;
  }
  function closeMenus() {
    if (!openMenuEl) return;
    openMenuEl.classList.remove("open");
    openMenuEl.querySelector(".menu-list").hidden = true;
    openMenuEl.querySelector(".menu-title").setAttribute("aria-expanded", "false");
    openMenuEl = null;
  }

  // ---- Tooltips and toasts ----

  let tipTarget = null;
  function hideTip() {
    els.tip.hidden = true;
    tipTarget = null;
  }
  // Tooltips follow the mouse, so a touch shows none.
  function moveTip(e) {
    const target = settings.tooltips && e.pointerType === "mouse" && !openMenuEl && !anyDialogOpen() && e.target instanceof Element
      ? e.target.closest("[data-tip]") : null;
    if (!target) {
      if (tipTarget) hideTip();
      return;
    }
    tipTarget = target;
    setText(els.tip, target.dataset.tip);
    els.tip.classList.toggle("ext", "tipExt" in target.dataset);
    els.tip.hidden = false;
    const w = els.tip.offsetWidth;
    const ht = els.tip.offsetHeight;
    let x = e.clientX + 10;
    let y = e.clientY + 20;
    if (x + w > innerWidth - 4) x = Math.max(4, innerWidth - w - 4);
    if (y + ht > innerHeight - 4) y = e.clientY - ht - 8;
    els.tip.style.left = x + "px";
    els.tip.style.top = y + "px";
  }

  let toastTimer = 0;
  function toast(text) {
    const t = $("toast");
    t.textContent = text;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
  }

  // ---- Actions (hotkeys, menus and buttons) ----

  const ACTIONS = {
    cycleTab: () => setTab((ui.tab + 1) % 3),
    tab0: () => setTab(0), tab1: () => setTab(1), tab2: () => setTab(2),
    options: openOptions, hotkeys: openHotkeys, about: openAbout, techtree: openTechTree,
    quicksave, quickload, savePreset, loadPreset,
    copyLink: copyShareLink, share: openShare, openLink: openLinkDialog, lobby: openLobby,
    undo, redo,
    quizName: () => toggleSetting("showName"),
    quizIcon: () => toggleSetting("showIcon"),
    quizCounter: () => toggleSetting("showCounter"),
    quizJingles: () => setJingles(!settings.jingles),
    quizUi: () => setUiSounds(!settings.uiSounds),
    draw: () => draw(), reset, clearLog, toggleRemaining: () => toggleSetting("showRemaining"),
    enableAll, disableAll,
    autoToggle: toggleAutoToggle, autoReset: toggleAutoReset,
  };
  EDITIONS.forEach((ed) => { ACTIONS["ed" + ed] = () => setEdition(ed); });
  DLC_KEYS.forEach((_, i) => { ACTIONS["dlc" + i] = () => toggleDlcSlot(i); });

  function keyName(e) {
    let k = null;
    if (/^(Digit|Numpad)[0-9]$/.test(e.code)) k = e.code.slice(-1);
    else if (e.key === " " || e.code === "Space") k = "Space";
    else if (e.key === "Enter" || e.key === "Tab" || e.key === "Escape" || /^F\d\d?$/.test(e.key)) k = e.key;
    else if (e.key === "?") return e.ctrlKey ? null : "?";
    else if (/^[a-z]$/i.test(e.key)) k = e.key.toUpperCase();
    else if (/^Key[A-Z]$/.test(e.code)) k = e.code.slice(3);
    if (!k) return null;
    return (e.ctrlKey ? "Ctrl+" : "") + (e.shiftKey ? "Shift+" : "") + k;
  }
  function isTyping(el) {
    if (!(el instanceof Element)) return false;
    if (el.isContentEditable || el.tagName === "SELECT") return true;
    if (el.tagName === "TEXTAREA") return !el.readOnly;
    return el.tagName === "INPUT" && !["checkbox", "radio", "range", "button", "submit", "reset"].includes(el.type);
  }
  const isControl = (el) => el instanceof Element && el.closest("button, a[href], input, select, textarea, [role='tab']") !== null;

  let swallowKeyup = null;
  function onKeyDown(e) {
    if (anyDialogOpen()) return;
    if (openMenuEl) {
      closeMenus();
      if (e.key === "Escape") {
        e.preventDefault();
        return;
      }
    }
    if (e.key === "Escape") {
      hideTip();
      return;
    }
    if (e.altKey || e.metaKey || isTyping(e.target)) return;
    const name = keyName(e);
    if (!name) return;
    const mode = settings.hotkeys;
    const pair = TAB_KEYS[ui.tab].find(([k]) => k === name) || GLOBAL_KEYS[mode].find(([k]) => k === name);
    if (!pair) return;
    // In browser-friendly mode, Space and Enter on a focused control do what the control does.
    if (mode === "browser" && (name === "Space" || name === "Enter") && isControl(e.target)) return;
    e.preventDefault();
    if (name === "Space" || name === "Enter") swallowKeyup = e.code;
    if (e.repeat) return;
    hideTip();
    ACTIONS[pair[1]]();
  }

  // ---- Swipes ----

  // In the phone layout, the Draw Civ tab has no buttons: a swipe left draws, right undoes, up re-rolls and down
  // resets. A swipe acts when the finger lifts, as browsers allow sound from that but not from the press or the
  // move. A tap still reaches the civ icon, and a drag that ends on it isn't taken for a click.
  //
  // The first few pixels of a move settle the swipe's axis, and from then on the icons follow the finger along it,
  // pixel for pixel. A swipe left takes the current icon towards the parchment's left edge, fading it out on the
  // way, and the drawn civ shows up when the finger lifts, with its name and jingle. The other swipes bring in the
  // civ they lead to, fading in from the parchment's edge while the current icon fades out in place: right brings
  // the undone civ from the left edge, down the random icon from the top and up the re-rolled civ from the bottom.
  // A finger lifted short of a swipe takes the icons back, and one lifted past it lets them glide the rest of the way,
  // starting at the finger's speed. A swipe with nothing to do, such as undoing with nothing to undo, moves nothing.
  //
  // Touch moves are cancelled everywhere but in the civ list, the one part of the layout the browser scrolls.
  // Otherwise Chrome takes a quick swipe for a fling, even with nothing to scroll, and drops the tap that follows it.
  const PHONE = matchMedia("(max-width: 609px)");
  const SWIPE_MIN = 40;
  const SWIPE_SLOP = 10;
  const SWIPE_ACTS = { draw: () => draw(), undo, reroll, reset };
  // The parchment edge that each swipe's moving icon leaves by or comes from
  const SWIPE_EDGE = { draw: [-1, 0], undo: [-1, 0], reset: [0, -1], reroll: [0, 1] };
  const swipeKind = (axis, d) => (axis === "x" ? (d < 0 ? "draw" : "undo") : (d < 0 ? "reroll" : "reset"));
  const iconCell = (id) => (id === null ? RANDOM_CELL : id);

  // The icon cell of the civ a swipe leads to, or null when the swipe has nothing to do
  function swipeCell(kind) {
    if (kind === "draw") return poolIds().length && rng ? nextDraw() : null;
    if (kind === "reset") return round().length ? RANDOM_CELL : null;
    if (kind === "reroll") {
      const others = rerollCivs();
      return others ? nextDraw(others) : null;
    }
    const snap = undoStacks.undo[undoStacks.undo.length - 1];
    if (!snap) return null;
    const log = JSON.parse(snap);
    const r = log[log.length - 1];
    return iconCell(r.length ? r[r.length - 1][0] : null);
  }

  function bindSwipes() {
    const icon = els.civIcon;
    const ghost = els.civGhost;
    let swipe = null;
    let glide = 0;
    let ignoreClickUntil = 0;

    function rest() {
      cancelAnimationFrame(glide);
      glide = 0;
      for (const el of [icon, ghost]) {
        el.style.transform = "";
        el.style.opacity = "";
      }
      ghost.hidden = true;
    }
    // How far a swipe's moving icon travels: from the civ icon's place to the parchment's edge
    function travel(kind) {
      const d = kind === "reset" ? icon.offsetTop
        : kind === "reroll" ? els.panel.clientHeight - icon.offsetTop - icon.offsetHeight
        : icon.offsetLeft;
      return Math.max(1, d);
    }
    // Sets what the swipe does from the way it now points, and the civ the ghost shows coming in
    function aim(s, kind) {
      if (kind === s.kind) return;
      rest();
      const cell = swipeCell(kind);
      Object.assign(s, { kind, moves: cell !== null && !SIMPLE && settings.showIcon, travel: travel(kind) });
      if (s.moves) setCell(ghost, cell, CIV_ATLAS_COLS);
    }
    // Places the icons for the swipe's progress s.t, from 0 to s.travel. Until the swipe acts, the civ icon shows the
    // current civ and the ghost the civ coming in. Acting puts the new civ on the civ icon, so the two swap places.
    function paint(s) {
      if (!s.moves) return;
      const p = s.t / s.travel;
      const [ex, ey] = SWIPE_EDGE[s.kind];
      const place = (el, k, opacity) => {
        el.style.transform = k ? `translate(${ex * k}px, ${ey * k}px)` : "";
        el.style.opacity = opacity;
      };
      const [current, next] = s.acted ? [ghost, icon] : [icon, ghost];
      if (s.kind === "draw") {
        place(current, s.t, 1 - p);
        if (s.acted) place(next, 0, 1);
      } else {
        place(current, 0, 1 - p);
        place(next, s.travel - s.t, p);
      }
      ghost.hidden = s.kind === "draw" && !s.acted;
    }
    function follow(s, e) {
      s.d = s.axis === "x" ? e.clientX - s.x : e.clientY - s.y;
      s.trail.push([e.timeStamp, s.d]);
      while (s.trail.length > 2 && e.timeStamp - s.trail[0][0] > 100) s.trail.shift();
      aim(s, swipeKind(s.axis, s.d));
      s.t = Math.min(Math.abs(s.d), s.travel);
      paint(s);
    }
    // Takes the swipe's progress to `to`, starting at the finger's speed over its last 100 ms and slowing to a stop.
    // The ease-out starts at twice its average speed, hence the doubled distance.
    function glideTo(s, to) {
      if (!s.moves) return;
      const [t0, d0] = s.trail[0];
      const [t1, d1] = s.trail[s.trail.length - 1];
      const speed = t1 > t0 ? Math.abs(d1 - d0) / (t1 - t0) : 0;
      const from = s.t;
      const ms = Math.min(350, Math.max(80, 2 * Math.abs(to - from) / Math.max(speed, 0.1)));
      const start = performance.now();
      const frame = (now) => {
        const k = Math.min(1, Math.max(0, (now - start) / ms));
        s.t = from + (to - from) * (1 - (1 - k) ** 2);
        paint(s);
        if (k < 1) glide = requestAnimationFrame(frame);
        else rest();
      };
      glide = requestAnimationFrame(frame);
    }

    els.panel.addEventListener("pointerdown", (e) => {
      ignoreClickUntil = 0;
      rest();
      const swipeable = PHONE.matches && ui.tab === 0 && e.isPrimary && e.button === 0 && !openMenuEl;
      swipe = swipeable ? { id: e.pointerId, x: e.clientX, y: e.clientY, axis: null, kind: null, trail: [] } : null;
    });
    document.addEventListener("pointermove", (e) => {
      const s = swipe;
      if (!s || e.pointerId !== s.id) return;
      if (!s.axis) {
        const dx = e.clientX - s.x;
        const dy = e.clientY - s.y;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_SLOP) return;
        s.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
      }
      follow(s, e);
    });
    document.addEventListener("pointerup", (e) => {
      const s = swipe;
      if (!s || e.pointerId !== s.id) return;
      swipe = null;
      if (!s.axis) return;
      ignoreClickUntil = performance.now() + 500;
      follow(s, e);
      if (Math.abs(s.d) < SWIPE_MIN) {
        glideTo(s, 0);
        return;
      }
      const before = iconCell(currentId());
      SWIPE_ACTS[s.kind]();
      if (!s.moves) return;
      s.acted = true;
      setCell(ghost, before, CIV_ATLAS_COLS);
      glideTo(s, s.travel);
    });
    document.addEventListener("pointercancel", (e) => {
      const s = swipe;
      if (!s || e.pointerId !== s.id) return;
      swipe = null;
      if (s.axis) glideTo(s, 0);
    });
    els.panel.addEventListener("click", (e) => {
      if (performance.now() > ignoreClickUntil) return;
      ignoreClickUntil = 0;
      e.stopPropagation();
      e.preventDefault();
    }, true);
    document.querySelector(".window").addEventListener("touchmove", (e) => {
      if (PHONE.matches && !(e.target instanceof Element && e.target.closest("#civGrid"))) e.preventDefault();
    }, { passive: false });
  }

  // ---- Wiring ----

  function bind() {
    els.tabs.forEach((t, i) => {
      t.addEventListener("click", () => setTab(i));
      t.addEventListener("keydown", (e) => {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        e.preventDefault();
        e.stopPropagation();
        const next = (i + (e.key === "ArrowRight" ? 1 : 2)) % 3;
        setTab(next);
        els.tabs[next].focus();
      });
    });
    $("closeBtn").addEventListener("click", () => location.assign("about:blank"));
    $("optionsBig").addEventListener("click", openOptions);
    $("civIcon").addEventListener("click", () => jingle(currentId()));
    $("drawBtn").addEventListener("click", () => draw());
    $("resetBtn").addEventListener("click", reset);
    $("techBtn").addEventListener("click", openTechTree);
    $("shareBtn").addEventListener("click", () => copyShareLink(true));
    $("poolShareBtn").addEventListener("click", () => copyShareLink(false));
    $("clearLogBtn").addEventListener("click", clearLog);
    $("presetFile").addEventListener("change", (e) => { if (e.target.files[0]) loadPresetFile(e.target.files[0]); });
    els.showRemaining.addEventListener("change", () => toggleSetting("showRemaining"));
    for (const b of els.editionButtons) b.addEventListener("click", () => setEdition(b.dataset.pick));
    $("editionIcon").addEventListener("click", openEditionPage);
    els.autoToggle.addEventListener("change", toggleAutoToggle);
    els.autoReset.addEventListener("change", toggleAutoReset);
    $("enableAllBtn").addEventListener("click", enableAll);
    $("disableAllBtn").addEventListener("click", disableAll);
    for (const [id, tip] of Object.entries(STATIC_TIPS)) $(id).dataset.tip = tip;

    for (const menu of document.querySelectorAll(".menu")) {
      const title = menu.querySelector(".menu-title");
      title.addEventListener("click", () => (openMenuEl === menu ? closeMenus() : openMenu(menu)));
      title.addEventListener("mouseenter", () => { if (openMenuEl && openMenuEl !== menu) openMenu(menu); });
    }
    document.addEventListener("pointerdown", (e) => {
      if (openMenuEl && !openMenuEl.contains(e.target) && !e.target.closest?.(".menu-title")) closeMenus();
    });

    document.addEventListener("click", (e) => {
      if (!(e.target instanceof Element)) return;
      const closer = e.target.closest("[data-close]");
      if (closer) {
        closeDialog(closer.closest("dialog"));
        return;
      }
      const act = e.target.closest("[data-act]");
      if (act) {
        closeMenus();
        ACTIONS[act.dataset.act]();
        return;
      }
      const copy = e.target.closest("[data-copy]");
      if (copy) {
        const input = $(copy.dataset.copy);
        copyText(input.value).then((ok) => {
          if (ok) {
            sfx("button");
          } else {
            input.focus();
            input.select();
          }
        });
        return;
      }
      if (e.target.closest(".menu-list a")) {
        sfx("button");
        closeMenus();
      }
    });

    for (const d of document.querySelectorAll("dialog")) d.addEventListener("cancel", () => sfx("button"));
    for (const f of document.querySelectorAll("form[data-closes]")) {
      f.addEventListener("submit", (e) => {
        e.preventDefault();
        closeDialog(f.closest("dialog"));
      });
    }
    optForm.addEventListener("submit", (e) => {
      e.preventDefault();
      closeDialog($("dlgOptions"));
    });
    optForm.addEventListener("change", (e) => {
      const t = e.target;
      // The slider changes the civs the next draw can be once it's let go.
      if (t.name === "freshN") return loadNextJingles();
      if (t.name === "jingles") return setJingles(t.checked);
      if (t.name === "uiSounds") return setUiSounds(t.checked);
      if (t.name === "jingleType") {
        settings.legacyJingles = t.value === "legacy";
        saveSettings();
        const c = currentCiv();
        if (!c || c.legacy) jingle(currentId());
        else sfx("view");
        loadNextJingles();
        return;
      }
      if (t.name === "hotkeys") {
        settings.hotkeys = t.value === "browser" ? "browser" : "desktop";
        saveSettings();
        sfx("view");
        render();
        syncOptions();
        return;
      }
      if (typeof DEFAULT_SETTINGS[t.name] === "boolean") {
        sfx("button");
        settings[t.name] = t.checked;
        saveSettings();
        render();
        syncOptions();
      }
    });
    optForm.elements.freshN.addEventListener("input", () => {
      const slider = optForm.elements.freshN;
      settings.freshN = Number(slider.value) >= Number(slider.max) ? FRESH_MOST : Number(slider.value);
      saveSettings();
      updateFreshLabel();
      paintSlider();
    });
    for (const s of optForm.querySelectorAll("select")) s.addEventListener("mousedown", hoverSound);

    $("lobbyForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const spectate = e.submitter ? e.submitter.value === "spectate" : false;
      const url = lobbyUrl($("lobbyCode").value, spectate);
      if (!url) {
        sfx("error");
        $("lobbyErr").hidden = false;
        return;
      }
      closeDialog($("dlgLobby"));
      launch(url);
    });
    $("openForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const link = parseShare($("openInput").value);
      if (!link) {
        sfx("error");
        $("openErr").hidden = false;
        return;
      }
      closeDialog($("dlgOpen"));
      offerLink(link);
    });
    $("previewForm").addEventListener("submit", (e) => {
      e.preventDefault();
      $("dlgPreview").close();
      if (!pendingLink) return;
      applyLink(pendingLink);
      pendingLink = null;
      sfx("button");
      toast("Loaded the shared link");
    });

    bindSwipes();
    // The phone layout's logs change size with the screen, and their scrollbars follow.
    window.addEventListener("resize", () => { for (const log of logBars.keys()) paintLogBar(log); });

    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", (e) => {
      if (swallowKeyup && e.code === swallowKeyup) {
        e.preventDefault();
        swallowKeyup = null;
      }
    });
    document.addEventListener("pointermove", moveTip);
    document.addEventListener("pointerover", onPointerOver);
    document.documentElement.addEventListener("mouseleave", () => { handCursor = false; });
    document.documentElement.addEventListener("mouseleave", hideTip);
    document.addEventListener("pointerdown", warmUp, { capture: true, once: true });
    document.addEventListener("keydown", warmUp, { capture: true, once: true });

    window.addEventListener("hashchange", () => {
      const code = readHash();
      if (code !== null) handleLinkInUrl(code);
    });
    // Another tab changed the saved data: follow it, so the two don't overwrite each other.
    window.addEventListener("storage", (e) => {
      if (e.key === KEY_STATE || e.key === null) {
        state = parseState(storageGet(KEY_STATE)) || emptyState();
        clearHistory();
      }
      if (e.key === KEY_SETTINGS || e.key === null) settings = parseSettings(storageGet(KEY_SETTINGS));
      render();
      syncOptions();
    });
  }

  // ---- Start ----

  $("aboutVersion").textContent = "v" + VERSION;
  buildPoolControls();
  for (const log of [els.drawnLog, els.remainingLog]) {
    scrollInstantly(log);
    if (!SIMPLE) buildLogBar(log);
  }
  // Load the images first shown on a hover, press, tab switch or dialog up front, so they don't flicker in.
  // The icon atlases are among them, as hidden tabs don't load their CSS images.
  if (!SIMPLE) {
    const early = ["ui/button_pressed", "ui/textfield_9slice", "ui/checkbox", "ui/dropdown_button", "ui/x_button",
      "ui/external", "ui/cursor", "ui/cursor_pointing", "ui/slider", "ui/slider_knob", "ui/panel_9slice",
      "ui/log_9slice", "ui/scrollbar_3slice", "ui/scrollbar_knob", "ui/button_9slice", "ui/button_pressed_9slice",
      "ui/share_icon", "civ/civicon_atlas", "dlc/dlc_atlas", "dlc/edition_banners_atlas"];
    for (const t of early) new Image().src = `images/${t}.webp`;
  }
  bind();

  if (settings.newRoundOnVisit) closeRound();
  const code = readHash();
  if (code !== null) handleLinkInUrl(code);
  else if (settings.drawOnLoad) draw({ silent: true });
  saveState();
  render();
})();
