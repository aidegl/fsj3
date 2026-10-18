package com.fsj.yeguo

import android.Manifest
import android.app.AlarmManager
import android.app.TimePickerDialog
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.View
import android.widget.AdapterView
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.EditText
import android.widget.Spinner
import android.widget.Switch
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import com.fsj.yeguo.config.AppConfig
import com.fsj.yeguo.floating.FloatingPetService
import com.fsj.yeguo.reminder.AlarmReceiver
import com.fsj.yeguo.reminder.ReminderManager
import com.fsj.yeguo.voice.TtsSpeaker
import com.fsj.yeguo.voice.TtsVoices
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

/**
 * 设置主页：权限引导、椰果开关、大模型/HAP 配置、提醒管理。
 * 日常使用不需要打开这个页面 —— 椰果直接悬浮在桌面上。
 */
class MainActivity : AppCompatActivity() {

    private lateinit var tvStatus: TextView
    private lateinit var tvReminders: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        AppConfig.load(this)
        Diag.load(this)
        TtsSpeaker.init(this) // 预热播报引擎，状态框会显示可用性

        tvStatus = findViewById(R.id.tv_status)
        tvReminders = findViewById(R.id.tv_reminders)

        findViewById<Button>(R.id.btn_overlay).setOnClickListener {
            if (!Settings.canDrawOverlays(this)) {
                startActivity(
                    Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$packageName"))
                )
            } else toast("悬浮窗权限已经有了")
        }

