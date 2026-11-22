# Third-party notices

- **Stockfish / Stockfish.js**: Stockfish engine code is licensed under GNU General Public License version 3 (GPL-3.0). Stockfish.js browser builds are distributed by the nmrugg/stockfish.js project and include the engine. If you redistribute an application containing the engine, provide the applicable copyright/license notices and comply with GPLv3 source distribution requirements.
  - https://github.com/nmrugg/stockfish.js
  - https://github.com/official-stockfish/Stockfish
- **chess.js 0.10.3**: bundled locally at `vendor/chess/chess.js` so the interface can start without a third-party CDN. Upstream license is included at `vendor/chess/LICENSE`.
  - https://github.com/jhlywa/chess.js
  - https://cdnjs.com/libraries/chess.js
- **fzstd 0.1.1**: bundled at `vendor/fzstd/` for streaming import of the official compressed Lichess puzzle database. Licensed under MIT; preserve `vendor/fzstd/LICENSE`.
  - https://github.com/101arrowz/fzstd
- **chessops 0.15.1**: loaded as a pinned browser module from esm.sh for variant move validation. chessops is licensed under GNU GPL version 3 or later. If you redistribute an application containing this module, provide the source and notices required by GPL-3.0-or-later.
  - https://github.com/niklasf/chessops
- **ONNX Runtime Web 1.31.1**: bundled locally from npm for browser inference. The upstream ONNX Runtime project is MIT-licensed; the setup script also copies the package license and third-party notices into `vendor/onnxruntime-web/` when supplied by the package. Preserve these notices when redistributing.
  - https://github.com/microsoft/onnxruntime/blob/main/LICENSE
- **How2Chess interface**: created for this project. The original chess piece SVG set in icons/pieces.svg is released under CC0 1.0; see icons/PIECES-LICENSE.md.
- **Lichess API**: How2Chess reads public tournament, broadcast, puzzle, and live-streamer data and optionally connects user-authorized casual games through Lichess OAuth PKCE with only the `board:play` scope and the official Board API. Lichess is an independent service; no Lichess marks or player imagery are bundled with this app. API response images, when present, are linked at runtime from the response and remain subject to their source terms. Live Board API play disables engine and Coach assistance to follow Lichess fair-play rules.
  - https://github.com/lichess-org/api/blob/master/doc/specs/lichess-api.yaml
  - https://lichess.org/api

The source project does not include a local copy of the Stockfish binary. The engine is loaded from its pinned CDN files at runtime and cached by the service worker where the browser permits it.
