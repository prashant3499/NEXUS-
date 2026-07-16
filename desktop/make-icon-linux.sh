#!/bin/bash
# Creates a NEXUS desktop icon on Linux that launches the cockpit.
APP="$(cd "$(dirname "$0")" && pwd)"
DESK="${XDG_DESKTOP_DIR:-$HOME/Desktop}"; mkdir -p "$DESK"
cat > "$DESK/NEXUS.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=NEXUS
Comment=Founder operating console
Exec=bash "$APP/backend/start.sh"
Icon=$APP/build/icon.png
Terminal=false
Categories=Office;
DESKTOP
chmod +x "$DESK/NEXUS.desktop"
echo "Desktop icon created: $DESK/NEXUS.desktop"
