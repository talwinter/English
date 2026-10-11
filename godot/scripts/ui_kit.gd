class_name UiKit
extends RefCounted
## One look for every panel and button of the game: soft rounded glass, a thin light border, a gentle shadow.
## Every file that builds UI calls UiKit.style() (directly or through its own _style), so the look is the same in
## every screen and can be changed here, once.

const GOLD := Color(1.0, 0.82, 0.25)
const PANEL := Color(0.05, 0.07, 0.14, 0.82)
const PANEL_SOLID := Color(0.06, 0.08, 0.16, 0.97)
const INK := Color(0.05, 0.06, 0.12)


## A rounded panel or button background. `border` is a hint of the accent: its alpha is softened.
static func style(color: Color, border: Color = Color(0, 0, 0, 0), radius: int = 14, margin: int = 12, shadow: bool = true) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = color
	s.anti_aliasing = true
	if border.a > 0.0:
		s.border_color = Color(border.r, border.g, border.b, minf(border.a, 1.0) * 0.75)
		s.set_border_width_all(1)
	s.set_corner_radius_all(maxi(radius, 12))
	s.content_margin_left = margin
	s.content_margin_right = margin
	s.content_margin_top = maxi(6, int(margin * 0.55))
	s.content_margin_bottom = maxi(6, int(margin * 0.55))
	if shadow and color.a > 0.45:
		s.shadow_color = Color(0, 0, 0, 0.38)
		s.shadow_size = 9
		s.shadow_offset = Vector2(0, 3)
	return s


## A small pill, for a label that sits on a bar: the GOAL tag, the score.
static func pill(color: Color, margin: int = 10) -> StyleBoxFlat:
	var s := style(color, Color(0, 0, 0, 0), 12, margin, false)
	s.content_margin_top = 3
	s.content_margin_bottom = 3
	return s


## The text field for typing commands.
static func line_edit(edit: LineEdit, font: int = 18) -> void:
	edit.add_theme_font_size_override("font_size", font)
	edit.add_theme_color_override("font_color", Color(0.93, 0.95, 1.0))
	edit.add_theme_color_override("font_placeholder_color", Color(0.62, 0.66, 0.8, 0.8))
	edit.add_theme_stylebox_override("normal", style(Color(0, 0, 0, 0.32), Color(1, 1, 1, 0.14), 12, 14, false))
	edit.add_theme_stylebox_override("focus", style(Color(0, 0, 0, 0.42), GOLD, 12, 14, false))


## A bar docked to the top or bottom edge of the window: flat, full width, one light line towards the game.
static func bar(top: bool) -> StyleBoxFlat:
	var s := StyleBoxFlat.new()
	s.bg_color = Color(0.045, 0.06, 0.12, 0.98)
	s.set_corner_radius_all(0)
	s.content_margin_left = 14
	s.content_margin_right = 14
	s.content_margin_top = 6
	s.content_margin_bottom = 6
	if top:
		s.border_width_bottom = 2
	else:
		s.border_width_top = 2
	s.border_color = Color(1.0, 0.82, 0.25, 0.35)
	return s
