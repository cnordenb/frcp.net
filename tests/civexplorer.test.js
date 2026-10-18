// Civ Explorer (/civexplorer): its data holds together and names the picker's civs, it lists the civs that have every
// ticked item, its tree works from the keyboard, and it meets WCAG 2.2 at level AAA as simple mode does, measured with
// axe-core and page-checks.js in a headless Chrome. The browser tests skip as wcag.test.js's do.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { CIVS as PICKER_CIVS, read } from "./helpers.js";
import { findChrome, launch, openPage, serve, sleep } from "./browser.js";

// ---- The data ----

const HTML = read("civexplorer/index.html");
const CIVS = JSON.parse(/const CIVS = ("[^"]*")\.split/.exec(HTML)[1]).split(", ");
const TREE = /const TREE = `\n([\s\S]*?)`;/.exec(HTML)[1];
// The items, in tree order, each with its depth, parent, kind and civs. A group, such as Economy, has no kind or civs.
const ITEMS = [];
for (const line of TREE.split("\n").filter((l) => l.trim())) {
  const depth = (line.length - line.trimStart().length) / 2;
  const [name, kind, civs] = line.trim().split(" | ");
  const parent = depth ? ITEMS.filter((i) => i.depth === depth - 1).at(-1) : null;
  const list = civs?.replace(/^(has|lacks) /, "").split(", ");
  const has = !civs ? null : civs === "all" ? CIVS : civs.startsWith("has ") ? list : CIVS.filter((c) => !list.includes(c));
  ITEMS.push({ line, name, kind, civs, depth, parent, has });
}
const item = (name) => ITEMS.find((i) => i.name === name);
const civsWith = (...names) => CIVS.filter((c) => names.every((n) => item(n).has.includes(c)));

// The picker calls two civs by shorter names than the game and aoe2techtree.net do.
const PICKER_NAMES = { Incas: "Inca", Mayans: "Maya" };
test("the data names the picker's civs, in alphabetical order", () => {
  assert.deepEqual([...CIVS].sort((a, b) => a.localeCompare(b)), CIVS);
  assert.deepEqual(CIVS.map((c) => PICKER_NAMES[c] || c).sort(), PICKER_CIVS.map((c) => c.name).sort());
});

test("each line of the tree is an item two spaces under its parent, with civs that exist", () => {
  assert.ok(ITEMS.length > 150, `only ${ITEMS.length} items`);
  let prev = -1;
  for (const i of ITEMS) {
    assert.ok(Number.isInteger(i.depth) && i.depth <= prev + 1, `"${i.line}" is indented wrong`);
    prev = i.depth;
    if (!i.civs) {
      assert.ok(ITEMS.some((k) => k.parent === i), `"${i.line}" has no civs, but isn't a group`);
      continue;
    }
    assert.match(i.kind, /^(regional |unique )?(building|unit|tech)$/, `"${i.line}" doesn't say what it is`);
    assert.match(i.civs, /^(all|(has|lacks) [^|]+)$/, `"${i.line}" doesn't say which civs have it`);
    if (i.civs !== "all") for (const c of i.civs.replace(/^(has|lacks) /, "").split(", ")) assert.ok(CIVS.includes(c), `"${i.line}" names ${c}`);
    assert.ok(i.has.length > 1 || i.kind.startsWith("unique "), `only ${i.has.join("")} has ${i.name}, which isn't unique, and so is left out`);
  }
  const named = ITEMS.filter((i) => i.has);
  assert.equal(new Set(named.map((i) => i.name)).size, named.length, "each item's name is its own, but for groups such as Unique Units");
  assert.deepEqual(ITEMS.filter((i) => i.depth === 0).map((i) => i.name), ["Economy", "Military", "Blacksmith", "University", "Fortifications"]);
  assert.deepEqual(["Economy", "Military", "Blacksmith", "University", "Fortifications"].map((n) => !!item(n).has), [false, false, true, true, false],
    "Blacksmith and University are buildings, and the rest are groups");
  assert.equal(item("Barracks").parent.name, "Military");
  assert.equal(item("Man-at-Arms").parent.name, "Militia");
  for (const [group, parent, members] of [["Drop-off Sites", "Economy", ["Mill", "Lumber Camp", "Mining Camp"]],
    ["General Infantry", "Barracks", ["Militia", "Champi Scout"]], ["Shock Infantry", "Barracks", ["Eagle Scout", "Varangian Guard", "Fire Lancer"]]]) {
    assert.equal(item(group).parent.name, parent);
    assert.equal(item(group).has, null, `${group} is a group`);
    for (const m of members) assert.equal(item(m).parent.name, group);
  }
  assert.equal(item("Wonder").parent.name, "Economy");
  assert.deepEqual(["Paladin", "Camel Rider", "Arson", "Cranequins", "Castle", "Mule Cart", "Huskarl", "Anarchy", "Folwark"].map((n) => item(n).kind),
    ["unit", "regional unit", "tech", "regional tech", "building", "regional building", "unique unit", "unique tech", "unique building"]);
  // Unique units and techs sit in their building's groups, an elite one under its unit, and unique buildings in
  // Economy's and Military's.
  const pathOf = (i) => (i.parent ? [...pathOf(i.parent), i.name] : [i.name]);
  const path = (name) => pathOf(item(name));
  for (const [name, at] of [["Huskarl", "Military Castle Unique Units Huskarl"], ["Elite Huskarl", "Military Castle Unique Units Huskarl Elite Huskarl"],
    ["Anarchy", "Military Castle Unique Technologies Anarchy"], ["Legionary", "Military Barracks Unique Units Legionary"],
    ["Caravel", "Economy Dock Unique Units Caravel"], ["Folwark", "Economy Unique Buildings Folwark"], ["Krepost", "Military Unique Buildings Krepost"]]) {
    assert.equal(path(name).join(" "), at);
  }
  for (const i of ITEMS.filter((i) => i.kind?.startsWith("unique ") && !i.kind.endsWith("building"))) {
    assert.ok(/^Unique (Units|Technologies)$/.test(i.parent.name) || i.parent.kind?.startsWith("unique"), `${i.name} isn't in a unique group`);
  }
  // Under each item, units and buildings come before techs, and a group of techs counts as techs.
  const isTech = (i) => (i.kind ? i.kind.endsWith("tech") : ITEMS.filter((k) => k.parent === i).every(isTech));
  for (const parent of ITEMS) {
    const techs = ITEMS.filter((i) => i.parent === parent).map(isTech);
    assert.deepEqual(techs, [...techs].sort((a, b) => a - b), `${parent.name}'s techs come after its units and buildings`);
  }
  assert.equal(item("Man-at-Arms").parent.name, "Militia");
  assert.equal(item("Heavy Cavalry Archer").parent.name, "Cavalry Archer");
});

// ---- In the browser ----

const CHROME = process.env.FRCP_NO_BROWSER ? null : findChrome();
const skip = process.env.FRCP_NO_BROWSER ? "FRCP_NO_BROWSER is set"
  : CHROME ? false : "no Chrome, Edge or Chromium found (CHROME_PATH can point to one)";
const AXE = read("tests/vendor/axe.min.js");
const CHECKS = read("tests/page-checks.js");
const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag2aaa", "wcag21a", "wcag21aa", "wcag22aa"];

let browser = null;
let server = null;
const pageErrors = [];
async function open(opts = {}) {
  const page = await openPage(browser, server.base, "/civexplorer/", { ready: "document.getElementById('count').textContent", ...opts });
  await page.eval(CHECKS);
  return page;
}
async function done(page) {
  pageErrors.push(...page.errors);
  await page.close();
}
// An item's box, a click on it, which marks it must have, and the X key on it, which marks it must lack
const node = (name) => `[...document.querySelectorAll("#tree .node")].find((n) => n.querySelector(".name").textContent === ${JSON.stringify(name)})`;
const tick = (name) => `${node(name)}.click()`;
const cross = (name) => `${node(name)}.dispatchEvent(new KeyboardEvent("keydown", { key: "x", bubbles: true }))`;
const listed = (page) => page.eval(`[...document.querySelectorAll("#civs li")].map((l) => l.textContent)`);
const focused = (page) => page.eval(`(() => { const a = document.activeElement; return a.closest(".row")?.querySelector(".name").textContent || a.id || a.textContent; })()`);
// How an item's box shows, as the tests name it, from its state and what screen readers get
const box = (page, name) => page.eval(`(() => { const n = ${node(name)}; return ({ has: "ticked", lacks: "crossed", mixed: "partial" })[n.dataset.state] || "empty"; })()`);
const chips = (page) => page.eval(`[...document.querySelectorAll(".chip")].map((c) => c.textContent.replace(/^Clear must (have|lack): |×$/g, ""))`);
const civsLacking = (...names) => CIVS.filter((c) => names.every((n) => !item(n).has.includes(c)));
const branch = (name) => [name, ...ITEMS.filter((i) => i.parent === item(name)).flatMap((i) => branch(i.name))];

// Each sweep measures the page as it opens, with the tree shut, with every branch open and items marked both ways,
// and with a search's matches marked.
const STATES = [
  ["the tree shut", ""],
  ["every branch open and items marked both ways", `document.getElementById("expandAll").click(); ${tick("Heavy Cavalry Archer")}; ${tick("Bracer")}; ${cross("Paladin")}`],
  ["a search with matches marked", `(() => { const f = document.getElementById("find"); f.value = "elite"; f.dispatchEvent(new Event("input")); })()`],
];
const SWEEPS = [
  { name: "1280 px", opts: { width: 1280, height: 900 }, axe: true, checks: ["targets", "contrast", "reflow", "overlaps", "visualPresentation", "newTabs"] },
  { name: "1280 px, dark", opts: { width: 1280, height: 900, dark: true }, axe: true, checks: ["contrast"] },
  { name: "375 x 667 phone", opts: { width: 375, height: 667, mobile: true }, axe: true, checks: ["targets", "contrast", "reflow", "overlaps", "visualPresentation"] },
  { name: "320 px", opts: { width: 320, height: 256, mobile: true }, axe: true, checks: ["targets", "reflow", "overlaps"] },
  { name: "1280 px with text spacing", opts: { width: 1280, height: 900 }, spacing: true, checks: ["targets", "reflow", "overlaps"] },
  { name: "320 px with text spacing", opts: { width: 320, height: 256, mobile: true }, spacing: true, checks: ["targets", "reflow", "overlaps"] },
];
const found = { axe: [], targets: [], contrast: [], reflow: [], overlaps: [], visualPresentation: [], newTabs: [] };
const loaded = new Set();

async function runSweep(sweep) {
  const page = await open(sweep.opts);
  if (sweep.axe) await page.eval(AXE);
  for (const [state, show] of STATES) {
    const where = `${sweep.name}, ${state}`;
    await page.eval(show);
    await sleep(30);
    if (sweep.spacing) await page.eval("wcag.textSpacing(true)");
    if (sweep.axe) {
      const violations = await page.eval(`axe.run(document, { runOnly: { type: "tag", values: ${JSON.stringify(AXE_TAGS)} } })
        .then((r) => r.violations.map((v) => v.id + ": " + v.nodes.map((n) => n.target.join(" ")).join(", ")))`);
      found.axe.push(...violations.map((v) => `${where}: ${v}`));
    }
    for (const check of sweep.checks) found[check].push(...(await page.eval(`wcag.${check}()`)).map((p) => `${where}: ${p}`));
    if (sweep.spacing) await page.eval("wcag.textSpacing(false)");
  }
  for (const name of await page.eval(`performance.getEntriesByType("resource").map((e) => e.name)`)) loaded.add(name);
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

test("axe-core finds no WCAG 2.2 A, AA or AAA violation, at any size or in dark mode", { skip }, () => {
  assert.deepEqual(found.axe, []);
});
test("1.4.3, 1.4.6 Contrast (Enhanced): all text is at least 7:1, in light and dark mode", { skip }, () => {
  assert.deepEqual(found.contrast, []);
});
test("2.5.5 Target Size (Enhanced), 2.5.8: every control is at least 44 x 44 px, at any size and with text spacing", { skip }, () => {
  assert.deepEqual(found.targets, []);
});
test("1.4.4 Resize Text, 1.4.10 Reflow: nothing scrolls sideways or leaves the screen at 400 % zoom", { skip }, () => {
  assert.deepEqual(found.reflow, []);
});
test("1.4.12 Text Spacing: with WCAG's spacing, no text overlaps, spills out of its control or is cut off", { skip }, () => {
  assert.deepEqual(found.overlaps, []);
});
test("1.4.8 Visual Presentation, 3.2.5: short lines, 1.5 line spacing, no justified text, and no link opens a new tab unasked", { skip }, () => {
  assert.deepEqual([...found.visualPresentation, ...found.newTabs], []);
});
test("1.1.1, 1.4.2: the page loads no images and no sounds", { skip }, () => {
  assert.deepEqual([...loaded].filter((url) => /\.(webp|png|jpe?g|gif|svg|ico|webm|mp3|ogg)(\?|$)/.test(url)), []);
});

test("the list shows the civs that fit every mark, and none while nothing is marked, and the chips clear marks", { skip }, async () => {
  const page = await open();
  const none = () => page.eval(`(() => { const p = document.getElementById("none"); return p.hidden ? "" : p.textContent; })()`);
  const number = (name) => page.eval(`${node(name)}.querySelector(".n").textContent`);
  assert.deepEqual(await listed(page), [], "nothing marked lists no civ");
  assert.equal(await page.eval(`document.getElementById("count").textContent`), "0 compatible civilisations");
  assert.match(await none(), /^Click items/, "and says how to list some");
  assert.equal(await number("Heavy Cavalry Archer"), `${civsWith("Heavy Cavalry Archer").length} civs`, "each number is how many civs ticking it lists");
  await page.eval(tick("Heavy Cavalry Archer"));
  assert.deepEqual(await listed(page), civsWith("Heavy Cavalry Archer"));
  await page.eval(tick("Bracer"));
  const both = civsWith("Heavy Cavalry Archer", "Bracer");
  assert.deepEqual(await listed(page), both);
  assert.equal(await page.eval(`document.getElementById("count").textContent`), `${both.length} compatible civilisations`);
  assert.equal(await page.eval(`document.getElementById("count").getAttribute("role")`), "status", "the count is announced (4.1.3)");
  const paladin = civsWith("Heavy Cavalry Archer", "Bracer", "Paladin").length;
  assert.equal(await number("Paladin"), `${paladin} civ${paladin === 1 ? "" : "s"}`);
  // A cross: the civs must lack it.
  await page.eval(cross("Paladin"));
  assert.deepEqual(await listed(page), both.filter((c) => !item("Paladin").has.includes(c)));
  assert.deepEqual(await chips(page), ["Heavy Cavalry Archer", "Paladin", "Bracer"], "the chips come in tree order");
  assert.deepEqual(await page.eval(`[...document.querySelectorAll(".chip")].map((c) => c.dataset.state)`), ["has", "lacks", "has"]);
  await page.eval(`document.querySelector(".chip").click()`);
  assert.deepEqual(await listed(page), civsWith("Bracer").filter((c) => !item("Paladin").has.includes(c)), "the first chip clears Heavy Cavalry Archer");
  assert.match(await page.eval(`document.activeElement.textContent`), /Paladin/, "focus goes to the next chip (2.4.3)");
  await page.eval(`${tick("Eagle Scout")}; ${tick("Knight")}`);
  assert.deepEqual(await listed(page), []);
  assert.match(await none(), /^No civ fits/, "it says when no civ fits them all");
  await page.eval(`document.getElementById("clear").click()`);
  assert.deepEqual(await listed(page), []);
  assert.deepEqual(await chips(page), []);
  assert.match(await none(), /^Click items/, "Clear clears every mark");
  await page.eval(cross("House"));
  assert.deepEqual(await listed(page), civsLacking("House"), "crosses alone list the civs that lack them");
  await page.eval(`document.querySelector(".chip").click()`);
  assert.equal(await page.eval(`document.activeElement.id`), "civTitle", "focus goes to the Civs heading as the last chip goes");
  await done(page);
});

test("marking an item marks its branch, a mixed branch shows as partial, and each item keeps its own mark", { skip }, async () => {
  const page = await open();
  const militia = branch("Militia");
  assert.equal(militia.at(-1), "Champion");
  await page.eval(tick("Militia"));
  for (const n of militia) assert.equal(await box(page, n), "ticked", `ticking Militia ticks ${n}`);
  assert.equal(await box(page, "Barracks"), "partial", "Barracks is partly marked");
  assert.equal(await box(page, "Military"), "partial", "and so is Military");
  assert.deepEqual(await listed(page), civsWith(...militia));
  assert.deepEqual(await chips(page), ["Full Militia"], "one chip stands for a marked branch, as Full Militia");
  await page.eval(tick("Champion"));
  assert.equal(await box(page, "Champion"), "empty");
  for (const n of militia.slice(0, -1)) assert.equal(await box(page, n), "partial", `${n} keeps its own tick, and is partly marked`);
  assert.deepEqual(await listed(page), civsWith(...militia.slice(0, -1)));
  assert.equal(await page.eval(`${node("Militia")}.classList.contains("self")`), true, "an item marked itself shows so");
  await page.eval(cross("Champion"));
  assert.equal(await box(page, "Champion"), "crossed", "a cross can sit in a ticked branch");
  assert.deepEqual(await listed(page), civsWith(...militia.slice(0, -1)).filter((c) => !item("Champion").has.includes(c)));
  await page.eval(tick("Militia"));
  assert.equal(await box(page, "Champion"), "ticked", "a partly marked item ticks its whole branch");
  await page.eval(tick("Militia"));
  for (const n of [...militia, "Barracks", "Military"]) assert.equal(await box(page, n), "empty", `ticking a ticked Militia clears ${n}`);
  // A cross on a branch: the civs must lack every item in it.
  await page.eval(cross("Knight"));
  for (const n of branch("Knight")) assert.equal(await box(page, n), "crossed", `crossing Knight crosses ${n}`);
  assert.deepEqual(await listed(page), civsLacking(...branch("Knight")));
  assert.deepEqual(await chips(page), ["Knight"], "a crossed branch's chip has its name alone");
  await page.eval(tick("Knight"));
  assert.equal(await box(page, "Paladin"), "ticked", "a click turns a crossed branch ticked");
  await page.eval(tick("Knight"));
  await page.eval(tick("Heavy Cavalry Archer"));
  assert.equal(await box(page, "Cavalry Archer"), "partial", "an item whose branch is ticked, but not itself, is partly marked");
  assert.deepEqual(await listed(page), civsWith("Heavy Cavalry Archer"));
  await page.eval(tick("Blacksmith"));
  assert.equal(await box(page, "Blacksmith"), "ticked");
  const listedNow = civsWith("Heavy Cavalry Archer", ...branch("Blacksmith"));
  assert.deepEqual(await listed(page), listedNow);
  assert.deepEqual(await chips(page), ["Heavy Cavalry Archer", "Full Blacksmith"]);
  // A group whose name others share has its parent's name too.
  await page.eval(tick("Unique Units"));
  assert.deepEqual(await chips(page), ["Full Unique Units (Dock)", "Heavy Cavalry Archer", "Full Blacksmith"]);
  await page.eval(tick("Unique Units"));
  // An item's number is how many listed civs have it and its whole branch: those that ticking it would leave.
  const stable = listedNow.filter((c) => branch("Stable").every((n) => item(n).has.includes(c))).length;
  assert.equal(await page.eval(`${node("Stable")}.querySelector(".n").textContent`), `${stable} civ${stable === 1 ? "" : "s"}`);
  // A group asks nothing of a civ itself: marking it marks its buildings and their branches.
  await page.eval(cross("Fortifications"));
  for (const n of ["Fortifications", "Watch Tower", "Keep"]) assert.equal(await box(page, n), "crossed", `crossing Fortifications crosses ${n}`);
  assert.deepEqual(await listed(page), listedNow.filter((c) => civsLacking(...branch("Fortifications").slice(1)).includes(c)));
  await done(page);
});

test("2.1.1, 2.5.2: a right-click, a long press, X and the menu key cross an item, as the button or finger lifts", { skip }, async () => {
  const page = await open();
  const center = (name) => page.eval(`(() => { const n = ${node(name)}; n.scrollIntoView({ block: "nearest" }); const r = n.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
  const mouse = (type, [x, y], button = "right") => page.send("Input.dispatchMouseEvent", { type, x, y, button, buttons: type === "mousePressed" ? 2 : 0, clickCount: 1 });
  const rightClick = async (name) => {
    const at = await center(name);
    await mouse("mouseMoved", at, "none");
    await mouse("mousePressed", at);
    await mouse("mouseReleased", at);
    await sleep(50);
  };
  await page.eval(`document.getElementById("expandAll").click()`);
  await rightClick("Knight");
  assert.equal(await box(page, "Knight"), "crossed", "a right-click crosses");
  assert.equal(await box(page, "Paladin"), "crossed", "and crosses the branch");
  await rightClick("Knight");
  assert.equal(await box(page, "Knight"), "empty", "a right-click on a crossed item clears it");
  // Moving off the item before letting go calls it off.
  const knight = await center("Knight");
  await mouse("mouseMoved", knight, "none");
  await mouse("mousePressed", knight);
  await mouse("mouseMoved", await center("Camel Rider"));
  await mouse("mouseReleased", await center("Camel Rider"));
  await sleep(50);
  assert.deepEqual([await box(page, "Knight"), await box(page, "Camel Rider")], ["empty", "empty"], "a right-click let go elsewhere does nothing");
  assert.equal(await page.eval(`(() => { const e = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2 }); ${node("Knight")}.dispatchEvent(e); return e.defaultPrevented; })()`),
    true, "the browser's menu doesn't open on an item");
  // The keyboard's menu key, Shift+F10, sends a menu event with no button down.
  await page.eval(`${node("Arson")}.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }))`);
  assert.equal(await box(page, "Arson"), "crossed", "the menu key crosses");
  await page.eval(`${node("Squires")}.focus()`);
  await page.key("x");
  assert.equal(await box(page, "Squires"), "crossed", "X crosses");
  await page.key(" ");
  assert.equal(await box(page, "Squires"), "ticked", "Space ticks");
  // Screen readers hear the state.
  assert.deepEqual(await page.eval(`["Squires", "Arson", "Barracks", "Spearman"].map((n) => {
    const e = [...document.querySelectorAll("#tree .node")].find((x) => x.querySelector(".name").textContent === n);
    return e.getAttribute("role") + " " + e.getAttribute("aria-checked") + " " + /must lack/.test(e.textContent);
  })`), ["checkbox true false", "checkbox false true", "checkbox mixed false", "checkbox false false"]);
  await done(page);

  // On a touch screen, a long press crosses and a tap ticks.
  const phone = await open({ width: 375, height: 667, mobile: true });
  await phone.eval(`document.getElementById("expandAll").click(); ${node("House")}.scrollIntoView({ block: "center" })`);
  const [x, y] = await phone.eval(`(() => { const r = ${node("House")}.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
  await phone.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  await sleep(700);
  await phone.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await sleep(100);
  assert.equal(await box(phone, "House"), "crossed", "a long press crosses");
  await phone.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  await phone.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await phone.waitFor(`${node("House")}.dataset.state === "has"`, "a tap to tick");
  await done(phone);
});

