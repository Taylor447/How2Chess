import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const sw = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
const build = readFileSync(new URL("../scripts/copy-web.mjs", import.meta.url), "utf8");
const license = readFileSync(new URL("../LICENSES.md", import.meta.url), "utf8");
const chess = readFileSync(new URL("../vendor/chess/chess.js", import.meta.url), "utf8");

test("chess.js is local and does not block the How2Chess UI on a third-party CDN", () => {
  assert.ok(html.includes('<script src="./vendor/chess/chess.js" defer></script>'));
  assert.ok(!html.includes("cdnjs.cloudflare.com/ajax/libs/chess.js"));
  assert.ok(sw.includes("./vendor/chess/chess.js"));
  assert.ok(!sw.includes("cdnjs.cloudflare.com/ajax/libs/chess.js"));
  assert.ok(build.includes('"vendor/chess"'));
  assert.ok(license.includes("vendor/chess/LICENSE"));
  assert.ok(chess.includes("Copyright (c) 2020, Jeff Hlywa"));
});
