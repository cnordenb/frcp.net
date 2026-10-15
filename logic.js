// The picker's rules without the page: the civ data, the saved state, drawing, share links and preset files. Nothing
// here touches the page, storage or sound, so script.js runs the page on top of it and tests/ checks it under Node.

// Mersenne Twister, from cnordenb/mersennetwister_html
/**
 * MT19937 — 32-bit Mersenne Twister, port of mt19937ar.c by Matsumoto & Nishimura.
 * Seeds from crypto.getRandomValues() by default. NOT cryptographically secure output.
 */
export class MersenneTwister {
  static #N = 624;
  static #M = 397;
  #mt = new Uint32Array(624);
  #index = 624;

  /** Fresh seed from the browser's cryptographic random source. */
  static secureSeed(words = 624) {
    const c = globalThis.crypto;
    if (!c || typeof c.getRandomValues !== "function") {
      throw new Error("No cryptographic random source available");
    }
    return c.getRandomValues(new Uint32Array(words));
  }

  /** @param {number | number[] | Uint32Array} [seed] Defaults to a 624-word crypto seed. */
  constructor(seed = MersenneTwister.secureSeed()) {
    if (Array.isArray(seed) || ArrayBuffer.isView(seed)) this.seedArray(seed);
    else this.seed(seed);
  }

  /** Re-seed with a single 32-bit integer (init_genrand). */
  seed(s) {
    const mt = this.#mt, N = MersenneTwister.#N;
    mt[0] = s >>> 0;
    for (let i = 1; i < N; i++) {
      const prev = mt[i - 1] ^ (mt[i - 1] >>> 30);
      mt[i] = Math.imul(1812433253, prev) + i;
    }
    this.#index = N;
    return this;
  }

  /** Re-seed with an array or typed array of 32-bit integers (init_by_array). */
  seedArray(key) {
    if (key.length === 0) throw new RangeError("Seed array must not be empty");
    this.seed(19650218);
    const mt = this.#mt, N = MersenneTwister.#N;
    let i = 1, j = 0;
    for (let k = Math.max(N, key.length); k > 0; k--) {
      const prev = mt[i - 1] ^ (mt[i - 1] >>> 30);
      mt[i] = (mt[i] ^ Math.imul(prev, 1664525)) + (key[j] >>> 0) + j;
      i++; j++;
      if (i >= N) { mt[0] = mt[N - 1]; i = 1; }
      if (j >= key.length) j = 0;
    }
    for (let k = N - 1; k > 0; k--) {
      const prev = mt[i - 1] ^ (mt[i - 1] >>> 30);
      mt[i] = (mt[i] ^ Math.imul(prev, 1566083941)) - i;
      i++;
      if (i >= N) { mt[0] = mt[N - 1]; i = 1; }
    }
    mt[0] = 0x80000000;
    this.#index = N;
    return this;
  }

  #twist() {
    const mt = this.#mt, N = MersenneTwister.#N, M = MersenneTwister.#M;
    for (let k = 0; k < N; k++) {
      const y = (mt[k] & 0x80000000) | (mt[(k + 1) % N] & 0x7fffffff);
      mt[k] = mt[(k + M) % N] ^ (y >>> 1) ^ (y & 1 ? 0x9908b0df : 0);
    }
    this.#index = 0;
  }

  /** Unsigned 32-bit integer in [0, 2^32 − 1]. */
  nextUint32() {
    if (this.#index >= MersenneTwister.#N) this.#twist();
    let y = this.#mt[this.#index++];
    y ^= y >>> 11;
    y ^= (y << 7) & 0x9d2c5680;
    y ^= (y << 15) & 0xefc60000;
    y ^= y >>> 18;
    return y >>> 0;
  }

  /** Float in [0, 1) with 32-bit resolution, like Math.random(). */
  random() { return this.nextUint32() / 4294967296; }

  /** Float in [0, 1) with full 53-bit precision. */
  random53() {
    const a = this.nextUint32() >>> 5, b = this.nextUint32() >>> 6;
    return (a * 67108864 + b) / 9007199254740992;
  }

  /** Unbiased integer in [min, max] inclusive. */
  int(min, max) {
    if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
      throw new RangeError("min and max must be integers with min <= max");
    }
    const range = max - min + 1;
    if (range > 4294967296) throw new RangeError("Range must not exceed 2^32");
    const limit = 4294967296 - (4294967296 % range);
    let r;
    do r = this.nextUint32(); while (r >= limit);
    return min + (r % range);
  }
}

