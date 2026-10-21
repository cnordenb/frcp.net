const LINE_WIDTH = 120;
const ABBREVIATION = /[\p{L}\p{N}_]\.(\s|$)|\bE-|-\s/u;

export const params = new URLSearchParams(location.search);
export let data = null;
export let civBit = new Map();
export let ALL = 0n;

export const attempt = (action) => {
  try {
    return action();
  } catch {
    return null;
  }
};

export const recall = (key) => attempt(() => localStorage.getItem(key));

export const remember = (key, value) => attempt(() => (value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value)));

export const load = (url) => new Promise((resolve, reject) => {
  const request = new XMLHttpRequest();
  request.open("GET", url);
  request.onload = () => (request.status === 200 || (request.status === 0 && request.responseText)
    ? resolve(request.responseText)
    : reject(new Error(`${url} (${request.status})`)));
  request.onerror = () => reject(new Error(url));
  request.send();
});

export const fill = (template, values) => template.replace(/\{(\w+)\}/g, (whole, key) => (key in values ? String(values[key]) : whole));

export const treeKeys = (nodes, key) => nodes.flatMap((node) => [...(node[key] ? [node[key]] : []), ...treeKeys(node.kids ?? [], key)]);

export let language;
export let words;
export let tag;
export let collator;
export let plurals;
export let numbers;

export function useLanguage(code) {
  language = code;
  tag = data.languages[code].tag;
  words = data.text[code];
  collator = new Intl.Collator(tag);
  plurals = new Intl.PluralRules(tag);
  numbers = new Intl.NumberFormat(tag);
}

export const nameOf = (item) => (item.group ? words.groups[item.key] : words.items[item.key]) ?? item.key;

export const civName = (civ) => words.civs[civ] ?? civ;

export const iconFile = ({ kind, picture }) => `${data.icons.nodes}${kind}/${picture}.png`;

export const plural = (key, n) => {
  const forms = words.ui[key];
  return fill(forms[plurals.select(n)] ?? forms.other, { n: numbers.format(n) });
};

export const plain = (text) => text.toLocaleLowerCase(tag).normalize("NFD").replace(/\p{M}/gu, "").replace(/[^\p{L}\p{N}]/gu, "");

export const localeFile = (code) => `locales/${code}.json`;

export const unpack = (file) => {
  const first = Object.keys(file.languages)[0];
  return { ...file, overrides: { [first]: file.overrides }, text: { [first]: file.text } };
};

export const addLanguage = (set, code, file) => {
  set.overrides[code] = file.overrides;
  set.text[code] = file.text;
};

export function useData(raw) {
  data = unpack(JSON.parse(raw));
  civBit = new Map(data.civs.map((civ, i) => [civ, 1n << BigInt(i)]));
  ALL = (1n << BigInt(data.civs.length)) - 1n;
}

export const loadLanguage = (code) => (data.text[code]
  ? Promise.resolve()
  : load(localeFile(code)).then((raw) => addLanguage(data, code, JSON.parse(raw))));

export const loadLanguages = () => Promise.all(Object.keys(data.languages).map(loadLanguage));

export function pack(set) {
  const [first, ...others] = Object.keys(set.languages);

  const own = (key, code) => set[key][code] ?? {};

  return [
    { path: "data.json", value: Object.fromEntries(Object.entries(set)
      .map(([key, value]) => [key, ["overrides", "text"].includes(key) ? own(key, first) : value])) },
    ...others.map((code) => ({ path: localeFile(code), value: { overrides: own("overrides", code), text: own("text", code) } })),
  ];
}

export function preferredLanguage() {
  const codes = Object.keys(data.languages);
  const tags = codes.map((code) => data.languages[code].tag.toLowerCase());
  const asked = [params.get("lng"), recall("language")].find((code) => codes.includes(code));
  if (asked) return asked;
  for (const wanted of navigator.languages ?? []) {
    const lower = wanted.toLowerCase();
    const at = tags.indexOf(lower) >= 0 ? tags.indexOf(lower) : tags.findIndex((t) => t.split("-")[0] === lower.split("-")[0]);
    if (at >= 0) return codes[at];
  }
  return codes[0];
}

const bit = (civ) => {
  if (!civBit.has(civ)) throw new Error(`unknown civilisation ${civ}`);
  return civBit.get(civ);
};

