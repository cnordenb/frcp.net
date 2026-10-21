import { data, ALL, size, attempt, recall, language, nameOf, iconFile } from "../datahandler.js";
import { items } from "../model.js";
import { $, options, setInclude, setSimple } from "../ui.js";
import { audit } from "./audit.js";
import {
  root, check, expect, loaded, same, tidy, codes, keys, describe, rendered, everything, nameFor, visibleTexts, keyDown, tap, type, pick,
  reset, beside, listed, expected, fixtures, edges, shownKeys, uniqueKeys, regionalKeys, outside, keptPath, byPath, spans,
  need, pictures, simpleSpot, picturesOn, civLinks, simpleTicked,
} from "./helpers.js";

export function menuTests({ partial }) {
  reset();
  tap(partial.node);
  const button = $("languageButton");
  $("optionsButton").focus();
  $("optionsButton").click();
  const inWindow = $("options").open && $("options").contains(button) && document.activeElement === button;

  const size = () => {
    const box = $("options").getBoundingClientRect();
    return `${box.width} by ${box.height}`;
  };

  const sizes = [size()];
  button.click();
  sizes.push(size());
  check("language menu: it is in the options window, and its button opens it, offering every language in its own language, with the current one marked",
    inWindow && button.getAttribute("aria-expanded") === "true" && !$("languageList").hidden && options().length === codes().length
    && options().every((option) => option.textContent === data.languages[option.dataset.language].name)
    && options().filter((option) => option.getAttribute("aria-current") === "true").map((option) => option.dataset.language).join() === language);
  keyDown(options()[0], "Escape");
  const escaped = $("languageList").hidden && document.activeElement === button;
  sizes.push(size());
  button.click();
  $("options").querySelector("form button").focus();
  check("language menu: Escape closes it and returns focus, leaving it closes it, and opening or closing it never changes the window's size",
    escaped && $("languageList").hidden && button.getAttribute("aria-expanded") === "false" && new Set(sizes).size === 1, sizes.join(", "));
  const first = language;
  const next = codes().find((code) => code !== first);
  pick(next);
  check("language menu: choosing a language changes the page language, names it on the button, closes the menu and returns focus",
    root.lang === data.languages[next].tag && document.querySelector("h1 .title-long").textContent === data.text[next].ui.title
    && $("languageList").hidden && document.activeElement === button && nameFor(button).includes(data.languages[next].name));
  check("language menu: the choice is kept in the address", location.protocol === "file:" || new URLSearchParams(location.search).get("lng") === next);
  check("language menu: marks are kept when the language changes", partial.self === "has" && same(listed(), expected(partial.set)));
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
  note("languages: no placeholders are left in the text", visibleTexts(document.body).filter((value) => /[{}]/.test(value)));
  check("languages: the footer names and links the source, and gives Microsoft's notice in English with its link, as wide as the page, or hidden on a phone", $("source").contains($("sourceLink"))
    && $("sourceLink").textContent === data.source.name && $("sourceLink").getAttribute("href") === data.source.url && $("notice").lang === "en"
    && $("notice").contains($("rulesLink")) && $("rulesLink").getAttribute("href") === data.source.rules.url
    && tidy($("notice").textContent) === tidy(data.source.notice.replace("{rules}", data.source.rules.name)) && spans(), code);
  tap(partial.node);
  keyDown(other.node, "x");
  check("languages: the civilisations are listed in the language and in order", same(listed(), expected(partial.set & ~other.set & ALL)), code);
  reset();
}

