const BASE_URL = "https://lichess.org";
const CLIENT_ID = "taylor447.github.io/How2Chess";

function bytesToBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export async function createPkceRequest({ cryptoApi = globalThis.crypto, redirectUri }) {
  if (!cryptoApi?.subtle || !cryptoApi?.getRandomValues) throw new Error("Secure Web Crypto is required for Lichess sign-in.");
  const random = size => cryptoApi.getRandomValues(new Uint8Array(size));
  const verifier = bytesToBase64Url(random(48));
  const state = bytesToBase64Url(random(24));
  const digest = await cryptoApi.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  const query = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    redirect_uri: redirectUri,
    code_challenge_method: "S256",
    code_challenge: bytesToBase64Url(new Uint8Array(digest)),
    scope: "board:play",
    state
  });
  return { authorizationUrl: `${BASE_URL}/oauth?${query}`, verifier, state };
}

export function parseOAuthCallback(url, expectedState) {
  const callback = new URL(url);
  const error = callback.searchParams.get("error");
  if (error) throw new Error(callback.searchParams.get("error_description") || error);
  const state = callback.searchParams.get("state");
  const code = callback.searchParams.get("code");
  if (!state || !expectedState || state !== expectedState) throw new Error("Lichess sign-in state did not match.");
  if (!code) throw new Error("Lichess did not return an authorization code.");
  return code;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 10000, fetchImpl = fetch) {
  const controller = new AbortController();
  const external = options.signal;
  const forwardAbort = () => controller.abort(external?.reason);
  if (external?.aborted) forwardAbort();
  else external?.addEventListener("abort", forwardAbort, { once: true });
  const timer = setTimeout(() => controller.abort(new DOMException("Request timed out", "TimeoutError")), timeoutMs);
  const cleanup = () => external?.removeEventListener("abort", forwardAbort);
  let response;
  try {
    response = await fetchImpl(url, { ...options, signal: controller.signal });
  } catch (error) {
    clearTimeout(timer);
    cleanup();
    throw error;
  }
  clearTimeout(timer);
  if (!external || !response.body?.getReader) { cleanup(); return response; }

  // Keep forwarding cancellation after fetch resolves headers. This matters for
  // Board API streams, which can remain open for an entire game or seek.
  const reader = response.body.getReader();
  const body = new ReadableStream({
    async pull(streamController) {
      try {
        const { value, done } = await reader.read();
        if (done) { cleanup(); streamController.close(); }
        else streamController.enqueue(value);
      } catch (error) {
        cleanup();
        streamController.error(error);
      }
    },
    async cancel(reason) {
      cleanup();
      controller.abort(reason);
      try { await reader.cancel(reason); } catch (_) {}
    }
  });
  return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
}

async function requireOk(response) {
  if (response.ok) return response;
  const body = await response.text().catch(() => "");
  throw new Error(`Lichess request failed (${response.status})${body ? `: ${body.slice(0, 160)}` : ""}`);
}

