import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const css = readFileSync(new URL("../app.css", import.meta.url), "utf8");
const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const sw = readFileSync(new URL("../sw.js", import.meta.url), "utf8");

test("Puzzle routes are registered in the drawer, hash router and renderer", () => {
  for (const id of ["puzzles", "daily", "puzzle-rush", "puzzle-custom", "puzzle-duel"]) {
    assert.ok(app.includes('"id":"' + id + '"'), id + " appears in the menu");
    assert.ok(app.includes('activeSideRoute==="' + id + '"'), id + " has a page renderer");
    assert.ok(app.includes('data-route="\'+route.id+\'"'), id + " is reachable from the drawer");
  }
  assert.match(app, /location\.hash\.match/);
});

test("Lichess daily puzzle has a bounded offline-aware fetch and a local fallback", () => {
  assert.ok(app.includes("https://lichess.org/api/puzzle/daily"));
  assert.match(app, /new AbortController\(\)/);
  assert.match(app, /setTimeout\(\(\)=>controller\.abort\(\),8000\)/);
  assert.match(app, /function dailyFallbackFor\(/);
  assert.match(app, /function dailyCache\(/);
  assert.match(app, /function saveDailySolved\(/);
});

test("Puzzle CSV import streams a capped subset and applies the setup move", () => {
  assert.match(app, /file\.stream\(\)\.getReader\(\)/);
  assert.match(app, /Math\.min\(300000,Number\(\$\("#puzzleImportLimit"\)/);
  assert.match(app, /game\.move\(\{from:first\.slice\(0,2\),to:first\.slice\(2,4\)/);
  assert.match(app, /solution:moves\.slice\(1\)/);
  assert.match(app, /function savePuzzleBatch\(/);
});

test("Puzzle solving supports legal move checks, three hint levels and local rating", () => {
  assert.match(app, /function handlePuzzleSquare\(/);
  assert.match(app, /function puzzleSolutionIsLegal\(/);
  assert.match(app, /data-puzzle-hint="1"/);
  assert.match(app, /data-puzzle-hint="2"/);
  assert.match(app, /data-puzzle-hint="3"/);
  assert.match(app, /function puzzleRatingChange\(/);
  assert.match(app, /store\.set\("h2c-puzzle-rating"/);
});

test("Rush, custom puzzles and a local simulated duel have controls and state", () => {
  assert.match(app, /data-rush-start="180"/);
  assert.match(app, /data-rush-start="300"/);
  assert.match(app, /data-rush-start="survival"/);
  assert.match(app, /function saveCustomPuzzle\(/);
  assert.match(app, /data-custom-use-fen/);
  assert.match(app, /function startDuel\(/);
  assert.match(app, /function handleFeatureClick\(event\)[\s\S]*?\[data-puzzle-square\]/);
});

test("Puzzle screens and the H2C board use one square renderer with mobile layout", () => {
  assert.match(app, /function puzzleBoardParts\(/);
  assert.match(app, /parts=puzzleBoardParts\(board,orientation/);
  assert.match(app, /parts=puzzleBoardParts\(fenBoard\(game\.fen\(\)\)/);
  assert.match(css, /\.puzzle-solve-layout\s*\{/);
  assert.match(css, /\.daily-calendar\s*\{/);
  assert.match(css, /@media\(max-width:760px\)/);
  assert.match(css, /\.puzzle-hint-buttons\s*\{/);
});

test("Puzzle updates invalidate offline service-worker assets", () => {
  assert.match(sw, /const CACHE_NAME = "how2chess-v16"/);
});

