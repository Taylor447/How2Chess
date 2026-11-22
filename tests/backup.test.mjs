import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const sw = readFileSync(new URL("../sw.js", import.meta.url), "utf8");

test("full JSON backup includes browser storage and IndexedDB games and puzzles", () => {
  assert.match(app, /async function exportLibraryJSON\(/);
  assert.match(app, /localStorage:localStorageData,indexedDB:database/);
  assert.match(app, /async function importLibraryJSON\(file\)/);
  assert.match(app, /indexed\.puzzles/);
  assert.match(app, /puzzleSolutionIsLegal\(puzzle\)/);
  assert.match(app, /rawBoards=Array\.isArray\(data\.boards\)\?data\.boards:parseJSON\(incomingLocal/);
  assert.match(app, /how2chess-backup\.json/);
  assert.match(html, /Export full backup/);
  assert.match(html, /Restore backup/);
});

test("Delete all data clears both How2Chess browser storage and IndexedDB stores", () => {
  assert.match(app, /async function clearAllData\(/);
  assert.match(app, /key\?\.startsWith\("h2c-"\)/);
  assert.match(app, /transaction\(\["local","puzzles"\],"readwrite"\)/);
  assert.match(app, /objectStore\("local"\)\.clear\(\)/);
  assert.match(app, /objectStore\("puzzles"\)\.clear\(\)/);
});

test("PWA cache invalidates older app bundles after a backup update", () => {
  assert.match(sw, /const CACHE_NAME = "how2chess-v18"/);
  assert.match(sw, /app\.js\?v=20261122\.10/);
  assert.match(html, /app\.js\?v=20261122\.10/);
});
