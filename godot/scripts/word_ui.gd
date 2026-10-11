class_name WordUi
extends CanvasLayer
## Everything about learning words, the same in every episode:
##   card   click any English word: the word, its Hebrew meaning, hear it (normal and slow), the sentence
##   book   every word he has met as a card, with filters (new / learning / mastered) and a Practice button
##   quiz   hear a word, choose its Hebrew; right and wrong answers move the word through the boxes

signal state_changed
signal opened
signal closed

const GOLD := Color(1.0, 0.82, 0.25)
const CYAN := Color(0.62, 0.9, 1.0)
const GREEN := Color(0.35, 0.9, 0.5)
const RED := Color(1.0, 0.4, 0.4)
const STATE_COLORS := [Color(1.0, 0.82, 0.25), Color(0.62, 0.78, 1.0), Color(0.45, 0.9, 0.55)]
const STATE_NAMES := ["NEW", "LEARNING", "MASTERED"]

var dictionary: Dictionary = {}
var store: WordStore
var voice: Voice
var sfx: Sfx

var _card: PanelContainer
var _card_word: Label
var _card_he: Label
var _card_badge: Label
var _card_sentence: RichTextLabel
var _card_state: Label
var _card_current := ""

var _book: Control
var _book_grid: GridContainer
var _book_stats: Label
var _book_filter := -1
var _filter_buttons: Array[Button] = []

var _quiz: Control
var _quiz_count: Label
var _quiz_word: Label
var _quiz_options: Array[Button] = []
var _quiz_body: Control
var _quiz_end: Control
var _quiz_end_label: RichTextLabel
var _quiz_msg: Label
var _questions: Array = []
var _qi := 0
var _right := 0
var _answered := false
var _missed: Array = []
var _book_was_open := false


func setup(dict: Dictionary, word_store: WordStore, voice_node: Voice, sfx_node: Sfx) -> void:
	dictionary = dict
	store = word_store
	voice = voice_node
	sfx = sfx_node
	layer = 40
	_build_book()
	_build_quiz()
	_build_card()


static func _style(color: Color, border: Color = Color(0, 0, 0, 0), radius: int = 10, margin: int = 12) -> StyleBoxFlat:
	return UiKit.style(color, border, radius, margin)


func _btn(text: String, font: int = 18, accent: Color = Color(0.5, 0.5, 0.75)) -> Button:
	var b := Button.new()
	b.text = text
	b.focus_mode = Control.FOCUS_NONE
	b.add_theme_font_size_override("font_size", font)
	b.add_theme_color_override("font_color", Color(0.92, 0.94, 1.0))
	b.add_theme_stylebox_override("normal", _style(Color(1, 1, 1, 0.09), Color(accent.r, accent.g, accent.b, 0.7), 14, 14))
	b.add_theme_stylebox_override("hover", _style(Color(1, 1, 1, 0.2), GOLD, 14, 14))
	b.add_theme_stylebox_override("pressed", _style(Color(0.62, 0.47, 0.08, 0.95), GOLD, 14, 14))
	b.add_theme_stylebox_override("disabled", _style(Color(1, 1, 1, 0.04), Color(1, 1, 1, 0.1), 14, 14))
	return b


func is_open() -> bool:
	return _card.visible or _book.visible or _quiz.visible


func _he(word: String) -> String:
	return String(dictionary.get(word, "לא נמצא במילון"))


# ================================================================ the word card

