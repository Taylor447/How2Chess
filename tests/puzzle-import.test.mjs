import test from "node:test";
import assert from "node:assert/strict";
import { createZstdReadableStream } from "../puzzle-import-utils.mjs";

const OK_ZSTD = new Uint8Array([
  0x28, 0xb5, 0x2f, 0xfd, 0x24, 0x02, 0x11, 0x00,
  0x00, 0x4f, 0x6b, 0x64, 0x50, 0xa9, 0x5a
]);

test("streaming Zstandard decoder preserves input split across tiny chunks", async () => {
  let offset = 0;
  const compressed = new ReadableStream({
    pull(controller) {
      if (offset >= OK_ZSTD.length) return controller.close();
      controller.enqueue(OK_ZSTD.slice(offset, offset + 2));
      offset += 2;
    }
  });
  const decoded = createZstdReadableStream(compressed, { inputChunkSize: 3 });
  const reader = decoded.getReader();
  const chunks = [];
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const bytes = new Uint8Array(chunks.reduce((size, chunk) => size + chunk.length, 0));
  let position = 0;
  for (const chunk of chunks) { bytes.set(chunk, position); position += chunk.length; }
  assert.equal(new TextDecoder().decode(bytes), "Ok");
});

test("streaming Zstandard decoder rejects malformed input", async () => {
  const source = new ReadableStream({ start(controller) {
    controller.enqueue(new Uint8Array([1, 2, 3, 4]));
    controller.close();
  } });
  const reader = createZstdReadableStream(source).getReader();
  await assert.rejects(async () => {
    while (!(await reader.read()).done) {}
  });
});
