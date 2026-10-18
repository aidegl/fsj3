@echo off
chcp 65001 >nul
title 孚世界 Agent 知识图谱 - 本地服务
cd /d "%~dp0"

echo ============================================
echo   孚世界 · Agent 知识图谱
echo   本地服务启动中...
echo   浏览器访问: http://localhost:8765
echo   关闭窗口或按 Ctrl+C 停止
echo ============================================
echo.

start "" "http://localhost:8765"
python -m http.server 8765
