extends Node
## Proof of concept: Grandpa's attic as a low-poly 3D room with a pixel look.
##  - the 3D world renders at 320x180 and is scaled up with nearest-neighbour
##  - fixed camera (King's Quest framing, but real depth)
##  - the hero walks on a navigation mesh baked from the room (floor only, furniture carved out)
##  - clicking a prop sends him to its "stand" point, turns him to it and shows one line of English
## Run with `-- --demo` to play a scripted check, save screenshots in shots/ and print the results.

var SUB_SIZE := Vector2i(1280, 720)   # size of the 3D picture: the window by default, 480x270 with `-- --pixel`
const WALK_SPEED := 1.7
const PICK_MASK := 2

# One line of English per prop, and a tiny Hebrew dictionary for the clickable words.
const TEXTS := {
	"Computer": "It is Grandpa's old computer. It is from 1987.",
	"Desk": "This is a big wooden desk. It is very old.",
	"Box": "A cardboard box. It is full of old things.",
	"Window": "A small round window. It is dark outside.",
}
const HEBREW := {
	"computer": "מחשב", "old": "ישן", "grandpa's": "של סבא", "grandpa": "סבא", "desk": "שולחן כתיבה",
	"wooden": "מעץ", "box": "קופסה", "cardboard": "קרטון", "window": "חלון", "small": "קטן", "round": "עגול",
	"dark": "חשוך", "outside": "בחוץ", "big": "גדול", "full": "מלא", "things": "דברים", "very": "מאוד",
	"from": "מ", "is": "הוא / היא", "it": "זה", "this": "זה", "a": "אחד", "of": "של",
}

var sub: SubViewport
var screen: TextureRect
var cam: Camera3D
var world: Node3D
var nav_region: NavigationRegion3D
var hero: Node3D
var hero_anim: AnimationPlayer
var marker: MeshInstance3D
var text_label: RichTextLabel
var hebrew_label: Label
var panel: PanelContainer

var picks: Dictionary = {}     # id -> StaticBody3D
var stands: Dictionary = {}    # id -> Vector3
var blocks: Dictionary = {}    # id -> AABB (global): furniture footprints
var spawn := Vector3.ZERO
var modern := true     # full-resolution stylized look (soft light, bloom, ambient occlusion); `-- --pixel` = retro pixel look
var shown_words: PackedStringArray = []

var path: PackedVector3Array = PackedVector3Array()
var path_i := 0
var pending_id := ""
var face_yaw := 0.0
var walking := false
var ready_for_input := false

signal arrived


func _ready() -> void:
	var args := OS.get_cmdline_user_args()
	modern = not ("--pixel" in args)
	SUB_SIZE = Vector2i(480, 270) if not modern else Vector2i(get_window().size)
	for a in args:
		if a.begins_with("--res="):
			var w := int(a.trim_prefix("--res="))
			SUB_SIZE = Vector2i(w, w * 9 / 16)
	_build_screen()
	_build_world()
	await get_tree().physics_frame
	await get_tree().physics_frame
	ready_for_input = true
	_play("Idle")
	if "--still" in OS.get_cmdline_user_args():
		await get_tree().create_timer(0.8).timeout
		await _shot("still_%s" % ("modern" if modern else "pixel"))
		get_tree().quit()
	elif "--demo" in OS.get_cmdline_user_args():
		_run_demo()


# ---------- screen: the 3D world in a small viewport, scaled up without filtering ----------

