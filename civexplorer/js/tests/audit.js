import { data, tag, nameOf } from "../datahandler.js";
import { items } from "../model.js";
import { $ } from "../stringbuilder.js";
import { options } from "../optionshandler.js";
import {
  TAG, root, check, describe, rendered, everything, styles, pictured, focusables, tidy, nameFor, squash, visibleTexts,
  tabIcons,
} from "./helpers.js";

const MEDIA = "img, svg, canvas, picture, video, audio, object, embed, iframe, source, track, map, area";

const rgba = (value) => {
  const parts = (value.match(/[\d.]+/g) ?? []).map(Number);
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0, parts.length > 3 ? parts[3] : 1];
};

const blend = ([r, g, b, a], [R, G, B]) => [r * a + R * (1 - a), g * a + G * (1 - a), b * a + B * (1 - a)];

const backgroundOf = (el) => {
  const layers = [];
  for (let node = el; node; node = node.parentElement) {
    const color = rgba(getComputedStyle(node).backgroundColor);
    if (color[3] > 0) layers.push(color);
    if (color[3] === 1) break;
  }
  return layers.reverse().reduce((under, layer) => blend(layer, under), [255, 255, 255]);
};

const luminance = (rgb) => {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

const contrast = (a, b) => {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
};

const contrastOn = (colour, behind) => contrast(blend(rgba(colour), behind), behind);

function visibleCentre(el) {
  const view = { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
  for (let clip = el.parentElement; clip; clip = clip.parentElement) {
    if (getComputedStyle(clip).overflowY === "visible") continue;
    const edge = clip.getBoundingClientRect();
    Object.assign(view, {
      left: Math.max(view.left, edge.left), top: Math.max(view.top, edge.top),
      right: Math.min(view.right, edge.right), bottom: Math.min(view.bottom, edge.bottom),
    });
  }
  const box = el.getClientRects()[0] ?? el.getBoundingClientRect();
  return [(Math.max(box.left, view.left) + Math.min(box.right, view.right)) / 2,
    (Math.max(box.top, view.top) + Math.min(box.bottom, view.bottom)) / 2];
}

function focusChecks(list) {
  const outlines = [];
  const hidden = [];
  for (const el of focusables()) {
    el.focus();
    if (document.activeElement !== el) {
      outlines.push(`${describe(el)} cannot take focus`);
      continue;
    }
    const style = getComputedStyle(el);
    const behind = parseFloat(style.outlineOffset) >= 0 ? backgroundOf(el.parentElement) : backgroundOf(el);
    if (style.outlineStyle === "none" || parseFloat(style.outlineWidth) < 2
      || contrastOn(style.outlineColor, behind) < 3) outlines.push(describe(el));
    const [x, y] = visibleCentre(el);
    const hit = document.elementFromPoint(x, y);
    if (!hit || !el.contains(hit)) {
      hidden.push(`${describe(el)} under ${hit ? describe(hit) : "nothing"} at ${Math.round(x)},${Math.round(y)}`);
    }
  }
  document.activeElement?.blur();
  list("accessibility: focus shows a thick outline with a contrast of at least 3:1", outlines);
  list("accessibility: nothing covers what has focus", hidden);
}

function structureChecks(note, list) {
  note("accessibility: the page has a title and its language is set", document.title.trim() && root.lang === tag,
    root.lang);
  list("accessibility: language tags are valid, and each language choice is marked with its language", [
    ...[...document.querySelectorAll("[lang]")].filter((el) => !TAG.test(el.lang)),
    ...options().filter((option) => option.lang !== data.languages[option.dataset.language].tag),
  ].map(describe));
  const headings = [...document.querySelectorAll("h1, h2, h3, h4, h5, h6")].filter(rendered);
  note("accessibility: one header, main, footer and main heading", ["header", "main", "footer"]
    .every((name) => document.querySelectorAll(name).length === 1)
    && headings.filter((h) => h.tagName === "H1").length === 1);
  list("accessibility: headings have text and do not skip levels", headings.filter((h, i) => !h.textContent.trim()
    || (i > 0 && Number(h.tagName[1]) > Number(headings[i - 1].tagName[1]) + 1)).map(describe));
  const ids = [...document.querySelectorAll("[id]")].map((el) => el.id);
  const links = ["aria-labelledby", "aria-controls", "aria-describedby"];

  const missing = (el) => links.flatMap((name) => (el.getAttribute(name) ?? "").split(/\s+/))
    .filter((id) => id && !$(id)).map((id) => `${describe(el)} ${id}`);

  list("accessibility: ids are unique and ARIA references point to elements", [
    ...ids.filter((id, i) => ids.indexOf(id) !== i),
    ...[...document.querySelectorAll(links.map((name) => `[${name}]`).join(", "))].flatMap(missing),
  ]);
}

function controlChecks(list) {
  const expanded = (button, panel) => button.getAttribute("aria-expanded") === String(!panel.hidden);

  list("accessibility: checkboxes, branches and the language menu say what state they are in", [
    ...[...document.querySelectorAll("[role=checkbox]")]
      .filter((el) => !["true", "false", "mixed"].includes(el.getAttribute("aria-checked"))).map(describe),
    ...items.filter((item) => item.twisty && !expanded(item.twisty, item.list)).map(nameOf),
    ...(expanded($("languageButton"), $("languageList")) ? [] : [describe($("languageButton"))]),
  ]);
  const controls = focusables().filter((el) => el.matches("a, button, input, [role=checkbox]"));
  list("accessibility: every control has a name that contains its visible text", [
    ...[...controls, ...document.querySelectorAll("[role=checkbox]")].filter((el) => rendered(el) && !nameFor(el)),
    ...controls.filter((el) => !el.matches("input"))
      .filter((el) => visibleTexts(el).map(squash).some((text) => text && !squash(nameFor(el)).includes(text))),
  ].map(describe));
}

function colourChecks(all, list) {
  const texts = [...new Set(all.flatMap((el) => [...el.childNodes]
    .filter((child) => child.nodeType === Node.TEXT_NODE && child.textContent.trim()).map(() => el)))];
  list("accessibility: text has a contrast of at least 7:1, or 4.5:1 when large", texts.flatMap((el) => {
    const style = getComputedStyle(el);
    const ratio = contrastOn(style.color, backgroundOf(el));
    const fontSize = parseFloat(style.fontSize);
    const large = fontSize >= 24 || (fontSize >= 18.66 && Number(style.fontWeight) >= 700);
    return ratio < (large ? 4.5 : 7) ? [`${describe(el)} ${ratio.toFixed(2)}`] : [];
  }));
  list("accessibility: control borders have a contrast of at least 3:1", all
    .filter((el) => el.matches(".tool, .chip, input, .box")).flatMap((el) => {
      const style = getComputedStyle(el);
      const ratio = contrastOn(style.borderTopColor, backgroundOf(el.parentElement));
      return parseFloat(style.borderTopWidth) > 0 && ratio < 3 ? [`${describe(el)} ${ratio.toFixed(2)}`] : [];
    }));
}

function layoutChecks(all, note, list) {
  const inline = (el) => el.matches("p a") && tidy(el.parentElement.textContent) !== tidy(el.textContent);

  list("accessibility: targets are at least 44 by 44 pixels", focusables().filter((el) => !inline(el)).filter((el) => {
    const box = el.getBoundingClientRect();
    return box.width < 43.5 || box.height < 43.5;
  }).map(describe));
  note("layout: the page does not scroll", root.scrollHeight <= innerHeight && root.scrollWidth <= innerWidth,
    `${root.scrollWidth} by ${root.scrollHeight}`);
  list("layout: nothing sticks out sideways", all.filter((el) => {
    const box = el.getBoundingClientRect();
    return box.right > innerWidth + 0.5 || box.left < -0.5;
  }).map(describe));
  list("layout: text is not justified and has 1.5 line spacing", all.filter((el) => el.matches("p, li"))
    .filter((el) => {
      const style = getComputedStyle(el);
      return style.textAlign === "justify"
        || !(parseFloat(style.lineHeight) >= 1.5 * parseFloat(style.fontSize) - 0.01);
    }).map(describe));
}

function mediaChecks(all, list) {
  const moving = (style) => style.animationName.split(",").some((name) => name.trim() !== "none")
    || style.transitionDuration.split(",").some((time) => parseFloat(time) > 0);

  list("rules: no images, sounds, video or animations on the page or in its styles", [
    ...[...document.querySelectorAll(MEDIA), ...tabIcons(), ...[root, document.body, ...all].filter(pictured)]
      .map(describe),
    ...(document.getAnimations().length ? [`${document.getAnimations().length} running`] : []),
    ...all.filter((el) => styles(el).some(moving)).map(describe),
  ]);
}

export function audit(label, { focus = true } = {}) {
  const note = (name, ok, detail = "") => check(name, ok, detail === "" ? label : `${label}, ${detail}`);

  const list = (name, offenders) => note(name, !offenders.length, offenders.slice(0, 3).join("; "));

  const all = everything();
  structureChecks(note, list);
  controlChecks(list);
  colourChecks(all, list);
  layoutChecks(all, note, list);
  mediaChecks(all, list);
  if (focus) focusChecks(list);
}