test("Find opens the branches down to each match, closes the rest, marks the matches and says how many", { skip }, async () => {
  const page = await open();
  const find = (text) => page.eval(`(() => { const f = document.getElementById("find"); f.value = ${JSON.stringify(text)}; f.dispatchEvent(new Event("input")); })()`);
  const shown = () => page.eval(`[...document.querySelectorAll("#tree .node")].filter((l) => l.checkVisibility()).map((l) => l.querySelector(".name").textContent)`);
  const marked = () => page.eval(`[...document.querySelectorAll("#tree .node.found")].map((l) => l.querySelector(".name").textContent)`);
  const status = () => page.eval(`document.getElementById("found").textContent`);
  await page.eval(`document.getElementById("expandAll").click()`);
  await find("heavy cav");
  assert.deepEqual(await marked(), ["Heavy Cavalry Archer"]);
  assert.equal(await status(), "1 found");
  const path = ["Military", "Archery Range", "Cavalry Archer", "Heavy Cavalry Archer"];
  for (const n of path) assert.ok((await shown()).includes(n), `${n} shows`);
  assert.equal((await shown()).includes("Town Center"), false, "the branches without a match close");
  await find("man at arms");
  assert.deepEqual(await marked(), ["Man-at-Arms"], "spaces and hyphens don't matter");
  await find("elite");
  const elite = ITEMS.filter((i) => /elite/i.test(i.name)).map((i) => i.name);
  assert.deepEqual(await marked(), elite);
  assert.equal(await status(), `${elite.length} found`);
  for (const n of elite) assert.ok((await shown()).includes(n), `${n} shows`);
  await page.eval(`document.getElementById("find").focus()`);
  await page.key("Enter");
  assert.equal(await focused(page), elite[0], "Enter goes to the first match");
  await find("zzz");
  assert.equal(await status(), "None found");
  await find("");
  assert.deepEqual(await marked(), []);
  assert.equal(await status(), "");
  await done(page);
});

