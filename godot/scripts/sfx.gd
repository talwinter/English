class_name Sfx
extends Node
## Sound effects and music. Files live in res://audio/<name>.wav (made by godot/tools/make_sounds.py);
## a missing file is just silent. Music loops and crossfades.

var _sfx: Dictionary = {}
var _players: Array[AudioStreamPlayer] = []
var _music_a: AudioStreamPlayer
var _music_b: AudioStreamPlayer
var _music_name := ""
var _amb: AudioStreamPlayer
var _amb_name := ""
var music_on := true
var volume_db := 0.0       # sound effects
var music_gain_db := 0.0   # music, set from the settings
var _duck_db := 0.0


func _ready() -> void:
	volume_db = -9.0   # sound effects sit under the voice
	for i in 8:
		var p := AudioStreamPlayer.new()
		add_child(p)
		_players.append(p)
	# music has its own bus, so it can be ducked while someone speaks
	if AudioServer.get_bus_index("Music") == -1:
		AudioServer.add_bus()
		var i := AudioServer.bus_count - 1
		AudioServer.set_bus_name(i, "Music")
		AudioServer.set_bus_send(i, "Master")
	_music_a = AudioStreamPlayer.new()
	_music_b = AudioStreamPlayer.new()
	_music_a.bus = "Music"
	_music_b.bus = "Music"
	add_child(_music_a)
	add_child(_music_b)
	_amb = AudioStreamPlayer.new()
	_amb.bus = "Music"
	add_child(_amb)


## Lowers the music while a voice is speaking, so the narrator is always clear.
func duck(on: bool) -> void:
	var tw := create_tween()
	tw.tween_method(func(v: float) -> void:
		_duck_db = v
		_apply_music_bus(), _duck_db, -14.0 if on else 0.0, 0.25)


func set_music_gain(db: float) -> void:
	music_gain_db = db
	_apply_music_bus()


func _apply_music_bus() -> void:
	var i := AudioServer.get_bus_index("Music")
	if i != -1:
		AudioServer.set_bus_volume_db(i, music_gain_db + _duck_db)


func _stream(name: String) -> AudioStream:
	if not _sfx.has(name):
		var path := "res://audio/%s.wav" % name
		_sfx[name] = load(path) if ResourceLoader.exists(path) else null
	return _sfx[name]


func play(name: String, vol: float = 0.0, pitch: float = 1.0) -> void:
	var s := _stream(name)
	if s == null:
		return
	for p in _players:
		if not p.playing:
			p.stream = s
			p.volume_db = vol + volume_db
			p.pitch_scale = pitch
			p.play()
			return


func _loop(s: AudioStream) -> AudioStream:
	if s is AudioStreamWAV:
		var w := (s as AudioStreamWAV).duplicate() as AudioStreamWAV
		w.loop_mode = AudioStreamWAV.LOOP_FORWARD
		w.loop_begin = 0
		var bytes_per_sample := 2 if w.format == AudioStreamWAV.FORMAT_16_BITS else 1
		w.loop_end = w.data.size() / (bytes_per_sample * (2 if w.stereo else 1))
		return w
	return s


## A quiet loop under the music: wind outside, a crackling fire inside.
func ambience(name: String, vol: float = -14.0) -> void:
	if name == _amb_name:
		return
	_amb_name = name
	if name == "":
		var tw := create_tween()
		tw.tween_property(_amb, "volume_db", -60.0, 1.0)
		tw.tween_callback(_amb.stop)
		return
	var s := _stream(name)
	if s == null:
		return
	_amb.stream = _loop(s)
	_amb.volume_db = -60.0
	_amb.play()
	create_tween().tween_property(_amb, "volume_db", vol, 1.5)


func music(name: String, vol: float = -2.0) -> void:
	if name == "glitch":
		name = "glitch_music"      # "glitch" is also the name of the sound effect
	if name == _music_name:
		return
	_music_name = name
	var old := _music_a if _music_a.playing else _music_b
	var fresh := _music_b if old == _music_a else _music_a
	if old.playing:
		var tw := create_tween()
		tw.tween_property(old, "volume_db", -60.0, 1.2)
		tw.tween_callback(old.stop)
	if name == "" or not music_on:
		return
	var s := _stream(name)
	if s == null:
		return
	s = _loop(s)
	fresh.stream = s
	fresh.volume_db = -60.0
	fresh.play()
	create_tween().tween_property(fresh, "volume_db", vol, 1.5)
