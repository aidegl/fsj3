extends Node2D
## 练习1 v3：虚拟摇杆(HUD右下角恒定) + 格间步进移动 + Ronin 武侠角色
## 素材规格（Ronin Pixel Forge 包内 README）：384x832，6列x13行，单帧64x64
##   第8行(idx7)=向下走，第9行(idx8)=向左走(向右镜像)，第10行(idx9)=向上走，每行6帧
## 布局：地板瓦片铺满整个可视区（地图块居中，四周延伸地板）；
##       摇杆挂 HUD：真实像素恒定大小，钉视口右下角；Q/E 切换侠客；ESC 退出。

const TILE := 64.0
const CHAR_SCALE := 4.0  # 角色放大4倍：一个角色占4x4格（2026-10-20 老板拍板）
const STEP_INTERVAL := 0.18
const CHAR_DIR := "res://assets/wuxia"
const UI_FONT_PATH := "res://assets/fonts/simhei.ttf"  # 中文字体（主题设置不生效时直接覆盖）
const FRAME := 64.0
const WALK_ROW_Y := {run_down = 448.0, run_left = 512.0, run_up = 576.0}
const IDLE_ROW_Y := 192.0     # 正面站立待机（呼吸 6 帧；自带微侧身，兼作朝左待机，镜像即朝右）
const IDLE_UP_ROW_Y := 768.0  # 背面站立待机（呼吸 6 帧）
const JOY_REAL_SIZE := 140.0   # 摇杆真实像素直径（不随窗口缩放）
const JOY_MARGIN := 24.0
const TILES_ACROSS := 15.0     # 屏幕宽度恒定显示 15 格（2026-10-17 老板拍板：默认场景比例太大，人物缩到设计稿尺寸≈2倍特写；滚轮可现场微调）

# FSJ 团队成员（2026-10-22 老板拍板：角色改团队成员）——按图序对应，超出者回退"侠客·NN"
const CHAR_NAMES := ["东城", "无名", "小粽", "小风", "阿说", "梦瑶", "小云", "椰果"]
# 名牌偏移：x=2~3字宽的一半取中，y=角色顶(-TILE*CHAR_SCALE/2=-128)再上抬32px
const LABEL_OFFSET := Vector2(-18.0, -84.0)

# 1=墙 0=空
const MAP := [
	[1,1,1,1,1,1,1,1,1,1,1,1],
	[1,0,0,0,0,0,0,0,0,0,0,1],
	[1,0,1,1,0,0,0,1,0,0,0,1],
	[1,0,0,0,0,0,0,1,0,0,0,1],
	[1,0,0,0,1,1,0,0,0,0,0,1],
	[1,0,0,0,0,0,0,0,0,0,0,1],
	[1,1,1,1,1,1,1,1,1,1,1,1],
]

const NPC_SPOTS := [
	Vector2i(8, 1), Vector2i(2, 3), Vector2i(9, 3),
	Vector2i(8, 4), Vector2i(2, 5),
]

var cell := Vector2i(1, 1)
var facing := Vector2i(0, 1)
var joy_vector := Vector2.ZERO
var visual_pos := Vector2.ZERO
var draw_offset := Vector2.ZERO  # 地图块在可视区里的居中偏移
var _cooldown := 0.0
var move_from := Vector2.ZERO
var move_to := Vector2.ZERO
var move_t := 1.0  # 格间插值进度（1=到位）

var sheets: Array[String] = []
var sheet_ts: Array[String] = []
var sheet_index := 0
var jess: Node2D  # 融合的 dual-grid 地形（Jess.tscn 实例，垫底渲染）
var player_sprite: AnimatedSprite2D
var player_label: Label
var joy: Joystick
var npc_nodes: Array[AnimatedSprite2D] = []
var npc_labels: Array[Label] = []
var npc_cells := {}
var cam: Camera2D
var hud: CanvasLayer
const DEBUG_HUD := false
var dbg: Label
# 画布拖拽（2026-10-17 老板拍板：非数据面板区点击拖动 = 平移画布；角色一动自动回中）
var pan_active := false
var pan_last := Vector2.ZERO
var pan_offset := Vector2.ZERO

