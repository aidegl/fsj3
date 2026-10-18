package com.fsj.yeguo.util

import android.content.ContentResolver
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.net.Uri
import android.os.Handler
import android.os.Looper
import com.fsj.yeguo.config.AppConfig
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.ByteArrayOutputStream
import java.util.concurrent.TimeUnit

/**
 * 图片工具：①Uri → 压缩后的 JPEG 字节  ②上传中转站换 URL。
 * 中转站协议（老板服务器已有）：POST multipart 字段 file → {"data":{"url":"/temp/x.png"}}
 */
object ImageHelper {

    private val client = OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS)
        .writeTimeout(60, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .build()
    private val main = Handler(Looper.getMainLooper())

    fun interface UrlCallback {
        fun onUrl(url: String?, error: String?)
    }

    /** Uri → 缩放（长边 ≤1280）→ JPEG 字节 */
    fun scaledJpegFromUri(context: Context, uri: Uri, maxSide: Int = 1280, quality: Int = 82): ByteArray {
        val resolver: ContentResolver = context.contentResolver
        val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
        var sample = 1
        while (bounds.outWidth / (sample * 2) >= maxSide || bounds.outHeight / (sample * 2) >= maxSide) sample *= 2
        val opts = BitmapFactory.Options().apply { inSampleSize = sample }
        val bitmap = resolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, opts) }
            ?: error("图片读取失败")

        val longSide = maxOf(bitmap.width, bitmap.height)
        val scaled = if (longSide > maxSide) {
            val ratio = maxSide.toFloat() / longSide
            Bitmap.createBitmap(
                bitmap, 0, 0, bitmap.width, bitmap.height,
                Matrix().apply { postScale(ratio, ratio) }, true
            )
        } else bitmap

        val out = ByteArrayOutputStream()
        scaled.compress(Bitmap.CompressFormat.JPEG, quality, out)
        return out.toByteArray()
    }

    /** 上传到中转站，回调回主线程 */
    fun uploadJpeg(context: Context, bytes: ByteArray, cb: UrlCallback) {
        val body = MultipartBody.Builder()
            .setType(MultipartBody.FORM)
            .addFormDataPart("file", "yeguo.jpg", bytes.toRequestBody("image/jpeg".toMediaType()))
            .build()
        val req = Request.Builder().url(AppConfig.relayUploadUrl).post(body).build()
        client.newCall(req).enqueue(object : okhttp3.Callback {
            override fun onFailure(call: okhttp3.Call, e: java.io.IOException) {
                main.post { cb.onUrl(null, "上传失败: ${e.message}") }
            }

            override fun onResponse(call: okhttp3.Call, resp: okhttp3.Response) {
                val text = resp.body?.string() ?: ""
                main.post {
                    try {
                        val data = org.json.JSONObject(text).optJSONObject("data")
                        val url = data?.optString("url").orEmpty()
                        if (url.isEmpty()) {
                            cb.onUrl(null, "中转站响应异常: ${text.take(150)}")
                        } else {
                            val full = if (url.startsWith("http")) url
                            else AppConfig.relayBaseUrl.trimEnd('/') + url
                            cb.onUrl(full, null)
                        }
                    } catch (e: Exception) {
                        cb.onUrl(null, "中转站解析失败: ${text.take(150)}")
                    }
                }
            }
        })
    }
}
