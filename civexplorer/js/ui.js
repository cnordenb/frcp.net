import {
  data, attempt, recall, remember, fill, size, civsOf, preferredLanguage, loadLanguage,
  words, tag, collator, numbers, useLanguage, nameOf, civName, plural, plain, iconFile,
} from "./datahandler.js";
import {
  items, roots, include, regional, matching, setIncluded, setRegionals, rebuild, setMark, boxState, mark, fit,
  filtersOf, unmarkLine, share, chipName, chainOf,
} from "./model.js";

export const $ = (id) => document.getElementById(id);

export const clone = (id) => $(id).content.firstElementChild.cloneNode(true);

const compose = (node, template, values) => node.replaceChildren(...template.split(/(\{\w+\})/).filter(Boolean)
  .map((part) => (/^\{\w+\}$/.test(part) && part.slice(1, -1) in values ? values[part.slice(1, -1)] : part)));

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

function dress(item) {
  const own = item.group ? data.icons.groups[item.key] : data.pictures[item.key];
  if (simple || !own) return item.icon?.remove();
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

export const isOpen = (item) => item.twisty?.getAttribute("aria-expanded") === "true";

export function setOpen(item, open) {
  if (!item.twisty) return;
  item.twisty.setAttribute("aria-expanded", String(open));
  item.list.hidden = !open;
  count(item);
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

const expand = (item) => chainOf(item).forEach((each) => setOpen(each, true));

export const shown = (item) => !item.parent || (isOpen(item.parent) && shown(item.parent));

function toggle(item, kind) {
  for (const each of mark(item, kind)) for (let p = each.parent; p !== item.parent; p = p.parent) setOpen(p, true);
  update();
}

function paint() {
  for (const item of items) {
    const s = boxState(item);
    item.node.dataset.state = s || "";
    item.node.setAttribute("aria-checked", s === "has" ? "true" : s === "mixed" ? "mixed" : "false");
    item.lacking.textContent = s === "lacks" ? words.ui.lacking : "";
    item.node.classList.toggle("self", !!item.self);
  }
}

function icon(civ) {
  const img = clone("civIconTemplate");
  img.src = `${data.icons.folder}${data.icons.names[civ] ?? civ.toLowerCase()}.png`;
  return img;
}

function update() {
  const marked = fit();
  paint();
  const civs = (marked.length ? civsOf(matching) : []).map((civ) => [civName(civ), civ]);
  $("count").textContent = plural("compatible", civs.length);
  $("civs").replaceChildren(...civs.sort(([a], [b]) => collator.compare(a, b)).map(([name, civ]) => {
    const li = clone("civTemplate");
    const link = li.firstElementChild;
    link.lastElementChild.textContent = name;
    if (!simple) {
      link.href = `${data.source.url}#${civ}`;
      link.prepend(icon(civ));
    }
    return li;
  }));
  $("none").hidden = civs.length > 0;
  $("none").textContent = marked.length ? words.ui.noMatch : words.ui.start;
  items.forEach(count);
  const filters = filtersOf();
  $("ticked").hidden = !filters.length;
  $("chips").replaceChildren(...filters.map(({ item, mark: kind }) => {
    const li = clone("chipTemplate");
    const chip = li.querySelector(".chip");
    const name = chipName(item, kind);
    chip.dataset.i = item.i;
    chip.dataset.state = kind;
    li.querySelector(".chip-label").textContent = fill(words.ui[kind === "has" ? "clearHas" : "clearLacks"], { name });
    li.querySelector(".chip-name").textContent = name;
    return li;
  }));
}

let found = [];

function find() {
  const text = plain($("find").value);
  found = text ? items.filter((item) => plain(nameOf(item)).includes(text)) : [];
  for (const item of items) item.node.classList.toggle("found", found.includes(item));
  $("found").textContent = !text ? "" : found.length ? plural("found", found.length) : words.ui.noneFound;
  if (!found.length) return;
  const open = new Set();
  for (const item of found) for (let p = item.parent; p; p = p.parent) open.add(p);
  for (const item of items) setOpen(item, open.has(item));
  found[0].node.scrollIntoView({ block: "nearest" });
}

export const itemAt = (target) => items[target.closest?.(".node")?.dataset.i];

let press = null;
let touchEnded = -Infinity;
let swallowClick = false;

const endPress = () => {
  if (!press) return;
  clearTimeout(press.timer);
  press.item.node.classList.remove("pressed");
  if (press.timer) touchEnded = performance.now();
  press = null;
};

function wireTree() {
  const tree = $("tree");
  tree.addEventListener("keydown", (e) => {
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
  });
  tree.addEventListener("pointerdown", (e) => {
    swallowClick = false;
    endPress();
    const item = itemAt(e.target);
    if (!item || (e.button !== 2 && e.pointerType !== "touch")) return;
    press = { item, id: e.pointerId, x: e.clientX, y: e.clientY, ready: e.button === 2 };
    if (!press.ready) {
      press.timer = setTimeout(() => {
        press.ready = true;
        item.node.classList.add("pressed");
      }, 500);
    }
  });
  tree.addEventListener("pointermove", (e) => {
    if (press && e.pointerId === press.id && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 10) endPress();
  });
  tree.addEventListener("pointerup", (e) => {
    if (!press || e.pointerId !== press.id) return;
    const { item, ready } = press;
    endPress();
    if (ready && itemAt(e.target) === item) {
      toggle(item, "lacks");
      swallowClick = true;
    }
  });
  tree.addEventListener("pointercancel", endPress);
  tree.addEventListener("contextmenu", (e) => {
    const item = itemAt(e.target);
    if (!item) return;
    e.preventDefault();
    if (e.button === 2 || press || performance.now() - touchEnded < 600) return;
    toggle(item, "lacks");
  });
  tree.addEventListener("click", (e) => {
    const branch = items[e.target.closest(".twisty")?.dataset.i];
    if (branch) return isOpen(branch) ? setOpen(branch, false) : expand(branch);
    const item = itemAt(e.target);
    if (!item || swallowClick) return;
    toggle(item, "has");
  });
  $("expandAll").addEventListener("click", () => items.forEach((item) => setOpen(item, true)));
  $("collapseAll").addEventListener("click", () => items.forEach((item) => setOpen(item, false)));
  $("clear").addEventListener("click", () => {
    roots.forEach((item) => setMark(item, null));
    update();
  });
  $("find").addEventListener("input", find);
  $("clearFind").addEventListener("click", () => {
    $("find").value = "";
    find();
    $("find").focus();
  });
  $("find").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && found.length) found[0].node.focus();
  });
  $("chips").addEventListener("click", (e) => {
    const chip = e.target.closest(".chip");
    if (!chip) return;
    const at = [...$("chips").querySelectorAll(".chip")].indexOf(chip);
    unmarkLine(items[chip.dataset.i], chip.dataset.state);
    update();
    const chips = $("chips").querySelectorAll(".chip");
    (chips[at] || chips[at - 1] || $("civTitle")).focus();
  });
}

