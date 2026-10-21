import { data, ALL, setOf, size, words, nameOf, fill } from "./datahandler.js";

export const items = [];
export const roots = [];
export let include = false;
export let matching = 0n;
export let shared = new Set();

export const setIncluded = (on) => {
  include = on;
};

function collect(nodes, parent) {
  for (const node of nodes) {
    if (node.item && !(node.item in data.availability)) throw new Error(`no availability for ${node.item}`);
    const key = node.item ?? node.group;
    const item = {
      i: items.length, key, path: parent ? `${parent.path}|${key}` : key, group: !node.item,
      set: node.item ? setOf(data.availability[node.item]) : ALL, optional: node.optional === true, upgrades: node.upgrades === true,
      self: null, chosen: null, kids: [], parent,
    };
    (parent ? parent.kids : roots).push(item);
    items.push(item);
    collect(node.kids ?? [], item);
  }
}

export const whole = (item) => (item.all ??= item.kids.reduce((s, kid) => s & whole(kid), item.set));

export function prune(nodes) {
  return nodes.flatMap((node) => {
    if (node.unique) return [];
    const kids = prune(node.kids ?? []);
    const rule = node.item && data.availability[node.item];
    const civs = rule ? size(setOf(rule)) : 0;
    if (!kids.length && (node.group || civs === 1 || civs === data.civs.length)) return [];
    return [{ ...node, kids }];
  });
}

export function rebuild() {
  const chosen = new Map(items.map((item) => [item.path, item.chosen]));
  items.length = 0;
  roots.length = 0;
  collect(include ? data.tree : prune(data.tree), null);
  items.forEach(whole);
  for (const item of items) item.chosen = chosen.get(item.path) ?? null;
}

export function setMark(item, mark) {
  if (!item.group) item.chosen = mark;
  for (const kid of item.kids) setMark(kid, mark);
}

export function settle() {
  const full = new Set();
  for (const item of [...items].reverse()) {
    const under = item.kids.every((kid) => full.has(kid));
    if (!item.group) item.self = item.kids.length && under && !item.optional ? "has" : item.chosen;
    if (under && (item.group || item.self === "has")) full.add(item);
  }
}

export function state(item) {
  const parts = item.kids.map(state);
  if (!item.group) parts.push(item.self);
  return parts.every((part) => part === parts[0]) ? parts[0] : "mixed";
}

export const isUnitOrTech = (item) => {
  for (let p = item.parent; p; p = p.parent) if (!p.group) return !item.group;
  return false;
};

const descendants = (item) => item.kids.flatMap((kid) => [kid, ...descendants(kid)]);

function sameCount(item) {
  const line = [item];
  while (line.at(-1).kids.length === 1 && !line.at(-1).kids[0].group && size(line.at(-1).kids[0].set) === size(item.set)) line.push(line.at(-1).kids[0]);
  return line;
}

export function mark(item, kind) {
  const unit = isUnitOrTech(item);
  const next = (unit ? item.self : state(item)) === kind ? null : kind;
  if (unit && next) {
    if (next === "lacks") descendants(item).filter((each) => each.chosen === "has").forEach((each) => { each.chosen = null; });
    sameCount(item).forEach((each) => { each.chosen = next; });
  } else setMark(item, next);
  settle();
  for (let p = item.parent; p; p = p.parent) if (p.self === "has" && p.chosen === "lacks") p.chosen = null;
  return next ? [...chainOf(item), ...(unit ? sameCount(item) : descendants(item))] : [];
}

export function boxState(item) {
  if (!isUnitOrTech(item) || !item.self) return state(item);
  return descendants(item).every((each) => !each.self || each.self === item.self) ? item.self : "mixed";
}

export function fit() {
  settle();
  const marked = items.filter((item) => item.self);
  matching = marked.reduce((m, item) => m & (item.self === "has" ? item.set : ~item.set), ALL);
  return marked;
}

export const markOf = (item) => (["has", "lacks"].includes(state(item)) ? state(item) : item.self);

export const lineEnd = (item) => {
  let end = item;
  while (end.kids.length === 1 && !end.kids[0].group) end = end.kids[0];
  return item.group || end.kids.length ? null : end;
};

export function lineOf(item) {
  let root = item;
  while (root.parent && !root.parent.group && root.parent.kids.length === 1) root = root.parent;
  if (!lineEnd(root)) return [item];
  const line = [root];
  while (line.at(-1).kids.length) line.push(line.at(-1).kids[0]);
  return line;
}

export function chainOf(item) {
  const chain = [item];
  while (chain.at(-1).kids.length === 1) chain.push(chain.at(-1).kids[0]);
  return chain;
}

export function filtersOf() {
  const marked = items.filter((item) => markOf(item) && !(item.parent && state(item.parent) === markOf(item)))
    .map((item) => ({ item, mark: markOf(item), line: lineOf(item) }));

  const depth = ({ item, line }) => line.indexOf(item);

  return marked.filter((filter) => !marked.some((other) => other !== filter && other.mark === filter.mark && other.line[0] === filter.line[0]
    && (filter.mark === "has" ? depth(other) > depth(filter) : depth(other) < depth(filter))));
}

export function share() {
  const seen = new Map();
  for (const item of items) seen.set(nameOf(item), (seen.get(nameOf(item)) ?? 0) + 1);
  shared = new Set([...seen].filter(([, n]) => n > 1).map(([name]) => name));
}

export function chipName(item, kind) {
  const named = (kind === "has" && (isUnitOrTech(item) || item.upgrades) && lineOf(item).findLast((each) => each.self === "has")) || item;
  const name = shared.has(nameOf(named)) && named.parent ? fill(words.ui.inParent, { name: nameOf(named), parent: nameOf(named.parent) }) : nameOf(named);
  return named.kids.length && state(item) === "has" ? fill(words.ui.full, { name }) : name;
}

export function unmarkLine(item, kind) {
  const line = lineOf(item);
  if (line.length > 1) line.filter((each) => each.self === kind).forEach((each) => { each.chosen = null; });
  else setMark(item, null);
}
