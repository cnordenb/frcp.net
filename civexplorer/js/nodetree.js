import { data, words, numbers, size, plural, fill, nameOf, plain, iconFile } from "./datahandler.js";
import { items, roots, matching, rebuild, setMark, boxState, mark, fit, unmarkLine, chainOf } from "./model.js";
import { $, clone, simple, compose, label, listCivs, listFilters } from "./stringbuilder.js";

let found = [];
let press = null;
let touchEnded = -Infinity;
let swallowClick = false;

export const isOpen = (item) => item.twisty?.getAttribute("aria-expanded") === "true";

export const shown = (item) => !item.parent || (isOpen(item.parent) && shown(item.parent));

export const itemAt = (target) => items[target.closest?.(".node")?.dataset.i];

export function dress(item) {
  const own = item.group ? data.icons.groups[item.key] : data.pictures[item.key];
  if (simple() || !own) return item.icon?.remove();
  item.icon ??= Object.assign(clone("nodeIconTemplate"), { src: iconFile(own) });
  Object.assign(item.icon.dataset, own);
  item.label.before(item.icon);
}

function build(list, ul) {
  for (const item of list) {
    const li = clone("itemTemplate");
    const twisty = li.querySelector(".twisty");
    const kids = li.querySelector("ul");
    item.node = li.querySelector(".node");
    item.label = li.querySelector(".name");
    item.lacking = li.querySelector(".lacking");
    item.count = li.querySelector(".count");
    item.civCount = li.querySelector(".civ-count");
    item.node.dataset.i = item.i;
    item.node.classList.toggle("group", item.group);
    item.label.id = `t${item.i}`;
    if (item.kids.length) {
      li.querySelector(".gap").remove();
      item.twisty = twisty;
      twisty.dataset.i = item.i;
      twisty.setAttribute("aria-controls", `k${item.i}`);
      twisty.setAttribute("aria-labelledby", `t${item.i}`);
      item.list = kids;
      kids.id = `k${item.i}`;
      build(item.kids, kids);
    } else {
      twisty.remove();
      kids.remove();
    }
    ul.append(li);
  }
}

const endPress = () => {
  if (!press) return;
  clearTimeout(press.timer);
  press.item.node.classList.remove("pressed");
  if (press.timer) touchEnded = performance.now();
  press = null;
};

function plant() {
  const open = new Set(items.filter(isOpen).map((item) => item.path));
  endPress();
  found = [];
  rebuild();
  $("tree").replaceChildren();
  build(roots, $("tree"));
  items.forEach(dress);
  for (const item of items) if (open.has(item.path)) setOpen(item, true);
}

function count(item) {
  const own = size(matching & (item.group ? item.all : item.set));
  const all = size(matching & item.all);
  if (item.group || !item.kids.length || isOpen(item)) {
    item.count.textContent = numbers.format(own);
    item.civCount.textContent = plural("civCount", own);
    return;
  }
  compose(item.count, words.ui.range, { own: numbers.format(own), all: numbers.format(all) });
  item.civCount.textContent = fill(words.ui.civRange, { own: plural("civCount", own), all: plural("civCount", all) });
}

export function setOpen(item, open) {
  if (!item.twisty) return;
  item.twisty.setAttribute("aria-expanded", String(open));
  item.list.hidden = !open;
  count(item);
}

const expand = (item) => chainOf(item).forEach((each) => setOpen(each, true));

function paint() {
  for (const item of items) {
    const s = boxState(item);
    item.node.dataset.state = s || "";
    item.node.setAttribute("aria-checked", s === "has" ? "true" : s === "mixed" ? "mixed" : "false");
    item.lacking.textContent = s === "lacks" ? words.ui.lacking : "";
    item.node.classList.toggle("self", !!item.self);
  }
}

export function update() {
  const marked = fit();
  paint();
  listCivs(marked.length > 0);
  items.forEach(count);
  listFilters();
}

function toggle(item, kind) {
  for (const each of mark(item, kind)) for (let p = each.parent; p && p !== item.parent; p = p.parent) setOpen(p, true);
  update();
}

function reveal(node) {
  const pane = node.closest(".scroll");
  const view = pane.getBoundingClientRect();
  const row = node.getBoundingClientRect();
  pane.scrollTop += Math.min(0, row.top - view.top) + Math.max(0, row.bottom - view.bottom);
}

