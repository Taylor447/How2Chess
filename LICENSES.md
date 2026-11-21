# Third-party notices

- **Stockfish / Stockfish.js**: Stockfish engine code is licensed under GNU General Public License version 3 (GPL-3.0). Stockfish.js browser builds are distributed by the nmrugg/stockfish.js project and include the engine. If you redistribute an application containing the engine, provide the applicable copyright/license notices and comply with GPLv3 source distribution requirements.
  - https://github.com/nmrugg/stockfish.js
  - https://github.com/official-stockfish/Stockfish
- **chess.js 0.10.3**: loaded from cdnjs at runtime. Preserve the upstream license and notices when vendoring or redistributing that library.
  - https://github.com/jhlywa/chess.js
  - https://cdnjs.com/libraries/chess.js
- **chessops 0.15.1**: loaded as a pinned browser module from esm.sh for variant move validation. chessops is licensed under GNU GPL version 3 or later. If you redistribute an application containing this module, provide the source and notices required by GPL-3.0-or-later.
  - https://github.com/niklasf/chessops
- **ONNX Runtime Web 1.31.1**: bundled locally from npm for browser inference. The upstream ONNX Runtime project is MIT-licensed; the setup script also copies the package license and third-party notices into `vendor/onnxruntime-web/` when supplied by the package. Preserve these notices when redistributing.
  - https://github.com/microsoft/onnxruntime/blob/main/LICENSE
- **How2Chess interface**: created for this project. The original chess piece SVG set in icons/pieces.svg is released under CC0 1.0; see icons/PIECES-LICENSE.md.
- **Lichess public API**: How2Chess reads public tournament, broadcast, and live-streamer metadata from documented Lichess endpoints. No Lichess marks or player imagery are bundled; any event image from API responses is linked at runtime and remains subject to its source terms.
  - https://github.com/lichess-org/api/blob/master/doc/specs/lichess-api.yaml
  - https://lichess.org/api

The source project does not include a local copy of the Stockfish binary. The engine is loaded from its pinned CDN files at runtime and cached by the service worker where the browser permits it.
