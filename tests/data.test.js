// data.json and the files it names: what the page needs to find for every edition, DLC and civ.
import assert from "node:assert/strict";
import { test } from "node:test";
import { CIVS, DATA, EDITIONS, exists, logic, read, webpSize } from "./helpers.js";

const { EDITION_INFO, DLCS } = logic;
const yearOf = (ed) => EDITION_INFO[ed].year;
const scriptConst = (name) => JSON.parse(new RegExp(`const ${name} = ([^;]+);`).exec(read("script.js"))[1]);
function cssGrid(selector) {
  const escaped = selector.replace(/[.#]/g, "\\$&");
  const m = new RegExp(`${escaped} \\{[^}]*--cols: (\\d+); --rows: (\\d+);`).exec(read("style.css"));
  assert.ok(m, `style.css gives ${selector} no --cols and --rows`);
  return { cols: Number(m[1]), rows: Number(m[2]) };
}

test("civ IDs run from 0 with no gaps or repeats", () => {
  assert.deepEqual(DATA.civs.map((c) => c.id).sort((a, b) => a - b), DATA.civs.map((_, i) => i));
});

test("civ names are unique", () => {
  const names = DATA.civs.map((c) => c.name);
  assert.equal(new Set(names).size, names.length);
});

test("every civ's DLC and every DLC's edition exist", () => {
  for (const c of DATA.civs) assert.ok(DLCS[c.dlc], `${c.name}'s DLC ${c.dlc} isn't in data.json`);
  for (const [key, dlc] of Object.entries(DLCS)) assert.ok(EDITIONS.includes(dlc.edition), `DLC ${key} has unknown edition ${dlc.edition}`);
});

test("editions have unique IDs and years, as which civs an edition has goes by year", () => {
  assert.equal(new Set(EDITIONS).size, EDITIONS.length);
  assert.equal(new Set(EDITIONS.map(yearOf)).size, EDITIONS.length);
});

test("each edition's DLC toggles and older DLCs are DLCs it has", () => {
  for (const ed of EDITIONS) {
    for (const dlc of [...EDITION_INFO[ed].dlcToggles, ...EDITION_INFO[ed].olderDlcs]) {
      assert.ok(DLCS[dlc], `${ed} names unknown DLC ${dlc}`);
      assert.ok(yearOf(DLCS[dlc].edition) <= yearOf(ed), `${ed} names ${dlc}, a DLC of the newer ${DLCS[dlc].edition}`);
    }
  }
});

test("every DLC toggle and edition has a hotkey", () => {
  const longest = Math.max(...EDITIONS.map((ed) => EDITION_INFO[ed].dlcToggles.length));
  assert.ok(longest <= scriptConst("DLC_KEYS").length, `an edition has ${longest} DLC toggles, more than DLC_KEYS in script.js`);
  assert.ok(EDITIONS.length <= scriptConst("EDITION_KEYS").length, "more editions than EDITION_KEYS in script.js");
});

test("every civ has an icon and a jingle, and a legacy jingle where its edition has them", () => {
  for (const c of CIVS) {
    assert.ok(exists(`images/civ/${c.file}.webp`), `no icon for ${c.name}`);
    assert.ok(exists(`sounds/civ/${c.file}.webm`), `no jingle for ${c.name}`);
    if (c.legacy) assert.ok(exists(`sounds/civ/legacy/${c.file}.webm`), `no legacy jingle for ${c.name}`);
  }
  for (const f of ["images/civ/random.webp", "sounds/civ/random.webm", "sounds/civ/legacy/random.webm"]) assert.ok(exists(f), `no ${f}`);
});

test("every edition has its icons and banner, and every DLC with an icon has its file", () => {
  for (const ed of DATA.editions) {
    for (const suffix of ["", "_hover", "_pressed"]) assert.ok(exists(`images/dlc/${ed.icon}${suffix}.webp`), `no ${ed.icon}${suffix}.webp`);
    assert.ok(exists(`images/dlc/${ed.banner}.webp`), `no ${ed.banner}.webp`);
  }
  for (const dlc of Object.values(DLCS)) if (dlc.icon) assert.ok(exists(`images/dlc/${dlc.icon}.webp`), `no ${dlc.icon}.webp`);
});

// tools/atlas_builder.py builds the atlases from data.json. These fail when a civ, edition or DLC was added without
// rebuilding them, or without updating the grid sizes in style.css and script.js.
test("the civ icon atlas has a cell for every civ and random", () => {
  const grid = cssGrid(".civ-cell");
  assert.equal(grid.cols, scriptConst("CIV_ATLAS_COLS"), "style.css and script.js disagree on the civ atlas's columns");
  assert.equal(grid.rows, Math.ceil((CIVS.length + 1) / grid.cols), "style.css has the wrong --rows for the civ atlas");
  assert.deepEqual(webpSize("images/civ/civicon_atlas.webp"), { width: grid.cols * 30, height: grid.rows * 30 },
    "civicon_atlas.webp is out of date: run tools/atlas_builder.py");
});

test("the DLC icon atlas has cells for every edition's three looks and every DLC icon", () => {
  const grid = cssGrid(".dlc-cell");
  const cells = 3 * EDITIONS.length + Object.values(DLCS).filter((d) => d.icon).length;
  assert.equal(grid.cols, scriptConst("DLC_ATLAS_COLS"), "style.css and script.js disagree on the DLC atlas's columns");
  assert.equal(grid.rows, Math.ceil(cells / grid.cols), "style.css has the wrong --rows for the DLC atlas");
  assert.deepEqual(webpSize("images/dlc/dlc_atlas.webp"), { width: grid.cols * 128, height: grid.rows * 128 },
    "dlc_atlas.webp is out of date: run tools/atlas_builder.py");
});

test("the banner atlas stacks every edition's banner", () => {
  const grid = cssGrid("#editionIcon");
  const banner = webpSize(`images/dlc/${DATA.editions[0].banner}.webp`);
  assert.equal(grid.rows, EDITIONS.length, "style.css has the wrong --rows for the banner atlas");
  assert.deepEqual(webpSize("images/dlc/edition_banners_atlas.webp"), { width: banner.width, height: EDITIONS.length * banner.height },
    "edition_banners_atlas.webp is out of date: run tools/atlas_builder.py");
});
