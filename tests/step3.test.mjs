import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../app.css", import.meta.url), "utf8");
const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const sw = readFileSync(new URL("../sw.js", import.meta.url), "utf8");

test("Coach can be toggled on the board and from its own route", () => {
  assert.ok(html.includes('id="coachToggle"'));
  assert.match(app, /id="coachRouteToggle"/);
  assert.match(app, /function setCoachEnabled\(enabled\)/);
  assert.match(app, /store\.set\("h2c-coach-enabled",coachEnabled\?"1":"0"\)/);
  assert.match(app, /function analyzeForCoach\(snapshotOnly\)/);
  assert.match(app, /settings\.analysisEngine="stockfish"/);
});

test("Coach scores moves from the correct side-to-move perspective", () => {
  assert.match(app, /loss=Math\.max\(0,Math\.round\(pending\.color==="w"\?before-after:after-before\)\)/);
  assert.match(app, /sourceCoach=coachSnapshot\?\.fen===fenBefore\?coachSnapshot:\(lastEvaluation\?\.fen===fenBefore\?lastEvaluation:null\)/);
  assert.match(app, /Stockfish previously preferred/);
  assert.match(app, /Trước đó Stockfish ưu tiên/);
});

test("Coach provides the six requested move-quality labels", () => {
  const block = app.match(/function coachLabelFor\([\s\S]*?\n  }/);
  assert.ok(block, "label classifier exists");
  const classify = new Function("return (" + block[0].replace(/^function coachLabelFor/, "function") + ");")();
  assert.equal(classify(0, false).key, "best");
  assert.equal(classify(20, false).key, "excellent");
  assert.equal(classify(60, false).key, "good");
  assert.equal(classify(100, false).key, "inaccuracy");
  assert.equal(classify(200, false).key, "mistake");
  assert.equal(classify(500, false).key, "blunder");
  assert.equal(classify(null, false).key, "unknown");
});

test("Coach route includes three hint levels, why action, chart, and key moments", () => {
  assert.match(app, /data-hint-level="1"/);
  assert.match(app, /data-hint-level="2"/);
  assert.match(app, /data-hint-level="3"/);
  assert.match(app, /data-coach-why/);
  assert.match(app, /function renderCoachChart\(/);
  assert.match(app, /THỜI KHẮC THEN CHỐT/);
  assert.match(app, /function gradeCoachMove\(/);
  assert.match(app, /coachLabel:label\.key/);
});

test("Coach move hints and labels are styled for the shared responsive interface", () => {
  assert.match(css, /\.coach-panel\s*\{/);
  assert.match(css, /\.coach-label\s*\{/);
  assert.match(css, /\.coach-board-hint\s*\{/);
  assert.match(css, /@media\(max-width:720px\)/);
  assert.ok(html.includes('id="coachBoardHint"'));
});

test("PWA cache version changes so installed clients fetch the Coach update", () => {
  assert.match(sw, /const CACHE_NAME = "how2chess-v3"/);
});
