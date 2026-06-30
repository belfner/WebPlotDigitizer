# WebPlotDigitizer build / deploy automation.
# Mirrors the GitHub Pages workflow (.github/workflows/pages.yml) for local use.

# Directory holding the Python build env (Jinja2 / Babel / mkdocs).
venv := ".venv"
# Output directory for the assembled, deployable static site.
dist := "dist"
# Chrome binary used by the headless karma/QUnit run and the browse-chrome recipe.
chrome := "/usr/bin/google-chrome"
# Firefox binary used by the browse-firefox recipe.
firefox := "/usr/bin/firefox"

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

# Like `build`, but re-extract strings and update the tracked .po catalogs. Use when cutting a
# release and committing the catalogs; everyday `just build` leaves the .po files untouched.
release:
    PATH="{{venv_bin}}:$PATH" WPD_RELEASE=1 npm run build

# Assemble the deployable dist/ directory and build the docs via the shared assemble-dist.sh
# script (the same script the Pages workflow runs). MKDOCS points at the venv copy so a missing
# build env fails loudly here instead of falling back to a system mkdocs.
dist: build
    MKDOCS="{{venv_bin}}/mkdocs" ./assemble-dist.sh

# Serve the assembled dist/ over HTTP (default port 8000, override: just serve 9000).
serve port='8000':
    python3 -m http.server {{port}} --directory {{dist}}

# Throwaway profile (fresh per launch), a 1-byte disk cache, and auto-opened DevTools.
# Tick Network > "Disable cache" once for a full HTTP-cache bypass. Assumes a server is
# already running (e.g. `just serve`). Override port: just browse-chrome 9000.
# Launch Chrome maximized at the local server with caching disabled for dev testing.
browse-chrome port='8000':
    {{chrome}} \
      --user-data-dir="$(mktemp -d)" \
      --disk-cache-size=1 \
      --auto-open-devtools-for-tabs \
      --start-maximized \
      "http://localhost:{{port}}/"

# Firefox has no flag to disable cache or maximize the window, so this builds a throwaway
# profile and seeds it: user.js disables the HTTP cache globally (and pre-ticks the DevTools
# "Disable HTTP Cache" box), xulstore.json opens the window maximized. Assumes a server is
# already running (e.g. `just serve`). Override port: just browse-firefox 9000.
# Launch Firefox maximized at the local server with caching disabled for dev testing.
browse-firefox port='8000':
    #!/usr/bin/env bash
    set -euo pipefail
    profile="$(mktemp -d)"
    cat > "$profile/user.js" <<'EOF'
    // Disable the HTTP cache globally so rebuilt JS/HTML is always refetched.
    user_pref("browser.cache.disk.enable", false);
    user_pref("browser.cache.memory.enable", false);
    // Pre-tick Network > "Disable HTTP Cache (when toolbox is open)".
    user_pref("devtools.cache.disabled", true);
    // Quiet first-run noise in the throwaway profile.
    user_pref("browser.shell.checkDefaultBrowser", false);
    user_pref("datareporting.policy.dataSubmissionEnabled", false);
    user_pref("browser.aboutwelcome.enabled", false);
    EOF
    # Open maximized: Firefox restores window state from xulstore.json on launch.
    echo '{"chrome://browser/content/browser.xhtml":{"main-window":{"sizemode":"maximized"}}}' > "$profile/xulstore.json"
    {{firefox}} --profile "$profile" --devtools "http://localhost:{{port}}/"

# Remove the dist/ directory and generated JS build artifacts.
clean:
    rm -rf {{dist}} combined.js wpd.min.js

# Run the karma/QUnit suite once, headless, against Chrome.
test:
    CHROME_BIN={{chrome}} npx karma start --single-run

# Full deploy chain: clean then re-assemble dist/, leaving it ready to serve.
deploy: clean dist
    @echo "dist/ ready -- run 'just serve' to preview."
