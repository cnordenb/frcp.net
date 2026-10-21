import { ALL, fill, size, words, numbers, nameOf, plural, plain } from "../datahandler.js";
import { items, roots, state, lineOf, lineEnd, chipName } from "../model.js";
import { $, isOpen, setOpen, shown } from "../ui.js";
import { root, check, expect, wait, same, keyDown, tap, type, reset, beside, listed, expected, below } from "./helpers.js";

const chainOf = (item) => {
  const chain = [item];
  while (chain.at(-1).kids.length === 1) chain.push(chain.at(-1).kids[0]);
  return chain.filter((each) => each.twisty);
};

function marking({ partial, other, third, branch, line, group, headed, tower }) {
  reset();
  tap(partial.node);
  check("marking: a click marks an item must have, and lists and counts the civilisations that have it, in order", partial.self === "has"
    && partial.node.getAttribute("aria-checked") === "true" && same(listed(), expected(partial.set))
    && $("count").textContent === plural("compatible", size(partial.set)));
  check("filters: a marked item gets a filter button", $("chips").children.length === 1
    && $("chips").querySelector(".chip-label").textContent === fill(words.ui.clearHas, { name: chipName(partial, "has") }));
  keyDown(other.node, "x");
  check("marking: X marks an item must lack, and the civilisations that have it leave the list", other.self === "lacks"
    && other.lacking.textContent === words.ui.lacking && same(listed(), expected(partial.set & ~other.set & ALL)));
  const menu = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
  third.node.dispatchEvent(menu);
  check("marking: the menu key marks an item must lack", third.self === "lacks" && menu.defaultPrevented);
  keyDown(partial.node, " ");
  check("marking: Space on a marked item clears it", partial.self === null);
  $("clear").click();
  for (let p = branch.parent; p; p = p.parent) setOpen(p, true);
  const inBranch = items.filter((item) => below(item, branch));
  const branchHidden = inBranch.every((item) => !shown(item));
  tap(branch.node);
  check("marking: marking a building marks and shows everything in it", branchHidden && state(branch) === "has"
    && inBranch.every((item) => (item.group || item.self === "has") && shown(item)));
  check("filters: a whole branch has one filter button", $("chips").children.length === 1
    && $("chips").querySelector(".chip-name").textContent === fill(words.ui.full, { name: nameOf(branch) }));
  tap(branch.kids[0].node);
  check("marking: a partly marked branch is mixed", state(branch) === "mixed" && branch.node.getAttribute("aria-checked") === "mixed");
  $("clear").click();
  tap(line.node);
  const partLine = $("chips").children.length === 1
    && $("chips").querySelector(".chip-name").textContent === nameOf(lineOf(line).findLast((item) => item.self === "has"));
  tap(lineEnd(line).node);
  check("filters: a line has one filter button, named after its deepest must-have item", partLine && $("chips").children.length === 1
    && $("chips").querySelector(".chip-name").textContent === nameOf(lineEnd(line)));
  keyDown(lineEnd(line).node, "x");
  $("chips").querySelector("[data-state=has]").click();
  check("filters: a line's filter button clears only its own kind of mark", lineOf(line)
    .every((item) => item.self === (item === lineEnd(line) ? "lacks" : null)));
  $("clear").click();
  tap(headed.node);
  const fullName = $("chips").children.length === 1
    && $("chips").querySelector(".chip-name").textContent === fill(words.ui.full, { name: nameOf(headed) });
  $("clear").click();
  tap(tower.node);
  check("filters: a fully marked building at the top of a line is named Full, unless the line holds its upgrades", fullName
    && $("chips").children.length === 1 && $("chips").querySelector(".chip-name").textContent === nameOf(lineEnd(tower)));
  $("clear").click();
  const inGroup = items.filter((item) => below(item, group));
  const groupHidden = inGroup.every((item) => !shown(item));
  tap(group.node);
  check("marking: marking a top-level group marks and shows everything in it", groupHidden && state(group) === "has" && group.self === null
    && inGroup.every(shown));
}

