#!/bin/sh

# Assemble the deployable static site into dist/. Single source of truth for the post-build
# assembly + docs step, invoked by both the GitHub Pages workflow (.github/workflows/pages.yml)
# and the justfile `dist` recipe. Run this after `npm run build` has produced wpd.min.js and the
# rendered index*.html pages.
#
# Knobs (both optional):
#   MKDOCS           mkdocs executable to run, defaults to `mkdocs` on PATH. The justfile passes
#                    the venv copy ({{venv_bin}}/mkdocs) so a missing venv build fails loudly
#                    instead of silently falling back to a system mkdocs.
#   WPD_SOURCE_LINE  full second line of dist/SOURCE.txt (the provenance line). CI sets this to the
#                    clickable commit URL; locally it is derived from the git remote and HEAD.
set -eu

dist="dist"
mkdocs_bin="${MKDOCS:-mkdocs}"

# Guard: the assembly assumes `npm run build` already ran.
if [ ! -f wpd.min.js ]; then
    echo "assemble-dist: wpd.min.js not found; run 'npm run build' first." >&2
    exit 1
fi

echo "Assembling ${dist}/ ..."
rm -rf "${dist}" && mkdir -p "${dist}"
cp index*.html "${dist}/"
cp wpd.min.js start.png favicon.ico LICENSE README.md CHANGES.md NOTICE.md THIRD_PARTY_NOTICES.md "${dist}/"
cp -R styles images "${dist}/"
cp -R vendor "${dist}/"
# Aggregated full license texts referenced by THIRD_PARTY_NOTICES.md (Apache-2.0, OFL-1.1, Leptonica).
cp -R licenses "${dist}/"
mkdir -p "${dist}/javascript/workers"
cp javascript/workers/autoCalibrationOcrWorker.js "${dist}/javascript/workers/"
mkdir -p "${dist}/node_modules/bootstrap-icons/font"
cp node_modules/bootstrap-icons/font/bootstrap-icons.min.css "${dist}/node_modules/bootstrap-icons/font/"
cp -R node_modules/bootstrap-icons/font/fonts "${dist}/node_modules/bootstrap-icons/font/"
# Ship each bundled dependency's license alongside its code (MIT/Apache require the notice to travel).
cp node_modules/bootstrap-icons/LICENSE "${dist}/node_modules/bootstrap-icons/"
mkdir -p "${dist}/node_modules/pdfjs-dist/build"
cp node_modules/pdfjs-dist/build/pdf.min.mjs "${dist}/node_modules/pdfjs-dist/build/"
cp node_modules/pdfjs-dist/build/pdf.worker.min.mjs "${dist}/node_modules/pdfjs-dist/build/"
cp node_modules/pdfjs-dist/LICENSE "${dist}/node_modules/pdfjs-dist/"
mkdir -p "${dist}/node_modules/tarballjs"
cp node_modules/tarballjs/tarball.js "${dist}/node_modules/tarballjs/"
cp node_modules/tarballjs/LICENSE "${dist}/node_modules/tarballjs/"

# Provenance line: CI passes the clickable commit URL via WPD_SOURCE_LINE; locally derive it from
# the git remote and HEAD (matching the previous justfile behavior).
if [ -n "${WPD_SOURCE_LINE:-}" ]; then
    source_line="${WPD_SOURCE_LINE}"
else
    repo_url="$(git config --get remote.origin.url || echo unknown)"
    commit="$(git rev-parse HEAD || echo unknown)"
    source_line="${repo_url} (commit ${commit})"
fi
cat > "${dist}/SOURCE.txt" <<EOF
This hosted copy was built from:
${source_line}

Original upstream (v5.3.0, commit 3a3ecb11606945d0701c8a488777e6861be70056):
https://github.com/automeris-io/WebPlotDigitizer/commit/3a3ecb11606945d0701c8a488777e6861be70056

License:
GNU AGPL v3 or later. See LICENSE.
EOF
touch "${dist}/.nojekyll"

echo "Building docs with ${mkdocs_bin} ..."
"${mkdocs_bin}" build --strict -d "${dist}/docs"

echo "Assembled ${dist}/."
