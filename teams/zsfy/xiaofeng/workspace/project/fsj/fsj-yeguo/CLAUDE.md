# fsj-yeguo · 椰果安卓桌面宠物

> [项目状态] v0.1 骨架完成（2026-09-19），待编译环境

## 一句话

安卓悬浮桌宠：Live2D 形象（暂用占位）+ 文字/语音对话（大模型）+ 系统级提醒，大脑数据中枢在 HAP 明道云。自用，不上架。

## 关键决策（老板 2026-09-19 拍板）

- 仅安卓原生 Kotlin；对话=文字+语音输入；形象=Live2D；大脑接 HAP 明道云；先自用
- 代码位置：`team/xiaofeng/workspace/project/fsj/fsj-yeguo`
- 宠物身份=椰果（与团队椰果同名，人设后续从 HAP 对齐）

## 技术要点

- LLM：OpenAI 兼容协议，默认 DeepSeek，key 只存手机（自用可接受）；HAP 走 Node 代理零密钥
- Live2D 接入点：`pet/PetRenderer.kt`，实现 CubismPetRenderer 即插即换
- 提醒：AlarmManager 精确闹钟 + BootReceiver 重排，二期数据同步 HAP
- 版本：minSdk 26 / target 35 / AGP 8.5.2 / Kotlin 2.0.20 / Gradle 8.7

## 阻塞项

1. 本机无 JDK/Android SDK/Gradle → 需装 Android Studio 才能编译
2. 待老板：DeepSeek API Key / Live2D Cubism SDK 下载 / HAP「椰果记忆表」worksheetId

详见 `docs/技术选型.md` 与 `README.md`
