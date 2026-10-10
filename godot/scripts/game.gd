extends Node
## English Quest: the Godot client. Plays an episode (plain data, same as the web game) in 3D rooms.
##   godot --path godot                      play the prologue (episodes/s1e0.json)
##   -- --episode=s1e1                       play another episode
##   -- --server=http://HOST:8080            read the episode from the server and report when it is done
##   -- --pixel                              the retro low-resolution look
##   -- --autoplay [--shots]                 a robot plays the prologue (for the video), shots go to godot/shots/
## Rooms are glTF files built in Blender that follow the catalog contract (see scripts/room.gd).

const TWO_STEP := ["use", "give"]
const SHOTS_DIR := "res://shots"

var args: PackedStringArray
var server := ""
var episode_id := "s1e0"
var pixel_look := false
var autoplay := false
var take_shots := false

# nodes
var sub: SubViewport
var screen: TextureRect
var world: Node3D
var cam: Camera3D
var env: Environment
var room: Room
var hero: Actor
var byte: Node3D
var hud: Hud
var term: Terminal
var fxl: FxLayer
var sfx: Sfx
var voice: Voice
var screen_quad: MeshInstance3D
var screen_mat: ShaderMaterial
var vortex_quad: MeshInstance3D
var vortex_mat: ShaderMaterial
var marker: MeshInstance3D
var bits: CPUParticles3D
var icons: ItemIcons
var store: WordStore
var wordui: WordUi
var last_say := ""
var _icon_pending: Dictionary = {}

# game
var eng: EpisodeEngine
var dictionary: Dictionary = {}
var base_data: Dictionary = {}
var sel_verb := ""
var sel_item := ""
var hover_name := ""
var busy := false
var player_name := ""
var shake := 0.0
var cam_base_v := 0.0
var zoomed := false
var story_continue := false
var story_waiting := false

signal story_continue_pressed

var loading_label: Label
var report_done := false     # tell the server when the episode is finished (second line of server.txt: report)


func _can_act() -> bool:
	return eng != null and room != null and hero != null and wordui != null and sfx != null


func _ready() -> void:
	args = OS.get_cmdline_user_args()
	pixel_look = "--pixel" in args
	autoplay = "--autoplay" in args
	take_shots = "--shots" in args
	server = _server_from_file()
	for a in args:
		if a.begins_with("--server="):
			server = a.trim_prefix("--server=")
		elif a.begins_with("--episode="):
			episode_id = a.trim_prefix("--episode=")
	_build_screen()
	_build_world_root()
	_build_ui()
	loading_label = Label.new()
	loading_label.text = "Connecting ...   מתחבר ..." if server != "" else "Loading ..."
	loading_label.set_anchors_preset(Control.PRESET_CENTER)
	loading_label.add_theme_font_size_override("font_size", 40)
	loading_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	loading_label.offset_left = -300
	loading_label.offset_right = 300
	add_child(loading_label)
	hud.set_visible_all(false)
	if not await _load_data():
		loading_label.text = "Something is missing. Look at the Godot output."
		return
	loading_label.queue_free()
	loading_label = null
	_start()


## The server's address, from godot/server.txt (one line, for example http://192.168.1.50:8080). The voices
## (Kokoro) and the episodes come from there. Without it the game still works, with the computer's own voice.
func _server_from_file() -> String:
	var path := ProjectSettings.globalize_path("res://server.txt")
	var f := FileAccess.open(path, FileAccess.READ)
	if f == null:
		return ""
	var lines := f.get_as_text().split("
", false)
	report_done = lines.size() > 1 and lines[1].strip_edges().to_lower() == "report"
	return String(lines[0]).strip_edges().rstrip("/") if lines.size() > 0 else ""


# ---------- screen and world root ----------

func _build_screen() -> void:
	sub = SubViewport.new()
	sub.own_world_3d = true
	sub.size = Vector2i(480, 270) if pixel_look else Vector2i(get_window().size)
	sub.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	sub.msaa_3d = Viewport.MSAA_DISABLED if pixel_look else Viewport.MSAA_4X
	add_child(sub)
	if not pixel_look:
		get_window().size_changed.connect(func() -> void: sub.size = Vector2i(get_window().size))

	screen = TextureRect.new()
	screen.texture = sub.get_texture()
	screen.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	screen.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	screen.texture_filter = CanvasItem.TEXTURE_FILTER_NEAREST if pixel_look else CanvasItem.TEXTURE_FILTER_LINEAR
	screen.set_anchors_preset(Control.PRESET_FULL_RECT)
	screen.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(screen)


func _build_world_root() -> void:
	world = Node3D.new()
	sub.add_child(world)

	env = Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color(0.05, 0.06, 0.11)
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.78, 0.68, 0.60)
	env.ambient_light_energy = 0.8
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	if RenderingServer.get_rendering_device() != null:     # the Vulkan renderers
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
	cam.near = 0.05
	cam.far = 200.0
	world.add_child(cam)
	cam.current = true

	marker = MeshInstance3D.new()
	var disc := CylinderMesh.new()
	disc.top_radius = 0.16
	disc.bottom_radius = 0.16
	disc.height = 0.01
	disc.radial_segments = 10
	marker.mesh = disc
	var mm := StandardMaterial3D.new()
	mm.albedo_color = Color(1.0, 0.85, 0.2)
	mm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	marker.material_override = mm
	marker.visible = false
	world.add_child(marker)

	term = Terminal.new()
	add_child(term)
	term.key_typed.connect(func() -> void: sfx.play("type", -6.0, randf_range(0.9, 1.1)))
	term.word_clicked.connect(func(w: String, s: String) -> void: _on_word(w, s))


