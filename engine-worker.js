/* Stockfish's UCI loop runs in this dedicated worker, so search never blocks the UI. */
"use strict";
const ENGINE_BASE = "https://cdn.jsdelivr.net/npm/stockfish@19.0.0/bin/";
self.Module = self.Module || {};
self.Module.locateFile = function (path) { return ENGINE_BASE + path; };
try {
  importScripts(ENGINE_BASE + "stockfish-19-lite-single.js");
} catch (error) {
  self.postMessage("H2C_ERROR " + (error && error.message ? error.message : "Không tải được Stockfish."));
}
