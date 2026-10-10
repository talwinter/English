class_name Hud
extends Control
## The interface over the room, the same in every episode and every mode:
##   top:    goal, hint, listen, score
##   bottom: [messages, sentence line, verbs, typed command]   [bag: five fixed slots with item pictures]
## English text is made of clickable words (Hebrew on click).

signal verb_pressed(id: String)
signal item_pressed(id: String)
signal item_hovered(id: String)
signal hint_pressed
signal listen_pressed
signal word_clicked(word: String, sentence: String)
signal words_pressed
signal text_shown(text: String)
signal command_submitted(text: String)
signal continue_pressed

const GOLD := Color(1.0, 0.82, 0.25)
const CYAN := Color(0.62, 0.9, 1.0)
const BAG_SLOTS := 5
const SLOT := Vector2(94, 112)

var player_name := ""
## word -> 0 new, 1 learning, 2 mastered (set by the game); decides the colour of each word.
var word_state: Callable = Callable()

var _goal: RichTextLabel
var _score: Label
var _log: RichTextLabel
var _gloss: Label
var _sentence: Label
var _verbs: HBoxContainer
var _slots: Array[Button] = []
var _slot_ids: Array[String] = []
var _type: LineEdit
var _verb_buttons: Dictionary = {}
var _words: Array = []
var _word_ctx: Array = []
var _goal_text := ""
var _words_btn: Button
var _goal_count := 0
var _messages: Array = []
var _top: Control
var _bottom: Control
var _word_re: RegEx
var _story := false
var _continue: Button
var _verb_row: Control
var _type_row: Control
var _known_items: Array = []


func _init() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_word_re = RegEx.new()
	_word_re.compile("[A-Za-z]+(?:'[A-Za-z]+)?")
	_build()


static func _style(color: Color, border: Color = Color(0, 0, 0, 0), radius: int = 8) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = color
	s.border_color = border
	s.set_border_width_all(2 if border.a > 0.0 else 0)
	s.set_corner_radius_all(radius)
	s.content_margin_left = 12
	s.content_margin_right = 12
	s.content_margin_top = 6
	s.content_margin_bottom = 6
	return s


func _button(text: String, font: int = 21) -> Button:
	var b := Button.new()
	b.text = text
	b.toggle_mode = true
	b.focus_mode = Control.FOCUS_NONE
	b.add_theme_font_size_override("font_size", font)
	b.add_theme_stylebox_override("normal", _style(Color(0.13, 0.13, 0.2, 0.95), Color(0.4, 0.4, 0.6)))
	b.add_theme_stylebox_override("hover", _style(Color(0.2, 0.2, 0.32, 0.98), GOLD))
	b.add_theme_stylebox_override("pressed", _style(Color(0.45, 0.35, 0.05, 0.98), GOLD))
	b.add_theme_stylebox_override("hover_pressed", _style(Color(0.5, 0.4, 0.08, 0.98), GOLD))
	return b