test("2.1.1 Keyboard: the tree's arrow keys move, open and close as a file explorer's do, Space ticks and X crosses", { skip }, async () => {
  const page = await open();
  const twisty = (name) => `[...document.querySelectorAll(".twisty")].find((b) => b.closest(".row").querySelector(".name").textContent === ${JSON.stringify(name)})`;
  const expanded = (name) => page.eval(`${twisty(name)}.getAttribute("aria-expanded")`);
  const kids = (name) => ITEMS.filter((i) => i.parent === item(name)).map((i) => i.name);
  await page.eval(`document.querySelector("#tree .node").focus()`);
  assert.equal(await focused(page), "Economy");
  await page.key("ArrowDown");
  assert.equal(await focused(page), "Military", "Down goes to the next item, past a closed group");
  await page.key("ArrowRight");
  assert.equal(await expanded("Military"), "true", "Right opens a group");
  assert.equal(await focused(page), "Military");
  await page.key("ArrowRight");
  assert.equal(await focused(page), "Barracks", "Right goes into an open group");
  assert.equal(await page.eval(`document.activeElement.getAttribute("role")`), "checkbox", "and to the item's box");
  await page.key("ArrowRight");
  assert.equal(await expanded("Barracks"), "true", "Right opens a branch");
  await page.key("ArrowRight");
  assert.equal(await focused(page), kids("Barracks")[0], "Right goes into an open branch");
  await page.key("ArrowDown");
  assert.equal(await focused(page), kids("Barracks")[1], "Down skips a closed branch");
  await page.key("ArrowLeft");
  assert.equal(await focused(page), "Barracks", "Left goes to the parent");
  await page.key("ArrowLeft");
  assert.equal(await expanded("Barracks"), "false", "Left closes a branch");
  await page.key("ArrowLeft");
  assert.equal(await focused(page), "Military", "Left goes up to the group");
  await page.key("End");
  assert.equal(await focused(page), "Fortifications", "End goes to the last item");
  await page.key("Home");
  assert.equal(await focused(page), "Economy", "Home goes to the first item");
  await page.key(" ");
  assert.equal(await box(page, "Economy"), "ticked", "Space ticks");
  await page.key("x");
  assert.equal(await box(page, "Economy"), "crossed", "X crosses");
  await page.key("x");
  assert.equal(await box(page, "Economy"), "empty", "X again clears");
  await page.eval(`${twisty("Economy")}.focus()`);
  await page.key("Enter");
  assert.equal(await expanded("Economy"), "true", "Enter on an arrow opens its branch");
  await page.key("ArrowDown");
  assert.equal(await page.eval(`document.activeElement === ${twisty(kids("Economy")[0])}`), true, "Down from an arrow goes to the next arrow");
  await done(page);
});

