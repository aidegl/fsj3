---
title: FrameRonin 精灵图素材使用方法
source: https://ecnsdywqvryv.feishu.cn/wiki/space/7697792408464968715
obj_token: G4RldE4ymonKsZxajhRcg3WBny4
migrated: 2026-10-20
---

# FrameRonin 精灵图素材使用方法

FrameRonin 精灵图素材使用方法
一、素材规格

二、行布局速查（0 基行号，y = 行号×64）

⚠️ 免费包没有侧面站立帧——侧面停下用第 3 行正面呼吸帧 + 镜像即可（原生干净，实测有效）。
三、Godot 接入三件套
① 工程设置（project.godot）：

[display]
window/size/viewport_width=960
window/size/viewport_height=640
window/stretch/mode="canvas_items"
window/stretch/aspect="expand"        ; 不加=信箱黑边

[input_devices]
pointing/emulate_touch_from_mouse=true ; 桌面鼠标测摇杆

[rendering]
renderer/rendering_method="gl_compatibility"   ; Web 导出必需
textures/canvas_textures/default_texture_filter=0  ; 像素画最近邻
② 切帧（AtlasTexture → SpriteFrames）：

func _build_frames(tex: Texture2D) -> SpriteFrames:
    var sf := SpriteFrames.new()
    sf.remove_animation(&"default")
    var rows := {run_down=448.0, run_left=512.0, run_up=576.0, idle=192.0, idle_up=768.0}
    for anim in rows:
        sf.add_animation(anim)
        sf.set_animation_speed(anim, 10.0 if anim.begins_with("run") else 5.0)
        sf.set_animation_loop(anim, true)
        for i in 6:
            var at := AtlasTexture.new()
            at.atlas = tex
            at.region = Rect2(i * 64.0, rows[anim], 64.0, 64.0)
            sf.add_frame(anim, at)
    return sf
朝右 = 播 run_left + flip_h = true；停下 = 播对应 idle 行。
③ 格间移动手感要点（实测踩出来的）：
移动插值用匀速线性（move_t += delta/步长），别用指数 lerp（急冲缓行=卡顿感）
朝向每帧即时跟随输入，别只在迈步时更新（否则松手定格旧朝向）
相机 zoom = 屏宽设计值 / (TILES_ACROSS × 64) 控制取景格数
摇杆别用 scale 缩放——触摸判定圆心会错位；直接按设计单位设 size
四、Web 导出六大坑（全部实测）

五、现成工具（本机已就位）

六、动作缺口与付费路径


手册完毕。要不要我顺手存一份进 pixel-world-2/docs/ 和你的 Obsidian vault？以后任何 agent 接手素材这条线都不用重踩这些坑。



