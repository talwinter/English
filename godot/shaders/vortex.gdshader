shader_type spatial;
render_mode unshaded, blend_add, cull_disabled, depth_draw_never;
// A glowing whirlpool that pulls things into the screen (the "pull in" moment).

uniform float amount : hint_range(0.0, 1.0) = 0.0;
uniform float spin = 0.0;

void fragment() {
	vec2 p = UV * 2.0 - 1.0;
	float r = length(p);
	float a = atan(p.y, p.x);
	float swirl = a + spin * 5.0 - r * 8.0;
	float arms = 0.5 + 0.5 * sin(swirl * 3.0);
	float edge = smoothstep(1.0, 0.72, r);
	float hole = smoothstep(0.0, 0.2, r);
	vec3 col = mix(vec3(0.05, 0.25, 1.0), vec3(0.55, 1.0, 0.95), arms);
	col *= arms * 0.9 + 0.35;
	col += vec3(0.9, 1.0, 1.0) * smoothstep(0.3, 0.0, r) * 0.9;
	ALBEDO = col * 0.85;
	ALPHA = clamp(edge * (0.15 + 0.7 * hole) * amount * 0.75, 0.0, 1.0);
}
