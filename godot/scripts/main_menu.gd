extends CanvasLayer
## The start screen. One episode a day: when today's episode (and the challenge) is done it says so and the only
## things left are his words, which he can always study, and the settings.
##
##   show_state({mode, title, name, streak, words})
##     mode  "play"       today's episode is waiting
##           "resume"     he stopped in the middle of today's episode
##           "challenge"  the episode is done, the word challenge is not
##           "done"       everything for today is done: Discord is open, see you tomorrow
##   signal chosen(action)  "play", "challenge", "words", "settings", "quit"

signal chosen(action: String)

const GOLD := Color(1.0, 0.82, 0.25)

var _title: Label
var _hello: Label
var _main: Button
var _main_sub: Label
var _done_box: PanelContainer
var _done_en: Label
var _stats: Label
var _mode := "play"


func _init() -> void:
	layer = 35
	_build()


func _build() -> void:
	var bg := ColorRect.new()
	bg.color = Color(0.035, 0.045, 0.09)
	bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(bg)
	# a soft glow behind the title
	var grad := Gradient.new()
	grad.set_color(0, Color(0.2, 0.28, 0.58, 0.55))
	grad.set_color(1, Color(0.2, 0.28, 0.58, 0.0))
	var gt := GradientTexture2D.new()
	gt.gradient = grad
	gt.fill = GradientTexture2D.FILL_RADIAL
	gt.fill_from = Vector2(0.5, 0.5)
	gt.fill_to = Vector2(1.0, 0.5)
	gt.width = 512
	gt.height = 256
	var glow := TextureRect.new()
	glow.texture = gt
	glow.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	glow.set_anchors_preset(Control.PRESET_CENTER_TOP)
	glow.offset_left = -520
	glow.offset_right = 520
	glow.offset_top = 0
	glow.offset_bottom = 420
	glow.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(glow)

	var col := VBoxContainer.new()
	col.set_anchors_preset(Control.PRESET_CENTER)
	col.offset_left = -250
	col.offset_right = 250
	col.offset_top = -250
	col.offset_bottom = 250
	col.add_theme_constant_override("separation", 14)
	col.alignment = BoxContainer.ALIGNMENT_CENTER
	add_child(col)

	_title = Label.new()
	_title.text = "ENGLISH QUEST"
	_title.add_theme_font_size_override("font_size", 52)
	_title.add_theme_color_override("font_color", GOLD)
	_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	col.add_child(_title)
	var sub := Label.new()
	sub.text = "Lost in the Game"
	sub.add_theme_font_size_override("font_size", 20)
	sub.add_theme_color_override("font_color", Color(0.7, 0.78, 0.95))
	sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	col.add_child(sub)
	_hello = Label.new()
	_hello.add_theme_font_size_override("font_size", 18)
	_hello.add_theme_color_override("font_color", Color(0.9, 0.93, 1.0))
	_hello.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	col.add_child(_hello)
	col.add_child(_gap(10))

	_main = _big_button("")
	_main.pressed.connect(func() -> void: chosen.emit(_main_action()))
	col.add_child(_main)
	_main_sub = Label.new()
	_main_sub.add_theme_font_size_override("font_size", 15)
	_main_sub.add_theme_color_override("font_color", Color(0.7, 0.78, 0.95))
	_main_sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	col.add_child(_main_sub)

	_done_box = PanelContainer.new()
	_done_box.add_theme_stylebox_override("panel", UiKit.style(Color(0.1, 0.2, 0.14, 0.9), Color(0.35, 0.9, 0.5, 0.8), 18, 20))
	var dcol := VBoxContainer.new()
	dcol.add_theme_constant_override("separation", 4)
	_done_box.add_child(dcol)
	_done_en = Label.new()
	_done_en.add_theme_font_size_override("font_size", 22)
	_done_en.add_theme_color_override("font_color", Color(0.75, 1.0, 0.82))
	_done_en.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_done_en.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	dcol.add_child(_done_en)
	var he := Label.new()
	he.text = "סיימת להיום! דיסקורד פתוח. נתראה מחר."
	he.add_theme_font_size_override("font_size", 18)
	he.add_theme_color_override("font_color", Color(0.62, 0.9, 1.0))
	he.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	he.text_direction = Control.TEXT_DIRECTION_RTL
	dcol.add_child(he)
	col.add_child(_done_box)

	col.add_child(_gap(8))
	var words := _small_button("My words  ·  המילים שלי")
	words.pressed.connect(func() -> void: chosen.emit("words"))
	col.add_child(words)
	_stats = Label.new()
	_stats.add_theme_font_size_override("font_size", 14)
	_stats.add_theme_color_override("font_color", Color(0.62, 0.68, 0.85))
	_stats.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	col.add_child(_stats)

	var row := HBoxContainer.new()
	row.alignment = BoxContainer.ALIGNMENT_CENTER
	row.add_theme_constant_override("separation", 10)
	var settings := _small_button("Settings")
	settings.pressed.connect(func() -> void: chosen.emit("settings"))
	row.add_child(settings)
	var quit := _small_button("Quit")
	quit.pressed.connect(func() -> void: chosen.emit("quit"))
	row.add_child(quit)
	col.add_child(row)


