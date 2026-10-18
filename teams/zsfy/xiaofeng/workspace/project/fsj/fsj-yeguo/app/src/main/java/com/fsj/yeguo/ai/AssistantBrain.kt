package com.fsj.yeguo.ai

import com.fsj.yeguo.config.AppConfig
import com.fsj.yeguo.hap.HapClient
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * 椰果的大脑。
 * v0.1：内置人设 + 会话内短期记忆（最近 20 条）；配置了 HAP 记忆表则把对话异步写入 HAP。
 * 后续：人设与长期记忆改为从 HAP 拉取（对齐团队椰果的人设），对话前检索注入。
 */
object AssistantBrain {

    private const val MAX_HISTORY = 20

    private var history = JSONArray()
    private val llm = LlmClient()
    private val hap = HapClient()

    fun interface ReplyCallback {
        fun onReply(text: String, isError: Boolean)
    }

    fun send(userText: String, cb: ReplyCallback) {
        history.put(msg("user", userText))
        trim()
        val messages = JSONArray().put(systemPrompt())
        for (i in 0 until history.length()) {
            messages.put(history.optJSONObject(i))
        }

        llm.chat(messages) { reply, err ->
            if (reply != null) {
                history.put(msg("assistant", reply))
                trim()
                syncMemoryAsync(userText, reply)
                cb.onReply(reply, false)
            } else {
                cb.onReply("我走神了…（$err）", true)
            }
        }
    }

    /** 清空会话记忆（长按聊天面板标题可触发，后续接 UI） */
    fun reset() {
        history = JSONArray()
    }

    /**
     * 提醒到点：让椰果用 AI 生成的人性化口吻提醒主人（带情绪价值）。
     * 指令本身不作为用户发言记入历史；模型异常时也有兜底文案，事一定要说到。
     */
    fun remind(reminderTitle: String, cb: ReplyCallback) {
        val messages = JSONArray()
            .put(systemPrompt())
            .put(
                msg(
                    "user",
                    "【系统提醒任务】到时间了，提醒事项：「$reminderTitle」。" +
                        "请用椰果的口吻提醒主人这件事：一两句话，先说事，再带一点情绪价值" +
                        "（俏皮/关心/鼓励均可），别说教、不啰嗦。"
                )
            )
        llm.chat(messages) { reply, err ->
            if (reply != null) {
                history.put(msg("assistant", reply))
                trim()
                cb.onReply(reply, false)
            } else {
                cb.onReply("到点啦！别忘了：「$reminderTitle」（我刚才走了个神，先这么喊你一声）", true)
            }
        }
    }

    /**
     * 视觉对话：椰果看图说话（发图片 / 读屏共用）。
     * 不把带图消息写进历史（省流量），只记录椰果的回答。
     */
    fun vision(userText: String, imageUrl: String, cb: ReplyCallback) {
        val content = JSONArray()
            .put(JSONObject().put("type", "text").put("text", userText))
            .put(
                JSONObject()
                    .put("type", "image_url")
                    .put("image_url", JSONObject().put("url", imageUrl))
            )
        val messages = JSONArray()
            .put(systemPrompt())
            .put(JSONObject().put("role", "user").put("content", content))

        llm.chatRaw(messages, AppConfig.visionModel) { reply, err ->
            if (reply != null) {
                history.put(msg("assistant", reply))
                trim()
                cb.onReply(reply, false)
            } else {
                cb.onReply("这张图我暂时看不清…（$err）", true)
            }
        }
    }

    private fun msg(role: String, content: String) =
        JSONObject().put("role", role).put("content", content)

    private fun trim() {
        while (history.length() > MAX_HISTORY) history.remove(0)
    }

    private fun systemPrompt(): JSONObject {
        val persona = "你是「椰果」，一颗蹲在主人手机桌面上的小椰果宠物助手。" +
            "性格活泼、嘴甜、有点贪吃爱睡觉。职责：陪主人聊天；主人交代事项时帮忙确认和打气" +
            "（实际提醒由系统闹钟负责，你负责口头确认）。" +
            "说话方式：中文口语、短句（最多3句）、可以带少量表情符号；不说教、不啰嗦。"
        val now = SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.CHINA).format(Date())
        return msg("system", "$persona\n当前时间：$now")
    }

    /** 对话记忆写入 HAP（未配置记忆表则跳过；字段名待「椰果记忆表」建好后统一对齐） */
    private fun syncMemoryAsync(userText: String, reply: String) {
        val ws = AppConfig.memoryWorksheetId.trim()
        if (ws.isEmpty()) return
        hap.addRecord(
            ws,
            JSONObject()
                .put("mingcheng", "对话 " + SimpleDateFormat("MM-dd HH:mm", Locale.CHINA).format(Date()))
                .put("beizhu", "主人：$userText\n椰果：$reply")
        ) { _, _, _ -> }
    }
}