func _build_ui() -> void:
	sfx = Sfx.new()
	add_child(sfx)
	voice = Voice.new()
	voice.server = server
	add_child(voice)
	icons = ItemIcons.new()
	add_child(icons)
	store = WordStore.new()
	store.load_file()
	wordui = WordUi.new()
	add_child(wordui)
	hud = Hud.new()
	add_child(hud)
	fxl = FxLayer.new()
	add_child(fxl)
	hud.verb_pressed.connect(_on_verb)
	hud.item_pressed.connect(_on_item)
	hud.item_hovered.connect(_on_item_hover)
	hud.hint_pressed.connect(_on_hint)
	hud.listen_pressed.connect(func() -> void:
		if eng != null:
			voice.say(last_say if last_say != "" else String(eng.goals[eng.state["goal"]]["en"])))
	hud.word_clicked.connect(_on_word)
	hud.words_pressed.connect(func() -> void: wordui.show_book())
	hud.text_shown.connect(func(t: String) -> void:
		store.mark_seen_text(t)
		_update_word_stats())
	hud.word_state = func(w: String) -> int:
		return store.state(w) if store.is_content_word(w) else WordStore.State.MASTERED
	hud.command_submitted.connect(_on_typed)
	hud.continue_pressed.connect(func() -> void: story_continue_pressed.emit())
	voice.speaking.connect(sfx.duck)


# ---------- data: episode, verbs, dictionary ----------

func _read_json(path: String) -> Variant:
	var f := FileAccess.open(path, FileAccess.READ)
	if f == null:
		return null
	return JSON.parse_string(f.get_as_text())


func _load_data() -> bool:
	var base_file: Variant = _read_json("res://episodes/_base.json")
	if base_file == null:
		push_error("episodes/_base.json is missing: run `node tools/export-episodes.js`")
		return false
	base_data = base_file["base"]
	dictionary = base_file["dictionary"]
	for fw in base_file.get("functionWords", []):
		store.function_words[String(fw)] = true
	var ep: Variant = null
	if server != "":
		ep = await _fetch_episode()
	if ep == null:
		ep = _read_json("res://episodes/%s.json" % episode_id)
	if ep == null:
		push_error("episode %s not found" % episode_id)
		return false
	for d in (ep as Dictionary).get("dictionary", []):
		dictionary[String(d["en"]).to_lower()] = d["he"]
	eng = EpisodeEngine.new()
	eng.load_episode(ep, base_data)
	return true


## Tells the server his name, so the next episodes can use it and their voices are made before he plays.
## Only when this PC reports to the server (second line "report" in server.txt), never during tests.
func _report_name(nm: String) -> void:
	if server == "" or autoplay or not (report_done or "--report" in args):
		return
	var http := HTTPRequest.new()
	http.timeout = 6.0
	add_child(http)
	http.request(server + "/api/profile", ["Content-Type: application/json"], HTTPClient.METHOD_POST, JSON.stringify({"name": nm}))
	http.request_completed.connect(func(_r: int, _c: int, _h: PackedStringArray, _b: PackedByteArray) -> void: http.queue_free())
	print("REPORTED the name to the server")


func _fetch_episode() -> Variant:
	var http := HTTPRequest.new()
	http.timeout = 6.0
	add_child(http)
	var url := "%s/api/play?episode=%s" % [server, episode_id]
	if http.request(url) != OK:
		return null
	var res: Array = await http.request_completed
	http.queue_free()
	if res[0] != HTTPRequest.RESULT_SUCCESS or res[1] != 200:
		push_warning("server did not answer, using the local episode")
		return null
	var data: Variant = JSON.parse_string((res[3] as PackedByteArray).get_string_from_utf8())
	if data is Dictionary:
		for k in (data["dictionary"] as Dictionary):
			dictionary[k] = data["dictionary"][k]
		# his name, typed in the prologue and kept by the server: later episodes greet him by it
		var prof: Variant = data.get("profile")
		if prof is Dictionary and prof.get("name") != null and String(prof["name"]) != "":
			player_name = String(prof["name"])
			hud.player_name = player_name
		return data["episode"]
	return null


# ---------- starting ----------

func _start() -> void:
	wordui.setup(dictionary, store, voice, sfx)
	term.is_clickable_word = func(w: String) -> bool:
		return dictionary.has(w) and store.is_content_word(w)
	wordui.state_changed.connect(func() -> void:
		hud.refresh_text()
		_update_word_stats())
	_update_word_stats()
	hud.set_verbs(base_data["verbs"])
	_load_scene_room(eng.state["scene"])
	hud.set_score(0, eng.max_score())
	for item_id in eng.items:
		_make_icon(String(item_id))
	_refresh_bag()
	_set_goal()
	var sc := eng.scene()
	eng.state["visited"][eng.state["scene"]] = true
	sfx.music(String(sc.get("music", "mystery")), -4.0)
	hud.set_visible_all(false)
	print("TITLE")
	await _title_card()
	print("TITLE DONE")
	hud.set_visible_all(true)
	_say_message("intro", _fmt(String(sc.get("intro", ""))))
	_message("goal", String(eng.goals[eng.state["goal"]]["en"]))
	voice.say(_fmt(String(sc.get("intro", ""))))
	if "--click-test" in args:
		_click_test()
	elif "--words-demo" in args:
		_words_demo()
	elif autoplay:
		_autoplay()


func _title_card() -> void:
	var m := RegEx.new()
	m.compile("^s(\\d+)e(\\d+)$")
	var r := m.search(String(eng.episode.get("id", "")))
	var sub_text := "PROLOGUE" if (r != null and r.get_string(2) == "0") else "EPISODE %s" % (r.get_string(2) if r != null else "")
	sfx.play("goal")
	await fxl.title_card(sub_text, String(eng.episode.get("title", "")), 3.0)


