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
var card_panel: PanelContainer
var caption: Label
var caption_panel: PanelContainer
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

	# a dark soft band across the middle, so white letters read on snow as well as on a night scene
	card_panel = PanelContainer.new()
	card_panel.set_anchors_preset(Control.PRESET_FULL_RECT)
	card_panel.anchor_top = 0.5
	card_panel.anchor_bottom = 0.5
	card_panel.offset_top = -130
	card_panel.offset_bottom = 130
	card_panel.modulate.a = 0.0
	card_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var band := StyleBoxFlat.new()
	band.bg_color = Color(0.02, 0.03, 0.08, 0.72)
	band.content_margin_top = 14
	band.content_margin_bottom = 18
	card_panel.add_theme_stylebox_override("panel", band)
	add_child(card_panel)
	card_box = VBoxContainer.new()
	card_box.alignment = BoxContainer.ALIGNMENT_CENTER
	card_box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	card_panel.add_child(card_box)
	card_sub = Label.new()
	card_sub.add_theme_font_size_override("font_size", 28)
	card_sub.add_theme_color_override("font_color", Color(1.0, 0.82, 0.25))
	card_sub.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.9))
	card_sub.add_theme_constant_override("outline_size", 8)
	card_sub.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	card_box.add_child(card_sub)
	card = Label.new()
	card.add_theme_font_size_override("font_size", 68)
	card.add_theme_color_override("font_color", Color.WHITE)
	card.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.95))
	card.add_theme_constant_override("outline_size", 14)
	card.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	card_box.add_child(card)


## A line of story text at the bottom of the picture (during a cutscene, while the HUD is hidden).
func show_caption(text: String) -> void:
	if caption == null:
		# on a soft dark band, so the words read on snow as well as on a dark scene
		caption_panel = PanelContainer.new()
		caption_panel.set_anchors_preset(Control.PRESET_BOTTOM_WIDE)
		caption_panel.offset_top = -190
		caption_panel.offset_bottom = -40
		caption_panel.offset_left = 70
		caption_panel.offset_right = -70
		caption_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
		caption_panel.add_theme_stylebox_override("panel", UiKit.style(Color(0.02, 0.03, 0.08, 0.7), Color(0, 0, 0, 0), 24, 28, false))
		add_child(caption_panel)
		caption = Label.new()
		caption.add_theme_font_size_override("font_size", 36)
		caption.add_theme_color_override("font_color", Color.WHITE)
		caption.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.9))
		caption.add_theme_constant_override("outline_size", 8)
		caption.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		caption.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
		caption.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		caption_panel.add_child(caption)
	caption.text = text
	caption.visible = true
	caption_panel.visible = true


func hide_caption() -> void:
	if caption != null:
		caption.visible = false
		caption_panel.visible = false


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
	tw.tween_property(card_panel, "modulate:a", 1.0, 0.5)
	tw.tween_interval(maxf(0.1, seconds - 1.0))
	tw.tween_property(card_panel, "modulate:a", 0.0, 0.5)
	await tw.finished
