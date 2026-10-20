extends SceneTree
func _init() -> void:
	var a := Image.load_from_file("res://assets/tiles/xianxia/dual-atlas.png")
	var opaque := 0
	var per_tile := []
	for i in range(4):
		for j in range(4):
			var c := 0
			for px in range(128):
				for py in range(128):
					if a.get_pixel(i*128+px, j*128+py).a > 0.5: c += 1
			per_tile.append(c)
			opaque += c
	print("不透明像素总数:", opaque, "/", a.get_width()*a.get_height())
	print("每瓦片不透明数:", per_tile)
	quit(0)
