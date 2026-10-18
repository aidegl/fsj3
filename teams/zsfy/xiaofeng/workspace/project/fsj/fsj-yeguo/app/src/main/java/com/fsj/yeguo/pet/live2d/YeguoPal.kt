package com.fsj.yeguo.pet.live2d

import android.content.Context
import android.util.Log
import com.live2d.sdk.cubism.core.ICubismLogger
import com.live2d.sdk.cubism.framework.ICubismLoadFileFunction

/**
 * Live2D 层的「平台适配」：上下文、时间步进、assets 文件读取、日志。
 * 对齐官方示例的 LAppMinimumPal。
 */
object YeguoPal {
    private const val TAG = "[YeguoLive2D]"

    private var appContext: Context? = null
    private var lastNanoTime = 0.0
    private var deltaNanoTime = 0.0

    /** 前后两帧的时间差（秒），驱动动画 */
    val deltaTime: Float
        get() = (deltaNanoTime / 1_000_000_000.0).toFloat()

    fun init(ctx: Context) {
        appContext = ctx.applicationContext
    }

    fun context(): Context? = appContext

    fun updateTime() {
        val now = System.nanoTime().toDouble()
        deltaNanoTime = now - lastNanoTime
        lastNanoTime = now
    }

    /** 从 assets 读文件（Live2D 框架所有资源都走这里） */
    fun loadFileAsBytes(path: String): ByteArray {
        val ctx = appContext ?: return ByteArray(0)
        return try {
            ctx.assets.open(path).use { it.readBytes() }
        } catch (e: Exception) {
            Log.d(TAG, "文件读取失败: $path (${e.message})")
            ByteArray(0)
        }
    }

    fun printLog(message: String) = Log.d(TAG, message)

    /** 注册给 CubismFramework 的日志函数 */
    class PrintLogFunction : ICubismLogger {
        override fun print(message: String) {
            Log.d(TAG, message)
        }
    }

    /** 注册给 CubismFramework 的文件加载函数 */
    class LoadFileFunction : ICubismLoadFileFunction {
        override fun load(path: String): ByteArray = loadFileAsBytes(path)
    }
}
