extends SceneTree
func _init() -> void:
	var tpl := Image.load_from_file("D:/Item/fsj/tmp-api/downloads/tilemapdual/TileMapDual-main/assets/tileset_standard.png")
	# 大黑块中心 (tile 2,1 的中心附近) 与白区采样
	var pts = [[160,96,"黑块中心"],[40,40,"白区"],[160,40,"过渡"],[8,8,"左上白"]]
	for p in pts:
		var c = tpl.get_pixel(p[0], p[1])
		print(p[2], " (", p[0], ",", p[1], "): r=", c.r, " g=", c.g, " b=", c.b, " a=", c.a)
	quit(0)
