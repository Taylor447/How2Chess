/* Local H2C policy/value inference. Board encoding mirrors src/h2c/board_encoding.py. */
"use strict";

let session = null;
const FILES = "abcdefgh";
const RAYS = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1],[1,-1],[-1,-1]];
const KNIGHTS = [[1,2],[2,1],[2,-1],[1,-2],[-1,-2],[-2,-1],[-2,1],[-1,2]];
const PIECE_PLANES = { P:0, N:1, B:2, R:3, Q:4, K:5, p:6, n:7, b:8, r:9, q:10, k:11 };

try {
  importScripts("./vendor/onnxruntime-web/ort.min.js");
  // Keep the large WASM binary out of the source repo; the service worker caches this pinned CDN copy.
  ort.env.wasm.wasmPaths = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.1/dist/";
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
} catch (error) {
  self.postMessage({ type:"error", message:"Không nạp được ONNX Runtime Web. Hãy chạy npm install rồi npm run setup:onnx." });
}

function canonicalSquare(text, blackToMove) {
  const file = FILES.indexOf(text[0]);
  const actualRank = Number(text[1]) - 1;
  const rank = blackToMove ? 7 - actualRank : actualRank;
  if (file < 0 || actualRank < 0 || actualRank > 7) throw new Error("Ô cờ không hợp lệ: " + text);
  return { file, rank, index:rank * 8 + file };
}

function encodeFen(fen) {
  const parts = String(fen).trim().split(/\s+/);
  if (parts.length < 4) throw new Error("FEN không đủ trường để mã hóa bàn cờ.");
  const blackToMove = parts[1] === "b";
  const channels = new Float32Array(22 * 64);
  const ranks = parts[0].split("/");
  if (ranks.length !== 8) throw new Error("FEN phải có đúng 8 hàng.");
  for (let visualRow = 0; visualRow < 8; visualRow++) {
    let file = 0;
    const actualRank = 7 - visualRow;
    const canonicalRank = blackToMove ? 7 - actualRank : actualRank;
    const row = 7 - canonicalRank;
    for (const char of ranks[visualRow]) {
      if (/^[1-8]$/.test(char)) { file += Number(char); continue; }
      const plane = PIECE_PLANES[char];
      if (plane === undefined || file > 7) throw new Error("FEN có ký hiệu quân cờ không hợp lệ.");
      channels[plane * 64 + row * 8 + file] = 1;
      file++;
    }
    if (file !== 8) throw new Error("Một hàng trong FEN không đủ 8 ô.");
  }
  const castling = parts[2] || "-";
  for (const [plane, right] of [[12,"K"],[13,"Q"],[14,"k"],[15,"q"]]) {
    if (castling.includes(right)) channels.fill(1, plane * 64, (plane + 1) * 64);
  }
  channels.fill(blackToMove ? 0 : 1, 16 * 64, 17 * 64);
  if (parts[3] !== "-") {
    const ep = canonicalSquare(parts[3], blackToMove);
    channels[17 * 64 + (7 - ep.rank) * 8 + ep.file] = 1;
  }
  channels.fill(Math.max(0, Number(parts[4] || 0)) / 100, 18 * 64, 19 * 64);
  // FEN carries no repetition history; the training pipeline builds its input from FEN too.
  channels.fill(0, 19 * 64, 21 * 64);
  channels.fill(Math.max(1, Number(parts[5] || 1)) / 300, 21 * 64, 22 * 64);
  return channels;
}

