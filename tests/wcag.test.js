// Simple mode (/simple) against WCAG 2.2 at level AAA, in a headless Chrome. One sweep per screen setup opens every
// tab, menu and dialog and measures it, with axe-core and with the checks in page-checks.js; the other tests use the
// page with the keyboard and the mouse. Each test names the success criteria it covers. Without Chrome, Edge or
// Chromium on the machine, or with FRCP_NO_BROWSER set, they skip.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { DATA, read } from "./helpers.js";
import { findChrome, launch, openPage, serve, sleep } from "./browser.js";

const CHROME = process.env.FRCP_NO_BROWSER ? null : findChrome();
const skip = process.env.FRCP_NO_BROWSER ? "FRCP_NO_BROWSER is set"
  : CHROME ? false : "no Chrome, Edge or Chromium found (CHROME_PATH can point to one)";
const AXE = read("tests/vendor/axe.min.js");
const CHECKS = read("tests/page-checks.js");
// Two rounds, the current one with three draws, and two civs off
const STATE = { v: 1, edition: "DE", disabled: [3, 7], log: [[[1, 1, 54], [5, 2, 54]], [[10, 1, 54], [20, 2, 54], [30, 3, 54]]] };

let browser = null;
let server = null;
const pageErrors = [];
async function open(opts = {}) {
  const page = await openPage(browser, server.base, opts.url || "/simple/", { storage: { "frcp.state": STATE }, ...opts });
  await page.eval(CHECKS);
  return page;
}
async function done(page) {
  pageErrors.push(...page.errors);
  await page.close();
}

// ---- The sweeps ----

// A change of the address's #p= opens a dialog once the hashchange event comes.
const UNTIL_DIALOG = `new Promise((ok, fail) => {
  const end = Date.now() + 3000;
  const t = () => (document.querySelector("dialog[open]") ? ok() : Date.now() > end ? fail(new Error("no dialog opened")) : setTimeout(t, 20));
  t();
})`;
// Every state a sweep measures, each opened from the Draw Civ tab with no dialog or menu open
const STATES = [
  ...[0, 1, 2].map((t) => [`the ${["Draw Civ", "Log", "Civ Pool"][t]} tab`, `document.getElementById("tab-${t}").click()`]),
  ...["File", "Lobbies", "Civs", "Game", "FRCP", "Help"].map((m) => [`the ${m} menu`,
    `[...document.querySelectorAll("#menubar .menu-title")].find((t) => t.textContent === ${JSON.stringify(m)}).click()`]),
  ...["options", "hotkeys", "about", "help", "lobby", "share", "openLink"].map((act) => [`the ${act} dialog`,
    `document.querySelector('[data-act="${act}"]').click()`]),
  ["a message box", `location.hash = "#p=nonsense"; ${UNTIL_DIALOG}`],
  ["the shared link preview", `(async () => {
    document.querySelector('[data-act="share"]').click();
    const link = document.getElementById("shareRound").value;
    document.querySelector("dialog[open]").close();
    location.hash = link.split("#")[1];
    await ${UNTIL_DIALOG};
  })()`],
  ["a lobby code error", `(() => {
    document.querySelector('[data-act="lobby"]').click();
    document.getElementById("lobbyCode").value = "abc";
    document.querySelector('#lobbyForm [value="join"]').click();
  })()`],
];
const RESET = `(() => {
  document.querySelectorAll("dialog[open]").forEach((d) => d.close());
  document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  document.getElementById("tab-0").click();
})()`;

