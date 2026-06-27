#!/bin/sh

# Modified 2026-06-24 by belfner for an unofficial backend-less GitHub Pages deployment.
# Fail fast so a failed pybabel/render step aborts the build instead of shipping stale or
# incomplete HTML.
set -eu

echo "Combining Javascript Code..."
cat javascript/core/*.js > combined.js
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

echo "Update translation files..."
# messages.pot is a generated extraction template (no translations) and is gitignored.
# Everyday builds pass --ignore-pot-creation-date so the tracked .po catalogs change only when
# translatable strings change. A release build (WPD_RELEASE=1 or a --release argument; see
# `just release`) omits the flag so the catalog POT-Creation-Date timestamps refresh.
pot_date_flag="--ignore-pot-creation-date"
if [ "${WPD_RELEASE:-0}" = "1" ]; then
    pot_date_flag=""
fi
for arg in "$@"; do
    if [ "$arg" = "--release" ]; then
        pot_date_flag=""
    fi
done
if [ -z "$pot_date_flag" ]; then
    echo "Release build: refreshing translation catalog timestamps."
fi
pybabel -v extract -F templates/babel.config -o ./locale/messages.pot ./templates
pybabel update $pot_date_flag -l en_US -d ./locale/ -i ./locale/messages.pot
pybabel update $pot_date_flag -l fr_FR -d ./locale/ -i ./locale/messages.pot
pybabel update $pot_date_flag -l zh_CN -d ./locale/ -i ./locale/messages.pot
pybabel update $pot_date_flag -l de_DE -d ./locale/ -i ./locale/messages.pot
pybabel update $pot_date_flag -l ja -d ./locale/ -i ./locale/messages.pot
pybabel update $pot_date_flag -l ru -d ./locale/ -i ./locale/messages.pot

echo "Compiling translation catalogs..."
pybabel compile -d ./locale/

echo "Rendering HTML Pages..."
python3 renderHTML.py

