#!/usr/bin/env bash
# ============================================================
#  Kaspersky Simple Text Editor — macOS Setup
#  Double-click this file in Finder to install.
#  No Terminal knowledge needed — Finder runs .command files
#  automatically.
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INSTALLER="$SCRIPT_DIR/install-macos.sh"

if [ ! -f "$INSTALLER" ]; then
    echo "ERROR: Cannot find install-macos.sh"
    echo "Expected location: $INSTALLER"
    echo ""
    echo "Please make sure Setup.command and install-macos.sh are in the same folder."
    echo ""
    echo "Press Enter to close..."
    read -r
    exit 1
fi

chmod +x "$INSTALLER"
"$INSTALLER"

echo ""
echo "Press Enter to close..."
read -r
