extends SceneTree
## 无头逻辑测试：godot --headless --path . -s res://tests/test_logic.gd

var fails := 0

func _init() -> void:
	var main = load("res://scenes/main.tscn").instantiate()
	root.add_child(main)

	# 1) 起点(1,1) 向下走：MAP[2][1]=0 空地 → 应移动
	var ok1: bool = main.try_step(Vector2i(0, 1))
	_check(ok1 == true, "向下走进空地")
	_check(main.cell == Vector2i(1, 2), "cell 应为 (1,2)，实得 %s" % main.cell)

	# 2) 向左撞边界墙：只转身不移动
	var ok2: bool = main.try_step(Vector2i(-1, 0))
	_check(ok2 == false, "向左撞墙返回 false")
	_check(main.cell == Vector2i(1, 2), "撞墙后 cell 不变")
	_check(main.facing == Vector2i(-1, 0), "撞墙后 facing 转向墙")

	# 3) 向右撞内墙：MAP[2][2]=1
	var ok3: bool = main.try_step(Vector2i(1, 0))
	_check(ok3 == false, "向右撞内墙返回 false")
	_check(main.cell == Vector2i(1, 2), "cell 仍为 (1,2)")

	# 4) 零向量不动作
	var ok4: bool = main.try_step(Vector2i.ZERO)
	_check(ok4 == false, "零向量返回 false")

	if fails == 0:
		print("ALL PASS (8 checks)")
		quit(0)
	else:
		print("%d FAIL" % fails)
		quit(1)

func _check(cond: bool, name: String) -> void:
	if cond:
		print("  PASS  %s" % name)
	else:
		fails += 1
		print("  FAIL  %s" % name)
