# Changes in this fork

This fork adapts the WebPlotDigitizer frontend (AGPL v3, upstream tag `v5.3.0`)
for an unofficial backend-less static deployment on GitHub Pages. All changes are
by belfner, dated 2026-06-24.

## Disabled features

This deployment is permanently backend-less: `wpd.staticPagesDeployment` is
hardcoded to `true` and compiled into `wpd.min.js`, so the following Automeris
backend features are disabled for every visitor, with no runtime toggle:

- AI Assist (autogenerate calibration and datasets). The toolbar button is
  emitted only in cloud mode, and `wpd.ai.assist()` / `wpd.ai.runQuery()`
  short-circuit before any `/api/vision/*` call.
- User accounts and login (the on-load `/api/user` check and `/login` redirect).
- Cloud project save/load and the `?projectId=...` cloud fetch.
- Usage quota display.
- Analytics reporting.
- Server-side preferences (the language defaults to English).

## Functional changes

- Added a static-deployment capability gate in `javascript/services/cloud.js`
  (`wpd.staticPagesDeployment` / `wpd.hasCloudBackend()`). Every backend network
  call is gated on `wpd.hasCloudBackend()`:
  - `cloud.js`: the on-load login check no longer issues `/api/user` or redirects
    to `/login`; `getQuotaLimits()`, `cloudNewImage()`, and `CloudProject`
    network methods short-circuit.
  - `log.js`: the per-page-load `/api/analytics` request is suppressed.
  - `prefs.js`: `/api/prefs` reads/writes are skipped; the language defaults to
    English.
  - `ai.js`: `assist()` and `runQuery()` return early instead of calling
    `/api/vision/*`.
  - `main.js`: a `?projectId=...` argument falls back to the default image
    instead of fetching a cloud project.
- Repointed visible documentation links in `templates/_sidebars.html` from the
  root-relative `/docs/...` to `https://automeris.io/docs/...`.
- Repointed the "Report Issues" menu item to this fork and added a "Source Code"
  menu item (`templates/_menubar.html`).
- Added an unofficial / non-affiliation / source notice to the About popup
  (`templates/_popups.html`).

## Build and packaging

- Added `.github/workflows/pages.yml` to build with Node 20 + Python 3.12 and
  deploy to GitHub Pages from `master`.
- Hardened `build.sh` with `set -eu` so a failed build step aborts the build.

## Documentation

- Rewrote `README.md` for the unofficial static deployment.
- Added this `CHANGES.md` and `NOTICE.md`.
- Added per-file dated change notices to every modified source and template file.
