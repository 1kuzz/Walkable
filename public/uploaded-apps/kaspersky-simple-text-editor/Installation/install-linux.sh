#!/usr/bin/env bash
# ============================================================
#  Kaspersky Simple Text Editor — Linux Installer / Uninstaller
#
#  Installs the application and creates a .desktop entry so it
#  appears in your desktop environment's application menu.
#
#  System-wide install (requires sudo):
#      sudo ./install-linux.sh
#
#  Per-user install (no sudo required):
#      ./install-linux.sh
#
#  Other options:
#      ./install-linux.sh --silent           Silent install
#      ./install-linux.sh --uninstall        Uninstall
#      ./install-linux.sh --silent --uninstall  Silent uninstall
#      ./install-linux.sh --version          Show installed version
# ============================================================

set -e

# -- Configuration ----------------------------------------------------------
APP_NAME="Kaspersky Simple Text Editor"
APP_SLUG="kaspersky-simple-text-editor"
VERSION_FILE=".version"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Decide system vs user install based on effective UID
if [ "$(id -u)" -eq 0 ]; then
    INSTALL_DIR="/opt/$APP_SLUG"
    DESKTOP_DIR="/usr/share/applications"
    ICON_DIR="/usr/share/icons/hicolor/256x256/apps"
    BIN_LINK="/usr/local/bin/$APP_SLUG"
    SYSTEM_INSTALL=true
else
    INSTALL_DIR="$HOME/.local/share/$APP_SLUG"
    DESKTOP_DIR="$HOME/.local/share/applications"
    ICON_DIR="$HOME/.local/share/icons/hicolor/256x256/apps"
    BIN_LINK="$HOME/.local/bin/$APP_SLUG"
    SYSTEM_INSTALL=false
fi

# -- Parse arguments --------------------------------------------------------
SILENT=false
UNINSTALL=false
SHOW_VERSION=false

for arg in "$@"; do
    case "$arg" in
        --silent)    SILENT=true ;;
        --uninstall) UNINSTALL=true ;;
        --version)   SHOW_VERSION=true ;;
        --help|-h)
            echo "Usage: $0 [--silent] [--uninstall] [--version] [--help]"
            echo ""
            echo "  Run as root (sudo) for system-wide install to /opt,"
            echo "  or as a normal user for a per-user install to ~/.local/share."
            echo ""
            echo "  --silent       Install or uninstall without prompts"
            echo "  --uninstall    Remove the application"
            echo "  --version      Show installed version"
            echo "  --help, -h     Show this help message"
            exit 0
            ;;
    esac
done

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
    if [ -f "$INSTALL_DIR/$VERSION_FILE" ]; then
        cat "$INSTALL_DIR/$VERSION_FILE" | tr -d '[:space:]'
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
        local tmp_dir="/tmp/${APP_SLUG}_install_temp"
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
        error "$APP_NAME is not installed at $INSTALL_DIR"
    fi

    if [ "$SILENT" = false ]; then
        printf "Are you sure you want to uninstall %s? [y/N] " "$APP_NAME"
        read -r answer
        case "$answer" in
            [yY][eE][sS]|[yY]) ;;
            *) echo "Cancelled."; exit 0 ;;
        esac
    fi

    log "Removing application files ..."
    rm -rf "$INSTALL_DIR"

    log "Removing desktop entry ..."
    rm -f "$DESKTOP_DIR/$APP_SLUG.desktop"

    log "Removing icon ..."
    rm -f "$ICON_DIR/$APP_SLUG.png"
    rm -f "$ICON_DIR/$APP_SLUG.ico"

    log "Removing launcher link ..."
    rm -f "$BIN_LINK"

    # Refresh desktop database
    if command -v update-desktop-database >/dev/null 2>&1; then
        update-desktop-database "$DESKTOP_DIR" 2>/dev/null || true
    fi

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

if [ "$SYSTEM_INSTALL" = true ]; then
    log "Mode: system-wide (running as root)"
    log "Install directory: $INSTALL_DIR"
else
    log "Mode: per-user (running as $(whoami))"
    log "Install directory: $INSTALL_DIR"
fi

if [ "$SILENT" = false ]; then
    printf "Proceed with installation? [Y/n] "
    read -r answer
    case "$answer" in
        [nN][oO]|[nN]) echo "Cancelled."; exit 0 ;;
    esac
