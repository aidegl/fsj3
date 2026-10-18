package com.fsj.yeguo.bridge

import android.content.Context
import android.content.Intent
import android.media.projection.MediaProjectionManager
import android.os.Bundle
import androidx.appcompat.app.AppCompatActivity
import com.fsj.yeguo.floating.FloatingPetService

/**
 * 透明桥接页：替悬浮窗服务申请「屏幕录制」授权，拿到授权结果后交给服务截屏。
 * 只在用户点击 👁 按钮那一刻出现，绝无后台偷截。
 */
class ScreenCaptureActivity : AppCompatActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val mpm = getSystemService(MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
        startActivityForResult(mpm.createScreenCaptureIntent(), 4242)
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode == 4242 && resultCode == RESULT_OK && data != null) {
            FloatingPetService.instance?.beginScreenCapture(resultCode, data)
        }
        finish()
    }
}
