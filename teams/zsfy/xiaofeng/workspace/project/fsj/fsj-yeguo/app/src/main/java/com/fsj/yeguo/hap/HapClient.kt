package com.fsj.yeguo.hap

import android.os.Handler
import android.os.Looper
import com.fsj.yeguo.config.AppConfig
import okhttp3.Call
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit

/**
 * HAP 客户端：所有 HAP 读写都经 Node 代理（POST {url, input}），
 * 代理服务端注入 appKey/sign，APP 侧零密钥 —— 与团队「密钥零落地」纪律一致。
 */
class HapClient {

    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .build()
    private val main = Handler(Looper.getMainLooper())

    fun interface Callback {
        fun onResult(ok: Boolean, data: JSONObject?, error: String?)
    }

    /** 经代理调用任意 HAP v2 接口（hapPath 形如 /api/v2/open/worksheet/addWorksheetRecord） */
    fun call(hapPath: String, input: JSONObject, cb: Callback) {
        if (AppConfig.hapProxyUrl.isBlank() || AppConfig.hapBaseUrl.isBlank()) {
            main.post { cb.onResult(false, null, "HAP 配置不完整（代理地址 / 站点地址）") }
            return
        }
        val hapUrl = AppConfig.hapBaseUrl.trimEnd('/') + hapPath
        val body = JSONObject().put("url", hapUrl).put("input", input)
        val req = Request.Builder()
            .url(AppConfig.hapProxyUrl)
            .post(body.toString().toRequestBody("application/json; charset=utf-8".toMediaType()))
            .build()
        client.newCall(req).enqueue(object : okhttp3.Callback {
            override fun onFailure(call: Call, e: IOException) {
                main.post { cb.onResult(false, null, e.message) }
            }

            override fun onResponse(call: Call, resp: Response) {
                val text = resp.body?.string() ?: ""
                main.post {
                    try {
                        cb.onResult(resp.isSuccessful, JSONObject(text), null)
                    } catch (e: Exception) {
                        cb.onResult(false, null, "响应解析失败: ${e.message}")
                    }
                }
            }
        })
    }

    /** 新建一条 HAP 记录（如对话记忆写入「椰果记忆表」） */
    fun addRecord(worksheetId: String, record: JSONObject, cb: Callback) =
        call(
            "/api/v2/open/worksheet/addWorksheetRecord",
            JSONObject().put("worksheetId", worksheetId).put("params", record),
            cb
        )

    /** 按页拉记录（后续拉取人设/长期记忆用） */
    fun filterRecords(worksheetId: String, pageSize: Int, cb: Callback) =
        call(
            "/api/v2/open/worksheet/filterWorksheetRecord",
            JSONObject().put("worksheetId", worksheetId).put("pageSize", pageSize),
            cb
        )
}
