package com.fsj.yeguo.reminder

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.fsj.yeguo.AppChannels
import com.fsj.yeguo.Diag
import com.fsj.yeguo.MainActivity
import com.fsj.yeguo.R
import com.fsj.yeguo.floating.FloatingPetService

/**
 * 提醒到点：双保险。
 * ① 系统高优通知（哪怕椰果没在桌面也能看到）
 * ② 椰果本体开口：AI 生成人性化提醒话术 + 弹聊天面板 + 语音播报
 */
class AlarmReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val title = intent.getStringExtra("title") ?: "到点啦"
        Diag.alarmFired(context, title) // 诊断：证明闹钟真的响了

        postReminderNotification(context, title)

        // 椰果开口（服务活着直接说；没活着尝试拉起，部分 ROM 后台限制可能拦，有通知兜底）
        val svc = FloatingPetService.instance
        if (svc != null) {
            svc.announceReminder(title)
        } else {
            runCatching {
                ContextCompat.startForegroundService(
                    context,
                    Intent(context, FloatingPetService::class.java)
                        .putExtra(FloatingPetService.EXTRA_ANNOUNCE, title)
                )
            }
        }
    }

    companion object {
        /** 发高优提醒通知。也供设置页「立即测试通知」直测链路用 */
        fun postReminderNotification(context: Context, title: String) {
            AppChannels.ensure(context)
            val contentIntent = PendingIntent.getActivity(
                context, 1001,
                Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
            val notification = NotificationCompat.Builder(context, AppChannels.REMINDERS)
                .setSmallIcon(R.drawable.ic_pet)
                .setContentTitle("🥥 椰果提醒你")
                .setContentText(title)
                .setPriority(NotificationCompat.PRIORITY_MAX)
                .setCategory(NotificationCompat.CATEGORY_REMINDER)
                .setAutoCancel(true)
                .setContentIntent(contentIntent)
                .build()
            // 渠道被用户关掉时提前发现
            runCatching {
                val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager
                val ch = nm.getNotificationChannel(AppChannels.REMINDERS)
                if (ch != null && ch.importance == android.app.NotificationManager.IMPORTANCE_NONE) {
                    android.os.Handler(android.os.Looper.getMainLooper()).post {
                        android.widget.Toast.makeText(
                            context,
                            "「椰果提醒」通知渠道被关了：系统设置→应用→椰果→通知里打开",
                            android.widget.Toast.LENGTH_LONG
                        ).show()
                    }
                }
            }
            try {
                NotificationManagerCompat.from(context)
                    .notify((System.currentTimeMillis() and 0x7fffffff).toInt(), notification)
            } catch (e: SecurityException) {
                // 通知权限被拒：不再静默，直接喊话
                android.os.Handler(android.os.Looper.getMainLooper()).post {
                    android.widget.Toast.makeText(
                        context,
                        "通知权限没给：去椰果设置页点「② 通知权限」并允许",
                        android.widget.Toast.LENGTH_LONG
                    ).show()
                }
            }
        }
    }
}
