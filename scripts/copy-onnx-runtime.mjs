import { cp, mkdir, readdir, unlink } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const source = new URL("../node_modules/onnxruntime-web/dist/", import.meta.url);
const target = new URL("../vendor/onnxruntime-web/", import.meta.url);

let names;
try {
  names = await readdir(source);
} catch {
  throw new Error("onnxruntime-web is not installed. Run: npm install");
}

const wanted = names.filter(name => name === "ort.min.js" ||
  name === "ort-wasm-simd-threaded.mjs" || name === "ort-wasm-simd-threaded.wasm");
if (!wanted.includes("ort.min.js") || !wanted.some(name => name.endsWith(".wasm"))) {
  throw new Error("Could not find the ONNX Runtime Web JS/WASM files in node_modules/onnxruntime-web/dist.");
}

await mkdir(target, { recursive:true });
for (const name of await readdir(target)) {
  if (name.startsWith("ort-wasm-simd-threaded.") &&
      name !== "ort-wasm-simd-threaded.mjs" && name !== "ort-wasm-simd-threaded.wasm") {
    await unlink(new URL(name, target)).catch(() => {});
  }
}
for (const name of wanted) await cp(new URL(name, source), new URL(name, target));
const packageRoot = new URL("../node_modules/onnxruntime-web/", import.meta.url);
for (const name of ["LICENSE", "ThirdPartyNotices.txt"]) {
  try {
    await cp(new URL(name, packageRoot), new URL(name, target));
    wanted.push(name);
  } catch {
    // Some package distributions omit optional notice files.
  }
}
console.log(`Copied ONNX Runtime Web assets (${wanted.join(", ")}) into vendor/onnxruntime-web/.`);
