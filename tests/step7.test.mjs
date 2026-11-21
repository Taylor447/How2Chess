import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const sw = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
const build = readFileSync(new URL("../scripts/copy-web.mjs", import.meta.url), "utf8");
const license = readFileSync(new URL("../LICENSES.md", import.meta.url), "utf8");
const chess = readFileSync(new URL("../vendor/chess/chess.js", import.meta.url), "utf8");

test("chess.js is local and does not block the How2Chess UI on a third-party CDN", () => {
  assert.match(html, /<script src="\\.\\/vendor\\/chess\\/chess\\.js" defer><\\/script>/);
  assert.doesNotMatch(html, /cdnjs\\.cloudflare\\.com\\/ajax\\/libs\\/chess\\.js/);
  assert.match(sw, /\\.\\/vendor\\/chess\\/chess\\.js/);
  assert.doesNotMatch(sw, /cdnjs\\.cloudflare\\.com\\/ajax\\/libs\\/chess\\.js/);
  assert.match(build, /"vendor\\/chess"/);
  assert.match(license, /vendor\\/chess\\/LICENSE/);
  assert.match(chess, /Copyright \\(c\\) 2020, Jeff Hlywa/);
});
