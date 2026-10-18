package com.fsj.yeguo.pet.live2d

import android.graphics.BitmapFactory
import android.opengl.GLES20
import android.opengl.GLUtils

/**
 * 贴图管理：把 assets 里的 PNG 装进 OpenGL 纹理。对齐官方 LAppMinimumTextureManager。
 */
class YeguoTextureManager {

    data class TextureInfo(val id: Int, val width: Int, val height: Int, val filePath: String)

    private val textures = ArrayList<TextureInfo>()

    fun createTextureFromPngFile(filePath: String): TextureInfo {
        textures.firstOrNull { it.filePath == filePath }?.let { return it }

        val ctx = YeguoPal.context() ?: error("YeguoPal 尚未初始化")
        val bitmap = ctx.assets.open(filePath).use { stream ->
            val options = BitmapFactory.Options().apply { inPremultiplied = true }
            BitmapFactory.decodeStream(stream, null, options)
                ?: error("贴图解码失败: $filePath")
        }

        GLES20.glActiveTexture(GLES20.GL_TEXTURE0)
        val texIds = IntArray(1)
        GLES20.glGenTextures(1, texIds, 0)
        GLES20.glBindTexture(GLES20.GL_TEXTURE_2D, texIds[0])
        GLUtils.texImage2D(GLES20.GL_TEXTURE_2D, 0, bitmap, 0)
        GLES20.glGenerateMipmap(GLES20.GL_TEXTURE_2D)
        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MIN_FILTER, GLES20.GL_LINEAR_MIPMAP_LINEAR)
        GLES20.glTexParameteri(GLES20.GL_TEXTURE_2D, GLES20.GL_TEXTURE_MAG_FILTER, GLES20.GL_LINEAR)

        val info = TextureInfo(texIds[0], bitmap.width, bitmap.height, filePath)
        textures.add(info)
        bitmap.recycle()
        return info
    }

    /** GL 上下文销毁后调用：清掉失效的纹理记录 */
    fun releaseInvalidTextures() {
        textures.clear()
    }
}