function crowding() {
  reset();
  $("expandAll").click();
  const most = items.filter((item) => !item.group && !item.kids.length).reduce((best, item) => (size(item.set) > size(best.set) ? item : best));
  tap(most.node);
  const box = (el) => el.getBoundingClientRect();
  const panes = document.querySelector(".panes");
  const [tree, civs] = panes.querySelectorAll(".pane");
  const list = $("civScroll");
  const rows = getComputedStyle(panes).gridTemplateRows.split(" ").map(parseFloat);

  const scrolls = (el) => el.scrollHeight > el.clientHeight + 1;

  const top = box(civs).top;
  list.scrollTop = 1e6;
  const problems = [
    ...(listed().length === size(most.set) ? [] : [`${listed().length} civilisations listed`]),
    ...(root.scrollHeight <= innerHeight && root.scrollWidth <= innerWidth ? [] : [`the page is ${root.scrollWidth} by ${root.scrollHeight}`]),
    ...[tree, civs].filter((pane) => box(pane.querySelector(".pane-head")).bottom > box(pane).bottom + 0.5).map((pane) => `${pane.querySelector("h2").id} sticks out`),
    ...(box(tree).bottom <= box(civs).top + 0.5 || box(tree).right <= box(civs).left + 0.5 ? [] : ["the panes overlap"]),
    ...(!scrolls(list) || (list.scrollTop > 0 && box(civs).top === top) ? [] : ["the list does not scroll in its pane"]),
    ...(rows.length === 5 && scrolls(tree.querySelector(".scroll")) && scrolls(list) && Math.abs(rows[1] - rows[4]) > 1
      ? [`stacked lists of ${rows[1]} and ${rows[4]} pixels`] : []),
  ];
  list.scrollTop = 0;
  reset();
  expect("layout: with everything open and the most civilisations listed, the page does not scroll, the panes keep their headers and do not overlap, the list scrolls in its pane, and stacked panes share the height",
    problems);
}

function filterFocus({ other, third }) {
  reset();
  keyDown(other.node, "x");
  keyDown(third.node, "x");
  const firstChip = $("chips").querySelector(".chip");
  const cleared = items[firstChip.dataset.i];
  const left = cleared === other ? third : other;
  firstChip.click();
  check("filters: a filter button clears its item and moves focus to the next", cleared.self === null
    && document.activeElement === $("chips").querySelector(".chip") && Number(document.activeElement.dataset.i) === left.i);
  document.activeElement.click();
  check("filters: clearing the last filter moves focus to the civilisations heading and shows the hint", left.self === null
    && document.activeElement === $("civTitle") && !listed().length && !$("none").hidden && $("none").textContent === words.ui.start
    && $("ticked").hidden);
  reset();
}

async function gestures({ third }) {
  reset();
  const node = third.node;
  const box = node.getBoundingClientRect();
  const touch = { bubbles: true, pointerId: 7, pointerType: "touch", button: 0, clientX: box.left + 5, clientY: box.top + 5 };
  node.dispatchEvent(new PointerEvent("pointerdown", touch));
  await wait(600);
  node.dispatchEvent(new PointerEvent("pointerup", touch));
  node.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  const pressed = third.self === "lacks";
  const mouse = { bubbles: true, pointerId: 8, pointerType: "mouse", button: 2, clientX: box.left + 5, clientY: box.top + 5 };
  node.dispatchEvent(new PointerEvent("pointerdown", mouse));
  node.dispatchEvent(new PointerEvent("pointerup", mouse));
  node.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2 }));
  check("marking: a long press marks an item must lack, and a right-click on it clears it", pressed && third.self === null);
}

