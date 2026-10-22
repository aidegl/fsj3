@echo off
rem 语音转文字悬浮窗一键启动（首次运行自动装依赖）
cd /d %~dp0

rem 优先用 PATH 里的 python；若指向 Store 占位程序或不存在（如刚装 Python 未重登），回退到完整路径
set "PYEXE=python"
python -c "import sys" >nul 2>nul || set "PYEXE=%LOCALAPPDATA%\Programs\Python\Python311\python.exe"

"%PYEXE%" -c "import faster_whisper, sounddevice, keyboard, pyperclip" 2>nul
if errorlevel 1 (
    echo [首次运行] 正在安装依赖，请稍候...
    "%PYEXE%" -m pip install -r requirements.txt
    if errorlevel 1 (
        echo pip 安装失败，尝试清华镜像...
        "%PYEXE%" -m pip install -i https://pypi.tuna.tsinghua.edu.cn/simple -r requirements.txt
    )
)

rem 国内加速：首次运行 whisper 模型自动下载走镜像
set HF_ENDPOINT=https://hf-mirror.com
set HF_HUB_DISABLE_XET=1

set "PYWEXE=%PYEXE:\python.exe=\pythonw.exe%"
start "" "%PYWEXE%" app.py
