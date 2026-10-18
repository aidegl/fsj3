package com.fsj.yeguo

import android.content.Context
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * 诊断日志：记录「闹钟是否真的触发了」。
 * 用于区分两类故障：系统根本没送闹钟（权限/ROM 杀后台） vs 送了但没展示出来（通知被拦）。
 * 记录持久化到 diag.log，设置页状态框直接显示，方便远程排障。
 */
object Diag {

    @Volatile
    var lastAlarm: String = ""
        private set

    fun load(ctx: Context) {
        val f = file(ctx)
        if (f.exists()) {
            lastAlarm = runCatching {
                f.readLines().lastOrNull { it.isNotBlank() } ?: ""
            }.getOrDefault("")
        }
    }

    fun alarmFired(ctx: Context, title: String) {
        val line = SimpleDateFormat("MM-dd HH:mm:ss", Locale.CHINA).format(Date()) + " 「$title」"
        lastAlarm = line
        runCatching {
            file(ctx).parentFile?.mkdirs()
            file(ctx).appendText(line + "\n")
        }
    }

    private fun file(ctx: Context): File {
        val dir = ctx.getExternalFilesDir(null) ?: ctx.filesDir
        return File(dir, "diag.log")
    }
}
