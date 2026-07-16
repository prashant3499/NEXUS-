#!/bin/bash
cd "$(dirname "$0")"
command -v node >/dev/null 2>&1 || { echo "Install Node.js (https://nodejs.org) first."; exit 1; }
[ -f .env ] || { [ -f .env.example ] && cp .env.example .env; }
( sleep 2; (xdg-open http://localhost:4100 2>/dev/null || open http://localhost:4100 2>/dev/null) ) &
node server.js
