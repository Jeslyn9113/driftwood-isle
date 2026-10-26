@echo off
cd /d "%~dp0"
start "Game Server" cmd /k node server.js
timeout /t 3 >nul
start "Tunnel" cmd /k cloudflared tunnel --url http://localhost:8000
