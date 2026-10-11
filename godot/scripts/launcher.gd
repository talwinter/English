extends Control
## The first scene. Asks the server whether there is a newer version of the game files (scripts, rooms, models,
## sounds), downloads it once, loads it over the files that came with the game, and starts the game.
## It never blocks the son for long: no server, no answer in 5 seconds, or a bad file all mean "start with what
## is here". A version that crashed the game is remembered and not used again.
##
## The pack is made on the dev PC (tools/make-update.ps1, tools/push-update.js) and lives on the server:
##   GET /updates/manifest.json  ->  { "version", "file", "size", "sha256" }
##   GET /updates/<file>
## Keep this file small and stable: it is the one part that an update cannot change.

const State := preload("res://scripts/update_state.gd")

var _status: Label
var _bar: ProgressBar
var _http: HTTPRequest


func _ready() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	_build()
	await get_tree().process_frame
	await get_tree().process_frame
	var args := OS.get_cmdline_user_args()
	var state := State.load_state()
	# a version that never reached the title screen crashed the game: put it aside
	if String(state["pending"]) != "":
		(state["bad"] as Array).append(String(state["pending"]))
		_forget_packs()
		state["installed"] = ""
		state["pending"] = ""
		State.save_state(state)
		print("UPDATE: the last update did not start, going back")
	var server := _server(args)
	var may_check := server != "" and not ("--no-update" in args) and not ("--autoplay" in args)
	if may_check:
		await _check(server, state)
	_load_installed(State.load_state())
	get_tree().change_scene_to_file("res://main.tscn")


func _build() -> void:
	var bg := ColorRect.new()
	bg.color = Color(0.04, 0.05, 0.1)
	bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(bg)
	var col := VBoxContainer.new()
	col.set_anchors_preset(Control.PRESET_CENTER)
	col.offset_left = -220
	col.offset_right = 220
	col.offset_top = -50
	col.offset_bottom = 50
	col.add_theme_constant_override("separation", 10)
	add_child(col)
	var title := Label.new()
	title.text = "ENGLISH QUEST"
	title.add_theme_font_size_override("font_size", 30)
	title.add_theme_color_override("font_color", Color(1.0, 0.82, 0.25))
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	col.add_child(title)
	_status = Label.new()
	_status.text = "Starting ..."
	_status.add_theme_font_size_override("font_size", 16)
	_status.add_theme_color_override("font_color", Color(0.75, 0.8, 0.95))
	_status.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	col.add_child(_status)
	_bar = ProgressBar.new()
	_bar.custom_minimum_size = Vector2(0, 8)
	_bar.show_percentage = false
	_bar.visible = false
	col.add_child(_bar)
	_http = HTTPRequest.new()
	add_child(_http)


## The same rules as the game: godot/config.json, --server=, --no-server.
func _server(args: PackedStringArray) -> String:
	if "--no-server" in args:
		return ""
	var s := ""
	var f := FileAccess.open(ProjectSettings.globalize_path("res://config.json"), FileAccess.READ)
	if f != null:
		var d: Variant = JSON.parse_string(f.get_as_text())
		if d is Dictionary:
			s = String((d as Dictionary).get("server", "")).strip_edges().rstrip("/")
	for a in args:
		if a.begins_with("--server="):
			s = a.trim_prefix("--server=").rstrip("/")
	return s


func _check(server: String, state: Dictionary) -> void:
	_status.text = "Looking for news ..."
	_http.timeout = 5.0
	if _http.request(server + "/updates/manifest.json") != OK:
		return
	var res: Array = await _http.request_completed
	if res[0] != HTTPRequest.RESULT_SUCCESS or res[1] != 200:
		return
	var m: Variant = JSON.parse_string((res[3] as PackedByteArray).get_string_from_utf8())
	if not (m is Dictionary):
		return
	var version := String(m.get("version", ""))
	var file := String(m.get("file", ""))
	if version == "" or file == "" or file.contains("/") or file.contains(".."):
		return
	if (state["bad"] as Array).has(version):
		return
	var path := "%s/%s" % [State.DIR, file]
	if String(state["installed"]) == version and FileAccess.file_exists(path):
		return
	# a new version: download it next to the old one, check it, then switch
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(State.DIR))
	var part := path + ".part"
	_status.text = "Updating the game ..."
	_bar.visible = true
	_bar.max_value = maxf(1.0, float(m.get("size", 1)))
	_http.timeout = 0.0
	_http.download_file = ProjectSettings.globalize_path(part)
	if _http.request("%s/updates/%s" % [server, file]) != OK:
		return
	await _http.request_completed
	_http.download_file = ""
	_bar.value = _bar.max_value
	if not FileAccess.file_exists(part):
		return
	var want := String(m.get("sha256", ""))
	if want != "" and FileAccess.get_sha256(part).to_lower() != want.to_lower():
		push_warning("UPDATE: the downloaded file is not complete, skipped")
		DirAccess.remove_absolute(ProjectSettings.globalize_path(part))
		return
	_forget_packs()
	DirAccess.rename_absolute(ProjectSettings.globalize_path(part), ProjectSettings.globalize_path(path))
	state["installed"] = version
	state["pending"] = version
	State.save_state(state)
	print("UPDATE: installed ", version)


func _load_installed(state: Dictionary) -> void:
	var version := String(state["installed"])
	if version == "":
		return
	var dir := DirAccess.open(State.DIR)
	if dir == null:
		return
	for f in dir.get_files():
		if f.ends_with(".pck"):
			var ok := ProjectSettings.load_resource_pack(ProjectSettings.globalize_path("%s/%s" % [State.DIR, f]), true)
			print("UPDATE: loaded ", f, " -> ", ok)


func _forget_packs() -> void:
	var dir := DirAccess.open(State.DIR)
	if dir == null:
		return
	for f in dir.get_files():
		if f.ends_with(".pck"):
			DirAccess.remove_absolute(ProjectSettings.globalize_path("%s/%s" % [State.DIR, f]))
