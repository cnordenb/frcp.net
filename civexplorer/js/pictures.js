import { recall, remember, words } from "./datahandler.js";
import { $, simple } from "./stringbuilder.js";
import { itemAt } from "./nodetree.js";
import { tick, choices } from "./optionshandler.js";

export let view = "list";

const showView = (choice) => {
  for (const input of $("views").querySelectorAll("input")) input.checked = input.value === choice;
};

export function setView(choice) {
  view = choice;
  remember("civView", choice);
  $("civs").classList.toggle("tiles", choice === "tile");
  showView(choice);
}

export let tips = true;

export function setTips(on) {
  tips = on;
  remember("tooltips", String(on));
  tick("tooltips", on);
}

const tipFor = (target) => {
  if (itemAt(target)) return words.ui.nodeTip;
  if (target.closest?.("#include")) return words.ui.includeHint;
  return target.closest?.(".civs a")?.href ?? "";
};

function wireTip() {
  const tip = $("tip");
  document.addEventListener("pointermove", (e) => {
    const host = e.target.closest?.("dialog[open]") ?? document.body;
    if (tip.parentElement !== host) host.append(tip);
    tip.textContent = simple() || !tips || e.pointerType !== "mouse" ? "" : tipFor(e.target);
    tip.hidden = !tip.textContent;
    if (tip.hidden) return;
    const reach = Number(getComputedStyle(tip).getPropertyValue("--reach"));
    const below = e.clientY + reach + tip.offsetHeight <= innerHeight - 4;
    tip.style.setProperty("--x", Math.max(4, Math.min(e.clientX + reach, innerWidth - tip.offsetWidth - 4)));
    tip.style.setProperty("--y", below ? e.clientY + reach : e.clientY - tip.offsetHeight - 8);
  });
  document.documentElement.addEventListener("pointerleave", () => {
    tip.hidden = true;
  });
}

export function startPictures() {
  setView(recall("civView") === "tile" ? "tile" : "list");
  setTips(recall("tooltips") !== "false");
  choices.civView = {
    now: () => view, set: setView, shown: () => $("views").querySelector(":checked").value, show: showView,
  };
  choices.tooltips = { now: () => tips, set: setTips };
  wireTip();
}