for (const [size, opts] of [["1280 px", { width: 1280, height: 900 }], ["a 375 x 667 phone", { width: 375, height: 667, mobile: true }]]) {
  test(`2.4.7, 2.4.11, 2.4.12, 2.4.13 Focus: at ${size}, every Tab stop has a ring 2 px or wider, at 3:1, uncovered`, { skip }, async () => {
    const page = await open(opts);
    await page.eval(`document.getElementById("expandAll").click(); ${tick("Bracer")}; document.activeElement.blur()`);
    const stops = [];
    const problems = [];
    for (let i = 0; i < 600; i++) {
      await page.key("Tab");
      const f = await page.eval("wcag.focus()");
      if (!f) continue;
      if (f.el === stops[0]) break;
      stops.push(f.el);
      problems.push(...f.problems);
    }
    await done(page);
    assert.ok(stops.length > 300, `only ${stops.length} Tab stops`);
    assert.deepEqual(problems, []);
  });
}

test("1.4.10 Reflow: a phone's screen holds the page and each pane scrolls, and at 400 % zoom the page scrolls", { skip }, async () => {
  const fits = async (opts) => {
    const page = await open(opts);
    await page.eval(`document.getElementById("expandAll").click()`);
    const r = await page.eval(`({ page: document.documentElement.scrollHeight <= innerHeight + 1, panes: [...document.querySelectorAll(".scroll")].map((s) => getComputedStyle(s).overflowY) })`);
    await done(page);
    return r;
  };
  assert.deepEqual(await fits({ width: 375, height: 667, mobile: true }), { page: true, panes: ["auto", "auto"] });
  assert.deepEqual(await fits({ width: 320, height: 256, mobile: true }), { page: false, panes: ["visible", "visible"] });
});

test("the page throws no errors in any of these tests", { skip }, () => {
  assert.deepEqual(pageErrors, []);
});