func _gap(h: int) -> Control:
	var c := Control.new()
	c.custom_minimum_size = Vector2(0, h)
	return c


func _big_button(text: String) -> Button:
	var b := Button.new()
	b.text = text
	b.focus_mode = Control.FOCUS_NONE
	b.custom_minimum_size = Vector2(0, 66)
	b.add_theme_font_size_override("font_size", 24)
	b.add_theme_color_override("font_color", UiKit.INK)
	b.add_theme_color_override("font_hover_color", UiKit.INK)
	b.add_theme_stylebox_override("normal", UiKit.style(GOLD, Color(1, 1, 1, 0.5), 18, 18))
	b.add_theme_stylebox_override("hover", UiKit.style(Color(1.0, 0.9, 0.45), Color.WHITE, 18, 18))
	b.add_theme_stylebox_override("pressed", UiKit.style(Color(0.85, 0.65, 0.15), Color.WHITE, 18, 18))
	return b


func _small_button(text: String) -> Button:
	var b := Button.new()
	b.text = text
	b.focus_mode = Control.FOCUS_NONE
	b.custom_minimum_size = Vector2(0, 42)
	b.add_theme_font_size_override("font_size", 17)
	b.add_theme_color_override("font_color", Color(0.92, 0.94, 1.0))
	b.add_theme_stylebox_override("normal", UiKit.style(Color(1, 1, 1, 0.09), Color(1, 1, 1, 0.2), 14, 18))
	b.add_theme_stylebox_override("hover", UiKit.style(Color(1, 1, 1, 0.2), GOLD, 14, 18))
	b.add_theme_stylebox_override("pressed", UiKit.style(Color(0.62, 0.47, 0.08, 0.95), GOLD, 14, 18))
	return b


func _main_action() -> String:
	return "challenge" if _mode == "challenge" else "play"


func show_state(state: Dictionary) -> void:
	_mode = String(state.get("mode", "play"))
	var who := String(state.get("name", ""))
	_hello.text = ("Hello, %s!" % who) if who != "" else ""
	var streak := int(state.get("streak", 0))
	var parts: PackedStringArray = []
	if int(state.get("words", 0)) > 0:
		parts.append("%d words met" % int(state["words"]))
	if streak > 0:
		parts.append("%d days in a row" % streak)
	_stats.text = "   ·   ".join(parts)
	var title := String(state.get("title", ""))
	_main.visible = _mode != "done"
	_main_sub.visible = _mode != "done"
	_done_box.visible = _mode == "done"
	match _mode:
		"resume":
			_main.text = "Continue today's episode"
			_main_sub.text = title
		"challenge":
			_main.text = "Today's word challenge"
			_main_sub.text = "Pass it to open Discord"
		"done":
			_done_en.text = "All done for today! Discord is open.\nCome back tomorrow for the next episode."
		_:
			_main.text = "Play today's episode"
			_main_sub.text = title
