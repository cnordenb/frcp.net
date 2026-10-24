import {
  data, ALL, size, fill, attempt, recall, remember, params, language, nameOf, preferredLanguage,
} from "../datahandler.js";
import { items } from "../model.js";
import { $ } from "../stringbuilder.js";
import { options, setInclude, setSimple } from "../optionshandler.js";
import { openReport, report } from "../report.js";
import { audit } from "./audit.js";
import {
  root, check, expect, same, tidy, codes, keys, describe, everything, nameFor, visibleTexts, keyDown, tap, pick,
  reset, listed, expected, fixtures, shownKeys, uniqueKeys, regionalKeys, outside, keptPath, byPath, spans, ui, box,
} from "./helpers.js";

function englishFirst() {
  const stored = recall("language");
  remember("language", null);
  Object.defineProperty(navigator, "languages", { value: ["de-DE", "de"], configurable: true });
  const first = preferredLanguage();
  delete navigator.languages;
  remember("language", stored);
  return first === (codes().includes(params.get("lng")) ? params.get("lng") : codes()[0]);
}

export function menuTests({ partial }) {
  reset();
  tap(partial.node);
  const button = $("languageButton");
  $("optionsButton").focus();
  $("optionsButton").click();
  const inWindow = $("options").open && $("options").contains(button) && document.activeElement === button;

  const measure = () => `${box($("options")).width} by ${box($("options")).height}`;

  const sizes = [measure()];
  button.click();
  sizes.push(measure());
  check("language menu: it is in the options window, and its button opens it, offering every language in its own "
    + "language, with the current one marked", inWindow && button.getAttribute("aria-expanded") === "true"
    && !$("languageList").hidden && options().length === codes().length
    && options().every((option) => option.textContent === data.languages[option.dataset.language].name)
    && options().filter((option) => option.getAttribute("aria-current") === "true")
      .map((option) => option.dataset.language).join() === language);
  keyDown(options()[0], "Escape");
  const escaped = $("languageList").hidden && document.activeElement === button;
  sizes.push(measure());
  button.click();
  $("languageList").click();
  const clicked = $("languageList").hidden;
  button.click();
  $("options").querySelector("form button").focus();
  check("language menu: Escape closes it and returns focus, a click in it or leaving it closes it, and opening or "
    + "closing it never changes the window's size", escaped && clicked && $("languageList").hidden
    && button.getAttribute("aria-expanded") === "false" && new Set(sizes).size === 1, sizes.join(", "));
  const first = language;
  const next = codes().find((code) => code !== first);
  pick(next);
  check("language menu: choosing a language changes the page language, names it on the button, closes the menu and "
    + "returns focus", root.lang === data.languages[next].tag
    && document.querySelector("h1 .title-long").textContent === ui().title && $("languageList").hidden
    && document.activeElement === button && nameFor(button).includes(data.languages[next].name));
  check("language menu: the choice is kept in the address, and without a choice the page is in English", englishFirst()
    && (location.protocol === "file:" || new URLSearchParams(location.search).get("lng") === next));
  check("language menu: marks are kept when the language changes", partial.self === "has"
    && same(listed(), expected(partial.set)));
  pick(first);
  reset();
}

export function languageTests(code, { partial, other }) {
  reset();
  pick(code);
  reset();
  const text = data.text[code];

  const note = (name, offenders) => check(name, !offenders.length, `${code}: ${offenders.slice(0, 3).join("; ")}`);

  note("languages: the page's text is in the chosen language", [...document.querySelectorAll("[data-text]")]
    .filter((el) => el.textContent !== text.ui[el.dataset.text]).map((el) => el.dataset.text));
  note("languages: the tree is in the chosen language", items.filter((item) => item.label.textContent !== nameOf(item)
    || nameOf(item) !== (item.group ? text.groups[item.key] : text.items[item.key])).map((item) => item.key));
  note("languages: no placeholders are left in the text",
    visibleTexts(document.body).filter((value) => /[{}]/.test(value)));
  const notice = fill(data.source.notice, { rules: data.source.rules.name, project: data.source.project.name });
  check("languages: the footer names and links the source, and gives Microsoft's notice in English with its links to "
    + "the rules and the project, as wide as the page, or hidden on a phone", $("source").contains($("sourceLink"))
    && $("sourceLink").textContent === data.source.name && $("sourceLink").getAttribute("href") === data.source.url
    && tidy($("notice").textContent) === tidy(notice) && ["rules", "project"].every((key) =>
      $("notice").contains($(`${key}Link`)) && $(`${key}Link`).getAttribute("href") === data.source[key].url)
    && $("notice").lang === "en" && spans(), code);
  tap(partial.node);
  keyDown(other.node, "x");
  check("languages: the civilisations are listed in the language and in order",
    same(listed(), expected(partial.set & ~other.set & ALL)), code);
  reset();
}

