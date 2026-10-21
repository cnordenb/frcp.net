import { data, load, fill, attempt, recall, remember, language } from "../datahandler.js";
import { include, regional } from "../model.js";
import { simple, setLanguage, setInclude, setRegional, setSimple } from "../ui.js";
import { view, setView, tips, setTips } from "../pictures.js";
import { openReport, report } from "../report.js";
import { root, results, check, codes, pick, reset, fixtures } from "./helpers.js";
import { scripts, sourceTests, textTests, tagTests, dataTests, updaterTests } from "./static.js";
import { behaviourTests, keyboardTests } from "./behaviour.js";
import { menuTests, languageTests, optionTests, pictureTests, accessibilityTests } from "./interface.js";

const LIMIT = 100;

const merge = (runs) => {
  const merged = new Map();
  for (const { where, results: run } of runs) {
    for (const { name, ok, detail } of run) {
      if (!merged.has(name)) merged.set(name, { name, ok: true, failures: [] });
      if (ok) continue;
      merged.get(name).ok = false;
      merged.get(name).failures.push(detail ? `${where}: ${detail}` : where);
    }
  }
  return [...merged.values()].map(({ name, ok, failures }) => ({ name, ok, detail: failures.slice(0, 3).join("; ") }));
};

const reportLine = (result, tools) => fill(!result.number ? tools.aborted : result.ok ? tools.pass : tools.fail, result);

export function loadFailed() {
  root.dataset.tests = "failed";
}

export async function runTests() {
  const before = {
    language, include, simple, view, url: location.href, stored: recall("language"), included: recall("include"), simplified: recall("simple"),
    viewed: recall("civView"), tips, tipped: recall("tooltips"), regional, regionals: recall("regional"),
  };
  if (include) setInclude(false);
  if (!regional) setRegional(true);
  if (!simple) setSimple(true);
  if (!tips) setTips(true);
  const where = `${innerWidth} by ${innerHeight}`;
  try {
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
  } catch (error) {
    check("the tests ran to the end", false, error.stack || error.message);
  }
  reset();
  if (include !== before.include) setInclude(before.include);
  if (regional !== before.regional) setRegional(before.regional);
  setSimple(before.simple);
  setView(before.view);
  setTips(before.tips);
  setLanguage(before.language);
  attempt(() => history.replaceState(history.state, "", before.url));
  remember("language", before.stored);
  remember("include", before.included);
  remember("regional", before.regionals);
  remember("simple", before.simplified);
  remember("civView", before.viewed);
  remember("tooltips", before.tipped);
  const merged = merge([{ where, results }]);
  merged.push({ name: `rules: there are at most ${LIMIT} tests`, ok: merged.length + 1 <= LIMIT, detail: `${merged.length + 1} tests` });
  merged.filter((result) => result.name.includes(":")).forEach((result, i) => {
    result.number = i + 1;
  });
  const failed = merged.filter((result) => !result.ok);
  root.dataset.tests = failed.length ? "failed" : "passed";
  const tools = data.tools;
  openReport(tools.testTitle, fill(failed.length ? tools.testFailed : tools.testPassed, {
    failed: failed.length, n: merged.length, colours: matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
    window: where,
  }));
  for (const result of [...failed, ...merged.filter((r) => r.ok)]) report(reportLine(result, tools));
}