function parents({ leaves, branch, line, loose, underAll, without }) {
  reset();

  const unmarkedParents = () => items.filter((item) => !item.group && !item.optional && item.kids.length && item.self !== "has"
    && items.filter((each) => !each.group && below(each, item)).every((each) => each.self === "has")).map(nameOf);

  const chain = lineOf(line);
  tap(lineEnd(line).node);
  const lineMarked = chain.every((item) => item.self === "has") && line.node.getAttribute("aria-checked") === "true"
    && same(listed(), expected(chain.reduce((s, item) => s & item.set, ALL)));
  tap(lineEnd(line).node);
  check("marking: marking the last item of a line marks the whole line, and clearing it clears the line again", lineMarked
    && chain.every((item) => item.self === null));
  keyDown(line.node, "x");
  tap(lineEnd(line).node);
  check("marking: marking the last item of a line replaces must-lack marks above it", chain.every((item) => item.self === "has"));
  $("clear").click();
  leaves.filter((leaf) => below(leaf, branch)).forEach((leaf) => tap(leaf.node));
  check("marking: marking everything under an item marks the item too", branch.self === "has" && state(branch) === "has");
  $("clear").click();
  leaves.filter((leaf) => below(leaf, loose)).forEach((leaf) => tap(leaf.node));
  check("marking: an optional item stays unmarked when everything under it is marked", loose.self === null
    && state(loose) === "mixed" && same(listed(), expected(underAll(loose))));
  $("clear").click();
  keyDown(loose.node, "x");
  leaves.filter((leaf) => below(leaf, loose)).forEach((leaf) => tap(leaf.node));
  check("marking: an optional item can be must-lack while everything under it is must-have", loose.self === "lacks"
    && listed().length > 0 && same(listed(), expected(without(loose))));
  $("clear").click();
  leaves.filter((_, i) => i % 3 === 0).forEach((leaf) => tap(leaf.node));
  const some = unmarkedParents();
  leaves.forEach((leaf) => leaf.self !== "has" && tap(leaf.node));
  expect("marking: no item is left unmarked while everything under it is marked", [...some, ...unmarkedParents()]);

  const aboveOptional = (item) => items.some((each) => each.optional && below(each, item));

  expect("marking: marking every leaf marks every item, except optional ones and those above them", items
    .filter((item) => !item.group && item.self !== (item.optional || aboveOptional(item) ? null : "has")).map(nameOf));
  $("clear").click();
}

function lines({ uneven }) {
  reset();
  for (let p = uneven.parent; p; p = p.parent) setOpen(p, true);
  const rest = lineOf(uneven).slice(lineOf(uneven).indexOf(uneven));
  const run = rest.splice(0, rest.findIndex((item) => size(item.set) !== size(uneven.set)));
  const closed = !isOpen(uneven);
  tap(uneven.node);
  check("marking: marking a unit or technology opens it to its first fork or its end, showing all marked with it", closed
    && [...run, ...rest].every((item) => shown(item) && (!item.twisty || isOpen(item))));
  const passed = run.every((item) => item.self === "has") && rest.every((item) => item.self === null)
    && uneven.node.getAttribute("aria-checked") === "true" && same(listed(), expected(uneven.set));
  tap(lineEnd(uneven).node);
  keyDown(uneven.node, "x");
  check("marking: a unit or technology passes its mark down its line only to items with as many civilisations", passed
    && run.every((item) => item.self === "lacks") && rest.every((item) => item.self === null) && same(listed(), expected(ALL & ~uneven.set)));
  $("clear").click();
}

function counts({ partial, other, upgraded }) {
  reset();

  const fits = () => items.filter((item) => item.self).reduce((m, item) => m & (item.self === "has" ? item.set : ~item.set), ALL);

  const counted = (item) => {
    const own = size(fits() & (item.group ? item.all : item.set));
    const all = size(fits() & item.all);
    return !item.group && item.kids.length && !isOpen(item)
      ? [fill(words.ui.range, { own: numbers.format(own), all: numbers.format(all) }),
        fill(words.ui.civRange, { own: plural("civCount", own), all: plural("civCount", all) })]
      : [numbers.format(own), plural("civCount", own)];
  };

  const miscounted = () => items.filter((item) => {
    const [shownText, said] = counted(item);
    return item.count.textContent !== shownText || item.civCount.textContent !== said;
  }).map(nameOf);

  expect("counts: a closed item shows its own number, then the number with everything under it", miscounted());
  check("counts: a closed line shows the civilisations with its first item, then with its last upgrade",
    upgraded.count.textContent === fill(words.ui.range, { own: numbers.format(size(upgraded.set)), all: numbers.format(size(lineEnd(upgraded).set)) }));
  $("expandAll").click();
  expect("counts: open items show only their own number", miscounted());
  tap(partial.node);
  keyDown(other.node, "x");
  const open = miscounted();
  $("collapseAll").click();
  expect("counts: with filters, open and closed items count only the civilisations that fit", [...open, ...miscounted()]);
  $("clear").click();
}