        findViewById<Button>(R.id.btn_notify).setOnClickListener {
            if (Build.VERSION.SDK_INT >= 33 &&
                checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED
            ) {
                requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)
            } else {
                // 已授权：打开本 APP 的系统通知详情页（查渠道开关/勿扰）
                toast("权限已给。在打开的页面确认「椰果提醒」渠道开着、勿扰没开")
                startActivity(Intent().apply {
                    action = Settings.ACTION_APP_NOTIFICATION_SETTINGS
                    putExtra(Settings.EXTRA_APP_PACKAGE, packageName)
                })
            }
        }

        findViewById<Button>(R.id.btn_mic_perm).setOnClickListener {
            if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), 2)
            } else toast("麦克风权限 OK")
        }

        findViewById<Button>(R.id.btn_alarm).setOnClickListener {
            val am = getSystemService(ALARM_SERVICE) as AlarmManager
            if (Build.VERSION.SDK_INT >= 31 && !am.canScheduleExactAlarms()) {
                startActivity(
                    Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:$packageName"))
                )
            } else toast("精确闹钟权限 OK")
        }

        findViewById<Button>(R.id.btn_start).setOnClickListener {
            if (!Settings.canDrawOverlays(this)) {
                toast("先给悬浮窗权限哦")
                return@setOnClickListener
            }
            ContextCompat.startForegroundService(this, Intent(this, FloatingPetService::class.java))
            toast("椰果上线！回桌面找它玩")
        }

        findViewById<Button>(R.id.btn_stop).setOnClickListener {
            stopService(Intent(this, FloatingPetService::class.java))
            toast("椰果收回口袋了")
        }

        findViewById<Button>(R.id.btn_save_llm).setOnClickListener {
            AppConfig.llmBaseUrl = text(R.id.et_llm_base)
            AppConfig.llmApiKey = text(R.id.et_llm_key)
            AppConfig.llmModel = text(R.id.et_llm_model)
            AppConfig.save(this)
            toast("模型配置已保存")
        }

        findViewById<Button>(R.id.btn_save_hap).setOnClickListener {
            AppConfig.hapProxyUrl = text(R.id.et_hap_proxy)
            AppConfig.hapBaseUrl = text(R.id.et_hap_base)
            AppConfig.memoryWorksheetId = text(R.id.et_hap_memory)
            AppConfig.save(this)
            toast("HAP 配置已保存")
        }

        val swTts = findViewById<Switch>(R.id.switch_tts)
        swTts.isChecked = AppConfig.ttsEnabled
        swTts.setOnCheckedChangeListener { _, checked ->
            AppConfig.ttsEnabled = checked
            AppConfig.save(this)
        }
        val voices = TtsVoices.PRESETS
        val voiceSpinner = findViewById<Spinner>(R.id.spinner_voice)
        voiceSpinner.adapter = ArrayAdapter(
            this,
            android.R.layout.simple_spinner_dropdown_item,
            voices.map { it.first }
        )
        voiceSpinner.setSelection(
            voices.indexOfFirst { it.second == AppConfig.ttsVoiceId }.takeIf { it >= 0 } ?: 0
        )
        voiceSpinner.onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
            override fun onItemSelected(parent: AdapterView<*>, view: View?, pos: Int, id: Long) {
                if (AppConfig.ttsVoiceId != TtsVoices.idAt(pos)) {
                    AppConfig.ttsVoiceId = TtsVoices.idAt(pos)
                    AppConfig.save(this@MainActivity)
                    toast("音色已切换：${voices[pos].first}")
                }
            }

            override fun onNothingSelected(parent: AdapterView<*>) {}
        }

        findViewById<Button>(R.id.btn_tts_test).setOnClickListener {
            TtsSpeaker.init(this)
            toast("语音引擎加载中…")
            swTts.postDelayed({ TtsSpeaker.speak("我是椰果，这个音色你还喜欢吗？") }, 800)
        }

        findViewById<Button>(R.id.btn_notify_test).setOnClickListener {
            AlarmReceiver.postReminderNotification(this, "通知链路测试：能看到我说明通知没问题")
            toast("已发测试通知，下拉状态栏看看有没有")
        }

        findViewById<Button>(R.id.btn_reminder_test).setOnClickListener {
            val r = ReminderManager.add(
                this,
                "链路测试提醒（椰果应该会喊你）",
                System.currentTimeMillis() + 60_000
            )
            toast("已排 ${SimpleDateFormat("HH:mm", Locale.CHINA).format(Date(r.timeMillis))} 的测试提醒")
            refreshReminders()
        }

        findViewById<Button>(R.id.btn_reminder).setOnClickListener {
            val title = text(R.id.et_reminder_title)
            if (title.isEmpty()) {
                toast("先写提醒内容")
                return@setOnClickListener
            }
            val cal = Calendar.getInstance()
            TimePickerDialog(this, { _, h, m ->
                cal.set(Calendar.HOUR_OF_DAY, h)
                cal.set(Calendar.MINUTE, m)
                cal.set(Calendar.SECOND, 0)
                if (cal.timeInMillis <= System.currentTimeMillis()) cal.add(Calendar.DAY_OF_YEAR, 1)
                val r = ReminderManager.add(this, title, cal.timeInMillis)
                toast("好！${SimpleDateFormat("MM-dd HH:mm", Locale.CHINA).format(Date(r.timeMillis))} 我会喊你")
                refreshReminders()
            }, cal.get(Calendar.HOUR_OF_DAY), cal.get(Calendar.MINUTE), true).show()
        }
    }

    override fun onResume() {
        super.onResume()
        fillForm()
        refreshStatus()
        refreshReminders()
    }

    private fun text(id: Int) = findViewById<EditText>(id).text.toString().trim()

    private fun fillForm() {
        findViewById<EditText>(R.id.et_llm_base).setText(AppConfig.llmBaseUrl)
        findViewById<EditText>(R.id.et_llm_key).setText(AppConfig.llmApiKey)
        findViewById<EditText>(R.id.et_llm_model).setText(AppConfig.llmModel)
        findViewById<EditText>(R.id.et_hap_proxy).setText(AppConfig.hapProxyUrl)
        findViewById<EditText>(R.id.et_hap_base).setText(AppConfig.hapBaseUrl)
        findViewById<EditText>(R.id.et_hap_memory).setText(AppConfig.memoryWorksheetId)
    }

    private fun refreshStatus() {
        val am = getSystemService(ALARM_SERVICE) as AlarmManager
        val notifyOk = Build.VERSION.SDK_INT < 33 ||
            checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
        val micOk = checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
        val alarmOk = Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms()
        val next = ReminderManager.list(this).firstOrNull { it.timeMillis > System.currentTimeMillis() }
        val nextText = next?.let {
            SimpleDateFormat("MM-dd HH:mm", Locale.CHINA).format(Date(it.timeMillis)) + " " + it.title
        } ?: "无"
        tvStatus.text = "悬浮窗: ${ok(Settings.canDrawOverlays(this))}   通知: ${ok(notifyOk)}\n" +
            "麦克风: ${ok(micOk)}   精确闹钟: ${ok(alarmOk)}\n" +
            "椰果: ${if (FloatingPetService.running) "正在桌面上蹲着" else "还没放出来"}\n" +
            "模型: ${AppConfig.llmModel} @ ${AppConfig.llmBaseUrl}\n" +
            "语音播报: ${TtsSpeaker.statusText()}\n" +
            "上次闹钟: ${Diag.lastAlarm.ifBlank { "从未触发过" }}\n" +
            "下次提醒: $nextText" +
            if (CrashGuard.lastCrash.isNotBlank()) "\n⚠ 上次崩溃: ${CrashGuard.lastCrash}" else ""
    }

    private fun refreshReminders() {
        val fmt = SimpleDateFormat("MM-dd HH:mm", Locale.CHINA)
        val list = ReminderManager.list(this)
        tvReminders.text = if (list.isEmpty()) "（还没有提醒）"
        else "共 ${list.size} 条：\n" + list.joinToString("\n") {
            "· ${fmt.format(Date(it.timeMillis))}  ${it.title}"
        }
    }

    private fun ok(b: Boolean) = if (b) "✓" else "✗"

    private fun toast(s: String) = Toast.makeText(this, s, Toast.LENGTH_SHORT).show()
}