export async function exchangePkceCode({ code, verifier, redirectUri, fetchImpl = fetch }) {
  const body = new URLSearchParams({ grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: redirectUri, client_id: CLIENT_ID });
  const response = await fetchWithTimeout(`${BASE_URL}/api/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body }, 10000, fetchImpl);
  const token = await (await requireOk(response)).json();
  if (!token.access_token) throw new Error("Lichess did not return an access token.");
  return token;
}

export async function getAccount(token, { fetchImpl = fetch } = {}) {
  const response = await fetchWithTimeout(`${BASE_URL}/api/account`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } }, 10000, fetchImpl);
  return (await requireOk(response)).json();
}

export async function createChallenge(token, username, { baseSeconds = 600, incrementSeconds = 0, color = "random", fetchImpl = fetch } = {}) {
  const cleanName = String(username || "").trim();
  if (!/^[a-zA-Z0-9_-]{2,30}$/.test(cleanName)) throw new Error("Enter a valid Lichess username.");
  const body = new URLSearchParams({ "clock.limit": String(baseSeconds), "clock.increment": String(incrementSeconds), color, rated: "false" });
  const response = await fetchWithTimeout(`${BASE_URL}/api/challenge/${encodeURIComponent(cleanName)}`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body
  }, 10000, fetchImpl);
  return (await requireOk(response)).json();
}

export async function acceptChallenge(token, challengeId, { fetchImpl = fetch } = {}) {
  if (!/^[a-zA-Z0-9_-]{4,32}$/.test(challengeId || "")) throw new Error("Invalid challenge ID.");
  const response = await fetchWithTimeout(`${BASE_URL}/api/challenge/${encodeURIComponent(challengeId)}/accept`, { method: "POST", headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } }, 10000, fetchImpl);
  return (await requireOk(response)).json().catch(() => ({}));
}

export async function openBoardSeek(token, { minutes = 10, incrementSeconds = 0, color = "random", signal, fetchImpl = fetch } = {}) {
  const body = new URLSearchParams({ time: String(minutes), increment: String(incrementSeconds), color, rated: "false", variant: "standard" });
  const response = await fetchWithTimeout(`${BASE_URL}/api/board/seek`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/x-ndjson" }, body, signal
  }, 15000, fetchImpl);
  await requireOk(response);
  return response;
}

export async function sendBoardMove(token, gameId, uci, { fetchImpl = fetch } = {}) {
  if (!/^[a-zA-Z0-9_-]{4,32}$/.test(gameId || "") || !/^[a-h][1-8][a-h][1-8][qrbn]?$/i.test(uci || "")) throw new Error("Invalid game or move.");
  const response = await fetchWithTimeout(`${BASE_URL}/api/board/game/${encodeURIComponent(gameId)}/move/${encodeURIComponent(uci)}`, { method: "POST", headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } }, 10000, fetchImpl);
  await requireOk(response);
  return true;
}

export async function resignBoardGame(token, gameId, { fetchImpl = fetch } = {}) {
  if (!/^[a-zA-Z0-9_-]{4,32}$/.test(gameId || "")) throw new Error("Invalid game ID.");
  const response = await fetchWithTimeout(`${BASE_URL}/api/board/game/${encodeURIComponent(gameId)}/resign`, { method: "POST", headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } }, 10000, fetchImpl);
  await requireOk(response);
}

export async function* readNdjson(response, { signal } = {}) {
  await requireOk(response);
  if (!response.body?.getReader) throw new Error("Streaming response is not available in this browser.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  try {
    while (true) {
      if (signal?.aborted) break;
      const { value, done } = await reader.read();
      pending += decoder.decode(value || new Uint8Array(), { stream: !done });
      const lines = pending.split(/\r?\n/);
      pending = lines.pop() || "";
      for (const line of lines) if (line.trim()) yield JSON.parse(line);
      if (done) break;
    }
    if (pending.trim()) yield JSON.parse(pending);
  } finally {
    try { await reader.cancel(); } catch (_) {}
    try { reader.releaseLock(); } catch (_) {}
  }
}

export async function openEventStream(token, { signal, fetchImpl = fetch } = {}) {
  const response = await fetchWithTimeout(`${BASE_URL}/api/stream/event`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/x-ndjson" }, signal }, 15000, fetchImpl);
  await requireOk(response);
  return response;
}

export async function openBoardGameStream(token, gameId, { signal, fetchImpl = fetch } = {}) {
  if (!/^[a-zA-Z0-9_-]{4,32}$/.test(gameId || "")) throw new Error("Invalid game ID.");
  const response = await fetchWithTimeout(`${BASE_URL}/api/board/game/stream/${encodeURIComponent(gameId)}`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/x-ndjson" }, signal }, 15000, fetchImpl);
  await requireOk(response);
  return response;
}
