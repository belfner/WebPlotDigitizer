# WebPlotDigitizer build / deploy automation.
# Mirrors the GitHub Pages workflow (.github/workflows/pages.yml) for local use.

# Directory holding the Python build env (Jinja2 / Babel / mkdocs).
venv := ".venv"
# Output directory for the assembled, deployable static site.
dist := "dist"
# Chrome binary used by the headless karma/QUnit run.
chrome := "/usr/bin/google-chrome"

# Absolute path so recipes can prepend the venv to PATH for npm/build.sh.
venv_bin := justfile_directory() / venv / "bin"

# Show the list of available recipes.
default:
    @just --list

# Install JavaScript deps (npm ci) and create the Python build env.
install:
    npm ci
    uv venv {{venv}}
    uv pip install --python {{venv}}/bin/python Jinja2 Babel mkdocs

# Run the full JS build (prebuild combines JS, runs pybabel + renderHTML, then minifies).
build:
    PATH="{{venv_bin}}:$PATH" npm run build

# Assemble the deployable dist/ directory and build the docs, exactly as pages.yml does.
dist: build
    #!/usr/bin/env bash
    set -euo pipefail
    rm -rf {{dist}} && mkdir -p {{dist}}
    cp index*.html {{dist}}/
    cp wpd.min.js start.png favicon.ico LICENSE README.md CHANGES.md NOTICE.md {{dist}}/
    cp -R styles images {{dist}}/
    mkdir -p {{dist}}/node_modules/bootstrap-icons/font
    cp node_modules/bootstrap-icons/font/bootstrap-icons.min.css {{dist}}/node_modules/bootstrap-icons/font/
    cp -R node_modules/bootstrap-icons/font/fonts {{dist}}/node_modules/bootstrap-icons/font/
    mkdir -p {{dist}}/node_modules/pdfjs-dist/build
    cp node_modules/pdfjs-dist/build/pdf.min.mjs {{dist}}/node_modules/pdfjs-dist/build/
    cp node_modules/pdfjs-dist/build/pdf.worker.min.mjs {{dist}}/node_modules/pdfjs-dist/build/
    mkdir -p {{dist}}/node_modules/tarballjs
    cp node_modules/tarballjs/tarball.js {{dist}}/node_modules/tarballjs/
    repo_url="$(git config --get remote.origin.url || echo unknown)"
    commit="$(git rev-parse HEAD || echo unknown)"
    cat > {{dist}}/SOURCE.txt <<EOF
    This hosted copy was built from:
    ${repo_url} (commit ${commit})

    Original upstream:
    https://github.com/automeris-io/WebPlotDigitizer/tree/v5.3.0

    License:
    GNU AGPL v3 or later. See LICENSE.
    EOF
    touch {{dist}}/.nojekyll
    {{venv_bin}}/mkdocs build --strict -d {{dist}}/docs

# Serve the assembled dist/ over HTTP (default port 8000, override: just serve 9000).
serve port='8000':
    python3 -m http.server {{port}} --directory {{dist}}

# Remove the dist/ directory and generated JS build artifacts.
clean:
    rm -rf {{dist}} combined.js wpd.min.js

# Run the karma/QUnit suite once, headless, against Chrome.
test:
    CHROME_BIN={{chrome}} npx karma start --single-run

# Full deploy chain: clean then re-assemble dist/, leaving it ready to serve.
deploy: clean dist
    @echo "dist/ ready -- run 'just serve' to preview."
