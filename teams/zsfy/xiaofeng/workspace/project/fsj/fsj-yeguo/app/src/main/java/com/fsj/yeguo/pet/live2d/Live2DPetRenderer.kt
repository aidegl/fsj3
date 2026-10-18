package com.fsj.yeguo.pet.live2d

import android.graphics.PixelFormat
import android.opengl.GLSurfaceView
import android.view.View
import com.fsj.yeguo.pet.PetRenderer

/**
 * Live2D 版宠物渲染器（替换 SimplePetRenderer 的占位形象）。
 * 传入的 view 必须是 GLSurfaceView（view_pet.xml 里的 pet_gl）。
 */
class Live2DPetRenderer(private val glView: GLSurfaceView) : PetRenderer {

    init {
        // 全透明 GL 表面，让模型直接悬浮在桌面壁纸/应用之上
        glView.setZOrderOnTop(true)
        glView.setEGLConfigChooser(8, 8, 8, 8, 16, 0)
        glView.holder.setFormat(PixelFormat.TRANSLUCENT)
        glView.setEGLContextClientVersion(2)
        glView.setRenderer(YeguoDelegate)
        glView.renderMode = GLSurfaceView.RENDERMODE_CONTINUOUSLY
    }

    override fun attach(view: View) {
        // GLSurfaceView 自身即渲染载体，无需附加处理
    }

    override fun startIdle() {
        glView.onResume()
    }

    override fun playEmotion(name: String) {
        when (name) {
            "notice", "happy" -> YeguoManager.playGroup(YeguoModel.GROUP_SHAKE)
            "tap" -> YeguoManager.playGroup(YeguoModel.GROUP_TAP)
            else -> YeguoManager.playGroup(YeguoModel.GROUP_TAP)
        }
    }

    override fun destroy() {
        glView.onPause()
    }
}
