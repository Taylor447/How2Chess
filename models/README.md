# H2C-Engine model

`how2chess.int8.onnx` is the INT8 model exported from the local H2C-Engine training run and used by the How2Chess app.

The app sends the current FEN and chess.js legal moves to a local Web Worker. The Worker encodes the board as float32 `[1,22,8,8]`, runs the ONNX model with the WASM provider, then ranks only legal moves. No position is uploaded.
