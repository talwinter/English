class_name Terminal
extends SubViewport
## The old computer's screen: green text on black, typed one letter at a time. It is a SubViewport, so its
## picture can be put on the monitor in the room (and fill the whole window when the camera zooms in).

signal name_entered(text: String)
signal key_typed
signal word_clicked(word: String, sentence: String)

var label: RichTextLabel
## Set by the game: is this word worth a card (it has a Hebrew meaning and is not a tiny grammar word)?
var is_clickable_word: Callable = Callable()
var clickable := false      # true while the camera is close to the screen
var _words: Array = []
var _lines: Array = []
var _shown := ""
var _word_re: RegEx
var content := ""
var typed := ""
var input_active := false
var cursor_on := true
var cursor_visible := true
var _blink := 0.0
var _letters: RegEx


func _init() -> void:
	size = Vector2i(512, 384)
	render_target_update_mode = SubViewport.UPDATE_ALWAYS
	var bg := ColorRect.new()
	bg.color = Color(0.008, 0.04, 0.018)
	bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(bg)
	label = RichTextLabel.new()
	label.set_anchors_preset(Control.PRESET_FULL_RECT)
	label.offset_left = 30
	label.offset_top = 26
	label.offset_right = -20
	label.offset_bottom = -20
	label.bbcode_enabled = true
	label.scroll_active = false
	label.meta_underlined = false
	label.add_theme_color_override("default_color", Color(0.38, 1.0, 0.52))
	label.add_theme_font_size_override("normal_font_size", 27)
	var f := SystemFont.new()
	f.font_names = PackedStringArray(["Consolas", "Lucida Console", "Courier New", "monospace"])
	label.add_theme_font_override("normal_font", f)
	label.meta_clicked.connect(func(meta: Variant) -> void:
		var i := int(String(meta))
		if i >= 0 and i < _words.size():
			word_clicked.emit(String(_words[i][0]), String(_words[i][1])))
	bg.add_child(label)
	_word_re = RegEx.new()
	_word_re.compile("[A-Za-z]+(?:'[A-Za-z]+)?")
	_letters = RegEx.new()
	_letters.compile("^[\\p{L} \\-]$")


func _process(delta: float) -> void:
	_blink += delta
	if _blink > 0.5:
		_blink = 0.0
		cursor_on = not cursor_on
	var shown := content
	if input_active:
		shown += typed.to_upper()
	var key := "%s|%s|%s" % [shown, cursor_visible and cursor_on, clickable]
	if key == _shown:
		return
	_shown = key
	label.text = _bbcode(shown) + ("_" if cursor_visible and cursor_on else "")


## The screen's text, with words that have a meaning made clickable (a lighter green, underlined).
func _bbcode(text: String) -> String:
	_words.clear()
	var out := ""
	var lines := text.split("
")
	for li in lines.size():
		var line: String = lines[li]
		var safe := line.replace("[", "[lb]")
		var last := 0
		var piece := ""
		for m in _word_re.search_all(safe):
			var w := m.get_string()
			piece += safe.substr(last, m.get_start() - last)
			var lw := w.to_lower()
			if clickable and is_clickable_word.is_valid() and bool(is_clickable_word.call(lw)):
				_words.append([lw, line])
				piece += "[url=%d][u][color=#b8ffc8]%s[/color][/u][/url]" % [_words.size() - 1, w]
			else:
				piece += w
			last = m.get_end()
		piece += safe.substr(last)
		out += piece + ("
" if li < lines.size() - 1 else "")
	return out


func clear() -> void:
	content = ""
	typed = ""
	input_active = false


func set_text(t: String) -> void:
	content = t


## Types the lines one letter at a time (key_typed is emitted for each letter, for the click sound).
func type_lines(lines: Array, speed: float = 0.04) -> void:
	for line in lines:
		for ch in String(line):
			content += ch
			if ch != " ":
				key_typed.emit()
			await get_tree().create_timer(speed).timeout
		content += "\n"
		await get_tree().create_timer(0.22).timeout


## Shows the prompt and waits until he types a name and presses Enter. Returns the name.
func ask_name(prompt_lines: Array) -> String:
	await type_lines(prompt_lines, 0.04)
	typed = ""
	input_active = true
	var result: String = await name_entered
	input_active = false
	return result


## Key presses go here while the screen is asking for a name. Returns true when it used the key.
func handle_key(ev: InputEventKey) -> bool:
	if not input_active or not ev.pressed or ev.echo:
		return false
	if ev.keycode == KEY_ENTER or ev.keycode == KEY_KP_ENTER:
		var t := typed.strip_edges()
		if t != "":
			content += typed.to_upper() + "\n"
			typed = ""
			name_entered.emit(t)
		return true
	if ev.keycode == KEY_BACKSPACE:
		if typed.length() > 0:
			typed = typed.substr(0, typed.length() - 1)
			key_typed.emit()
		return true
	if ev.unicode >= 32 and ev.unicode != 127:
		var ch := String.chr(ev.unicode)
		if typed.length() < 14 and _letters.search(ch) != null:
			typed += ch
			key_typed.emit()
		return true
	return false
