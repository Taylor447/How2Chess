import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { test } from "node:test";

const root = new URL("../", import.meta.url);
const app = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const serviceSource = readFileSync(new URL("../follow-service.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("../app.css", import.meta.url), "utf8");
const sw = readFileSync(new URL("../sw.js", import.meta.url), "utf8");
const build = readFileSync(new URL("../scripts/copy-web.mjs", import.meta.url), "utf8");

test("Follow and quick-play screens are active hash routes", () => {
  for (const id of ["featured", "events", "tv", "streamers", "play"]) {
    assert.ok(app.includes('"id":"' + id + '"'), id);
    assert.ok(app.includes('activeSideRoute==="' + id + '"'), id);
  }
  assert.match(app, /const ready=\[[\s\S]*?"featured"[\s\S]*?"play"[\s\S]*?\]\.includes\(routeId\)/);
  assert.match(app, /function startBotGame\(/);
  assert.match(app, /data-quick-play/);
});

test("Lichess requests use public documented endpoints with timeout, serialized queue, stale cache, and 429 cooldown", () => {
  assert.match(serviceSource, /API\+"\/broadcast\?nb=20&live=true"/);
  assert.match(serviceSource, /API\+"\/tournament"/);
  assert.match(serviceSource, /API\+"\/streamer\/live"/);
  assert.match(serviceSource, /12000/);
  assert.match(serviceSource, /1200-\(Date\.now\(\)-lastRequest\)/);
  assert.match(serviceSource, /response\.status===429/);
  assert.match(serviceSource, /cooldownUntil=Date\.now\(\)\+60000/);
  assert.match(serviceSource, /savedAt/);
});

test("Follow service parses NDJSON and stores a successful response for offline reuse", async () => {
  const memory = new Map(), requests = [];
  const window = { dispatchEvent() {} };
  const context = {
    window,
    localStorage: { getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) },
    fetch: async (url, options) => { requests.push({ url, options }); return { ok: true, status: 200, text: async () => '{"id":"broadcast-a"}\nnot-json\n{"id":"broadcast-b"}\n' }; },
    AbortController,
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } },
    setTimeout,
    clearTimeout,
    Date,
    Promise,
    JSON,
    Error,
    URL,
    String,
    Array,
    Math
  };
  runInNewContext(serviceSource, context);
  const service = window.H2CFollowService;
  assert.deepEqual(JSON.parse(JSON.stringify(service.parseNdjson('{"n":1}\nbad\n{"n":2}'))), [{ n: 1 }, { n: 2 }]);
  const result = await service.load("broadcasts");
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "https://lichess.org/api/broadcast?nb=20&live=true");
  assert.deepEqual(JSON.parse(JSON.stringify(result.data)), [{ id: "broadcast-a" }, { id: "broadcast-b" }]);
  assert.equal(service.state("broadcasts").fresh, true);
  assert.ok(memory.has("h2c-follow-broadcasts"));
});

test("Events export .ics reminders, H2C TV uses official TV routes, and streamers open externally", () => {
  assert.match(app, /function downloadEventReminder\(/);
  assert.match(app, /BEGIN:VCALENDAR/);
  assert.match(app, /https:\/\/lichess\.org\/tv\//);
  assert.match(app, /rel="noopener noreferrer"/);
  assert.match(app, /function renderStreamersRoute\(/);
  assert.match(css, /\.tv-frame-wrap iframe/);
});

test("Follow service is bundled and the offline shell cache is invalidated", () => {
  assert.match(html, /\.\/follow-service\.js/);
  assert.match(build, /"follow-service\.js"/);
  assert.match(sw, /how2chess-v13/);
  assert.match(sw, /\.\/follow-service\.js/);
});
