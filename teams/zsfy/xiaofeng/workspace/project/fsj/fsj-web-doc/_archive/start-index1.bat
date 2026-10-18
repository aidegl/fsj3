@echo off
chcp 65001 >nul
title fsj-web-doc index1 (HAP Live)

cd /d "%~dp0"

echo ============================================
echo   index1 - HAP Live Version
echo ============================================
echo [INFO] Starting local HTTP server on port 8317...
echo [INFO] Browser will open automatically.
echo [INFO] Close this window to stop the server.
echo.

start "" /b cmd /c "timeout /t 2 >nul && start http://localhost:8317/index1.html"

python -m http.server 8317