export function optionTests() {
  reset();
  const all = keys();
  const unique = uniqueKeys();
  const regional = regionalKeys();
  check("options: by default, unique items, and items every civilisation or only one has, are left out, and regional "
    + "items are in", shownKeys().length < all.length && shownKeys().every((key) => !unique.has(key))
    && shownKeys().some((key) => regional.has(key))
    && items.every((item) => item.kids.length > 0 || (!item.group && ![1, data.civs.length].includes(size(item.set)))));
  const path = keptPath();
  tap(byPath(path).node);
  const listedBefore = listed();
  const button = $("optionsButton");
  button.focus();
  button.click();
  const opened = $("options").open && $("include").getAttribute("aria-checked") === "false"
    && $("regional").getAttribute("aria-checked") === "true";
  $("include").click();
  const widened = $("include").getAttribute("aria-checked") === "true" && $("include").dataset.state === "has"
    && shownKeys().length === all.length && byPath(path)?.self === "has" && same(listed(), listedBefore);
  $("regional").click();
  const narrowed = $("regional").getAttribute("aria-checked") === "false" && $("regional").dataset.state === ""
    && same(shownKeys(), outside(data.tree, regional)) && byPath(path)?.self === "has" && same(listed(), listedBefore);
  const remembered = recall("include") === "true" && recall("regional") === "false";
  $("regional").click();
  check("options: ticking Include shows every item, unique and universal ones included, and unticking Include "
    + "Regionals leaves out regional items and what is under them, keeping marks", widened && narrowed
    && $("regional").getAttribute("aria-checked") === "true" && shownKeys().length === all.length,
    `include ${widened}, regional ${narrowed}`);
  check("options: the choices are remembered", remembered || attempt(() => localStorage) === null);
  $("options").querySelector("form button").click();
  check("options: the Options button opens the window with Include unticked and Include Regionals ticked, and Close "
    + "closes it and returns focus", opened && !$("options").open && document.activeElement === button);
  reset();
  setInclude(false);
}

function menuAudit({ partial }) {
  reset();
  tap(partial.node);
  $("optionsButton").click();
  $("languageButton").click();
  audit("language menu open", { focus: false });
  reset();
}

function menuKeys() {
  reset();
  const button = $("languageButton");
  $("optionsButton").click();
  button.focus();
  keyDown(button, "ArrowDown");
  const atCurrent = !$("languageList").hidden
    && document.activeElement === options().find((option) => option.dataset.language === language);
  const at = options().indexOf(document.activeElement);
  keyDown(document.activeElement, "ArrowDown");
  const stepped = document.activeElement === options()[(at + 1) % codes().length];
  keyDown(document.activeElement, "End");
  check("language menu: Down opens it at the current language, and Down and End move through it", atCurrent && stepped
    && document.activeElement === options()[codes().length - 1]);
  reset();
}

function languageAudits(code, { partial, other }) {
  reset();
  pick(code);
  reset();
  const focus = code === codes()[0];
  audit(code, { focus });
  tap(partial.node);
  keyDown(other.node, "x");
  audit(`${code}, filters`, { focus });
  $("expandAll").click();
  audit(`${code}, all open`, { focus });
  reset();
}

function spacingTests({ partial }) {
  reset();
  tap(partial.node);
  root.classList.add("text-spacing-test");
  expect("layout: with wider text spacing, nothing sticks out sideways", [
    ...(root.scrollWidth > innerWidth ? [`the page is ${root.scrollWidth} pixels wide`] : []),
    ...everything().filter((el) => box(el).right > innerWidth + 0.5).map(describe),
  ]);
  root.classList.remove("text-spacing-test");
  reset();
}

function optionKeys() {
  reset();
  const unique = uniqueKeys();
  const regional = regionalKeys();
  const path = keptPath();
  tap(byPath(path).node);
  const listedBefore = listed();
  $("optionsButton").click();
  $("include").click();
  keyDown($("include"), " ");
  keyDown($("regional"), " ");
  const unticked = $("regional").getAttribute("aria-checked") === "false"
    && shownKeys().every((key) => !regional.has(key));
  keyDown($("regional"), " ");
  check("options: Space unticks Include or Include Regionals and leaves those items out, keeping marks, and ticks them "
    + "again", $("include").getAttribute("aria-checked") === "false" && shownKeys().every((key) => !unique.has(key))
    && unticked && $("regional").getAttribute("aria-checked") === "true" && byPath(path)?.self === "has"
    && same(listed(), listedBefore));
  reset();
  setInclude(false);
}

function optionAudits() {
  reset();
  $("optionsButton").click();
  audit("accessibility (options window open)", { focus: false });
  reset();
  setInclude(true);
  $("expandAll").click();
  audit("accessibility (everything included, all open)", { focus: false });
  reset();
  setInclude(false);
}

export function accessibilityTests(sample) {
  const [first, ...rest] = codes();
  menuAudit(sample);
  menuKeys();
  languageAudits(first, sample);
  spacingTests(sample);
  optionKeys();
  const fresh = fixtures();
  rest.forEach((code) => languageAudits(code, fresh));
  optionAudits();
}

export function reportTests() {
  openReport("scrolling", "status");
  for (let i = 0; i < 200; i++) report(String(i));
  const list = $("reportList").parentElement;
  const close = $("report").querySelector("form button");
  const pinned = [$("reportTitle"), $("reportStatus"), close];

  const tops = () => pinned.map((el) => Math.round(box(el).top)).join();

  const look = () => [null, "::before", "::after"].map((part) => getComputedStyle(close, part))
    .map((style) => [style.backgroundImage, style.backgroundColor, style.borderTopWidth, style.borderTopColor,
      style.borderRadius, style.color, style.fontFamily, style.content].join()).join(" | ");

  const [before, focused, plain] = [tops(), document.activeElement === close, look()];
  list.scrollTop = list.scrollHeight;
  const kept = list.contains($("reportDownloads")) && list.scrollTop > 0
    && $("report").scrollHeight <= $("report").clientHeight && tops() === before
    && pinned.every((el) => box(el).top >= 0 && box(el).bottom <= innerHeight);
  const right = Math.abs(box(close).right - box(list).right) < 1;
  setSimple(false);
  const unchanged = look() === plain;
  setSimple(true);
  check("update: the report window keeps its title, its count and Close in view, and scrolls only its list; Close "
    + "has focus, sits on the right and is the plain button, with or without Simple UI",
    kept && focused && right && unchanged,
    `title, count and Close at ${before}, then ${tops()}; focus ${focused}, right ${right}, plain ${unchanged}`);
  $("report").close();
}
