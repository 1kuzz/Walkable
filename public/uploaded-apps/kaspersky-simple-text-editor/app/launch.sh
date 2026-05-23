#!/usr/bin/env bash
# ============================================================
#  Kaspersky Simple Text Editor — Standalone Window Launcher
#  Opens the application in a frameless browser window
#  (no address bar, no tabs — just the app).
#  Tries Google Chrome / Chromium first, then falls back to
#  the default browser.
#  Works on both macOS and Linux.
# ============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HTML_FILE="$SCRIPT_DIR/../index.html"

# Resolve to absolute path
HTML_FILE="$(cd "$(dirname "$HTML_FILE")" && pwd)/$(basename "$HTML_FILE")"

if [ ! -f "$HTML_FILE" ]; then
    echo "Error: Cannot find index.html at $HTML_FILE" >&2
    exit 1
fi

FILE_URL="file://$HTML_FILE"

# --- Detect OS ---
OS="$(uname -s)"

launch_app_mode() {
    # Try to launch in --app mode with the given browser binary
    "$1" --app="$FILE_URL" --window-size=1400,900 --allow-file-access-from-files 2>/dev/null &
    exit 0
}

if [ "$OS" = "Darwin" ]; then
    # ---- macOS ----

    # Google Chrome
    if [ -d "/Applications/Google Chrome.app" ]; then
        launch_app_mode "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
    fi

    # Microsoft Edge
    if [ -d "/Applications/Microsoft Edge.app" ]; then
        launch_app_mode "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
    fi

    # Chromium
    if [ -d "/Applications/Chromium.app" ]; then
        launch_app_mode "/Applications/Chromium.app/Contents/MacOS/Chromium"
    fi

    # Fallback: open in default browser
    open "$FILE_URL"
    exit 0

else
    # ---- Linux ----

    # Google Chrome
    for bin in google-chrome google-chrome-stable; do
        if command -v "$bin" >/dev/null 2>&1; then
            launch_app_mode "$bin"
        fi
    done

    # Microsoft Edge
    if command -v microsoft-edge >/dev/null 2>&1; then
        launch_app_mode "microsoft-edge"
    fi
    if command -v microsoft-edge-stable >/dev/null 2>&1; then
        launch_app_mode "microsoft-edge-stable"
    fi

    # Chromium
    for bin in chromium chromium-browser; do
        if command -v "$bin" >/dev/null 2>&1; then
            launch_app_mode "$bin"
        fi
    done

    # Fallback: xdg-open
    if command -v xdg-open >/dev/null 2>&1; then
        xdg-open "$FILE_URL"
        exit 0
    fi

    echo "Error: No suitable browser found. Please open $HTML_FILE manually." >&2
    exit 1
fi