func _load_scene_room(scene_id: String) -> void:
	var sc: Dictionary = eng.scenes[scene_id]
	var shell := String(sc.get("shell", sc.get("art", scene_id)))
	_switch_room("res://assets/%s.glb" % shell)
	_sync_objects()


## Replaces the room (and puts the hero in it).
func _switch_room(glb: String) -> void:
	if room:
		room.queue_free()
		room = null
	if hero:
		hero.queue_free()
	room = Room.new()
	world.add_child(room)
	room.build(glb)
	room.bake_navigation()
	hero = Actor.new()
	world.add_child(hero)
	hero.setup("res://assets/boy.glb")
	hero.global_position = room.spawn_hero
	hero.play("Idle")
	hero.arrived.connect(func() -> void: marker.visible = false)
	_apply_room_camera()
	_make_screen_quads()


func _apply_room_camera() -> void:
	cam.global_transform = Transform3D(Basis.looking_at(room.cam_target - room.cam_pos, Vector3.UP), room.cam_pos)
	cam.fov = room.cam_fov
	# the HUD covers the bottom of the picture: shift the room up a little
	cam_base_v = -0.34 if room.named.has("screen_face") else -0.25
	cam.v_offset = cam_base_v
	zoomed = false


func _make_screen_quads() -> void:
	screen_quad = null
	vortex_quad = null
	if not room.named.has("screen_face"):
		return
	var sf := room.named["screen_face"] as Node3D
	var q := QuadMesh.new()
	q.size = Vector2(0.34, 0.26)
	screen_quad = MeshInstance3D.new()
	screen_quad.mesh = q
	screen_mat = ShaderMaterial.new()
	screen_mat.shader = load("res://shaders/crt_screen.gdshader")
	screen_mat.set_shader_parameter("tex", term.get_texture())
	screen_mat.set_shader_parameter("power", 1.0)
	screen_mat.set_shader_parameter("glitch", 0.0)
	screen_quad.material_override = screen_mat
	screen_quad.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	room.add_child(screen_quad)
	screen_quad.global_transform = sf.global_transform
	screen_quad.visible = eng.flag("computerOn")

	var vq := QuadMesh.new()
	vq.size = Vector2(2.3, 2.3)
	vortex_quad = MeshInstance3D.new()
	vortex_quad.mesh = vq
	vortex_mat = ShaderMaterial.new()
	vortex_mat.shader = load("res://shaders/vortex.gdshader")
	vortex_mat.set_shader_parameter("amount", 0.0)
	vortex_mat.set_shader_parameter("spin", 0.0)
	vortex_quad.material_override = vortex_mat
	vortex_quad.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	room.add_child(vortex_quad)
	vortex_quad.global_transform = sf.global_transform
	vortex_quad.global_position += sf.global_transform.basis.z * 0.06
	vortex_quad.visible = false

	bits = CPUParticles3D.new()
	bits.emitting = false
	bits.amount = 90
	bits.lifetime = 0.7
	bits.one_shot = false
	bits.explosiveness = 0.0
	bits.direction = Vector3(0, 0, -1)
	bits.spread = 70.0
	bits.initial_velocity_min = 0.5
	bits.initial_velocity_max = 2.2
	bits.gravity = Vector3.ZERO
	var bq := QuadMesh.new()
	bq.size = Vector2(0.05, 0.05)
	var bm := StandardMaterial3D.new()
	bm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	bm.albedo_color = Color(0.4, 1.0, 0.8)
	bm.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
	bq.material = bm
	bits.mesh = bq
	room.add_child(bits)


# ---------- state -> room ----------

func _sync_objects() -> void:
	for o in eng.scene().get("objects", []):
		room.set_object_visible(String(o["id"]), eng.object_visible(o))
	if eng.flag("boxOpen"):
		_open_box(false)


func _open_box(animate: bool) -> void:
	var f: Variant = room.named.get("box_flap_front")
	var b: Variant = room.named.get("box_flap_back")
	if f == null or b == null:
		return
	var target := deg_to_rad(112.0)
	if animate:
		sfx.play("open")
		var tw := create_tween().set_parallel(true).set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
		tw.tween_property(f, "rotation:x", target, 0.55)
		tw.tween_property(b, "rotation:x", -target, 0.55)
	else:
		(f as Node3D).rotation.x = target
		(b as Node3D).rotation.x = -target


func _refresh_bag() -> void:
	var list: Array = []
	var pictures: Dictionary = {}
	for id in eng.state["bag"]:
		if eng.items.has(id):
			list.append(eng.items[id])
			if icons.has_icon(id):
				pictures[id] = icons.get_icon(id)
			else:
				_make_icon(id)
	hud.set_bag(list, sel_item, pictures)


## The model an item is drawn from: the prop in the room, or the catalog's item model.
func _item_model(id: String) -> Node3D:
	if room != null and room.props.has(id):
		return room.props[id]
	var item: Dictionary = eng.items.get(id, {})
	var path := "res://assets/props/%s.glb" % String(item.get("prop", "item_" + id))
	if ResourceLoader.exists(path):
		return (load(path) as PackedScene).instantiate() as Node3D
	return null


func _make_icon(id: String) -> void:
	if icons.has_icon(id) or _icon_pending.has(id):
		return
	var src := _item_model(id)
	if src == null:
		return
	_icon_pending[id] = true
	await icons.render(id, src)
	_icon_pending.erase(id)
	_refresh_bag()


func _on_item_hover(id: String) -> void:
	if eng == null:
		return
	hover_name = String(eng.items[id]["name"]) if id != "" and eng.items.has(id) else ""
	_update_sentence()


func _set_goal() -> void:
	hud.set_goal(String(eng.goals[eng.state["goal"]]["en"]))


func _fmt(t: String) -> String:
	return t.replace("{name}", player_name if player_name != "" else "friend")


func _message(kind: String, text: String) -> void:
	hud.add_message(kind, _fmt(text))


