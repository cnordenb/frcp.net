import {
  data, ALL, load, setOf, size, civsOf, pack, unpack, addLanguage, localeFile, toJson, availabilityOf, joinLines, missingText,
} from "../datahandler.js";
import { prune } from "../model.js";
import { TAG, check, expect, same, codes, keys } from "./helpers.js";

const slash = "/";
const here = new URL(".", location.href).href;
const LIMIT = 400;

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
      ...[...file.code.matchAll(/^import\b[^;]*?\bfrom\s*"([^"]+)";/gm)].map(([, specifier]) => ({ specifier, lazy: false })),
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

export function sourceTests(page, sheet, files) {
  const failing = (cases) => Object.entries(cases).filter(([, bad]) => bad).map(([name]) => name);

  const named = (test) => files.filter(test).map(({ path }) => path);

  const testing = ({ path }) => path.startsWith("js/tests/");

  expect("rules: no comments in the code", [
    ...(page.includes("<!--") && !page.includes("<!-- Code injected by live-server -->") ? ["index.html"] : []),
    ...(sheet.includes(slash + "*") ? ["style.css"] : []),
    ...named(({ code }) => code.includes(slash + "*") || code.includes(slash + slash)),
  ]);
  expect("rules: the scripts have no CSS or HTML, and only hand numbers to CSS custom properties", named(({ code }) => /\.style\b(?!\.setProperty\("--\w+", [^"]*\))\s*[.=[]|setAttribute\(\s*["']style|\.(innerHTML|outerHTML|insertAdjacentHTML)\b|createElement\s*\(|document\.write/.test(code)));
  expect("rules: script.js is in the main folder and every other script in js/, scripts import only scripts in js/, and the tests are in js/tests/ and load only when testing", [
    ...named(({ path }) => !/^(script\.js|js\/([a-z]+\/)*[a-z]+\.js)$/.test(path)),
    ...files.flatMap(({ path, imports }) => imports.filter(({ specifier, target }) => !specifier.startsWith(".") || !target.startsWith(`${here}js/`))
      .map(({ specifier }) => `${path} imports ${specifier}`)),
    ...named((file) => testing(file) !== file.dynamic),
  ]);

  const linesOfCode = (code) => code.split("\n").filter((line) => line.trim()).length;

  expect(`rules: no script is over ${LIMIT} lines of code`, files.filter(({ code }) => linesOfCode(code) > LIMIT)
    .map(({ path, code }) => `${path} has ${linesOfCode(code)}`));
  expect("rules: only ui.js, report.js, pictures.js and the tests touch the page, and only datahandler.js and the tests load or store data", [
    ...named((file) => !testing(file) && !["js/ui.js", "js/report.js", "js/pictures.js"].includes(file.path) && /\b(document|window)\b|getElementById|querySelector|addEventListener/.test(file.code)),
    ...named((file) => !testing(file) && file.path !== "js/datahandler.js" && /XMLHttpRequest|localStorage|\bfetch\s*\(/.test(file.code)),
  ]);
  expect("rules: images only from assets/images/, in templates or CSS, only without Simple UI, fonts only from assets/fonts/, and no sounds, animations or dependencies in the sources", failing({
    images: /<(svg|canvas|picture|video|audio|object|embed)\b/i.test(page) || /<img\b/i.test(page.replace(/<template\b[\s\S]*?<\/template>/gi, "")) || [...sheet.matchAll(/([^{}]*)\{([^{}]*)\}/g)]
      .some(([, selector, body]) => [...body.matchAll(/url\(\s*"?([^")]*)/gi)].some(([, src]) => (selector.trim() === "@font-face"
        ? !/^assets\/fonts\/[A-Za-z0-9-]+\.ttf$/.test(src)
        : !selector.split(/,(?![^(]*\))/).every((part) => /^(html)?\.pictures\b/.test(part.trim()))
          || !/^assets\/images\/([a-z0-9]+\/)*[a-z0-9_]+\.webp$/.test(src)))),
    sounds: files.some(({ code }) => /new\s+(Audio|AudioContext)\b/.test(code)),
    animations: /@keyframes|\banimation|\btransition/i.test(sheet) || files.some(({ code }) => /\.animate\s*\(/.test(code)),
    dependencies: files.some(({ code }) => /\brequire\s*\(/.test(code)) || /@import/i.test(sheet),
  }));
  expect("rules: the scripts hold no game data", [...data.civs, ...keys()]
    .filter((name) => files.some(({ code }) => code.includes(JSON.stringify(name)))));
}

export function textTests() {
  const all = keys();
  expect("data: each language has all of the page's text", missingText(data).map(({ language, name }) => `${language}: ${name}`));
  expect("data: each language names every item and civilisation", codes().flatMap((code) => [
    ...all.filter((key) => !data.text[code].items?.[key]),
    ...data.civs.filter((civ) => !data.text[code].civs?.[civ]),
  ].map((key) => `${code}: ${key}`)));
}

export function tagTests() {
  expect("data: each language has a name and a valid tag",
    codes().filter((code) => !data.languages[code].name || !TAG.test(data.languages[code].tag)));
}

export function dataTests() {
  const all = keys();
  const languages = codes();
  expect("data: each item is in the tree once", all.filter((key, i) => all.indexOf(key) !== i));

  const flagged = (nodes, flag) => nodes.flatMap((node) => [...(flag in node ? [node] : []), ...flagged(node.kids ?? [], flag)]);

  expect("data: only items with something under them are optional or have upgrades, and only groups are unique, all marked with true", [
    ...["optional", "upgrades"].flatMap((flag) => flagged(data.tree, flag).filter((node) => node[flag] !== true || !node.item || !node.kids?.length)),
    ...flagged(data.tree, "unique").filter((node) => node.unique !== true || !node.group),
  ].map((node) => node.item ?? node.group));

  const wholeOf = (node) => (node.kids ?? []).reduce((s, kid) => s & wholeOf(kid), node.item ? setOf(data.availability[node.item]) : ALL);

  const needless = (nodes) => nodes.flatMap((node) => [
    ...(node.item && !node.optional && node.kids?.length
      && size(node.kids.reduce((s, kid) => s & wholeOf(kid), ALL) & ~setOf(data.availability[node.item]) & ALL) > 0 ? [node.item] : []),
    ...needless(node.kids ?? []),
  ]);

  expect("data: an item is optional if some civilisation has everything under it without having the item, with or without unique and universal items",
    [...new Set([...needless(data.tree), ...needless(prune(data.tree))])]);
  expect("data: each item says which civilisations have it, naming only known ones", all.filter((key) => {
    const rule = data.availability[key];
    return !rule || (rule !== "all" && (rule.has ?? rule.lacks ?? [null]).some((civ) => !data.civs.includes(civ)));
  }));
  expect("data: counted texts have an 'other' form", languages.flatMap((code) => Object.entries(data.text[code].ui)
    .filter(([, value]) => typeof value === "object" && !value.other).map(([key]) => `${code}: ${key}`)));

  const holes = (value) => [...new Set(JSON.stringify(value ?? "").match(/\{\w+\}/g) ?? [])].sort().join();

  expect("data: translations keep the same placeholders", languages.flatMap((code) => Object.entries(data.text[languages[0]].ui)
    .filter(([key, english]) => holes(english) !== holes(data.text[code].ui[key])).map(([key]) => `${code}: ${key}`)));
  expect("data: overrides name known items and civilisations", languages.flatMap((code) => Object.keys(data.overrides[code] ?? {})
    .filter((key) => !all.includes(key) && !data.civs.includes(key)).map((key) => `${code}: ${key}`)));
  expect("data: the source, the tool texts and the ignore list are filled in", [
    ...(data.source.name && data.source.url && data.source.data && Number.isInteger(data.source.helpOffset)
      && /^\d{4}-\d{2}$/.test(data.source.updated) ? [] : ["source"]),
    ...Object.entries(data.tools).filter(([, text]) => !text).map(([key]) => `tools: ${key}`),
    ...(Array.isArray(data.ignore) && data.ignore.every((name) => typeof name === "string") ? [] : ["ignore"]),
  ]);
}

export function updaterTests() {
  const languages = codes();
  const written = pack(data).map(({ path, value }) => ({ path, value: JSON.parse(toJson(value)) }));
  const again = unpack(written[0].value);
  written.slice(1).forEach(({ value }, i) => addLanguage(again, languages[i + 1], value));
  check("update: the writer puts each language in its own file and keeps every value",
    same(written.map(({ path }) => path), ["data.json", ...languages.slice(1).map(localeFile)])
      && JSON.stringify(pack(again)) === JSON.stringify(pack(data)));
  expect("update: availability is stored in its shortest form", keys().filter((key) => JSON.stringify(availabilityOf(
    new Set(civsOf(setOf(data.availability[key]))), data.civs)) !== JSON.stringify(data.availability[key])));
  expect("update: stored names are already tidy", languages.flatMap((code) => [
    ...Object.values(data.text[code].items), ...Object.values(data.text[code].civs),
  ].filter((name) => joinLines(name, data.languages[code]) !== name).map((name) => `${code}: ${name}`)));
}