export const options = () => [...$("languageList").querySelectorAll("[data-language]")];

export function setMenu(open, focus) {
  $("languageButton").setAttribute("aria-expanded", String(open));
  $("languageList").hidden = !open;
  $("settings").hidden = open;
  focus?.focus();
}

function buildLanguages() {
  $("languageList").replaceChildren(...Object.entries(data.languages).map(([code, { name, tag: languageTag }]) => {
    const li = clone("languageTemplate");
    const option = li.querySelector("button");
    option.dataset.language = code;
    option.lang = languageTag;
    option.firstElementChild.textContent = name;
    return li;
  }));
}

export function setLanguage(code) {
  useLanguage(code);
  document.documentElement.lang = tag;
  for (const node of document.querySelectorAll("[data-text]")) node.textContent = words.ui[node.dataset.text];
  $("languageName").textContent = data.languages[code].name;
  for (const option of options()) option.setAttribute("aria-current", String(option.dataset.language === code));
  label();
  const [year, month] = data.source.updated.split("-").map(Number);
  $("sourceLink").href = data.source.url;
  $("sourceLink").textContent = data.source.name;
  compose($("source"), words.ui.source, {
    source: $("sourceLink"),
    date: new Intl.DateTimeFormat(tag, { year: "numeric", month: "long" }).format(new Date(year, month - 1)),
  });
  update();
  if ($("find").value) find();
}

