// Share links. The first tests mirror the desktop app's UnitTesting_FRCP/ShareLinkTest.cpp one for one, so both apps
// write and open links by the same rules.
import assert from "node:assert/strict";
import { test } from "node:test";
import { B64 } from "../logic.js";
import { CIVS, EDITIONS, idOf, logic, makeState, namedLog } from "./helpers.js";

const { shareCode, parseShare, applyLink, matchesLink, inEdition } = logic;
const ADDRESS = "https://frcp.net/#p=";
const link = (s, withDraws = true) => ADDRESS + shareCode(s, withDraws);
const bitfieldLength = Math.ceil(CIVS.length / 6);

// The edition's civs, every third one left out, and up to three draws from the rest in reverse ID order
function samplePool(ed) {
  const s = { edition: ed, off: new Set(CIVS.filter((c) => !inEdition(c, ed) || c.id % 3 === 1).map((c) => c.id)), log: [[]] };
  const draws = CIVS.filter((c) => !s.off.has(c.id)).reverse().slice(0, 3);
  s.log = [draws.map((c, i) => [c.id, i + 1, CIVS.length])];
  return s;
}
// What a link should open as, for the pool of state s
const expected = (s) => ({ edition: s.edition, enabled: CIVS.map((c) => !s.off.has(c.id)), draws: s.log[s.log.length - 1].map((e) => e[0]) });

test("a link starts with the address, the format version and the edition", () => {
  assert.ok(link(samplePool(EDITIONS[0])).startsWith(ADDRESS + "1" + B64[0]));
});

test("a full pool is all set bits, and draws follow a dot", () => {
  EDITIONS.forEach((ed, e) => {
    if (logic.editionTotal(ed) !== CIVS.length) return;
    const s = { edition: ed, off: new Set(), log: [[]] };
    const bits = "_".repeat(bitfieldLength);
    assert.equal(link(s), ADDRESS + "1" + B64[e] + bits);
    s.log = [[[0, 1, CIVS.length], [CIVS.length - 1, 2, CIVS.length]]];
    assert.equal(link(s), ADDRESS + "1" + B64[e] + bits + "." + B64[0] + B64[CIVS.length - 1]);
  });
});

test("a link opens as what it was written from, for every edition", () => {
  for (const ed of EDITIONS) {
    const s = samplePool(ed);
    assert.deepEqual(parseShare(link(s)), expected(s), ed);
  }
});

test("a link opens with or without its address", () => {
  const s = samplePool(EDITIONS[0]);
  const code = shareCode(s, true);
  const texts = [code, "p=" + code, "#p=" + code, "  \t" + ADDRESS + code + " \n", "https://example.org/index.html?x=1#p=" + code, "%31" + code.slice(1)];
  for (const text of texts) assert.deepEqual(parseShare(text), expected(s), JSON.stringify(text));
});

test("the civs past a short bitfield are on", () => {
  const opened = parseShare(ADDRESS + "1" + B64[0] + "A");
  assert.deepEqual(opened.enabled, CIVS.map((c) => c.id >= 6 && inEdition(c, EDITIONS[0])));
  assert.deepEqual(opened.draws, []);
});

test("the civs of newer editions are left out", () => {
  EDITIONS.forEach((ed, e) => {
    const opened = parseShare(ADDRESS + "1" + B64[e] + "_".repeat(bitfieldLength));
    assert.deepEqual(opened.enabled, CIVS.map((c) => inEdition(c, ed)), ed);
  });
});

test("text that isn't a link opens as nothing", () => {
  const ed = B64[0];
  const noEdition = B64[EDITIONS.length];
  const noCiv = B64[CIVS.length];
  const texts = [
    "", "   ", "hello", ADDRESS, ADDRESS + "1", ADDRESS + "1" + ed, ADDRESS + "2" + ed + "_",
    ADDRESS + "1" + ed + "_.", ADDRESS + "1" + ed + "_..A", ADDRESS + "1" + ed + "_!",
    ADDRESS + "1" + ed + "_.A.B", ADDRESS + "1" + noEdition + "_",
    ADDRESS + "1" + ed + "_." + noCiv,
    ADDRESS + "1" + ed + "_.AA", ADDRESS + "1" + ed + "A.A", ADDRESS + "%", ADDRESS + "%3",
    ADDRESS + "%G1" + ed + "_", ADDRESS + "1" + ed + "_%C3%A4", ADDRESS + "1" + ed + "_ä",
    ADDRESS + "1" + ed + "_ A",
  ];
  for (const text of texts) assert.equal(parseShare(text), null, JSON.stringify(text));
});

// The web version's own behaviour

test("a link leaves out the draws of civs that are off, and the draws altogether when asked", () => {
  const s = makeState({ off: ["Wu"], log: [[["Celts", 1, 55], ["Wu", 2, 56], ["Franks", 3, 55]]] });
  assert.deepEqual(parseShare(link(s)).draws, [idOf("Celts"), idOf("Franks")]);
  assert.deepEqual(parseShare(link(s, false)).draws, []);
});

test("opening a link replaces the pool and starts a round of its draws, keeping past rounds", () => {
  const s = makeState({ log: [[["Huns", 1, 56]], [["Celts", 1, 56], ["Franks", 2, 56]]] });
  applyLink(s, parseShare("1B__________.KF"));
  assert.equal(s.edition, "HD");
  assert.deepEqual(namedLog(s), [[["Huns", 1, 56]], [["Celts", 1, 56], ["Franks", 2, 56]], [["Celts", 1, 31], ["Britons", 2, 31]]]);
});

test("opening a link without draws starts an empty round", () => {
  const s = makeState({ log: [[["Celts", 1, 56]]] });
  applyLink(s, parseShare("1A__________"));
  assert.deepEqual(namedLog(s), [[["Celts", 1, 56]], []]);
});

test("a link matches the session it was copied from, and only one with its edition, pool and round", () => {
  const s = makeState({ off: ["Wu"], log: [[["Huns", 1, 55]], [["Celts", 1, 55], ["Franks", 2, 55]]] });
  assert.ok(matchesLink(s, parseShare(link(s))));
  assert.ok(matchesLink(makeState(), parseShare(link(makeState()))));
  assert.ok(!matchesLink(s, parseShare(link(s, false))), "without this round's draws");
  const others = [
    makeState({ edition: "HD", off: ["Wu"], log: [[["Celts", 1, 31], ["Franks", 2, 31]]] }),
    makeState({ off: ["Wu", "Huns"], log: [[["Celts", 1, 54], ["Franks", 2, 54]]] }),
    makeState({ off: [], log: [[["Celts", 1, 56], ["Franks", 2, 56]]] }),
    makeState({ off: ["Wu"], log: [[["Franks", 1, 55], ["Celts", 2, 55]]] }),
    makeState({ off: ["Wu"], log: [[["Celts", 1, 55]]] }),
    makeState({ off: ["Wu"], log: [[["Celts", 1, 55], ["Franks", 2, 55], ["Huns", 3, 55]]] }),
  ];
  for (const other of others) assert.ok(!matchesLink(s, parseShare(link(other))), JSON.stringify(namedLog(other)));
});

test("a link drawn with a civ that is now off doesn't match, as opening it would drop that draw", () => {
  const s = makeState({ off: ["Wu"], log: [[["Celts", 1, 56], ["Wu", 2, 56]]] });
  assert.ok(!matchesLink(s, parseShare(link(s))));
});