// The screen setups: 1280 px is a desktop window, 640 x 512 is one at 200 % zoom, and 320 x 256 one at 400 % zoom
// or a small phone, and 720 px is the narrowest that keeps the wide layout. Text spacing applies WCAG's spacing
// overrides. A wide font stands in for a system without Segoe UI, such as Linux with DejaVu Sans, whose text runs
// wider.
const WIDE_FONT = "Verdana, 'DejaVu Sans', sans-serif";
const SWEEPS = [
  { name: "1280 px", opts: { width: 1280, height: 900 }, axe: true, checks: ["targets", "contrast", "reflow", "overlaps", "visualPresentation", "newTabs"], text: true },
  { name: "1280 px, dark", opts: { width: 1280, height: 900, dark: true }, axe: true, checks: ["contrast"] },
  { name: "640 px", opts: { width: 640, height: 512 }, axe: true, checks: ["targets", "reflow", "overlaps", "visualPresentation"] },
  { name: "320 px", opts: { width: 320, height: 256, mobile: true }, axe: true, checks: ["targets", "contrast", "reflow", "overlaps"] },
  { name: "1280 px with text spacing", opts: { width: 1280, height: 900 }, spacing: true, checks: ["targets", "reflow", "overlaps"] },
  { name: "640 px with text spacing", opts: { width: 640, height: 512 }, spacing: true, checks: ["targets", "reflow", "overlaps"] },
  { name: "320 px with text spacing", opts: { width: 320, height: 256, mobile: true }, spacing: true, checks: ["targets", "reflow", "overlaps"] },
  ...[[720, 600], [640, 512], [320, 256]].map(([width, height]) => (
    { name: `${width} px with a wide font and text spacing`, opts: { width, height, mobile: width < 610 }, spacing: true, font: WIDE_FONT, checks: ["targets", "reflow", "overlaps"] })),
];
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag2aaa", "wcag21a", "wcag21aa", "wcag22aa"];

// What the sweeps find, by check, as "setup, state: problem", the states they couldn't open, and the text and files
// they saw
const found = { unopened: [], axe: [], targets: [], contrast: [], reflow: [], overlaps: [], visualPresentation: [], newTabs: [] };
const seenText = new Set();
const loaded = new Set();

async function runSweep(sweep) {
  const page = await open(sweep.opts);
  if (sweep.axe) await page.eval(AXE);
  if (sweep.font) await page.eval(`document.head.append(Object.assign(document.createElement("style"), { textContent: "[data-simple] { --ui: ${sweep.font}; }" }))`);
  for (const [state, show] of STATES) {
    const where = `${sweep.name}, ${state}`;
    await page.eval(RESET);
    try {
      await page.eval(show);
    } catch (e) {
      found.unopened.push(`${where}: ${e.message}`);
      continue;
    }
    await sleep(60);
    if (sweep.spacing) await page.eval("wcag.textSpacing(true)");
    if (sweep.axe) {
      const violations = await page.eval(`axe.run(document, { runOnly: { type: "tag", values: ${JSON.stringify(AXE_TAGS)} } })
        .then((r) => r.violations.map((v) => v.id + ": " + v.nodes.map((n) => n.target.join(" ")).join(", ")))`);
      found.axe.push(...violations.map((v) => `${where}: ${v}`));
    }
    for (const check of sweep.checks) found[check].push(...(await page.eval(`wcag.${check}()`)).map((p) => `${where}: ${p}`));
    if (sweep.text) {
      for (const t of await page.eval(`[...document.querySelectorAll("p, li, dd, dt, label, legend, h1, h2, h3, button, a, .label")]
        .filter((e) => wcag.visible(e)).map((e) => e.innerText.trim())`)) seenText.add(t);
    }
    if (sweep.spacing) await page.eval("wcag.textSpacing(false)");
  }
  if (sweep.text) for (const name of await page.eval(`performance.getEntriesByType("resource").map((e) => e.name)`)) loaded.add(name);
  await done(page);
}

before(async () => {
  if (!CHROME) return;
  server = await serve();
  browser = await launch(CHROME);
  await Promise.all(SWEEPS.map(runSweep));
});
after(async () => {
  await browser?.close();
  server?.close();
});

