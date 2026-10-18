package com.fsj.yeguo.voice

/**
 * MiniMax 系统音色预设（设置页下拉选择用）。
 * 想加新音色：往 PRESETS 里加一行「显示名 to voice_id」即可。
 * 萝莉/卡通系音色 ID 已于 2026-09-19 用真实接口逐个验证有效。
 */
object TtsVoices {
    val PRESETS: List<Pair<String, String>> = listOf(
        "动漫少女 · 漫画感" to "anime_girl",
        "萌萌女孩 · 软萌萝莉" to "cute_girl",
        "甜甜少女 · 奶甜系" to "sweet_girl",
        "可爱少女 · 元气系" to "lovely_girl",
        "少女音 · 经典俏皮" to "female-shaonv",
        "御姐音 · 温柔成熟" to "female-yujie",
        "萌萌男孩 · 小正太" to "cute_boy",
        "机灵男孩 · 鬼马精灵" to "clever_boy",
        "播音女声 · 端庄大方" to "presenter_female",
        "治愈女声 · 舒缓听书" to "audiobook_female_1",
        "青涩青年 · 干净男声" to "male-qn-qingse",
        "精英青年 · 沉稳男声" to "male-qn-jingying",
        "播音男声 · 磁性大气" to "presenter_male"
    )

    fun idAt(index: Int): String =
        PRESETS.getOrNull(index)?.second ?: "female-shaonv"
}
