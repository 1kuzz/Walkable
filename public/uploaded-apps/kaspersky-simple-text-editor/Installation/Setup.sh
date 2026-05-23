#!/usr/bin/env bash
# ============================================================
#  Kaspersky Simple Text Editor — Linux Setup
#  Double-click this file in your file manager to install,
#  or run from a terminal:  ./Setup.sh
# ============================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INSTALLER="$SCRIPT_DIR/install-linux.sh"

if [ ! -f "$INSTALLER" ]; then
    echo "ERROR: Cannot find install-linux.sh"
    echo "Expected location: $INSTALLER"
    echo ""
    echo "Please make sure Setup.sh and install-linux.sh are in the same folder."
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