fi

# Create directories
log "Creating directories ..."
mkdir -p "$INSTALL_DIR"
mkdir -p "$DESKTOP_DIR"
mkdir -p "$ICON_DIR"
mkdir -p "$(dirname "$BIN_LINK")"

# Copy application files
log "Copying files ..."
for item in index.html README.md; do
    if [ -f "$SOURCE_DIR/$item" ]; then
        cp "$SOURCE_DIR/$item" "$INSTALL_DIR/"
    fi
done
for dir in app docs examples; do
    if [ -d "$SOURCE_DIR/$dir" ]; then
        rm -rf "$INSTALL_DIR/$dir"
        cp -R "$SOURCE_DIR/$dir" "$INSTALL_DIR/"
    fi
done

# Write version file
echo "$NEW_VERSION" > "$INSTALL_DIR/$VERSION_FILE"

# Make launch.sh executable
if [ -f "$INSTALL_DIR/app/launch.sh" ]; then
    chmod +x "$INSTALL_DIR/app/launch.sh"
fi

# Copy icon (prefer PNG for Linux desktop environments, fall back to ICO)
if [ -f "$SOURCE_DIR/app/assets/favicon.png" ]; then
    cp "$SOURCE_DIR/app/assets/favicon.png" "$ICON_DIR/$APP_SLUG.png"
elif [ -f "$SOURCE_DIR/app/assets/favicon.ico" ]; then
    cp "$SOURCE_DIR/app/assets/favicon.ico" "$ICON_DIR/$APP_SLUG.png"
fi

# Create launcher script
cat > "$INSTALL_DIR/launch.sh" << LAUNCHER
#!/usr/bin/env bash
# Launcher for $APP_NAME
DIR="$INSTALL_DIR"
HTML="\$DIR/index.html"
URL="file://\$HTML"

# Try Google Chrome --app mode
for bin in google-chrome google-chrome-stable; do
    if command -v "\$bin" >/dev/null 2>&1; then
        "\$bin" --app="\$URL" --window-size=1400,900 2>/dev/null &
        exit 0
    fi
done

# Try Microsoft Edge --app mode
for bin in microsoft-edge microsoft-edge-stable; do
    if command -v "\$bin" >/dev/null 2>&1; then
        "\$bin" --app="\$URL" --window-size=1400,900 2>/dev/null &
        exit 0
    fi
done

# Try Chromium --app mode
for bin in chromium chromium-browser; do
    if command -v "\$bin" >/dev/null 2>&1; then
        "\$bin" --app="\$URL" --window-size=1400,900 2>/dev/null &
        exit 0
    fi
done

# Fallback: xdg-open
if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "\$URL"
    exit 0
fi

echo "Error: No suitable browser found. Please open \$HTML manually." >&2
exit 1
LAUNCHER
chmod +x "$INSTALL_DIR/launch.sh"

# Create symlink in bin directory
ln -sf "$INSTALL_DIR/launch.sh" "$BIN_LINK"

# Create .desktop file
cat > "$DESKTOP_DIR/$APP_SLUG.desktop" << DESKTOP
[Desktop Entry]
Name=$APP_NAME
Comment=Professional text and email editor — runs entirely in the browser
Exec=$INSTALL_DIR/launch.sh
Icon=$ICON_DIR/$APP_SLUG.png
Terminal=false
Type=Application
Categories=Office;TextEditor;Development;
Keywords=newsletter;email;editor;html;
StartupNotify=true
DESKTOP
chmod +x "$DESKTOP_DIR/$APP_SLUG.desktop"

# Refresh desktop database
if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database "$DESKTOP_DIR" 2>/dev/null || true
fi

log "Done! $APP_NAME v$NEW_VERSION has been installed."
log ""
if [ "$SYSTEM_INSTALL" = true ]; then
    log "You can launch it from:"
    log "  • Application menu — search for \"$APP_NAME\""
    log "  • Terminal — $APP_SLUG"
else
    log "You can launch it from:"
    log "  • Application menu — search for \"$APP_NAME\""
    log "  • Terminal — $BIN_LINK"
    log ""
    log "Make sure ~/.local/bin is in your PATH for the terminal command to work."
fi
