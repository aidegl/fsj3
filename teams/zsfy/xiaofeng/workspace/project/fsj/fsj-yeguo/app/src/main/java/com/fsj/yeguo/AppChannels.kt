package com.fsj.yeguo

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context

/**
 * 通知渠道：椰果常驻（静默）+ 椰果提醒（高优先级，会响会震）
 */
object AppChannels {
    const val SERVICE = "pet_service"
    const val REMINDERS = "yeguo_reminders"

    fun ensure(ctx: Context) {
        val nm = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.createNotificationChannel(
            NotificationChannel(SERVICE, "椰果常驻", NotificationManager.IMPORTANCE_MIN)
        )
        nm.createNotificationChannel(
            NotificationChannel(REMINDERS, "椰果提醒", NotificationManager.IMPORTANCE_HIGH)
        )
    }
}
