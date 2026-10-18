extends SceneTree
## 批量像素手术 v2：拼「侧面站立」帧（头部自动对齐版）
## ① 算正面待机头部 bbox → 擦除原脸（保留脖颈线）
## ② 算行走左 f2 头部 bbox → 底对齐脖颈、水平居中后粘贴
## godot --headless --path . -s res://tests/make_side_idle.gd

const DIR := "res://assets/wuxia"
const OUT_DIR := "res://assets/wuxia-generated"

## 帧内 (fx,fy) 起 64x64 区域顶部 36 行的非透明包围盒
func _head_bbox(img: Image, fx: int, fy: int) -> Rect2i:
	var minx := 99
	var miny := 99
	var maxx := -1
	var maxy := -1
	for y in range(0, 36):
		for x in range(4, 60):
			if img.get_pixel(fx + x, fy + y).a > 0.1:
				if x < minx:
					minx = x
				if x > maxx:
					maxx = x
				if y < miny:
					miny = y
				if y > maxy:
					maxy = y
	if maxx < 0:
		return Rect2i(18, 4, 28, 32)
	return Rect2i(minx, miny, maxx - minx + 1, maxy - miny + 1)

func _init() -> void:
	DirAccess.make_dir_recursive_absolute(OUT_DIR)
	var dir := DirAccess.open(DIR)
	var best := {}
	for f in dir.get_files():
		if not f.to_lower().ends_with(".png"):
			continue
		var ts := f.split("-")[0]
		if not best.has(ts) or f.contains("oldfix2"):
			best[ts] = f
	var n := 0
	for ts in best:
		var tex: Texture2D = load("%s/%s" % [DIR, best[ts]])
		var img: Image = tex.get_image()
		if img.is_compressed():
			img.decompress()
		img.convert(Image.FORMAT_RGBA8)
		var hb1 := _head_bbox(img, 0, 192)      # 正面待机头
		var hb2 := _head_bbox(img, 128, 512)    # 行走左 f2 侧头
		var out := Image.create_empty(64, 64, false, Image.FORMAT_RGBA8)
		# 身体：正面待机整帧
		out.blit_rect(img, Rect2i(0, 192, 64, 64), Vector2i.ZERO)
		# 擦原脸：头部 bbox 外扩 2px，底边到颈部线为止
		var clear := Rect2i(maxi(hb1.position.x - 2, 0), 0, mini(hb1.size.x + 4, 64), hb1.end.y + 1)
		out.fill_rect(clear, Color(0, 0, 0, 0))
		# 贴侧面头：底对齐正面头的颈部线，水平中心对齐 32
		var dx := int(32.0 - (hb2.position.x + hb2.size.x / 2.0))
		var dy := (hb1.position.y + hb1.size.y) - (hb2.position.y + hb2.size.y)
		out.blend_rect(img, Rect2i(128 + hb2.position.x, 512 + hb2.position.y, hb2.size.x, hb2.size.y), Vector2i(hb2.position.x + dx, hb2.position.y + dy))
		out.save_png("%s/side_idle_%s.png" % [OUT_DIR, ts])
		n += 1
	print("GENERATED ", n, " side idle frames (auto-aligned)")
	quit(0)
