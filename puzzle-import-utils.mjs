import { Decompress } from "./vendor/fzstd/esm/index.mjs";

/**
 * Turn a streaming Zstandard source into a streaming byte source.
 * The decoder receives small slices to keep transient memory bounded.
 */
export function createZstdReadableStream(source, { inputChunkSize = 64 * 1024 } = {}) {
  if (!source?.getReader) throw new TypeError("A readable source stream is required.");
  if (!Number.isSafeInteger(inputChunkSize) || inputChunkSize < 1) {
    throw new RangeError("inputChunkSize must be a positive safe integer.");
  }
  const sourceReader = source.getReader();
  const pending = [];
  let decoder;
  let inputChunk = null;
  let inputOffset = 0;
  let sourceDone = false;
  let cancelled = false;

  return new ReadableStream({
    start() {
      decoder = new Decompress((chunk) => {
        if (chunk?.byteLength) pending.push(chunk);
      });
    },
    async pull(controller) {
      try {
        while (!pending.length && !sourceDone && !cancelled) {
          if (!inputChunk || inputOffset >= inputChunk.length) {
            const { value, done } = await sourceReader.read();
            if (done) {
              decoder.push(new Uint8Array(0), true);
              sourceDone = true;
              sourceReader.releaseLock();
              break;
            }
            inputChunk = value instanceof Uint8Array ? value : new Uint8Array(value);
            inputOffset = 0;
          }
          const end = Math.min(inputChunk.length, inputOffset + inputChunkSize);
          decoder.push(inputChunk.subarray(inputOffset, end));
          inputOffset = end;
        }
        if (pending.length) controller.enqueue(pending.shift());
        else if (sourceDone || cancelled) controller.close();
      } catch (error) {
        cancelled = true;
        try { await sourceReader.cancel(error); } catch (_) {}
        try { sourceReader.releaseLock(); } catch (_) {}
        controller.error(error);
      }
    },
    async cancel(reason) {
      cancelled = true;
      pending.length = 0;
      await sourceReader.cancel(reason);
      sourceReader.releaseLock();
    }
  });
}