func _build_card() -> void:
	_card = PanelContainer.new()
	_card.visible = false
	_card.set_anchors_preset(Control.PRESET_CENTER_TOP)
	_card.custom_minimum_size = Vector2(500, 0)
	_card.offset_left = -250
	_card.offset_right = 250
	_card.offset_top = 80
	_card.grow_vertical = Control.GROW_DIRECTION_END
	_card.add_theme_stylebox_override("panel", _style(UiKit.PANEL_SOLID, Color(1, 0.82, 0.25, 0.8), 22, 22))
	add_child(_card)
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 6)
	_card.add_child(col)

	var top := HBoxContainer.new()
	top.add_theme_constant_override("separation", 14)
	col.add_child(top)
	_card_word = Label.new()
	_card_word.add_theme_font_size_override("font_size", 38)
	_card_word.add_theme_color_override("font_color", GOLD)
	_card_word.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	top.add_child(_card_word)
	_card_badge = Label.new()
	_card_badge.add_theme_font_size_override("font_size", 15)
	top.add_child(_card_badge)

	_card_he = Label.new()
	_card_he.add_theme_font_size_override("font_size", 30)
	_card_he.add_theme_color_override("font_color", CYAN)
	_card_he.text_direction = Control.TEXT_DIRECTION_RTL
	_card_he.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	_card_he.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	col.add_child(_card_he)

	_card_sentence = RichTextLabel.new()
	_card_sentence.bbcode_enabled = true
	_card_sentence.fit_content = true
	_card_sentence.scroll_active = false
	_card_sentence.add_theme_font_size_override("normal_font_size", 17)
	_card_sentence.add_theme_font_size_override("bold_font_size", 17)
	col.add_child(_card_sentence)

	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 10)
	col.add_child(row)
	var hear := _btn("Hear", 17)
	hear.pressed.connect(func() -> void: voice.say(_card_current, false))
	row.add_child(hear)
	var slow := _btn("Slow", 17)
	slow.pressed.connect(func() -> void: voice.say(_card_current, true))
	row.add_child(slow)
	var know := _btn("I know it", 17, GREEN)
	know.pressed.connect(func() -> void:
		store.mark_known(_card_current)
		sfx.play("points")
		state_changed.emit()
		close_card())
	row.add_child(know)
	_card_state = Label.new()
	_card_state.add_theme_font_size_override("font_size", 14)
	_card_state.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_card_state.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	row.add_child(_card_state)
	var close := _btn("Close", 17)
	close.pressed.connect(close_card)
	row.add_child(close)


## Shows the card of a word. `sentence` is the text it was clicked in (may be empty).
func show_card(word: String, sentence: String = "") -> void:
	var w := word.to_lower()
	_card_current = w
	var before := store.state(w)
	var first_time: bool = int(store.entry(w)["looked"]) == 0
	store.looked(w)
	_card_word.text = w
	_card_he.text = _he(w)
	_card_badge.text = "NEW WORD" if first_time else ""
	_card_badge.add_theme_color_override("font_color", GOLD)
	var s := store.state(w)
	_card_state.text = STATE_NAMES[s]
	_card_state.add_theme_color_override("font_color", STATE_COLORS[s])
	if sentence.strip_edges() != "":
		var re := RegEx.new()
		re.compile("(?i)\\b%s\\b" % w)
		_card_sentence.text = re.sub(sentence.replace("[", "[lb]"), "[color=#ffe27a][b]$0[/b][/color]", true)
	else:
		_card_sentence.text = ""
	_card.visible = true
	sfx.play("blip", -6.0)
	voice.say(w, true)
	if before != s:
		state_changed.emit()
	opened.emit()


func close_card() -> void:
	_card.visible = false
	closed.emit()


# ================================================================ the word book

