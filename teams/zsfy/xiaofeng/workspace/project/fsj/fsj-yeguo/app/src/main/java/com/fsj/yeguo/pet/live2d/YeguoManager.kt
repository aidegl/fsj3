package com.fsj.yeguo.pet.live2d

import com.live2d.sdk.cubism.framework.math.CubismMatrix44
import com.live2d.sdk.cubism.framework.rendering.android.CubismOffscreenManagerAndroid

/**
 * 模型管家：持有 Unity酱，负责每帧的投影计算 + 更新 + 绘制。对齐官方 LAppMinimumLive2DManager。
 */
object YeguoManager {

    const val MODEL_DIR = "unitychan"

    private var model: YeguoModel? = null
    private val viewMatrix = CubismMatrix44.create()
    private val projection = CubismMatrix44.create()

    fun loadModel() {
        model = YeguoModel("$MODEL_DIR/").also {
            it.loadAssets("$MODEL_DIR/", "$MODEL_DIR.model3.json")
        }
    }

    fun hasModel(): Boolean = model != null

    fun reloadRenderer() {
        model?.reloadRenderer()
    }

    fun setRenderTargetSize(width: Int, height: Int) {
        model?.setRenderTargetSize(width, height)
    }

    fun onUpdate() {
        val m = model ?: return
        val width = YeguoDelegate.windowWidth
        val height = YeguoDelegate.windowHeight
        if (width == 0 || height == 0) return

        val aspectRatio = width.toFloat() / height
        val displayRatio = height.toFloat() / width

        CubismOffscreenManagerAndroid.getInstance().beginFrameProcess()

        projection.loadIdentity()

        val canvasRatio = m.getModel().getCanvasHeight() / m.getModel().getCanvasWidth()
        if (canvasRatio < displayRatio) {
            // 横长模型：按宽对齐
            m.getModelMatrix().setWidth(2.0f)
            projection.scale(1.0f, aspectRatio)
        } else {
            // 纵长模型：按高对齐
            m.getModelMatrix().setHeight(2.0f)
            projection.scale(1.0f / aspectRatio, 1.0f)
        }

        viewMatrix.multiplyByMatrix(projection)

        m.update()
        m.draw(projection)

        CubismOffscreenManagerAndroid.getInstance().endFrameProcess()
        CubismOffscreenManagerAndroid.getInstance().releaseStaleRenderTextures()
    }

    fun playGroup(group: String) {
        model?.startRandomMotion(group, MotionPriority.NORMAL)
    }

    fun release() {
        model?.deleteModel()
        model = null
        CubismOffscreenManagerAndroid.releaseInstance()
    }
}
