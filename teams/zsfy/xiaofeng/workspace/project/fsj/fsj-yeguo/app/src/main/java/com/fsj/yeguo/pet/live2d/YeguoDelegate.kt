package com.fsj.yeguo.pet.live2d

import android.opengl.GLES20
import android.opengl.GLSurfaceView
import com.live2d.sdk.cubism.framework.CubismFramework
import com.live2d.sdk.cubism.framework.CubismFrameworkConfig
import com.live2d.sdk.cubism.framework.rendering.android.CubismShaderAndroid
import javax.microedition.khronos.egl.EGLConfig
import javax.microedition.khronos.opengles.GL10

/**
 * GL 渲染主循环 + CubismFramework 生命周期。对齐官方 LAppMinimumDelegate + GLRendererMinimum。
 * 背景清成全透明：让 Unity酱「浮」在桌面上而不是一块色板里。
 */
object YeguoDelegate : GLSurfaceView.Renderer {

    var windowWidth = 0
        private set
    var windowHeight = 0
        private set

    private var textureManager: YeguoTextureManager? = null

    @Volatile
    private var frameworkStarted = false

    /** 必须在创建模型前调用一次（幂等） */
    fun ensureStartup() {
        if (frameworkStarted) return
        val option = CubismFramework.Option()
        option.logFunction = YeguoPal.PrintLogFunction()
        option.loggingLevel = CubismFrameworkConfig.LogLevel.VERBOSE
        option.loadFileFunction = YeguoPal.LoadFileFunction()
        CubismFramework.cleanUp()
        CubismFramework.startUp(option)
        frameworkStarted = true
    }

    fun textureManager(): YeguoTextureManager {
        if (textureManager == null) textureManager = YeguoTextureManager()
        return textureManager!!
    }

    override fun onSurfaceCreated(gl: GL10?, config: EGLConfig?) {
        // 纹理采样
        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MAG_FILTER, GLES20.GL_LINEAR)
        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_LINEAR)
        // 透明混合
        GLES20.glEnable(GLES20.GL_BLEND)
        GLES20.glBlendFunc(GLES20.GL_SRC_ALPHA, GLES20.GL_ONE_MINUS_SRC_ALPHA)

        YeguoPal.updateTime()

        if (!CubismFramework.isInitialized()) {
            CubismFramework.initialize()
        }

        // GL 上下文失效后的资源重建
        textureManager?.releaseInvalidTextures()
        CubismShaderAndroid.getInstance().releaseInvalidShaderProgram()
        CubismShaderAndroid.deleteInstance()

        if (!YeguoManager.hasModel()) {
            YeguoManager.loadModel()
        } else {
            YeguoManager.reloadRenderer()
        }
    }

    override fun onSurfaceChanged(gl: GL10?, width: Int, height: Int) {
        GLES20.glViewport(0, 0, width, height)
        windowWidth = width
        windowHeight = height
        YeguoManager.setRenderTargetSize(width, height)
    }

    override fun onDrawFrame(gl: GL10?) {
        YeguoPal.updateTime()
        // 全透明清屏：只留模型本身悬浮在桌面上
        GLES20.glClearColor(0f, 0f, 0f, 0f)
        GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT or GLES20.GL_DEPTH_BUFFER_BIT)
        GLES20.glClearDepthf(1.0f)
        YeguoManager.onUpdate()
    }
}
