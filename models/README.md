# H2C-Engine model

Copy the model exported on your computer to this folder and name it:

    how2chess.int8.onnx

Expected path: `models/how2chess.int8.onnx`.

The app sends the current FEN and chess.js legal moves to a local Web Worker. The Worker encodes the board as float32 `[1,22,8,8]`, runs the ONNX model with the WASM provider, then ranks only legal moves. No position is uploaded.
