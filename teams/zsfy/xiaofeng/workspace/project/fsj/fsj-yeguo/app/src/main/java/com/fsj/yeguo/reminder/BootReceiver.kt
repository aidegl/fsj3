package com.fsj.yeguo.reminder

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * 开机完成：把所有未来提醒重新挂上闹钟（系统重启会清掉 AlarmManager 注册）。
 */
class BootReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
            ReminderManager.rescheduleAll(context)
        }
    }
}
