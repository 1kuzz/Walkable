#!/usr/bin/env bash
# ============================================================
#  Kaspersky Simple Text Editor — macOS Installer / Uninstaller
#
#  Creates a proper .app bundle so the editor appears in
#  Launchpad, Spotlight, and the Dock.
#
#  Default: per-user install to ~/Applications (no admin needed).
#  Use --allusers for system-wide install to /Applications.
#
#  Usage:
#      ./install-macos.sh                  Per-user interactive install
#      ./install-macos.sh --allusers       System-wide install (may need sudo)
#      ./install-macos.sh --silent         Silent install
#      ./install-macos.sh --uninstall      Interactive uninstall
#      ./install-macos.sh --silent --uninstall  Silent uninstall
#      ./install-macos.sh --version        Show installed version
# ============================================================

set -e

# -- Configuration ----------------------------------------------------------
APP_NAME="Kaspersky Simple Text Editor"
APP_ID="com.kaspersky.simple-text-editor"
BUNDLE_NAME="Kaspersky Simple Text Editor.app"
VERSION_FILE=".version"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# -- Parse arguments --------------------------------------------------------
SILENT=false
UNINSTALL=false
SHOW_VERSION=false
ALL_USERS=false

for arg in "$@"; do
    case "$arg" in
        --silent)    SILENT=true ;;
        --uninstall) UNINSTALL=true ;;
        --version)   SHOW_VERSION=true ;;
        --allusers)  ALL_USERS=true ;;
        --help|-h)
            echo "Usage: $0 [--silent] [--allusers] [--uninstall] [--version] [--help]"
            echo ""
            echo "  Default: per-user install to ~/Applications (no admin needed)."
            echo "  Use --allusers for system-wide install to /Applications."
            echo ""
            echo "  --silent       Install or uninstall without prompts"
            echo "  --allusers     Install system-wide to /Applications"
            echo "  --uninstall    Remove the application"
            echo "  --version      Show installed version"
            echo "  --help, -h     Show this help message"
            exit 0
            ;;
    esac
done

# -- Resolve paths based on install scope -----------------------------------
if [ "$ALL_USERS" = true ]; then
    INSTALL_DIR="/Applications/$BUNDLE_NAME"
else
    INSTALL_DIR="$HOME/Applications/$BUNDLE_NAME"
fi
DATA_DIR="$INSTALL_DIR/Contents/Resources/app"

# -- Helpers ----------------------------------------------------------------
log() {
    if [ "$SILENT" = false ]; then
        echo "  $1"
    fi
}

error() {
    echo "  Error: $1" >&2
    exit 1
}

get_installed_version() {
    if [ -f "$DATA_DIR/$VERSION_FILE" ]; then
        cat "$DATA_DIR/$VERSION_FILE" | tr -d '[:space:]'
    fi
}

get_source_version() {
    local vf="$SCRIPT_DIR/../$VERSION_FILE"
    if [ -f "$vf" ]; then
        cat "$vf" | tr -d '[:space:]'
    elif [ -f "$SCRIPT_DIR/$VERSION_FILE" ]; then
        cat "$SCRIPT_DIR/$VERSION_FILE" | tr -d '[:space:]'
    else
        echo "1.0.0"
    fi
}

find_source_dir() {
    # Look for index.html relative to this script (one level up = repo root)
    local repo_root="$SCRIPT_DIR/.."
    if [ -f "$repo_root/index.html" ]; then
        echo "$(cd "$repo_root" && pwd)"
        return
    fi

    # Also check script's own directory (flat layout)
    if [ -f "$SCRIPT_DIR/index.html" ]; then
        echo "$SCRIPT_DIR"
        return
    fi

    # Check for a ZIP archive next to the script or in parent
    local zip_file
    zip_file=$(find "$SCRIPT_DIR" -maxdepth 1 -name '*.zip' | head -1)
    if [ -z "$zip_file" ]; then
        zip_file=$(find "$SCRIPT_DIR/.." -maxdepth 1 -name '*.zip' | head -1)
    fi
    if [ -n "$zip_file" ]; then
        local tmp_dir="/tmp/${APP_ID}_install_temp"
        rm -rf "$tmp_dir"
        mkdir -p "$tmp_dir"
        unzip -q "$zip_file" -d "$tmp_dir"
        local html
        html=$(find "$tmp_dir" -name 'index.html' | head -1)
        if [ -n "$html" ]; then
            echo "$(dirname "$html")"
            return
        fi
    fi

    error "No application files or ZIP archive found near $SCRIPT_DIR"
}

# -- Show version -----------------------------------------------------------
if [ "$SHOW_VERSION" = true ]; then
    ver=$(get_installed_version)
    if [ -n "$ver" ]; then
        echo "$APP_NAME version $ver"
    else
        echo "$APP_NAME is not installed."
    fi
    exit 0
fi

# -- Uninstall --------------------------------------------------------------
if [ "$UNINSTALL" = true ]; then
    if [ ! -d "$INSTALL_DIR" ]; then
        error "$APP_NAME is not installed."
    fi

    if [ "$SILENT" = false ]; then
        printf "Are you sure you want to uninstall %s? [y/N] " "$APP_NAME"
        read -r answer
        case "$answer" in
            [yY][eE][sS]|[yY]) ;;
            *) echo "Cancelled."; exit 0 ;;
        esac
    fi

    log "Removing $INSTALL_DIR ..."
    rm -rf "$INSTALL_DIR"

    log "$APP_NAME has been uninstalled."
    exit 0
fi

