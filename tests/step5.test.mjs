import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { chess960Backrank, chess960Fen, makeTournamentSchedule } from "../variant-utils.mjs";

const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../app.css", import.meta.url), "utf8");
const sw = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
const runtime = readFileSync(new URL("../variant-runtime.mjs", import.meta.url), "utf8");
const build = readFileSync(new URL("../scripts/copy-web.mjs", import.meta.url), "utf8");
const licenses = readFileSync(new URL("../LICENSES.md", import.meta.url), "utf8");

test("Chess960 generator produces all 960 layouts and the orthodox position at index 518", () => {
  assert.equal(chess960Backrank(518), "RNBQKBNR");
  const layouts = new Set(Array.from({ length: 960 }, (_, i) => chess960Backrank(i)));
  assert.equal(layouts.size, 960);
  for (let index = 0; index < 960; index++) {
    const rank = chess960Backrank(index);
    assert.equal([...rank].filter(piece => piece === "B").length, 2);
    assert.equal([...rank].filter(piece => piece === "N").length, 2);
    assert.equal([...rank].filter(piece => piece === "R").length, 2);
    assert.ok(rank.indexOf("B") % 2 !== rank.lastIndexOf("B") % 2);
    const rookFiles = [...rank].map((piece, file) => piece === "R" ? file : -1).filter(file => file >= 0);
    assert.ok(rookFiles[0] < rank.indexOf("K") && rank.indexOf("K") < rookFiles[1]);
  }
});

test("Chess960 FEN includes mirrored armies and file-based castling rights", () => {
  const fen = chess960Fen(518);
  const fields = fen.split(" ");
  assert.equal(fields[0], "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR");
  assert.equal(fields[1], "w");
  assert.equal(fields[2], "AHah");
});

test("Round-robin schedule gives each pair two games with exchanged colors", () => {
  const ids = ["a", "b", "c", "d"];
  const schedule = makeTournamentSchedule(ids, "round-robin");
  assert.equal(schedule.filter(game => game.white && game.black).length, 12);
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
    const pair = schedule.filter(game => [game.white, game.black].includes(ids[i]) && [game.white, game.black].includes(ids[j]));
    assert.equal(pair.length, 2);
    assert.deepEqual(new Set(pair.map(game => game.white)), new Set([ids[i], ids[j]]));
  }
});

test("Arena creates five rounds and handles a bye for an odd field", () => {
  const schedule = makeTournamentSchedule(["a", "b", "c", "d", "e"], "arena", () => 0.4);
  assert.equal(Math.max(...schedule.map(game => game.round)), 5);
  assert.equal(schedule.filter(game => game.white && game.black).length, 10);
  assert.equal(schedule.filter(game => game.bye).length, 5);
});

test("Variant routes, rules, local bot, undo and pockets are connected to the shared board", () => {
  for (const id of ["variants", "tournaments"]) {
    assert.ok(app.includes('"id":"' + id + '"'));
    assert.ok(app.includes('activeSideRoute==="' + id + '"'));
  }
  assert.match(app, /const ready=\[[\s\S]*?"variants"[\s\S]*?"tournaments"[\s\S]*?\]\.includes\(routeId\)/);
  for (const id of ["chess960", "kingofthehill", "threecheck", "crazyhouse", "horde", "atomic", "racingkings"]) {
    assert.ok(app.includes('id:"' + id + '"') || app.includes('id: "' + id + '"'), id);
  }
  assert.match(runtime, /chessops@0\.15\.1\?bundle/);
  assert.match(runtime, /position\.isLegal\(move\)/);
  assert.match(runtime, /dropDests\(\)/);
  assert.match(runtime, /function chooseVariantBotMove/);
  assert.match(app, /function renderVariantBoard\([\s\S]*?puzzleBoardParts\(fenBoard\(game\.fen\)/);
  assert.match(app, /function undoVariantTurn\(/);
});

test("Tournament screen supports local pairings, standings, progress, and saved results", () => {
  assert.match(app, /async function startLocalTournament\(/);
  assert.match(app, /makeTournamentSchedule\(players\.map\(player=>player\.id\),format\)/);
  assert.match(app, /function simulateTournamentGame\(/);
  assert.match(app, /function tournamentStandings\(/);
  assert.match(app, /store\.set\("h2c-tournaments"/);
  assert.match(app, /data-tournament-bot/);
  assert.match(app, /data-tournament-stop/);
  assert.match(css, /\.tournament-table\s*/);
});

test("PWA and static build include the variant modules and pinned chessops asset", () => {
  assert.match(sw, /const CACHE_NAME = "how2chess-v14"/);
  assert.match(sw, /\.\/variant-runtime\.mjs/);
  assert.match(sw, /https:\/\/esm\.sh\/chessops@0\.15\.1\?bundle/);
  assert.match(build, /"variant-runtime\.mjs"/);
  assert.match(build, /"variant-utils\.mjs"/);
  assert.match(licenses, /chessops 0\.15\.1[\s\S]*GPL version 3 or later/);
});

