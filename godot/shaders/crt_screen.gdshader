shader_type spatial;
render_mode unshaded, cull_back;
// The live screen of the old computer: a 4:3 picture (the terminal) on a bulging CRT, with scanlines,
// a turn-on animation (a bright line opens into the picture) and glitches.

uniform sampler2D tex : source_color, filter_linear;
uniform float power : hint_range(0.0, 1.0) = 1.0;     // 0 = off, 1 = on (animate it for the turn-on)
uniform float glitch : hint_range(0.0, 1.0) = 0.0;
uniform float brightness = 1.35;

float hash(vec2 p) {
	return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

void fragment() {
	vec2 c = UV * 2.0 - 1.0;
	float r2 = dot(c, c);
	c *= 1.0 + 0.08 * r2;                       // the glass bulges
	vec2 suv = c * 0.5 + 0.5;

	// turn on: a line, then it opens
	float open = smoothstep(0.08, 0.7, power);
	float half_h = mix(0.012, 1.02, open);
	float vis = 1.0 - smoothstep(half_h - 0.02, half_h, abs(c.y));
	float line_glow = (1.0 - open) * smoothstep(0.0, 0.1, power);

	// glitch: rows shift sideways, colours split
	float t = floor(TIME * 22.0);
	float band = floor(suv.y * 36.0);
	float h = hash(vec2(band, t));
	float on = step(1.0 - 0.55 * glitch, h);
	float shift = (hash(vec2(band + 3.0, t)) - 0.5) * 0.22 * glitch * on;
	float split = 0.012 * glitch;
	vec3 col;
	col.r = texture(tex, vec2(suv.x + shift + split, suv.y)).r;
	col.g = texture(tex, vec2(suv.x + shift, suv.y)).g;
	col.b = texture(tex, vec2(suv.x + shift - split, suv.y)).b;
	float n = hash(floor(suv * vec2(96.0, 72.0)) + t);
	col = mix(col, vec3(n * 0.9), step(0.97, n) * glitch * 0.7);

	float scan = 0.84 + 0.16 * sin(suv.y * 360.0 * 3.14159);
	float vig = smoothstep(1.45, 0.35, length(c));
	float inside = step(0.0, suv.x) * step(suv.x, 1.0) * step(0.0, suv.y) * step(suv.y, 1.0);
	vec3 base = col * scan * vig * brightness;
	// a faint phosphor glow even on black
	base += vec3(0.01, 0.03, 0.015) * vig;
	vec3 lit = base * vis + vec3(0.7, 1.0, 0.8) * line_glow * vis * 2.0;
	ALBEDO = lit * inside;
}
