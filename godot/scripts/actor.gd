class_name Actor
extends Node3D
## A character in a room: a glTF model that walks along a path, turns to face things and plays animations.
## The model faces +Z (what Blender's -Y becomes), so yaw = atan2(dx, dz).

signal arrived

var model: Node3D
var anim: AnimationPlayer
var speed := 1.7
var path: PackedVector3Array = PackedVector3Array()
var path_i := 0
var walking := false
var face_yaw := 0.0
var shadow: MeshInstance3D


func setup(glb_path: String, with_shadow: bool = true) -> void:
	model = (load(glb_path) as PackedScene).instantiate() as Node3D
	add_child(model)
	anim = model.find_child("AnimationPlayer", true, false) as AnimationPlayer
	if anim:
		for a in anim.get_animation_list():
			anim.get_animation(a).loop_mode = Animation.LOOP_LINEAR
	if with_shadow:
		shadow = MeshInstance3D.new()
		var disc := CylinderMesh.new()
		disc.top_radius = 0.3
		disc.bottom_radius = 0.3
		disc.height = 0.004
		disc.radial_segments = 20
		shadow.mesh = disc
		var bm := StandardMaterial3D.new()
		bm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		bm.albedo_color = Color(0.0, 0.0, 0.0, 0.38)
		bm.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		shadow.material_override = bm
		shadow.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		shadow.position = Vector3(0.0, 0.012, 0.0)
		add_child(shadow)


func play(name: String, blend: float = 0.15, speed_scale: float = 1.0) -> void:
	if anim == null:
		return
	for a in anim.get_animation_list():
		if String(a).to_lower().contains(name.to_lower()):
			anim.speed_scale = speed_scale
			if anim.current_animation != a:
				anim.play(a, blend)
			return


func walk_along(points: PackedVector3Array) -> void:
	path = points
	path_i = 1 if points.size() > 1 else points.size()
	walking = path_i < path.size()
	if walking:
		play("Walk")
	else:
		play("Idle")
		arrived.emit.call_deferred()


func face_point(p: Vector3) -> void:
	var d := p - global_position
	if Vector2(d.x, d.z).length() > 0.01:
		face_yaw = atan2(d.x, d.z)


func _process(delta: float) -> void:
	if walking:
		var target := path[path_i]
		var to := target - global_position
		to.y = 0.0
		var step := speed * delta
		if to.length() <= step:
			global_position = Vector3(target.x, global_position.y, target.z)
			path_i += 1
			if path_i >= path.size():
				walking = false
				play("Idle")
				arrived.emit()
		else:
			var d := to.normalized()
			global_position += d * step
			face_yaw = atan2(d.x, d.z)
	rotation.y = lerp_angle(rotation.y, face_yaw, clampf(delta * 10.0, 0.0, 1.0))