function tree() {
  reset();
  $("expandAll").click();
  const expanded = items.every((item) => !item.twisty || isOpen(item));
  $("collapseAll").click();
  const collapsed = items.every((item) => !isOpen(item));
  roots[0].twisty.click();
  const opened = isOpen(roots[0]) && !roots[0].list.hidden;
  roots[0].twisty.click();
  check("tree: Expand all, Collapse all and each branch's arrow open and close branches", expanded && collapsed && opened
    && !isOpen(roots[0]) && roots[0].list.hidden);
  expect("tree: opening a branch also opens each only child below it, down to the first fork or the end", items
    .filter((item) => item.twisty).filter((item) => {
      $("collapseAll").click();
      item.twisty.click();
      return items.some((each) => isOpen(each) !== chainOf(item).includes(each));
    }).map(nameOf));
  $("collapseAll").click();
}

function keyboard({ line }) {
  reset();
  keyDown(line.node, "ArrowRight");
  check("keyboard: Right opens a line all the way down", chainOf(line).length > 1
    && items.every((each) => isOpen(each) === chainOf(line).includes(each)));
  $("collapseAll").click();
  roots[0].node.focus();
  keyDown(roots[0].node, "ArrowUp");
  const top = document.activeElement === roots[0].node;
  keyDown(roots[0].node, "ArrowDown");
  const down = top && document.activeElement === roots[1].node;
  keyDown(roots[1].node, "ArrowRight");
  const opens = isOpen(roots[1]);
  keyDown(roots[1].node, "ArrowRight");
  const into = document.activeElement === roots[1].kids[0].node;
  keyDown(roots[1].kids[0].node, "ArrowLeft");
  const back = document.activeElement === roots[1].node;
  keyDown(roots[1].node, "ArrowLeft");
  check("keyboard: Right opens a branch and goes into it, and Left goes back out and closes it", opens && into && back && !isOpen(roots[1]));
  keyDown(roots[1].node, "End");
  const end = document.activeElement === roots[roots.length - 1].node;
  keyDown(document.activeElement, "Home");
  check("keyboard: Down and Up step between items, stopping at the top, and End and Home go to the last and first", down && end
    && document.activeElement === roots[0].node);
  roots[0].twisty.focus();
  keyDown(roots[0].twisty, "ArrowDown");
  check("keyboard: on an arrow, Down goes to the next arrow", document.activeElement === roots[1].twisty);
  document.activeElement.blur();
}

function finding({ partial }) {
  reset();
  type(nameOf(partial));
  const matches = items.filter((item) => plain(nameOf(item)).includes(plain(nameOf(partial))));
  check("find: matches are marked and their number announced beside the box, with branches open down to each", partial.node.classList.contains("found")
    && items.every((item) => item.node.classList.contains("found") === matches.includes(item)) && matches.every((item) => shown(item))
    && $("found").textContent === plural("found", matches.length) && beside());
  type("qqqqzzzzqqqq");
  const none = $("found").textContent === words.ui.noneFound && !document.querySelector(".found") && beside();
  type("");
  check("find: no match says none found beside the box, and an empty search clears the result", none && $("found").textContent === "");
  reset();
}

function findKey({ partial }) {
  reset();
  type(nameOf(partial));
  keyDown($("find"), "Enter");
  check("find: Enter goes to the first match", document.activeElement
    === items.find((item) => plain(nameOf(item)).includes(plain(nameOf(partial)))).node);
  reset();
}

export async function behaviourTests(sample) {
  marking(sample);
  crowding();
  await gestures(sample);
  parents(sample);
  lines(sample);
  counts(sample);
  tree();
  finding(sample);
}

export function keyboardTests(sample) {
  filterFocus(sample);
  keyboard(sample);
  findKey(sample);
}
