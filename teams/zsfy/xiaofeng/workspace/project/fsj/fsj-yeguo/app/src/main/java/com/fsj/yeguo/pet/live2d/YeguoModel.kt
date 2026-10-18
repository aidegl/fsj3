package com.fsj.yeguo.pet.live2d

import com.live2d.sdk.cubism.framework.CubismDefaultParameterId
import com.live2d.sdk.cubism.framework.CubismFramework
import com.live2d.sdk.cubism.framework.CubismModelSettingJson
import com.live2d.sdk.cubism.framework.ICubismModelSetting
import com.live2d.sdk.cubism.framework.id.CubismId
import com.live2d.sdk.cubism.framework.id.CubismIdManager
import com.live2d.sdk.cubism.framework.math.CubismMatrix44
import com.live2d.sdk.cubism.framework.model.CubismUserModel
import com.live2d.sdk.cubism.framework.motion.ACubismMotion
import com.live2d.sdk.cubism.framework.motion.CubismExpressionMotion
import com.live2d.sdk.cubism.framework.motion.CubismExpressionUpdater
import com.live2d.sdk.cubism.framework.effect.CubismLook
import com.live2d.sdk.cubism.framework.motion.CubismLookUpdater
import com.live2d.sdk.cubism.framework.motion.CubismMotion
import com.live2d.sdk.cubism.framework.motion.CubismPhysicsUpdater
import com.live2d.sdk.cubism.framework.motion.CubismPoseUpdater
import com.live2d.sdk.cubism.framework.rendering.android.CubismRendererAndroid
import kotlin.random.Random

/** 动作优先级（对齐官方 LAppDefine.Priority） */
object MotionPriority {
    const val IDLE = 1
    const val NORMAL = 2
    const val FORCE = 3
}

/**
 * Unity酱模型：加载 assets、驱动动作/物理/眨眼、绘制。
 * 对齐官方 LAppMinimumModel（顺手修了它 startMotion 里加载条件写反的小毛病）。
 */
class YeguoModel(modelDirName: String) : CubismUserModel() {

    private val idManager: CubismIdManager = CubismFramework.getIdManager()
    private val idParamAngleX = idManager.getId(CubismDefaultParameterId.ParameterId.ANGLE_X.id)
    private val idParamAngleY = idManager.getId(CubismDefaultParameterId.ParameterId.ANGLE_Y.id)
    private val idParamAngleZ = idManager.getId(CubismDefaultParameterId.ParameterId.ANGLE_Z.id)
    private val idParamBodyAngleX = idManager.getId(CubismDefaultParameterId.ParameterId.BODY_ANGLE_X.id)
    private val idParamEyeBallX = idManager.getId(CubismDefaultParameterId.ParameterId.EYE_BALL_X.id)
    private val idParamEyeBallY = idManager.getId(CubismDefaultParameterId.ParameterId.EYE_BALL_Y.id)

    private var modelSetting: ICubismModelSetting? = null
    private var modelHomeDirectory: String = modelDirName
    private var userTimeSeconds = 0.0f
    private var motionUpdated = false

    private val eyeBlinkIds = ArrayList<CubismId>()
    private val lipSyncIds = ArrayList<CubismId>()
    private val motions = HashMap<String, ACubismMotion>()
    private val expressions = HashMap<String, ACubismMotion>()

    fun loadAssets(dir: String, fileName: String) {
        modelHomeDirectory = dir
        setupModel(dir + fileName)

        val renderer = CubismRendererAndroid.create(
            YeguoDelegate.windowWidth,
            YeguoDelegate.windowHeight
        )
        setupRenderer(renderer)
        setupTextures()
    }

    /** GL 上下文被回收后重建渲染器 */
    fun reloadRenderer() {
        deleteRenderer()
        val renderer = CubismRendererAndroid.create(
            YeguoDelegate.windowWidth,
            YeguoDelegate.windowHeight
        )
        setupRenderer(renderer)
        setupTextures()
    }

    /** 释放模型（GL 上下文销毁或退出时调用） */
    fun deleteModel() {
        delete()
    }

    fun update() {
        isUpdated(false)

        val deltaTimeSeconds = YeguoPal.deltaTime
        userTimeSeconds += deltaTimeSeconds
        motionUpdated = false

        model.loadParameters()

        if (motionManager.isFinished()) {
            startRandomMotion(GROUP_IDLE, MotionPriority.IDLE)
        } else {
            motionUpdated = motionManager.updateMotion(model, deltaTimeSeconds)
        }

        model.saveParameters()
        updateScheduler.onLateUpdate(model, deltaTimeSeconds)
        model.update()
        isUpdated(true)
    }

    fun draw(matrix: CubismMatrix44) {
        if (model == null) return
        CubismMatrix44.multiply(modelMatrix.getArray(), matrix.getArray(), matrix.getArray())
        val renderer = getRenderer() as CubismRendererAndroid
        renderer.setMvpMatrix(matrix)
        renderer.drawModel()
    }

    /** 播放某动作组里的随机一个（Idle 待机 / Tap 点击 / Shake 摇晃…） */
    fun startRandomMotion(group: String, priority: Int = MotionPriority.NORMAL): Int {
        val count = modelSetting?.getMotionCount(group) ?: 0
        if (count == 0) return -1
        return startMotion(group, Random.nextInt(count), priority)
    }

