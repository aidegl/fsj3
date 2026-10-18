package com.fsj.yeguo.ai

import android.os.Handler
import android.os.Looper
import com.fsj.yeguo.config.AppConfig
import okhttp3.Call
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit

/**
 * 大模型客户端：OpenAI 兼容 /chat/completions（默认 DeepSeek，可在设置页换任何兼容服务）。
 * v0.1 非流式；流式输出（打字机效果）排 v0.2。
 */
class LlmClient {

    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(120, TimeUnit.SECONDS)
        .build()
    private val main = Handler(Looper.getMainLooper())

    fun interface Callback {
        fun onResult(reply: String?, error: String?)
    }

    fun chat(messages: JSONArray, cb: Callback) = chatRaw(messages, AppConfig.llmModel, cb)

    /** 指定模型的对话（视觉等特殊请求用） */
    fun chatRaw(messages: JSONArray, model: String, cb: Callback) {
        if (AppConfig.llmApiKey.isBlank()) {
            main.post { cb.onResult(null, "还没配置大模型 API Key，去 APP 设置页填一下") }
            return
        }
        val body = JSONObject()
            .put("model", model)
            .put("messages", messages)
            .put("temperature", 0.8)
        val req = Request.Builder()
            .url(AppConfig.llmBaseUrl.trimEnd('/') + "/chat/completions")
            .header("Authorization", "Bearer " + AppConfig.llmApiKey)
            .post(body.toString().toRequestBody("application/json; charset=utf-8".toMediaType()))
            .build()
        client.newCall(req).enqueue(object : okhttp3.Callback {
            override fun onFailure(call: Call, e: IOException) {
                main.post { cb.onResult(null, e.message) }
            }

            override fun onResponse(call: Call, resp: Response) {
                val text = resp.body?.string() ?: ""
                main.post {
                    try {
                        val raw = JSONObject(text)
                            .getJSONArray("choices")
                            .getJSONObject(0)
                            .getJSONObject("message")
                            .getString("content")
                        // MiniMax M2 等推理模型会在正文里带 <think> 思考过程，展示和播报前滤掉
                        val content = raw
                            .replace(Regex("<think>[\\s\\S]*?</think>", RegexOption.IGNORE_CASE), "")
                            .trim()
                            .ifEmpty { raw.trim() }
                        cb.onResult(content, null)
                    } catch (e: Exception) {
                        cb.onResult(null, "大模型响应异常: " + text.take(200))
                    }
                }
            }
        })
    }
}
