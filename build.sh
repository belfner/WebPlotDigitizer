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
# --ignore-pot-creation-date keeps the tracked .po catalogs from churning on the POT timestamp
# alone, so they only change when actual translatable strings change.
pybabel -v extract -F templates/babel.config -o ./locale/messages.pot ./templates
pybabel update --ignore-pot-creation-date -l en_US -d ./locale/ -i ./locale/messages.pot
pybabel update --ignore-pot-creation-date -l fr_FR -d ./locale/ -i ./locale/messages.pot
pybabel update --ignore-pot-creation-date -l zh_CN -d ./locale/ -i ./locale/messages.pot
pybabel update --ignore-pot-creation-date -l de_DE -d ./locale/ -i ./locale/messages.pot
pybabel update --ignore-pot-creation-date -l ja -d ./locale/ -i ./locale/messages.pot
pybabel update --ignore-pot-creation-date -l ru -d ./locale/ -i ./locale/messages.pot

echo "Compiling translation catalogs..."
pybabel compile -d ./locale/

echo "Rendering HTML Pages..."
python3 renderHTML.py

