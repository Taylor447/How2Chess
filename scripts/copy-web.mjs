import { cp, mkdir, rm } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const output = new URL("../dist/", import.meta.url);
const files = [
  "index.html",
  "app.css",
  "app.js",
  "engine-worker.js",
  "onnx-engine-worker.js",
  "sw.js",
  "manifest.webmanifest",
  "icons",
  "models",
  "vendor/onnxruntime-web"
];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const file of files) {
  await cp(new URL(file, root), new URL(file, output), { recursive: true });
}
console.log("How2Chess web assets copied to dist/.");