func _build_book() -> void:
	_book = Control.new()
	_book.visible = false
	_book.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(_book)
	var dim := ColorRect.new()
	dim.color = Color(0, 0, 0, 0.78)
	dim.set_anchors_preset(Control.PRESET_FULL_RECT)
	_book.add_child(dim)
	var panel := PanelContainer.new()
	panel.set_anchors_preset(Control.PRESET_FULL_RECT)
	panel.offset_left = 50
	panel.offset_right = -50
	panel.offset_top = 30
	panel.offset_bottom = -30
	panel.add_theme_stylebox_override("panel", _style(Color(0.05, 0.05, 0.1, 0.99), Color(0.4, 0.4, 0.65), 16, 20))
	_book.add_child(panel)
	var col := VBoxContainer.new()
	col.add_theme_constant_override("separation", 10)
	panel.add_child(col)

	var head := HBoxContainer.new()
	col.add_child(head)
	var title := Label.new()
	title.text = "Word Book"
	title.add_theme_font_size_override("font_size", 30)
	title.add_theme_color_override("font_color", GOLD)
	head.add_child(title)
	var sub := Label.new()
	sub.text = "   ספר המילים"
	sub.add_theme_font_size_override("font_size", 22)
	sub.add_theme_color_override("font_color", CYAN)
	head.add_child(sub)
	_book_stats = Label.new()
	_book_stats.add_theme_font_size_override("font_size", 18)
	_book_stats.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_book_stats.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	head.add_child(_book_stats)

	var filters := HBoxContainer.new()
	filters.add_theme_constant_override("separation", 8)
	col.add_child(filters)
	var names := ["All", "New", "Learning", "Mastered"]
	for i in names.size():
		var b := _btn(String(names[i]), 17)
		b.toggle_mode = true
		var f := i - 1
		b.pressed.connect(func() -> void:
			_book_filter = f
			_refresh_book())
		filters.add_child(b)
		_filter_buttons.append(b)

	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	col.add_child(scroll)
	_book_grid = GridContainer.new()
	_book_grid.columns = 5
	_book_grid.add_theme_constant_override("h_separation", 10)
	_book_grid.add_theme_constant_override("v_separation", 10)
	_book_grid.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(_book_grid)

	var foot := HBoxContainer.new()
	foot.add_theme_constant_override("separation", 12)
	col.add_child(foot)
	var practice := _btn("Practice  ·  תרגול", 21, GREEN)
	practice.pressed.connect(func() -> void: start_quiz())
	foot.add_child(practice)
	var spacer := Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	foot.add_child(spacer)
	var close := _btn("Close", 20)
	close.pressed.connect(close_book)
	foot.add_child(close)


func show_book() -> void:
	_book_filter = -1
	_refresh_book()
	_book.visible = true
	sfx.play("blip", -6.0)
	opened.emit()


func close_book() -> void:
	_book.visible = false
	closed.emit()


func _refresh_book() -> void:
	for i in _filter_buttons.size():
		_filter_buttons[i].set_pressed_no_signal(i - 1 == _book_filter)
	var c := store.counts(dictionary)
	_book_stats.text = "Met %d   ·   New %d   ·   Learning %d   ·   Mastered %d" % [c["met"], c["new"], c["learning"], c["mastered"]]
	for ch in _book_grid.get_children():
		ch.queue_free()
	var shown := 0
	for w in store.met_words(dictionary):
		var s := store.state(w)
		if _book_filter != -1 and s != _book_filter:
			continue
		shown += 1
		var b := Button.new()
		b.custom_minimum_size = Vector2(0, 74)
		b.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		b.clip_text = true
		b.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		b.focus_mode = Control.FOCUS_NONE
		b.text = "%s\n%s" % [w, _he(w)]
		b.add_theme_font_size_override("font_size", 18)
		b.add_theme_stylebox_override("normal", _style(Color(0.1, 0.1, 0.18), STATE_COLORS[s], 10))
		b.add_theme_stylebox_override("hover", _style(Color(0.18, 0.18, 0.3), GOLD, 10))
		b.add_theme_stylebox_override("pressed", _style(Color(0.18, 0.18, 0.3), GOLD, 10))
		b.pressed.connect(func() -> void: show_card(w, ""))
		_book_grid.add_child(b)
	if shown == 0:
		var l := Label.new()
		l.text = "No words here yet. Click words in the game to collect them.\nעוד אין מילים. לחץ על מילים במשחק כדי לאסוף אותן."
		l.add_theme_font_size_override("font_size", 20)
		_book_grid.columns = 1
		_book_grid.add_child(l)
	else:
		_book_grid.columns = 5


# ================================================================ practice

