import { data, ALL, size, civsOf, treeKeys, collator, civName, nameOf, load } from "../datahandler.js";
import { items, whole, lineOf, lineEnd, shared } from "../model.js";
import { $, setMenu, options } from "../ui.js";

export const TAG = /^[a-z]{2,3}(-[a-z0-9]{2,8})*$/i;
export const root = document.documentElement;
export const results = [];

export const check = (name, ok, detail = "") => results.push({ name, ok: Boolean(ok), detail: String(detail) });

export const expect = (name, offenders) => check(name, !offenders.length, offenders.slice(0, 5).join("; "));

export const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const loaded = (images) => Promise.race([Promise.all(images.map((img) => img.complete || new Promise((done) => ["load", "error"]
  .forEach((type) => img.addEventListener(type, done))))), wait(10000)]);

export const phone = () => matchMedia("(width < 720px) and (height > 639px)").matches;

export const spans = () => (phone()
  ? getComputedStyle(document.querySelector(".foot")).display === "none"
  : Math.abs(document.querySelector(".foot").getBoundingClientRect().width - document.querySelector(".panes").getBoundingClientRect().width) < 1);

export const need = (ok, problem) => (ok ? [] : [problem]);

export const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

export const codes = () => Object.keys(data.languages);

export const keys = () => treeKeys(data.tree, "item");