export const size = (set) => {
  let n = 0;
  for (let s = set; s; s &= s - 1n) n++;
  return n;
};

export const setOf = (rule) => (rule === "all"
  ? ALL
  : rule.has
    ? rule.has.reduce((s, civ) => s | bit(civ), 0n)
    : rule.lacks.reduce((s, civ) => s & ~bit(civ), ALL));

export const civsOf = (set) => data.civs.filter((civ) => set & civBit.get(civ));

const isScalar = (value) => value === null || typeof value !== "object";

const isFlatList = (value) => Array.isArray(value) && value.every(isScalar);

const flat = (value) => (Array.isArray(value)
  ? `[${value.map(flat).join(", ")}]`
  : isScalar(value)
    ? JSON.stringify(value)
    : `{${Object.entries(value).map(([key, item]) => `${JSON.stringify(key)}: ${flat(item)}`).join(", ")}}`);

export function toJson(value, indent = "") {
  const inner = `${indent}  `;
  if (isScalar(value) || isFlatList(value)) return flat(value);
  if (Array.isArray(value)) return `[\n${value.map((item) => inner + toJson(item, inner)).join(",\n")}\n${indent}]`;
  const entries = Object.entries(value);
  const simple = entries.every(([, item]) => isScalar(item) || isFlatList(item));
  if (simple && (entries.length === 1 || indent.length + flat(value).length <= LINE_WIDTH)) return flat(value);
  const head = entries.slice(0, -1);
  const [lastKey, last] = entries[entries.length - 1];
  if (Array.isArray(last) && head.every(([, item]) => isScalar(item))) {
    const opening = head.map(([key, item]) => `${flat(key)}: ${flat(item)}, `).join("");
    return `{${opening}${flat(lastKey)}: [\n${last.map((item) => inner + toJson(item, inner)).join(",\n")}\n${indent}]}`;
  }
  return `{\n${entries.map(([key, item]) => `${inner}${flat(key)}: ${toJson(item, inner)}`).join(",\n")}\n${indent}}`;
}

const isLower = (char) => !!char && char !== char.toUpperCase() && char === char.toLowerCase();

const capitalise = (text) => text.charAt(0).toUpperCase() + text.slice(1);

export function joinLines(text, settings) {
  let joined = "";
  for (const part of text.split("<br>").map((piece) => piece.trim())) {
    if (!part) continue;
    if (!joined) joined = part;
    else if (!settings.spaces) joined += part;
    else if (joined.endsWith("-") && settings.mergeHyphens && isLower(part[0])) joined = joined.slice(0, -1) + part;
    else if (joined.endsWith("-")) joined += part;
    else joined += ` ${part}`;
  }
  return joined.replace(/\s*\/\s*/g, "/").replace(/\s+/g, " ").trim();
}

function localName(strings, node, settings, offset) {
  const label = joinLines(strings[node.name_string_id] ?? "", settings);
  if (label && !ABBREVIATION.test(label)) return capitalise(label);
  const bold = /<b>(.*?)<\/b>/.exec(strings[node.help_string_id - offset] ?? "");
  return capitalise(bold ? joinLines(bold[1], settings) : label);
}

export function availabilityOf(owners, civs) {
  const having = civs.filter((civ) => owners.has(civ));
  const lacking = civs.filter((civ) => !owners.has(civ));
  if (!lacking.length) return "all";
  return having.length <= lacking.length ? { has: having } : { lacks: lacking };
}

export function pictureOf(node, counts) {
  const [picture] = [...counts].reduce((best, each) => (each[1] > best[1] ? each : best));
  return { kind: node.use_type.toLowerCase(), picture, reach: /^(Regional|Unique)/.exec(node.node_type)?.[1].toLowerCase() ?? "common" };
}

export function missingText(set) {
  const codes = Object.keys(set.languages);
  const reference = set.text[codes[0]];
  const groups = [...new Set(treeKeys(set.tree, "group"))];
  return codes.flatMap((code) => {
    const text = set.text[code] ?? {};
    return [
      ...Object.keys(reference.ui).filter((key) => !text.ui?.[key]),
      ...groups.filter((key) => !text.groups?.[key]),
    ].map((name) => ({ language: set.languages[code].name, name }));
  });
}