func _build() -> void:
	# ---- top: goal, hint, listen, score
	var top := PanelContainer.new()
	_top = top
	top.set_anchors_preset(Control.PRESET_TOP_WIDE)
	top.offset_left = 16
	top.offset_right = -16
	top.offset_top = 12
	top.offset_bottom = 70
	top.add_theme_stylebox_override("panel", _style(Color(0.04, 0.04, 0.09, 0.82), Color(0.35, 0.35, 0.55)))
	add_child(top)
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 14)
	top.add_child(row)
	var tag := Label.new()
	tag.text = "GOAL"
	tag.add_theme_color_override("font_color", GOLD)
	tag.add_theme_font_size_override("font_size", 22)
	row.add_child(tag)
	_goal = _rich(26)
	_goal.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(_goal)
	var hint := _button("Hint")
	hint.toggle_mode = false
	hint.pressed.connect(func() -> void: hint_pressed.emit())
	row.add_child(hint)
	var listen := _button("Listen")
	listen.toggle_mode = false
	listen.pressed.connect(func() -> void: listen_pressed.emit())
	row.add_child(listen)
	_words_btn = _button("Words")
	_words_btn.toggle_mode = false
	_words_btn.pressed.connect(func() -> void: words_pressed.emit())
	row.add_child(_words_btn)
	_score = Label.new()
	_score.add_theme_font_size_override("font_size", 22)
	_score.add_theme_color_override("font_color", GOLD)
	row.add_child(_score)

	# ---- bottom
	var bottom := PanelContainer.new()
	_bottom = bottom
	bottom.set_anchors_preset(Control.PRESET_BOTTOM_WIDE)
	bottom.offset_left = 16
	bottom.offset_right = -16
	bottom.offset_bottom = -12
	bottom.offset_top = -236
	bottom.add_theme_stylebox_override("panel", _style(Color(0.04, 0.04, 0.09, 0.88), Color(0.35, 0.35, 0.55)))
	add_child(bottom)
	var cols := HBoxContainer.new()
	cols.add_theme_constant_override("separation", 18)
	bottom.add_child(cols)

	# left: messages, sentence, verbs, typing
	var left := VBoxContainer.new()
	left.add_theme_constant_override("separation", 5)
	left.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	cols.add_child(left)
	_log = _rich(23)
	_log.custom_minimum_size = Vector2(0, 92)
	_log.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_log.scroll_active = false
	left.add_child(_log)

	var line := HBoxContainer.new()
	line.add_theme_constant_override("separation", 16)
	left.add_child(line)
	_sentence = Label.new()
	_sentence.add_theme_font_size_override("font_size", 23)
	_sentence.add_theme_color_override("font_color", GOLD)
	_sentence.custom_minimum_size = Vector2(380, 0)
	line.add_child(_sentence)
	_gloss = Label.new()
	_gloss.add_theme_font_size_override("font_size", 23)
	_gloss.add_theme_color_override("font_color", CYAN)
	_gloss.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_gloss.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	line.add_child(_gloss)

	_verbs = HBoxContainer.new()
	_verbs.add_theme_constant_override("separation", 6)
	_verb_row = _verbs
	left.add_child(_verbs)

	_continue = _button("Continue  >", 24)
	_continue.toggle_mode = false
	_continue.visible = false
	_continue.pressed.connect(func() -> void: continue_pressed.emit())
	left.add_child(_continue)

	_type = LineEdit.new()
	_type.placeholder_text = "Or type a command, for example: open the box"
	_type.add_theme_font_size_override("font_size", 21)
	_type.text_submitted.connect(func(t: String) -> void:
		_type.clear()
		command_submitted.emit(t))
	_type_row = _type
	left.add_child(_type)

	# right: the bag, always five slots, always in the same place
	var right := VBoxContainer.new()
	right.add_theme_constant_override("separation", 4)
	cols.add_child(right)
	var bag_tag := Label.new()
	bag_tag.text = "Bag"
	bag_tag.add_theme_font_size_override("font_size", 21)
	bag_tag.add_theme_color_override("font_color", GOLD)
	right.add_child(bag_tag)
	var slots := HBoxContainer.new()
	slots.add_theme_constant_override("separation", 6)
	right.add_child(slots)
	for i in BAG_SLOTS:
		var b := _slot_button()
		slots.add_child(b)
		_slots.append(b)
		_slot_ids.append("")
		var idx := i
		b.pressed.connect(func() -> void:
			if _slot_ids[idx] != "":
				item_pressed.emit(_slot_ids[idx]))
		b.mouse_entered.connect(func() -> void: item_hovered.emit(_slot_ids[idx]))
		b.mouse_exited.connect(func() -> void: item_hovered.emit(""))
		_fill_slot(i, {}, null, false)


func _slot_button() -> Button:
	var b := Button.new()
	b.custom_minimum_size = SLOT
	b.focus_mode = Control.FOCUS_NONE
	b.toggle_mode = false
	b.icon_alignment = HORIZONTAL_ALIGNMENT_CENTER
	b.vertical_icon_alignment = VERTICAL_ALIGNMENT_TOP
	b.expand_icon = true
	b.add_theme_constant_override("icon_max_width", 64)
	b.add_theme_font_size_override("font_size", 18)
	b.pivot_offset = SLOT / 2.0
	return b


func _fill_slot(i: int, item: Dictionary, icon: Texture2D, selected: bool) -> void:
	var b := _slots[i]
	if item.is_empty():
		b.text = ""
		b.icon = null
		b.disabled = true
		b.add_theme_stylebox_override("normal", _style(Color(0.08, 0.08, 0.13, 0.7), Color(0.22, 0.22, 0.34), 10))
		b.add_theme_stylebox_override("disabled", _style(Color(0.08, 0.08, 0.13, 0.7), Color(0.22, 0.22, 0.34), 10))
		return
	var words: Array = item.get("words", [])
	b.text = String(words[0]) if words.size() > 0 else String(item.get("id", ""))
	b.icon = icon
	b.disabled = false
	var border := GOLD if selected else Color(0.5, 0.5, 0.75)
	var fill := Color(0.35, 0.28, 0.06, 0.98) if selected else Color(0.16, 0.16, 0.26, 0.98)
	b.add_theme_stylebox_override("normal", _style(fill, border, 10))
	b.add_theme_stylebox_override("hover", _style(Color(0.24, 0.24, 0.38, 0.98), GOLD, 10))
	b.add_theme_stylebox_override("pressed", _style(fill, GOLD, 10))


func _rich(size: int) -> RichTextLabel:
	var r := RichTextLabel.new()
	r.bbcode_enabled = true
	r.meta_underlined = false
	r.fit_content = false
	r.scroll_active = false
	r.add_theme_font_size_override("normal_font_size", size)
	r.meta_clicked.connect(_on_meta)
	return r


# ---------- text with clickable words