func _say_message(kind: String, text: String) -> void:
	hud.add_message(kind, text)


# ---------- input ----------

func _unhandled_input(ev: InputEvent) -> void:
	if not _can_act():
		return
	if ev is InputEventKey and ev.pressed:
		if wordui.handle_key(ev):
			get_viewport().set_input_as_handled()
			return
		if term.handle_key(ev):
			get_viewport().set_input_as_handled()
			return
		if ev.keycode == KEY_ESCAPE and not busy:
			sel_verb = ""
			sel_item = ""
			hud.select_verb("")
			_refresh_bag()
			_update_sentence()
		return
	if ev is InputEventMouseButton and ev.pressed and ev.button_index == MOUSE_BUTTON_LEFT and term.clickable 			and not wordui.is_open():
		if _click_terminal(_to_sub((ev as InputEventMouseButton).position)):
			get_viewport().set_input_as_handled()
			return
	if busy or eng.state["finished"] or hud.is_story_mode() or wordui.is_open():
		return
	if ev is InputEventMouseMotion:
		_hover(_to_sub((ev as InputEventMouseMotion).position))
	elif ev is InputEventMouseButton and ev.pressed and ev.button_index == MOUSE_BUTTON_LEFT:
		_click(_to_sub((ev as InputEventMouseButton).position))


## A click on the old computer's screen (the camera is close to it): find the spot on the glass, undo the
## bulge of the CRT, and hand the click to the terminal, so its words can be clicked like any other word.
func _click_terminal(sp: Vector2) -> bool:
	if screen_quad == null:
		return false
	var r := _ray(sp)
	var xf := screen_quad.global_transform
	var hit: Variant = Plane(xf.basis.z.normalized(), xf.origin).intersects_ray(r[0], r[1])
	if hit == null:
		return false
	var local := xf.affine_inverse() * (hit as Vector3)
	var uv := Vector2(local.x / 0.34 + 0.5, 0.5 - local.y / 0.26)
	if uv.x < 0.0 or uv.x > 1.0 or uv.y < 0.0 or uv.y > 1.0:
		return false
	var c := uv * 2.0 - Vector2.ONE
	var suv := c * (1.0 + 0.08 * c.dot(c)) * 0.5 + Vector2(0.5, 0.5)
	var px := suv * Vector2(term.size)
	for pressed in [true, false]:
		var ev := InputEventMouseButton.new()
		ev.position = px
		ev.global_position = px
		ev.button_index = MOUSE_BUTTON_LEFT
		ev.pressed = pressed
		term.push_input(ev)
	return true


func _to_sub(p: Vector2) -> Vector2:
	var r := screen.get_global_rect()
	var sz := Vector2(sub.size)
	var s: float = min(r.size.x / sz.x, r.size.y / sz.y)
	var off := (r.size - sz * s) / 2.0
	return (p - r.position - off) / s


func _ray(sp: Vector2) -> Array:
	var from := cam.project_ray_origin(sp)
	return [from, cam.project_ray_normal(sp)]


func _pick_at(sp: Vector2) -> String:
	var r := _ray(sp)
	var q := PhysicsRayQueryParameters3D.create(r[0], r[0] + r[1] * 60.0, Room.PICK_LAYER)
	var hit := cam.get_world_3d().direct_space_state.intersect_ray(q)
	if hit.is_empty():
		return ""
	return String((hit["collider"] as Node).get_meta("pick_id"))


func _floor_at(sp: Vector2) -> Variant:
	var r := _ray(sp)
	return Plane(Vector3.UP, 0.0).intersects_ray(r[0], r[1])


func _hover(sp: Vector2) -> void:
	var id := _pick_at(sp)
	var name := ""
	if id != "":
		var o := eng.thing(id)
		name = String(o.get("name", ""))
	if name != hover_name:
		hover_name = name
		_update_sentence()


func _update_sentence() -> void:
	var v := sel_verb
	if v == "" and hover_name != "":
		v = "look"
	if v == "":
		hud.set_sentence("", true)
		return
	hud.set_sentence(eng.sentence(v, sel_item if TWO_STEP.has(v) else "", hover_name), sel_verb == "")


func _click(sp: Vector2) -> void:
	var id := _pick_at(sp)
	if id != "":
		var o := eng.scene_object(id)
		if not o.is_empty():
			_do(sel_verb if sel_verb != "" else "look", id, sel_item if TWO_STEP.has(sel_verb) else "")
			return
	var p: Variant = _floor_at(sp)
	if p != null:
		walk_to_floor(p as Vector3)


func _on_verb(id: String) -> void:
	if busy or not _can_act():
		return
	sfx.play("blip")
	sel_verb = "" if sel_verb == id else id
	sel_item = ""
	hud.select_verb(sel_verb)
	_refresh_bag()
	_update_sentence()


func _on_item(id: String) -> void:
	if busy or not _can_act():
		return
	if TWO_STEP.has(sel_verb) and sel_item == "":
		sel_item = id
		_refresh_bag()
		_update_sentence()
		return
	_do(sel_verb if sel_verb != "" else "look", id, sel_item if TWO_STEP.has(sel_verb) else "")


func _on_hint() -> void:
	if not _can_act():
		return
	var h := eng.hint()
	hud.add_message(String(h["kind"]), String(h["text"]))
	voice.say(String(h["text"]))


func _on_word(w: String, sentence: String) -> void:
	if wordui != null and wordui.store != null:
		wordui.show_card(w, sentence)


func _update_word_stats() -> void:
	var c := store.counts(dictionary)
	hud.set_word_stats(int(c["met"]), int(c["mastered"]))


