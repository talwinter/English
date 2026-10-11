class_name MissionUi
extends CanvasLayer
## The end of the day's mission: the word challenge (8 questions, 6 right to pass, graded by the server, so it
## can't be skipped) and the payoff: "Discord is open".

signal finished(passed: bool)

const GOLD := Color(1.0, 0.82, 0.25)
const GREEN := Color(0.35, 0.9, 0.5)
const RED := Color(1.0, 0.4, 0.4)

var api: ServerApi
var voice: Voice
var sfx: Sfx
var store: WordStore
var dictionary: Dictionary = {}
var robot := false              # tests answer by themselves using the dictionary

var _root: Control
var _title: Label
var _body: VBoxContainer
var _prompt: Label
var _options: Array[Button] = []
var _msg: Label
var _count: Label
var _challenge: Dictionary = {}
var _qi := 0
var _score := 0
var _locked_input := false
var _confetti: CPUParticles2D


func setup(api_node: ServerApi, v: Voice, s: Sfx, st: WordStore, dict: Dictionary) -> void:
	api = api_node
	voice = v
	sfx = s
	store = st
	dictionary = dict
	layer = 42
	_root = Control.new()
	_root.visible = false
	_root.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(_root)
	var dim := ColorRect.new()
	dim.color = Color(0.02, 0.02, 0.06, 0.96)
	dim.set_anchors_preset(Control.PRESET_FULL_RECT)
	_root.add_child(dim)
	var panel := PanelContainer.new()
	panel.set_anchors_preset(Control.PRESET_CENTER)
	panel.offset_left = -440
	panel.offset_right = 440
	panel.offset_top = -300
	panel.offset_bottom = 300
	panel.add_theme_stylebox_override("panel", Hud._style(Color(0.05, 0.05, 0.1, 1.0), GOLD, 18, 26))
	_root.add_child(panel)
	_body = VBoxContainer.new()
	_body.add_theme_constant_override("separation", 14)
	panel.add_child(_body)
	_confetti = CPUParticles2D.new()
	_confetti.emitting = false
	_confetti.one_shot = true
	_confetti.amount = 140
	_confetti.lifetime = 3.0
	_confetti.explosiveness = 0.9
	_confetti.direction = Vector2(0, -1)
	_confetti.spread = 70.0
	_confetti.initial_velocity_min = 400.0
	_confetti.initial_velocity_max = 900.0
	_confetti.gravity = Vector2(0, 900)
	_confetti.scale_amount_min = 6.0
	_confetti.scale_amount_max = 12.0
	_confetti.color_ramp = null
	_confetti.color = Color(1.0, 0.85, 0.25)
	_root.add_child(_confetti)


func _clear_body() -> void:
	for c in _body.get_children():
		c.queue_free()


func _label(text: String, size: int, color: Color = Color.WHITE, center: bool = true) -> Label:
	var l := Label.new()
	l.text = text
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", color)
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	if center:
		l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	return l


func _button(text: String, size: int = 30, accent: Color = Color(0.5, 0.5, 0.75)) -> Button:
	var b := Button.new()
	b.text = text
	b.focus_mode = Control.FOCUS_NONE
	b.add_theme_font_size_override("font_size", size)
	b.add_theme_stylebox_override("normal", Hud._style(Color(0.14, 0.14, 0.23, 0.98), accent))
	b.add_theme_stylebox_override("hover", Hud._style(Color(0.22, 0.22, 0.36, 0.98), GOLD))
	b.add_theme_stylebox_override("pressed", Hud._style(Color(0.4, 0.32, 0.06, 0.98), GOLD))
	b.add_theme_stylebox_override("disabled", Hud._style(Color(0.1, 0.1, 0.16, 0.9), Color(0.25, 0.25, 0.35)))
	return b


func is_open() -> bool:
	return _root.visible


## Runs the whole thing; returns true when he passed (Discord is open).
func run() -> bool:
	_root.visible = true
	while true:
		var r := await _intro_and_start()
		if r == "cancel":
			_root.visible = false
			finished.emit(false)
			return false
		if r == "ok":
			var passed := await _ask_all()
			if passed:
				await _payoff()
				_root.visible = false
				finished.emit(true)
				return true
			# not passed: the loop offers to try again
	return false


