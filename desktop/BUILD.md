# NEXUS Desktop — build your single-click installable app

This is the **real desktop app** (not the demo): its own window, app icon, and a
bundled Node runtime, so once built it needs **nothing installed** to run.

## Why one build step
A signed Windows `.exe` / macOS `.dmg` must be built on a real machine — it can't be
produced in a sandbox. So you run **one command** on your laptop and get the installer.

## Build it (one time, ~5 min)
Prerequisite for *building*: Node.js LTS (https://nodejs.org). (The built app itself
needs nothing — Node is bundled inside it.)

```bash
cd desktop
npm install            # downloads Electron + builder
npm run dist           # builds the installer for YOUR OS
```
Output lands in `desktop/dist/`:
- **Windows** → `NEXUS Setup 3.0.0.exe` — run it → installs + **creates a desktop icon** automatically.
- **macOS** → `NEXUS-3.0.0.dmg` — open, drag NEXUS to Applications.
- **Linux** → `NEXUS-3.0.0.AppImage` — `chmod +x` and double-click.

Build for a specific OS: `npm run dist:win` / `dist:mac` / `dist:linux`
(cross-building win/mac from Linux may need extra tooling; build on the target OS for clean results.)

## Run without building (developer mode)
```bash
cd desktop && npm install && npm start
```
Opens the cockpit in the app window immediately.

## What it does
On launch it starts the NEXUS engine on a private local port in **safe mock mode**,
waits for health, then opens the **founder cockpit** in a native window. Closing the
app stops the engine cleanly. Your data stays in your OS user-data folder.

## Going live (real money)
Set env vars before launch (or in the bundled `backend/.env`): `NEXUS_ENV=production`
plus the production keys from the cockpit's Go-Live panel. Until then it runs mock-safe.