test("the sweeps reach every tab, menu and dialog", { skip }, () => {
  assert.deepEqual(found.unopened, []);
});
test("axe-core finds no WCAG 2.2 A, AA or AAA violation in any tab, menu or dialog, at any size or in dark mode", { skip }, () => {
  assert.deepEqual(found.axe, []);
});
test("1.4.3, 1.4.6 Contrast (Enhanced): all text is at least 7:1, in light and dark mode", { skip }, () => {
  assert.deepEqual(found.contrast, []);
});
test("2.5.5 Target Size (Enhanced), 2.5.8: every control is at least 44 x 44 px, at any size and with text spacing", { skip }, () => {
  assert.deepEqual(found.targets, []);
});
test("1.4.4 Resize Text, 1.4.10 Reflow: nothing scrolls sideways or leaves the screen at 200 % or 400 % zoom", { skip }, () => {
  assert.deepEqual(found.reflow, []);
});
test("1.4.12 Text Spacing: with WCAG's spacing, no text overlaps, spills out of its control or is cut off", { skip }, () => {
  assert.deepEqual(found.overlaps, []);
});
test("1.4.8 Visual Presentation: lines of at most 80 characters, 1.5 line spacing, wider paragraph spacing, no justified text", { skip }, () => {
  assert.deepEqual(found.visualPresentation, []);
});
test("3.2.5 Change on Request: every link and button that opens a new tab says so", { skip }, () => {
  assert.deepEqual(found.newTabs, []);
});
test("1.1.1, 1.4.9 Images of Text, 1.4.2: simple mode loads no images and no sounds", { skip }, () => {
  const media = [...loaded].filter((url) => /\.(webp|png|jpe?g|gif|svg|webm|mp3|ogg)(\?|$)/.test(url));
  assert.deepEqual(media, []);
});

// ---- Words and reading level ----

// Product, game, civ and expansion names are left out of the reading level and the short forms, as 3.1.5 allows.
const NAMES = [
  ...DATA.civs.map((c) => c.name), ...Object.values(DATA.dlcs).flatMap((d) => [d.name, d.short]).filter(Boolean),
  "Age of Empires II: The Age of Kings", "Age of Empires II: Definitive Edition", "Age of Empires II: HD Edition", "Age of Empires II",
  "Fresh Random Civ Picker", "Microsoft Corporation", "Microsoft's", "Microsoft", "Game Content Usage Rules",
  "Definitive Edition", "HD Edition", "Age of Kings", "Carl Nordenbrink", "Hjörleif", "GitHub", "YouTube", "Voobly", "Steam", "Xbox",
].sort((a, b) => b.length - a.length);
const withoutNames = (text) => NAMES.reduce((t, name) => t.split(name).join("Name"), text);

function syllables(word) {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (w.length <= 3) return w ? 1 : 0;
  const groups = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "").match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups ? groups.length : 1);
}
// The Flesch-Kincaid grade of a text
function grade(text) {
  const sentences = Math.max(1, (text.match(/[.!?:](\s|$)/g) || []).length);
  const words = text.split(/\s+/).filter((w) => /[a-z]/i.test(w));
  return 0.39 * (words.length / sentences) + 11.8 * (words.reduce((n, w) => n + syllables(w), 0) / words.length) - 15.59;
}

