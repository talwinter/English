class_name Coach
extends CanvasLayer
## First-time tips: a gold frame around the part of the screen being explained and a short bubble, in simple
## English with a Hebrew line. Each tip is shown once (remembered in the settings). Before he meets Byte the
## tip is a plain "Tip"; afterwards Byte says it.

signal closed(id: String)

const GOLD := Color(1.0, 0.82, 0.25)

var settings: Settings
var voice: Voice
var current := ""
var _frame: Panel
var _bubble: PanelContainer
var _who: Label
var _en: Label
var _he: Label
var _tween: Tween


func setup(s: Settings, v: Voice) -> void:
	settings = s
	voice = v
	layer = 44
	_frame = Panel.new()
	_frame.visible = false
	_frame.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var fs := StyleBoxFlat.new()
	fs.bg_color = Color(1, 0.82, 0.25, 0.08)
	fs.border_color = GOLD
	fs.set_border_width_all(4)
	fs.set_corner_radius_all(12)
	_frame.add_theme_stylebox_override("panel", fs)
	add_child(_frame)

	_bubble = PanelContainer.new()
	_bubble.visible = false
	_bubble.custom_minimum_size = Vector2(560, 0)
	_bubble.add_theme_stylebox_override("panel", Hud._style(Color(0.06, 0.06, 0.13, 0.98), GOLD, 14))
	add_child(_bubble)
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 6)
	_bubble.add_child(col)
	_who = Label.new()
	_who.add_theme_font_size_override("font_size", 20)
	_who.add_theme_color_override("font_color", GOLD)
	col.add_child(_who)
	_en = Label.new()
	_en.add_theme_font_size_override("font_size", 28)
	_en.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	col.add_child(_en)
	_he = Label.new()
	_he.add_theme_font_size_override("font_size", 24)
	_he.add_theme_color_override("font_color", Color(0.62, 0.9, 1.0))
	_he.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_he.text_direction = Control.TEXT_DIRECTION_RTL
	col.add_child(_he)
	var ok := Button.new()
	ok.text = "Got it  ·  הבנתי"
	ok.focus_mode = Control.FOCUS_NONE
	ok.add_theme_font_size_override("font_size", 24)
	ok.pressed.connect(close_tip)
	col.add_child(ok)


func is_open() -> bool:
	return current != ""


## Shows a tip once. `target` is the screen rectangle to frame (Rect2() = no frame).
## Returns false when it was already seen or another tip is open.
func show_tip(id: String, en: String, he: String, target: Rect2, by_byte: bool) -> bool:
	if settings.tip_seen(id) or current != "":
		return false
	current = id
	_who.text = "Byte" if by_byte else "Tip"
	_en.text = en
	_he.text = he
	_bubble.visible = true
	_bubble.size = Vector2(560, 0)
	_bubble.reset_size()
	var view := get_viewport().get_visible_rect().size
	if target.size.x > 0.0:
		_frame.position = target.position - Vector2(6, 6)
		_frame.size = target.size + Vector2(12, 12)
		_frame.visible = true
		if _tween:
			_tween.kill()
		_tween = create_tween().set_loops()
		_tween.tween_property(_frame, "modulate:a", 0.35, 0.6)
		_tween.tween_property(_frame, "modulate:a", 1.0, 0.6)
	else:
		_frame.visible = false
	# the bubble goes below the framed part when that is near the top, above it otherwise
	await get_tree().process_frame
	_bubble.size = Vector2(560, 0)
	_bubble.reset_size()
	var bs := _bubble.get_combined_minimum_size()
	_bubble.size = bs
	var pos := Vector2((view.x - bs.x) / 2.0, view.y * 0.32)
	if target.size.x > 0.0:
		if target.position.y < view.y * 0.5:
			pos.y = target.end.y + 20.0
		else:
			pos.y = target.position.y - bs.y - 20.0
		pos.x = clampf(target.get_center().x - bs.x / 2.0, 12.0, view.x - bs.x - 12.0)
	_bubble.position = pos
	voice.say('Byte: "%s"' % en if by_byte else en)
	return true


func close_tip() -> void:
	if current == "":
		return
	var id := current
	current = ""
	settings.mark_tip(id)
	_bubble.visible = false
	_frame.visible = false
	if _tween:
		_tween.kill()
	closed.emit(id)


func handle_key(ev: InputEventKey) -> bool:
	if current != "" and ev.pressed and (ev.keycode == KEY_ESCAPE or ev.keycode == KEY_ENTER or ev.keycode == KEY_SPACE):
		close_tip()
		return true
	return false