function label() {
  for (const item of items) item.label.textContent = nameOf(item);
  share();
}

export function tick(id, on) {
  $(id).setAttribute("aria-checked", String(on));
  $(id).dataset.state = on ? "has" : "";
}

function replant() {
  plant();
  label();
  update();
  if ($("find").value) find();
}

export function setInclude(on) {
  setIncluded(on);
  remember("include", String(on));
  tick("include", on);
  replant();
}

export function setRegional(on) {
  setRegionals(on);
  remember("regional", String(on));
  tick("regional", on);
  replant();
}

export let simple = false;

export function setSimple(on) {
  simple = on;
  remember("simple", String(on));
  tick("simple", on);
  document.documentElement.classList.toggle("pictures", !on);
  items.forEach(dress);
  if (items.length) update();
}

export const flip = {
  include: () => setInclude(!include), regional: () => setRegional(!regional), simple: () => setSimple(!simple),
};

function wireOptions() {
  $("optionsButton").addEventListener("click", () => $("options").showModal());
  $("options").addEventListener("close", () => setMenu(false));
  $("settings").addEventListener("click", (e) => flip[e.target.closest(".option")?.id]?.());
  $("settings").addEventListener("keydown", (e) => {
    if (e.key !== " " || !flip[e.target.id]) return;
    e.preventDefault();
    flip[e.target.id]();
  });
}

let chosen = null;

function choose(code) {
  chosen = code;
  if (!data.text[code]) {
    loadLanguage(code).then(() => {
      if (chosen === code) choose(code);
    }, () => {
      $("loadError").hidden = false;
    });
    return;
  }
  $("loadError").hidden = true;
  setLanguage(code);
  remember("language", code);
  const search = new URLSearchParams(location.search);
  search.set("lng", code);
  attempt(() => history.replaceState(history.state, "", `?${search}${location.hash}`));
}

function wireLanguages() {
  const picker = $("language");
  const button = $("languageButton");
  button.addEventListener("click", () => setMenu($("languageList").hidden));
  $("languageList").addEventListener("click", (e) => {
    const option = e.target.closest("[data-language]");
    if (!option) return;
    choose(option.dataset.language);
    setMenu(false, button);
  });
  picker.addEventListener("keydown", (e) => {
    const list = options();
    const at = list.indexOf(document.activeElement);
    const open = !$("languageList").hidden;
    let to = null;
    if (e.key === "Escape" && open) {
      e.preventDefault();
      setMenu(false, button);
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      const current = list.findIndex((option) => option.getAttribute("aria-current") === "true");
      to = at < 0 ? current : (at + (e.key === "ArrowDown" ? 1 : -1) + list.length) % list.length;
    } else if (open && e.key === "Home") to = 0;
    else if (open && e.key === "End") to = list.length - 1;
    else return;
    e.preventDefault();
    if (!open) setMenu(true);
    list[to].focus();
  });
  picker.addEventListener("focusout", (e) => {
    if (e.relatedTarget && !picker.contains(e.relatedTarget)) setMenu(false);
  });
  document.addEventListener("pointerdown", (e) => {
    if (!picker.contains(e.target)) setMenu(false);
  });
}

export function start() {
  setIncluded(recall("include") === "true");
  tick("include", include);
  setRegionals(recall("regional") !== "false");
  tick("regional", regional);
  plant();
  buildLanguages();
  for (const node of document.querySelectorAll("[data-tool]")) node.textContent = data.tools[node.dataset.tool];
  wireTree();
  wireLanguages();
  wireOptions();
  $("rulesLink").href = data.source.rules.url;
  $("rulesLink").textContent = data.source.rules.name;
  compose($("notice"), data.source.notice, { rules: $("rulesLink") });
  const code = preferredLanguage();
  setLanguage(data.text[code] ? code : Object.keys(data.languages)[0]);
  $("top").hidden = false;
  $("content").hidden = false;
}

export function showLoadError() {
  $("loadError").hidden = false;
}
