class_name Settings
extends RefCounted
## What he can change himself: volumes, text size, full screen, picture quality. Saved on this PC.
## Also remembers which first-time tips he has already seen.

const FILE := "user://settings.json"

var music := 0.8        # 0..1
var effects := 0.8
var voice := 1.0
var text_scale := 1.0   # 1.0, 1.15, 1.3
var fullscreen := false
var quality := "high"   # "high" or "low" (no ambient occlusion or glow, no smoothing: for slow PCs)
var voice_on := true
var seen: Dictionary = {}
var path := FILE


static func to_db(v: float) -> float:
	return linear_to_db(clampf(v, 0.0001, 1.0))


func load_file(from: String = "") -> void:
	var f := FileAccess.open(from if from != "" else path, FileAccess.READ)
	if f == null:
		return
	var d: Variant = JSON.parse_string(f.get_as_text())
	if not (d is Dictionary):
		return
	music = clampf(float(d.get("music", music)), 0.0, 1.0)
	effects = clampf(float(d.get("effects", effects)), 0.0, 1.0)
	voice = clampf(float(d.get("voice", voice)), 0.0, 1.0)
	text_scale = clampf(float(d.get("text_scale", text_scale)), 1.0, 1.5)
	fullscreen = bool(d.get("fullscreen", fullscreen))
	quality = String(d.get("quality", quality))
	voice_on = bool(d.get("voice_on", voice_on))
	var s: Variant = d.get("seen")
	if s is Dictionary:
		seen = s


func save_file(to: String = "") -> void:
	var f := FileAccess.open(to if to != "" else path, FileAccess.WRITE)
	if f:
		f.store_string(JSON.stringify({
			"music": music, "effects": effects, "voice": voice, "text_scale": text_scale,
			"fullscreen": fullscreen, "quality": quality, "voice_on": voice_on, "seen": seen,
		}))


func tip_seen(id: String) -> bool:
	return bool(seen.get(id, false))


func mark_tip(id: String) -> void:
	seen[id] = true
	save_file()
