import {
  data, load, setOf, civsOf, pack, unpack, addLanguage, localeFile, toJson, availabilityOf, pictureOf, fromExtra,
  joinLines, missingText,
} from "../datahandler.js";
import { TAG, check, expect, same, codes, keys } from "./helpers.js";

const slash = "/";
const here = new URL(".", location.href).href;

export async function scripts() {
  const files = new Map();

  const visit = async (url, dynamic) => {
    if (files.has(url)) {
      files.get(url).dynamic &&= dynamic;
      return;
    }
    const file = { path: url.slice(here.length), dynamic, code: "", imports: [] };
    files.set(url, file);
    file.code = await load(url);
    const found = [
      ...[...file.code.matchAll(/^import\b[^;]*?\bfrom\s*"([^"]+)";/gm)]
        .map(([, specifier]) => ({ specifier, lazy: false })),
      ...[...file.code.matchAll(/\bimport\(\s*"([^"]+)"\s*\)/g)].map(([, specifier]) => ({ specifier, lazy: true })),
    ];
    for (const { specifier, lazy } of found) {
      const target = new URL(specifier, url).href;
      file.imports.push({ specifier, target });
      await visit(target, dynamic || lazy);
    }
  };

  await visit(new URL("script.js", here).href, false);
  return [...files.values()];
}

const FILE_LIMIT = 400;
const FUNCTION_LIMIT = 60;
const LINE_LIMIT = 120;
const TICK = "`";

const linesOfCode = (code) => code.split("\n").filter((line) => line.trim()).length;

const regexMayStart = (last, word) => !last || /[(,=:[!&|?{};+\-*%<>~^]/.test(last)
  || ["return", "typeof", "case"].includes(word);

function closing(code, at) {
  let end = at + 1;
  if (code[at] !== "/") {
    while (end < code.length && code[end] !== code[at]) end += code[end] === "\\" ? 2 : 1;
    return end;
  }
  for (let set = false; end < code.length && (set || code[end] !== "/"); end++) {
    if (code[end] === "\\") end++;
    else if (code[end] === "[" || code[end] === "]") set = code[end] === "[";
  }
  return end;
}

function blanked(code) {
  const out = code.split("");
  const stack = [{ template: false, depth: 0 }];
  let last = "";
  let word = "";

  const blank = (from, to) => {
    for (let k = from; k < to; k++) if (out[k] !== "\n") out[k] = " ";
  };

  for (let i = 0; i < code.length; i++) {
    const c = code[i];
    const top = stack.at(-1);
    if (top.template) {
      if (c === TICK) {
        stack.pop();
        last = c;
      } else if (c === "$" && code[i + 1] === "{") {
        blank(i, i + 2);
        stack.push({ template: false, depth: 0 });
        i++;
      } else {
        blank(i, c === "\\" ? i + 2 : i + 1);
        if (c === "\\") i++;
      }
      continue;
    }
    if (/\s/.test(c)) continue;
    if (c === "\"" || c === "'" || (c === "/" && regexMayStart(last, word))) {
      const end = closing(code, i);
      blank(i + 1, end);
      i = end;
    } else if (c === TICK) stack.push({ template: true, depth: 0 });
    else if (c === "{") top.depth++;
    else if (c === "}" && top.depth === 0 && stack.length > 1) {
      blank(i, i + 1);
      stack.pop();
    } else if (c === "}") top.depth--;
    word = /[\w$]/.test(c) ? (/[\w$]/.test(code[i - 1] ?? "") ? word : "") + c : "";
    last = c;
  }
  return out.join("");
}

function opensBody(text, at, paren) {
  const before = text.slice(Math.max(0, at - 200), at).trimEnd();
  if (before.endsWith("=>")) return true;
  if (!before.endsWith(")")) return false;
  const word = /([\w$]+)\s*$/.exec(text.slice(Math.max(0, paren - 60), paren))?.[1];
  return !!word && !/^(if|for|while|switch|catch|with)$/.test(word);
}

function functionsOf(code) {
  const text = blanked(code);
  const parens = [];
  const braces = [];
  const found = [];
  let paren = -1;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "(") parens.push(i);
    else if (text[i] === ")") paren = parens.pop();
    else if (text[i] === "{") braces.push({ at: i, body: opensBody(text, i, paren) });
    else if (text[i] === "}") {
      const brace = braces.pop();
      if (brace?.body) found.push({ from: brace.at, to: i });
    }
  }
  return found;
}

function longFunctions(code, lines) {
  const starts = [0, ...[...code.matchAll(/\n/g)].map((match) => match.index + 1)];
  const lineOf = (at) => starts.findLastIndex((start) => start <= at) + 1;

  const nameOf = (line) => /(?:function\s*|const\s+|let\s+)([\w$]+)/.exec(lines[line - 1])?.[1] ?? "a function";

  const sizeOf = ({ from, to }) => linesOfCode(lines.slice(lineOf(from) - 1, lineOf(to)).join("\n"));

  return functionsOf(code).filter((each) => sizeOf(each) > FUNCTION_LIMIT)
    .map((each) => `${nameOf(lineOf(each.from))} at line ${lineOf(each.from)} has ${sizeOf(each)} lines of code`);
}

function sizeProblems(page, sheet, files) {
  const sources = [
    { path: "index.html", code: page.split("<!-- Code injected by live-server -->")[0] },
    { path: "style.css", code: sheet },
    ...files,
  ].map(({ path, code }) => ({ path, code, lines: code.split("\n").map((line) => line.replace(/\r$/, "")) }));

  const wide = (lines) => lines.flatMap((line, i) => (line.length > LINE_LIMIT ? [i + 1] : []));

  const widths = ({ path, lines }) => `${path} has ${wide(lines).length} line${wide(lines).length === 1 ? "" : "s"} `
    + `over ${LINE_LIMIT} characters, from line ${wide(lines)[0]}`;

  return [
    ...sources.filter(({ code }) => linesOfCode(code) > FILE_LIMIT)
      .map(({ path, code }) => `${path} has ${linesOfCode(code)} lines of code`),
    ...sources.filter(({ path }) => path.endsWith(".js"))
      .flatMap(({ path, code, lines }) => longFunctions(code, lines).map((problem) => `${path}: ${problem}`)),
    ...sources.filter(({ path, lines }) => path.endsWith(".js") && wide(lines).length).map(widths),
  ];
}

const MARKUP = [
  /\.style\b(?!\.setProperty\("--\w+", [^"]*\))\s*[.=[]/, /setAttribute\(\s*["']style/,
  /\.(innerHTML|outerHTML|insertAdjacentHTML)\b/, /createElement\s*\(/, /document\.write/,
];
const PAGE_FREE = ["script.js", "js/datahandler.js", "js/model.js"];

function badImages(page, sheet) {
  const outside = page.replace(/<template\b[\s\S]*?<\/template>/gi, "");

  const misplaced = ([, selector, body]) => [...body.matchAll(/url\(\s*"?([^")]*)/gi)].some(([, src]) => (
    selector.trim() === "@font-face"
      ? !/^assets\/fonts\/[A-Za-z0-9-]+\.ttf$/.test(src)
      : !selector.split(/,(?![^(]*\))/).every((part) => /^(html)?\.pictures\b/.test(part.trim()))
        || !/^assets\/images\/([a-z0-9]+\/)*[a-z0-9_]+\.webp$/.test(src)));

  return /<(svg|canvas|picture|video|audio|object|embed)\b/i.test(page) || /<img\b/i.test(outside)
    || !/<link rel="icon" href="data:,"/.test(page) || !data.icons.favicon.startsWith("assets/images/")
    || [...sheet.matchAll(/([^{}]*)\{([^{}]*)\}/g)].some(misplaced);
}

export function sourceTests(page, sheet, files) {
  const failing = (cases) => Object.entries(cases).filter(([, bad]) => bad).map(([name]) => name);

  const named = (test) => files.filter(test).map(({ path }) => path);

  const testing = ({ path }) => path.startsWith("js/tests/");

  const outward = ({ specifier, target }) => !specifier.startsWith(".") || !target.startsWith(`${here}js/`);

  expect("rules: no comments in the code", [
    ...(page.includes("<!--") && !page.includes("<!-- Code injected by live-server -->") ? ["index.html"] : []),
    ...(sheet.includes(slash + "*") ? ["style.css"] : []),
    ...named(({ code }) => code.includes(slash + "*") || code.includes(slash + slash)),
  ]);
  expect("rules: the scripts have no CSS or HTML, and only hand numbers to CSS custom properties",
    named(({ code }) => MARKUP.some((pattern) => pattern.test(code))));
  expect("rules: script.js is in the main folder and every other script in js/, scripts import only scripts in js/, "
    + "and the tests are in js/tests/ and load only when testing", [
    ...named(({ path }) => !/^(script\.js|js\/([a-z]+\/)*[a-z]+\.js)$/.test(path)),
    ...files.flatMap(({ path, imports }) => imports.filter(outward)
      .map(({ specifier }) => `${path} imports ${specifier}`)),
    ...named((file) => testing(file) !== file.dynamic),
  ]);
  expect(`rules: no file has over ${FILE_LIMIT} lines of code, no function over ${FUNCTION_LIMIT}, `
    + `and no line of a script over ${LINE_LIMIT} characters`, sizeProblems(page, sheet, files));
  expect("rules: script.js, datahandler.js and model.js never touch the page, "
    + "and only datahandler.js and the tests load or store data", [
    ...named((file) => PAGE_FREE.includes(file.path)
      && /\b(document|window)\b|getElementById|querySelector|addEventListener/.test(file.code)),
    ...named((file) => !testing(file) && file.path !== "js/datahandler.js"
      && /XMLHttpRequest|localStorage|\bfetch\s*\(/.test(file.code)),
  ]);
  expect("rules: images only from assets/images/, in templates or CSS, only without Simple UI, fonts only from "
    + "assets/fonts/, and no sounds, animations or dependencies in the sources", failing({
    images: badImages(page, sheet),
    sounds: files.some(({ code }) => /new\s+(Audio|AudioContext)\b/.test(code)),
    animations: /@keyframes|\banimation|\btransition/i.test(sheet)
      || files.some(({ code }) => /\.animate\s*\(/.test(code)),
    dependencies: files.some(({ code }) => /\brequire\s*\(/.test(code)) || /@import/i.test(sheet),
  }));
  expect("rules: the scripts hold no game data", [...data.civs, ...keys()]
    .filter((name) => files.some(({ code }) => code.includes(JSON.stringify(name)))));
}

export function textTests() {
  const all = keys();
  expect("data: each language has all of the page's text",
    missingText(data).map(({ language, name }) => `${language}: ${name}`));
  expect("data: each language names every item and civilisation", codes().flatMap((code) => [
    ...all.filter((key) => !data.text[code].items?.[key]),
    ...data.civs.filter((civ) => !data.text[code].civs?.[civ]),
  ].map((key) => `${code}: ${key}`)));
}

export function tagTests() {
  expect("data: each language has a name and a valid tag",
    codes().filter((code) => !data.languages[code].name || !TAG.test(data.languages[code].tag)));
}

const KNOWN = ["item", "group", "kids", "unique", "lines", "excludes"];

const alike = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function badExtras(all) {
  if (!data.extras || typeof data.extras !== "object") return ["extras"];

  const kept = (key, extra) => {
    const { node, owners, counts } = fromExtra(key, extra);
    return alike(availabilityOf(owners, data.civs), data.availability[key])
      && alike(pictureOf(node, counts), data.pictures[key]);
  };

  return Object.entries(data.extras).filter(([key, extra]) => !all.includes(key) || !Number.isInteger(extra.nameId)
    || !Array.isArray(extra.has) || extra.has.some((civ) => !data.civs.includes(civ)) || !kept(key, extra))
    .map(([key]) => `extras: ${key}`);
}

function treeTests(all) {
  expect("data: each item is in the tree once", all.filter((key, i) => all.indexOf(key) !== i));

  const nodes = (list) => list.flatMap((node) => [node, ...nodes(node.kids ?? [])]);

  const odd = (node) => Object.keys(node).some((key) => !KNOWN.includes(key))
    || ["unique", "lines"].some((flag) => flag in node && (node[flag] !== true || !node.group))
    || ("excludes" in node && (!node.item || node.excludes === node.item || !all.includes(node.excludes)));

  expect("data: the tree uses only item, group, kids, unique, lines and excludes, only groups are unique or lines, "
    + "marked with true, and an item excludes another item",
    nodes(data.tree).filter(odd).map((node) => node.item ?? node.group));
  const undescribed = all.filter((key) => {
    const rule = data.availability[key];
    const { kind, picture, reach } = data.pictures[key] ?? {};
    return !rule || (rule !== "all" && (rule.has ?? rule.lacks ?? [null]).some((civ) => !data.civs.includes(civ)))
      || !kind || !Number.isInteger(picture) || !reach;
  });
  expect("data: each item says which civilisations have it, naming only known ones, and which icon it has, as "
    + "extras says for the items added by hand", [...undescribed, ...badExtras(all)]);
}

function textDataTests(all) {
  const languages = codes();

  const holes = (value) => [...new Set(JSON.stringify(value ?? "").match(/\{\w+\}/g) ?? [])].sort().join();

  expect("data: counted texts have an 'other' form", languages.flatMap((code) => Object.entries(data.text[code].ui)
    .filter(([, value]) => typeof value === "object" && !value.other).map(([key]) => `${code}: ${key}`)));
  expect("data: translations keep the same placeholders", languages.flatMap((code) => Object
    .entries(data.text[languages[0]].ui).filter(([key, english]) => holes(english) !== holes(data.text[code].ui[key]))
    .map(([key]) => `${code}: ${key}`)));
  expect("data: overrides name known items and civilisations", languages.flatMap((code) => Object
    .keys(data.overrides[code] ?? {}).filter((key) => !all.includes(key) && !data.civs.includes(key))
    .map((key) => `${code}: ${key}`)));
  expect("data: the source, the tool texts and the ignore list are filled in", [
    ...(data.source.name && data.source.url && data.source.data && Number.isInteger(data.source.helpOffset)
      && /^\d{4}-\d{2}$/.test(data.source.updated) ? [] : ["source"]),
    ...Object.entries(data.tools).filter(([, text]) => !text).map(([key]) => `tools: ${key}`),
    ...(Array.isArray(data.ignore) && data.ignore.every((name) => typeof name === "string") ? [] : ["ignore"]),
  ]);
}

export function dataTests() {
  const all = keys();
  treeTests(all);
  textDataTests(all);
}

export function updaterTests() {
  const languages = codes();
  const written = pack(data).map(({ path, value }) => ({ path, value: JSON.parse(toJson(value)) }));
  const again = unpack(written[0].value);
  written.slice(1).forEach(({ value }, i) => addLanguage(again, languages[i + 1], value));
  check("update: the writer puts each language in its own file and keeps every value",
    same(written.map(({ path }) => path), ["data.json", ...languages.slice(1).map(localeFile)])
      && JSON.stringify(pack(again)) === JSON.stringify(pack(data)));

  const shortest = (key) => availabilityOf(new Set(civsOf(setOf(data.availability[key]))), data.civs);

  expect("update: availability is stored in its shortest form",
    keys().filter((key) => JSON.stringify(shortest(key)) !== JSON.stringify(data.availability[key])));
  expect("update: stored names are already tidy", languages.flatMap((code) => [
    ...Object.values(data.text[code].items), ...Object.values(data.text[code].civs),
  ].filter((name) => joinLines(name, data.languages[code]) !== name).map((name) => `${code}: ${name}`)));
}