func _intro_and_start() -> String:
	_clear_body()
	_body.add_child(_label("Word Challenge", 52, GOLD))
	_body.add_child(_label("אתגר המילים", 38, Color(0.62, 0.9, 1.0)))
	_body.add_child(_label("8 questions. Get 6 right to open Discord.", 32))
	_body.add_child(_label("ענה נכון על 6 מתוך 8 כדי לפתוח את Discord.", 28, Color(0.62, 0.9, 1.0)))
	var start := _button("Start  ·  התחל", 40, GREEN)
	start.custom_minimum_size = Vector2(0, 90)
	_body.add_child(start)
	var later := _button("Not now", 24)
	_body.add_child(later)
	if robot:
		await get_tree().create_timer(0.5).timeout
		return await _start_challenge()
	var which: String = await _wait_for_buttons([start, later], ["go", "cancel"])
	if which == "cancel":
		return "cancel"
	return await _start_challenge()


func _wait_for_buttons(buttons: Array, results: Array) -> String:
	var done := [""]
	for i in buttons.size():
		var res: String = results[i]
		(buttons[i] as Button).pressed.connect(func() -> void: done[0] = res)
	while done[0] == "":
		await get_tree().create_timer(0.05).timeout
	return done[0]


func _start_challenge() -> String:
	var r := await api.post_json("/api/challenge/start", {})
	if not r["ok"]:
		var err := String((r["data"] as Dictionary).get("error", ""))
		_clear_body()
		if err == "episode-first":
			_body.add_child(_label("Finish today's episode first.", 36))
			_body.add_child(_label("קודם תסיים את הפרק של היום.", 30, Color(0.62, 0.9, 1.0)))
		elif err == "wait":
			var secs := int((r["data"] as Dictionary).get("seconds", 15))
			_body.add_child(_label("Wait a little, then try again.", 36))
			_body.add_child(_label("%d seconds  ·  שניות" % secs, 40, GOLD))
			await get_tree().create_timer(float(secs) + 0.5).timeout
			return "retry"
		elif err == "no-words":
			_body.add_child(_label("Play an episode first to meet some words.", 34))
		else:
			_body.add_child(_label("The server is not answering.", 36))
			_body.add_child(_label("השרת לא עונה כרגע.", 30, Color(0.62, 0.9, 1.0)))
		var close := _button("OK", 30)
		_body.add_child(close)
		if robot:
			return "cancel"
		await close.pressed
		return "cancel"
	_challenge = r["data"]
	if robot:
		print("MISSION challenge started: ", (_challenge.get("questions", []) as Array).size(), " questions")
	_qi = 0
	_score = 0
	return "ok"


func _ask_all() -> bool:
	var questions: Array = _challenge["questions"]
	var pass_mark := int(_challenge.get("pass", 6))
	for qi in questions.size():
		_qi = qi
		var q: Dictionary = questions[qi]
		var choice := await _ask(q, questions.size())
		if robot:
			print("MISSION q", qi, " ", q.get("type"), " prompt=", q.get("prompt"), " choice=", choice)
		var r := await api.post_json("/api/challenge/answer", {"id": _challenge["id"], "q": qi, "choice": choice})
		if not r["ok"]:
			await _message("The server did not answer. Try again.", RED)
			return false
		var d: Dictionary = r["data"]
		if robot:
			print("MISSION answer -> ", d)
		var ok := bool(d.get("correct", false))
		var word := String(d.get("word", ""))
		if word != "":
			store.answer(word, ok)
		if ok:
			_score += 1
			sfx.play("points")
			await _flash(choice, GREEN, "Right!  ·  נכון!")
		else:
			sfx.play("nope")
			await _flash(int(d.get("answer", 0)), RED, "%s = %s" % [word, String(dictionary.get(word, ""))])
		if word != "":
			voice.say(word, true)
			await get_tree().create_timer(0.9).timeout
		if bool(d.get("done", false)):
			if bool(d.get("passed", false)):
				return true
			await _failed(_score, questions.size(), pass_mark)
			return false
	return false


