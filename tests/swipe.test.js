// The phone layout's swipes on the full page, in a headless Chrome with touch: left draws, right undoes, up re-rolls
// and down resets, and the icons move with the finger on the way. Without Chrome, Edge or Chromium on the machine, or
// with FRCP_NO_BROWSER set, they skip.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { findChrome, launch, openPage, serve, sleep } from "./browser.js";

const CHROME = process.env.FRCP_NO_BROWSER ? null : findChrome();
const skip = process.env.FRCP_NO_BROWSER ? "FRCP_NO_BROWSER is set"
  : CHROME ? false : "no Chrome, Edge or Chromium found (CHROME_PATH can point to one)";
// One round with three draws
const STATE = { v: 1, edition: "DE", disabled: [], log: [[[1, 1, 54], [5, 2, 54], [10, 3, 54]]] };

let browser = null;
let server = null;
before(async () => {
  if (!CHROME) return;
  server = await serve();
  browser = await launch(CHROME);
});
after(async () => {
  await browser?.close();
  server?.close();
});

// Swipes a finger 160 px from the middle of the Draw Civ tab, and returns what the icons show just before it lifts:
// whether the civ icon has moved and whether the ghost of the incoming civ shows. Then waits for the icons to settle.
async function swipe(page, [dx, dy]) {
  const [x, y] = await page.eval(`(() => { const r = document.getElementById("panel").getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
  await page.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  for (let i = 1; i <= 8; i++) await page.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + 20 * i * dx, y: y + 20 * i * dy }] });
  const midway = await page.eval(`({ moved: !!document.getElementById("civIcon").style.transform, ghost: !document.getElementById("civGhost").hidden })`);
  await page.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await page.waitFor(`document.getElementById("civGhost").hidden && !document.getElementById("civIcon").style.transform`, "the icons to settle");
  await sleep(50);
  return midway;
}

test("phone swipes draw, undo, re-roll and reset, with the icons following the finger", { skip }, async () => {
  const page = await openPage(browser, server.base, "/", { width: 375, height: 812, mobile: true, storage: { "frcp.state": STATE } });
  const shown = () => page.eval(`({ civ: document.getElementById("civName").textContent, count: document.getElementById("roundCounter").textContent })`);
  const start = await shown();
  assert.match(start.count, /^3\//);

  const draw = await swipe(page, [-1, 0]);
  const drawn = await shown();
  assert.equal(draw.moved, true, "the civ icon moves left with the finger");
  assert.match(drawn.count, /^4\//, "a swipe left draws");

  const undo = await swipe(page, [1, 0]);
  assert.equal(undo.ghost, true, "the undone civ comes in with the finger");
  assert.deepEqual(await shown(), start, "a swipe right undoes the draw");

  const reroll = await swipe(page, [0, -1]);
  const rerolled = await shown();
  assert.equal(reroll.ghost, true, "the re-rolled civ comes in with the finger");
  assert.notEqual(rerolled.civ, start.civ, "a swipe up re-rolls");
  assert.equal(rerolled.count, start.count, "a re-roll draws no more civs");

  const reset = await swipe(page, [0, 1]);
  assert.equal(reset.ghost, true, "the random icon comes in with the finger");
  assert.match((await shown()).count, /^0\//, "a swipe down resets");

  // A second undo takes back the reset, as long as there's something to undo
  const undoReset = await swipe(page, [1, 0]);
  assert.equal(undoReset.ghost, true);
  assert.deepEqual(await shown(), rerolled, "a swipe right undoes the reset");

  assert.deepEqual(page.errors, []);
  await page.close();
});
