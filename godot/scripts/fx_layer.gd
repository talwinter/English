class_name FxLayer
extends CanvasLayer
## Full-window effects above the game: glitch, white flash, fade to black, and the title card.

var glitch_rect: ColorRect
var glitch_mat: ShaderMaterial
var flash_rect: ColorRect
var black_rect: ColorRect
var card: Label
var card_sub: Label
var card_box: VBoxContainer
var _glitch_amount := 0.0


func _init() -> void:
	layer = 50
	glitch_rect = ColorRect.new()
	glitch_rect.set_anchors_preset(Control.PRESET_FULL_RECT)
	glitch_rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	glitch_mat = ShaderMaterial.new()
	glitch_mat.shader = load("res://shaders/glitch_overlay.gdshader")
	glitch_rect.material = glitch_mat
	glitch_rect.visible = false
	add_child(glitch_rect)

	flash_rect = ColorRect.new()
	flash_rect.color = Color(1, 1, 1, 0)
	flash_rect.set_anchors_preset(Control.PRESET_FULL_RECT)
	flash_rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(flash_rect)

	black_rect = ColorRect.new()
	black_rect.color = Color(0, 0, 0, 0)
	black_rect.set_anchors_preset(Control.PRESET_FULL_RECT)
	black_rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(black_rect)

	card_box = VBoxContainer.new()
	card_box.set_anchors_preset(Control.PRESET_FULL_RECT)
	card_box.alignment = BoxContainer.ALIGNMENT_CENTER
	card_box.modulate.a = 0.0
	card_box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(card_box)
	card_sub = Label.new()
	card_sub.add_theme_font_size_override("font_size", 30)
	card_sub.add_theme_color_override("font_color", Color(1.0, 0.82, 0.25))
	card_sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	card_box.add_child(card_sub)
	card = Label.new()
	card.add_theme_font_size_override("font_size", 72)
	card.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	card_box.add_child(card)


func set_glitch(amount: float) -> void:
	_glitch_amount = amount
	glitch_rect.visible = amount > 0.001
	glitch_mat.set_shader_parameter("amount", amount)


func glitch_to(amount: float, seconds: float) -> void:
	var tw := create_tween()
	if amount > 0.0:
		glitch_rect.visible = true
	tw.tween_method(set_glitch, _glitch_amount, amount, maxf(seconds, 0.001))


func flash(peak: float, seconds_up: float, seconds_down: float) -> void:
	var tw := create_tween()
	tw.tween_property(flash_rect, "color:a", peak, seconds_up)
	tw.tween_property(flash_rect, "color:a", 0.0, seconds_down)


func white_to(alpha: float, seconds: float) -> void:
	var tw := create_tween()
	tw.tween_property(flash_rect, "color:a", alpha, seconds)
	await tw.finished


func black_to(alpha: float, seconds: float) -> void:
	var tw := create_tween()
	tw.tween_property(black_rect, "color:a", alpha, seconds)
	await tw.finished


## "PROLOGUE" over "Insert Disk", for a few seconds.
func title_card(sub: String, text: String, seconds: float = 3.0) -> void:
	card_sub.text = sub
	card.text = text
	var tw := create_tween()
	tw.tween_property(card_box, "modulate:a", 1.0, 0.5)
	tw.tween_interval(maxf(0.1, seconds - 1.0))
	tw.tween_property(card_box, "modulate:a", 0.0, 0.5)
	await tw.finished
