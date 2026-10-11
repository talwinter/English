extends RefCounted
## What the launcher remembers about game updates (user://updates/state.json):
##   installed  the version of the content pack that is loaded at start
##   pending    a version that was just installed and has not yet reached the title screen; if it is still set at
##              the next start, that version crashed the game and is never used again
##   bad        versions that are not used
## Used through preload("res://scripts/update_state.gd"), not by class_name: a pack can add new files, and the
## engine only knows class names from the files it was started with.

const DIR := "user://updates"
const FILE := "user://updates/state.json"


static func load_state() -> Dictionary:
	var f := FileAccess.open(FILE, FileAccess.READ)
	var d: Dictionary = {"installed": "", "pending": "", "bad": []}
	if f != null:
		var parsed: Variant = JSON.parse_string(f.get_as_text())
		if parsed is Dictionary:
			for k in d:
				if (parsed as Dictionary).has(k):
					d[k] = parsed[k]
	return d


static func save_state(d: Dictionary) -> void:
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(DIR))
	var f := FileAccess.open(FILE, FileAccess.WRITE)
	if f != null:
		f.store_string(JSON.stringify(d))


## The game reached the title screen: the installed version works.
static func confirm() -> void:
	var d := load_state()
	if String(d.get("pending", "")) != "":
		d["pending"] = ""
		save_state(d)
