extends SceneTree
## 字体诊断：godot --headless --path . -s res://tests/font_check.gd

func _init() -> void:
	var f = load("res://assets/fonts/simhei.ttf")
	print("font=", f)
	if f == null:
		print("RESULT: LOAD-FAILED")
		quit(1)
		return
	print("class=", f.get_class())
	print("has_char 按(0x6309)=", f.has_char(0x6309))
	print("has_char 侠(0x4FA0)=", f.has_char(0x4FA0))
	print("has_char A=", f.has_char(0x41))
	var chars: PackedInt32Array = f.get_supported_chars()
	print("supported_chars=", chars.size())
	print("RESULT: OK")
	quit(0)