function moveToIndex(uci, blackToMove) {
  if (typeof uci !== "string" || uci.length < 4) throw new Error("Nước UCI không hợp lệ: " + uci);
  const from = canonicalSquare(uci.slice(0, 2), blackToMove);
  const to = canonicalSquare(uci.slice(2, 4), blackToMove);
  const dx = to.file - from.file;
  const dy = to.rank - from.rank;
  const promotion = uci[4];
  let plane;
  if (promotion && promotion !== "q") {
    const direction = { "-1":0, "0":1, "1":2 }[String(dx)];
    const piece = { n:0, b:1, r:2 }[promotion.toLowerCase()];
    if (direction === undefined || piece === undefined) throw new Error("Mã hóa phong cấp không hợp lệ: " + uci);
    plane = 64 + direction * 3 + piece;
  } else {
    const knight = KNIGHTS.findIndex(([x,y]) => x === dx && y === dy);
    if (knight >= 0) plane = 56 + knight;
    else {
      const distance = Math.max(Math.abs(dx), Math.abs(dy));
      const direction = RAYS.findIndex(([x,y]) => x * distance === dx && y * distance === dy);
      if (distance < 1 || direction < 0) throw new Error("Không mã hóa được nước đi: " + uci);
      plane = direction * 7 + distance - 1;
    }
  }
  return from.index * 73 + plane;
}

function softmax(values) {
  const max = Math.max(...values);
  const exps = values.map(value => Math.exp(value - max));
  const total = exps.reduce((sum, value) => sum + value, 0) || 1;
  return exps.map(value => value / total);
}

async function loadModel(modelUrl) {
  if (typeof ort === "undefined") throw new Error("ONNX Runtime Web chưa sẵn sàng. Chạy npm run setup:onnx.");
  if (!modelUrl) throw new Error("Chưa chọn đường dẫn model ONNX.");
  const url = new URL(modelUrl, self.location.href).href;
  session = await ort.InferenceSession.create(url, {
    executionProviders:["wasm"],
    graphOptimizationLevel:"all"
  });
  if (!session.inputNames.includes("board")) throw new Error("Model không có đầu vào 'board' như H2C-Engine yêu cầu.");
  if (!session.outputNames.includes("policy_logits") || !session.outputNames.includes("value")) {
    throw new Error("Model cần có đầu ra 'policy_logits' và 'value'. Hãy dùng file xuất bởi h2c.export.");
  }
}

async function analyze(fen, legalMoves) {
  if (!session) throw new Error("Model chưa tải xong.");
  if (!Array.isArray(legalMoves) || legalMoves.length === 0) return { bestMove:null, topMoves:[], wdl:null };
  const blackToMove = String(fen).trim().split(/\s+/)[1] === "b";
  const board = new ort.Tensor("float32", encodeFen(fen), [1,22,8,8]);
  const start = performance.now();
  const output = await session.run({ board });
  const elapsedMs = performance.now() - start;
  if (output.policy_logits.data.length !== 4672 || output.value.data.length !== 3) {
    throw new Error("Model output must contain 4672 policy logits and 3 WDL values. Re-export with the tiny WDL profile.");
  }
  const logits = output.policy_logits.data;
  const scored = legalMoves.map(uci => ({ uci, score:Number(logits[moveToIndex(uci, blackToMove)]) }))
    .filter(item => Number.isFinite(item.score))
    .sort((a,b) => b.score - a.score)
    .slice(0,3);
  const wdl = softmax(Array.from(output.value.data, Number));
  return { bestMove:scored[0]?.uci ?? null, topMoves:scored, wdl, elapsedMs };
}

self.onmessage = async ({ data }) => {
  try {
    if (data.type === "init") {
      await loadModel(data.modelUrl);
      self.postMessage({ type:"ready" });
    } else if (data.type === "analyze") {
      const result = await analyze(data.fen, data.legalMoves);
      self.postMessage({ type:"result", requestId:data.requestId, ...result });
    }
  } catch (error) {
    const detail = error && error.message ? error.message : String(error);
    const modelHint = /404|fetch|network|failed to load|unable to load/i.test(detail)
      ? " Không tải được model. Hãy chép how2chess.int8.onnx vào thư mục models của How2Chess."
      : "";
    self.postMessage({ type:"error", requestId:data.requestId, message:detail + modelHint });
  }
};