func _ready() -> void:
	visual_pos = cell_to_world(cell)
	_discover_sheets()
	# 玩家
	player_sprite = AnimatedSprite2D.new()
	add_child(player_sprite)
	player_label = _make_label("")
	add_child(player_label)
	_apply_sheet(0)
	# 相机：跟随玩家，动态变焦（屏幕宽度恒定 TILES_ACROSS 格）
	cam = Camera2D.new()
	cam.position_smoothing_enabled = true
	cam.position_smoothing_speed = 8.0
	add_child(cam)
	cam.make_current()
	# 融合 dual-grid 地形：垫底渲染（在玩家/NPC之下、色块地板之上），禁其自带相机
	jess = (preload("res://examples/Jess.tscn") as PackedScene).instantiate()
	add_child(jess)
	move_child(jess, 0)
	var jc := jess.get_node_or_null("Camera2D")
	if jc: jc.enabled = false
	# 游戏内禁用地图编辑（CursorDual）：编辑器里照常可画，互不影响
	var cur := jess.get_node_or_null("CursorDual")
	if cur:
		cur.visible = false
		cur.process_mode = Node.PROCESS_MODE_DISABLED
	jess.position = draw_offset
	jess.scale = Vector2.ONE * (TILE / 16.0)
	# NPC
	for i in mini(NPC_SPOTS.size(), maxi(sheets.size() - 1, 0)):
		var s := AnimatedSprite2D.new()
		s.sprite_frames = _build_frames(_load_tex(sheets[(i + 1) % sheets.size()]), sheet_ts[(i + 1) % sheet_ts.size()])
		s.scale = Vector2.ONE * CHAR_SCALE
		s.animation = &"idle"
		s.play()
		add_child(s)
		npc_nodes.append(s)
		var l := _make_label(_char_name((i + 1) % sheets.size()))
		add_child(l)
		npc_labels.append(l)
		npc_cells[NPC_SPOTS[i]] = true
	# 虚拟摇杆（HUD 层：不受相机变焦影响，恒定真实像素，钉右下角）
	hud = CanvasLayer.new()
	add_child(hud)
	# 调试显示：摇杆原始向量/朝向（定位输入问题用，稳定后删）
	dbg = Label.new()
	dbg.position = Vector2(8, 8)
	dbg.add_theme_font_override("font", load(UI_FONT_PATH))
	dbg.add_theme_font_size_override("font_size", 14)
	dbg.add_theme_color_override("font_color", Color(1, 0.95, 0.4))
	dbg.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.9))
	dbg.add_theme_constant_override("outline_size", 4)
	if DEBUG_HUD: hud.add_child(dbg)  # 调试标签（摇杆向量/朝向）——验收通过后默认关（2026-10-17老板机已确认方向正确）
	joy = Joystick.new()
	joy.size = Vector2(JOY_REAL_SIZE, JOY_REAL_SIZE)
	hud.add_child(joy)
	joy.jooved.connect(func(v: Vector2) -> void: joy_vector = v)
	_recalc_layout()
	get_viewport().size_changed.connect(_recalc_layout)

func _recalc_layout() -> void:
	var vs := get_viewport_rect().size
	var map_px := Vector2(MAP[0].size(), MAP.size()) * TILE
	draw_offset = ((vs - map_px) * 0.5).floor()
	if jess: jess.position = draw_offset
	# 相机变焦：可视宽度恒定 TILES_ACROSS 格
	if cam:
		cam.zoom = Vector2.ONE * (vs.x / (TILES_ACROSS * TILE))
	# NPC 摆到新偏移
	for i in npc_nodes.size():
		var p := cell_to_world(NPC_SPOTS[i])
		npc_nodes[i].position = p + draw_offset
		npc_labels[i].position = p + draw_offset + LABEL_OFFSET
	# 摇杆：design 单位直接设尺寸（画多大触摸区就多大，绝不用 scale 缩放）
	var sc := float(get_window().size.y) / maxf(vs.y, 1.0)
	if sc <= 0.0:
		sc = 1.0
	var size_d := JOY_REAL_SIZE / sc
	var margin_d := JOY_MARGIN / sc
	joy.size = Vector2(size_d, size_d)
	joy.position = Vector2(vs.x - size_d - margin_d, vs.y - size_d - margin_d)
	# 布局/变焦变化后相机瞬间对准玩家（不平滑滑屏）
	if cam and player_sprite:
		cam.position = player_sprite.position
		cam.reset_smoothing()
	queue_redraw()