func _build_screen() -> void:
	sub = SubViewport.new()
	sub.size = SUB_SIZE
	sub.own_world_3d = true
	sub.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	sub.msaa_3d = Viewport.MSAA_4X if modern else Viewport.MSAA_DISABLED
	add_child(sub)
	if modern:
		# keep the picture sharp at any window size (fullscreen, 4K ...)
		get_window().size_changed.connect(func() -> void:
			SUB_SIZE = Vector2i(get_window().size)
			sub.size = SUB_SIZE)

	screen = TextureRect.new()
	screen.texture = sub.get_texture()
	screen.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	screen.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	screen.texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR if modern else CanvasItem.TEXTURE_FILTER_NEAREST
	screen.set_anchors_preset(Control.PRESET_FULL_RECT)
	screen.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(screen)

	panel = PanelContainer.new()
	panel.anchor_left = 0.0
	panel.anchor_right = 1.0
	panel.anchor_top = 1.0
	panel.anchor_bottom = 1.0
	panel.offset_left = 24
	panel.offset_right = -24
	panel.offset_top = -150
	panel.offset_bottom = -20
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.05, 0.04, 0.09, 0.92)
	style.border_color = Color(1.0, 0.82, 0.25)
	style.set_border_width_all(3)
	style.set_corner_radius_all(6)
	style.content_margin_left = 20
	style.content_margin_right = 20
	style.content_margin_top = 12
	style.content_margin_bottom = 12
	panel.add_theme_stylebox_override("panel", style)
	panel.visible = false
	panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(panel)

	var box := VBoxContainer.new()
	box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	panel.add_child(box)
	text_label = RichTextLabel.new()
	text_label.bbcode_enabled = true
	text_label.fit_content = true
	text_label.scroll_active = false
	text_label.add_theme_font_size_override("normal_font_size", 30)
	text_label.meta_clicked.connect(_on_word_clicked)
	box.add_child(text_label)
	hebrew_label = Label.new()
	hebrew_label.add_theme_font_size_override("font_size", 26)
	hebrew_label.add_theme_color_override("font_color", Color(0.6, 0.9, 1.0))
	hebrew_label.text = " "
	box.add_child(hebrew_label)


# ---------- the world ----------

func _build_world() -> void:
	world = Node3D.new()
	sub.add_child(world)

	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color(0.05, 0.06, 0.11)
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.78, 0.68, 0.60)
	env.ambient_light_energy = 1.25
	if modern:
		# soft, filmic, warm: ambient occlusion in the corners, bloom on the bulb, window and screen
		env.ambient_light_energy = 0.8
		env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
		# ambient occlusion needs the Vulkan renderers; on the OpenGL fallback the room is just a bit flatter
		if RenderingServer.get_rendering_device() != null:
			env.ssao_enabled = true
			env.ssao_radius = 0.9
			env.ssao_intensity = 2.0
		env.glow_enabled = true
		env.glow_intensity = 0.55
		env.glow_bloom = 0.04
		env.glow_hdr_threshold = 1.15
		env.adjustment_enabled = true
		env.adjustment_saturation = 1.18
		env.adjustment_contrast = 1.06
	var we := WorldEnvironment.new()
	we.environment = env
	world.add_child(we)

	cam = Camera3D.new()
	cam.fov = 50.0
	cam.near = 0.1
	cam.far = 60.0
	world.add_child(cam)
	cam.position = Vector3(0.0, 3.3, 5.7)
	cam.look_at(Vector3(0.0, 1.05, -0.6), Vector3.UP)
	cam.current = true

	var attic := (load("res://assets/attic.glb") as PackedScene).instantiate()
	world.add_child(attic)
	_read_room(attic)
	_bake_navigation()
	_build_hero()

	marker = MeshInstance3D.new()
	var disc := CylinderMesh.new()
	disc.top_radius = 0.16
	disc.bottom_radius = 0.16
	disc.height = 0.01
	disc.radial_segments = 8
	marker.mesh = disc
	var mm := StandardMaterial3D.new()
	mm.albedo_color = Color(1.0, 0.85, 0.2)
	mm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	marker.material_override = mm
	marker.visible = false
	world.add_child(marker)


## Reads the catalog contract written by Blender (see godot/blender/attic.py).
func _read_room(root: Node) -> void:
	for n in root.find_children("*", "", true, false):
		var nm := String(n.name)
		if n is MeshInstance3D:
			var mi := n as MeshInstance3D
			var box: AABB = mi.global_transform * mi.mesh.get_aabb()
			if nm == "nav_floor":
				mi.layers = 0          # invisible, but still source geometry for the navmesh
				mi.add_to_group("nav_src")
			elif nm.begins_with("block_"):
				mi.visible = false
				blocks[nm.trim_prefix("block_")] = box
			elif nm.begins_with("pick_"):
				mi.visible = false
				var body := StaticBody3D.new()
				body.collision_layer = PICK_MASK
				body.collision_mask = 0
				body.set_meta("pick_id", nm.trim_prefix("pick_"))
				var shape := CollisionShape3D.new()
				var bs := BoxShape3D.new()
				bs.size = box.size
				shape.shape = bs
				body.add_child(shape)
				world.add_child(body)
				body.global_position = box.get_center()
				picks[nm.trim_prefix("pick_")] = body
		elif nm.begins_with("stand_"):
			stands[nm.trim_prefix("stand_")] = (n as Node3D).global_position
		elif nm == "spawn_Hero":
			spawn = (n as Node3D).global_position
		elif nm == "light_bulb":
			var l := OmniLight3D.new()
			l.light_color = Color(1.0, 0.82, 0.5)
			l.light_energy = 5.0 if modern else 3.2
			l.omni_range = 9.0
			l.shadow_enabled = true
			world.add_child(l)
			l.global_position = (n as Node3D).global_position
			if modern:
				_add_dust(l.global_position + Vector3(0.0, -0.4, 0.2))

	# a cold light from the little window
	if picks.has("Window"):
		var w := OmniLight3D.new()
		w.light_color = Color(0.55, 0.7, 1.0)
		w.light_energy = 1.4
		w.omni_range = 5.0
		world.add_child(w)
		w.global_position = (picks["Window"] as Node3D).global_position + Vector3(0, 0, 0.7)


