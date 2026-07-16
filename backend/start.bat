@echo off
cd /d "%~dp0"
where node >nul 2>nul || (echo Install Node.js from https://nodejs.org first. ^& pause ^& exit /b 1)
if not exist .env if exist .env.example copy .env.example .env >nul
start "" http://localhost:4100
node server.js