func _on_typed(text: String) -> void:
	if busy or text.strip_edges() == "" or not _can_act():
		return
	var p := eng.parse_typed(text)
	if p.has("error"):
		hud.add_message("cmd", text.strip_edges())
		hud.add_message("say", String(base_data["ui"]["notHere" if p["error"] == "notHere" else "notUnderstood"]))
		sfx.play("nope")
		return
	var a := eng.command_to_action(p)
	if a.is_empty():
		hud.add_message("say", String(base_data["ui"]["notUnderstood"]))
		return
	if a["verb"] == "look" and a["obj"] == "":
		hud.add_message("cmd", "Look")
		hud.add_message("intro", String(eng.scene().get("intro", "")))
		return
	_do(a["verb"], a["obj"], a["item"])


# ---------- doing things ----------

func walk_to_floor(p: Vector3) -> Vector3:
	var dest := room.closest_walkable(p)
	hero.walk_along(room.path_between(hero.global_position, dest))
	marker.global_position = dest + Vector3(0, 0.03, 0)
	marker.visible = hero.walking
	return dest


## An action on something: the hero walks to it first, then the rules answer.
func _do(verb: String, obj_id: String, item_id: String) -> void:
	busy = true
	hud.set_sentence(eng.sentence(verb, item_id, String(eng.thing(obj_id).get("name", ""))), false)
	var in_bag: bool = eng.has_item(obj_id)
	var needs_item: bool = TWO_STEP.has(verb) and item_id == ""
	if not in_bag and not needs_item and room.stands.has(obj_id):
		var dest := room.closest_walkable(room.stands[obj_id])
		marker.global_position = dest + Vector3(0, 0.03, 0)
		marker.visible = true
		hero.walk_along(room.path_between(hero.global_position, dest))
		if hero.walking:
			await hero.arrived
		marker.visible = false
		if room.picks.has(obj_id):
			hero.face_point((room.picks[obj_id] as Node3D).global_position)
		await get_tree().create_timer(0.25).timeout
	var flags_before: Dictionary = eng.state["flags"].duplicate()
	var res := eng.act(verb, obj_id, item_id)
	sel_verb = ""
	sel_item = ""
	hud.select_verb("")
	await _present(res, flags_before)
	_update_sentence()
	busy = false


func _present(res: Dictionary, flags_before: Dictionary) -> void:
	hud.add_message("cmd", String(res["cmd"]))
	var say := _fmt(String(res["say"]))
	if say != "":
		hud.add_message("say", say)
		last_say = say
		voice.say(say)
	# sounds, like the web game
	if int(res["points"]) > 0:
		sfx.play("points")
	elif bool(res["picked_up"]):
		sfx.play("pickup")
	elif not bool(res["matched"]) and not String(res["cmd"]).begins_with("Look"):
		sfx.play("nope")
	hud.set_score(eng.score(), eng.max_score())
	_refresh_bag()
	_sync_objects()
	if eng.flag("boxOpen") and not flags_before.has("boxOpen"):
		_open_box(true)
	if String(res["goal"]) != "":
		_set_goal()
		if (res["fx"] as Array).is_empty() and not bool(res["finished"]):
			hud.add_message("goal", String(eng.goals[res["goal"]]["en"]))
			sfx.play("goal")
	for f in res["fx"]:
		await _run_fx(String(f))
	if bool(res["finished"]):
		await _ending(res["ending"])


# ---------- special effects (the library of cinematic moments an episode can ask for) ----------

func _run_fx(name: String) -> void:
	match name:
		"shake":
			sfx.play("glitch", -10.0)
			shake = 0.06
			await get_tree().create_timer(0.65).timeout
			shake = 0.0
		"flash":
			fxl.flash(0.9, 0.08, 0.5)
			await get_tree().create_timer(0.6).timeout
		"glitch":
			await _fx_glitch()
		"crt":
			await _fx_crt()
		"boot":
			await _fx_boot()
		"askname":
			await _fx_askname()
		"pullin":
			await _fx_pullin()


func _screen_shot_xform() -> Transform3D:
	var sf := room.named["screen_face"] as Node3D
	var pos := sf.global_position + sf.global_transform.basis.z * 0.43 + Vector3(0, 0.02, 0)
	return Transform3D(Basis.looking_at(sf.global_position - pos, Vector3.UP), pos)


func _param_to(mat: ShaderMaterial, pname: String, from: float, to: float, secs: float) -> Tween:
	var tw := create_tween()
	tw.tween_method(func(v: float) -> void: mat.set_shader_parameter(pname, v), from, to, secs)
	return tw


func _cam_to(target: Transform3D, fov: float, v_offset: float, secs: float) -> void:
	var from := cam.global_transform
	var f0 := cam.fov
	var v0 := cam_base_v
	var tw := create_tween().set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	tw.tween_method(func(t: float) -> void:
		cam.global_transform = from.interpolate_with(target, t)
		cam.fov = lerpf(f0, fov, t)
		cam_base_v = lerpf(v0, v_offset, t), 0.0, 1.0, secs)
	await tw.finished


func _zoom_to_screen() -> void:
	if zoomed:
		return
	hud.set_visible_all(false)
	zoomed = true
	sfx.play("whoosh", -14.0, 1.4)
	await _cam_to(_screen_shot_xform(), 38.0, 0.0, 0.9)
	term.clickable = true


func _zoom_out() -> void:
	if not zoomed:
		return
	term.clickable = false
	var back := Transform3D(Basis.looking_at(room.cam_target - room.cam_pos, Vector3.UP), room.cam_pos)
	await _cam_to(back, room.cam_fov, -0.34, 0.9)
	zoomed = false
	hud.set_visible_all(true)


func _fx_crt() -> void:
	screen_quad.visible = true
	screen_mat.set_shader_parameter("power", 0.0)
	term.clear()
	sfx.play("power")
	var tw := _param_to(screen_mat, "power", 0.0, 1.0, 1.5)
	await tw.finished


