// Drawing: whole rounds, continuous freshness, and the fairness of the next draw picked ahead of time.
import assert from "node:assert/strict";
import { test } from "node:test";
import { MersenneTwister } from "../logic.js";
import { CIVS, chiSquare, chiSquareLimit, logic, makeState, seeded } from "./helpers.js";

const { createPicker, drawCandidates, recordDraw, freshMax, poolIds } = logic;
const MOST = 1000; // a freshness setting at or above half the pool means "the most", as in script.js
const range = (from, to) => Array.from({ length: to - from }, (_, i) => from + i);

// Draws n civs as the page does, asking the picker for the next draw each time
function play(s, settings, rng, n) {
  const picker = createPicker(rng);
  const draws = [];
  for (let i = 0; i < n; i++) {
    const id = picker.next(drawCandidates(s, settings));
    recordDraw(s, id);
    draws.push(id);
  }
  return draws;
}
const rounds = (draws, size) => range(0, draws.length / size).map((r) => draws.slice(r * size, (r + 1) * size));
// How often each of the ids comes out of trials runs of pick()
function countPicks(ids, trials, pick) {
  const counts = Object.fromEntries(ids.map((id) => [id, 0]));
  for (let i = 0; i < trials; i++) {
    const id = pick();
    assert.ok(id in counts, `picked ${id}, which isn't one of the civs`);
    counts[id]++;
  }
  return counts;
}
function assertEven(counts) {
  const df = Object.keys(counts).length - 1;
  const chi = chiSquare(counts);
  assert.ok(chi < chiSquareLimit(df), `uneven picks (chi-square ${chi.toFixed(1)} for ${df} degrees of freedom): ${JSON.stringify(counts)}`);
}

test("the Mersenne Twister gives the reference outputs of mt19937ar.c", () => {
  assert.equal(new MersenneTwister(5489).nextUint32(), 3499211612);
  const mt = new MersenneTwister([0x123, 0x234, 0x345, 0x456]);
  assert.deepEqual([1, 2, 3, 4, 5].map(() => mt.nextUint32()), [1067595299, 955945823, 477289528, 4107218783, 4228976476]);
});

test("the Mersenne Twister's integers stay in range and refuse bad ranges", () => {
  const rng = seeded();
  for (let i = 0; i < 1000; i++) {
    const n = rng.int(3, 7);
    assert.ok(Number.isInteger(n) && n >= 3 && n <= 7);
  }
  assert.equal(rng.int(4, 4), 4);
  assert.throws(() => rng.int(5, 4), RangeError);
  assert.throws(() => rng.int(0.5, 4), RangeError);
});

test("every civ in the pool comes up once a round, before any repeats", () => {
  const pools = [
    makeState(),
    makeState({ edition: "HD" }),
    makeState({ off: CIVS.filter((c) => c.id % 3 === 0).map((c) => c.name) }),
  ];
  const settings = [{ fresh: true, freshN: MOST }, { fresh: true, freshN: 5 }, { fresh: false, freshN: MOST }];
  for (const start of pools) {
    for (const set of settings) {
      const s = structuredClone(start);
      const pool = poolIds(s);
      for (const r of rounds(play(s, set, seeded(), pool.length * 12), pool.length)) {
        assert.deepEqual([...r].sort((a, b) => a - b), pool, `a round of ${pool.length} with ${JSON.stringify(set)}`);
      }
    }
  }
});

test("continuous freshness keeps the newest civs out of the next round's first draws", () => {
  for (const freshN of [1, 5, MOST]) {
    const s = makeState();
    const size = poolIds(s).length;
    const n = Math.min(freshN, freshMax(size));
    const draws = play(s, { fresh: true, freshN }, seeded(), size * 30);
    for (let start = size; start < draws.length; start += size) {
      // The j-th draw of a round still has the last n - j civs of the round before sitting out.
      for (let j = 0; j < n; j++) {
        const sittingOut = draws.slice(start - (n - j), start);
        assert.ok(!sittingOut.includes(draws[start + j]), `freshness ${freshN}: draw ${j + 1} of a round repeats a civ from the last round's last ${n - j}`);
      }
    }
  }
});

test("without continuous freshness, a round can start with the civ the last one ended on", () => {
  const s = makeState({ edition: "AOK", off: CIVS.filter((c) => !["Britons", "Celts"].includes(c.name)).map((c) => c.name) });
  const draws = play(s, { fresh: false, freshN: MOST }, seeded(), 400);
  assert.ok(draws.some((id, i) => i > 0 && id === draws[i - 1]));
});

test("with continuous freshness, a pool of two civs takes turns", () => {
  const s = makeState({ edition: "AOK", off: CIVS.filter((c) => !["Britons", "Celts"].includes(c.name)).map((c) => c.name) });
  const draws = play(s, { fresh: true, freshN: MOST }, seeded(), 400);
  assert.ok(draws.every((id, i) => i === 0 || id !== draws[i - 1]));
});

test("a pool of one civ draws it every time, and an empty pool has nothing to draw", () => {
  const one = makeState({ off: CIVS.filter((c) => c.name !== "Celts").map((c) => c.name) });
  assert.ok(play(one, { fresh: true, freshN: MOST }, seeded(), 5).every((id) => CIVS[id].name === "Celts"));
  const none = makeState({ off: CIVS.map((c) => c.name) });
  assert.deepEqual(drawCandidates(none, { fresh: true, freshN: MOST }), []);
  assert.equal(createPicker(seeded()).next([]), null);
});

test("without a random source there's no pick", () => {
  assert.equal(createPicker(null).next([1, 2, 3]), null);
});

test("the next draw is an even pick from the civs it can be", () => {
  const rng = seeded();
  assertEven(countPicks(range(0, 12), 24000, () => createPicker(rng).next(range(0, 12))));
});

test("the next draw stays an even pick when civs join", () => {
  const rng = seeded();
  assertEven(countPicks(range(0, 15), 30000, () => {
    const picker = createPicker(rng);
    picker.next(range(0, 10));
    return picker.next(range(0, 15));
  }));
});

test("the next draw stays an even pick when civs drop out", () => {
  const rng = seeded();
  assertEven(countPicks(range(0, 10), 20000, () => {
    const picker = createPicker(rng);
    picker.next(range(0, 15));
    return picker.next(range(0, 10));
  }));
});

test("the next draw stays an even pick when civs join and others drop out", () => {
  const rng = seeded();
  assertEven(countPicks(range(5, 15), 20000, () => {
    const picker = createPicker(rng);
    picker.next(range(0, 10));
    return picker.next(range(5, 15));
  }));
});

test("the next draw stays put while it can, so its jingle only loads once", () => {
  const rng = seeded();
  for (let i = 0; i < 200; i++) {
    const picker = createPicker(rng);
    const from = range(0, 20);
    const id = picker.next(from);
    assert.equal(picker.next([...from].reverse()), id, "the same civs in another order");
    assert.equal(picker.next(from.filter((x) => x === id || x % 2 === id % 2)), id, "other civs dropping out");
  }
});

test("after a draw, the next one is picked again from the civs left", () => {
  const rng = seeded();
  for (let i = 0; i < 200; i++) {
    const picker = createPicker(rng);
    const from = range(0, 20);
    const drawn = picker.next(from);
    const left = from.filter((x) => x !== drawn);
    assert.ok(left.includes(picker.next(left)));
  }
});