## A few specks of dust floating in the bulb light (modern look only).
func _add_dust(at: Vector3) -> void:
	var p := CPUParticles3D.new()
	p.amount = 36
	p.lifetime = 10.0
	p.preprocess = 10.0
	p.emission_shape = CPUParticles3D.EMISSION_SHAPE_SPHERE
	p.emission_sphere_radius = 1.5
	p.direction = Vector3(0.3, 0.5, 0.0)
	p.spread = 180.0
	p.initial_velocity_min = 0.02
	p.initial_velocity_max = 0.07
	p.gravity = Vector3.ZERO
	p.scale_amount_min = 0.6
	p.scale_amount_max = 1.2
	var q := QuadMesh.new()
	q.size = Vector2(0.03, 0.03)
	var m := StandardMaterial3D.new()
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.albedo_color = Color(1.0, 0.93, 0.72, 0.55)
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	m.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
	q.material = m
	p.mesh = q
	world.add_child(p)
	p.global_position = at


func _bake_navigation() -> void:
	# furniture footprints carve holes in the walkable floor
	for id in blocks:
		var b: AABB = blocks[id]
		var ob := NavigationObstacle3D.new()
		ob.affect_navigation_mesh = true
		ob.carve_navigation_mesh = false
		ob.height = 1.2
		ob.vertices = PackedVector3Array([
			Vector3(b.position.x, 0, b.position.z),
			Vector3(b.position.x, 0, b.end.z),
			Vector3(b.end.x, 0, b.end.z),
			Vector3(b.end.x, 0, b.position.z),
		])
		ob.add_to_group("nav_src")
		world.add_child(ob)
		ob.global_position = Vector3(0, -0.1, 0)

	var nm := NavigationMesh.new()
	nm.cell_size = 0.1
	nm.cell_height = 0.1
	nm.agent_radius = 0.28
	nm.agent_height = 1.5
	nm.agent_max_climb = 0.2
	nm.agent_max_slope = 40.0
	nm.geometry_parsed_geometry_type = NavigationMesh.PARSED_GEOMETRY_MESH_INSTANCES
	nm.geometry_source_geometry_mode = NavigationMesh.SOURCE_GEOMETRY_GROUPS_EXPLICIT
	nm.geometry_source_group_name = &"nav_src"
	nav_region = NavigationRegion3D.new()
	nav_region.navigation_mesh = nm
	world.add_child(nav_region)
	nav_region.bake_navigation_mesh(false)
	print("NAVMESH polygons: ", nm.get_polygon_count(), " vertices: ", nm.get_vertices().size())


func _build_hero() -> void:
	hero = Node3D.new()
	world.add_child(hero)
	var boy := (load("res://assets/boy.glb") as PackedScene).instantiate()
	hero.add_child(boy)
	hero.global_position = spawn
	# a soft contact shadow, so he always looks planted on the floor
	var blob := MeshInstance3D.new()
	var disc := CylinderMesh.new()
	disc.top_radius = 0.3
	disc.bottom_radius = 0.3
	disc.height = 0.004
	disc.radial_segments = 20
	blob.mesh = disc
	var bm := StandardMaterial3D.new()
	bm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	bm.albedo_color = Color(0.0, 0.0, 0.0, 0.38)
	bm.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	bm.no_depth_test = false
	blob.material_override = bm
	blob.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	blob.position = Vector3(0.0, 0.012, 0.0)
	hero.add_child(blob)
	hero_anim = boy.find_child("AnimationPlayer", true, false) as AnimationPlayer
	if hero_anim:
		for a in hero_anim.get_animation_list():
			hero_anim.get_animation(a).loop_mode = Animation.LOOP_LINEAR
		print("ANIMATIONS: ", hero_anim.get_animation_list())


