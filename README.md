# How2Chess — Chess Calculator

How2Chess is a static, mobile-first PWA for arranging chess positions, checking legal moves, analyzing with Stockfish, and saving positions locally. The same source supports a browser install and an Android wrapper built with Capacitor.

## What is included

- index.html, app.css, app.js: landing page and the three app tabs: H2C, Library, Options.
- engine-worker.js: UCI bridge to the single-threaded Stockfish WASM build.
- sw.js, manifest.webmanifest, icons/: PWA metadata and offline asset cache.
- scripts/copy-web.mjs, capacitor.config.json: prepares the static files for Android packaging.

The interface and local app data have no backend. Saved boards and preferences use localStorage. Stockfish and chess.js are loaded from pinned public CDNs when needed; the service worker attempts to cache those files for repeat offline use after the first successful connection.

## Run locally

The interface may open from index.html, but browsers can restrict workers and service workers on file://. For full engine/PWA behavior, serve the folder over localhost:

    python -m http.server 8000

The repository includes your model and the small ONNX Runtime Web loader. The pinned ONNX Runtime WASM binary is fetched from jsDelivr on first use and cached by the service worker for offline use. Then open http://localhost:8000 from the how2chess folder, or run the included tiny static server:

    npm run serve

Open http://localhost:4173.

## Connect the locally trained H2C model

The app includes your exported INT8 model at `models/how2chess.int8.onnx` and the ONNX Runtime Web JavaScript loader under `vendor/onnxruntime-web/`. It fetches the pinned WASM runtime from jsDelivr on first use, then the service worker can cache it for offline use. The app feeds a float32 `[1,22,8,8]` tensor to the model in a Web Worker and filters its policy scores through the legal moves from chess.js. H2C AI is policy-only: it responds immediately, does not search ahead, and has no measured Elo. Think time, MultiPV, Hash, and Elo settings apply to Stockfish only.

From the extracted How2Chess project folder in PowerShell:

```powershell
npm run serve
```

Open `http://localhost:4173`, go to **Options > Engine Strength**, choose **How2Chess AI (INT8, policy only)**, return to H2C, and press **Calculate**. To rebuild or refresh the bundled runtime, run `npm install` and then `npm run setup:onnx`.

If you are integrating these source changes into a different How2Chess folder, copy your export to the expected location first:

```powershell
New-Item -ItemType Directory -Force .\models
Copy-Item "C:\Users\nduct\Downloads\H2C-Engine-CPU-0.2.0\runs\exports\how2chess.int8.onnx" ".\models\how2chess.int8.onnx"
```

Change the source path if your H2C-Engine folder is elsewhere. For GitHub Pages, run `npm install` and `npm run build:web`, then publish `dist/`; this includes the model and runtime files. After one online calculation, the browser can reuse the model and runtime from the service-worker cache offline. Your current INT8 model is about 1.06 MiB.
## Deploy to GitHub Pages

1. Create a GitHub repository and put the contents of this how2chess folder at its root.
2. Push the files to the main branch.
3. In GitHub, open Settings → Pages.
4. Under Build and deployment, choose Deploy from a branch, select main and / (root), then save.
5. Wait for Pages to publish, then open the supplied https://<owner>.github.io/<repository>/ URL.

All app assets use relative paths, so the project also works from a repository subpath. PWA installation and service-worker caching require HTTPS; GitHub Pages provides HTTPS.

## Build an Android APK with Capacitor

Install Node.js, npm, and Android Studio with an Android SDK. From the project folder:

    npm install
    npm install @capacitor/core @capacitor/android
    npm install --save-dev @capacitor/cli
    npm run build:web
    npx cap add android
    npx cap sync android
    npx cap open android

In Android Studio, choose Build → Generate Signed Bundle / APK → APK, create or select a signing key, and finish the wizard. For later web changes, rerun:

    npm run build:web
    npx cap sync android

capacitor.config.json points Capacitor at the generated dist/ folder. The Android wrapper still loads the pinned CDN engine assets, so the first engine use needs internet; after caching, browser PWA offline behavior depends on the service worker and the Android WebView cache.

## Engine strength notes

Stockfish searches in a dedicated worker and the interface remains responsive. This project uses the compact, single-threaded lite WASM engine for compatibility with static hosts and phones. Its UCI rating controls are approximate; the build clamps UCI_Elo to Stockfish's supported range and uses Skill Level for lower targets. A displayed target Elo is not an exact promise of playing strength. “Đấu với máy” plays against Stockfish at the configured level; it does not imitate a named grandmaster's personal style.

## Licenses

See LICENSES.md before redistributing a build. Stockfish.js contains GPLv3 engine code; comply with GPLv3 when you distribute a bundled engine. chess.js 0.10.3 is provided by cdnjs and is distributed under its upstream BSD-style license. The original How2Chess UI, board illustrations, and inline piece artwork are project code.

## Suggested next upgrades

- PGN game review with move-by-move accuracy and blunder explanations.
- Position recognition from a board photo.
- More engine profiles, time controls, and a move history panel.
- Cloud sync or shareable study links (would require a backend).
