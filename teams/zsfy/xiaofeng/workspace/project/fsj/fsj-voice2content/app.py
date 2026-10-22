# -*- coding: utf-8 -*-
"""
fsj-voice2content — 语音转文字悬浮窗
按 Ctrl+Alt+Space（或点窗口）开始/停止说话 → faster-whisper 转文字 → 复制到剪贴板 → 可选自动粘贴到当前焦点窗口（Claude 输入框）。

用法: python app.py   （或双击 start.bat，用 pythonw 静默启动）
退出: 点窗口右上角 ✕
"""
import threading
import time
import os
import sys

# 打包成 exe 后 __file__ 在临时解包目录，日志/数据要用 exe 所在目录
if getattr(sys, "frozen", False):
    APP_DIR = os.path.dirname(sys.executable)
else:
    APP_DIR = os.path.dirname(os.path.abspath(__file__))

# 国内加速：whisper 模型首次自动下载走镜像
os.environ.setdefault("HF_ENDPOINT", "https://hf-mirror.com")

import numpy as np
import pyperclip
import sounddevice as sd
import keyboard
import tkinter as tk
from faster_whisper import WhisperModel

SR = 16000                      # whisper 原生采样率
HOTKEY = "ctrl+alt+space"       # 全局热键：开始/停止
MIN_SECONDS = 0.4               # 短于这个时长视为误触，丢弃

IDLE_BG, REC_BG, BUSY_BG = "#1e1e2e", "#5b2333", "#3a3a1e"
FG = "#cdd6f4"


