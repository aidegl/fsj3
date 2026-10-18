package com.fsj.yeguo.floating

import android.app.Service
import android.app.PendingIntent
import android.content.Intent
import android.content.pm.ServiceInfo
import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.hardware.display.DisplayManager
import android.media.ImageReader
import android.media.projection.MediaProjection
import android.media.projection.MediaProjectionManager
import android.net.Uri
import android.opengl.GLSurfaceView
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.os.IBinder
import android.os.Looper
import android.provider.Settings
import android.util.Log
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.widget.Toast
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import com.fsj.yeguo.AppChannels
import com.fsj.yeguo.CrashGuard
import com.fsj.yeguo.MainActivity
import com.fsj.yeguo.R
import com.fsj.yeguo.pet.PetRenderer
import com.fsj.yeguo.pet.SimplePetRenderer
import com.fsj.yeguo.pet.live2d.Live2DPetRenderer
import com.fsj.yeguo.pet.live2d.YeguoDelegate
import com.fsj.yeguo.pet.live2d.YeguoPal
import com.fsj.yeguo.util.ImageHelper
import com.fsj.yeguo.voice.TtsSpeaker
import java.io.ByteArrayOutputStream
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.math.abs

/**
 * 悬浮窗常驻服务：桌宠本体 + 聊天面板 + 读屏截屏。
 * 拖动 = 挪位置；单击 = 开/收聊天面板。
 */
class FloatingPetService : Service() {

    companion object {
        const val NOTIFICATION_ID = 100
        const val EXTRA_ANNOUNCE = "announce"
        const val EXTRA_PROJECTION_CODE = "projection_code"
        const val EXTRA_PROJECTION_DATA = "projection_data"

        @Volatile
        var running = false
            private set

        @Volatile
        var instance: FloatingPetService? = null
            private set
    }

    private val mainHandler = Handler(Looper.getMainLooper())

    private fun mainPost(block: () -> Unit) {
        mainHandler.post(block)
    }