export const LOG_CAP = 256;
export const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
export const LINK_VERSION = "1";

// The rules for one data.json, which holds the editions, DLCs and civs.
//
// A share link stores an edition by its place in the list, so new editions go at the end, and the first one is
// the default. An edition has its own civs and those of every older edition. Each edition lists its DLC toggles
// on the Civ Pool tab top to bottom (toggle i has hotkey DLC_KEYS[i]) and where they sit, and the DLCs whose
// civs auto-toggle enables when switching to it. An edition without a store url has a storeNote instead, and
// the civs of an edition with legacyJingles also have a legacy jingle.
//
// Civ IDs are permanent: share links and saved data refer to them. They follow the desktop app's v1.4.2 order,
// and a new civ takes the next free ID wherever it goes in the list. A share link spends one base64url character
// per drawn civ, so past 64 civs the link format version has to change. A civ's techTree name is the one
// aoe2techtree.net uses, where it differs.
export function createLogic(data) {
  const EDITIONS = data.editions.map((e) => e.id);
  const EDITION_INFO = Object.fromEntries(data.editions.map((e) => [e.id, e]));
  const DLCS = data.dlcs;
  const CIVS = [];
  for (const { id, name, dlc, techTree } of data.civs) {
    const edition = DLCS[dlc].edition;
    CIVS[id] = {
      id, name, dlc, edition, legacy: EDITION_INFO[edition].legacyJingles === true, file: name.toLowerCase(),
      techTree: techTree || name,
    };
  }
  const DISPLAY_ORDER = [...CIVS].sort((a, b) => a.name.localeCompare(b.name, "en"));

  const inEdition = (civ, ed) => EDITION_INFO[civ.edition].year <= EDITION_INFO[ed].year;
  const editionTotal = (ed) => CIVS.filter((c) => inEdition(c, ed)).length;

  // ---- State ----

  // The log is a list of rounds, oldest first. Each round lists its draws as [civ id, k, n],
  // shown as "Civ (k/n)", or as just "Civ" where k is 0. The last round is the current one.
  function emptyState() {
    return { edition: EDITIONS[0], off: new Set(), log: [[]] };
  }
  function applyEdition(s) {
    for (const c of CIVS) if (!inEdition(c, s.edition)) s.off.add(c.id);
  }
  function parseState(raw) {
    let data = null;
    try { data = JSON.parse(raw); } catch { return null; }
    if (!data || typeof data !== "object" || !EDITIONS.includes(data.edition)) return null;
    const isId = (x) => Number.isInteger(x) && x >= 0 && x < CIVS.length;
    const s = { edition: data.edition, off: new Set(Array.isArray(data.disabled) ? data.disabled.filter(isId) : []), log: [] };
    for (const r of Array.isArray(data.log) ? data.log : []) {
      if (!Array.isArray(r)) continue;
      s.log.push(r.filter((e) => Array.isArray(e) && isId(e[0]) && Number.isInteger(e[1]) && Number.isInteger(e[2]))
        .map((e) => [e[0], e[1], e[2]]));
    }
    s.log = s.log.filter((r, i, all) => r.length > 0 || i === all.length - 1);
    if (!s.log.length) s.log.push([]);
    const seen = new Set();
    s.log[s.log.length - 1] = s.log[s.log.length - 1].filter((e) => {
      if (seen.has(e[0])) return false;
      seen.add(e[0]);
      return true;
    });
    applyEdition(s);
    return s;
  }
  function serialiseState(s) {
    return { v: 1, edition: s.edition, disabled: [...s.off].sort((a, b) => a - b), log: s.log };
  }
  const hasContent = (s) => s.edition !== EDITIONS[0] || s.off.size > 0 || s.log.some((r) => r.length > 0);

  const isOn = (s, id) => !s.off.has(id);
  const poolIds = (s) => CIVS.filter((c) => isOn(s, c.id)).map((c) => c.id);
  const round = (s) => s.log[s.log.length - 1];
  const drawnIds = (s) => round(s).map((e) => e[0]);
  const drawnCount = (s) => drawnIds(s).filter((id) => isOn(s, id)).length;
  function remainingIds(s) {
    const drawn = new Set(drawnIds(s));
    return poolIds(s).filter((id) => !drawn.has(id));
  }

  function closeRound(s) {
    if (round(s).length) s.log.push([]);
  }
  function trimLog(s) {
    let total = s.log.reduce((n, r) => n + r.length, 0);
    while (total > LOG_CAP && s.log.length > 1) {
      const oldest = s.log[0];
      if (oldest.length) {
        oldest.shift();
        total--;
      }
      if (!oldest.length) s.log.shift();
    }
  }

  // ---- Drawing ----

  const freshMax = (poolSize) => Math.max(1, Math.floor(poolSize / 2));
  const freshLimit = (poolSize, freshN) => Math.min(freshN, freshMax(poolSize));

  // The most recently drawn civs, newest first, across round boundaries.
  function recentCivs(s, n) {
    const out = [];
    const seen = new Set();
    for (let r = s.log.length - 1; r >= 0 && out.length < n; r--) {
      const entries = s.log[r];
      for (let i = entries.length - 1; i >= 0 && out.length < n; i--) {
        const id = entries[i][0];
        if (!seen.has(id)) {
          seen.add(id);
          out.push(id);
        }
      }
    }
    return out;
  }

  // The civs the next draw picks from: those left this round, or the whole pool once the round is over. With
  // continuous freshness on, the last N civs drawn sit out. If that leaves nothing, fewer sit out, keeping the most
  // recent ones out. The settings are those of the Options dialog: { fresh, freshN }.
  function drawCandidates(s, { fresh, freshN }) {
    const pool = poolIds(s);
    const remaining = remainingIds(s);
    const left = remaining.length ? remaining : pool;
    if (!fresh || pool.length < 2) return left;
    const recent = recentCivs(s, freshLimit(pool.length, freshN));
    for (let n = recent.length; n > 0; n--) {
      const skip = new Set(recent.slice(0, n));
      const freshIds = left.filter((id) => !skip.has(id));
      if (freshIds.length) return freshIds;
    }
    return left;
  }

  // The next draw is picked ahead of time, so its jingle can load before the draw is revealed. Each time it's asked
  // for, it's checked against the civs it can now be picked from and kept a fair pick from them, changing as little
  // as it can, so editing the pool doesn't load jingle after jingle: when civs drop out, it stays unless it's one of
  // them; when civs join, it moves to one of them with the chance a new pick would have had of landing on one; after
  // any other change, such as a draw, it's picked again. A re-roll asks with its own civs to pick from. Without a
  // random source, there's no pick.
  function createPicker(rng) {
    let ahead = { from: [], id: null };
    function next(from) {
      const before = new Set(ahead.from);
      const joined = from.filter((id) => !before.has(id));
      const dropped = from.length - joined.length < ahead.from.length;
      const pick = (ids) => ids[rng.int(0, ids.length - 1)];
      let id = ahead.id;
      if (!from.length || !rng) id = null;
      else if (id === null || (joined.length && dropped)) id = pick(from);
      else if (joined.length && rng.int(0, from.length - 1) >= ahead.from.length) id = pick(joined);
      else if (!joined.length && !from.includes(id)) id = pick(from);
      ahead = { from, id };
      return id;
    }
    return { next };
  }

  // Adds a draw to the log, starting a new round first if this one is over
  function recordDraw(s, id) {
    if (!remainingIds(s).length) closeRound(s);
    round(s).push([id, drawnCount(s) + 1, poolIds(s).length]);
    trimLog(s);
  }

  // ---- Share links ----

  // #p= + format version + edition + pool bitfield (6 civs per character) + optional "." and
  // one character per civ drawn this round, in draw order. Civs past the end of a link's
  // bitfield count as enabled, so new civs are enabled when an old link is opened.
  function shareCode(s, withDraws) {
    let code = LINK_VERSION + B64[EDITIONS.indexOf(s.edition)];
    for (let ch = 0; ch < Math.ceil(CIVS.length / 6); ch++) {
      let v = 0;
      for (let b = 0; b < 6; b++) {
        const id = ch * 6 + b;
        if (id >= CIVS.length || isOn(s, id)) v |= 1 << b;
      }
      code += B64[v];
    }
    const draws = drawnIds(s).filter((id) => isOn(s, id));
    if (withDraws && draws.length) code += "." + draws.map((id) => B64[id]).join("");
    return code;
  }

  function parseShare(text) {
    let s = String(text).trim();
    const hash = s.indexOf("#");
    if (hash >= 0) s = s.slice(hash + 1);
    if (s.startsWith("p=")) s = s.slice(2);
    try { s = decodeURIComponent(s); } catch { return null; }
    const m = /^1([A-Za-z0-9_-])([A-Za-z0-9_-]+)(?:\.([A-Za-z0-9_-]+))?$/.exec(s);
    if (!m) return null;
    const ed = B64.indexOf(m[1]);
    if (ed >= EDITIONS.length) return null;
    const edition = EDITIONS[ed];
    const bits = m[2];
    const enabled = CIVS.map((c) => {
      if (!inEdition(c, edition)) return false;
      const ch = Math.floor(c.id / 6);
      return ch >= bits.length || ((B64.indexOf(bits[ch]) >> (c.id % 6)) & 1) === 1;
    });
    const draws = [];
    for (const ch of m[3] || "") {
      const id = B64.indexOf(ch);
      if (id >= CIVS.length || !enabled[id] || draws.includes(id)) return null;
      draws.push(id);
    }
    return { edition, enabled, draws };
  }

  // A link's pool replaces this one, and its draws, if any, make a new round. Past rounds stay.
  function applyLink(s, link) {
    s.edition = link.edition;
    s.off = new Set(CIVS.filter((c) => !link.enabled[c.id]).map((c) => c.id));
    applyEdition(s);
    closeRound(s);
    if (link.draws.length) {
      const n = poolIds(s).length;
      s.log[s.log.length - 1] = link.draws.map((id, i) => [id, i + 1, n]);
    }
    trimLog(s);
  }

  // ---- Presets ----

  // Preset files are the desktop app's .txt files: a section of every civ's name and on (1) or off (0), one of the
  // civs drawn this round in draw order, one of the edition's ID and, with continuous freshness on, one of its
  // history, oldest first and as many civs as could sit out of the pool. Lines end in CRLF, as the desktop app's do.
  const PRESET_SECTIONS = new Map([["CivStates:", "states"], ["DrawnCivs:", "draws"], ["EditionState:", "edition"], ["ContfreshCivArray:", "history"]]);
  function presetText(s, fresh) {
    const names = (ids) => ids.map((id) => CIVS[id].name);
    const lines = ["CivStates:", ...CIVS.map((c) => `${c.name} ${isOn(s, c.id) ? 1 : 0}`),
      "DrawnCivs:", ...names(drawnIds(s).filter((id) => isOn(s, id))), "EditionState:", s.edition];
    if (fresh) lines.push("ContfreshCivArray:", ...names(recentCivs(s, freshMax(poolIds(s).length)).reverse()));
    return lines.map((line) => line + "\r\n").join("");
  }

  // Reads a preset as the desktop app does: from every civ of the default edition on, through the sections in any
  // order, to the first empty line, passing over names it doesn't know. Text with none of the sections isn't a preset.
  function parsePreset(text) {
    const preset = { edition: EDITIONS[0], off: new Set(), draws: [], history: [] };
    const ids = new Map(CIVS.map((c) => [c.name, c.id]));
    let section = null;
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line) break;
      if (PRESET_SECTIONS.has(line)) {
        section = PRESET_SECTIONS.get(line);
        continue;
      }
      const id = ids.get(line);
      if (section === "states") {
        const [name, on] = line.split(/\s+/);
        if (ids.has(name) && parseInt(on, 10) === 0) preset.off.add(ids.get(name));
      } else if (section === "draws" && id !== undefined) preset.draws.push(id);
      else if (section === "history" && id !== undefined) preset.history.push(id);
      else if (section === "edition" && EDITIONS.includes(line)) preset.edition = line;
    }
    return section ? preset : null;
  }

  // A loaded preset replaces the whole session, as on the desktop app: the pool and edition become the preset's, and
  // its draws this round. The civs of its continuous freshness history from before this round go in a round of their
  // own before it, without counts, as the file has none, so they keep sitting out of the next draws.
  function applyPreset(s, preset) {
    s.edition = preset.edition;
    s.off = new Set(preset.off);
    applyEdition(s);
    const n = poolIds(s).length;
    const draws = preset.draws.filter((id, i) => isOn(s, id) && preset.draws.indexOf(id) === i);
    const earlier = preset.history.filter((id, i) => !draws.includes(id) && preset.history.lastIndexOf(id) === i);
    s.log = [draws.map((id, i) => [id, i + 1, n])];
    if (earlier.length) s.log.unshift(earlier.map((id) => [id, 0, 0]));
  }

  return {
    EDITIONS, EDITION_INFO, DLCS, CIVS, DISPLAY_ORDER, inEdition, editionTotal,
    emptyState, applyEdition, parseState, serialiseState, hasContent,
    isOn, poolIds, round, drawnIds, drawnCount, remainingIds, closeRound, trimLog,
    freshMax, freshLimit, recentCivs, drawCandidates, createPicker, recordDraw,
    shareCode, parseShare, applyLink,
    presetText, parsePreset, applyPreset,
  };
}