## 扫描角色图：兼容编辑器（真文件 .png）与导出版（PCK 重映射 .png.import）
## 同时间戳优先 oldfix2 修正版，按文件名排序
func _discover_sheets() -> void:
	var dir := DirAccess.open(CHAR_DIR)
	var best := {}
	if dir != null:
		for f in dir.get_files():
			var n := f.get_file()
			if not (n.to_lower().ends_with(".png") or n.to_lower().ends_with(".png.import")):
				continue
			var base := n.trim_suffix(".import")
			var ts := base.split("-")[0]
			var prefer := base.contains("oldfix2")
			var have: String = best.get(ts, "")
			if have == "" or (prefer and not have.contains("oldfix2")):
				best[ts] = base
	var sorted_names := best.values()
	sorted_names.sort()
	for n in sorted_names:
		sheets.append("%s/%s" % [CHAR_DIR, n])
		sheet_ts.append(n.split("-")[0])

func _load_tex(path: String) -> Texture2D:
	return load(path) as Texture2D

## 按 Ronin 规格切三方向 6 帧 + 正面待机 6 帧
func _build_frames(tex: Texture2D, ts: String) -> SpriteFrames:
	var sf := SpriteFrames.new()
	sf.remove_animation(&"default")
	for anim in WALK_ROW_Y:
		sf.add_animation(anim)
		sf.set_animation_speed(anim, 10.0)
		sf.set_animation_loop(anim, true)
		for i in 6:
			var at := AtlasTexture.new()
			at.atlas = tex
			at.region = Rect2(i * FRAME, WALK_ROW_Y[anim], FRAME, FRAME)
			sf.add_frame(anim, at)
	sf.add_animation(&"idle")
	sf.set_animation_speed(&"idle", 5.0)
	sf.set_animation_loop(&"idle", true)
	for i in 6:
		var at := AtlasTexture.new()
		at.atlas = tex
		at.region = Rect2(i * FRAME, IDLE_ROW_Y, FRAME, FRAME)
		sf.add_frame(&"idle", at)
	sf.add_animation(&"idle_up")
	sf.set_animation_speed(&"idle_up", 5.0)
	sf.set_animation_loop(&"idle_up", true)
	for i in 6:
		var at := AtlasTexture.new()
		at.atlas = tex
		at.region = Rect2(i * FRAME, IDLE_UP_ROW_Y, FRAME, FRAME)
		sf.add_frame(&"idle_up", at)
	return sf

## Q/E 切换当前操控侠客
func _apply_sheet(idx: int) -> void:
	if sheets.is_empty():
		return
	sheet_index = posmod(idx, sheets.size())
	player_sprite.sprite_frames = _build_frames(_load_tex(sheets[sheet_index]), sheet_ts[sheet_index])
	player_sprite.scale = Vector2.ONE * CHAR_SCALE
	player_sprite.animation = &"run_down"
	player_sprite.frame = 0
	player_sprite.pause()
	player_label.text = _char_name(sheet_index)

