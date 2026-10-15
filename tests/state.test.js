// The saved state: reading back what the page stored, whatever shape it's in, and the log's bookkeeping.
import assert from "node:assert/strict";
import { test } from "node:test";
import { CIVS, EDITIONS, idOf, logic, makeState, namedLog } from "./helpers.js";

const { emptyState, parseState, serialiseState, hasContent, trimLog, recordDraw, closeRound } = logic;
const stored = (data) => JSON.stringify(data);

test("a new state is the default edition with every civ on and an empty round", () => {
  const s = emptyState();
  assert.equal(s.edition, EDITIONS[0]);
  assert.equal(s.off.size, 0);
  assert.deepEqual(s.log, [[]]);
  assert.equal(hasContent(s), false);
});

test("a saved state reads back as it was", () => {
  const s = makeState({ off: ["Aztecs", "Wu"], log: [[["Huns", 1, 54], ["Celts", 2, 54]], [["Franks", 1, 54]]] });
  const back = parseState(stored(serialiseState(s)));
  assert.deepEqual(back, s);
  assert.equal(hasContent(back), true);
});

test("anything that isn't a saved state reads as nothing", () => {
  for (const raw of [null, "", "not json", "[]", "{}", "42", stored({ edition: "XX" }), stored({ edition: null })]) {
    assert.equal(parseState(raw), null, String(raw));
  }
});

test("a saved state keeps only the parts that make sense", () => {
  const s = parseState(stored({
    edition: "DE",
    disabled: [1, -1, 999, 2.5, "3", null],
    log: [
      [[10, 1, 56], [999, 2, 56], ["x", 3, 56], [11, "4", 56], [12, 5]],
      "not a round",
      [],
      [[13, 1, 56], [13, 2, 56], [14, 3, 56]],
    ],
  }));
  assert.deepEqual([...s.off], [1]);
  // Unknown civs and broken entries go, as do empty past rounds; the current round loses its repeats.
  assert.deepEqual(s.log, [[[10, 1, 56]], [[13, 1, 56], [14, 3, 56]]]);
});

test("a saved state with no log gets an empty round", () => {
  assert.deepEqual(parseState(stored({ edition: "DE" })).log, [[]]);
  assert.deepEqual(parseState(stored({ edition: "DE", log: [[], []] })).log, [[]]);
});

test("a saved state of an older edition has the newer civs off", () => {
  const s = parseState(stored({ edition: "AOK", disabled: [] }));
  for (const c of CIVS) assert.equal(s.off.has(c.id), !logic.inEdition(c, "AOK"), c.name);
});

test("a draw is counted out of the pool, and the draw after a full round starts a new one", () => {
  const s = makeState({ edition: "AOK", off: CIVS.filter((c) => !["Britons", "Celts"].includes(c.name)).map((c) => c.name) });
  recordDraw(s, idOf("Celts"));
  recordDraw(s, idOf("Britons"));
  recordDraw(s, idOf("Britons"));
  assert.deepEqual(namedLog(s), [[["Celts", 1, 2], ["Britons", 2, 2]], [["Britons", 1, 2]]]);
});

test("closing a round adds one empty round, and never two", () => {
  const s = makeState({ log: [[["Celts", 1, 56]]] });
  closeRound(s);
  closeRound(s);
  assert.deepEqual(namedLog(s), [[["Celts", 1, 56]], []]);
});

test("the log keeps its newest 256 draws, dropping the oldest first but never the current round", () => {
  const s = emptyState();
  s.log = [];
  for (let r = 0; r < 6; r++) s.log.push(CIVS.map((c) => [c.id, c.id + 1, CIVS.length]));
  trimLog(s);
  assert.equal(s.log.reduce((n, r) => n + r.length, 0), 256);
  assert.deepEqual(s.log[s.log.length - 1], CIVS.map((c) => [c.id, c.id + 1, CIVS.length]));
  const dropped = 6 * CIVS.length - 256;
  assert.equal(s.log.length, 6 - Math.floor(dropped / CIVS.length));
  assert.equal(s.log[0][0][0], dropped % CIVS.length);

  const big = emptyState();
  big.log = [Array.from({ length: 300 }, (_, i) => [i % CIVS.length, i + 1, 300])];
  trimLog(big);
  assert.equal(big.log[0].length, 300, "a current round longer than the cap stays whole");
});
