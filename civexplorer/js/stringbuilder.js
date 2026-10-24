import { data, words, tag, collator, plural, fill, nameOf, civName, civsOf } from "./datahandler.js";
import { items, matching, share, filtersOf, chipName } from "./model.js";

export const $ = (id) => document.getElementById(id);

export const clone = (id) => $(id).content.firstElementChild.cloneNode(true);

export const simple = () => !document.documentElement.classList.contains("pictures");

export function compose(node, template, values) {
  node.replaceChildren(...template.split(/(\{\w+\})/).filter(Boolean).map((part) => {
    const key = /^\{(\w+)\}$/.exec(part)?.[1];
    return key && Object.hasOwn(values, key) ? values[key] : part;
  }));
}

export function writeFixed() {
  for (const node of document.querySelectorAll("[data-tool]")) node.textContent = data.tools[node.dataset.tool];
  $("sourceLink").href = data.source.url;
  $("sourceLink").textContent = data.source.name;
  $("rulesLink").href = data.source.rules.url;
  $("rulesLink").textContent = data.source.rules.name;
  $("projectLink").href = data.source.project.url;
  $("projectLink").textContent = data.source.project.name;
  compose($("notice"), data.source.notice, { rules: $("rulesLink"), project: $("projectLink") });
}

export function writeTexts() {
  document.documentElement.lang = tag;
  for (const node of document.querySelectorAll("[data-text]")) node.textContent = words.ui[node.dataset.text];
  const [year, month] = data.source.updated.split("-").map(Number);
  compose($("source"), words.ui.source, {
    source: $("sourceLink"),
    date: new Intl.DateTimeFormat(tag, { year: "numeric", month: "long" }).format(new Date(year, month - 1)),
  });
}

export function label() {
  for (const item of items) item.label.textContent = nameOf(item);
  share();
}

const civIcon = (civ) => Object.assign(clone("civIconTemplate"), {
  src: `${data.icons.folder}${data.icons.names[civ] ?? civ.toLowerCase()}.png`,
});

export function listCivs(marked) {
  const civs = (marked ? civsOf(matching) : []).map((civ) => [civName(civ), civ]);
  $("count").textContent = plural("compatible", civs.length);
  $("civs").replaceChildren(...civs.sort(([a], [b]) => collator.compare(a, b)).map(([name, civ]) => {
    const li = clone("civTemplate");
    const link = li.firstElementChild;
    link.lastElementChild.textContent = name;
    if (!simple()) {
      link.href = `${data.source.url}#${civ}`;
      link.prepend(civIcon(civ));
    }
    return li;
  }));
  $("none").hidden = civs.length > 0;
  $("none").textContent = marked ? words.ui.noMatch : words.ui.start;
}

export function listFilters() {
  const filters = filtersOf();
  $("ticked").hidden = !filters.length;
  $("chips").replaceChildren(...filters.map(({ item, mark }) => {
    const li = clone("chipTemplate");
    const chip = li.querySelector(".chip");
    const name = chipName(item, mark);
    chip.dataset.i = item.i;
    chip.dataset.state = mark;
    li.querySelector(".chip-label").textContent = fill(words.ui[mark === "has" ? "clearHas" : "clearLacks"], { name });
    li.querySelector(".chip-name").textContent = name;
    return li;
  }));
}

export function showLoadError(shown = true) {
  $("loadError").hidden = !shown;
}
