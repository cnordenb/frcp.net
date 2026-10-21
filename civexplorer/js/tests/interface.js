import { data, ALL, size, civsOf, attempt, recall, language, nameOf } from "../datahandler.js";
import { items, matching } from "../model.js";
import { $, options, setInclude, setSimple } from "../ui.js";
import { audit } from "./audit.js";
import {
  root, check, expect, wait, same, tidy, codes, keys, describe, rendered, everything, pictured, nameFor, visibleTexts, keyDown, tap, type, pick,
  reset, beside, listed, expected, fixtures,
} from "./helpers.js";

const shownKeys = () => items.filter((item) => !item.group).map((item) => item.key);

const uniqueKeys = () => {
  const under = (nodes, inside) => nodes.flatMap((node) => [
    ...(inside && node.item ? [node.item] : []), ...under(node.kids ?? [], inside || node.unique === true),
  ]);

  return new Set(under(data.tree, false));
};

const keptPath = () => items.find((item) => !item.group && !item.kids.length && item.parent).path;

const byPath = (path) => items.find((item) => item.path === path);

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
  check("languages: the footer names and links the source, and gives Microsoft's notice in English with its link, as wide as the page", $("source").contains($("sourceLink"))
    && $("sourceLink").textContent === data.source.name && $("sourceLink").getAttribute("href") === data.source.url && $("notice").lang === "en"
    && $("notice").contains($("rulesLink")) && $("rulesLink").getAttribute("href") === data.source.rules.url
    && tidy($("notice").textContent) === tidy(data.source.notice.replace("{rules}", data.source.rules.name))
    && Math.abs($("source").parentElement.getBoundingClientRect().width - document.querySelector(".panes").getBoundingClientRect().width) < 1, code);
  tap(partial.node);
  keyDown(other.node, "x");
  check("languages: the civilisations are listed in the language and in order", same(listed(), expected(partial.set & ~other.set & ALL)), code);
  reset();
}

