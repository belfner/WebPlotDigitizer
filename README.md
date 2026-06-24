<!-- Modified 2026-06-24 by belfner for an unofficial backend-less GitHub Pages deployment. -->

# WebPlotDigitizer (unofficial static deployment)

This repository hosts an **unofficial** static deployment of the WebPlotDigitizer
frontend, based on the AGPL v3 release tagged `v5.3.0`. It runs entirely in the
browser as a GitHub Pages project site.

> **Disclaimer:** This is an unofficial fork maintained by belfner. It is not
> affiliated with, endorsed by, or supported by Automeris LLC or the original
> author, Ankit Rohatgi. WebPlotDigitizer is a computer-vision-assisted tool for
> extracting numerical data from images of charts and other data visualizations.

**Live site:** https://belfner.github.io/WebPlotDigitizer/

![WPD Screenshot](images/wpd5.png "WebPlotDigitizer UI")

## What this deployment does

Everything runs client-side in your browser:

- Manual digitizing and axis calibration (XY, bar, polar, etc.).
- Local color/mask automatic extraction.
- Image import and PDF import (via pdf.js).
- Local project save/load (JSON and `.tar`) and data export (CSV and more).

## Scope

The cloud features of WebPlotDigitizer (user accounts, cloud project
save/load, usage quota, analytics, and "AI Assist") are part of the proprietary
Automeris backend. That backend is owned by Automeris LLC and is not part of this
static deployment, so those features are served by the official site at
https://automeris.io instead.

## Source and license

The WebPlotDigitizer frontend is distributed under the
[GNU AGPL v3 or later](https://www.gnu.org/licenses/agpl-3.0.en.html). See
[`LICENSE`](LICENSE).

- Modified source (this fork): https://github.com/belfner/WebPlotDigitizer
- Original upstream: https://github.com/automeris-io/WebPlotDigitizer (tag `v5.3.0`)
- Fork changes: [`CHANGES.md`](CHANGES.md)
- Attribution and provenance: [`NOTICE.md`](NOTICE.md)

Automeris "AI Assist" and other related cloud-based systems are closed source and
owned by Automeris LLC (owned by Ankit Rohatgi).

## Issues

Report issues with this deployment to
https://github.com/belfner/WebPlotDigitizer/issues. For behavior that also
reproduces in the unmodified upstream WebPlotDigitizer, report it to the
[upstream project](https://github.com/automeris-io/WebPlotDigitizer/issues).

## Documentation

The original user manual is at https://automeris.io/docs/.

## Donate

Donations help keep WebPlotDigitizer free for thousands of scientists and
researchers across the world.

<a href='https://ko-fi.com/L4L010CWIY' target='_blank'><img height='36' style='border:0px;height:36px;' src='https://storage.ko-fi.com/cdn/kofi6.png?v=6' border='0' alt='Buy Me a Coffee at ko-fi.com' /></a>

## Original author

Primary author and maintainer of WebPlotDigitizer: Ankit Rohatgi
(plots@automeris.io).

## Build and deploy (maintainer)

GitHub Pages builds and deploys automatically from `master` via
[`.github/workflows/pages.yml`](.github/workflows/pages.yml). One-time setup:
**Settings -> Pages -> Source = GitHub Actions**.

Local build:

```
npm install     # install dependencies
npm run build   # build artifacts (combined.js, wpd.min.js, rendered HTML)
npm start       # host locally at http://localhost:8080
npm run format  # autoformat code
npm run test    # run tests
```

With Docker:

```
docker compose up --build               # install dependencies, build and host
docker compose run wpd npm run build    # rebuild
```
