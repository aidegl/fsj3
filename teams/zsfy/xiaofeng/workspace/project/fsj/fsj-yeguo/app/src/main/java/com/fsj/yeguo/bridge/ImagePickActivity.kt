package com.fsj.yeguo.bridge

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity

/**
 * 透明桥接页：替悬浮窗服务打开系统相册选图，选完把 Uri 交回回调后立刻关闭。
 */
class ImagePickActivity : AppCompatActivity() {

    companion object {
        private var onPicked: ((Uri?) -> Unit)? = null

        fun launch(context: Context, callback: (Uri?) -> Unit) {
            onPicked = callback
            context.startActivity(
                Intent(context, ImagePickActivity::class.java)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            )
        }
    }

    private val picker = registerForActivityResult(
        ActivityResultContracts.PickVisualMedia()
    ) { uri ->
        onPicked?.invoke(uri)
        onPicked = null
        finish()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (onPicked == null) {
            finish()
            return
        }
        picker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
    }
}
