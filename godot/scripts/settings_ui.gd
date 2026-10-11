class_name SettingsUi
extends CanvasLayer
## The menu he opens himself: volumes, text size, full screen, picture quality, start the episode again.

signal changed
signal restart_requested
signal report_requested(note: String)
signal closed

const GOLD := Color(1.0, 0.82, 0.25)

var settings: Settings
var _root: Control
var _sliders: Dictionary = {}
var _size_buttons: Array[Button] = []
var _quality_buttons: Array[Button] = []
var _fullscreen: CheckButton
var _voice_on: CheckButton
var _confirm: Control
var _note: LineEdit
var _thanks: Label


func setup(s: Settings) -> void:
	settings = s
	layer = 45
	_root = Control.new()
	_root.visible = false
	_root.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(_root)
	var dim := ColorRect.new()
	dim.color = Color(0, 0, 0, 0.7)
	dim.set_anchors_preset(Control.PRESET_FULL_RECT)
	_root.add_child(dim)
	var panel := PanelContainer.new()
	panel.set_anchors_preset(Control.PRESET_CENTER)
	panel.offset_left = -360
	panel.offset_right = 360
	panel.offset_top = -340
	panel.offset_bottom = 340
	panel.add_theme_stylebox_override("panel", Hud._style(Color(0.05, 0.05, 0.1, 0.99), Color(0.4, 0.4, 0.65), 16))
	_root.add_child(panel)
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 12)
	panel.add_child(col)

	var title := Label.new()
	title.text = "Menu   ·   הגדרות"
	title.add_theme_font_size_override("font_size", 38)
	title.add_theme_color_override("font_color", GOLD)
	col.add_child(title)

	_add_slider(col, "music", "Music  ·  מוזיקה")
	_add_slider(col, "effects", "Sounds  ·  צלילים")
	_add_slider(col, "voice", "Voice  ·  קול")

	_voice_on = CheckButton.new()
	_voice_on.text = "Read everything aloud  ·  הקראה"
	_voice_on.add_theme_font_size_override("font_size", 24)
	_voice_on.toggled.connect(func(on: bool) -> void:
		settings.voice_on = on
		_changed())
	col.add_child(_voice_on)

	col.add_child(_row_label("Text size  ·  גודל כתב"))
	var sizes := HBoxContainer.new()
	sizes.add_theme_constant_override("separation", 8)
	col.add_child(sizes)
	var steps := [["Normal", 1.0], ["Big", 1.15], ["Bigger", 1.3]]
	for st in steps:
		var b := _button(String(st[0]))
		var v: float = st[1]
		b.pressed.connect(func() -> void:
			settings.text_scale = v
			_changed())
		sizes.add_child(b)
		_size_buttons.append(b)

	col.add_child(_row_label("Picture quality  ·  איכות תמונה"))
	var q := HBoxContainer.new()
	q.add_theme_constant_override("separation", 8)
	col.add_child(q)
	for name in ["high", "low"]:
		var b := _button("Best" if name == "high" else "Simple (faster)")
		var qn: String = name
		b.pressed.connect(func() -> void:
			settings.quality = qn
			_changed())
		q.add_child(b)
		_quality_buttons.append(b)

	_fullscreen = CheckButton.new()
	_fullscreen.text = "Full screen  ·  מסך מלא"
	_fullscreen.add_theme_font_size_override("font_size", 24)
	_fullscreen.toggled.connect(func(on: bool) -> void:
		settings.fullscreen = on
		_changed())
	col.add_child(_fullscreen)

	col.add_child(_row_label("Something wrong?  ·  משהו לא בסדר?"))
	var rep_row := HBoxContainer.new()
	rep_row.add_theme_constant_override("separation", 8)
	col.add_child(rep_row)
	_note = LineEdit.new()
	_note.placeholder_text = "What is wrong? (you can write in Hebrew)  ·  מה לא בסדר?"
	_note.add_theme_font_size_override("font_size", 21)
	_note.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	rep_row.add_child(_note)
	var send := _button("Tell us  ·  שלח")
	send.pressed.connect(func() -> void:
		report_requested.emit(_note.text)
		_note.clear()
		_thanks.text = "Thank you! We will fix it.  ·  תודה! נתקן את זה."
		_thanks.visible = true)
	rep_row.add_child(send)
	_thanks = Label.new()
	_thanks.visible = false
	_thanks.add_theme_font_size_override("font_size", 22)
	_thanks.add_theme_color_override("font_color", Color(0.45, 0.9, 0.55))
	col.add_child(_thanks)

	var foot := HBoxContainer.new()
	foot.add_theme_constant_override("separation", 12)
	col.add_child(foot)
	var again := _button("Start this episode again")
	again.pressed.connect(func() -> void: _confirm.visible = true)
	foot.add_child(again)
	var sp := Control.new()
	sp.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	foot.add_child(sp)
	var close := _button("Close")
	close.pressed.connect(close_menu)
	foot.add_child(close)

	# a small "are you sure?" over the menu
	_confirm = PanelContainer.new()
	_confirm.visible = false
	_confirm.set_anchors_preset(Control.PRESET_CENTER)
	_confirm.offset_left = -300
	_confirm.offset_right = 300
	_confirm.offset_top = -90
	_confirm.offset_bottom = 90
	(_confirm as PanelContainer).add_theme_stylebox_override("panel", Hud._style(Color(0.1, 0.05, 0.05, 1.0), Color(1, 0.4, 0.4), 14))
	_root.add_child(_confirm)
	var cc := VBoxContainer.new()
	_confirm.add_child(cc)
	var ql := Label.new()
	ql.text = "Start again from the beginning?\nלהתחיל את הפרק מההתחלה?"
	ql.add_theme_font_size_override("font_size", 26)
	ql.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	cc.add_child(ql)
	var qr := HBoxContainer.new()
	qr.alignment = BoxContainer.ALIGNMENT_CENTER
	qr.add_theme_constant_override("separation", 20)
	cc.add_child(qr)
	var yes := _button("Yes, start again")
	yes.pressed.connect(func() -> void:
		_confirm.visible = false
		restart_requested.emit())
	qr.add_child(yes)
	var no := _button("No")
	no.pressed.connect(func() -> void: _confirm.visible = false)
	qr.add_child(no)