test("3.1.5 Reading Level: every block of text, tooltip and message reads at grade 9 or below", { skip }, async () => {
  const page = await open();
  const tips = await page.eval(`[...document.querySelectorAll("[data-tip]")].map((e) => e.dataset.tip.replace(/\\n/g, ". "))`);
  const errors = await page.eval(`["lobbyErr", "openErr", "lobbyHint", "openHint"].map((id) => document.getElementById(id).textContent)`);
  await done(page);
  // The status bar's and message boxes' messages, from script.js
  const script = read("script.js");
  const messages = [...script.matchAll(/(?:toast|say|msgBox)\((?:"[^"]*", )?"([^"]+)"/g)].map((m) => m[1]);
  const blocks = [...seenText, ...tips, ...errors, ...messages].filter((t) => t.split(/\s+/).length >= 8);
  assert.ok(blocks.length > 40, `only ${blocks.length} blocks of text found`);
  const hard = blocks.map((t) => [grade(withoutNames(t)), t]).filter(([g]) => g > 9).map(([g, t]) => `grade ${g.toFixed(1)}: ${t}`);
  assert.deepEqual(hard, []);
});

test("3.1.3 Unusual Words, 3.1.4 Abbreviations: Help explains the picker's words and every short form on the page", { skip }, async () => {
  const page = await open();
  const help = await page.eval(`[...document.querySelectorAll("#dlgHelp .terms")].map((dl) => [...dl.querySelectorAll("dt")].map((dt) => dt.textContent))`);
  await done(page);
  const [words, shortForms] = help;
  for (const w of ["Civ", "Civ pool", "Draw", "Round", "Reset", "Log", "Edition", "Expansion", "Continuous freshness", "Share link",
    "Preset", "Quicksave and quickload", "Tech tree", "Lobby", "Hotkey", "Single-key hotkey", "Auto-toggle older civs", "Auto-reset upon change"]) {
    assert.ok(words.includes(w), `Help doesn't explain "${w}"`);
  }
  // Short forms: words with two or more capitals or a capital and a digit, and the key names Ctrl and Esc. F1 to F12
  // share an entry, and Roman numerals and OK aren't short forms.
  const defined = new Set(shortForms.flatMap((dt) => dt.split(", ")));
  const used = new Set();
  for (const t of seenText) {
    for (const [token] of withoutNames(t).matchAll(/\b(?:[A-Z][a-z]*[A-Z0-9][A-Za-z0-9]*|Ctrl|Esc)\b/g)) {
      if (/^[IVX]+$|^OK$/.test(token)) continue;
      used.add(/^F\d+$/.test(token) ? "F1 to F12" : token);
    }
  }
  assert.ok(used.size > 3, `only ${[...used].join(", ")} found`);
  assert.deepEqual([...used].filter((s) => !defined.has(s)), []);
});

// ---- Keyboard ----

const active = (page) => page.eval("wcag.describe(document.activeElement)");
const menuOpen = (page) => page.eval(`document.querySelectorAll("#menubar .menu-list:not([hidden])").length > 0`);

test("2.1.1 Keyboard, 2.1.3: the menus open, move and close from the keyboard, as menu buttons do", { skip }, async () => {
  const page = await open();
  await page.eval(`document.querySelector("#menubar .menu-title").focus()`);
  await page.key("Enter");
  assert.match(await active(page), /Copy Share Link/, "Enter opens File at its first item");
  assert.equal(await page.eval(`document.querySelector("#menubar .menu-title").getAttribute("aria-expanded")`), "true");
  await page.key("ArrowDown");
  await page.key("ArrowDown");
  assert.match(await active(page), /Open Link/, "Down moves through the items");
  await page.key("End");
  assert.match(await active(page), /Options/, "End goes to the last item");
  await page.key("Home");
  assert.match(await active(page), /Copy Share Link/, "Home goes to the first item");
  await page.key("ArrowUp");
  assert.match(await active(page), /Options/, "Up from the first item goes round to the last");
  await page.key("ArrowRight");
  assert.match(await active(page), /Join Lobby/, "Right opens the next menu at its first item");
  await page.key("Escape");
  assert.match(await active(page), /Lobbies/, "Esc goes back to the title");
  assert.equal(await menuOpen(page), false, "Esc closes the menu");
  await page.key("ArrowDown");
  await page.key("Tab");
  assert.match(await active(page), /Civs/, "Tab leaves the menu for the next title");
  assert.equal(await menuOpen(page), false, "Tab closes the menu");
  await page.key("ArrowUp");
  assert.match(await active(page), /Tech Tree/, "Up opens a menu at its last item");
  await page.key("Escape");
  await page.eval(`document.getElementById("tab-0").focus()`);
  await page.key("End");
  assert.match(await active(page), /tab-2/, "End on the tabs goes to Civ Pool");
  assert.equal(await page.eval(`document.getElementById("client").dataset.tab`), "2");
  await page.key("Home");
  assert.match(await active(page), /tab-0/, "Home on the tabs goes to Draw Civ");
  await done(page);
});

test("2.4.3 Focus Order: focus comes back from a dialog, and follows a tab hotkey off a hidden control", { skip }, async () => {
  const page = await open();
  await page.eval(`[...document.querySelectorAll("#menubar .menu-title")].find((t) => t.textContent === "Help").focus()`);
  await page.key(" ");
  assert.match(await active(page), /Help \.\.\./, "Space opens Help at its first item");
  await page.key("Enter");
  assert.equal(await page.eval(`document.getElementById("dlgHelp").open`), true);
  assert.match(await active(page), /helpTitle/, "the Help dialog starts at its heading");
  await page.key("Escape");
  await sleep(30);
  assert.equal(await page.eval(`document.getElementById("dlgHelp").open`), false);
  assert.match(await active(page), /^button "Help"$/, "focus comes back to the Help menu's title");
  await page.eval(`document.getElementById("drawBtn").focus()`);
  await page.key("3");
  assert.match(await active(page), /tab-2/, "the 3 hotkey takes focus from the hidden Draw button to the Civ Pool tab");
  // The expansions come before the civs, where they show (1.3.2 Meaningful Sequence).
  assert.equal(await page.eval(`!!(document.querySelector('[data-edition="DE"]').compareDocumentPosition(document.getElementById("civGrid")) & Node.DOCUMENT_POSITION_FOLLOWING)`), true);
  await done(page);
});

for (const [size, opts] of [["1280 px", { width: 1280, height: 900 }], ["320 px", { width: 320, height: 256, mobile: true }]]) {
  test(`2.4.7, 2.4.11, 2.4.12, 2.4.13 Focus: at ${size}, every Tab stop on every tab has a ring 2 px or wider, at 3:1, uncovered`, { skip }, async () => {
    const page = await open(opts);
    const problems = [];
    for (const t of [0, 1, 2]) {
      await page.eval(`document.getElementById("tab-${t}").click(); document.activeElement.blur(); scrollTo(0, 0)`);
      const stops = [];
      for (let i = 0; i < 150; i++) {
        await page.key("Tab");
        const f = await page.eval("wcag.focus()");
        if (!f) continue;
        if (f.el === stops[0]) break;
        stops.push(f.el);
        problems.push(...f.problems);
      }
      assert.ok(stops.length > 8, `tab ${t} has only ${stops.length} Tab stops`);
    }
    await done(page);
    assert.deepEqual(problems, []);
  });
}

test("2.1.4 Character Key Shortcuts: single-key hotkeys can be turned off, leaving the Ctrl and F keys", { skip }, async () => {
  const page = await open();
  const drawn = () => page.eval(`document.getElementById("roundCounter").textContent`);
  await page.eval(`document.activeElement.blur()`);
  const before = await drawn();
  await page.key(" ");
  assert.notEqual(await drawn(), before, "Space draws while they're on");
  await page.key("z", { ctrl: true });
  await page.eval(`document.querySelector('[data-act="options"]').click()`);
  assert.equal(await page.eval(`wcag.visible(document.querySelector('[name="charKeys"]'))`), true, "Options shows the switch");
  await page.eval(`document.querySelector('[name="charKeys"]').click(); document.querySelector("#optForm [type=submit]").click(); document.activeElement.blur()`);
  await page.key(" ");
  await page.key("2");
  await page.key("o");
  assert.equal(await drawn(), before, "Space doesn't draw");
  assert.equal(await page.eval(`document.getElementById("client").dataset.tab`), "0", "2 doesn't switch tabs");
  assert.equal(await page.eval(`document.getElementById("dlgOptions").open`), false, "O doesn't open Options");
  await page.key("F2");
  assert.equal(await page.eval(`document.getElementById("dlgHotkeys").open`), true, "F2 still opens Hotkeys");
  const listed = await page.eval(`[...document.querySelectorAll("#hkGrid kbd")].map((k) => k.textContent)`);
  assert.deepEqual(listed.filter((k) => /^([A-Z0-9?]|Space)$/.test(k)), [], "Hotkeys lists no single keys");
  await page.key("Escape");
  assert.equal(await page.eval(`document.querySelector('kbd[data-key="copyLink"]').textContent`), "", "the menus show no single keys");
  await done(page);
});

// ---- Pointer ----

test("1.4.13 Content on Hover or Focus, 3.3.5 Help: tooltips can be dismissed and hovered, stay, and show on focus too", { skip }, async () => {
  const page = await open();
  const box = await page.eval(`(() => { const r = document.getElementById("drawBtn").getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, bottom: r.bottom }; })()`);
  const tip = () => page.eval(`(() => { const t = document.getElementById("tip"); const r = t.getBoundingClientRect(); return { shown: !t.hidden, top: r.top, x: r.left + 10, y: r.top + r.height / 2 }; })()`);
  await page.move(box.x, box.y);
  const shown = await tip();
  assert.equal(shown.shown, true, "hovering Draw shows its tooltip");
  assert.ok(Math.abs(shown.top - box.bottom) < 1.5, "the tooltip touches the button, so the pointer can reach it");
  await page.move(box.x, box.bottom - 1);
  await page.move(shown.x, shown.y);
  assert.equal((await tip()).shown, true, "the pointer can move onto the tooltip");
  await page.move(box.x, box.y);
  await page.key("Escape");
  assert.equal((await tip()).shown, false, "Esc hides it");
  await page.move(box.x + 3, box.y + 1);
  assert.equal((await tip()).shown, false, "it stays hidden while the pointer stays on Draw");
  await page.move(5, 5);
  await page.move(box.x, box.y);
  assert.equal((await tip()).shown, true, "it comes back once the pointer leaves and returns");
  await page.move(5, 5);
  await page.eval(`(() => { const n = document.getElementById("civName"); n.tabIndex = -1; n.focus(); n.removeAttribute("tabindex"); })()`);
  await page.key("Tab");
  assert.match(await active(page), /drawBtn/);
  assert.equal((await tip()).shown, true, "keyboard focus on Draw shows its tooltip");
  assert.match(await page.eval(`document.getElementById(document.getElementById("drawBtn").getAttribute("aria-describedby")).textContent`),
    /Draws a civ/, "Draw's description is its tooltip");
  await done(page);
});

test("2.5.1 Pointer Gestures, 2.5.7 Dragging Movements: phones draw with buttons, and a swipe does nothing", { skip }, async () => {
  const page = await open({ width: 375, height: 812, mobile: true });
  const drawn = () => page.eval(`document.getElementById("roundCounter").textContent`);
  const before = await drawn();
  const panel = await page.eval(`(() => { const r = document.getElementById("panel").getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  await page.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: panel.x + 80, y: panel.y }] });
  for (let i = 1; i <= 8; i++) await page.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: panel.x + 80 - 20 * i, y: panel.y }] });
  await page.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await sleep(300);
  assert.equal(await drawn(), before, "a swipe doesn't draw");
  for (const id of ["drawBtn", "resetBtn"]) assert.equal(await page.eval(`wcag.visible(document.getElementById("${id}"))`), true, `${id} shows`);
  const draw = await page.eval(`(() => { const r = document.getElementById("drawBtn").getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
  await page.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: draw[0], y: draw[1] }] });
  await page.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitFor(`document.getElementById("roundCounter").textContent !== ${JSON.stringify(before)}`, "a tap on Draw to draw");
  await done(page);
});

test("2.5.2 Pointer Cancellation: a click outside an open menu only closes it, and the next click works", { skip }, async () => {
  const page = await open();
  const center = (sel) => page.eval(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
  const drawn = () => page.eval(`document.getElementById("roundCounter").textContent`);
  await page.click(...await center("#menubar .menu-title"));
  assert.equal(await menuOpen(page), true);
  const before = await drawn();
  await page.click(...await center("#drawBtn"));
  assert.equal(await menuOpen(page), false, "the click closes the menu");
  assert.equal(await drawn(), before, "and doesn't press Draw");
  await page.click(...await center("#drawBtn"));
  assert.notEqual(await drawn(), before, "the next click presses Draw");
  await done(page);
});

// ---- Errors, messages and undo ----

test("3.3.4, 3.3.6 Error Prevention: clearing the log, emptying the pool and quickloading can all be undone", { skip }, async () => {
  const page = await open();
  const drawn = () => page.eval(`document.getElementById("roundCounter").textContent`);
  const rounds = () => page.eval(`document.querySelectorAll("#drawnLog .log-round").length`);
  const enabled = () => page.eval(`document.getElementById("enabledCount").textContent`);
  const undo = async () => {
    await page.eval("document.activeElement.blur()");
    await page.key("z", { ctrl: true });
  };
  await page.eval(`document.getElementById("tab-1").click(); document.getElementById("clearLogBtn").click()`);
  assert.equal(await rounds(), 1, "Clear Log leaves this round");
  await undo();
  assert.equal(await rounds(), 2, "undo brings the past round back");
  await page.eval(`document.getElementById("tab-2").click(); document.getElementById("disableAllBtn").click()`);
  assert.match(await enabled(), /^Enabled: 0\//);
  await undo();
  assert.equal(await enabled(), "Enabled: 54/56", "undo turns the civs back on");
  await page.eval(`document.getElementById("tab-0").click()`);
  await page.key("F8");
  await page.eval("document.activeElement.blur()");
  await page.key(" ");
  const afterDraw = await drawn();
  await page.key("F9");
  await undo();
  assert.equal(await drawn(), afterDraw, "undo takes back a quickload");
  await done(page);
});

test("2.2.1, 2.2.3 No Timing, 4.1.3 Status Messages: results are announced and stay on screen", { skip }, async () => {
  const page = await open();
  const status = () => page.eval(`document.getElementById("toast").textContent`);
  assert.equal(await page.eval(`document.getElementById("toast").getAttribute("role")`), "status");
  for (const id of ["civName", "enabledCount"]) assert.equal(await page.eval(`document.getElementById("${id}").getAttribute("aria-live")`), "polite", `${id} is a live region`);
  await page.eval(`document.getElementById("tab-1").click(); document.getElementById("clearLogBtn").click()`);
  await page.waitFor(`/Log cleared/.test(document.getElementById("toast").textContent)`, "the Log cleared message");
  // The full page's messages faded after 2.2 s.
  await sleep(3000);
  assert.match(await status(), /Log cleared/, "the message is still there after 3 s");
  await page.eval("document.activeElement.blur()");
  await page.key("z", { ctrl: true });
  await page.waitFor(`document.getElementById("toast").textContent === "Undone"`, "a new message to replace it");
  await page.eval(`document.querySelector('[data-act="share"]').click(); document.querySelector('[data-copy="sharePool"]').click()`);
  assert.equal(await page.eval(`document.getElementById("shareStatus").getAttribute("role")`), "status");
  await page.waitFor(`/Copied|Couldn't copy/.test(document.getElementById("shareStatus").textContent)`, "the Share dialog to say whether it copied");
  await done(page);
});

test("3.3.1 Error Identification, 3.3.3 Error Suggestion: a bad lobby code or link is explained, marked and focused", { skip }, async () => {
  const page = await open();
  for (const [act, input, err] of [["lobby", "lobbyCode", "lobbyErr"], ["openLink", "openInput", "openErr"]]) {
    await page.eval(`document.querySelectorAll("dialog[open]").forEach((d) => d.close()); document.querySelector('[data-act="${act}"]').click()`);
    for (const ch of "abc") await page.send("Input.insertText", { text: ch });
    await page.key("Enter");
    const field = await page.eval(`(() => { const i = document.getElementById("${input}"); const e = document.getElementById("${err}");
      return { shown: !e.hidden, invalid: i.getAttribute("aria-invalid"), describedBy: i.getAttribute("aria-describedby"), text: e.textContent }; })()`);
    assert.equal(field.shown, true, `${act}: the error shows`);
    assert.equal(field.invalid, "true", `${act}: the field is marked invalid`);
    assert.match(field.describedBy, new RegExp(err), `${act}: the field is described by the error`);
    assert.match(await active(page), new RegExp(input), `${act}: focus goes to the field`);
    assert.match(field.text, /such as|with #p=/, `${act}: the error says what to type`);
  }
  await done(page);
});

// ---- Structure ----

test("1.3.1 Info and Relationships, 4.1.2 Name, Role, Value, 2.4.10 Section Headings: lists, groups, headings and states are marked up", { skip }, async () => {
  const page = await open();
  const facts = await page.eval(`({
    logRounds: [...document.querySelectorAll("#drawnLog > *")].map((r) => r.tagName + ">" + [...r.children].map((c) => c.tagName)[0]),
    groups: ["editionGroup", "civGrid"].map((id) => document.getElementById(id).getAttribute("role") + ":" + document.getElementById(id).getAttribute("aria-label")),
    expansions: document.querySelector('[data-edition="DE"]').getAttribute("role") + ":" + document.querySelector('[data-edition="DE"]').getAttribute("aria-label"),
    headings: ["drawnCount", "remainingCount"].map((id) => document.getElementById(id).getAttribute("role") + document.getElementById(id).getAttribute("aria-level")),
    menus: [...document.querySelectorAll("#menubar .menu-title")].every((t) => t.getAttribute("aria-haspopup") === "menu" && t.getAttribute("aria-expanded") === "false"),
    editions: [...document.querySelectorAll(".edition")].map((b) => b.getAttribute("aria-pressed")),
    dialogs: [...document.querySelectorAll("dialog")].filter((d) => !document.getElementById(d.getAttribute("aria-labelledby"))).map((d) => d.id),
    landmarks: [document.querySelector("[role=banner]")?.className, !!document.querySelector("main"), !!document.querySelector("nav")],
    lang: document.documentElement.lang,
    title: document.title,
  })`);
  await done(page);
  assert.deepEqual(facts.logRounds, ["UL>LI", "UL>LI"], "each round of the log is a list");
  assert.deepEqual(facts.groups, ["group:Edition", "group:Civs"]);
  assert.equal(facts.expansions, "group:Expansions");
  assert.deepEqual(facts.headings, ["heading2", "heading2"]);
  assert.equal(facts.menus, true, "each menu title says it opens a menu, and whether it's open");
  assert.deepEqual(facts.editions, ["true", "false", "false"]);
  assert.deepEqual(facts.dialogs, [], "every dialog is named by its title");
  assert.deepEqual(facts.landmarks, ["site-title desk", true, true], "banner, main and navigation landmarks (1.3.6)");
  assert.equal(facts.lang, "en", "3.1.1 Language of Page");
  // 2.4.2 Page Titled, 2.4.8 Location
  assert.equal(facts.title, "Fresh Random Civ Picker (simple)");
});

test("forced colours (Windows high contrast): the selected edition and the focus ring still show", { skip }, async () => {
  const page = await open({ width: 1280, height: 900, forcedColors: true });
  await page.eval(`document.getElementById("tab-2").click(); document.getElementById("edHD").focus()`);
  await page.key("Tab");
  await page.key("Tab", { shift: true });
  const look = await page.eval(`({
    dot: getComputedStyle(document.querySelector('.edition[aria-pressed="true"] .ed-icon')).backgroundImage,
    ring: getComputedStyle(document.activeElement).outlineStyle + " " + getComputedStyle(document.activeElement).outlineWidth,
  })`);
  await done(page);
  assert.match(look.dot, /radial-gradient/, "the selected edition's dot is drawn");
  assert.equal(look.ring, "solid 3px");
});

test("the page throws no errors in any of these tests", { skip }, () => {
  assert.deepEqual(pageErrors, []);
});
