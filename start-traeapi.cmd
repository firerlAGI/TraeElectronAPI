@echo off
setlocal
cd /d "%~dp0"
node scripts\quickstart.js
if errorlevel 1 (
  echo.
  echo TraeAPI quickstart failed.
  pause
  exit /b %errorlevel%
)