    private lateinit var wm: WindowManager
    private var petView: View? = null
    private var petParams: WindowManager.LayoutParams? = null
    private var chat: ChatPanelController? = null
    private var renderer: PetRenderer? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.hasExtra(EXTRA_PROJECTION_CODE) == true) {
            val code = intent.getIntExtra(EXTRA_PROJECTION_CODE, -1)
            val data = intent.getParcelableExtra<Intent>(EXTRA_PROJECTION_DATA)
            if (data != null && code != -1) beginScreenCapture(code, data)
        }
        intent?.getStringExtra(EXTRA_ANNOUNCE)?.let { announceReminder(it) }
        return START_STICKY
    }

    override fun onCreate() {
        super.onCreate()
        CrashGuard.install(this)
        running = true
        TtsSpeaker.init(this) // 椰果开口说话用的引擎，随服务启动预热
        AppChannels.ensure(this)
        ServiceCompat.startForeground(this, NOTIFICATION_ID, buildNotification(), fgsType(false))

        wm = getSystemService(WINDOW_SERVICE) as WindowManager
        if (!Settings.canDrawOverlays(this)) {
            stopSelf()
            return
        }
        showPet()
        chat = ChatPanelController(this, wm)
        instance = this
    }

    private fun showPet() {
        val v = View.inflate(this, R.layout.view_pet, null)
        val size = (96 * resources.displayMetrics.density).toInt()
        val params = WindowManager.LayoutParams(
            size, size,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                or WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            x = 40
            y = 200
        }

        var downRawX = 0f
        var downRawY = 0f
        var startX = 0
        var startY = 0
        var moved = false
        v.setOnTouchListener { _, e ->
            when (e.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    downRawX = e.rawX; downRawY = e.rawY
                    startX = params.x; startY = params.y
                    moved = false
                    true
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = (e.rawX - downRawX).toInt()
                    val dy = (e.rawY - downRawY).toInt()
                    if (moved || abs(dx) > 8 || abs(dy) > 8) {
                        moved = true
                        params.x = startX + dx
                        params.y = startY + dy
                        runCatching { wm.updateViewLayout(v, params) }
                    }
                    true
                }
                MotionEvent.ACTION_UP -> {
                    if (!moved) toggleChat()
                    true
                }
                else -> false
            }
        }

        runCatching { wm.addView(v, params) }
        petView = v
        petParams = params
        renderer = createRenderer(v)
    }

    /** 优先 Live2D（Unity酱）；引擎加载失败时回退占位小椰子，保证宠物永远在 */
    private fun createRenderer(root: View): PetRenderer {
        val glView = root.findViewById<GLSurfaceView>(R.id.pet_gl)
        return try {
            YeguoPal.init(this)
            YeguoDelegate.ensureStartup()
            val l2d = Live2DPetRenderer(glView)
            root.findViewById<View>(R.id.pet_image).visibility = View.GONE
            glView.visibility = View.VISIBLE
            l2d.startIdle()
            Log.i("YeguoLive2D", "Live2D 渲染已启用")
            l2d
        } catch (e: Throwable) {
            Log.e("YeguoLive2D", "Live2D 启动失败，回退占位形象", e)
            glView.visibility = View.GONE
            root.findViewById<View>(R.id.pet_image).visibility = View.VISIBLE
            SimplePetRenderer().also {
                it.attach(root.findViewById(R.id.pet_image))
                it.startIdle()
            }
        }
    }

    private fun toggleChat() {
        renderer?.playEmotion("tap")
        val c = chat ?: return
        runCatching {
            if (c.isShowing) c.hide() else c.show()
        }.onFailure { e ->
            // 保险：面板出问题只提示，绝不让椰果整个消失
            Toast.makeText(this, "面板出错了: ${e.message}", Toast.LENGTH_LONG).show()
        }
    }

    /** 提醒到点：椰果弹开面板，用 AI 生成的人性化话术开口提醒 */
    fun announceReminder(title: String) {
        renderer?.playEmotion("notice")
        val c = chat ?: return
        if (!c.isShowing) c.show()
        c.announceReminder(title)
    }

    /** 🖼 主人发来图片：压缩 → 传中转站 → 椰果看图点评 */
    fun handlePickedImage(uri: Uri?) {
        if (uri == null) return
        val c = chat
        c?.show()
        c?.addSystemNote("🖼 收到图片，椰果正在看…")
        Thread {
            try {
                val bytes = ImageHelper.scaledJpegFromUri(this, uri)
                ImageHelper.uploadJpeg(this, bytes) { url, err ->
                    mainPost {
                        val panel = chat ?: return@mainPost
                        if (url != null) {
                            panel.askAboutImage(
                                url,
                                "主人发了一张图片给你，用椰果的口吻描述并点评一下，两三句话。"
                            )
                        } else {
                            panel.addSystemNote("图片上传失败：$err")
                        }
                    }
                }
            } catch (e: Throwable) {
                mainPost { chat?.addSystemNote("读图失败：${e.message}") }
            }
        }.start()
    }

    /** 👁 读屏：授权后单次截屏 → 传中转站 → M3 分析 → 椰果开口讲屏幕内容 */
    fun beginScreenCapture(resultCode: Int, data: Intent) {
        val c = chat
        c?.show()
        c?.addSystemNote("👁 好嘞，让我看看你的屏幕…")
        // 安卓 14+ 要求截屏期间前台服务挂 mediaProjection 类型
        runCatching {
            ServiceCompat.startForeground(this, NOTIFICATION_ID, buildNotification(), fgsType(true))
        }
        captureScreen(resultCode, data) { url, err ->
            mainPost {
                runCatching {
                    ServiceCompat.startForeground(this, NOTIFICATION_ID, buildNotification(), fgsType(false))
                }
                val panel = chat ?: return@mainPost
                if (url != null) {
                    panel.askAboutImage(
                        url,
                        "这是主人的手机屏幕截图。请用椰果的口吻说说屏幕上有什么内容，" +
                            "如果有需要主人注意的事项（未读消息、时间、任务等）就顺带提醒，两三句话。"
                    )
                } else {
                    panel.addSystemNote("截屏失败：$err")
                }
            }
        }
    }

    /** 单次截屏：投影 → 抓一帧 → 压缩上传，完事立刻停投影 */
    private fun captureScreen(resultCode: Int, data: Intent, done: (String?, String?) -> Unit) {
        try {
            val mpm = getSystemService(MEDIA_PROJECTION_SERVICE) as MediaProjectionManager
            val projection = mpm.getMediaProjection(resultCode, data)
            val metrics = resources.displayMetrics
            val width = metrics.widthPixels
            val height = metrics.heightPixels

            val thread = HandlerThread("yeguo-cap").apply { start() }
            val handler = Handler(thread.looper)
            val reader = ImageReader.newInstance(width, height, PixelFormat.RGBA_8888, 2)
            val captured = AtomicBoolean(false)
            val finished = AtomicBoolean(false)

            var vDisplay: android.hardware.display.VirtualDisplay? = null

            fun finishOnce(url: String?, err: String?) {
                if (finished.compareAndSet(false, true)) {
                    runCatching { vDisplay?.release() }
                    runCatching { reader.close() }
                    runCatching { projection.stop() }
                    thread.quitSafely()
                    done(url, err)
                }
            }

            reader.setOnImageAvailableListener({ r ->
                val image = r.acquireLatestImage()
                if (image == null || !captured.compareAndSet(false, true)) {
                    image?.close()
                    return@setOnImageAvailableListener
                }
                try {
                    val plane = image.planes[0]
                    val buffer = plane.buffer
                    buffer.rewind()
                    val paddedWidth = plane.rowStride / plane.pixelStride
                    val full = Bitmap.createBitmap(paddedWidth, height, Bitmap.Config.ARGB_8888)
                    full.copyPixelsFromBuffer(buffer)
                    val bitmap = Bitmap.createBitmap(full, 0, 0, width, height)
                    image.close()

                    val longSide = maxOf(bitmap.width, bitmap.height)
                    val scaled = if (longSide > 1280) {
                        val ratio = 1280f / longSide
                        Bitmap.createBitmap(
                            bitmap, 0, 0, bitmap.width, bitmap.height,
                            android.graphics.Matrix().apply { postScale(ratio, ratio) }, true
                        )
                    } else bitmap
                    val out = ByteArrayOutputStream()
                    scaled.compress(Bitmap.CompressFormat.JPEG, 82, out)

                    ImageHelper.uploadJpeg(this, out.toByteArray()) { url, err -> finishOnce(url, err) }
                } catch (e: Throwable) {
                    finishOnce(null, e.message)
                }
            }, handler)

            // 安卓 14+ 硬性要求：开投影前必须先注册回调管理资源，否则直接抛异常
            projection.registerCallback(object : MediaProjection.Callback() {
                override fun onStop() {
                    finishOnce(null, "屏幕投影已停止")
                }
            }, handler)

            vDisplay = projection.createVirtualDisplay(
                "yeguo-cap", width, height, metrics.densityDpi,
                DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR,
                reader.surface, null, handler
            )

            // 30 秒兜底：一直没画面就报失败
            handler.postDelayed({
                finishOnce(null, "等待屏幕画面超时")
            }, 30_000)
        } catch (e: Throwable) {
            done(null, e.message ?: "截屏初始化失败")
        }
    }

    private fun fgsType(withProjection: Boolean): Int {
        var t = 0
        if (Build.VERSION.SDK_INT >= 34) {
            t = t or ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
        }
        if (withProjection && Build.VERSION.SDK_INT >= 29) {
            t = t or ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROJECTION
        }
        return t
    }

    override fun onDestroy() {
        running = false
        instance = null
        renderer?.destroy()
        renderer = null
        petView?.let { runCatching { wm.removeView(it) } }
        petView = null
        petParams = null
        chat?.hide()
        chat = null
        TtsSpeaker.shutdown()
        super.onDestroy()
    }

    private fun buildNotification() =
        NotificationCompat.Builder(this, AppChannels.SERVICE)
            .setSmallIcon(R.drawable.ic_pet)
            .setContentTitle("椰果在你桌面上蹲着呢")
            .setContentText("点这里回到设置页")
            .setContentIntent(
                PendingIntent.getActivity(
                    this, 0,
                    Intent(this, MainActivity::class.java),
                    PendingIntent.FLAG_IMMUTABLE
                )
            )
            .setOngoing(true)
            .build()
}