func bb(text: String, color: String = "#ffffff", clickable: bool = true) -> String:
	var out := ""
	var last := 0
	var safe := text.replace("[", "[lb]")
	if not clickable:
		return "[color=%s]%s[/color]" % [color, safe]
	var own := player_name.to_lower()
	for m in _word_re.search_all(safe):
		var w := m.get_string()
		out += safe.substr(last, m.get_start() - last)
		if own != "" and w.to_lower() == own:
			out += w
		else:
			var lw := w.to_lower()
			_words.append(lw)
			_word_ctx.append(text)
			var st := 0
			if word_state.is_valid():
				st = int(word_state.call(lw))
			var colors: Array = ["#ffe27a", "#bcd2ff", "#ffffff"]
			var inner := "[color=%s]%s[/color]" % [String(colors[st]), w]
			if st < 2:
				inner = "[u]%s[/u]" % inner
			out += "[url=%d]%s[/url]" % [_words.size() - 1, inner]
		last = m.get_end()
	out += safe.substr(last)
	return "[color=%s]%s[/color]" % [color, out]


func _on_meta(meta: Variant) -> void:
	var i := int(String(meta))
	if i >= 0 and i < _words.size():
		word_clicked.emit(_words[i], _word_ctx[i])


# ---------- what the game tells the HUD

func set_goal(text: String) -> void:
	_words.clear()
	_word_ctx.clear()
	_goal_text = text
	_goal.text = bb(text, "#ffffff")
	_goal_count = _words.size()
	_render_log()


func set_score(now: int, total: int) -> void:
	_score.text = "Score: %d of %d" % [now, total]


func set_verbs(verbs: Array) -> void:
	for c in _verbs.get_children():
		c.queue_free()
	_verb_buttons.clear()
	for v in verbs:
		var b := _button(String(v["label"]), 20)
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var id := String(v["id"])
		b.pressed.connect(func() -> void: verb_pressed.emit(id))
		_verbs.add_child(b)
		_verb_buttons[id] = b


func select_verb(id: String) -> void:
	for k in _verb_buttons:
		(_verb_buttons[k] as Button).set_pressed_no_signal(k == id)


## items: item dictionaries in the bag order; icons: id -> Texture2D (missing = no picture yet).
func set_bag(items: Array, selected: String = "", icons: Dictionary = {}) -> void:
	var previous := _known_items.duplicate()
	_known_items = items.map(func(it: Dictionary) -> String: return String(it["id"]))
	for i in BAG_SLOTS:
		if i < items.size():
			var it: Dictionary = items[i]
			var id := String(it["id"])
			_slot_ids[i] = id
			_fill_slot(i, it, icons.get(id), id == selected)
			if not previous.has(id):
				_pop(_slots[i])
		else:
			_slot_ids[i] = ""
			_fill_slot(i, {}, null, false)


func _pop(b: Control) -> void:
	b.scale = Vector2(0.4, 0.4)
	var tw := create_tween().set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	tw.tween_property(b, "scale", Vector2.ONE, 0.45)


func set_sentence(text: String, ghost: bool = false) -> void:
	_sentence.text = text
	_sentence.modulate.a = 0.55 if ghost else 1.0


func show_gloss(text: String) -> void:
	_gloss.text = text


func add_message(kind: String, text: String) -> void:
	if kind != "cmd" and kind != "he":
		text_shown.emit(text)
	_messages.append({"kind": kind, "text": text})
	if _messages.size() > 40:
		_messages = _messages.slice(_messages.size() - 40)
	_render_log()


func clear_messages() -> void:
	_messages.clear()
	_render_log()


func _render_log() -> void:
	var parts: PackedStringArray = []
	_words = _words.slice(0, _goal_count)   # the goal's words stay; the log's are numbered again
	_word_ctx = _word_ctx.slice(0, _goal_count)
	# only the last few messages are shown, so nothing is cut in the middle
	var shown: Array = _messages.slice(maxi(0, _messages.size() - (3 if not _story else 4)))
	for m in shown:
		var t: String = m["text"]
		match String(m["kind"]):
			"cmd":
				parts.append(bb("> " + t, "#9aa0c8", false))
			"goal":
				parts.append(bb("Goal: ", "#ffd23f", false) + bb(t, "#ffffff"))
			"hint":
				parts.append(bb("Hint: ", "#ffd23f", false) + bb(t, "#ffffff"))
			"he":
				parts.append(bb(t, "#9fe6ff", false))
			"intro":
				parts.append(bb(t, "#bfe9ff"))
			_:
				parts.append(bb(t, "#ffffff"))
	_log.text = "\n".join(parts)


func set_visible_all(v: bool) -> void:
	_top.visible = v and not _story
	_bottom.visible = v


## Story mode (cutscenes, the ending): only the text and Continue; the bag stays where it always is.
func set_story_mode(on: bool) -> void:
	_story = on
	_verb_row.visible = not on
	_type_row.visible = not on
	_sentence.visible = not on
	_top.visible = not on


func is_story_mode() -> bool:
	return _story


func show_continue(v: bool) -> void:
	_continue.visible = v and _story


func focus_type() -> void:
	_type.grab_focus()


func release_focus_type() -> void:
	_type.release_focus()


## The words the player has not mastered change colour as he learns them: draw the text again.
func refresh_text() -> void:
	set_goal(_goal_text)


func set_word_stats(met: int, mastered: int) -> void:
	_words_btn.text = "Words %d" % met if met > 0 else "Words"
