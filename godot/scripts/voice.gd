class_name Voice
extends Node
## Reads lines aloud. From the server's Kokoro voices when it has the line (/api/voice), and at once from the
## computer's own text-to-speech otherwise: the son must always hear a line when it appears, never silence.
## A line like  Byte: "Hello!"  is said by Byte, everything else by the narrator. The server picks the
## voice from the whole line; offline each character gets its own voice and pitch.

signal speaking(on: bool)

const CHAR_PITCH := {"byte": 1.5, "grandmother": 0.82, "grandma": 0.82, "wolf": 0.6, "father": 0.75, "troll": 0.55}

var server := ""             # e.g. http://192.168.1.50:8080 ; empty = no server (offline)
var enabled := true
var _http: HTTPRequest
var _player: AudioStreamPlayer
var _tts_voices: PackedStringArray = PackedStringArray()
var _serial := 0
var _req_kind := ""
var _req_text := ""
var _req_slow := false
var _req_serial := 0
var stats := {"server": 0, "fallback": 0}
var _line_re: RegEx


func _ready() -> void:
	_http = HTTPRequest.new()
	_http.timeout = 8.0
	add_child(_http)
	_http.request_completed.connect(_on_completed)
	_player = AudioStreamPlayer.new()
	add_child(_player)
	_line_re = RegEx.new()
	_line_re.compile("^([A-Z][A-Za-z]*(?: [A-Z][A-Za-z]*)?): \"([^\"]+)\"$")
	_tts_voices = DisplayServer.tts_get_voices_for_language("en")
	if _tts_voices.size() == 0:
		_tts_voices = PackedStringArray()
		for v in DisplayServer.tts_get_voices():
			if String(v.get("language", "")).begins_with("en"):
				_tts_voices.append(String(v["id"]))
	_player.finished.connect(func() -> void: speaking.emit(false))
	DisplayServer.tts_set_utterance_callback(DisplayServer.TTS_UTTERANCE_STARTED, func(_id: int) -> void: speaking.emit(true))
	DisplayServer.tts_set_utterance_callback(DisplayServer.TTS_UTTERANCE_ENDED, func(_id: int) -> void: speaking.emit(false))
	DisplayServer.tts_set_utterance_callback(DisplayServer.TTS_UTTERANCE_CANCELED, func(_id: int) -> void: speaking.emit(false))


func stop() -> void:
	_serial += 1
	_req_kind = ""
	_player.stop()
	if _http.get_http_client_status() != HTTPClient.STATUS_DISCONNECTED:
		_http.cancel_request()
	if DisplayServer.tts_is_speaking():
		DisplayServer.tts_stop()


## { who: "narrator" or a lowercase name, say: the words to say }
func parse(text: String) -> Dictionary:
	var m := _line_re.search(text)
	if m == null:
		return {"who": "narrator", "say": text}
	return {"who": m.get_string(1).to_lower(), "say": m.get_string(2)}


func say(text: String, slow: bool = false) -> void:
	if not enabled or text.strip_edges() == "":
		return
	stop()
	if server != "":
		var url := "%s/api/voice?wait=0&text=%s%s" % [server, text.uri_encode(), "&slow=1" if slow else ""]
		if _request(url, "info", text, slow):
			return
	_speak_tts(text, slow)


## One request at a time; the single handler below knows which kind of answer it is waiting for.
func _request(url: String, kind: String, text: String, slow: bool) -> bool:
	_req_kind = kind
	_req_text = text
	_req_slow = slow
	_req_serial = _serial
	if _http.request(url) != OK:
		_req_kind = ""
		return false
	return true


func _on_completed(result: int, code: int, _h: PackedStringArray, body: PackedByteArray) -> void:
	var kind := _req_kind
	_req_kind = ""
	if kind == "" or _req_serial != _serial:
		return          # an old answer: a newer line is already being said
	var ok := result == HTTPRequest.RESULT_SUCCESS and code == 200
	if kind == "info":
		if ok:
			var info: Variant = JSON.parse_string(body.get_string_from_utf8())
			if info is Dictionary and info.get("audio") != null:
				if _request(server + String(info["audio"]), "audio", _req_text, _req_slow):
					return
		_speak_tts(_req_text, _req_slow)     # the line is not made yet: the computer's voice, at once
	elif kind == "audio":
		if ok:
			var mp3 := AudioStreamMP3.new()
			mp3.data = body
			_player.stream = mp3
			_player.volume_db = 4.0
			_player.play()
			stats["server"] += 1
			speaking.emit(true)
			return
		_speak_tts(_req_text, _req_slow)


## Each character gets the same voice every time: the narrator the first English voice, the others
## different ones when the computer has more than one.
func _voice_for(who: String) -> String:
	if _tts_voices.size() == 0:
		return ""
	if who == "narrator" or _tts_voices.size() == 1:
		return _tts_voices[0]
	var h := 0
	for c in who:
		h = (h * 31 + c.unicode_at(0)) & 0x7fffffff
	return _tts_voices[1 + h % (_tts_voices.size() - 1)]


## Asks the server to make a line now (no sound), so it is ready when it is needed a few seconds later.
func prefetch(text: String) -> void:
	if server == "" or text.strip_edges() == "":
		return
	var h := HTTPRequest.new()
	h.timeout = 8.0
	add_child(h)
	h.request_completed.connect(func(_r: int, _c: int, _hd: PackedStringArray, _b: PackedByteArray) -> void: h.queue_free())
	if h.request("%s/api/voice?wait=0&text=%s" % [server, text.uri_encode()]) != OK:
		h.queue_free()


func _speak_tts(text: String, slow: bool) -> void:
	stats["fallback"] += 1
	var p := parse(text)
	var voice_id := _voice_for(String(p["who"]))
	if voice_id == "":
		return
	var spoken := String(p["say"])
	# ALL CAPS words are read as words, not spelled out
	var caps := RegEx.new()
	caps.compile("\\b[A-Z]{3,}\\b")
	for m in caps.search_all(spoken):
		var w := m.get_string()
		spoken = spoken.replace(w, w.substr(0, 1) + w.substr(1).to_lower())
	var pitch: float = float(CHAR_PITCH.get(String(p["who"]), 1.0))
	DisplayServer.tts_speak(spoken, voice_id, 100, pitch, 0.8 if slow else 1.0, 0, true)
