package com.fsj.yeguo.reminder

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import org.json.JSONArray
import org.json.JSONObject

data class Reminder(val id: Long, val title: String, val timeMillis: Long)

/**
 * 提醒管理：系统级精确闹钟（AlarmManager，App 被杀也能响）+ 本地 JSON 持久化。
 * 开机后 BootReceiver 调 rescheduleAll 重排。
 * 二期：提醒数据同步 HAP 表，实现跨端管理（工作表建好后接 HapClient）。
 */
object ReminderManager {

    private const val PREFS = "yeguo_reminders"
    private const val KEY_LIST = "list"

    fun list(ctx: Context): List<Reminder> {
        val prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val arr = JSONArray(prefs.getString(KEY_LIST, "[]") ?: "[]")
        val out = ArrayList<Reminder>(arr.length())
        for (i in 0 until arr.length()) {
            val o = arr.getJSONObject(i)
            out.add(Reminder(o.getLong("id"), o.getString("title"), o.getLong("time")))
        }
        return out.sortedBy { it.timeMillis }
    }

    fun add(ctx: Context, title: String, timeMillis: Long): Reminder {
        val r = Reminder(System.currentTimeMillis(), title, timeMillis)
        persist(ctx, list(ctx) + r)
        schedule(ctx, r)
        return r
    }

    fun remove(ctx: Context, id: Long) {
        val target = list(ctx).firstOrNull { it.id == id } ?: return
        cancel(ctx, target)
        persist(ctx, list(ctx).filterNot { it.id == id })
    }

    /** 开机/重启后重排所有未来提醒 */
    fun rescheduleAll(ctx: Context) {
        val now = System.currentTimeMillis()
        list(ctx).filter { it.timeMillis > now }.forEach { schedule(ctx, it) }
    }

    private fun schedule(ctx: Context, r: Reminder) {
        val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val pi = pending(ctx, r)
        if (Build.VERSION.SDK_INT >= 31 && !am.canScheduleExactAlarms()) {
            // 没给精确闹钟权限时退化（可能延迟几分钟），设置页会引导开权限
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, r.timeMillis, pi)
        } else {
            am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, r.timeMillis, pi)
        }
    }

    private fun cancel(ctx: Context, r: Reminder) {
        val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        am.cancel(pending(ctx, r))
    }

    private fun pending(ctx: Context, r: Reminder): PendingIntent {
        val intent = Intent(ctx, AlarmReceiver::class.java)
            .putExtra("id", r.id)
            .putExtra("title", r.title)
        return PendingIntent.getBroadcast(
            ctx,
            (r.id and 0x7fffffffL).toInt(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }

    private fun persist(ctx: Context, reminders: List<Reminder>) {
        val arr = JSONArray()
        reminders.forEach { r ->
            arr.put(JSONObject().put("id", r.id).put("title", r.title).put("time", r.timeMillis))
        }
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit().putString(KEY_LIST, arr.toString()).apply()
    }
}
