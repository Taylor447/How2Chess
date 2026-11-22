import test from "node:test";
import assert from "node:assert/strict";
import { createPkceRequest, parseOAuthCallback, createChallenge, acceptChallenge, openBoardSeek, sendBoardMove, readNdjson, openEventStream } from "../lichess-board.mjs";

test("Lichess sign-in uses PKCE S256 and a least-privilege board scope", async () => {
  const request = await createPkceRequest({ redirectUri: "https://example.github.io/app/" });
  const url = new URL(request.authorizationUrl);
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("scope"), "board:play");
  assert.ok(url.searchParams.get("code_challenge"));
  assert.ok(request.verifier.length >= 43);
  assert.notEqual(request.state, request.verifier);
  assert.equal(parseOAuthCallback("https://example.github.io/app/?code=abc&state=" + request.state, request.state), "abc");
  assert.throws(() => parseOAuthCallback("https://example.github.io/app/?code=abc&state=wrong", request.state), /state did not match/);
});

test("Lichess challenge is unrated and uses the official form endpoint", async () => {
  let call;
  const result = await createChallenge("secret", "Friend_Name", {
    baseSeconds: 300,
    incrementSeconds: 2,
    fetchImpl: async (url, options) => {
      call = { url, options };
      return new Response(JSON.stringify({ challenge: { id: "abcd1234", url: "https://lichess.org/abcd1234" } }), { status: 200 });
    }
  });
  assert.equal(result.challenge.id, "abcd1234");
  assert.match(call.url, /\/api\/challenge\/Friend_Name$/);
  assert.equal(call.options.method, "POST");
  assert.equal(call.options.headers.Authorization, "Bearer secret");
  const body = new URLSearchParams(call.options.body);
  assert.equal(body.get("clock.limit"), "300");
  assert.equal(body.get("clock.increment"), "2");
  assert.equal(body.get("rated"), "false");
});

test("Lichess move validation blocks invalid UCI before network access", async () => {
  await assert.rejects(() => sendBoardMove("token", "abcd1234", "not-a-move", { fetchImpl: async () => { throw new Error("must not send"); } }), /Invalid game or move/);
});

test("Lichess casual seek uses Board API parameters and streams the response", async () => {
  let call;
  const stream = new Response(new ReadableStream({ start(controller) { controller.close(); } }), { status: 200 });
  const response = await openBoardSeek("secret", { minutes: 5, incrementSeconds: 3, color: "white", fetchImpl: async (url, options) => {
    call = { url, options };
    return stream;
  } });
  assert.equal(response, stream);
  assert.match(call.url, /\/api\/board\/seek$/);
  assert.equal(call.options.method, "POST");
  const body = new URLSearchParams(call.options.body);
  assert.equal(body.get("time"), "5");
  assert.equal(body.get("increment"), "3");
  assert.equal(body.get("color"), "white");
  assert.equal(body.get("rated"), "false");
  assert.equal(body.get("variant"), "standard");
});

test("accept challenge only posts to the validated official endpoint", async () => {
  let call;
  await acceptChallenge("secret", "abcd1234", { fetchImpl: async (url, options) => {
    call = { url, options };
    return new Response("", { status: 200 });
  } });
  assert.match(call.url, /\/api\/challenge\/abcd1234\/accept$/);
  assert.equal(call.options.method, "POST");
  await assert.rejects(() => acceptChallenge("secret", "x", { fetchImpl: async () => { throw new Error("must not send"); } }), /Invalid challenge ID/);
});

test("Lichess 429 responses stay identifiable for rate-limit backoff", async () => {
  await assert.rejects(() => openEventStream("secret", { fetchImpl: async () => new Response("slow down", { status: 429 }) }), /429/);
});

test("aborting a live Lichess stream still cancels the request after headers arrive", async () => {
  const external = new AbortController();
  let requestSignal;
  const response = await openEventStream("secret", {
    signal: external.signal,
    fetchImpl: async (_url, options) => {
      requestSignal = options.signal;
      return new Response(new ReadableStream({ pull() { return new Promise(() => {}); } }), { status: 200 });
    }
  });
  assert.equal(requestSignal.aborted, false);
  external.abort();
  assert.equal(requestSignal.aborted, true);
  await response.body.cancel().catch(() => {});
});

test("Lichess NDJSON parser handles split network chunks and the final line", async () => {
  const text = '{"type":"gameStart","game":{"id":"a"}}\n{"type":"challenge","challenge":{"id":"b"}}';
  const bytes = new TextEncoder().encode(text);
  let offset = 0;
  const response = new Response(new ReadableStream({
    pull(controller) {
      if (offset >= bytes.length) return controller.close();
      controller.enqueue(bytes.slice(offset, offset + 7));
      offset += 7;
    }
  }), { status: 200 });
  const events = [];
  for await (const event of readNdjson(response)) events.push(event);
  assert.deepEqual(events.map(event => event.type), ["gameStart", "challenge"]);
});