export function find() {
  const text = plain($("find").value);
  found = text ? items.filter((item) => plain(nameOf(item)).includes(text)) : [];
  for (const item of items) item.node.classList.toggle("found", found.includes(item));
  $("found").textContent = !text ? "" : found.length ? plural("found", found.length) : words.ui.noneFound;
  if (!found.length) return;
  const open = new Set();
  for (const item of found) for (let p = item.parent; p; p = p.parent) open.add(p);
  for (const item of items) setOpen(item, open.has(item));
  reveal(found[0].node);
}

export function replant() {
  plant();
  label();
  update();
  if ($("find").value) find();
}

function onKey(e) {
  const item = items[e.target.dataset.i];
  if (!item || e.altKey || e.ctrlKey || e.metaKey) return;
  const kind = e.target === item.node && { " ": "has", x: "lacks", X: "lacks" }[e.key];
  if (kind) {
    e.preventDefault();
    toggle(item, kind);
    return;
  }
  if (e.shiftKey) return;
  const rows = items.filter(shown);
  const at = rows.indexOf(item);
  let to = null;
  if (e.key === "ArrowDown") to = rows[at + 1];
  else if (e.key === "ArrowUp") to = rows[at - 1];
  else if (e.key === "Home") to = rows[0];
  else if (e.key === "End") to = rows[rows.length - 1];
  else if (e.key === "ArrowRight") isOpen(item) ? (to = item.kids[0]) : expand(item);
  else if (e.key === "ArrowLeft") isOpen(item) ? setOpen(item, false) : (to = item.parent);
  else return;
  e.preventDefault();
  if (to) (e.target === item.twisty && to.twisty ? to.twisty : to.node).focus();
}

function onPress(e) {
  swallowClick = false;
  endPress();
  const item = itemAt(e.target);
  if (!item || (e.button !== 2 && e.pointerType !== "touch")) return;
  press = { item, id: e.pointerId, x: e.clientX, y: e.clientY, ready: e.button === 2 };
  if (press.ready) return;
  press.timer = setTimeout(() => {
    press.ready = true;
    item.node.classList.add("pressed");
  }, 500);
}

function onRelease(e) {
  if (!press || e.pointerId !== press.id) return;
  const { item, ready } = press;
  endPress();
  if (!ready || itemAt(e.target) !== item) return;
  toggle(item, "lacks");
  swallowClick = true;
}

function onMenu(e) {
  const item = itemAt(e.target);
  if (!item) return;
  e.preventDefault();
  if (e.button === 2 || press || performance.now() - touchEnded < 600) return;
  toggle(item, "lacks");
}

function onClick(e) {
  const branch = items[e.target.closest(".twisty")?.dataset.i];
  if (branch) return isOpen(branch) ? setOpen(branch, false) : expand(branch);
  const item = itemAt(e.target);
  if (item && !swallowClick) toggle(item, "has");
}

function onChip(e) {
  const chip = e.target.closest(".chip");
  if (!chip) return;
  const at = [...$("chips").querySelectorAll(".chip")].indexOf(chip);
  unmarkLine(items[chip.dataset.i], chip.dataset.state);
  update();
  const chips = $("chips").querySelectorAll(".chip");
  (chips[at] || chips[at - 1] || $("civTitle")).focus();
}

function wireTools() {
  const swap = (from, to, open) => $(from).addEventListener("click", () => {
    const focused = document.activeElement === $(from);
    items.forEach((item) => setOpen(item, open));
    if (focused && !simple()) $(to).focus();
  });

  swap("expandAll", "collapseAll", true);
  swap("collapseAll", "expandAll", false);
  $("clear").addEventListener("click", () => {
    roots.forEach((item) => setMark(item, null));
    update();
  });
  $("find").addEventListener("input", find);
  $("find").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && found.length) found[0].node.focus();
  });
  $("clearFind").addEventListener("click", () => {
    $("find").value = "";
    find();
    $("find").focus();
  });
  $("chips").addEventListener("click", onChip);
}

export function startTree() {
  const tree = $("tree");
  plant();
  tree.addEventListener("keydown", onKey);
  tree.addEventListener("pointerdown", onPress);
  tree.addEventListener("pointermove", (e) => {
    if (press && e.pointerId === press.id && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 10) endPress();
  });
  tree.addEventListener("pointerup", onRelease);
  tree.addEventListener("pointercancel", endPress);
  tree.addEventListener("contextmenu", onMenu);
  tree.addEventListener("click", onClick);
  wireTools();
}
