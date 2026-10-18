package com.fsj.yeguo.pet

import android.view.View

/**
 * 宠物渲染器接口 —— Live2D 接入点。
 * v0.1 用 SimplePetRenderer（静态形象 + 补间动画）占位；
 * Live2D Cubism SDK for Android 集成后，实现 CubismPetRenderer 替换即可，上层（Service/聊天）零改动。
 */
interface PetRenderer {
    fun attach(view: View)
    fun startIdle()
    /** 情绪动作：happy / sleepy / notice ...（Live2D 对应 motion group） */
    fun playEmotion(name: String)
    fun destroy()
}
