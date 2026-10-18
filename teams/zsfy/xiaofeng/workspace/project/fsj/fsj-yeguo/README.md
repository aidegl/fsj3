# 椰果（fsj-yeguo）· 安卓桌面宠物助手

一颗蹲在你手机桌面上的小椰果：悬浮常驻、能聊天、会提醒。

> 技术选型决策记录见 [docs/技术选型.md](docs/技术选型.md)

## 当前状态（v0.1 骨架）

- ✅ 悬浮窗桌宠（拖动挪位、单击开聊天面板）
- ✅ 对话：文字聊天，回答文字气泡 + 语音播报（手机自带 TTS 引擎）
- ✅ 大脑：OpenAI 兼容大模型（默认 DeepSeek，设置页可换）
- ✅ 提醒：系统级精确闹钟（杀后台也能响、开机自动重排）
- 🐣 形象：占位小椰子（Live2D 接入点已预留，见 `pet/PetRenderer.kt`）
- ⏳ HAP 记忆同步：客户端已具备（走 Node 代理），待建「椰果记忆表」后启用

## 环境要求

| 工具 | 版本 |
|---|---|
| Android Studio | Ladybug (2024.2) 或更新 |
| JDK | 17（AS 自带） |
| Android SDK | API 35 |

## 构建运行

1. Android Studio 打开本目录（首次会自动下载 Gradle 8.7 和依赖；国内慢可在 `gradle/wrapper/gradle-wrapper.properties` 切换腾讯镜像，文件里有注释）。
2. `Run` 到手机（或 `Build > Build APKs` 出 debug 包直接装）。
3. 首次启动按页面引导：
   - ① 悬浮窗权限（必须）② 通知权限 ③ 精确闹钟权限 ④ 麦克风权限
   - 填大模型 API Key → 保存 → 「放出椰果」
4. 回桌面：拖动小椰果挪位置，单击它开聊天；设置页可加提醒。

## 常见问题

- **语音播报**：椰果回复用手机自带 TTS 引擎念出来（免费离线），设置页可关/试听。若没声音，检查手机「文字转语音（TTS）」设置里的引擎和语言是否为中文。
- **语音输入**：APP 不内置——直接用输入法（讯飞/搜狗等）的语音键，对准聊天输入框说话即可。
- **椰果被杀**：在系统设置里给 APP「锁定后台/允许自启」（国产 ROM 省电策略）。
- **提醒不准点**：确认给了「精确闹钟」权限。
- **改大模型**：设置页改 Base URL / Key / 模型名即可，任何 OpenAI 兼容服务都行。

## 目录结构

```
app/src/main/java/com/fsj/yeguo/
├─ MainActivity.kt            # 设置主页（权限/配置/提醒管理）
├─ AppChannels.kt             # 通知渠道
├─ ai/
│  ├─ AssistantBrain.kt       # 大脑：人设+短期记忆+HAP记忆写入
│  └─ LlmClient.kt            # OpenAI 兼容大模型客户端
├─ hap/HapClient.kt           # HAP 客户端（走 Node 代理，零密钥）
├─ floating/
│  ├─ FloatingPetService.kt   # 悬浮窗常驻服务（桌宠本体）
│  └─ ChatPanelController.kt  # 聊天面板
├─ pet/
│  ├─ PetRenderer.kt          # 渲染器接口（Live2D 接入点）
│  └─ SimplePetRenderer.kt    # v0.1 占位渲染
├─ reminder/                  # 提醒：AlarmManager + 开机重排
├─ voice/VoiceInputController.kt
└─ config/AppConfig.kt        # 配置（key 只存手机本地）
```
