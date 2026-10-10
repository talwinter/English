shader_type canvas_item;
// Whole-picture glitch: bands slide sideways, colours split, blocks of noise. Put it on a full-screen
// ColorRect above the game and animate `amount` from 0 to 1.

uniform sampler2D screen_tex : hint_screen_texture, filter_linear_mipmap;
uniform float amount : hint_range(0.0, 1.0) = 0.0;

float hash(vec2 p) {
	return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void fragment() {
	vec2 uv = SCREEN_UV;
	float t = floor(TIME * 24.0);
	float band = floor(uv.y * 30.0);
	float h = hash(vec2(band, t));
	float on = step(1.0 - amount * 0.6, h);
	float shift = (hash(vec2(band + 7.0, t)) - 0.5) * 0.2 * on * amount;
	float split = 0.014 * amount;
	vec3 col;
	col.r = texture(screen_tex, vec2(uv.x + shift + split, uv.y)).r;
	col.g = texture(screen_tex, vec2(uv.x + shift, uv.y)).g;
	col.b = texture(screen_tex, vec2(uv.x + shift - split, uv.y)).b;
	float n = hash(floor(uv * vec2(128.0, 72.0)) + t);
	col = mix(col, vec3(n), step(0.985 - amount * 0.02, n) * amount * 0.7);
	COLOR = vec4(col, 1.0);
}
