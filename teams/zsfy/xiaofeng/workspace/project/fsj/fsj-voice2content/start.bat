@echo off
rem 语音转文字悬浮窗一键启动（首次运行自动装依赖）
cd /d %~dp0

python -c "import faster_whisper, sounddevice, keyboard, pyperclip" 2>nul
if errorlevel 1 (
    echo [首次运行] 正在安装依赖，请稍候...
    pip install -r requirements.txt
    if errorlevel 1 (
        echo pip 安装失败，尝试清华镜像...
        pip install -i https://pypi.tuna.tsinghua.edu.cn/simple -r requirements.txt
    )
)

rem 国内加速：首次运行 whisper 模型自动下载走镜像
set HF_ENDPOINT=https://hf-mirror.com

start "" pythonw app.py
