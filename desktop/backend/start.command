#!/bin/bash
cd "$(dirname "$0")"; clear
echo "════════════════════════════════════"
echo "   NEXUS — starting on your laptop"
echo "════════════════════════════════════"
if ! command -v node >/dev/null 2>&1; then
  echo ""; echo "  Node.js is required (one-time)."
  echo "  Install the LTS version from https://nodejs.org"
  echo "  then double-click this file again."
  read -p "  Press Enter to close."; exit 1
fi
[ -f .env ] || { [ -f .env.example ] && cp .env.example .env && echo "  Created .env (safe mock mode)."; }
echo "  Opening http://localhost:4100 in your browser..."
( sleep 2; open http://localhost:4100 ) &
node server.js
