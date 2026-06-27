#!/bin/sh

# Modified 2026-06-24 by belfner for an unofficial backend-less GitHub Pages deployment.
# Fail fast so a failed pybabel/render step aborts the build instead of shipping stale or
# incomplete HTML.
set -eu

echo "Combining Javascript Code..."
cat javascript/core/*.js > combined.js
cat javascript/core/auto_calibration/*.js >> combined.js
cat javascript/core/curve_detection/*.js >> combined.js
cat javascript/core/point_detection/templateMatcherAlgo.js >> combined.js
cat javascript/core/point_detection/templateMatcherWorker.js >> combined.js
cat javascript/core/axes/*.js >> combined.js
cat javascript/widgets/*.js >> combined.js
cat javascript/tools/base/*.js >> combined.js
cat javascript/tools/*.js >> combined.js
cat javascript/controllers/*.js >> combined.js
cat javascript/services/*.js >> combined.js
cat javascript/*.js >> combined.js

# Re-extract translatable strings and update the tracked .po catalogs only on a release build
# (WPD_RELEASE=1 or a --release argument; see `just release`). Everyday builds leave the .po
# files untouched and compile them as-is, so editing templates never churns the catalogs.
# messages.pot is a generated extraction template (no translations) and is gitignored.
is_release=0
if [ "${WPD_RELEASE:-0}" = "1" ]; then
    is_release=1
fi
for arg in "$@"; do
    if [ "$arg" = "--release" ]; then
        is_release=1
    fi
done
if [ "$is_release" = "1" ]; then
    echo "Release build: re-extracting strings and updating translation catalogs..."
    pybabel -v extract -F templates/babel.config -o ./locale/messages.pot ./templates
    pybabel update -l en_US -d ./locale/ -i ./locale/messages.pot
    pybabel update -l fr_FR -d ./locale/ -i ./locale/messages.pot
    pybabel update -l zh_CN -d ./locale/ -i ./locale/messages.pot
    pybabel update -l de_DE -d ./locale/ -i ./locale/messages.pot
    pybabel update -l ja -d ./locale/ -i ./locale/messages.pot
    pybabel update -l ru -d ./locale/ -i ./locale/messages.pot
fi

echo "Compiling translation catalogs..."
pybabel compile -d ./locale/

echo "Rendering HTML Pages..."
python3 renderHTML.py