class Voice2TextApp:
    def __init__(self):
        self.root = tk.Tk()
        self.root.overrideredirect(True)          # 无边框
        self.root.attributes("-topmost", True)
        sw, sh = self.root.winfo_screenwidth(), self.root.winfo_screenheight()
        self.root.geometry(f"280x120+{sw - 320}+{sh - 220}")

        self.model = None                          # 后台加载
        self.stream = None
        self.frames = []
        self.state = "loading"                     # loading / idle / rec / busy
        self.auto_paste = tk.BooleanVar(value=True)
        self.last_text = ""
        self._drag = None
        self._press_pos = None                     # 区分点击 vs 拖动
        self._last_toggle = 0.0                    # 防热键自动重复

        self._build_ui()
        threading.Thread(target=self._load_model, daemon=True).start()
        keyboard.add_hotkey(HOTKEY, lambda: self.root.after(0, self.toggle))
        self.root.after(200, self._tick)

    # ---------- UI ----------
    def _build_ui(self):
        f = ("Microsoft YaHei UI", 9)
        top = tk.Frame(self.root, bg=IDLE_BG)
        top.pack(fill="x")
        self.dot = tk.Label(top, text="●", fg="#6c7086", bg=IDLE_BG, font=("Segoe UI", 10))
        self.dot.pack(side="left", padx=(8, 4), pady=3)
        self.status = tk.Label(top, text="模型加载中…", fg=FG, bg=IDLE_BG, font=f)
        self.status.pack(side="left")
        close_lbl = tk.Label(top, text="✕", fg="#6c7086", bg=IDLE_BG, font=f, cursor="hand2")
        close_lbl.pack(side="right", padx=8)
        close_lbl.bind("<Button-1>", lambda e: self.root.destroy())

        body = tk.Frame(self.root, bg=IDLE_BG, cursor="hand2")
        body.pack(fill="both", expand=True)
        body.bind("<Button-1>", self._on_press)
        body.bind("<B1-Motion>", self._on_drag)
        body.bind("<ButtonRelease-1>", self._on_release)

        self.text_lbl = tk.Label(body, text="按 Ctrl+Alt+Space 说话", fg="#6c7086", bg=IDLE_BG,
                                 font=f, wraplength=260, justify="left", anchor="w")
        self.text_lbl.pack(fill="both", expand=True, padx=8, pady=(2, 2))

        bottom = tk.Frame(self.root, bg=IDLE_BG)
        bottom.pack(fill="x")
        self.paste_btn = tk.Label(bottom, textvariable=tk.StringVar(), fg="#89b4fa", bg=IDLE_BG,
                                  font=f, cursor="hand2")
        self.paste_btn["text"] = "自动粘贴:开"
        self.paste_btn.bind("<Button-1>", lambda e: self._toggle_paste())
        self.paste_btn.pack(side="left", padx=(8, 0), pady=(0, 4))
        tk.Label(bottom, text="拖动=移动窗口 · 点击=录音", fg="#585b70", bg=IDLE_BG,
                 font=("Microsoft YaHei UI", 8)).pack(side="right", padx=8, pady=(0, 4))

    def _set_bg(self, color):
        def rec(w):
            try:
                w.config(bg=color)
            except tk.TclError:
                pass
            for c in w.winfo_children():
                rec(c)
        rec(self.root)

    def _tick(self):
        self.dot.config(fg={"rec": "#f38ba8", "busy": "#f9e2af", "idle": "#6c7086",
                            "loading": "#585b70"}[self.state])
        self.root.after(200, self._tick)

    def _toggle_paste(self):
        self.auto_paste.set(not self.auto_paste.get())
        self.paste_btn["text"] = "自动粘贴:开" if self.auto_paste.get() else "自动粘贴:关"

    # ---------- 窗口拖动 / 点击 ----------
    def _on_press(self, e):
        self._drag = (e.x_root, e.y_root, self.root.winfo_x(), self.root.winfo_y())
        self._press_pos = (e.x_root, e.y_root)

    def _on_drag(self, e):
        if self._drag:
            dx, dy, ox, oy = self._drag
            self.root.geometry(f"+{ox + e.x_root - dx}+{oy + e.y_root - dy}")

    def _on_release(self, e):
        moved = self._press_pos and abs(e.x_root - self._press_pos[0]) + abs(e.y_root - self._press_pos[1]) > 5
        self._drag = None
        self._press_pos = None
        if not moved:
            self.toggle()

    # ---------- 模型 ----------
    def _load_model(self):
        self.model = WhisperModel("small", device="cpu", compute_type="int8")
        self.root.after(0, self._set_idle)

    def _set_idle(self):
        self.state = "idle"
        self.status.config(text="待命")

    # ---------- 录音 ----------
    def toggle(self):
        try:
            with open(APP_DIR + "/hotkey.log", "a", encoding="utf-8") as f:
                f.write(f"{time.strftime('%H:%M:%S')} toggle state={self.state}\n")
        except OSError:
            pass
        now = time.time()
        if now - self._last_toggle < 0.4:          # 自动重复/手抖防连发
            return
        self._last_toggle = now
        try:
            if self.state == "idle":
                self._start_rec()
            elif self.state == "rec":
                self._stop_rec()
        except Exception as ex:                    # 任何异常都不许卡死状态机
            self._force_idle(f"出错已复位: {ex}")

    def _force_idle(self, msg):
        if self.stream:
            try:
                self.stream.stop()
                self.stream.close()
            except Exception:
                pass
            self.stream = None
        self.frames = []
        self._set_bg(IDLE_BG)
        self._set_idle()
        self.text_lbl.config(text=msg, fg="#f38ba8")

    def _start_rec(self):
        self.frames = []
        self.state = "rec"
        self.status.config(text="录音中…")
        self.text_lbl.config(text="🎙 说话中（再按一次热键结束）", fg=FG)
        self._set_bg(REC_BG)
        self.stream = sd.InputStream(samplerate=SR, channels=1, dtype="float32",
                                     blocksize=1024, callback=self._cb)
        self.stream.start()

    def _cb(self, indata, frames, t, status):
        self.frames.append(indata.copy())

    def _stop_rec(self):
        self.stream.stop()
        self.stream.close()
        self.stream = None
        if not self.frames:                        # 一帧都没有：别炸，直接复位
            self._set_bg(IDLE_BG)
            self._set_idle()
            self.text_lbl.config(text="(没录到声音，再试一次)", fg="#6c7086")
            return
        audio = np.concatenate(self.frames)[:, 0]
        self.frames = []
        dur = len(audio) / SR
        if dur < MIN_SECONDS:
            self._set_idle()
            self.text_lbl.config(text="(太短，丢弃)", fg="#6c7086")
            return
        self.state = "busy"
        self.status.config(text="转写中…")
        self.text_lbl.config(text=f"⏳ {dur:.1f}秒音频转写中…", fg=FG)
        self._set_bg(BUSY_BG)
        threading.Thread(target=self._transcribe, args=(audio,), daemon=True).start()

    def _transcribe(self, audio):
        t0 = time.time()
        peak = float(np.abs(audio).max())
        if peak > 0:
            audio = audio / peak * 0.95
        try:
            segments, _ = self.model.transcribe(
                audio, language="zh", initial_prompt="以下是普通话讨论内容。",
                vad_filter=True, vad_parameters={"min_silence_duration_ms": 500},
            )
            text = "".join(s.text for s in segments).strip()
        except Exception as ex:                       # 转写失败不崩
            text = ""
            err = f"转写出错: {ex}"
        else:
            err = None
        lat = time.time() - t0
        self.root.after(0, lambda: self._show(text, err, lat))

    def _show(self, text, err, lat):
        self._set_bg(IDLE_BG)
        self._set_idle()
        if err:
            self.text_lbl.config(text=err, fg="#f38ba8")
            return
        if not text:
            self.text_lbl.config(text="(没听清，再说一次)", fg="#6c7086")
            return
        self.last_text = text
        show = text if len(text) <= 90 else text[:90] + "…"
        self.text_lbl.config(text=f"✓ {show}\n({lat:.1f}s 已复制)", fg="#a6e3a1")
        pyperclip.copy(text)
        if self.auto_paste.get():
            threading.Thread(target=self._paste, daemon=True).start()

    def _paste(self):
        time.sleep(0.15)
        try:
            keyboard.send("ctrl+v")
        except Exception:
            pass  # 剪贴板里已有文字，手动粘即可

    def run(self):
        self.root.mainloop()


if __name__ == "__main__":
    Voice2TextApp().run()