func _fx_boot() -> void:
	await _zoom_to_screen()
	term.clear()
	await term.type_lines(["THE LAST QUEST  v1.0", "(C) 1987  GRANDPA SOFT", "", "MEMORY 640K ... OK", "", "INSERT DISK_"], 0.04)
	await get_tree().create_timer(1.3).timeout
	term.cursor_visible = true
	await _zoom_out()


func _fx_glitch() -> void:
	sfx.play("glitch")
	shake = 0.05
	var tw := create_tween()
	var setg := func(v: float) -> void: screen_mat.set_shader_parameter("glitch", v)
	tw.tween_method(setg, 0.0, 1.0, 0.12)
	tw.tween_interval(0.8)
	tw.tween_method(setg, 1.0, 0.0, 0.2)
	fxl.glitch_to(0.55, 0.15)
	await get_tree().create_timer(1.0).timeout
	fxl.glitch_to(0.0, 0.2)
	shake = 0.0
	if eng.flag("diskIn") and player_name == "":
		term.clear()
		term.set_text("THE LAST QUEST\n\nTYPE YOUR NAME:\n")


func _fx_askname() -> void:
	await _zoom_to_screen()
	term.clear()
	var nm: String = await term.ask_name(["LOADING THE LAST QUEST ...", "", "TYPE YOUR NAME:"])
	player_name = nm
	hud.player_name = nm
	sfx.play("blip")
	for line in eng.episode.get("ending", []):
		voice.prefetch(_fmt(String(line)))
	_report_name(nm)
	await term.type_lines(["", "HELLO, %s." % nm.to_upper(), "ENTERING THE LAST QUEST ..."], 0.05)
	await get_tree().create_timer(0.7).timeout


func _fx_pullin() -> void:
	term.clickable = false
	voice.stop()
	hud.set_visible_all(false)
	var sf := room.named["screen_face"] as Node3D
	var sc_pos := sf.global_position + sf.global_transform.basis.z * 0.05
	# medium shot: the boy and the screen together
	# from the right-hand side, so the camera's path does not cross the boy
	var cam_pos := Vector3(1.75, 1.55, sc_pos.z + 3.0)
	var look_at_p := (sc_pos + hero.global_position) * 0.5 + Vector3(0.0, 0.3, 0)
	var shot := Transform3D(Basis.looking_at(look_at_p - cam_pos, Vector3.UP), cam_pos)
	fxl.glitch_to(0.45, 0.4)
	shake = 0.04
	await _cam_to(shot, 52.0, 0.0, 1.0)
	zoomed = true
	_shot("pull_1_shot")
	# the screen opens up
	vortex_quad.visible = true
	vortex_quad.scale = Vector3(0.25, 0.25, 0.25)
	vortex_mat.set_shader_parameter("amount", 0.0)
	sfx.play("whoosh", -6.0)
	sfx.play("glitch", -10.0)
	_param_to(vortex_mat, "amount", 0.0, 1.0, 0.8)
	create_tween().tween_property(vortex_quad, "scale", Vector3(1.0, 1.0, 1.0), 0.8)
	_param_to(vortex_mat, "spin", 0.0, 14.0, 4.5)
	var glow := OmniLight3D.new()
	glow.light_color = Color(0.45, 0.85, 1.0)
	glow.light_energy = 0.0
	glow.omni_range = 3.2
	room.add_child(glow)
	glow.global_position = sc_pos + sf.global_transform.basis.z * 0.3
	create_tween().tween_property(glow, "light_energy", 1.6, 1.0)
	shake = 0.07
	hero.set_process(false)
	hero.walking = false
	hero.face_point(sc_pos)
	hero.rotation.y = hero.face_yaw
	hero.play("Walk", 0.1, 2.4)
	if hero.shadow:
		hero.shadow.visible = false
	bits.global_position = sc_pos
	bits.emitting = true
	await get_tree().create_timer(0.6).timeout
	get_tree().create_timer(0.8).timeout.connect(func() -> void: _shot("pull_2_lifting"))
	get_tree().create_timer(1.6).timeout.connect(func() -> void: _shot("pull_3_stretching"))
	get_tree().create_timer(2.1).timeout.connect(func() -> void: _shot("pull_4_gone"))
	# he is lifted, spun and stretched into the screen
	var start := hero.global_position
	var axis := (sc_pos - start).normalized()
	var perp := axis.cross(Vector3.UP).normalized()
	var up_q := Quaternion(Vector3.UP, axis)
	var pull := create_tween()
	pull.tween_method(func(s: float) -> void:
		var e := clampf(s * s * (1.0 + 0.5 * s), 0.0, 1.0)
		var lift := Vector3.UP * 0.8 * sin(minf(s * 2.2, 1.0) * PI * 0.5) * (1.0 - e)
		var spiral := (perp * cos(s * 16.0) + Vector3.UP * sin(s * 16.0)) * 0.32 * (1.0 - e) * minf(s * 3.0, 1.0)
		var pos := start.lerp(sc_pos, e) + lift + spiral
		var q := Quaternion.IDENTITY.slerp(up_q, clampf(s * 1.7, 0.0, 1.0)) * Quaternion(Vector3.UP, s * 9.0)
		var k := pow(s, 2.0)
		var sc := 1.0 - 0.93 * pow(s, 2.4)
		var b := Basis(q) * Basis.from_scale(Vector3((1.0 - 0.55 * k) * sc, (1.0 + 0.9 * k) * sc, (1.0 - 0.55 * k) * sc))
		hero.global_transform = Transform3D(b, pos)
		bits.global_position = pos
		for l in room.lights:
			l.light_energy = 2.5 + randf() * 3.0, 0.0, 1.0, 2.3)
	await pull.finished
	hero.visible = false
	bits.emitting = false
	# everything goes white
	sfx.play("whoosh", -6.0, 0.7)
	await fxl.white_to(1.0, 0.35)
	fxl.glitch_to(0.0, 0.01)
	shake = 0.0
	vortex_quad.visible = false


