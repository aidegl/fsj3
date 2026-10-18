package com.fsj.yeguo.pet

import android.animation.ValueAnimator
import android.view.View
import android.view.animation.AccelerateDecelerateInterpolator
import android.view.animation.OvershootInterpolator
import kotlin.math.abs
import kotlin.math.sin

/**
 * v0.1 占位渲染：呼吸缩放（待机）+ 弹跳旋转（情绪）。
 * 换 Live2D 时整个类替换为 CubismPetRenderer，接口不变。
 */
class SimplePetRenderer : PetRenderer {

    private var view: View? = null
    private var breathe: ValueAnimator? = null

    override fun attach(view: View) {
        this.view = view
        view.scaleX = 1f
        view.scaleY = 1f
    }

    override fun startIdle() {
        val v = view ?: return
        breathe?.cancel()
        breathe = ValueAnimator.ofFloat(1f, 1.06f, 1f).apply {
            duration = 2400
            repeatCount = ValueAnimator.INFINITE
            interpolator = AccelerateDecelerateInterpolator()
            addUpdateListener { a ->
                val s = a.animatedValue as Float
                v.scaleX = s
                v.scaleY = s
            }
            start()
        }
    }

    override fun playEmotion(name: String) {
        val v = view ?: return
        ValueAnimator.ofFloat(0f, 1f).apply {
            duration = 550
            interpolator = OvershootInterpolator()
            addUpdateListener { t ->
                val p = t.animatedValue as Float
                v.translationY = (sin(p * Math.PI) * -18f).toFloat()
                v.rotation = (sin(p * Math.PI * 2) * 10f).toFloat()
            }
            start()
        }
    }

    override fun destroy() {
        breathe?.cancel()
        breathe = null
        view = null
    }
}