func _build_quiz() -> void:
	_quiz = Control.new()
	_quiz.visible = false
	_quiz.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(_quiz)
	var dim := ColorRect.new()
	dim.color = Color(0, 0, 0, 0.85)
	dim.set_anchors_preset(Control.PRESET_FULL_RECT)
	_quiz.add_child(dim)
	var panel := PanelContainer.new()
	panel.set_anchors_preset(Control.PRESET_CENTER)
	panel.custom_minimum_size = Vector2(860, 560)
	panel.offset_left = -430
	panel.offset_right = 430
	panel.offset_top = -280
	panel.offset_bottom = 280
	panel.add_theme_stylebox_override("panel", _style(Color(0.05, 0.05, 0.1, 0.99), GOLD, 16, 24))
	_quiz.add_child(panel)
	var root := VBoxContainer.new()
	panel.add_child(root)

	_quiz_body = VBoxContainer.new()
	_quiz_body.add_theme_constant_override("separation", 14)
	_quiz_body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	root.add_child(_quiz_body)
	_quiz_count = Label.new()
	_quiz_count.add_theme_font_size_override("font_size", 18)
	_quiz_count.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_quiz_body.add_child(_quiz_count)
	_quiz_word = Label.new()
	_quiz_word.add_theme_font_size_override("font_size", 60)
	_quiz_word.add_theme_color_override("font_color", GOLD)
	_quiz_word.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_quiz_body.add_child(_quiz_word)
	var hear_row := HBoxContainer.new()
	hear_row.alignment = BoxContainer.ALIGNMENT_CENTER
	hear_row.add_theme_constant_override("separation", 12)
	_quiz_body.add_child(hear_row)
	var hear := _btn("Hear", 20)
	hear.pressed.connect(func() -> void: voice.say(String(_questions[_qi]["word"]), false))
	hear_row.add_child(hear)
	var slow := _btn("Slow", 20)
	slow.pressed.connect(func() -> void: voice.say(String(_questions[_qi]["word"]), true))
	hear_row.add_child(slow)
	for i in 3:
		var o := _btn("", 28)
		o.custom_minimum_size = Vector2(0, 74)
		var idx := i
		o.pressed.connect(func() -> void: _answer(idx))
		_quiz_body.add_child(o)
		_quiz_options.append(o)
	_quiz_msg = Label.new()
	_quiz_msg.add_theme_font_size_override("font_size", 20)
	_quiz_msg.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_quiz_body.add_child(_quiz_msg)

	_quiz_end = VBoxContainer.new()
	_quiz_end.add_theme_constant_override("separation", 14)
	_quiz_end.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_quiz_end.visible = false
	root.add_child(_quiz_end)
	_quiz_end_label = RichTextLabel.new()
	_quiz_end_label.bbcode_enabled = true
	_quiz_end_label.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_quiz_end_label.add_theme_font_size_override("normal_font_size", 22)
	_quiz_end.add_child(_quiz_end_label)
	var end_row := HBoxContainer.new()
	end_row.add_theme_constant_override("separation", 12)
	_quiz_end.add_child(end_row)
	var again := _btn("Again  ·  שוב", 21, GREEN)
	again.pressed.connect(func() -> void: start_quiz())
	end_row.add_child(again)
	var close := _btn("Close", 21)
	close.pressed.connect(close_quiz)
	end_row.add_child(close)

	var x := _btn("X", 17)
	x.set_anchors_preset(Control.PRESET_CENTER)
	x.offset_left = 356
	x.offset_right = 412
	x.offset_top = -268
	x.offset_bottom = -222
	x.pressed.connect(close_quiz)
	_quiz.add_child(x)


func start_quiz() -> void:
	_book_was_open = _book_was_open or _book.visible
	_book.visible = false
	_card.visible = false
	_questions = store.make_quiz(dictionary, 8)
	_qi = 0
	_right = 0
	_missed.clear()
	_quiz.visible = true
	_quiz_end.visible = false
	_quiz_body.visible = true
	if _questions.is_empty():
		_quiz_body.visible = false
		_quiz_end.visible = true
		_quiz_end_label.text = "[center]\n\nMeet a few more words first.\n[color=#9fe6ff]צריך לפגוש עוד קצת מילים כדי לתרגל.[/color][/center]"
		return
	opened.emit()
	_ask()


