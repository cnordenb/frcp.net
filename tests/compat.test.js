// Compatibility: what share links, saved data and preset files from earlier versions and from the desktop app rely
// on. The desktop checks compare with the desktop app's repository, found at FRCP_DESKTOP_DIR or next to this one,
// and are skipped when it isn't there.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { B64 } from "../logic.js";
import { CIVS, DATA, EDITIONS, ROOT, idOf, logic, readJson } from "./helpers.js";

const DESKTOP_DIR = path.resolve(process.env.FRCP_DESKTOP_DIR || path.join(ROOT, "..", "Fresh-Random-Civ-Picker_GUI"));
const desktopFile = (name) => path.join(DESKTOP_DIR, "Fresh-Random-Civ-Picker_CPPGUI", name);
const hasDesktop = existsSync(desktopFile("data.json"));
const skipDesktop = hasDesktop ? false : `no desktop app data.json under ${DESKTOP_DIR} (set FRCP_DESKTOP_DIR)`;
const desktopData = () => JSON.parse(readFileSync(desktopFile("data.json"), "utf8"));

test("civ IDs never change, and every civ has its ID frozen", () => {
  const frozen = readJson("tests/fixtures/civ-ids.json");
  frozen.forEach((name, id) => {
    assert.ok(CIVS[id], `civ ${id} (${name}) is gone: share links and saved data still refer to it`);
    assert.equal(CIVS[id].name, name, `civ ${id} was ${name}: share links and saved data refer to civs by ID`);
  });
  for (const c of CIVS.slice(frozen.length)) {
    assert.fail(`civ ${c.id} (${c.name}) isn't in tests/fixtures/civ-ids.json: add it at the end to freeze its ID`);
  }
});

test("share links written by earlier versions open as they did", () => {
  for (const f of readJson("tests/fixtures/share-links.json")) {
    const opened = logic.parseShare(f.link);
    assert.ok(opened, `${f.note}: ${f.link} no longer opens`);
    assert.equal(opened.edition, f.edition, f.note);
    const off = CIVS.filter((c) => logic.inEdition(c, f.edition) && !opened.enabled[c.id]).map((c) => c.name);
    assert.deepEqual(off, f.off, f.note);
    assert.deepEqual(opened.draws, f.draws.map(idOf), f.note);
  }
});

test("a share link can name every civ (format 1 spends one character per draw)", () => {
  assert.ok(CIVS.length <= B64.length,
    `${CIVS.length} civs, but link format 1 can only name ${B64.length}: share links need a new format version`);
});

test("civ names and edition IDs are single words, as preset files split their lines on spaces", () => {
  for (const c of CIVS) assert.match(c.name, /^\S+$/, `civ ${c.id}`);
  for (const c of CIVS) assert.ok(!c.name.endsWith(":"), `civ ${c.name} would read as a preset section header`);
  for (const ed of EDITIONS) assert.match(ed, /^\S+$/);
});

test("the desktop app has room for every civ", { skip: skipDesktop }, () => {
  const limits = readFileSync(desktopFile("CivDataLimits.h"), "utf8");
  const m = /constexpr int MAX_CIVS = (\d+);/.exec(limits);
  assert.ok(m, "CivDataLimits.h has no MAX_CIVS");
  assert.ok(CIVS.length <= Number(m[1]), `${CIVS.length} civs, but the desktop app's MAX_CIVS is ${m[1]}`);
});

test("the desktop app's civs have the same IDs, names and DLCs", { skip: skipDesktop }, () => {
  const civ = (c) => `${c.id} ${c.name} (${c.dlc})`;
  assert.deepEqual(desktopData().civs.map(civ).sort(), DATA.civs.map(civ).sort());
});

test("the desktop app's editions are in the same order with the same years", { skip: skipDesktop }, () => {
  const edition = (e) => `${e.id} ${e.year}`;
  assert.deepEqual(desktopData().editions.map(edition), DATA.editions.map(edition), "share links store an edition by its place");
});

test("the desktop app's DLCs belong to the same editions", { skip: skipDesktop }, () => {
  const editions = (dlcs) => Object.fromEntries(Object.entries(dlcs).map(([key, d]) => [key, d.edition]));
  assert.deepEqual(editions(desktopData().dlcs), editions(DATA.dlcs));
});