export function optionTests() {
  reset();
  const all = keys();
  const unique = uniqueKeys();
  check("options: by default, unique items, and items every civilisation or only one has, are left out", shownKeys().length < all.length
    && shownKeys().every((key) => !unique.has(key))
    && items.every((item) => item.kids.length > 0 || (!item.group && ![1, data.civs.length].includes(size(item.set)))));
  const path = keptPath();
  tap(byPath(path).node);
  const listedBefore = listed();
  const button = $("optionsButton");
  button.focus();
  button.click();
  const opened = $("options").open && $("include").getAttribute("aria-checked") === "false";
  $("include").click();
  check("options: ticking the box shows every item, unique and universal ones included, keeping marks",
    $("include").getAttribute("aria-checked") === "true" && $("include").dataset.state === "has" && shownKeys().length === all.length
    && byPath(path)?.self === "has" && same(listed(), listedBefore));
  check("options: the choice is remembered", recall("include") === "true" || attempt(() => localStorage) === null);
  $("options").querySelector("form button").click();
  check("options: the Options button opens the window with the box unticked, and Close closes it and returns focus", opened
    && !$("options").open && document.activeElement === button);
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
  const off = [$("top"), $("content"), ...$("content").querySelectorAll(".pane, .foot")].filter((el) => {
    const box = el.getBoundingClientRect();
    return box.left < x(left) - 0.5 || box.right > x(right) + 0.5 || box.top < y(top) - 0.5 || Math.min(box.bottom, clip) > y(bottom) + 0.5;
  }).map(describe);
  const cursor = innerWidth > 2560 || innerHeight > 1440 ? "x2" : "x1";
  const stray = [root, document.body, ...everything()].filter((el) => !getComputedStyle(el).cursor
    .includes(`/assets/images/ui/cursors/cursor_${el.closest(".civs a, .foot a") ? "pointing" : "normal"}_${cursor}.webp"`)).map(describe);
  const spread = Math.abs(document.querySelector(".foot").getBoundingClientRect().width - document.querySelector(".panes").getBoundingClientRect().width) < 1;
  check("options: without Simple UI, the pictures and cursors suit the screen, the Options button shows its normal one, and the page fits the parchment",
    style.backgroundImage.endsWith(`/assets/images/ui/backgrounds/${wanted}.webp")`) && !off.length && !stray.length
    && button.backgroundImage.endsWith(`/assets/images/ui/buttons/options_${sharp}.webp")`)
    && button.backgroundPosition.split(" ").every((part) => parseFloat(part) === 0) && button.boxShadow === "rgb(238, 157, 5) 0px 0px 0px 2px"
    && root.scrollHeight <= innerHeight && root.scrollWidth <= innerWidth && spread,
    [style.backgroundImage, button.backgroundImage].map((url) => url.split("/").pop()).concat(off, stray).join(", "));
  const heading = document.querySelector("h1");
  const lettering = getComputedStyle(heading);

  const middle = (el) => (el.getBoundingClientRect().left + el.getBoundingClientRect().right) / 2;

  $("optionsButton").click();
  const sheet = $("options").getBoundingClientRect();
  const named = $("optionsTitle").getBoundingClientRect();
  const scale = Math.max(sheet.width / 532, (sheet.height - named.height - 8) / 527);
  const backdrop = getComputedStyle($("options"), "::backdrop").backgroundImage;
  const titled = getComputedStyle($("optionsTitle")).fontFamily.startsWith("\"Civ Georgia\"") && (innerHeight < 588
    ? backdrop === "none" && named.top >= sheet.top && named.bottom <= sheet.bottom
    : backdrop.endsWith(`/assets/images/ui/backgrounds/options_${sharp}.webp")`)
      && Math.abs((named.left + named.right) / 2 - (sheet.left + sheet.right) / 2 - 6 * scale) < 1
      && Math.abs((named.top + named.bottom) / 2 - (sheet.top + sheet.bottom + named.height + 8) / 2 + 301 * scale) < 1);
  $("options").close();
  check("options: without Simple UI, the title reads Civ Explorer in bold Georgia, centred in its frame at the top of the parchment, and the Options window's title sits in the frame of its own parchment",
    same([...heading.children].filter(rendered).map((el) => el.textContent), [data.text[language].ui.titleShort])
    && lettering.fontFamily.startsWith("\"Civ Georgia\"") && lettering.fontWeight === "700" && lettering.color === "rgb(57, 28, 27)"
    && lettering.backgroundImage.endsWith(`/assets/images/ui/backgrounds/title_frame_${sharp}.webp")`)
    && getComputedStyle($("top")).backgroundColor === "rgba(0, 0, 0, 0)" && Math.abs(middle(heading) - middle($("top"))) < 1 && titled,
    `${heading.textContent}, ${lettering.backgroundImage.split("/").pop()}, Options ${titled} ${backdrop.split("/").pop()}`);
  const plate = innerWidth > 2560 || innerHeight > 1440 ? "4k" : "sd";
  const plain = [...document.querySelectorAll(".tool:not(.icon)")].filter((el) => {
    const look = getComputedStyle(el);
    const ends = ["::before", "::after"].map((end) => getComputedStyle(el, end));
    return !look.backgroundImage.endsWith(`/assets/images/ui/buttons/button_${plate}.webp")`) || look.boxShadow.includes("rgb(238, 157, 5)")
      || !look.backgroundPosition.split(" ").every((part) => parseFloat(part) === 0)
      || !ends.every((end) => end.backgroundImage === look.backgroundImage && end.backgroundSize === "auto 300%" && end.aspectRatio === "12 / 50")
      || !look.fontFamily.startsWith("\"Civ Georgia\"") || look.fontWeight !== "700" || look.color !== "rgb(242, 210, 182)"
      || look.textShadow !== "rgba(0, 0, 0, 0.5) 2px 2px 0px";
  }).map(describe);
  check("options: without Simple UI, text buttons show the button picture with unstretched ends, and bold Georgia text with a shadow",
    !plain.length, plain.join(", "));
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
  check("options: without Simple UI, every checkbox and radio button shows its picture from its sheet, empty, ticked, crossed or chosen",
    !blank.length && document.querySelector("[data-state=has] > .box") && document.querySelector("[data-state=lacks] > .box"), blank.join(", "));

  const lettered = (pane) => [pane, ...pane.querySelectorAll("*")].filter((el) => rendered(el) && !el.closest(".tool")
    && [...el.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim()));

  const [tree, list] = document.querySelectorAll(".pane");
  const frames = [[tree, "nodes9slice", "64 fill", "30px"], [list, "civs9slice", "85 fill", "30px"], [$("options"), "nodes9slice", "64 fill", "30px", "::before"]];
  const unframed = frames.filter(([pane, picture, slice, width, part]) => {
    const look = getComputedStyle(pane, part);
    return !look.borderImageSource.endsWith(`/assets/images/ui/panels/${picture}.webp")`) || look.borderImageSlice !== slice
      || look.borderImageWidth !== width || !/^repeat( repeat)?$/.test(look.borderImageRepeat);
  }).map(([pane]) => describe(pane));
  $("optionsButton").click();
  const miswritten = [
    ...lettered(tree).filter((el) => !getComputedStyle(el).fontFamily.startsWith("\"Civ Georgia\"") || getComputedStyle(el).color !== "rgb(57, 28, 27)"),
    ...lettered(list).filter((el) => !getComputedStyle(el).fontFamily.startsWith("\"Civ Times\"") || getComputedStyle(el).color !== "rgb(255, 255, 255)"
      || getComputedStyle(el).fontWeight !== "700"),
    ...lettered($("options")).filter((el) => !getComputedStyle(el).fontFamily.startsWith("\"Civ Georgia\"") || getComputedStyle(el).color !== "rgb(42, 15, 20)"
      || getComputedStyle(el).fontWeight !== "700"),
  ].map(describe);
  $("options").close();
  const fonts = await Promise.all(["16px \"Civ Georgia\"", "700 16px \"Civ Times\"", "700 12px \"Trajan Pro\""].map((font) => document.fonts.load(font).catch(() => [])));
  const placed = !rendered(tree.querySelector(".legend")) && tree.querySelector(".find label").getBoundingClientRect().width <= 1
    && tree.querySelector(".find").getBoundingClientRect().bottom <= tree.querySelector(".tools").getBoundingClientRect().top;
  tap(items.find((item) => !item.group && size(item.set) > data.civs.length / 2).node);
  const icons = [...$("civs").children].map((li) => li.querySelector(".civ-icon"));
  await Promise.race([Promise.all(icons.map((img) => img?.complete !== false || new Promise((done) => ["load", "error"]
    .forEach((type) => img.addEventListener(type, done))))), wait(10000)]);
  const iconed = icons.length > 0 && icons.every((img) => img?.naturalWidth > 0) && same(icons.map((img) => img.src.split("/").pop()).sort(),
    civsOf(matching).map((civ) => `${data.icons.names[civ] ?? civ.toLowerCase()}.png`).sort());
  const first = $("civs").querySelector("a");
  const corner = first.getBoundingClientRect();
  first.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerType: "mouse", clientX: corner.left + 4, clientY: corner.top + 4 }));
  const linked = !$("tip").hidden && $("tip").textContent === first.href && same([...$("civs").querySelectorAll("a")].map((a) => a.href).sort(),
    civsOf(matching).map((civ) => new URL(`#${civ}`, data.source.url).href).sort());
  $("count").dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerType: "mouse", clientX: 0, clientY: 0 }));
  const pinned = $("ticked").getBoundingClientRect().top;
  $("civScroll").scrollTop = 1e6;
  const stays = !$("ticked").hidden && !$("civScroll").contains($("ticked")) && $("ticked").getBoundingClientRect().top === pinned;
  $("civScroll").scrollTop = 0;
  $("views").querySelector("[value=tile]").click();
  const tile = $("civs").firstElementChild;
  const label = getComputedStyle(tile.querySelector(".civ-name"));
  const tiled = $("civs").classList.contains("tiles") && (recall("civView") === "tile" || attempt(() => localStorage) === null)
    && getComputedStyle(tile).backgroundImage.endsWith(`/assets/images/ui/panels/civ_box_${sharp}.webp")`) && tile.querySelector(".civ-icon")
    && label.fontFamily.startsWith("\"Trajan Pro\"") && label.backgroundImage === "linear-gradient(rgb(255, 255, 255), rgb(255, 153, 0))"
    && label.filter === "drop-shadow(rgba(0, 0, 0, 0.5) 2px 2px 0px)" && getComputedStyle($("civs")).gridTemplateColumns.split(" ").length === 6
    && Math.abs(tile.offsetWidth - tile.offsetHeight) < 1;
  $("views").querySelector("[value=list]").click();
  reset();
  check("options: without Simple UI, the panels sit in their frames, in their fonts and colours, with civilisation icons and links as a list or tiles of six a row, filters pinned, search first and no legend",
    !unframed.length && !miswritten.length && fonts.every((faces) => faces.length > 0) && placed && iconed && linked && stays && tiled
    && !$("civs").classList.contains("tiles"),
    [...unframed, ...miswritten].join(", ") || `fonts ${fonts.map((faces) => faces.length)}, layout ${placed}, icons ${iconed}, links ${linked}, pinned ${stays}, tiles ${tiled}`);
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
  $("tooltips").click();
  items[0].node.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerType: "mouse", clientX: cx, clientY: cy }));
  const silent = $("tip").hidden && $("tooltips").getAttribute("aria-checked") === "false"
    && (recall("tooltips") === "false" || attempt(() => localStorage) === null);
  keyDown($("tooltips"), " ");
  check("options: without Simple UI, the Find box shows a search icon or a cross that clears it, and a tooltip follows the mouse over the tree unless Tooltips is unticked",
    empty && typed && cleared && tipped && silent && $("tip").hidden && $("tooltips").getAttribute("aria-checked") === "true",
    `empty ${empty}, typed ${typed}, cleared ${cleared}, tooltip ${tipped}, unticked ${silent}`);
  reset();

  const pictures = () => [root, document.body, ...everything()].filter(pictured).map(describe);

  const spot = () => JSON.stringify($("simple").querySelector(".box").getBoundingClientRect());

  const shown = () => {
    const now = pictures();
    return [describe(root), "body", describe($("optionsButton"))].every((name) => now.includes(name));
  };

  const links = () => $("civs").children.length > 0 && $("civs").querySelectorAll("a[href]").length;

  tap(items.find((item) => !item.group && size(item.set) > 0).node);
  $("optionsButton").click();
  const before = { shown: shown(), spot: spot(), links: links() === $("civs").children.length };
  $("simple").click();
  const ticked = $("simple").getAttribute("aria-checked") === "true" && $("simple").dataset.state === "has" && !pictures().length
    && spot() === before.spot && links() === 0 && (recall("simple") === "true" || attempt(() => localStorage) === null)
    && same([...heading.children].filter(rendered).map((el) => el.textContent), [data.text[language].ui.title]);
  keyDown($("simple"), " ");
  check("options: ticking Simple UI takes away every image and the civilisations' links without moving the box and is remembered, and Space unticks it",
    before.shown && before.links && ticked && $("simple").getAttribute("aria-checked") === "false" && shown() && links() === $("civs").children.length,
    `pictures: ${pictures().slice(0, 5).join(", ") || "none"}`);
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
  const path = keptPath();
  tap(byPath(path).node);
  const listedBefore = listed();
  $("optionsButton").click();
  $("include").click();
  keyDown($("include"), " ");
  check("options: Space unticks the box and leaves those items out again, keeping marks", $("include").getAttribute("aria-checked") === "false"
    && shownKeys().every((key) => !unique.has(key)) && byPath(path)?.self === "has" && same(listed(), listedBefore));
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
