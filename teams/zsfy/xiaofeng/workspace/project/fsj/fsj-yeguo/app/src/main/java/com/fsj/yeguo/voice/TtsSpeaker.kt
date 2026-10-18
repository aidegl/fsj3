package com.fsj.yeguo.voice

import android.content.Context
import android.media.MediaPlayer
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.widget.Toast
import com.fsj.yeguo.config.AppConfig
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.io.File
import java.util.Locale
import java.util.concurrent.TimeUnit

/**
 * 语音播报：MiniMax 云端语音合成（T2A）为主，手机自带 TTS 引擎兜底。
 * 复用设置页里的大模型 API Key（同一个 MiniMax 账号，对话/语音一个 Key 全搞定）。
 * 音色在设置页下拉切换（TtsVoices.PRESETS），存 AppConfig.ttsVoiceId。
 * 音频只写临时缓存文件（每次覆盖），播完即删——不进相册、不落永久存储。
 */
object TtsSpeaker {

    private const val T2A_URL = "https://api.minimaxi.com/v1/t2a_v2"
    private const val TTS_MODEL = "speech-02-turbo"
    private const val DEFAULT_VOICE_ID = "female-shaonv"

    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .build()
    private val main = Handler(Looper.getMainLooper())

    private var appContext: Context? = null
    private var player: MediaPlayer? = null

    // 系统引擎兜底（没配 Key 时用）
    private var tts: TextToSpeech? = null

    @Volatile
    private var sysReady = false

    @Volatile
    private var sysAvailable = false

    @Volatile
    private var warned = false

    fun init(ctx: Context) {
        appContext = ctx.applicationContext
        if (tts != null) return
        tts = TextToSpeech(ctx.applicationContext) { status ->
            if (status == TextToSpeech.SUCCESS) {
                val result = runCatching {
                    tts?.setLanguage(Locale.SIMPLIFIED_CHINESE)
                }.getOrDefault(TextToSpeech.LANG_NOT_SUPPORTED)
                sysAvailable = result != TextToSpeech.LANG_MISSING_DATA &&
                    result != TextToSpeech.LANG_NOT_SUPPORTED
            }
            sysReady = true
        }
    }

    /** 引擎状态（设置页状态框展示用） */
    fun statusText(): String = when {
        AppConfig.llmApiKey.isBlank() -> "未配置模型 Key（云端语音走不了）"
        else -> "✓ 云端语音就绪（MiniMax·少女音）"
    }

    /** 念一段文字（打断上一段，避免积压） */
    fun speak(text: String) {
        val clean = text.trim()
        if (clean.isEmpty()) return
        stop()
        if (AppConfig.llmApiKey.isNotBlank()) {
            cloudSpeak(clean)
        } else {
            systemSpeak(clean)
        }
    }

    // ---------- 主路：MiniMax 云端合成 ----------

    private fun cloudSpeak(text: String) {
        Thread {
            try {
                val body = JSONObject()
                    .put("model", TTS_MODEL)
                    .put("text", text)
                    .put("stream", false)
                    .put(
                        "voice_setting",
                        JSONObject()
                            .put("voice_id", AppConfig.ttsVoiceId.ifBlank { DEFAULT_VOICE_ID })
                            .put("speed", 1.05)
                            .put("vol", 1.0)
                            .put("pitch", 0)
                    )
                    .put(
                        "audio_setting",
                        JSONObject()
                            .put("sample_rate", 32000)
                            .put("bitrate", 128000)
                            .put("format", "mp3")
                            .put("channel", 1)
                    )
                val req = Request.Builder()
                    .url(T2A_URL)
                    .header("Authorization", "Bearer " + AppConfig.llmApiKey)
                    .post(body.toString().toRequestBody("application/json".toMediaType()))
                    .build()
                client.newCall(req).execute().use { resp ->
                    val respText = resp.body?.string() ?: ""
                    val json = JSONObject(respText)
                    val code = json.optJSONObject("base_resp")?.optInt("status_code") ?: -1
                    if (!resp.isSuccessful || code != 0) {
                        val msg = json.optJSONObject("base_resp")?.optString("status_msg")
                            ?.takeIf { it.isNotBlank() } ?: "HTTP ${resp.code}"
                        fallback(text, "云端语音失败: $msg")
                        return@use
                    }
                    val hex = json.optJSONObject("data")?.optString("audio").orEmpty()
                    if (hex.isEmpty()) {
                        fallback(text, "云端语音返回为空")
                        return@use
                    }
                    val bytes = hex.chunked(2).map { it.toInt(16).toByte() }.toByteArray()
                    val ctx = appContext ?: return@use
                    val f = File(ctx.cacheDir, "yeguo_tts.mp3")
                    f.writeBytes(bytes)
                    main.post { playFile(f) }
                }
            } catch (e: Exception) {
                fallback(text, "云端语音异常: ${e.message}")
            }
        }.start()
    }

    private fun playFile(f: File) {
        try {
            player?.release()
            player = MediaPlayer().apply {
                setDataSource(f.absolutePath)
                setOnCompletionListener { mp ->
                    runCatching { f.delete() }
                    mp.release()
                    if (player === mp) player = null
                }
                prepare()
                start()
            }
        } catch (e: Exception) {
            fallback(f.name, "播放失败: ${e.message}")
        }
    }

    private fun fallback(text: String, msg: String) {
        main.post {
            if (sysAvailable) {
                systemSpeak(text)
            } else {
                Toast.makeText(appContext, msg, Toast.LENGTH_LONG).show()
            }
        }
    }

    // ---------- 兜底：手机自带引擎 ----------

    private fun systemSpeak(text: String, tries: Int = 3) {
        if (!sysReady) {
            if (tries > 0) main.postDelayed({ systemSpeak(text, tries - 1) }, 600)
            return
        }
        if (!sysAvailable) {
            warnOnce()
            return
        }
        runCatching {
            tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, "yeguo_${System.currentTimeMillis()}")
        }
    }

    private fun warnOnce() {
        if (warned) return
        warned = true
        val ctx = appContext ?: return
        Toast.makeText(
            ctx,
            "云端语音不可用且手机无中文语音引擎，检查网络和模型 Key",
            Toast.LENGTH_LONG
        ).show()
    }

    /** 停止播报（收起聊天面板时用） */
    fun stop() {
        runCatching {
            player?.stop()
            player?.release()
        }
        player = null
        runCatching { tts?.stop() }
    }

    fun shutdown() {
        stop()
        runCatching { tts?.shutdown() }
        tts = null
        sysReady = false
        sysAvailable = false
    }
}