## 图序 → 成员名：前 8 张对应 FSJ 团队，其余回退"侠客·NN"
func _char_name(idx: int) -> String:
	if idx >= 0 and idx < CHAR_NAMES.size():
		return CHAR_NAMES[idx]
	return "侠客·%02d" % (idx + 1)

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and not event.echo:
		if event.physical_keycode == KEY_Q:
			_apply_sheet(sheet_index - 1)
		elif event.physical_keycode == KEY_E:
			_apply_sheet(sheet_index + 1)
	# 滚轮缩放：游戏画面内滚轮直接调场景比例（0.5×~12×夹紧）
	if event is InputEventMouseButton and event.pressed:
		if event.button_index == MOUSE_BUTTON_WHEEL_UP:
			cam.zoom = (cam.zoom * 1.1).clamp(Vector2.ONE * 0.5, Vector2.ONE * 12.0)
		elif event.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			cam.zoom = (cam.zoom * 0.9).clamp(Vector2.ONE * 0.5, Vector2.ONE * 12.0)
	# 左键拖动 = 平移画布（抓着世界拖；角色一动自动回中）
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_LEFT:
		pan_active = event.pressed
		pan_last = event.position
	elif event is InputEventMouseMotion and pan_active:
		var d: Vector2 = event.position - pan_last
		pan_last = event.position
		pan_offset -= d / cam.zoom

func _make_label(text: String) -> Label:
	var l := Label.new()
	l.text = text
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	l.custom_minimum_size = Vector2(0, 0)
	l.add_theme_font_override("font", load(UI_FONT_PATH))
	l.add_theme_font_size_override("font_size", 22)
	l.add_theme_color_override("font_color", Color(0.98, 0.96, 0.88))
	l.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.9))
	l.add_theme_constant_override("outline_size", 6)
	return l

func cell_to_world(c: Vector2i) -> Vector2:
	return Vector2(c) * TILE + Vector2(TILE, TILE) * 0.5

## 方向主轴判定：直接取绝对值较大的一轴（滞回已撤——方向正确优先于防抖）
func _dominant_is_x(v: Vector2) -> bool:
	return absf(v.x) >= absf(v.y)

func is_wall(c: Vector2i) -> bool:
	if c.y < 0 or c.y >= MAP.size() or c.x < 0 or c.x >= MAP[c.y].size():
		return true
	return MAP[c.y][c.x] == 1

## 尝试沿 dir 步进一格；撞墙/NPC 只转身。返回是否移动了。
func try_step(dir: Vector2i) -> bool:
	if dir == Vector2i.ZERO:
		return false
	facing = dir
	var target := cell + dir
	if is_wall(target) or npc_cells.has(target):
		return false
	cell = target
	return true

func _process(delta: float) -> void:
	_cooldown = maxf(_cooldown - delta, 0.0)
	var v := joy_vector
	if v.length() < 0.1:
		v = Input.get_vector("ui_left", "ui_right", "ui_up", "ui_down")  # 电脑方向键兜底
	var moving := v.length() > 0.35
	if moving:
		pan_offset = Vector2.ZERO  # 角色一动，画布回中跟随
	if moving:
		var dir: Vector2i
		if _dominant_is_x(v):
			dir = Vector2i(1 if v.x > 0.0 else -1, 0)
		else:
			dir = Vector2i(0, 1 if v.y > 0.0 else -1)
		facing = dir  # 朝向即时跟随输入：松手定格的是当前方向，不是上一步的
		if _cooldown <= 0.0:
			# 只有真移动了才开新插值；撞墙人不动
			if try_step(dir):
				move_from = visual_pos
				move_to = cell_to_world(cell)
				move_t = 0.0
			_cooldown = STEP_INTERVAL
	# 匀速线性插值：等时等速滑过一格，连续步进 = 连续匀速滑行
	if move_t < 1.0:
		move_t = minf(move_t + delta / STEP_INTERVAL, 1.0)
		visual_pos = move_from.lerp(move_to, move_t)
	if moving:
		player_sprite.flip_h = false
		if absf(facing.x) > absf(facing.y):
			player_sprite.animation = &"run_left"
			player_sprite.flip_h = facing.x > 0.0
		elif facing.y < 0:
			player_sprite.animation = &"run_up"
		else:
			player_sprite.animation = &"run_down"
		player_sprite.play()
	else:
		# 待机：row3 呼吸帧自带微侧身——朝左原样、朝右镜像、朝下同为正面；背面用 row12
		if facing.y < 0:
			player_sprite.flip_h = false
			if player_sprite.animation != &"idle_up":
				player_sprite.animation = &"idle_up"
				player_sprite.frame = 0
			player_sprite.play()
		else:
			player_sprite.flip_h = facing.x > 0.0
			if player_sprite.animation != &"idle":
				player_sprite.animation = &"idle"
				player_sprite.frame = 0
			player_sprite.play()
	player_sprite.position = visual_pos + draw_offset
	player_label.position = visual_pos + draw_offset + LABEL_OFFSET
	if cam:
		cam.position = player_sprite.position + pan_offset
	if dbg:
		dbg.text = "v=(%.2f, %.2f) 按下=%s 朝向=%s 格=%s" % [joy_vector.x, joy_vector.y, joy._active, facing, cell]
	# 地板是静态的：只在实际布局变化（_recalc_layout）时重画，不要每帧全量重绘
	if Input.is_action_just_pressed("ui_cancel"):
		get_tree().quit()