export function optionTests() {
  reset();
  const all = keys();
  const unique = uniqueKeys();
  const regional = regionalKeys();
  check("options: by default, unique items, and items every civilisation or only one has, are left out, and regional items are in",
    shownKeys().length < all.length && shownKeys().every((key) => !unique.has(key)) && shownKeys().some((key) => regional.has(key))
    && items.every((item) => item.kids.length > 0 || (!item.group && ![1, data.civs.length].includes(size(item.set)))));
  const path = keptPath();
  tap(byPath(path).node);
  const listedBefore = listed();
  const button = $("optionsButton");
  button.focus();
  button.click();
  const opened = $("options").open && $("include").getAttribute("aria-checked") === "false" && $("regional").getAttribute("aria-checked") === "true";
  $("include").click();
  const widened = $("include").getAttribute("aria-checked") === "true" && $("include").dataset.state === "has" && shownKeys().length === all.length
    && byPath(path)?.self === "has" && same(listed(), listedBefore);
  $("regional").click();
  const narrowed = $("regional").getAttribute("aria-checked") === "false" && $("regional").dataset.state === ""
    && same(shownKeys(), outside(data.tree, regional)) && byPath(path)?.self === "has" && same(listed(), listedBefore);
  const remembered = recall("include") === "true" && recall("regional") === "false";
  $("regional").click();
  check("options: ticking Include shows every item, unique and universal ones included, and unticking Include Regionals leaves out regional items and what is under them, keeping marks",
    widened && narrowed && $("regional").getAttribute("aria-checked") === "true" && shownKeys().length === all.length,
    `include ${widened}, regional ${narrowed}`);
  check("options: the choices are remembered", remembered || attempt(() => localStorage) === null);
  $("options").querySelector("form button").click();
  check("options: the Options button opens the window with Include unticked and Include Regionals ticked, and Close closes it and returns focus",
    opened && !$("options").open && document.activeElement === button);
  reset();
  setInclude(false);
}

