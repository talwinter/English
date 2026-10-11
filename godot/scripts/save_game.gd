class_name SaveGame
extends RefCounted
## One save file per episode (user://save_<episode>.json): the engine state (scene, goal, flags, bag, points),
## where the hero stands, his name, whether Byte has joined, and the last messages. The game saves after every
## action, so he can stop at any moment and come back to the same place, even in a long episode.

const VERSION := 1


static func path(episode_id: String) -> String:
	return "user://save_%s.json" % episode_id


static func exists(episode_id: String) -> bool:
	return FileAccess.file_exists(path(episode_id))


static func write(episode_id: String, data: Dictionary) -> void:
	data["version"] = VERSION
	data["saved_at"] = Time.get_datetime_string_from_system()
	var f := FileAccess.open(path(episode_id), FileAccess.WRITE)
	if f:
		f.store_string(JSON.stringify(data))


static func read(episode_id: String) -> Dictionary:
	var f := FileAccess.open(path(episode_id), FileAccess.READ)
	if f == null:
		return {}
	var d: Variant = JSON.parse_string(f.get_as_text())
	if d is Dictionary and int((d as Dictionary).get("version", 0)) == VERSION:
		return d
	return {}


static func delete(episode_id: String) -> void:
	if exists(episode_id):
		DirAccess.remove_absolute(ProjectSettings.globalize_path(path(episode_id)))