# -- Install ----------------------------------------------------------------
SOURCE_DIR="$(find_source_dir)"
NEW_VERSION="$(get_source_version)"
CUR_VERSION="$(get_installed_version)"

if [ -n "$CUR_VERSION" ]; then
    log "Updating $APP_NAME from v$CUR_VERSION to v$NEW_VERSION ..."
else
    log "Installing $APP_NAME v$NEW_VERSION ..."
fi

if [ "$ALL_USERS" = true ]; then
    log "Mode: system-wide (/Applications)"
else
    log "Mode: per-user (~/Applications — no admin required)"
fi

if [ "$SILENT" = false ]; then
    printf "Install to %s? [Y/n] " "$INSTALL_DIR"
    read -r answer
    case "$answer" in
        [nN][oO]|[nN]) echo "Cancelled."; exit 0 ;;
    esac
fi

# Create the .app bundle structure
log "Creating application bundle ..."
mkdir -p "$DATA_DIR"
mkdir -p "$INSTALL_DIR/Contents/MacOS"

# Copy application files
log "Copying files ..."
for item in index.html README.md; do
    if [ -f "$SOURCE_DIR/$item" ]; then
        cp "$SOURCE_DIR/$item" "$DATA_DIR/"
    fi
done
for dir in app docs examples; do
    if [ -d "$SOURCE_DIR/$dir" ]; then
        rm -rf "$DATA_DIR/$dir"
        cp -R "$SOURCE_DIR/$dir" "$DATA_DIR/"
    fi
done

# Write version file
echo "$NEW_VERSION" > "$DATA_DIR/$VERSION_FILE"

# Create the launcher script inside the .app bundle
cat > "$INSTALL_DIR/Contents/MacOS/launch" << 'LAUNCHER'
#!/usr/bin/env bash
# Launcher for Kaspersky Simple Text Editor .app bundle
DIR="$(cd "$(dirname "$0")/../Resources/app" && pwd)"
HTML="$DIR/index.html"
URL="file://$HTML"

# Try Chrome --app mode
if [ -d "/Applications/Google Chrome.app" ]; then
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
        --app="$URL" --window-size=1400,900 2>/dev/null &
    exit 0
fi

# Try Edge --app mode
if [ -d "/Applications/Microsoft Edge.app" ]; then
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" \
        --app="$URL" --window-size=1400,900 2>/dev/null &
    exit 0
fi

# Try Chromium --app mode
if [ -d "/Applications/Chromium.app" ]; then
    "/Applications/Chromium.app/Contents/MacOS/Chromium" \
        --app="$URL" --window-size=1400,900 2>/dev/null &
    exit 0
fi

# Fallback: default browser
open "$URL"
LAUNCHER
chmod +x "$INSTALL_DIR/Contents/MacOS/launch"

# Create Info.plist
cat > "$INSTALL_DIR/Contents/Info.plist" << PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleName</key>
    <string>${APP_NAME}</string>
    <key>CFBundleDisplayName</key>
    <string>${APP_NAME}</string>
    <key>CFBundleIdentifier</key>
    <string>${APP_ID}</string>
    <key>CFBundleVersion</key>
    <string>${NEW_VERSION}</string>
    <key>CFBundleShortVersionString</key>
    <string>${NEW_VERSION}</string>
    <key>CFBundleExecutable</key>
    <string>launch</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleIconFile</key>
    <string>favicon</string>
    <key>NSHighResolutionCapable</key>
    <true/>
</dict>
</plist>
PLIST

# Copy icon — prefer generating a proper .icns for macOS display
ICON_DONE=false

# Try to build a real .icns from the PNG using macOS-native tools
if [ -f "$SOURCE_DIR/app/assets/favicon.png" ] && command -v sips >/dev/null 2>&1 && command -v iconutil >/dev/null 2>&1; then
    ICONSET_DIR="/tmp/${APP_ID}_icon.iconset"
    rm -rf "$ICONSET_DIR"
    mkdir -p "$ICONSET_DIR"
    for sz in 16 32 64 128 256 512; do
        sips -z "$sz" "$sz" "$SOURCE_DIR/app/assets/favicon.png" --out "$ICONSET_DIR/icon_${sz}x${sz}.png" >/dev/null 2>&1
    done
    # Retina variants (name uses the base size with @2x suffix)
    for sz in 16 32 128 256; do
        dbl=$((sz * 2))
        sips -z "$dbl" "$dbl" "$SOURCE_DIR/app/assets/favicon.png" --out "$ICONSET_DIR/icon_${sz}x${sz}@2x.png" >/dev/null 2>&1
    done
    if iconutil -c icns -o "$INSTALL_DIR/Contents/Resources/favicon.icns" "$ICONSET_DIR" 2>/dev/null; then
        ICON_DONE=true
    fi
    rm -rf "$ICONSET_DIR"
fi

# Fallback: copy the PNG directly (macOS Finder can display it)
if [ "$ICON_DONE" = false ] && [ -f "$SOURCE_DIR/app/assets/favicon.png" ]; then
    cp "$SOURCE_DIR/app/assets/favicon.png" "$INSTALL_DIR/Contents/Resources/favicon.png"
fi

# Also copy the .ico as a further fallback
if [ -f "$SOURCE_DIR/app/assets/favicon.ico" ]; then
    cp "$SOURCE_DIR/app/assets/favicon.ico" "$INSTALL_DIR/Contents/Resources/favicon.ico"
fi

log "Done! $APP_NAME v$NEW_VERSION has been installed."
log ""
log "You can launch it from:"
log "  • Launchpad / Spotlight — search for \"$APP_NAME\""
log "  • Terminal — open \"$INSTALL_DIR\""
