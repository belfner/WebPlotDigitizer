# Changes in this fork

This fork adapts the WebPlotDigitizer frontend (AGPL v3, upstream v5.3.0, upstream commit
`3a3ecb11606945d0701c8a488777e6861be70056`) into an unofficial backend-less static deployment on
GitHub Pages, and adds several local, offline extraction features on top of it. All changes are by
belfner, made during 2026 (the initial static-deployment work is dated 2026-06-24; later feature
work follows in subsequent commits). The authoritative, dated record of every change is the Git
history at https://github.com/belfner/WebPlotDigitizer.

## Disabled backend features

This deployment is permanently backend-less: `wpd.staticPagesDeployment` is hardcoded to `true` and
compiled into `wpd.min.js`, so the following Automeris backend features are disabled for every
visitor, with no runtime toggle:

- AI Assist (autogenerate calibration and datasets). The toolbar button is emitted only in cloud
  mode, and `wpd.ai.assist()` / `wpd.ai.runQuery()` short-circuit before any `/api/vision/*` call.
- User accounts and login (the on-load `/api/user` check and `/login` redirect).
- Cloud project save/load and the `?projectId=...` cloud fetch.
- Usage quota display.
- Analytics reporting.
- Server-side preferences (the language defaults to English).

## Backend-gating changes

- Added a static-deployment capability gate in `javascript/services/cloud.js`
  (`wpd.staticPagesDeployment` / `wpd.hasCloudBackend()`). Every backend network call is gated on
  `wpd.hasCloudBackend()`:
  - `cloud.js`: the on-load login check no longer issues `/api/user` or redirects to `/login`;
    `getQuotaLimits()`, `cloudNewImage()`, and `CloudProject` network methods short-circuit.
  - `log.js`: the per-page-load `/api/analytics` request is suppressed.
  - `prefs.js`: `/api/prefs` reads/writes are skipped; the language defaults to English.
  - `ai.js`: `assist()` and `runQuery()` return early instead of calling `/api/vision/*`.
  - `main.js`: a `?projectId=...` argument falls back to the default image instead of fetching a
    cloud project.

## New local extraction features

These features run entirely client-side and replace, with offline algorithms, capabilities that
upstream provides via the proprietary cloud backend:

- **Automatic axis calibration** (`javascript/core/auto_calibration/`, controller
  `javascript/controllers/autoCalibration.js`, tool `javascript/tools/autoCalibrationTools.js`).
  Detects the X and Y axis rules (`axisDetector.js`), tick marks along them (`tickDetector.js`),
  reads the numeric tick labels by OCR (`numericOcr.js`, `numericGrammar.js`), and solves the
  pixel-to-data calibration (`calibrationSolver.js`), with an interactive review step
  (`reviewModel.js`, `javascript/controllers/autoCalibrationUndoActions.js`).
- **Local OCR** via a bundled WebAssembly Tesseract engine. The OCR runs in a Web Worker
  (`javascript/workers/autoCalibrationOcrWorker.js`) against `vendor/tesseract-wasm/`, so tick-label
  recognition works fully offline with no cloud call.
- **Bar-chart auto axis calibration** support within the auto-calibration flow.
- **Mask tool overhaul** (`javascript/tools/maskTools.js`,
  `javascript/controllers/maskUndoActions.js`): a unified brush, undo/redo, and transparent stroke
  rendering.
- **Point-edit tooling** (`javascript/tools/pointEditTools.js`,
  `javascript/controllers/pointUndoActions.js`) with undo/redo support, built on a shared action
  base (`javascript/controllers/actionBase.js`).
- A cursor overlay that stays live across zoom, pan, and point placement
  (`javascript/widgets/graphicsWidget.js`).

## UI and link changes

- Repointed the in-app **User Manual** links (the `templates/_sidebars.html` start sidebar and the
  `templates/_menubar.html` Help menu) to the fork's own hosted user guide at `docs/`. The
  calibration sidebars' input-format footnotes reference the upstream specification at
  `https://automeris.io/docs/`.
- Disabled the Plotly export buttons (`Graph in Plotly`, `Export to Plotly`) in
  `templates/_popups.html`. Plotly retired the chart-studio `/external` import endpoint these POST
  to, so the export is inert in upstream WebPlotDigitizer and in this fork; the markup, handlers,
  and `javascript/services/plotly.js` are retained with explanatory comments.
- Repointed the "Report Issues" menu item to this fork and added a "Source Code" menu item
  (`templates/_menubar.html`).
- Added an unofficial / non-affiliation / source notice to the About popup
  (`templates/_popups.html`), including links to the exact build commit (`SOURCE.txt`) and to the
  bundled third-party notices (`THIRD_PARTY_NOTICES.md`).

## Bundled third-party components

The deployment redistributes third-party libraries, fonts, and data alongside the AGPL frontend:

- `vendor/tesseract-wasm/` for local OCR (tesseract-wasm 0.11.0, with the embedded Tesseract OCR,
  Leptonica, Comlink, and tessdata_fast `eng.traineddata`).
- `pdfjs-dist` (PDF import), `bootstrap-icons` (UI icons), and `tarballjs` (project `.tar` I/O),
  copied into `dist/node_modules/`.
- The MkDocs `readthedocs` documentation theme assets (jQuery, Lunr.js, html5shiv, Font Awesome,
  Lato and Roboto Slab fonts), emitted into `dist/docs/`.

Each component's copyright and license are recorded in `THIRD_PARTY_NOTICES.md`; full Apache-2.0,
SIL OFL 1.1, and Leptonica license texts are in `licenses/`. The build copies every bundled
component's license into `dist/` next to the component.

## Build, packaging, and deploy

- Added `.github/workflows/pages.yml` to build with Node 20 + Python 3.12 and deploy to GitHub Pages
  from `master`.
- Added a `justfile` and a shared `assemble-dist.sh` so the local build and the Pages CI assemble an
  identical `dist/` from one script; `assemble-dist.sh` also writes `dist/SOURCE.txt` (the exact
  build commit) and ships the third-party license files and `THIRD_PARTY_NOTICES.md`.
- Hardened `build.sh` with `set -eu` so a failed build step aborts the build.
- Added `"license": "AGPL-3.0-or-later"` to `package.json`.

## Documentation and attribution

- Rewrote `README.md` for the unofficial static deployment and authored a `docs/` user guide
  (built with MkDocs).
- Added this `CHANGES.md`, `NOTICE.md`, and `THIRD_PARTY_NOTICES.md`.
- New source and test files added by this fork carry a `Copyright (C) 2026 belfner` line alongside
  the upstream WebPlotDigitizer copyright, under the same GNU AGPL v3 or later.
- For AGPL Section 5(a), this `CHANGES.md` together with the Git history at
  https://github.com/belfner/WebPlotDigitizer is the authoritative, dated record of the
  modifications this fork makes to upstream WebPlotDigitizer. Some of the changed upstream files also
  carry an inline dated "Modified ... by belfner" notice.
