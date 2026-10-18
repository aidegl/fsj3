package com.fsj.yeguo

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.widget.Toast
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * 崩溃黑匣子：任何线程的未捕获异常（含 Error）都先记录 + 弹提示，再交给系统。
 * 崩溃详情持久化到 crash.log，重启 APP 后设置页能看到上次崩溃原因，方便远程排障。
 */
object CrashGuard {

    @Volatile
    var lastCrash: String = ""
        private set

    fun install(ctx: Context) {
        val logFile = logFile(ctx)
        if (logFile.exists()) {
            // 重启进程后恢复上次崩溃摘要（取日志最后一条非空行）
            lastCrash = runCatching {
                logFile.readText().lineSequence().lastOrNull { it.isNotBlank() } ?: ""
            }.getOrDefault("")
        }
        val prev = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { t, e ->
            val brief = "${e.javaClass.simpleName}: ${e.message?.take(160)}"
            lastCrash = brief
            runCatching {
                logFile.parentFile?.mkdirs()
                logFile.appendText(
                    SimpleDateFormat("MM-dd HH:mm:ss", Locale.CHINA).format(Date()) +
                        "  $brief\n" + e.stackTraceToString().take(2000) + "\n\n"
                )
            }
            runCatching {
                Handler(Looper.getMainLooper()).post {
                    Toast.makeText(ctx, "椰果出错了：$brief", Toast.LENGTH_LONG).show()
                }
                Thread.sleep(500) // 给 toast 一点显示时间
            }
            prev?.uncaughtException(t, e)
        }
    }

    fun clear(ctx: Context) {
        lastCrash = ""
        runCatching { logFile(ctx).delete() }
    }

    private fun logFile(ctx: Context): File {
        val dir = ctx.getExternalFilesDir(null) ?: ctx.filesDir
        return File(dir, "crash.log")
    }
}