func _play(anim: String) -> void:
	if hero_anim == null:
		return
	for a in hero_anim.get_animation_list():
		if String(a).to_lower().contains(anim.to_lower()):
			if hero_anim.current_animation != a:
				hero_anim.play(a, 0.15)
			return


# ---------- input and walking ----------

func _unhandled_input(event: InputEvent) -> void:
	if not ready_for_input:
		return
	if event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		_click_sub(_screen_to_sub(event.position))


## Mouse position in the window -> position in the 320x180 picture (the picture is centred, aspect kept).
func _screen_to_sub(p: Vector2) -> Vector2:
	var r := screen.get_global_rect()
	var s: float = min(r.size.x / SUB_SIZE.x, r.size.y / SUB_SIZE.y)
	var off := (r.size - Vector2(SUB_SIZE) * s) / 2.0
	return (p - r.position - off) / s


## Click at a position in the small picture. Returns what happened (used by the demo too).
func _click_sub(sp: Vector2) -> Dictionary:
	var from := cam.project_ray_origin(sp)
	var dir := cam.project_ray_normal(sp)
	var space := cam.get_world_3d().direct_space_state
	var q := PhysicsRayQueryParameters3D.create(from, from + dir * 60.0, PICK_MASK)
	var hit := space.intersect_ray(q)
	if not hit.is_empty():
		var id := String((hit["collider"] as Node).get_meta("pick_id"))
		go_to_prop(id)
		return {"kind": "prop", "id": id}
	# nothing clickable: the floor point under the click (a wall or the top of furniture is not floor)
	var floor_pt: Variant = Plane(Vector3.UP, 0.0).intersects_ray(from, dir)
	if floor_pt == null:
		return {"kind": "ignored"}
	var dest := walk_to(floor_pt as Vector3)
	return {"kind": "floor", "dest": dest}


func go_to_prop(id: String) -> void:
	pending_id = id
	panel.visible = false
	var target: Vector3 = stands.get(id, hero.global_position)
	_set_path(target)


func walk_to(p: Vector3) -> Vector3:
	pending_id = ""
	panel.visible = false
	return _set_path(p)


func _set_path(p: Vector3) -> Vector3:
	var map := nav_region.get_navigation_map()
	var dest := NavigationServer3D.map_get_closest_point(map, p)
	path = NavigationServer3D.map_get_path(map, hero.global_position, dest, true)
	path_i = 1 if path.size() > 1 else path.size()
	marker.global_position = dest + Vector3(0, 0.02, 0)
	marker.visible = true
	walking = path_i < path.size()
	if walking:
		_play("Walk")
	else:
		_arrive()
	return dest


func _process(delta: float) -> void:
	if hero == null:
		return
	if walking:
		var target := path[path_i]
		var to := target - hero.global_position
		to.y = 0.0
		var step := WALK_SPEED * delta
		if to.length() <= step:
			hero.global_position = Vector3(target.x, 0.0, target.z)
			path_i += 1
			if path_i >= path.size():
				walking = false
				_arrive()
		else:
			var d := to.normalized()
			hero.global_position += d * step
			face_yaw = atan2(d.x, d.z)
	hero.rotation.y = lerp_angle(hero.rotation.y, face_yaw, clamp(delta * 10.0, 0.0, 1.0))


func _arrive() -> void:
	marker.visible = false
	_play("Idle")
	if pending_id != "":
		var body: Node3D = picks.get(pending_id)
		if body:
			var d := body.global_position - hero.global_position
			if Vector2(d.x, d.z).length() > 0.01:
				face_yaw = atan2(d.x, d.z)
		_show_text(String(TEXTS.get(pending_id, "")))
	arrived.emit()


# ---------- text with clickable words ----------

func _show_text(t: String) -> void:
	if t == "":
		return
	var parts: PackedStringArray = []
	shown_words.clear()
	for w in t.split(" "):
		# the link carries the word's number, not the word (an apostrophe would break the BBCode)
		var key := w.to_lower().strip_edges().trim_suffix(".").trim_suffix(",")
		parts.append("[url=%d][color=#ffe27a]%s[/color][/url]" % [shown_words.size(), w.replace("[", "")])
		shown_words.append(key)
	text_label.text = " ".join(parts)
	hebrew_label.text = " "
	panel.visible = true


