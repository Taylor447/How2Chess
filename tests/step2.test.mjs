import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../app.css", import.meta.url), "utf8");
const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const rosterBlock = app.match(/const BOT_CATALOG = (\[[\s\S]*?\]);/);
assert.ok(rosterBlock, "bot catalog exists");
const roster = JSON.parse(rosterBlock[1]);

test("offers sixteen locally generated bot profiles from 250 to 2500 Elo", () => {
  assert.equal(roster.length, 16);
  assert.equal(Math.min(...roster.map(bot => bot.elo)), 250);
  assert.equal(Math.max(...roster.map(bot => bot.elo)), 2500);
  assert.equal(new Set(roster.map(bot => bot.id)).size, roster.length);
  assert.ok(roster.every(bot => bot.name && bot.personality && bot.randomRate >= 0));
});

test("bot game setup is connected to the existing Stockfish worker and legal move flow", () => {
  assert.match(app, /function startBotGame\(\)/);
  assert.match(app, /settings\.analysisEngine="stockfish"/);
  assert.match(app, /function chooseBotUci\(/);
  assert.match(app, /completeBotMove\(made\)/);
  assert.match(app, /finishBotMatch\(opposite\(turn\),"checkmate"\)/);
});

test("timed games, takebacks, and end-of-game results are wired", () => {
  assert.ok(html.includes('id="gameClockBar"'));
  assert.match(app, /function tickBotClock\(\)/);
  assert.match(app, /function undo\(\)[\s\S]*?botAllowUndo/);
  assert.match(app, /reason==="timeout"/);
  assert.match(app, /function createGamePgn\(/);
});

test("history is stored in IndexedDB with a localStorage fallback and can export PGN", () => {
  assert.match(app, /indexedDB\.open\("How2ChessLocal",1\)/);
  assert.match(app, /store\.set\("h2c-game-history"/);
  assert.match(app, /function exportSavedPgn\(\)/);
  assert.match(app, /function importPgnFile\(/);
  assert.match(app, /id="historyFilter"/);
  assert.match(app, /pgn-dropzone/);
  assert.ok(html.includes('id="featureRouteBody"'));
});

test("statistics derive results and estimated rating from local game history", () => {
  assert.match(app, /function renderStatsRoute\(\)/);
  assert.match(app, /Estimated rating/);
  assert.match(app, /Average accuracy/);
  assert.match(app, /function renderRatingChart\(/);
});

test("bot cards and statistics remain responsive and use the shared theme", () => {
  assert.match(css, /\.bot-grid\s*\{/);
  assert.match(css, /\.stats-grid\s*\{/);
  assert.match(css, /@media\(max-width:720px\)/);
  assert.match(css, /\.side-drawer\s*\{[^}]*linear-gradient/s);
});