# ---------- the end of the episode ----------

func _ending(lines: Array) -> void:
	sfx.music("")
	await get_tree().create_timer(0.4).timeout
	await fxl.black_to(1.0, 0.4)
	await fxl.white_to(0.0, 0.01)
	var shell := String(eng.episode.get("endingShell", "cold_world"))
	_switch_room("res://assets/%s.glb" % shell)
	hero.visible = false
	zoomed = false
	cam_base_v = -0.3
	hud.set_story_mode(true)
	hud.set_visible_all(true)
	hud.clear_messages()
	sfx.music("cold", -2.0)

	# he falls from the sky into the snow
	var land := room.spawn_hero
	var from := land + Vector3(0.0, 15.0, 0.0)
	hero.global_position = from
	hero.visible = true
	hero.play("Walk", 0.1, 0.6)
	if hero.shadow:
		hero.shadow.visible = false
	hero.set_process(false)
	var first := true
	if lines.size() > 0:
		_story_line(_fmt(String(lines[0])))
	await fxl.black_to(0.0, 1.0)
	_shot("e01_fall_start")
	sfx.play("fall", -14.0)
	var fall := create_tween()
	fall.tween_method(func(s: float) -> void:
		var e := s * s
		hero.global_position = from.lerp(land, e)
		hero.rotation = Vector3(s * 7.0, s * 5.0, s * 3.0) * (1.0 - e), 0.0, 1.0, 2.6)
	get_tree().create_timer(1.6).timeout.connect(func() -> void: _shot("e02_falling"))
	await fall.finished
	hero.rotation = Vector3.ZERO
	hero.set_process(true)
	hero.face_yaw = 0.0
	hero.play("Idle")
	if hero.shadow:
		hero.shadow.visible = true
	sfx.play("land", -10.0)
	shake = 0.08
	_snow_puff(land)
	await get_tree().create_timer(0.35).timeout
	shake = 0.0

	# Byte flies in
	byte = Node3D.new()
	var bm := (load("res://assets/byte.glb") as PackedScene).instantiate() as Node3D
	byte.add_child(bm)
	byte.scale = Vector3(1.4, 1.4, 1.4)
	world.add_child(byte)
	byte.global_position = room.spawn_byte + Vector3(8.0, 3.0, -2.0)
	var arrive := create_tween().set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
	arrive.tween_property(byte, "global_position", room.spawn_byte, 2.2)
	sfx.play("whoosh", -16.0, 1.6)

	for i in range(1, lines.size()):
		var line := _fmt(String(lines[i]))
		await _story_wait()
		if i == 3:
			await _shot("e03_byte")
		_story_line(line)
		if i == 1:
			hero.face_point(room.spawn_byte)
	await _story_wait()
	await _shot("e04_last_line")
	await _practice_break()
	await fxl.title_card("", "To be continued...", 3.5)
	_finish_episode()


## Before the episode ends Byte asks for a quick practice round of the words he met (if he met enough).
func _practice_break() -> void:
	if store.practice_pool(dictionary).size() < 4:
		return
	_story_line(String(base_data["ui"].get("practiceIntro", "")))
	await _story_wait()
	voice.stop()
	wordui.start_quiz()
	if autoplay:
		await get_tree().create_timer(1.2).timeout
		while wordui._quiz.visible:
			if wordui._quiz_body.visible and not wordui._answered:
				wordui._answer(int(wordui._questions[wordui._qi]["answer"]))
			await get_tree().create_timer(1.3).timeout
			if not wordui._quiz_body.visible:
				wordui.close_quiz()
	else:
		await wordui.closed


func _story_line(text: String) -> void:
	hud.add_message("intro", text)
	voice.say(text)     # the whole line: Kokoro picks Byte's voice from  Byte: "..."


func _story_wait() -> void:
	story_waiting = true
	hud.show_continue(true)
	if autoplay:
		await get_tree().create_timer(2.8).timeout
	else:
		await story_continue_pressed
	hud.show_continue(false)
	story_waiting = false


func _snow_puff(at: Vector3) -> void:
	var p := CPUParticles3D.new()
	p.amount = 40
	p.lifetime = 1.0
	p.one_shot = true
	p.explosiveness = 1.0
	p.direction = Vector3.UP
	p.spread = 80.0
	p.initial_velocity_min = 1.0
	p.initial_velocity_max = 3.0
	p.gravity = Vector3(0, -4.0, 0)
	var q := QuadMesh.new()
	q.size = Vector2(0.12, 0.12)
	var m := StandardMaterial3D.new()
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.albedo_color = Color(0.95, 0.97, 1.0, 0.85)
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	m.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
	q.material = m
	p.mesh = q
	world.add_child(p)
	p.global_position = at + Vector3(0, 0.1, 0)
	p.emitting = true
	get_tree().create_timer(2.0).timeout.connect(p.queue_free)


func _finish_episode() -> void:
	hud.add_message("say", "Level complete!  Score: %d of %d" % [eng.score(), eng.max_score()])
	sfx.play("fanfare", -8.0)
	hud.show_continue(false)
	if server != "" and (report_done or "--report" in args) and not autoplay:
		var http := HTTPRequest.new()
		add_child(http)
		http.request(server + "/api/episode-done", ["Content-Type: application/json"], HTTPClient.METHOD_POST,
			JSON.stringify({"episode": episode_id}))
		print("REPORTED to the server: episode done")
	print("EPISODE DONE ", episode_id, " score ", eng.score(), "/", eng.max_score(), "  voices from the server: ",
		voice.stats["server"], ", from the computer: ", voice.stats["fallback"])
	if autoplay:
		await get_tree().create_timer(2.0).timeout
		get_tree().quit()


