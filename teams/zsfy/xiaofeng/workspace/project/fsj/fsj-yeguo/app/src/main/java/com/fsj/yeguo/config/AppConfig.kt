package com.fsj.yeguo.config

import android.content.Context
import android.content.SharedPreferences

/**
 * 全局配置：LLM 与 HAP 通道。
 * 自用版存 SharedPreferences；API Key 只存在手机本地，不写进代码。
 */
object AppConfig {

    private const val PREFS = "yeguo_config"

    private const val KEY_LLM_BASE_URL = "llm_base_url"
    private const val KEY_LLM_API_KEY = "llm_api_key"
    private const val KEY_LLM_MODEL = "llm_model"
    private const val KEY_HAP_PROXY = "hap_proxy_url"
    private const val KEY_HAP_BASE = "hap_base_url"
    private const val KEY_MEMORY_WS = "hap_memory_worksheet"
    private const val KEY_TTS_ENABLED = "tts_enabled"
    private const val KEY_TTS_VOICE = "tts_voice"
    private const val KEY_RELAY_UPLOAD = "relay_upload_url"
    private const val KEY_RELAY_BASE = "relay_base_url"
    private const val KEY_VISION_MODEL = "vision_model"

    // LLM：OpenAI 兼容协议。默认 MiniMax——对话和语音播报共用这一个 Key。
    // 自用版把 Key 内置为默认值，装上即用；设置页仍可随时覆盖。
    // ⚠ 代码仓库要共享/外传前，记得先清掉下面这行 Key。
    private const val DEFAULT_LLM_BASE = "https://api.minimaxi.com/v1"
    private const val DEFAULT_LLM_KEY =
        "sk-cp-YvxBGLbrzyt-VqSdjAwM0f5SPMlqkEGWQwb_hpuHmxDb3BFyz-ViS0AGCm6uGjdXOc15Atz986KpOQjOb7AAvPoApkBsSx31oeTKpcpU-16xYSwRLKkR10g"
    private const val DEFAULT_LLM_MODEL = "MiniMax-M2"

    var llmBaseUrl: String = DEFAULT_LLM_BASE
    var llmApiKey: String = DEFAULT_LLM_KEY
    var llmModel: String = DEFAULT_LLM_MODEL

    // HAP：走现有 Node 代理（100000whys.cn/mingdao），appKey/sign 由代理注入，APP 零密钥
    var hapProxyUrl: String = "https://100000whys.cn/mingdao"
    var hapBaseUrl: String = ""           // HAP 站点地址，如 https://hap.xxx.cn
    var memoryWorksheetId: String = ""    // 椰果记忆表 worksheetId，留空 = 暂不同步记忆

    // 语音播报开关（椰果回复用语音念出来）+ 播报音色（设置页下拉选择）
    var ttsEnabled: Boolean = true
    var ttsVoiceId: String = "female-shaonv"

    // 图片中转（读屏/发图）：图先传中转站换 URL，再交给视觉模型分析
    var relayUploadUrl: String = "https://100000whys.cn/api/v1/temp/upload"
    var relayBaseUrl: String = "https://100000whys.cn"
    var visionModel: String = "MiniMax-M3"

    fun load(ctx: Context) {
        val p: SharedPreferences = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        // 自用策略：手机里存的是空值、或还是旧的 DeepSeek 配置时，直接改用内置默认值
        val storedBase = p.getString(KEY_LLM_BASE_URL, "").orEmpty()
        llmBaseUrl = if (storedBase.isBlank() || storedBase.contains("deepseek")) {
            DEFAULT_LLM_BASE
        } else storedBase
        val storedKey = p.getString(KEY_LLM_API_KEY, "").orEmpty()
        llmApiKey = if (storedKey.isBlank()) DEFAULT_LLM_KEY else storedKey
        val storedModel = p.getString(KEY_LLM_MODEL, "").orEmpty()
        llmModel = if (storedModel.isBlank() || storedModel == "deepseek-chat") {
            DEFAULT_LLM_MODEL
        } else storedModel
        hapProxyUrl = p.getString(KEY_HAP_PROXY, hapProxyUrl) ?: hapProxyUrl
        hapBaseUrl = p.getString(KEY_HAP_BASE, hapBaseUrl) ?: hapBaseUrl
        memoryWorksheetId = p.getString(KEY_MEMORY_WS, memoryWorksheetId) ?: memoryWorksheetId
        ttsEnabled = p.getBoolean(KEY_TTS_ENABLED, ttsEnabled)
        ttsVoiceId = p.getString(KEY_TTS_VOICE, ttsVoiceId) ?: ttsVoiceId
        relayUploadUrl = p.getString(KEY_RELAY_UPLOAD, relayUploadUrl) ?: relayUploadUrl
        relayBaseUrl = p.getString(KEY_RELAY_BASE, relayBaseUrl) ?: relayBaseUrl
        visionModel = p.getString(KEY_VISION_MODEL, visionModel) ?: visionModel
    }

    fun save(ctx: Context) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString(KEY_LLM_BASE_URL, llmBaseUrl)
            .putString(KEY_LLM_API_KEY, llmApiKey)
            .putString(KEY_LLM_MODEL, llmModel)
            .putString(KEY_HAP_PROXY, hapProxyUrl)
            .putString(KEY_HAP_BASE, hapBaseUrl)
            .putString(KEY_MEMORY_WS, memoryWorksheetId)
            .putBoolean(KEY_TTS_ENABLED, ttsEnabled)
            .putString(KEY_TTS_VOICE, ttsVoiceId)
            .putString(KEY_RELAY_UPLOAD, relayUploadUrl)
            .putString(KEY_RELAY_BASE, relayBaseUrl)
            .putString(KEY_VISION_MODEL, visionModel)
            .apply()
    }
}
