import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const sw = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const build = readFileSync(new URL("../scripts/copy-web.mjs", import.meta.url), "utf8");
const peer = readFileSync(new URL("../puzzle-peer-duel.mjs", import.meta.url), "utf8");

test("Lichess Board API module is included in static builds and offline cache", () => {
  assert.match(build, /"lichess-board\.mjs"/);
  assert.match(sw, /\.\/lichess-board\.mjs/);
  assert.match(sw, /const CACHE_NAME = "how2chess-v21"/);
  assert.match(html, /app\.js\?v=20261122\.13/);
});

test("online play lets users cancel a seek and starts games from Lichess game events", () => {
  assert.match(app, /data-l2-stop-seek/);
  assert.match(app, /lichessSeekController\.abort\(\)/);
  assert.match(app, /if\(event\.gameStart\?\.id\)[\s\S]{0,180}startLichessBoardGame\(event\.gameStart\.id\)/);
  const start = app.indexOf("async function acceptLichessIncomingChallenge");
  const end = app.indexOf("async function startLichessRandomSeek", start);
  assert.ok(start >= 0 && end > start);
  assert.ok(!app.slice(start, end).includes("startLichessBoardGame"), "challenge IDs are not treated as game IDs");
});

test("online Lichess board explicitly excludes engine assistance during rated play", () => {
  const start = app.indexOf("function renderLichessOnlineBoard");
  const end = app.indexOf("function renderPlayNowRoute", start);
  assert.ok(start >= 0 && end > start);
  const view = app.slice(start, end);
  assert.match(view, /No engine, opening book, or coach hints/);
  assert.match(view, /data-l2-resign/);
  assert.match(app, /function isLichessFairPlayLockActive\(\)/);
  assert.match(app, /function analyze\(execute,playReply\) \{\s*if\(isLichessFairPlayLockActive\(\)\)/);
  assert.match(app, /function analyzeForCoach\(snapshotOnly\) \{\s*if\(isLichessFairPlayLockActive\(\)\)/);
});

test("puzzle friend duel exchanges WebRTC codes and shares puzzles without a How2Chess server", () => {
  assert.match(app, /data-peer-create/);
  assert.match(app, /data-peer-join/);
  assert.match(app, /data-peer-apply-answer/);
  assert.match(app, /const start=duel\.role==="host"\?/);
  assert.match(app, /createPeerOffer\(\)/);
  assert.match(app, /createPeerAnswer\(/);
  assert.match(peer, /createDataChannel\("h2c-puzzle-duel"/);
  assert.match(peer, /addEventListener\?\.\("datachannel"/);
  assert.match(build, /"puzzle-peer-duel\.mjs"/);
  assert.match(sw, /\.\/puzzle-peer-duel\.mjs/);
});