export async function pictureTests() {
  reset();
  setSimple(false);
  const style = getComputedStyle(document.body);
  const wanted = innerWidth / innerHeight > 16 / 9 ? "ultrawide"
    : innerWidth > 2560 || innerHeight > 1440 ? "uhd" : innerWidth > 1920 || innerHeight > 1080 ? "qhd" : "fhd";
  const sharp = innerWidth > 1920 || innerHeight > 1080 || devicePixelRatio > 1 ? "4k" : "sd";
  const button = getComputedStyle($("optionsButton"));
  const [left, top, right, bottom] = ["--left", "--top", "--right", "--bottom"].map((name) => Number(style.getPropertyValue(name)));
  const [w, h] = style.getPropertyValue("--ratio").split("/").map(Number);
  const wide = Math.max(innerWidth, innerHeight * w / h);
  const high = Math.max(innerHeight, innerWidth * h / w);
  const x = (share) => (innerWidth - wide) / 2 + wide * share;
  const y = (share) => (innerHeight - high) / 2 + high * share;
  $("content").scrollTop = 0;
  const clip = getComputedStyle($("content")).overflowY === "visible" ? Infinity : $("content").getBoundingClientRect().bottom;
  const off = [$("top"), $("content"), ...$("content").querySelectorAll(".pane, .foot")].filter(rendered).filter((el) => {
    const box = el.getBoundingClientRect();
    return box.left < x(left) - 0.5 || box.right > x(right) + 0.5 || box.top < y(top) - 0.5 || Math.min(box.bottom, clip) > y(bottom) + 0.5;
  }).map(describe);
  const cursor = innerWidth > 2560 || innerHeight > 1440 ? "x2" : "x1";
  const stray = [root, document.body, ...everything()].filter((el) => !getComputedStyle(el).cursor
    .includes(`/assets/images/ui/cursors/cursor_${el.closest(".civs a, .foot a") ? "pointing" : "normal"}_${cursor}.webp"`)).map(describe);
  const spread = spans();
  check("options: without Simple UI, the pictures and cursors suit the screen, the Options button shows its normal one, and the page fits the parchment",
    style.backgroundImage.endsWith(`/assets/images/ui/backgrounds/${wanted}.webp")`) && !off.length && !stray.length
    && button.backgroundImage.endsWith(`/assets/images/ui/buttons/options_${sharp}.webp")`)
    && button.backgroundPosition.split(" ").every((part) => parseFloat(part) === 0) && button.boxShadow === "rgb(238, 157, 5) 0px 0px 0px 2px"
    && root.scrollHeight <= innerHeight && root.scrollWidth <= innerWidth && spread,
    [style.backgroundImage, button.backgroundImage].map((url) => url.split("/").pop()).concat(off, stray).join(", "));
  const blank = [...document.querySelectorAll(".box")].filter((box) => {
    const look = getComputedStyle(box);
    const state = box.parentElement.dataset.state;
    return !look.backgroundImage.endsWith(`/assets/images/ui/checkboxes/checkboxes_${sharp}.webp")`) || look.backgroundSize !== "300% 300%"
      || parseFloat(look.backgroundPositionX) !== 0 || parseFloat(look.backgroundPositionY) !== ({ has: 50, lacks: 100 }[state] ?? 0)
      || getComputedStyle(box, "::before").content !== "none" || (state !== "mixed" && getComputedStyle(box, "::after").content !== "none");
  }).map(describe).concat([...$("views").querySelectorAll("input")].filter((input) => {
    const look = getComputedStyle(input);
    return !look.backgroundImage.endsWith(`/assets/images/ui/checkboxes/radiobutton_${sharp}.webp")`) || look.backgroundSize !== "200% 200%"
      || parseFloat(look.backgroundPositionX) !== 0 || parseFloat(look.backgroundPositionY) !== (input.checked ? 100 : 0);
  }).map((input) => input.value));
  setInclude(true);
  const outlines = await edges();
  const nodeIcons = items.map((item) => item.node.querySelector(".node-icon"));
  await loaded(nodeIcons.filter(Boolean));
  const unpictured = items.filter((item, i) => {
    const own = item.group ? data.icons.groups[item.key] : data.pictures[item.key];
    const img = nodeIcons[i];
    const look = img && getComputedStyle(img);
    return own ? !img || img.naturalWidth !== 48 || img.getAttribute("src") !== iconFile(own)
      || img.previousElementSibling !== item.node.querySelector(".box") || img.nextElementSibling !== item.label
      || look.width !== "44px" || look.height !== "44px" || Math.abs(parseFloat(look.borderTopWidth) - 2) >= 1 || look.borderTopStyle !== "solid"
      || look.borderTopColor !== (item.group ? "rgba(0, 0, 0, 0)" : outlines.get(`${own.kind} ${own.reach}`)) : !!img;
  }).map((item) => item.key);
  setInclude(false);
  check("options: without Simple UI, every checkbox and radio button shows its picture from its sheet, empty, ticked, crossed or chosen, and every item and top-level group its icon between its box and name, outlined as colour_key.csv says",
    !blank.length && document.querySelector("[data-state=has] > .box") && document.querySelector("[data-state=lacks] > .box") && outlines.size === 9
    && !unpictured.length, blank.concat(unpictured).join(", "));
  const lens = () => getComputedStyle($("find").parentElement, "::after");
  const field = getComputedStyle($("find"));
  const width = () => $("find").getBoundingClientRect().width;
  const breadth = width();
  const empty = field.borderImageSource.endsWith("/assets/images/ui/buttons/textfield_9slice.webp\")") && field.borderImageSlice === "15 fill"
    && field.borderImageWidth === "15px" && /^repeat( repeat)?$/.test(field.borderImageRepeat) && !rendered($("clearFind"))
    && lens().content !== "none" && lens().backgroundImage.endsWith("/assets/images/ui/buttons/search.webp\")")
    && Math.abs(breadth - Math.min(325, $("find").closest(".find").clientWidth - 96)) < 1;
  type(nameOf(items.find((item) => !item.group)));
  const typed = rendered($("clearFind")) && lens().content === "none" && document.querySelector(".node.found") && width() === breadth && beside()
    && getComputedStyle($("found")).textAlign === "right"
    && getComputedStyle($("clearFind")).backgroundImage.endsWith("/assets/images/ui/buttons/clear_search.webp\")");
  type("qqqqzzzzqqqq");
  const lost = width() === breadth && beside();
  $("clearFind").click();
  const cleared = lost && $("find").value === "" && !document.querySelector(".node.found") && !rendered($("clearFind"))
    && document.activeElement === $("find") && getComputedStyle($("find")).outlineStyle === "none";
  const target = items[0].node.getBoundingClientRect();
  const [cx, cy] = [target.left + 5, target.top + 5];
  items[0].node.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerType: "mouse", clientX: cx, clientY: cy }));
  const tip = $("tip").getBoundingClientRect();
  const reach = innerWidth > 2560 || innerHeight > 1440 ? 48 : 32;
  const tipped = !$("tip").hidden && $("tip").textContent === data.text[language].ui.nodeTip
    && getComputedStyle($("tip")).backgroundColor === "rgb(215, 179, 148)" && tip.left >= 3.5 && tip.right <= innerWidth - 3.5
    && (Math.abs(tip.left - cx - reach) < 1 || Math.abs(tip.right - innerWidth + 4) < 1)
    && (Math.abs(tip.top - cy - reach) < 1 || Math.abs(tip.bottom - cy + 8) < 1);
  $("count").dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerType: "mouse", clientX: 0, clientY: 0 }));
  $("optionsButton").click();
  const includeBox = $("include").getBoundingClientRect();
  $("include").dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerType: "mouse", clientX: includeBox.left + 5, clientY: includeBox.top + 5 }));
  const hinted = !$("tip").hidden && $("tip").textContent === data.text[language].ui.includeHint && $("options").contains($("tip"))
    && $("includeHint").getBoundingClientRect().width <= 1 && $("include").getAttribute("aria-describedby") === "includeHint";
  $("options").close();
  $("tooltips").click();
  items[0].node.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerType: "mouse", clientX: cx, clientY: cy }));
  const silent = $("tip").hidden && $("tooltips").getAttribute("aria-checked") === "false"
    && (recall("tooltips") === "false" || attempt(() => localStorage) === null);
  keyDown($("tooltips"), " ");
  check("options: without Simple UI, the Find box shows a search icon or a cross that clears it, and a tooltip follows the mouse over the tree, and over Include with its description, unless Tooltips is unticked",
    empty && typed && cleared && tipped && hinted && silent && $("tip").hidden && $("tooltips").getAttribute("aria-checked") === "true",
    `empty ${empty}, typed ${typed}, cleared ${cleared}, tooltip ${tipped}, description ${hinted}, unticked ${silent}`);
  reset();

  tap(items.find((item) => !item.group && size(item.set) > 0).node);
  $("optionsButton").click();
  const before = { pictures: pictures(), spot: simpleSpot() };
  before.basics = picturesOn() && civLinks() === $("civs").children.length;
  $("simple").click();
  const title = [...document.querySelector("h1").children].filter(rendered).map((el) => el.textContent);
  const problems = [
    ...need(before.basics, "no pictures or links before ticking"),
    ...need(simpleTicked(true), "the box is not ticked"),
    ...pictures().slice(0, 3).map((name) => `${name} is left`),
    ...need(simpleSpot() === before.spot, `ticking moved the box from ${before.spot} to ${simpleSpot()}`),
    ...need(civLinks() === 0, "links are left"),
    ...need(recall("simple") === "true" || attempt(() => localStorage) === null, "the choice is not remembered"),
    ...need(same(title, [data.text[language].ui.title]), "the title is short"),
  ];
  $("simple").click();
  problems.push(
    ...need(simpleTicked(false), "the box is not unticked"),
    ...need(same(pictures(), before.pictures), "not every image came back"),
    ...need(simpleSpot() === before.spot, `unticking moved the box from ${before.spot} to ${simpleSpot()}`),
    ...need(civLinks() === $("civs").children.length, "the links did not come back"),
  );
  expect("options: Simple UI takes away every image and civilisation link without moving its box, and gives them back",
    problems);
  reset();
  setSimple(true);
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
  const atCurrent = !$("languageList").hidden && document.activeElement === options().find((option) => option.dataset.language === language);
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
    ...everything().filter((el) => el.getBoundingClientRect().right > innerWidth + 0.5).map(describe),
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
  const unticked = $("regional").getAttribute("aria-checked") === "false" && shownKeys().every((key) => !regional.has(key));
  keyDown($("regional"), " ");
  check("options: Space unticks Include or Include Regionals and leaves those items out, keeping marks, and ticks them again",
    $("include").getAttribute("aria-checked") === "false" && shownKeys().every((key) => !unique.has(key)) && unticked
    && $("regional").getAttribute("aria-checked") === "true" && byPath(path)?.self === "has" && same(listed(), listedBefore));
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
