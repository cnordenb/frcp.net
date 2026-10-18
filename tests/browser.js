// A headless Chrome for the page tests, driven over the DevTools protocol on the pipe Chrome opens with
// --remote-debugging-pipe, so nothing needs installing: the tests serve the repo themselves and use whichever Chrome,
// Edge or Chromium is on the machine (or CHROME_PATH).
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { ROOT } from "./helpers.js";

export function findChrome() {
  const env = process.env;
  const candidates = [
    env.CHROME_PATH,
    ...[env.PROGRAMFILES, env["PROGRAMFILES(X86)"], env.LOCALAPPDATA].filter(Boolean).flatMap((dir) => [
      path.join(dir, "Google", "Chrome", "Application", "chrome.exe"),
      path.join(dir, "Microsoft", "Edge", "Application", "msedge.exe"),
    ]),
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    ...["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "microsoft-edge"]
      .flatMap((name) => ["/usr/bin/", "/usr/local/bin/", "/snap/bin/"].map((dir) => dir + name)),
  ];
  return candidates.find((p) => p && existsSync(p)) || null;
}

const TYPES = {
  ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".json": "application/json",
  ".webp": "image/webp", ".webm": "audio/webm", ".ico": "image/x-icon", ".txt": "text/plain",
};

// Serves the repo on a free port, as the site is served, so the page and /simple load as they do online
export function serve() {
  const server = createServer((req, res) => {
    let rel = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    if (rel.endsWith("/")) rel += "index.html";
    const file = path.join(ROOT, path.normalize(rel));
    if (!file.startsWith(ROOT) || !statSync(file, { throwIfNoEntry: false })?.isFile()) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream", "cache-control": "no-store" });
    res.end(readFileSync(file));
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok({ base: `http://127.0.0.1:${server.address().port}`, close: () => server.close() })));
}

// Starts Chrome. The profile lives in a folder of the system's temp folder, one per test file, which each run reuses.
// Test files run side by side, and a second Chrome on a profile that's in use quits at once, leaving its test to wait
// for it forever.
export async function launch(executable) {
  const profile = path.join(os.tmpdir(), "frcp-test-chrome-" + path.basename(process.argv[1] || "run", ".js"));
  mkdirSync(profile, { recursive: true });
  const args = ["--headless", "--remote-debugging-pipe", `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check",
    "--disable-extensions", "--mute-audio", ...(process.platform === "linux" && process.env.CI ? ["--no-sandbox"] : []), "about:blank"];
  const child = spawn(executable, args, { stdio: ["ignore", "ignore", "ignore", "pipe", "pipe"] });
  const toChrome = child.stdio[3];
  const fromChrome = child.stdio[4];
  let id = 0;
  const pending = new Map();
  const listeners = new Set();
  let buffer = "";
  fromChrome.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    let end;
    while ((end = buffer.indexOf("\0")) >= 0) {
      const msg = JSON.parse(buffer.slice(0, end));
      buffer = buffer.slice(end + 1);
      if (msg.id && pending.has(msg.id)) {
        const { ok, fail, method } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) fail(new Error(`${method}: ${msg.error.message}`));
        else ok(msg.result);
      } else if (msg.method) {
        for (const l of listeners) l(msg);
      }
    }
  });
  // If Chrome quits, what's still waiting for it fails, rather than leaving its test to wait forever.
  let quit = null;
  child.once("exit", (code, signal) => {
    quit = new Error(`Chrome quit (${signal || "exit code " + code})`);
    for (const { fail, method } of pending.values()) fail(new Error(`${method}: ${quit.message}`));
    pending.clear();
  });
  const send = (method, params = {}, sessionId) => new Promise((ok, fail) => {
    if (quit) return fail(new Error(`${method}: ${quit.message}`));
    const mid = ++id;
    pending.set(mid, { ok, fail, method });
    toChrome.write(JSON.stringify({ id: mid, method, params, sessionId }) + "\0");
  });
  await send("Browser.getVersion");
  return {
    send, listeners,
    close: async () => {
      await send("Browser.close").catch(() => {});
      await new Promise((ok) => (child.exitCode !== null ? ok() : child.once("exit", ok)));
    },
  };
}

export const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

const KEYS = {
  Tab: [9, "Tab"], Enter: [13, "Enter", "\r"], Escape: [27, "Escape"], " ": [32, "Space", " "],
  ArrowLeft: [37, "ArrowLeft"], ArrowUp: [38, "ArrowUp"], ArrowRight: [39, "ArrowRight"], ArrowDown: [40, "ArrowDown"],
  Home: [36, "Home"], End: [35, "End"], F2: [113, "F2"], F8: [119, "F8"], F9: [120, "F9"],
};

// Opens a page in a tab of its own. opts: width, height, mobile (touch, for phones), dark, forcedColors, storage, the
// localStorage values to start with, and ready, an expression that's true once the page is ready.
export async function openPage(browser, base, url, opts = {}) {
  // Each page gets a window of its own, which counts as focused, so pages can run side by side without the
  // timers of a background tab slowing down.
  const { targetId } = await browser.send("Target.createTarget", { url: "about:blank", newWindow: true });
  const { sessionId } = await browser.send("Target.attachToTarget", { targetId, flatten: true });
  const s = (method, params) => browser.send(method, params, sessionId);
  await s("Emulation.setFocusEmulationEnabled", { enabled: true });
  const errors = [];
  const onEvent = (msg) => {
    if (msg.sessionId !== sessionId) return;
    if (msg.method === "Runtime.exceptionThrown") errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
    if (msg.method === "Runtime.consoleAPICalled" && msg.params.type === "error") errors.push(msg.params.args.map((a) => a.value ?? a.description).join(" "));
  };
  browser.listeners.add(onEvent);
  for (const domain of ["Page", "Runtime", "Network"]) await s(domain + ".enable");
  await s("Network.setCacheDisabled", { cacheDisabled: true });
  await s("Emulation.setDeviceMetricsOverride", { width: opts.width || 1280, height: opts.height || 900, deviceScaleFactor: 1, mobile: !!opts.mobile });
  if (opts.mobile) await s("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
  await s("Emulation.setEmulatedMedia", { features: [
    { name: "prefers-color-scheme", value: opts.dark ? "dark" : "light" },
    { name: "forced-colors", value: opts.forcedColors ? "active" : "none" },
  ] });
  const evaluate = async (expression) => {
    const r = await s("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  const go = async (to) => {
    await s("Page.navigate", { url: to });
    for (let i = 0; i < 200 && (await evaluate("document.readyState")) !== "complete"; i++) await sleep(25);
  };
  // localStorage belongs to the origin, so it's set from a page of the site before the page itself loads.
  await go(base + "/favicon.ico");
  await evaluate(`localStorage.clear(); ${Object.entries(opts.storage || {}).map(([k, v]) => `localStorage.setItem(${JSON.stringify(k)}, ${JSON.stringify(JSON.stringify(v))});`).join("")}`);
  await go(base + url);
  // The picker is ready once its script has rendered the Civ Pool count.
  const ready = opts.ready || "document.getElementById('enabledCount')?.textContent";
  await evaluate(`new Promise((ok) => { const t = () => (${ready}) ? ok() : setTimeout(t, 20); t(); })`);
  await evaluate("document.fonts.ready");
  return {
    eval: evaluate, send: s, errors,
    // Waits until an expression is true in the page, for what a timer or event does a moment later
    async waitFor(expression, what = expression, ms = 3000) {
      for (const end = Date.now() + ms; Date.now() < end; await sleep(25)) if (await evaluate(expression)) return;
      throw new Error(`timed out waiting for ${what}`);
    },
    async key(key, mods = {}) {
      let [code, codeName, text] = KEYS[key] || [];
      if (!code) [code, codeName, text] = [key.toUpperCase().charCodeAt(0), /\d/.test(key) ? "Digit" + key : "Key" + key.toUpperCase(), key];
      if (mods.ctrl) text = undefined;
      const base = { modifiers: (mods.ctrl ? 2 : 0) | (mods.shift ? 8 : 0), windowsVirtualKeyCode: code, code: codeName, key };
      await s("Input.dispatchKeyEvent", { type: text ? "keyDown" : "rawKeyDown", ...base, text, unmodifiedText: text });
      await s("Input.dispatchKeyEvent", { type: "keyUp", ...base });
      await sleep(30);
    },
    async click(x, y) {
      for (const type of ["mouseMoved", "mousePressed", "mouseReleased"]) await s("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1 });
      await sleep(30);
    },
    async move(x, y) {
      await s("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
      await sleep(30);
    },
    resize: (width, height) => s("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: !!opts.mobile }),
    async close() {
      browser.listeners.delete(onEvent);
      await browser.send("Target.closeTarget", { targetId });
    },
  };
}
