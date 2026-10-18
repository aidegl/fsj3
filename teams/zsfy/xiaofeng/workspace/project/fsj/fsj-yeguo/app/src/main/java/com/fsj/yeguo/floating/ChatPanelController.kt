package com.fsj.yeguo.floating

import android.content.Context
import android.graphics.PixelFormat
import android.os.Handler
import android.os.Looper
import android.view.ContextThemeWrapper
import android.view.Gravity
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.core.content.ContextCompat
import com.fsj.yeguo.R
import com.fsj.yeguo.ai.AssistantBrain
import com.fsj.yeguo.config.AppConfig
import com.fsj.yeguo.voice.TtsSpeaker
import kotlin.math.min

/**
 * 聊天面板：吸附屏幕底部居中。
 * 折叠态只露最近两条消息；点「查看更多」展开全部，展开高度最高为屏幕 3/4。
 */
class ChatPanelController(private val context: Context, private val wm: WindowManager) {

    private val main = Handler(Looper.getMainLooper())
    private var panel: View? = null
    private var messagesBox: LinearLayout? = null
    private var scroll: ScrollView? = null
    private var input: EditText? = null
    private var moreButton: TextView? = null
    private val bubbles = ArrayList<TextView>()
    private var expanded = false

    val isShowing: Boolean get() = panel != null

    fun show() {
        if (panel != null) return
        val dm = context.resources.displayMetrics
        val params = WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.WRAP_CONTENT,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL
            y = (20 * dm.density).toInt() // 距底部 20dp，避开手势条
        }

        // Service 上下文不带 Material 主题，inflate 前包一层
        val themed = ContextThemeWrapper(context, R.style.Theme_Yeguo)
        val v = try {
            LayoutInflater.from(themed).inflate(R.layout.panel_chat, null)
        } catch (e: Exception) {
            Toast.makeText(context, "面板创建失败: ${e.message}", Toast.LENGTH_LONG).show()
            return
        }
        messagesBox = v.findViewById(R.id.msg_box)
        scroll = v.findViewById(R.id.msg_scroll)
        input = v.findViewById(R.id.msg_input)
        moreButton = v.findViewById(R.id.btn_more)
        moreButton?.setOnClickListener { toggleExpand() }
        v.findViewById<View>(R.id.btn_close).setOnClickListener { hide() }
        v.findViewById<View>(R.id.btn_send).setOnClickListener { send() }
        v.findViewById<View>(R.id.btn_gallery).setOnClickListener {
            com.fsj.yeguo.bridge.ImagePickActivity.launch(context) { uri ->
                FloatingPetService.instance?.handlePickedImage(uri)
            }
        }
        v.findViewById<View>(R.id.btn_screen).setOnClickListener {
            context.startActivity(
                android.content.Intent(context, com.fsj.yeguo.bridge.ScreenCaptureActivity::class.java)
                    .addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
            )
        }

        addBubble("我是椰果！有事叫我，没事也可以找我唠两句~", false)
        reflow()
        runCatching { wm.addView(v, params) }
        panel = v
    }

    fun hide() {
        TtsSpeaker.stop() // 收起面板就别念了
        panel?.let { runCatching { wm.removeView(it) } }
        panel = null
        messagesBox = null
        scroll = null
        input = null
        bubbles.clear()
        expanded = false
    }

    /** 椰果主动说的系统/进度类消息（不算对话内容） */
    fun addSystemNote(text: String) {
        addBubble(text, false)
    }

    /** 视觉对话：把图 URL + 指令交给大脑，回复进面板 + 语音播报 */
    fun askAboutImage(imageUrl: String, prompt: String) {
        AssistantBrain.vision(prompt, imageUrl) { reply, isError ->
            addBubble(reply, false)
            if (!isError && AppConfig.ttsEnabled) TtsSpeaker.speak(reply)
        }
    }

    /** 提醒到点：确保面板打开，让椰果用 AI 生成的人性化话术开口提醒 */
    fun announceReminder(title: String) {
        if (!isShowing) show()
        AssistantBrain.remind(title) { reply, isError ->
            addBubble(reply, false)
            if (!isError && AppConfig.ttsEnabled) TtsSpeaker.speak(reply)
        }
    }

    private fun send() {
        val et = input ?: return
        val text = et.text.toString().trim()
        if (text.isEmpty()) return
        et.setText("")
        addBubble(text, true)
        AssistantBrain.send(text) { reply, isError ->
            addBubble(reply, false)
            if (!isError && AppConfig.ttsEnabled) TtsSpeaker.speak(reply)
        }
    }

    private fun addBubble(text: String, fromUser: Boolean) {
        val box = messagesBox ?: return
        val tv = TextView(context)
        tv.text = text
        tv.textSize = 14f
        tv.setTextIsSelectable(true) // 长按可复制：方便把报错原文发给技术支持（也就是我）
        tv.setLineSpacing(0f, 1.1f)
        tv.setPadding(dp(10), dp(7), dp(10), dp(7))
        tv.background = ContextCompat.getDrawable(
            context,
            if (fromUser) R.drawable.bg_bubble_user else R.drawable.bg_bubble_bot
        )
        tv.setTextColor(if (fromUser) 0xFF4E342E.toInt() else 0xFF3E2723.toInt())
        val lp = LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.WRAP_CONTENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        )
        lp.topMargin = dp(6)
        lp.gravity = if (fromUser) Gravity.END else Gravity.START
        box.addView(tv, lp)
        bubbles.add(tv)
        reflow()
    }

    /** 折叠/展开的重排版：折叠只露最近两条；展开全显但最高屏幕 3/4 */
    private fun reflow() {
        val box = messagesBox ?: return
        val sc = scroll ?: return
        if (expanded) {
            bubbles.forEach { it.visibility = View.VISIBLE }
            box.measure(
                View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED),
                View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED)
            )
            val maxH = (context.resources.displayMetrics.heightPixels * 3 / 4f).toInt()
            sc.layoutParams.height = minOf(box.measuredHeight + dp(24), maxH)
            sc.requestLayout()
        } else {
            val keep = 2
            for (i in 0 until maxOf(0, bubbles.size - keep)) bubbles[i].visibility = View.GONE
            for (i in maxOf(0, bubbles.size - keep) until bubbles.size) bubbles[i].visibility = View.VISIBLE
            sc.layoutParams.height = ViewGroup.LayoutParams.WRAP_CONTENT
            sc.requestLayout()
            moreButton?.visibility = if (bubbles.size > keep) View.VISIBLE else View.GONE
            moreButton?.text = "↑ 查看更多（${bubbles.size - keep} 条）"
        }
        sc.post { sc.fullScroll(View.FOCUS_DOWN) }
    }

    private fun toggleExpand() {
        expanded = !expanded
        reflow()
    }

    private fun dp(v: Int) = (v * context.resources.displayMetrics.density).toInt()
}