# ---------- frame update ----------

func _process(_delta: float) -> void:
	if cam == null:
		return
	var s := shake
	cam.h_offset = randf_range(-s, s) if s > 0.0 else 0.0
	cam.v_offset = cam_base_v + (randf_range(-s, s) if s > 0.0 else 0.0)
	if byte != null and is_instance_valid(byte):
		var t := Time.get_ticks_msec() / 1000.0
		var bm := byte.get_child(0)
		var flap := sin(t * 14.0) * 0.55
		var l := bm.find_child("wing_pivot_L", true, false)
		var r := bm.find_child("wing_pivot_R", true, false)
		if l:
			(l as Node3D).rotation.z = flap
		if r:
			(r as Node3D).rotation.z = -flap
		bm.position.y = sin(t * 2.4) * 0.07
		byte.rotation.y = sin(t * 1.3) * 0.25      # faces the camera, sways a little


# ---------- the robot player (for the demo video) ----------

func _shot(name: String) -> void:
	if not take_shots:
		return
	await RenderingServer.frame_post_draw
	var dir := ProjectSettings.globalize_path(SHOTS_DIR)
	DirAccess.make_dir_recursive_absolute(dir)
	get_viewport().get_texture().get_image().save_png("%s/%s.png" % [dir, name])
	print("SHOT ", name, " cam=", cam.global_position, " fov=", cam.fov, " hero=", hero.global_position, " hero_scale=", hero.global_transform.basis.get_scale())


func _wait_idle() -> void:
	await get_tree().create_timer(0.1).timeout
	while busy:
		await get_tree().create_timer(0.1).timeout


func _autoplay() -> void:
	await get_tree().create_timer(1.2).timeout
	await _shot("p01_start")
	var steps := [
		["look", "computer", ""], ["open", "box", ""], ["take", "cable", ""], ["take", "disk", ""],
		["use", "computer", "cable"], ["use", "keyboard", "disk"],
	]
	var n := 2
	for s in steps:
		_do(s[0], s[1], s[2])
		await _wait_idle()
		await get_tree().create_timer(0.5).timeout
		await _shot("p%02d_%s_%s" % [n, s[0], s[1]])
		n += 1
	# talk to the computer: the screen takes over, he types his name
	_do("talk", "computer", "")
	await get_tree().create_timer(4.6).timeout
	await _shot("p%02d_screen_zoom" % n)
	n += 1
	while not term.input_active:
		await get_tree().create_timer(0.1).timeout
	# click on the words of the old computer's screen until a word card opens
	var clicked := false
	for yy in range(70, 600, 18):
		for xx in range(240, 1000, 30):
			_click_terminal(Vector2(xx, yy))
			if wordui._card.visible:
				clicked = true
				break
		if clicked:
			break
	print("SCREEN WORD CLICK: ", clicked, " word=", wordui._card_current)
	await get_tree().create_timer(0.4).timeout
	await _shot("p%02d_screen_word_card" % n)
	n += 1
	wordui.close_card()
	for ch in "Alex":
		term.typed += ch
		term.key_typed.emit()
		await get_tree().create_timer(0.25).timeout
	await _shot("p%02d_name_typed" % n)
	n += 1
	term.name_entered.emit("Alex")
	await get_tree().create_timer(2.6).timeout
	await _shot("p%02d_hello" % n)


## Robot for the word screens: collects words, opens the card, the book and a practice round.
func _words_demo() -> void:
	await get_tree().create_timer(1.0).timeout
	store.mark_seen_text("attic computer cable disk keyboard late dark moon box old desk window light screen floor name type")
	_update_word_stats()
	hud.refresh_text()
	await _shot("w01_start")
	_on_word("attic", "You are in Grandpa's attic. It is late and dark.")
	await get_tree().create_timer(0.4).timeout
	await _shot("w02_card")
	wordui.close_card()
	_on_word("computer", "There is an old computer on the desk.")
	wordui.close_card()
	store.mark_known("moon")
	store.answer("box", true)
	store.answer("box", true)
	store.answer("box", true)
	hud.refresh_text()
	await get_tree().create_timer(0.3).timeout
	await _shot("w03_text_colours")
	wordui.show_book()
	await get_tree().create_timer(0.3).timeout
	await _shot("w04_book")
	wordui.start_quiz()
	await get_tree().create_timer(0.4).timeout
	await _shot("w05_quiz")
	wordui._answer(int(wordui._questions[0]["answer"]))
	await get_tree().create_timer(0.3).timeout
	await _shot("w06_quiz_right")
	for i in range(1, wordui._questions.size()):
		await get_tree().create_timer(1.15).timeout
		wordui._answer(int(wordui._questions[i]["answer"]) if i % 3 != 0 else (int(wordui._questions[i]["answer"]) + 1) % 3)
	await get_tree().create_timer(2.2).timeout
	await _shot("w07_quiz_done")
	get_tree().quit()


## Presses the mouse on the first word of the goal, like a real click (not a function call).
func _click_test() -> void:
	await get_tree().create_timer(1.5).timeout
	for p in [Vector2(135, 38), Vector2(300, 520), Vector2(120, 505)]:
		for pressed in [true, false]:
			var ev := InputEventMouseButton.new()
			ev.position = p
			ev.global_position = p
			ev.button_index = MOUSE_BUTTON_LEFT
			ev.pressed = pressed
			Input.parse_input_event(ev)
			await get_tree().create_timer(0.05).timeout
		await get_tree().create_timer(0.6).timeout
		print("CLICK TEST at ", p, " card visible: ", wordui._card.visible, " word=", wordui._card_current)
		if wordui._card.visible:
			await _shot("click_test_card")
			wordui.close_card()
	get_tree().quit()
