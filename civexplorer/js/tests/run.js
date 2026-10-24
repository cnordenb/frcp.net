import { data, load, fill, attempt, recall, remember, language } from "../datahandler.js";
import { include, regional } from "../model.js";
import { simple } from "../stringbuilder.js";
import { setLanguage, setInclude, setRegional, setSimple } from "../optionshandler.js";
import { view, setView, tips, setTips } from "../pictures.js";
import { openReport, report } from "../report.js";
import { root, results, check, codes, pick, reset, fixtures } from "./helpers.js";
import { scripts, sourceTests, textTests, tagTests, dataTests, updaterTests } from "./static.js";
import { behaviourTests, keyboardTests } from "./behaviour.js";
import { menuTests, languageTests, optionTests, accessibilityTests, reportTests } from "./interface.js";
import { pictureTests } from "./pictures.js";

const LIMIT = 100;
const STORED = ["language", "include", "regional", "simple", "civView", "tooltips"];

const merge = (where) => {
  const merged = new Map();
  for (const { name, ok, detail } of results) {
    if (!merged.has(name)) merged.set(name, { name, ok: true, failures: [] });
    if (ok) continue;
    merged.get(name).ok = false;
    merged.get(name).failures.push(detail ? `${where}: ${detail}` : where);
  }
  return [...merged.values()].map(({ name, ok, failures }) => ({ name, ok, detail: failures.slice(0, 3).join("; ") }));
};

const reportLine = (result, tools) => fill(!result.number ? tools.aborted : result.ok ? tools.pass : tools.fail,
  result);

export function loadFailed() {
  root.dataset.tests = "failed";
}

function prepare() {
  const before = {
    language, include, regional, simple: simple(), view, tips, url: location.href,
    stored: Object.fromEntries(STORED.map((key) => [key, recall(key)])),
  };
  if (include) setInclude(false);
  if (!regional) setRegional(true);
  if (!simple()) setSimple(true);
  if (!tips) setTips(true);
  return before;
}

function restore(before) {
  reset();
  if (include !== before.include) setInclude(before.include);
  if (regional !== before.regional) setRegional(before.regional);
  setSimple(before.simple);
  setView(before.view);
  setTips(before.tips);
  setLanguage(before.language);
  attempt(() => history.replaceState(history.state, "", before.url));
  for (const [key, value] of Object.entries(before.stored)) remember(key, value);
}

async function rounds() {
  const sources = await Promise.all([load("index.html"), load("style.css"), scripts()]);
  textTests();
  pick(codes()[0]);
  const sample = fixtures();
  await behaviourTests(sample);
  menuTests(sample);
  codes().forEach((code) => languageTests(code, sample));
  optionTests();
  await pictureTests();
  tagTests();
  pick(codes()[0]);
  const fresh = fixtures();
  keyboardTests(fresh);
  accessibilityTests(fresh);
  sourceTests(...sources);
  dataTests();
  updaterTests();
  reportTests();
}

export async function runTests() {
  const before = prepare();
  const where = `${innerWidth} by ${innerHeight}`;
  try {
    await rounds();
  } catch (error) {
    check("the tests ran to the end", false, error.stack || error.message);
  }
  restore(before);
  const merged = merge(where);
  const total = merged.length + 1;
  merged.push({ name: `rules: there are at most ${LIMIT} tests`, ok: total <= LIMIT, detail: `${total} tests` });
  merged.filter((result) => result.name.includes(":")).forEach((result, i) => {
    result.number = i + 1;
  });
  const failed = merged.filter((result) => !result.ok);
  root.dataset.tests = failed.length ? "failed" : "passed";
  const tools = data.tools;
  openReport(tools.testTitle, fill(failed.length ? tools.testFailed : tools.testPassed, {
    failed: failed.length, n: merged.length, window: where,
    colours: matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
  }));
  for (const result of [...failed, ...merged.filter((r) => r.ok)]) report(reportLine(result, tools));
}
