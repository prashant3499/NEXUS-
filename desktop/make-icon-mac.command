#!/bin/bash
# Places a double-clickable NEXUS launcher on the macOS Desktop.
APP="$(cd "$(dirname "$0")" && pwd)"
cp "$APP/backend/start.command" "$HOME/Desktop/NEXUS.command"
chmod +x "$HOME/Desktop/NEXUS.command"
echo "NEXUS.command placed on your Desktop. (For a custom icon, build the full app — see BUILD.md.)"