func close_quiz() -> void:
	_quiz.visible = false
	voice.stop()
	state_changed.emit()
	if _book_was_open:
		_book_was_open = false
		show_book()      # back to the word book, now with the new colours
	else:
		closed.emit()


func _ask() -> void:
	var q: Dictionary = _questions[_qi]
	_answered = false
	_quiz_count.text = "%d / %d" % [_qi + 1, _questions.size()]
	_quiz_word.text = String(q["word"])
	_quiz_msg.text = ""
	for i in 3:
		var b := _quiz_options[i]
		b.text = String(q["options"][i])
		b.disabled = false
		b.add_theme_color_override("font_color", Color(1, 1, 1))
		b.add_theme_stylebox_override("normal", _style(Color(0.14, 0.14, 0.23, 0.98), Color(0.5, 0.5, 0.75)))
	voice.say(String(q["word"]), true)    # slowly and clearly the first time: the server has every word slow already


func _answer(i: int) -> void:
	if _answered:
		return
	_answered = true
	var q: Dictionary = _questions[_qi]
	var ok: bool = i == int(q["answer"])
	store.answer(String(q["word"]), ok)
	for k in 3:
		var b := _quiz_options[k]
		b.disabled = true
		if k == int(q["answer"]):
			b.add_theme_stylebox_override("disabled", _style(Color(0.1, 0.35, 0.18, 0.98), GREEN))
		elif k == i:
			b.add_theme_stylebox_override("disabled", _style(Color(0.4, 0.1, 0.1, 0.98), RED))
	if ok:
		_right += 1
		_quiz_msg.text = "Right!  ·  נכון!"
		_quiz_msg.add_theme_color_override("font_color", GREEN)
		sfx.play("points")
	else:
		_missed.append(q)
		_quiz_msg.text = "Not this time.  ·  לא הפעם."
		_quiz_msg.add_theme_color_override("font_color", RED)
		sfx.play("nope")
	await get_tree().create_timer(1.0 if ok else 1.8).timeout
	if not _quiz.visible:
		return
	_qi += 1
	if _qi >= _questions.size():
		_finish_quiz()
	else:
		_ask()


func _finish_quiz() -> void:
	_quiz_body.visible = false
	_quiz_end.visible = true
	var n := _questions.size()
	var stars := 3 if _right == n else (2 if _right * 3 >= n * 2 else (1 if _right * 2 >= n else 0))
	var t := "[center][font_size=46][color=#ffd23f]%s[/color][/font_size]\n%d / %d\n" % ["*".repeat(stars) + "-".repeat(3 - stars), _right, n]
	if _missed.size() > 0:
		t += "\n[font_size=20]Try again later:[/font_size]\n"
		for q in _missed.slice(0, 5):
			t += "[font_size=21][color=#ffe27a]%s[/color] = [color=#9fe6ff]%s[/color][/font_size]\n" % [q["word"], q["he"]]
	t += "[/center]"
	_quiz_end_label.text = t
	sfx.play("fanfare" if stars >= 2 else "goal", -6.0)
	state_changed.emit()


# ================================================================ keys

## Returns true when it used the key.
func handle_key(ev: InputEventKey) -> bool:
	if not ev.pressed or ev.echo:
		return false
	if _quiz.visible:
		if ev.keycode == KEY_ESCAPE:
			close_quiz()
			return true
		if _quiz_body.visible and ev.keycode in [KEY_1, KEY_2, KEY_3]:
			_answer(ev.keycode - KEY_1)
			return true
		if _quiz_body.visible and ev.keycode == KEY_SPACE:
			voice.say(String(_questions[_qi]["word"]), false)
			return true
		return true
	if _card.visible and ev.keycode == KEY_ESCAPE:
		close_card()
		return true
	if _book.visible and ev.keycode == KEY_ESCAPE:
		close_book()
		return true
	return false