func _ask(q: Dictionary, total: int) -> int:
	_clear_body()
	_locked_input = false
	_count = _label("%d / %d" % [_qi + 1, total], 26, Color(0.7, 0.7, 0.85))
	_body.add_child(_count)
	var english := String(q.get("type", "")) == "en-he"
	_prompt = _label(String(q.get("prompt", "")), 76, GOLD if english else Color(0.62, 0.9, 1.0))
	_body.add_child(_prompt)
	_body.add_child(_label("What does it mean?  ·  מה זה אומר?" if english else "Which English word is it?  ·  איזו מילה באנגלית?", 26))
	_options.clear()
	var opts: Array = q.get("options", [])
	var chosen := [-1]
	for i in opts.size():
		var b := _button(String(opts[i]), 38)
		b.custom_minimum_size = Vector2(0, 70)
		var idx := i
		b.pressed.connect(func() -> void:
			if not _locked_input:
				_locked_input = true
				chosen[0] = idx)
		_body.add_child(b)
		_options.append(b)
	_msg = _label("", 30)
	_body.add_child(_msg)
	if english:
		voice.say(String(q.get("prompt", "")), true)
	if robot:
		await get_tree().create_timer(0.35).timeout
		var pick := _robot_choice(q)
		_locked_input = true
		return pick
	while chosen[0] < 0:
		await get_tree().create_timer(0.05).timeout
	return chosen[0]


## For tests: the right option, found with the dictionary.
func _robot_choice(q: Dictionary) -> int:
	var opts: Array = q.get("options", [])
	var prompt := String(q.get("prompt", ""))
	for i in opts.size():
		var o := String(opts[i])
		if String(q.get("type", "")) == "en-he":
			if String(dictionary.get(prompt, "")) == o:
				return i
		elif String(dictionary.get(o, "")) == prompt:
			return i
	return 0


func _flash(index: int, color: Color, text: String) -> void:
	if index >= 0 and index < _options.size():
		_options[index].add_theme_stylebox_override("normal", Hud._style(color.darkened(0.55), color))
		_options[index].add_theme_stylebox_override("hover", Hud._style(color.darkened(0.55), color))
	for b in _options:
		b.disabled = true
	_msg.text = text
	_msg.add_theme_color_override("font_color", color)
	await get_tree().create_timer(0.7).timeout


func _message(text: String, color: Color) -> void:
	_clear_body()
	_body.add_child(_label(text, 34, color))
	await get_tree().create_timer(1.8).timeout


func _failed(score: int, total: int, pass_mark: int) -> void:
	_clear_body()
	_body.add_child(_label("%d / %d" % [score, total], 80, RED))
	_body.add_child(_label("Not this time. You need %d. Try again!" % pass_mark, 32))
	_body.add_child(_label("לא הפעם. צריך %d נכונות. נסה שוב!" % pass_mark, 28, Color(0.62, 0.9, 1.0)))
	var again := _button("Try again  ·  שוב", 34, GREEN)
	_body.add_child(again)
	if robot:
		await get_tree().create_timer(0.5).timeout
		return
	await again.pressed


func _payoff() -> void:
	_clear_body()
	sfx.play("fanfare")
	var big := _label("Discord is open!", 84, GREEN)
	_body.add_child(big)
	_body.add_child(_label("Discord פתוח!  כל הכבוד!", 40, Color(0.62, 0.9, 1.0)))
	_body.add_child(_label("%d / %d" % [_score, (_challenge["questions"] as Array).size()], 60, GOLD))
	_body.add_child(_label("See you tomorrow for a new adventure.", 30))
	big.pivot_offset = big.size / 2.0
	big.scale = Vector2(0.4, 0.4)
	create_tween().set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT).tween_property(big, "scale", Vector2.ONE, 0.7)
	var view := get_viewport().get_visible_rect().size
	_confetti.position = Vector2(view.x / 2.0, view.y * 0.75)
	_confetti.restart()
	_confetti.emitting = true
	voice.say("Byte: " + char(34) + "Discord is open! Well done!" + char(34))
	if robot:
		await get_tree().create_timer(2.5).timeout
		return
	var ok := _button("OK", 34, GREEN)
	_body.add_child(ok)
	await ok.pressed
