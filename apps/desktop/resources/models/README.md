# Detection models

Every model, wasm and language file the Üki app loads at run time. Nothing is fetched from a CDN: the app serves this folder through its `uki://` scheme as `uki://app/resources/models/`.

Only `manifest.json`, this README and `.gitignore` are committed. Fetch the rest once per clone:

```sh
pnpm --filter @uki/detection models          # fetch what is missing or changed, then write manifest.json
pnpm --filter @uki/detection models:verify   # change nothing; exit 1 if a file is missing or differs
```

`manifest.json` records each file's path, size, SHA-256 and source, and acts as the lock file. On a fresh clone the script downloads or copies each file again and refuses one whose hash differs from the manifest. Add `--update` only when a source changed on purpose, for example after a package upgrade. Files whose hash already matches are skipped, so a slow connection downloads each file once.

| Path | What | Source |
| --- | --- | --- |
| `face_landmarker.task` | MediaPipe Face Landmarker, float16 | storage.googleapis.com/mediapipe-models |
| `efficientdet_lite0.tflite` | MediaPipe Object Detector, EfficientDet-Lite0 int8 (the CPU model) | storage.googleapis.com/mediapipe-models |
| `wasm/vision_wasm_module_internal.{js,wasm}` | tasks-vision ES-module build, used by the detection worker | `@mediapipe/tasks-vision` |
| `wasm/vision_wasm_internal.{js,wasm}` | tasks-vision classic build, kept as a fallback for a classic worker | `@mediapipe/tasks-vision` |
| `human/blazeface.{json,bin}`, `human/faceres.{json,bin}` | Human's face detector and face description models, for the card match on 1.3 | `@vladmandic/human` |
| `tesseract/worker.min.js` | tesseract.js browser worker | `tesseract.js` |
| `tesseract/core/tesseract-core{,-simd,-relaxedsimd}-lstm.wasm.js` | tesseract.js-core LSTM builds; the worker picks one by CPU features | `tesseract.js-core` |
| `tesseract/lang/eng.traineddata` | English, tessdata_fast; the card digits are read with a digits-only whitelist | github.com/tesseract-ocr/tessdata_fast |

About 56 MB in total. The tasks-vision no-SIMD build is left out because Electron 44's Chromium always has wasm SIMD.

## Serving them

- The `uki://` handler must answer `fetch` and module imports with the right types: `.js` as `text/javascript`, `.wasm` as `application/wasm`, `.json` as `application/json`, everything else as `application/octet-stream`. Module scripts are refused without a JavaScript MIME type.
- Register the scheme as `standard`, `secure`, `supportFetchAPI` and `corsEnabled`, so the detection worker can `import()` the wasm loader and Tesseract can start its worker from it.
- electron-builder must ship this folder outside the asar or as `extraResources`, and the handler maps `uki://app/resources/models/` to it.
- The Content Security Policy in the plan already allows what these files need: `script-src 'self' 'wasm-unsafe-eval'` and `worker-src 'self' blob:`.
