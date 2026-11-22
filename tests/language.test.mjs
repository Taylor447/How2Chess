import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");

test("English is the initial site language, including on saved installations", () => {
  assert.match(html, /<html lang="en">/);
  assert.match(app, /language:"en"/);
  assert.match(app, /h2c-language-default-en/);
  assert.match(app, /settings.language = "en"/);
});

test("static page copy and accessibility labels are English", () => {
  const latinDiacritics = /[\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u024F\u1E00-\u1EFF]/;
  const visibleText = [...html.matchAll(/>([^<>]+)</g)].map((match) => match[1].trim()).filter(Boolean);
  const labels = [...html.matchAll(/\b(?:aria-label|title|placeholder|alt|content)="([^"]*)"/g)].map((match) => match[1]);
  assert.deepEqual(visibleText.filter((value) => latinDiacritics.test(value)), []);
  assert.deepEqual(labels.filter((value) => latinDiacritics.test(value)), []);
});

test("English locale covers dynamic labels, feedback, and resource screens", () => {
  assert.ok(app.includes("function translateDocument()"));
  assert.ok(app.includes("translatedAttributes"));
  assert.ok(app.includes("function resourceContent(name)"));
  assert.ok(app.includes("the first Chess Calculator release"));
  assert.ok(app.includes("Could not load chess.js"));
  assert.ok(app.includes("settings.language"));
});