func _on_word_clicked(meta: Variant) -> void:
	var i := int(String(meta))
	if i < 0 or i >= shown_words.size():
		return
	var key: String = shown_words[i]
	hebrew_label.text = "%s  =  %s" % [key, HEBREW.get(key, "?")]


# ---------- demo: scripted run for screenshots and checks ----------

func _shot(name: String) -> void:
	await RenderingServer.frame_post_draw
	var img := get_viewport().get_texture().get_image()
	var dir := ProjectSettings.globalize_path("res://shots")
	DirAccess.make_dir_recursive_absolute(dir)
	img.save_png("%s/%s.png" % [dir, name])
	print("SHOT ", name)


func _sub_of(p: Vector3) -> Vector2:
	return cam.unproject_position(p)


func _wait_arrival() -> void:
	if walking:
		await arrived
	await get_tree().create_timer(0.4).timeout


func _on_furniture(p: Vector3) -> String:
	for id in blocks:
		var b: AABB = blocks[id]
		if p.x > b.position.x and p.x < b.end.x and p.z > b.position.z and p.z < b.end.z:
			return String(id)
	return ""


func _run_demo() -> void:
	await get_tree().create_timer(0.6).timeout
	await _shot("01_start")

	# 1. click the computer: he walks to the floor in front of the desk and shows the English line
	var comp_pt: Vector3 = (picks["Computer"] as Node3D).global_position
	var r1 := _click_sub(_sub_of(comp_pt))
	print("CLICK computer ->", r1, " stand=", stands.get("Computer"))
	await get_tree().create_timer(1.2).timeout
	await _shot("02_walking")
	await _wait_arrival()
	await _shot("03_computer_text")
	print("RESULT computer: hero at ", hero.global_position, " on furniture: '", _on_furniture(hero.global_position), "'")

	# 2. a word click shows the Hebrew
	_on_word_clicked("old")
	await _shot("04_word_hebrew")

	# 3. click the desk top and a wall: he must never stand on them
	var desk_top: Vector3 = (picks["Desk"] as Node3D).global_position + Vector3(0.2, 0.4, 0.0)
	var r3 := _click_sub(_sub_of(desk_top))
	await _wait_arrival()
	print("CLICK desk top ->", r3, " hero at ", hero.global_position, " on furniture: '", _on_furniture(hero.global_position), "'")
	var wall_pt := Vector3(-2.0, 1.0, -2.45)
	var r4 := _click_sub(_sub_of(wall_pt))
	await _wait_arrival()
	print("CLICK wall ->", r4, " hero at ", hero.global_position, " on furniture: '", _on_furniture(hero.global_position), "'")
	await _shot("05_after_wall_click")

	# 4. stress test: 400 clicks over the whole picture; no destination may be inside furniture or off the floor
	var bad := 0
	var count := 0
	for ix in range(0, SUB_SIZE.x, 8):
		for iy in range(0, SUB_SIZE.y, 6):
			var sp := Vector2(ix, iy)
			var from := cam.project_ray_origin(sp)
			var dir := cam.project_ray_normal(sp)
			var fp: Variant = Plane(Vector3.UP, 0.0).intersects_ray(from, dir)
			if fp == null:
				continue
			var map := nav_region.get_navigation_map()
			var dest := NavigationServer3D.map_get_closest_point(map, fp as Vector3)
			count += 1
			if _on_furniture(dest) != "" or dest.y > 0.3 or absf(dest.x) > 2.15:
				bad += 1
				print("BAD destination ", dest, " for click ", sp)
	print("PROOF: ", count, " floor-plane clicks, ", bad, " destinations on furniture or off the floor")

	# 5. every prop can be reached
	for id in stands:
		var map2 := nav_region.get_navigation_map()
		var s: Vector3 = stands[id]
		var p := NavigationServer3D.map_get_path(map2, spawn, s, true)
		var end := p[p.size() - 1] if p.size() > 0 else Vector3.INF
		print("REACH ", id, ": path points=", p.size(), " ends ", end.distance_to(s), " m from stand point")
	print("DEMO DONE")
	get_tree().quit()
