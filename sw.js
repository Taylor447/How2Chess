"use strict";
const CACHE_NAME = "how2chess-v4";
const LOCAL_ASSETS = [
  "./",
  "./index.html",
  "./app.css",
  "./app.js",
  "./engine-worker.js",
  "./onnx-engine-worker.js",
  "./manifest.webmanifest",
  "./icons/pieces.svg",
  "./icons/icon-192.svg",
  "./icons/icon-512.svg",
  "./models/how2chess.int8.onnx",
  "./vendor/onnxruntime-web/ort.min.js",
  "./vendor/onnxruntime-web/ort-wasm-simd-threaded.mjs"
];
const REMOTE_ASSETS = [
  "https://cdnjs.cloudflare.com/ajax/libs/chess.js/0.10.3/chess.min.js",
  "https://cdn.jsdelivr.net/npm/stockfish@19.0.0/bin/stockfish-19-lite-single.js",
  "https://cdn.jsdelivr.net/npm/stockfish@19.0.0/bin/stockfish-19-lite-single.wasm",
  "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.1/dist/ort-wasm-simd-threaded.mjs",
  "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.1/dist/ort-wasm-simd-threaded.wasm"
];
self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(LOCAL_ASSETS);
    await Promise.allSettled(REMOTE_ASSETS.map(async url => {
      const response = await fetch(url, { mode: "cors", cache: "reload" });
      if (response.ok) await cache.put(url, response);
    }));
    await self.skipWaiting();
  })());
});
self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith("how2chess-") && name !== CACHE_NAME).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});
self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  const isAppAsset = url.origin === self.location.origin;
  const isPinnedCdn = REMOTE_ASSETS.includes(url.href);
  if (!isAppAsset && !isPinnedCdn) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    if (cached) return cached;
    try {
      const response = await fetch(request);
      if (response.ok) cache.put(request, response.clone());
      return response;
    } catch (error) {
      if (request.mode === "navigate") return cache.match("./index.html");
      throw error;
    }
  })());
});
