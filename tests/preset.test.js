// Preset files, in the desktop app's .txt format. tests/fixtures/presets holds files the desktop app wrote
// (desktop-log.txt, desktop-v1.3.2.txt) and one written to its WriteLogFile rules (round-start.txt).
import assert from "node:assert/strict";
import { test } from "node:test";
import { CIVS, EDITIONS, idOf, logic, makeState, namedLog, namesOf, read } from "./helpers.js";

const { presetText, parsePreset, applyPreset, drawCandidates, emptyState } = logic;
const fixture = (name) => read(`tests/fixtures/presets/${name}`);
const loaded = (text) => {
  const s = emptyState();
  applyPreset(s, parsePreset(text));
  return s;
};
// The lines of one section of a preset file
function section(text, header) {
  const lines = text.split("\r\n");
  const out = [];
  for (let i = lines.indexOf(header) + 1; i > 0 && i < lines.length && lines[i] && !lines[i].endsWith(":"); i++) out.push(lines[i]);
  return out;
}

test("a preset the desktop app wrote mid-round loads its pool, edition and draws", () => {
  const text = fixture("desktop-log.txt");
  const s = loaded(text);
  const draws = section(text, "DrawnCivs:");
  assert.equal(s.edition, "DE");
  assert.equal(s.off.size, 0, "its civs are all on, and the civs it doesn't list stay on");
  // Its freshness history is all from this round, so there's no earlier round.
  assert.deepEqual(namedLog(s), [draws.map((name, i) => [name, i + 1, CIVS.length])]);
});

test("a preset from an older desktop app loads, passing over civ names it no longer has", () => {
  const text = fixture("desktop-v1.3.2.txt");
  assert.ok(text.includes("Incas 1") && text.includes("Mayans 1"), "the file still has the old names");
  const s = loaded(text);
  assert.deepEqual(namesOf([...s.off].sort((a, b) => a - b)), ["Bulgarians", "Goths", "Persians", "Sicilians"]);
  assert.deepEqual(s.log, [[]]);
});

test("a desktop preset loads and saves back byte for byte", () => {
  const text = fixture("round-start.txt");
  const s = loaded(text);
  assert.deepEqual(namesOf([...s.off].sort((a, b) => a - b)), ["Aztecs", "Wu"]);
  // The civs of the freshness history from before this round make an earlier round, without counts.
  assert.deepEqual(namedLog(s), [
    [["Huns", 0, 0], ["Franks", 0, 0], ["Teutons", 0, 0]],
    [["Celts", 1, CIVS.length - 2], ["Mongols", 2, CIVS.length - 2]],
  ]);
  assert.equal(presetText(s, true), text);
});

test("a saved preset lists every civ in ID order, this round's draws of civs that are on, and the edition", () => {
  const s = makeState({ edition: "HD", off: ["Celts"], log: [[["Huns", 1, 30], ["Celts", 2, 31], ["Franks", 2, 30]]] });
  const text = presetText(s, false);
  assert.ok(text.endsWith("\r\n") && !/[^\r]\n/.test(text), "every line ends in CRLF");
  assert.deepEqual(section(text, "CivStates:"), CIVS.map((c) => `${c.name} ${s.off.has(c.id) ? 0 : 1}`));
  assert.deepEqual(section(text, "DrawnCivs:"), ["Huns", "Franks"]);
  assert.deepEqual(section(text, "EditionState:"), ["HD"]);
  assert.ok(!text.includes("ContfreshCivArray:"), "no freshness history with continuous freshness off");
});

test("a saved preset's freshness history holds as many of the newest civs as could sit out, oldest first", () => {
  const past = CIVS.map((c, i) => [c.name, i + 1, CIVS.length]);
  const s = makeState({ log: [past, [["Celts", 1, CIVS.length], ["Franks", 2, CIVS.length]]] });
  const half = Math.floor(CIVS.length / 2);
  const newest = [...past.map(([name]) => name).filter((n) => n !== "Celts" && n !== "Franks").slice(-(half - 2)), "Celts", "Franks"];
  assert.deepEqual(section(presetText(s, true), "ContfreshCivArray:"), newest);
});

test("a preset is read from the default edition with every civ on, in any section order, to the first empty line", () => {
  const text = "EditionState:\nHD\nDrawnCivs:\nBritons\nWu\nCivStates:\nCelts 0\n\nDrawnCivs:\nFranks\n";
  const s = loaded(text);
  assert.equal(s.edition, "HD");
  assert.deepEqual(namedLog(s), [[["Britons", 1, 30]]], "Wu isn't in HD, and the second DrawnCivs is past the empty line");
  assert.ok(s.off.has(idOf("Celts")));
});

test("a preset with an unknown edition keeps the default one, and repeated or unknown draws are passed over", () => {
  const s = loaded("EditionState:\nXX\nDrawnCivs:\nCelts\nNonsense\nCelts\nFranks\n");
  assert.equal(s.edition, EDITIONS[0]);
  assert.deepEqual(namedLog(s), [[["Celts", 1, CIVS.length], ["Franks", 2, CIVS.length]]]);
});

test("text with none of the sections isn't a preset", () => {
  for (const text of ["", "\r\n", "hello\r\nworld\r\n", "Celts 1\r\nFranks 0\r\n", "\r\nCivStates:\r\nCelts 0\r\n"]) {
    assert.equal(parsePreset(text), null, JSON.stringify(text));
  }
});

test("after loading a preset, its earlier civs keep sitting out of the next draws", () => {
  const s = loaded(fixture("round-start.txt"));
  const candidates = drawCandidates(s, { fresh: true, freshN: 1000 });
  for (const name of ["Huns", "Franks", "Teutons", "Celts", "Mongols"]) assert.ok(!candidates.includes(idOf(name)), name);
});