    fun startMotion(group: String, number: Int, priority: Int): Int {
        if (priority == MotionPriority.FORCE) {
            motionManager.setReservationPriority(priority)
        } else if (!motionManager.reserveMotion(priority)) {
            return -1
        }

        val fileName = modelSetting?.getMotionFileName(group, number) ?: ""
        val name = group + "_" + number
        var motion = motions[name] as? CubismMotion

        if (motion == null && fileName.isNotEmpty()) {
            val buffer = YeguoPal.loadFileAsBytes(modelHomeDirectory + fileName)
            val tmp = loadMotion(buffer) as? CubismMotion
            if (tmp != null) {
                motion = tmp
                val fadeIn = modelSetting?.getMotionFadeInTimeValue(group, number) ?: -1.0f
                if (fadeIn != -1.0f) motion.setFadeInTime(fadeIn)
                val fadeOut = modelSetting?.getMotionFadeOutTimeValue(group, number) ?: -1.0f
                if (fadeOut != -1.0f) motion.setFadeOutTime(fadeOut)
            }
        }
        return motionManager.startMotionPriority(motion, priority)
    }

    // ---------- 内部：从 model3.json 建模 ----------

    private fun setupModel(model3JsonPath: String) {
        val model3Json = YeguoPal.loadFileAsBytes(model3JsonPath)
        val setting = CubismModelSettingJson(model3Json)
        modelSetting = setting

        if (setting.getJson() == null) {
            error("model3.json 读取失败: $model3JsonPath")
        }

        // 模型本体
        setting.getModelFileName().takeIf { it.isNotEmpty() }?.let { path ->
            val buffer = YeguoPal.loadFileAsBytes(modelHomeDirectory + path)
            loadModel(buffer, mocConsistency)
        }

        // 表情
        if (setting.getExpressionCount() > 0) {
            for (i in 0 until setting.getExpressionCount()) {
                val name = setting.getExpressionName(i)
                val path = setting.getExpressionFileName(i)
                val buffer = YeguoPal.loadFileAsBytes(modelHomeDirectory + path)
                val motion = loadExpression(buffer) as? CubismExpressionMotion ?: continue
                expressions[name] = motion
            }
            updateScheduler.addUpdatableList(CubismExpressionUpdater(expressionManager))
        }

        // 姿势
        setting.getPoseFileName().takeIf { it.isNotEmpty() }?.let { path ->
            val buffer = YeguoPal.loadFileAsBytes(modelHomeDirectory + path)
            loadPose(buffer)
        }
        pose?.let { updateScheduler.addUpdatableList(CubismPoseUpdater(it)) }

        // 物理（头发衣袖飘飘）
        setting.getPhysicsFileName().takeIf { it.isNotEmpty() }?.let { path ->
            val buffer = YeguoPal.loadFileAsBytes(modelHomeDirectory + path)
            loadPhysics(buffer)
        }
        physics?.let { updateScheduler.addUpdatableList(CubismPhysicsUpdater(it)) }

        // 用户数据（该模型没有，走通用流程）
        setting.getUserDataFile().takeIf { it.isNotEmpty() }?.let { path ->
            val buffer = YeguoPal.loadFileAsBytes(modelHomeDirectory + path)
            loadUserData(buffer)
        }

        // 视线跟随（拖动时眼睛身体微微转向）
        val look = CubismLook.create()
        look.setParameters(
            listOf(
                CubismLook.LookParameterData(idParamAngleX, 30.0f),
                CubismLook.LookParameterData(idParamAngleY, 0.0f, 30.0f),
                CubismLook.LookParameterData(idParamAngleZ, 0.0f, 0.0f, -30.0f),
                CubismLook.LookParameterData(idParamBodyAngleX, 10.0f),
                CubismLook.LookParameterData(idParamEyeBallX, 1.0f),
                CubismLook.LookParameterData(idParamEyeBallY, 0.0f, 1.0f)
            )
        )
        updateScheduler.addUpdatableList(CubismLookUpdater(look, dragManager))
        updateScheduler.sortUpdatableList()

        // 布局信息 → 模型矩阵
        val layout = HashMap<String, Float>()
        if (setting.getLayoutMap(layout)) {
            modelMatrix.setupFromLayout(layout)
        }
        model.saveParameters()

        // 预加载所有动作组
        for (i in 0 until setting.getMotionGroupCount()) {
            preLoadMotionGroup(setting.getMotionGroupName(i))
        }
        motionManager.stopAllMotions()
    }

    private fun preLoadMotionGroup(group: String) {
        val setting = modelSetting ?: return
        val count = setting.getMotionCount(group)
        for (i in 0 until count) {
            val name = group + "_" + i
            val path = setting.getMotionFileName(group, i)
            if (path.isEmpty()) continue

            val buffer = YeguoPal.loadFileAsBytes(modelHomeDirectory + path)
            val tmp = loadMotion(buffer) as? CubismMotion ?: continue
            val fadeIn = setting.getMotionFadeInTimeValue(group, i)
            if (fadeIn != -1.0f) tmp.setFadeInTime(fadeIn)
            val fadeOut = setting.getMotionFadeOutTimeValue(group, i)
            if (fadeOut != -1.0f) tmp.setFadeOutTime(fadeOut)
            tmp.setEffectIds(eyeBlinkIds, lipSyncIds)
            motions[name] = tmp
        }
    }

    private fun setupTextures() {
        val setting = modelSetting ?: return
        for (i in 0 until setting.getTextureCount()) {
            val texturePath = setting.getTextureFileName(i)
            if (texturePath.isEmpty()) continue

            val info = YeguoDelegate.textureManager().createTextureFromPngFile(
                modelHomeDirectory + texturePath
            )
            (getRenderer() as CubismRendererAndroid).bindTexture(i, info.id)
            (getRenderer() as CubismRendererAndroid).isPremultipliedAlpha(true)
        }
    }

    companion object {
        const val GROUP_IDLE = "Idle"
        const val GROUP_TAP = "Tap"
        const val GROUP_SHAKE = "Shake"
    }
}