export const describe = (el) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${el.classList[0] ? `.${el.classList[0]}` : ""}${
  el.closest(".node") && !el.id ? ` (${el.closest(".node").textContent.trim().slice(0, 40)})` : ""}`;

export const rendered = (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden" && !el.closest(".sr-only");

export const everything = () => [...document.body.querySelectorAll("*")].filter(rendered);

export const styles = (el) => [getComputedStyle(el), getComputedStyle(el, "::before"), getComputedStyle(el, "::after"), getComputedStyle(el, "::marker")];

export const pictured = (el) => styles(el).some((style) => style.backgroundImage !== "none" || style.listStyleImage !== "none"
  || style.borderImageSource !== "none" || /url\(/.test(style.content) || /url\(/.test(style.cursor));

export const pictures = () => [...document.querySelectorAll("img"), root, document.body, ...everything()]
  .filter((el) => el.tagName === "IMG" || pictured(el)).map(describe);

export const picturesOn = () => [describe(root), "body", describe($("optionsButton"))]
  .every((name) => pictures().includes(name));

export const simpleSpot = () => {
  const box = $("simple").querySelector(".box").getBoundingClientRect();
  return `${box.left},${box.top}`;
};

export const simpleTicked = (on) => $("simple").getAttribute("aria-checked") === String(on)
  && $("simple").dataset.state === (on ? "has" : "");

export const civLinks = () => $("civs").children.length > 0 && $("civs").querySelectorAll("a[href]").length;

export const focusables = () => [...document.querySelectorAll("a[href], button, input, select, textarea, [tabindex]")]
  .filter((el) => el.tabIndex >= 0 && !el.disabled && rendered(el));

const textOf = (node) => [...node.childNodes].map((child) => (child.nodeType === Node.TEXT_NODE
  ? child.textContent
  : child.nodeType === Node.ELEMENT_NODE && child.getAttribute("aria-hidden") !== "true" ? textOf(child) : "")).join(" ");

export const tidy = (text) => text.replace(/\s+/g, " ").trim();

export const nameFor = (el) => {
  const ids = el.getAttribute("aria-labelledby");
  if (ids) return tidy(ids.split(/\s+/).map((id) => ($(id) ? textOf($(id)) : "")).join(" "));
  if (el.getAttribute("aria-label")) return tidy(el.getAttribute("aria-label"));
  if (el.labels?.length) return tidy([...el.labels].map(textOf).join(" "));
  return tidy(textOf(el));
};

export const squash = (text) => text.toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

export const visibleTexts = (el) => {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const texts = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.textContent.trim() && rendered(node.parentElement)) texts.push(node.textContent);
  }
  return texts;
};

export const keyDown = (target, key) => target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));

export const tap = (el) => {
  el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: "mouse", button: 0 }));
  el.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerType: "mouse", button: 0 }));
  el.click();
};

export const type = (text) => {
  $("find").value = text;
  $("find").dispatchEvent(new Event("input", { bubbles: true }));
};

export const pick = (code) => {
  if (!$("options").open) $("optionsButton").click();
  if ($("languageList").hidden) $("languageButton").click();
  options().find((option) => option.dataset.language === code).click();
};

export const reset = () => {
  type("");
  $("clear").click();
  $("collapseAll").click();
  setMenu(false);
  if ($("options").open) $("options").close();
  document.activeElement?.blur();
};

export const beside = () => {
  const box = $("find").getBoundingClientRect();
  const note = $("found").getBoundingClientRect();
  return note.left >= box.right - 0.5 && note.top < box.bottom && note.bottom > box.top
    && note.height < 1.5 * parseFloat(getComputedStyle($("found")).lineHeight);
};

export const listed = () => [...$("civs").children].map((li) => li.textContent);

export const expected = (set) => civsOf(set).map(civName).sort(collator.compare);

export const below = (item, top) => {
  for (let p = item.parent; p; p = p.parent) if (p === top) return true;
  return false;
};

export const itemAbove = (item) => {
  for (let p = item.parent; p; p = p.parent) if (!p.group) return true;
  return false;
};

const KINDS = { unit: "unit", building: "building", technology: "tech" };

const rgb = (hex) => `rgb(${[0, 2, 4].map((at) => parseInt(hex.slice(at, at + 2), 16)).join(", ")})`;

export async function edges() {
  const [head, ...rows] = (await load(`${data.icons.nodes}colour_key.csv`)).trim().split(/\r?\n/).map((line) => line.trim().split(","));
  return new Map(rows.flatMap(([reach, ...colours]) => colours.map((hex, i) => [`${KINDS[head[i + 1]]} ${reach}`, rgb(hex)])));
}

export const shownKeys = () => items.filter((item) => !item.group).map((item) => item.key);

export const uniqueKeys = () => {
  const under = (nodes, inside) => nodes.flatMap((node) => [
    ...(inside && node.item ? [node.item] : []), ...under(node.kids ?? [], inside || node.unique === true),
  ]);

  return new Set(under(data.tree, false));
};

export const regionalKeys = () => new Set(keys().filter((key) => data.pictures[key].reach === "regional"));

export const outside = (nodes, regional) => nodes.flatMap((node) => (regional.has(node.item)
  ? []
  : [...(node.item ? [node.item] : []), ...outside(node.kids ?? [], regional)]));

export const keptPath = () => items.find((item) => !item.group && !item.kids.length && item.parent && data.pictures[item.key].reach !== "regional").path;

export const byPath = (path) => items.find((item) => item.path === path);


export function fixtures() {
  const leaves = items.filter((item) => !item.group && !item.kids.length);
  const partial = leaves.find((item) => size(item.set) > 1 && size(item.set) < data.civs.length / 2 && item.parent?.parent);
  const other = leaves.find((item) => item !== partial && size(item.set & partial.set) > 0 && size(partial.set & ~item.set & ALL) > 0);
  const third = leaves.find((item) => ![partial, other].includes(item) && size(partial.set & ~other.set & ~item.set & ALL) > 0);

  const underAll = (item) => item.kids.reduce((s, kid) => s & whole(kid), ALL);

  const without = (item) => underAll(item) & ~item.set & ALL;

  return {
    leaves, partial, other, third, underAll, without,
    branch: items.find((item) => !item.group && !item.optional && item.kids.length > 1 && !shared.has(nameOf(item)) && !itemAbove(item)),
    group: items.find((item) => item.group && !item.parent && item.kids.length),
    line: items.find((item) => lineOf(item)[0] === item && lineOf(item).length > 2
      && lineOf(item).every((each) => !shared.has(nameOf(each)) && !each.optional)),
    upgraded: items.find((item) => lineOf(item)[0] === item && lineEnd(item) && size(item.set) > size(item.all) && item.all === lineEnd(item).set),
    loose: items.find((item) => item.optional && size(without(item)) > 0),
    headed: items.find((item) => !item.group && !itemAbove(item) && !item.upgrades && item.kids.length === 1 && lineEnd(item)),
    tower: items.find((item) => item.upgrades && lineEnd(item)),
    uneven: items.find((item) => !item.group && itemAbove(item) && item.kids.length === 1 && size(item.kids[0].set) === size(item.set)
      && lineEnd(item) && size(lineEnd(item).set) !== size(item.set)),
  };
}
