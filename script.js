import { MersenneTwister, createLogic } from "./logic.js";

(async () => {
  const VERSION = "1.0.2";
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
    ...(SIMPLE ? { techtree: "Open Tech Tree in a new tab", undo: "Undo the last change", redo: "Redo the last undone change" } : {}),
  };

  // Simple mode always uses the browser-friendly hotkeys, as the desktop ones take Tab, Space and Enter from the
  // focused control. It has no sound, so no sound toggles, and its single-key hotkeys (letters, digits, ? and Space
  // without Ctrl) can be turned off, for speech input and for keys pressed by accident. Nor has it a civ icon to toggle.
  const hotkeyMode = () => (SIMPLE ? "browser" : settings.hotkeys);
  const SIMPLE_DROPPED = new Set(["quizJingles", "quizUi", "quizIcon"]);
  const isCharKey = (name) => /^(Shift\+)?([A-Z0-9?]|Space)$/.test(name);
  const activeKeys = (pairs) => (SIMPLE
    ? pairs.filter(([key, act]) => !SIMPLE_DROPPED.has(act) && (settings.charKeys || !isCharKey(key)))
    : pairs);

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
    hotkeys: "browser", charKeys: true,
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
    if (SIMPLE) clearStatus();
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
  // Of the jingles and the big civ icons, only the ones that a draw or a reset plays and shows next are loaded ahead:
  // the next draw's and the random ones. The others load when they're played or shown.
  function loadAhead() {
    if (SIMPLE || !(settings.jingles || settings.showIcon)) return;
    const id = nextDraw();
    if (settings.jingles) {
      audioFor(jingleUrl(null));
      if (id !== null) audioFor(jingleUrl(id));
    }
    if (settings.showIcon) preload(iconName(RANDOM_CELL), ...(id === null ? [] : [iconName(id)]));
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

  // Undo and redo cover draws and resets for this visit, but not re-rolls. Changing the pool clears them, and so do
  // clearing the log and loading a quicksave, preset or link. Simple mode keeps an undo step for those instead, so
  // that every change can be taken back. A step holds the pool as well as the log, for simple mode's pool changes.
  const snapshot = () => JSON.stringify({ edition: state.edition, off: [...state.off], log: state.log });
  function restore(snap) {
    const s = JSON.parse(snap);
    state.edition = s.edition;
    state.off = new Set(s.off);
    state.log = s.log;
  }
  function pushUndo(snap) {
    undoStacks.undo.push(snap);
    if (undoStacks.undo.length > UNDO_CAP) undoStacks.undo.shift();
    undoStacks.redo.length = 0;
  }
  const recordUndo = () => pushUndo(snapshot());
  function clearHistory() {
    undoStacks.undo.length = 0;
    undoStacks.redo.length = 0;
  }
  // Before the log or the whole state is replaced
  function beforeReplace() {
    if (SIMPLE) recordUndo();
    else clearHistory();
  }
  function step(from, to) {
    const undoing = from === undoStacks.undo;
    if (!from.length) {
      sfx("error");
      if (SIMPLE) toast(undoing ? "Nothing to undo" : "Nothing to redo");
      return;
    }
    to.push(snapshot());
    restore(from.pop());
    commit();
    if (SIMPLE) toast(undoing ? "Undone" : "Redone");
    if (settings.jingles) jingle(currentId());
    else sfx("button");
  }
  const undo = () => step(undoStacks.undo, undoStacks.redo);
  const redo = () => step(undoStacks.redo, undoStacks.undo);

  function clearLog() {
    sfx("button");
    if (SIMPLE && state.log.length < 2) {
      toast("There are no past rounds to clear");
      return;
    }
    beforeReplace();
    state.log = [round()];
    commit();
    if (SIMPLE) toast("Log cleared. Undo brings it back.");
  }

  // ---- Civ pool ----

  const poolKey = () => state.edition + "|" + [...state.off].sort((a, b) => a - b).join(",");
  function changePool(mutate) {
    const before = poolKey();
    const snap = snapshot();
    mutate();
    applyEdition(state);
    if (poolKey() === before) {
      render();
      return;
    }
    if (SIMPLE) pushUndo(snap);
    else clearHistory();
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

  // Starts loading images that first show on a hover or press, or once a log overflows, so they don't flicker in.
  // Each loads once, when the tab or dialog that shows it first opens, so the page loads only the Draw Civ tab's:
  // hidden tabs and closed dialogs don't load their CSS images either.
  const preloaded = new Set();
  function preload(...names) {
    for (const t of names) {
      if (SIMPLE || preloaded.has(t)) continue;
      preloaded.add(t);
      new Image().src = `images/${t}.webp`;
    }
  }
  // Each tab's images that first show on a press or, for the log scrollbars and the civ atlas, once a log overflows
  // or has a row. The pressed text button is among them, as the phone layout's Draw Civ tab has no text buttons.
  const TAB_IMAGES = [[], ["ui/scrollbar_3slice", "ui/scrollbar_knob", "ui/button_pressed", "ui/button_pressed_9slice",
    "civ/civicon_atlas"], ["ui/button_pressed", "ui/button_pressed_9slice"]];
  function setTab(i, { silent = false } = {}) {
    if (i === ui.tab) return;
    ui.tab = i;
    if (!silent) sfx("tab");
    preload(...TAB_IMAGES[i]);
    render();
    // On a phone, simple mode's panel scrolls, and the three tabs share it, so each tab opens at its top.
    els.panel.scrollTop = 0;
    // A hotkey can switch tabs from a control that the new tab hides: in simple mode, focus goes to the new tab.
    const focused = document.activeElement;
    if (SIMPLE && focused && focused !== document.body && !focused.checkVisibility()) els.tabs[i].focus();
  }

  // ---- Share links ----

  // logic.js writes and reads the codes.
  const shareUrl = (withDraws) => location.href.split("#")[0] + "#p=" + logic.shareCode(state, withDraws);
  const { parseShare, matchesLink } = logic;

  function applyLink(link) {
    beforeReplace();
    logic.applyLink(state, link);
    commit();
  }

  // A loaded link shows what it brought: its draws on the Log tab or, without any, its pool on the Civ Pool tab.
  function showLink(link) {
    toast("Loaded the shared link");
    setTab(link.draws.length ? 1 : 2, { silent: true });
  }

  // A link with this session's pool and round is already open, so it opens without asking and leaves the log and
  // the undo history as they are.
  function offerLink(link) {
    if (matchesLink(state, link)) {
      showLink(link);
      return;
    }
    if (!hasContent(state)) {
      applyLink(link);
      showLink(link);
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
    beforeReplace();
    state = saved;
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
    beforeReplace();
    logic.applyPreset(state, preset);
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
  // The big civ icon and the swipe ghost show the civ's own icon file in place of an atlas: cell is a civ ID or
  // RANDOM_CELL, as in the civ atlas.
  function iconName(cell) {
    return "civ/" + (cell === RANDOM_CELL ? "random" : CIVS[cell].file);
  }
  function setIcon(el, cell) {
    el.style.setProperty("--atlas", `url("images/${iconName(cell)}.webp")`);
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
    if (SIMPLE) return `Turns the civs of ${DLCS[dlc].name} on or off: ${names.join(", ")}\nHotkey: ${DLC_KEYS[slot]}`;
    return `Toggles ${DLCS[dlc].name} civilisation${names.length === 1 ? "" : "s"}\n(${names.join(", ")})\nHotkey: ${DLC_KEYS[slot]}`;
  }
  // The atlas cell that stands in for a civ or DLC checkbox, with the off cross that shows while it's unchecked
  function chkIcon(className, i, cols, size) {
    if (SIMPLE) return "";
    return h("span", { className: "chk-icon", style: { width: size + "px", height: size + "px" } },
      atlasCell("chk-face sprite " + className, i, cols),
      h("span", { className: "chk-off" }));
  }
  function buildPoolControls() {
    // Edition rows sit where the desktop app's radio buttons are, with an icon in place of the radio circle.
    EDITIONS.forEach((ed, i) => {
      const info = EDITION_INFO[ed];
      const button = h("button", {
        type: "button", className: "imgbtn edition", id: "ed" + ed, "aria-pressed": "false",
        dataset: { pick: ed, tip: `Selects the ${info.short} (${info.year}) civilisation pool\nHotkey: ${EDITION_KEYS[i]}` },
      }, atlasCell("ed-icon sprite dlc-cell", 3 * i, DLC_ATLAS_COLS), `${info.short} (${info.year})`);
      if (!SIMPLE) Object.assign(button.style, { left: "10px", top: 36 + 30 * i + "px" });
      $("editionGroup").append(button);
      els.editionButtons.push(button);
    });
    // Each civ keeps its place in the grid in every edition, as on the desktop app. Simple mode's CSS lays the
    // controls out by itself.
    DISPLAY_ORDER.forEach((c, i) => {
      const input = h("input", { type: "checkbox" });
      input.addEventListener("change", () => toggleCiv(c.id));
      const label = h("label", { className: "chk icon-chk civ" },
        input, chkIcon("civ-cell", c.id, CIV_ATLAS_COLS, 18), h("span", { className: "chk-name" }, c.name));
      if (!SIMPLE) Object.assign(label.style, { left: GRID_COLS[i % 5] + "px", top: 210 + 20 * Math.floor(i / 5) + "px" });
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
        if (!SIMPLE) Object.assign(label.style, { left: L.left + "px", top: L.top + L.step * i + "px", height: L.size + "px", gap: L.gap + "px" });
        group.append(label);
        dlcBoxes[dlc] = input;
      });
      // Simple mode puts the expansions before the civs, where they show, so that they're read and reached in that
      // order too.
      if (SIMPLE) {
        group.setAttribute("role", "group");
        group.setAttribute("aria-label", "Expansions");
        $("civGrid").before(group);
      } else {
        els.panel.append(group);
      }
    }
    if (SIMPLE) {
      $("civGrid").setAttribute("role", "group");
      $("civGrid").setAttribute("aria-label", "Civs");
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
    // Simple mode's tooltips, in plainer words
    ...(SIMPLE ? {
      drawBtn: "Draws a civ that hasn't come up yet this round\nHotkey: Space",
      resetBtn: "Ends this round and starts a new one\nHotkey: Enter",
      clearLogBtn: "Clears the past rounds from the log. This round stays.\nHotkey: Q",
      showRemainingLabel: "Shows or hides the list of civs left this round\nHotkey: W",
      autoToggleLabel: "Turns the older civs on or off. While it's on, picking an edition turns its older civs on.\nHotkey: R",
      autoResetLabel: "Starts a new round each time you change the civ pool\nHotkey: T",
      enableAllBtn: "Turns on every civ, so that all of them can be drawn\nHotkey: Space",
      disableAllBtn: "Turns off every civ\nHotkey: Enter",
      poolShareBtn: "Copies a link with this civ pool",
    } : {}),
  };

  function keyLabel(action) {
    const pair = activeKeys(GLOBAL_KEYS[hotkeyMode()]).find(([, a]) => a === action);
    return pair ? pair[0] : "";
  }
  // A tooltip's text. Simple mode leaves out the hotkey line while single-key hotkeys are off.
  function tipText(el) {
    const text = el.dataset.tip || "";
    return SIMPLE && !settings.charKeys ? text.replace(/\nHotkey:.*$/s, "") : text;
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
  // Fills a log with rounds of [civ id, text] rows, each led by the civ's icon, unless it shows those rows already.
  // In simple mode each round is a list, so screen readers can tell the rounds apart.
  const logKeys = new Map();
  function fillLog(log, rounds) {
    const key = JSON.stringify(rounds);
    if (logKeys.get(log) === key) return;
    logKeys.set(log, key);
    log.replaceChildren(...rounds.map((rows) => h(SIMPLE ? "ul" : "div", { className: "log-round" }, ...rows.map(([id, text]) =>
      h(SIMPLE ? "li" : "div", { className: "log-row" }, SIMPLE ? "" : atlasCell("log-icon sprite civ-cell", id, CIV_ATLAS_COLS), text)))));
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
    setIcon(els.civIcon, cur ? cur.id : RANDOM_CELL);
    $("civIcon").setAttribute("aria-label", cur ? `${cur.name}: play the jingle` : "Random: play the jingle");
    // With no civ drawn, simple mode's screen reader text says so in place of the question mark.
    if (SIMPLE && !ui.flash && !cur) {
      if (!els.civName.querySelector(".sr-only")) {
        els.civName.replaceChildren(h("span", { "aria-hidden": "true" }, "?"), h("span", { className: "sr-only" }, "No civ drawn yet"));
      }
    } else {
      setText(els.civName, ui.flash || (cur ? cur.name : "?"));
    }
    els.civName.hidden = !settings.showName;
    setText(els.counter, SIMPLE ? `Drawn: ${drawn}/${n}` : `${drawn}/${n}`);
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
    $("shareBtn").dataset.tip = SIMPLE
      ? `Copies a link with this civ pool and this round's draws\nHotkey: ${keyLabel("copyLink")}`
      : `Copies a share link with the currently selected civ pool and this round's draws\nHotkey: ${keyLabel("copyLink")}`;
    for (const k of document.querySelectorAll("kbd[data-key]")) setText(k, keyLabel(k.dataset.key));
    if (tipTarget) setText(els.tip, tipText(tipTarget));
    if (SIMPLE) describeTips();

    // The next draw may have changed, so its jingle and icon start loading.
    loadAhead();
  }

  // ---- Dialogs ----

  const anyDialogOpen = () => document.querySelector("dialog[open]") !== null;
  function showDialog(d) {
    hideTip();
    closeMenus();
    // The pressed look of its buttons, which the phone layout hasn't loaded yet
    preload("ui/button_pressed");
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
    for (const k of ["showName", "showIcon", "showCounter", "tooltips", "jingles", "uiSounds", "drawOnLoad", "newRoundOnVisit", "fresh", "charKeys"]) {
      f[k].checked = settings[k];
    }
    f.jingleType.value = settings.legacyJingles ? "legacy" : "de";
    f.jingleType.disabled = !settings.jingles;
    f.hotkeys.value = settings.hotkeys;
    $("modeHint").textContent = SIMPLE
      ? "Single-key hotkeys are letters, numbers, ? and Space on their own. Turn them off if you use speech input, or if you press keys by mistake. Keys with Ctrl, and F1 to F12, still work."
      : settings.hotkeys === "desktop"
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
      for (const [key, act] of activeKeys(pairs)) byAction.set(act, [...(byAction.get(act) || []), key]);
      return [...byAction].map(([act, keys]) => [keys, act.startsWith("dlc") ? dlcSlotText(Number(act.slice(3))) : ACTION_TEXT[act]]);
    };
    const section = (title, list, className = "") => h("section", { className },
      h("h3", {}, title),
      h("ul", {}, ...list.map(([keys, text]) => h("li", {},
        ...keys.flatMap((k, i) => [i ? " / " : "", h("kbd", { className: "key" }, k)]), " " + text))));
    $("hkGrid").replaceChildren(
      section("Global", [...rows(GLOBAL_KEYS[hotkeyMode()]), [["Esc"], "Close a dialog or menu"]], "global"),
      h("div", {}, section("Draw Civ tab", rows(TAB_KEYS[0])), section("Log tab", rows(TAB_KEYS[1]))),
      section("Civ Pool tab", rows(TAB_KEYS[2])),
    );
    $("hkMode").textContent = SIMPLE
      ? settings.charKeys
        ? "Single-key hotkeys are on. You can turn them off in Options."
        : "Single-key hotkeys are off, so only these keys work. You can turn them back on in Options."
      : settings.hotkeys === "desktop"
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
  function openHelp() {
    sfx("button");
    showDialog($("dlgHelp"));
  }
  // A field's error message shows under it. In simple mode the field is also marked invalid, described by the
  // message and focused, so a screen reader reads the message out.
  function showFieldError(input, err) {
    err.hidden = false;
    if (!SIMPLE) return;
    input.setAttribute("aria-invalid", "true");
    input.setAttribute("aria-describedby", [err.id, input.dataset.hint].filter(Boolean).join(" "));
    input.focus();
  }
  function clearFieldError(input, err) {
    err.hidden = true;
    if (!SIMPLE) return;
    input.removeAttribute("aria-invalid");
    if (input.dataset.hint) input.setAttribute("aria-describedby", input.dataset.hint);
    else input.removeAttribute("aria-describedby");
  }
  function openLobby() {
    sfx("button");
    $("lobbyCode").value = "";
    clearFieldError($("lobbyCode"), $("lobbyErr"));
    showDialog($("dlgLobby"));
  }
  function openShare() {
    $("sharePool").value = shareUrl(false);
    $("shareRound").value = shareUrl(true);
    $("shareStatus").textContent = "";
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
    clearFieldError($("openInput"), $("openErr"));
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
    fitMenu();
  }
  // On a phone, simple mode lays the open menu over the window below the menu bar, and simple.css lets it scroll when
  // it's taller than that room, which this measures.
  function fitMenu() {
    if (!SIMPLE || !openMenuEl) return;
    const list = openMenuEl.querySelector(".menu-list");
    list.style.setProperty("--room", els.client.getBoundingClientRect().bottom - list.getBoundingClientRect().top + "px");
  }
  function closeMenus() {
    if (!openMenuEl) return;
    const title = openMenuEl.querySelector(".menu-title");
    // In simple mode, focus in the menu goes back to its title, rather than to nowhere as the menu hides. A dialog that
    // a menu item opens then gives focus back to the title too.
    if (SIMPLE && openMenuEl.contains(document.activeElement)) title.focus();
    openMenuEl.classList.remove("open");
    openMenuEl.querySelector(".menu-list").hidden = true;
    title.setAttribute("aria-expanded", "false");
    openMenuEl = null;
  }

  // Simple mode's menus work from the keyboard as menu buttons do. On a title, Enter, Space or Down opens the menu at
  // its first item, and Up at its last. In the menu, Up, Down, Home and End move through the items, Left and Right
  // open the next menu along, Esc closes it, and Tab closes it and moves on.
  function bindMenuKeys() {
    const menus = [...document.querySelectorAll("#menubar .menu")];
    const items = (menu) => [...menu.querySelectorAll(".menu-list > :is(button, a)")].filter((el) => el.checkVisibility());
    const openAt = (menu, last) => {
      openMenu(menu);
      const list = items(menu);
      if (list.length) list[last ? list.length - 1 : 0].focus();
    };
    for (const menu of menus) {
      const title = menu.querySelector(".menu-title");
      title.setAttribute("aria-haspopup", "menu");
      title.addEventListener("keydown", (e) => {
        if (!["Enter", " ", "ArrowDown", "ArrowUp"].includes(e.key) || e.altKey || e.ctrlKey || e.metaKey) return;
        e.preventDefault();
        e.stopPropagation();
        openAt(menu, e.key === "ArrowUp");
      });
      // Space clicks a button when it's let go, which would close the menu again.
      title.addEventListener("keyup", (e) => { if (e.key === " ") e.preventDefault(); });
      menu.querySelector(".menu-list").addEventListener("keydown", (e) => {
        if (e.altKey || e.ctrlKey || e.metaKey) return;
        const list = items(menu);
        const i = list.indexOf(document.activeElement);
        const move = { ArrowDown: (i + 1) % list.length, ArrowUp: (i - 1 + list.length) % list.length, Home: 0, End: list.length - 1 }[e.key];
        if (e.key === "Tab") {
          closeMenus();
          return;
        }
        if (move === undefined && !["Escape", "ArrowLeft", "ArrowRight"].includes(e.key)) return;
        e.preventDefault();
        e.stopPropagation();
        if (move !== undefined) list[move].focus();
        else if (e.key === "Escape") closeMenus();
        else openAt(menus[(menus.indexOf(menu) + (e.key === "ArrowRight" ? 1 : menus.length - 1)) % menus.length]);
      });
      menu.addEventListener("focusout", (e) => {
        if (openMenuEl === menu && !menu.contains(e.relatedTarget)) closeMenus();
      });
    }
  }

  // ---- Tooltips and toasts ----

  let tipTarget = null;
  // Simple mode: whether the tooltip showing came from the mouse or from keyboard focus, and the control whose
  // tooltip Esc or a key press hid, which stays hidden until the mouse leaves that control
  let tipBy = null;
  let tipDismissed = null;
  function hideTip() {
    els.tip.hidden = true;
    tipTarget = null;
    tipBy = null;
  }
  const tipsAllowed = () => settings.tooltips && !openMenuEl && !anyDialogOpen();
  // Tooltips follow the mouse, so a touch shows none.
  function moveTip(e) {
    if (SIMPLE) return moveTipSimple(e);
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

  // Simple mode's tooltips sit against their control, just below it or else just above, so the mouse can move onto
  // one without it going away. One shows while the mouse is over its control or itself, or while its control has
  // keyboard focus.
  function showTip(target, by) {
    tipTarget = target;
    tipBy = by;
    setText(els.tip, tipText(target));
    els.tip.hidden = false;
    const r = target.getBoundingClientRect();
    const w = els.tip.offsetWidth;
    const ht = els.tip.offsetHeight;
    els.tip.style.left = Math.max(4, Math.min(r.left, innerWidth - w - 4)) + "px";
    els.tip.style.top = (r.bottom + ht <= innerHeight - 4 ? r.bottom : Math.max(4, r.top - ht)) + "px";
  }
  function moveTipSimple(e) {
    if (e.pointerType !== "mouse" || !(e.target instanceof Element) || els.tip.contains(e.target)) return;
    const target = tipsAllowed() ? e.target.closest("[data-tip]") : null;
    if (target !== tipDismissed) tipDismissed = null;
    if (target && target !== tipDismissed) {
      if (target !== tipTarget) showTip(target, "mouse");
    } else if (tipBy === "mouse") {
      hideTip();
    }
  }
  function bindSimpleTips() {
    document.addEventListener("focusin", (e) => {
      const target = e.target instanceof Element && e.target.matches(":focus-visible") && tipsAllowed() ? e.target.closest("[data-tip]") : null;
      if (target) showTip(target, "focus");
      else if (tipBy === "focus") hideTip();
    });
    document.addEventListener("focusout", () => { if (tipBy === "focus") hideTip(); });
    // A tooltip moves with its control when the page, the panel or a log scrolls, as when focus scrolls a control into
    // view after its tooltip shows.
    document.addEventListener("scroll", () => { if (tipTarget) showTip(tipTarget, tipBy); }, { capture: true, passive: true });
    // Esc hides any tooltip, and any other key a mouse one, so that none covers what the keyboard moves to.
    document.addEventListener("keydown", (e) => {
      if (tipTarget && (e.key === "Escape" || tipBy === "mouse")) {
        tipDismissed = tipTarget;
        hideTip();
      }
    }, true);
  }
  // Each control with a tooltip also has its text as a description, for screen readers.
  const tipDescs = new Map();
  function describeTips() {
    for (const el of document.querySelectorAll("[data-tip]")) {
      const control = el.matches("label") ? el.querySelector("input") : el;
      if (!control) continue;
      let desc = tipDescs.get(el);
      if (!desc) {
        desc = h("span", { id: "tip-desc-" + tipDescs.size, hidden: true });
        document.body.append(desc);
        tipDescs.set(el, desc);
        control.setAttribute("aria-describedby", desc.id);
      }
      setText(desc, tipText(el).replace(/\n/g, ". "));
    }
  }

  let toastTimer = 0;
  function toast(text) {
    const t = $("toast");
    if (SIMPLE) {
      // Simple mode's status bar keeps the message until the next change or message. It's emptied first, so that a
      // screen reader announces a message that repeats.
      clearStatus();
      toastTimer = setTimeout(() => { t.textContent = text; }, 50);
      return;
    }
    t.textContent = text;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
  }
  function clearStatus() {
    clearTimeout(toastTimer);
    $("toast").textContent = "";
  }

  // ---- Actions (hotkeys, menus and buttons) ----

  const ACTIONS = {
    cycleTab: () => setTab((ui.tab + 1) % 3),
    tab0: () => setTab(0), tab1: () => setTab(1), tab2: () => setTab(2),
    options: openOptions, hotkeys: openHotkeys, about: openAbout, help: openHelp, techtree: openTechTree,
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
      // Keys in an open menu are the menu's, in simple mode.
      if (SIMPLE && openMenuEl.contains(e.target)) return;
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
    const mode = hotkeyMode();
    const pair = activeKeys(TAB_KEYS[ui.tab]).find(([k]) => k === name) || activeKeys(GLOBAL_KEYS[mode]).find(([k]) => k === name);
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
    const { log } = JSON.parse(snap);
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
      if (s.moves) setIcon(ghost, cell);
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
      setIcon(ghost, before);
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
        // Simple mode adds Home and End, for the first and last tabs.
        const next = { ArrowRight: (i + 1) % 3, ArrowLeft: (i + 2) % 3, ...(SIMPLE ? { Home: 0, End: 2 } : {}) }[e.key];
        if (next === undefined) return;
        e.preventDefault();
        e.stopPropagation();
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
    // In simple mode, as in Windows, a click outside an open menu only closes it: what the menu covered can't be
    // clicked by accident while it's open.
    let swallowClick = false;
    document.addEventListener("pointerdown", (e) => {
      swallowClick = false;
      if (openMenuEl && !openMenuEl.contains(e.target) && !e.target.closest?.(".menu-title")) {
        closeMenus();
        swallowClick = SIMPLE;
      }
    });
    document.addEventListener("click", (e) => {
      if (!swallowClick) return;
      swallowClick = false;
      // A click from the keyboard or the script has no press to swallow.
      if (e.detail === 0) return;
      e.preventDefault();
      e.stopPropagation();
    }, true);
    // A press that ends without a click, such as a drag or a touch that scrolls, mustn't leave a later click swallowed.
    for (const type of ["pointerup", "pointercancel"]) {
      document.addEventListener(type, () => { if (swallowClick) setTimeout(() => { swallowClick = false; }); });
    }

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
        // Simple mode says in the dialog whether the link was copied.
        const say = (text) => {
          if (!SIMPLE) return;
          $("shareStatus").textContent = "";
          setTimeout(() => { $("shareStatus").textContent = text; }, 50);
        };
        copyText(input.value).then((ok) => {
          if (ok) {
            sfx("button");
            say("Copied the link.");
          } else {
            input.focus();
            input.select();
            say("Couldn't copy the link. It's selected, so press Ctrl+C to copy it.");
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
      if (t.name === "freshN") return loadAhead();
      if (t.name === "jingles") return setJingles(t.checked);
      if (t.name === "uiSounds") return setUiSounds(t.checked);
      if (t.name === "jingleType") {
        settings.legacyJingles = t.value === "legacy";
        saveSettings();
        const c = currentCiv();
        if (!c || c.legacy) jingle(currentId());
        else sfx("view");
        loadAhead();
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
        showFieldError($("lobbyCode"), $("lobbyErr"));
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
        showFieldError($("openInput"), $("openErr"));
        return;
      }
      closeDialog($("dlgOpen"));
      offerLink(link);
    });
    $("previewForm").addEventListener("submit", (e) => {
      e.preventDefault();
      $("dlgPreview").close();
      if (!pendingLink) return;
      const link = pendingLink;
      pendingLink = null;
      applyLink(link);
      sfx("button");
      showLink(link);
    });

    // Simple mode has buttons in place of swipes, and its menus and tooltips work from the keyboard.
    if (SIMPLE) {
      bindMenuKeys();
      bindSimpleTips();
    } else {
      bindSwipes();
    }
    // The phone layout's logs change size with the screen, and their scrollbars follow, as does an open menu's room.
    window.addEventListener("resize", () => {
      for (const log of logBars.keys()) paintLogBar(log);
      fitMenu();
    });

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
    document.documentElement.addEventListener("mouseleave", () => { if (!SIMPLE || tipBy === "mouse") hideTip(); });
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

  // Simple mode's labels and words, where the full page has images, mouse-only tooltips or short forms. Every control
  // says what it does in its own text, and every link that opens a new tab says so.
  function setUpSimple() {
    document.querySelector(".site-title").setAttribute("role", "banner");
    const newTab = () => [h("span", { className: "new-tab", "aria-hidden": "true" }, "↗"), h("span", { className: "sr-only" }, " (opens in a new tab)")];
    for (const [id, text] of [["optionsBig", "Options"], ["techBtn", "Tech Tree"], ["shareBtn", "Copy Share Link"], ["poolShareBtn", "Copy Pool Link"]]) {
      $(id).removeAttribute("aria-label");
      $(id).replaceChildren(text, ...(id === "techBtn" ? newTab() : []));
    }
    for (const a of document.querySelectorAll("a[target='_blank']")) {
      const text = a.querySelector(":scope > span") || a;
      if (a.hostname === "www.youtube.com") text.append(h("span", { className: "sr-only" }, " on YouTube"));
      text.append(...newTab());
    }
    $("menu-civs").querySelector("[data-act='techtree'] > span").append(...newTab());
    $("showRemainingLabel").lastChild.textContent = "Show remaining civs";
    $("enabledCount").setAttribute("aria-live", "polite");
    for (const id of ["drawnCount", "remainingCount"]) {
      $(id).setAttribute("role", "heading");
      $(id).setAttribute("aria-level", "2");
    }
    $("dlgMsg").setAttribute("aria-describedby", "msgText");
    // Each Copy button in the Share dialog is named after its row.
    for (const row of document.querySelectorAll(".share-row")) {
      const label = row.querySelector("label");
      const button = row.querySelector("[data-copy]");
      label.id = "label-" + button.dataset.copy;
      button.id = "copy-" + button.dataset.copy;
      button.setAttribute("aria-labelledby", `${button.id} ${label.id}`);
    }
    // The fields' hints say what to type, and their errors how to put it right.
    const lobbyHint = document.querySelector("#dlgLobby .hint");
    lobbyHint.id = "lobbyHint";
    lobbyHint.textContent = "A lobby code has 6 to 12 digits, such as 123456789. Age of Empires II: Definitive Edition must already be running.";
    $("lobbyCode").removeAttribute("placeholder");
    $("lobbyCode").dataset.hint = "lobbyHint";
    $("lobbyErr").textContent = "That isn't a lobby code. Type 6 to 12 digits, such as 123456789, or a link such as aoe2de://0/123456789.";
    $("openHint").textContent = `A share link has #p= in it, such as ${location.href.split("#")[0]}#p=1Cg4QBAgiAl8.`;
    $("openInput").dataset.hint = "openHint";
    $("openErr").textContent = "That isn't a Fresh Random Civ Picker link. Paste a whole share link, with #p= in it.";
    for (const input of [$("lobbyCode"), $("openInput")]) input.setAttribute("aria-describedby", input.dataset.hint);
  }

  // ---- Start ----

  $("aboutVersion").textContent = "v" + VERSION;
  buildPoolControls();
  // Simple mode's logs scroll as the browser scrolls them.
  if (!SIMPLE) {
    for (const log of [els.drawnLog, els.remainingLog]) {
      scrollInstantly(log);
      buildLogBar(log);
    }
  }
  if (SIMPLE) setUpSimple();
  // The Draw Civ tab's images that first show on a hover or press: the external icon in the menus and tooltips, and
  // the pressed text button on a desktop or the pressed menu button on a phone. The CSS loads the ones it shows.
  const preloadLanding = () => preload("ui/external", PHONE.matches ? "ui/button_pressed_9slice" : "ui/button_pressed");
  preloadLanding();
  PHONE.addEventListener("change", preloadLanding);
  bind();

  if (settings.newRoundOnVisit) closeRound();
  const code = readHash();
  if (code !== null) handleLinkInUrl(code);
  else if (settings.drawOnLoad) draw({ silent: true });
  saveState();
  render();
})();