func _row_label(t: String) -> Label:
	var l := Label.new()
	l.text = t
	l.add_theme_font_size_override("font_size", 22)
	return l


func _button(t: String) -> Button:
	var b := Button.new()
	b.text = t
	b.focus_mode = Control.FOCUS_NONE
	b.add_theme_font_size_override("font_size", 22)
	b.add_theme_stylebox_override("normal", Hud._style(Color(0.14, 0.14, 0.23, 0.98), Color(0.5, 0.5, 0.75)))
	b.add_theme_stylebox_override("hover", Hud._style(Color(0.22, 0.22, 0.36, 0.98), GOLD))
	b.add_theme_stylebox_override("pressed", Hud._style(Color(0.4, 0.32, 0.06, 0.98), GOLD))
	return b


func _add_slider(parent: Control, key: String, label_text: String) -> void:
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 14)
	parent.add_child(row)
	var l := Label.new()
	l.text = label_text
	l.custom_minimum_size = Vector2(250, 0)
	l.add_theme_font_size_override("font_size", 24)
	row.add_child(l)
	var s := HSlider.new()
	s.min_value = 0.0
	s.max_value = 1.0
	s.step = 0.05
	s.custom_minimum_size = Vector2(380, 34)
	s.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	s.value_changed.connect(func(v: float) -> void:
		settings.set(key, v)
		_changed())
	row.add_child(s)
	_sliders[key] = s


func _changed() -> void:
	settings.save_file()
	_refresh()
	changed.emit()


func _refresh() -> void:
	for key in _sliders:
		(_sliders[key] as HSlider).set_value_no_signal(float(settings.get(key)))
	_voice_on.set_pressed_no_signal(settings.voice_on)
	_fullscreen.set_pressed_no_signal(settings.fullscreen)
	var sizes := [1.0, 1.15, 1.3]
	for i in _size_buttons.size():
		_size_buttons[i].modulate = Color(1, 0.9, 0.4) if is_equal_approx(settings.text_scale, sizes[i]) else Color.WHITE
	var qs := ["high", "low"]
	for i in _quality_buttons.size():
		_quality_buttons[i].modulate = Color(1, 0.9, 0.4) if settings.quality == qs[i] else Color.WHITE


func open_menu() -> void:
	_thanks.visible = false
	_refresh()
	_confirm.visible = false
	_root.visible = true


func close_menu() -> void:
	_root.visible = false
	closed.emit()


func is_open() -> bool:
	return _root.visible


func handle_key(ev: InputEventKey) -> bool:
	if _root.visible and ev.pressed and ev.keycode == KEY_ESCAPE:
		if _confirm.visible:
			_confirm.visible = false
		else:
			close_menu()
		return true
	return _root.visible