func _draw() -> void:
	# 地板铺满整个可视区：地图范围内按 MAP 画，范围外全是延伸地板
	var vs := get_viewport_rect().size
	var tx0 := int(floor(-draw_offset.x / TILE)) - 1
	var ty0 := int(floor(-draw_offset.y / TILE)) - 1
	var tx1 := int(ceil((vs.x - draw_offset.x) / TILE)) + 1
	var ty1 := int(ceil((vs.y - draw_offset.y) / TILE)) + 1
	for ty in range(ty0, ty1):
		for tx in range(tx0, tx1):
			var in_map: bool = ty >= 0 and ty < MAP.size() and tx >= 0 and tx < MAP[ty].size()
			var is_w: bool = in_map and MAP[ty][tx] == 1
			var col: Color
			if is_w:
				col = Color(0.28, 0.28, 0.32)
			elif in_map:
				col = Color(0.16, 0.17, 0.20)
			else:
				col = Color(0.12, 0.13, 0.16)  # 延伸地板略暗，区分边界
			var base := Vector2(tx, ty) * TILE + draw_offset
			draw_rect(Rect2(base, Vector2(TILE - 2.0, TILE - 2.0)), col)


class Joystick extends Control:
	## 虚拟摇杆：底盘+旋钮，pointer 拖动，输出归一化向量（阈值判断在 main）
	## 尺寸随 Control.size 等比变化（半径全部按 size 比例算，触摸区=可见区）
	signal jooved(vec: Vector2)

	var knob := Vector2.ZERO
	var _active := false

	func _base_r() -> float:
		return size.x * 0.4

	func _knob_r() -> float:
		return size.x * 0.17

	func _max_r() -> float:
		return _base_r() - _knob_r() * 0.4

	func _input(event: InputEvent) -> void:
		if event is InputEventScreenTouch:
			if event.pressed and not _active and _in_base(event.position):
				_active = true
				_update_knob(event.position)
			elif _active and (not event.pressed or event.canceled):
				# canceled=浏览器手势中断（滚动手势抢走指针），同样按松手处理
				_active = false
				_reset()
		elif event is InputEventScreenDrag and _active:
			_update_knob(event.position)

	func _in_base(pos: Vector2) -> bool:
		return pos.distance_to(_base_center()) <= _base_r() * 1.6

	func _base_center() -> Vector2:
		return global_position + size * 0.5

	func _update_knob(pos: Vector2) -> void:
		knob = (pos - _base_center()).limit_length(_max_r())
		jooved.emit(knob / _max_r())
		queue_redraw()

	func _reset() -> void:
		knob = Vector2.ZERO
		jooved.emit(Vector2.ZERO)
		queue_redraw()

	func _draw() -> void:
		var c := size * 0.5
		draw_circle(c, _base_r(), Color(0.1, 0.1, 0.12, 0.55))
		draw_arc(c, _base_r(), 0.0, TAU, 48, Color(0.8, 0.8, 0.85, 0.5), 2.0)
		draw_circle(c + knob, _knob_r(), Color(0.9, 0.9, 0.95, 0.85))
