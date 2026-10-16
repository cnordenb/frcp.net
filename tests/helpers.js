// What the tests share: the project's files, its data and rules, and a few helpers.
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MersenneTwister, createLogic } from "../logic.js";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");
export const readJson = (rel) => JSON.parse(read(rel));
export const exists = (rel) => existsSync(path.join(ROOT, rel));

export const DATA = readJson("data.json");
export const logic = createLogic(DATA);
export const { CIVS, EDITIONS } = logic;

export function idOf(name) {
  const civ = CIVS.find((c) => c.name === name);
  if (!civ) throw new Error(`No civ named ${name}`);
  return civ.id;
}
export const namesOf = (ids) => ids.map((id) => CIVS[id].name);

// A state from civ names: the edition, the civs that are off, and the log's rounds, oldest first, each a list of
// [name, k, n] entries
export function makeState({ edition = EDITIONS[0], off = [], log = [[]] } = {}) {
  const s = { edition, off: new Set(off.map(idOf)), log: log.map((r) => r.map(([name, k, n]) => [idOf(name), k, n])) };
  logic.applyEdition(s);
  return s;
}
// The log with names in place of IDs, for readable comparisons
export const namedLog = (s) => s.log.map((r) => r.map(([id, k, n]) => [CIVS[id].name, k, n]));

// The same numbers on every run, so a statistical test either always passes or always fails
export const seeded = (seed = 20261016) => new MersenneTwister(seed);

// Pearson's chi-square statistic for counts that should all be equal, and the value it stays under with
// probability 0.999 for df degrees of freedom (Wilson-Hilferty approximation)
export function chiSquare(counts) {
  const values = Object.values(counts);
  const expected = values.reduce((a, b) => a + b, 0) / values.length;
  return values.reduce((sum, v) => sum + (v - expected) ** 2 / expected, 0);
}
export function chiSquareLimit(df) {
  const z = 3.09;
  return df * (1 - 2 / (9 * df) + z * Math.sqrt(2 / (9 * df))) ** 3;
}

// Width and height from a WebP file's header, for the lossy, lossless and extended formats
export function webpSize(rel) {
  const b = readFileSync(path.join(ROOT, rel));
  if (b.toString("ascii", 0, 4) !== "RIFF" || b.toString("ascii", 8, 12) !== "WEBP") throw new Error(`${rel} isn't a WebP file`);
  const chunk = b.toString("ascii", 12, 16);
  if (chunk === "VP8X") return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) };
  if (chunk === "VP8L") {
    const bits = b.readUInt32LE(21);
    return { width: 1 + (bits & 0x3fff), height: 1 + ((bits >>> 14) & 0x3fff) };
  }
  if (chunk === "VP8 ") return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff };
  throw new Error(`${rel} has an unknown WebP chunk ${chunk}`);
}