function refresh(current, techtree, trees, strings) {
  const tools = current.tools;
  const messages = [];

  const say = (key, values) => messages.push(fill(tools[key], values));

  const civs = Object.keys(techtree.civs).sort();
  const nodes = new Map();
  const owners = new Map();
  const pictures = new Map();
  civs.forEach((civ, i) => {
    for (const node of [...trees[i].buildings, ...trees[i].units_techs]) {
      if (!nodes.has(node.name)) {
        nodes.set(node.name, node);
        owners.set(node.name, new Set());
        pictures.set(node.name, new Map());
      }
      if (node.node_status !== "NotAvailable") owners.get(node.name).add(civ);
      const counts = pictures.get(node.name);
      if (node.use_type === nodes.get(node.name).use_type) counts.set(node.picture_index, (counts.get(node.picture_index) ?? 0) + 1);
    }
  });
  const keys = treeKeys(current.tree, "item");
  const duplicates = [...new Set(keys.filter((key, i) => keys.indexOf(key) !== i))].sort();
  const unknown = keys.filter((key) => !nodes.has(key));
  duplicates.forEach((name) => say("duplicate", { name }));
  unknown.forEach((name) => say("unknown", { name }));
  if (duplicates.length || unknown.length) return { messages, fresh: null };

  const fresh = structuredClone(current);
  fresh.civs = civs;
  fresh.availability = Object.fromEntries(keys.map((key) => [key, availabilityOf(owners.get(key), civs)]));
  fresh.pictures = Object.fromEntries(keys.map((key) => [key, pictureOf(nodes.get(key), pictures.get(key))]));
  Object.entries(current.languages).forEach(([code, settings], i) => {
    const overrides = current.overrides[code] ?? {};
    const text = (fresh.text[code] ??= {});
    text.civs = Object.fromEntries(civs.map((civ) => [civ,
      overrides[civ] || capitalise(joinLines(strings[i][techtree.civs[civ].name_string_id] ?? "", settings)) || civ]));
    text.items = Object.fromEntries(keys.map((key) => [key,
      overrides[key] || localName(strings[i], nodes.get(key), settings, current.source.helpOffset) || key]));
  });
  const now = new Date();
  fresh.source.updated = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  civs.filter((civ) => !current.civs.includes(civ)).forEach((name) => say("civAdded", { name }));
  current.civs.filter((civ) => !civs.includes(civ)).forEach((name) => say("civRemoved", { name }));
  keys.filter((key) => key in current.availability && JSON.stringify(current.availability[key]) !== JSON.stringify(fresh.availability[key]))
    .forEach((name) => say("changed", { name }));
  keys.filter((key) => !owners.get(key).size).forEach((name) => say("nobody", { name }));
  keys.filter((key) => JSON.stringify(current.pictures[key]) !== JSON.stringify(fresh.pictures[key]))
    .forEach((name) => say("icon", { name, file: iconFile(fresh.pictures[name]) }));
  for (const [code, settings] of Object.entries(current.languages)) {
    for (const section of ["civs", "items"]) {
      for (const [key, name] of Object.entries(fresh.text[code][section])) {
        const before = current.text[code]?.[section]?.[key];
        if (before !== undefined && before !== name) say("renamed", { language: settings.name, key, name });
      }
    }
  }
  [...nodes.keys()].filter((name) => !keys.includes(name) && !current.ignore.includes(name)).sort()
    .forEach((name) => say("unplaced", { name }));
  missingText(fresh).forEach((problem) => say("missingText", problem));
  return { messages, fresh };
}

export async function fetchUpdate() {
  const get = async (path) => JSON.parse(await load(data.source.data + path));

  const techtree = await get("data.json");
  const civs = Object.keys(techtree.civs).sort();
  const [trees, strings] = await Promise.all([
    Promise.all(civs.map((civ) => get(`trees/${civ.toUpperCase()}.json`))),
    Promise.all(Object.keys(data.languages).map((code) => get(`locales/${code}/strings.json`))),
  ]);
  const { messages, fresh } = refresh(data, techtree, trees, strings);
  if (!fresh) return { messages, fresh, files: [] };
  const before = new Map(pack(data).map(({ path, value }) => [path, toJson(value)]));
  const files = pack(fresh).map(({ path, value }) => ({ path, json: toJson(value) }))
    .filter(({ path, json }) => path === "data.json" || json !== before.get(path));
  return { messages, fresh, files };
}
