class_name ItemIcons
extends Node
## Renders a small picture of an item from its real 3D model, for the bag. One look for every item in every
## episode: the same camera angle, light and size. Pictures are cached by item id.

const SIZE := 160

var _vp: SubViewport
var _holder: Node3D
var _cam: Camera3D
var _cache: Dictionary = {}
var _busy := false


func _ready() -> void:
	_vp = SubViewport.new()
	_vp.size = Vector2i(SIZE, SIZE)
	_vp.transparent_bg = true
	_vp.own_world_3d = true
	_vp.render_target_update_mode = SubViewport.UPDATE_DISABLED
	_vp.msaa_3d = Viewport.MSAA_4X
	add_child(_vp)
	var env := Environment.new()
	env.background_mode = Environment.BG_CLEAR_COLOR
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.85, 0.85, 0.95)
	env.ambient_light_energy = 0.75
	var we := WorldEnvironment.new()
	we.environment = env
	_vp.add_child(we)
	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-50.0, -35.0, 0.0)
	sun.light_energy = 1.3
	_vp.add_child(sun)
	_cam = Camera3D.new()
	_cam.projection = Camera3D.PROJECTION_ORTHOGONAL
	_vp.add_child(_cam)
	_holder = Node3D.new()
	_vp.add_child(_holder)


func has_icon(id: String) -> bool:
	return _cache.has(id)


func get_icon(id: String) -> Texture2D:
	return _cache.get(id)


static func _aabb_of(node: Node) -> AABB:
	var box := AABB()
	var first := true
	for n in node.find_children("*", "MeshInstance3D", true, false):
		var mi := n as MeshInstance3D
		if mi.mesh == null:
			continue
		var b: AABB = mi.global_transform * mi.mesh.get_aabb()
		if first:
			box = b
			first = false
		else:
			box = box.merge(b)
	return box


## Makes the picture of `source` (any Node3D with meshes; it is copied, the original is left alone).
func render(id: String, source: Node3D) -> Texture2D:
	if _cache.has(id):
		return _cache[id]
	while _busy:
		await get_tree().process_frame
	_busy = true
	for c in _holder.get_children():
		c.queue_free()
	var copy := source.duplicate() as Node3D
	copy.visible = true
	for n in copy.find_children("*", "Node3D", true, false):
		(n as Node3D).visible = true
	var pivot := Node3D.new()
	_holder.add_child(pivot)
	pivot.add_child(copy)
	await get_tree().process_frame
	var box := _aabb_of(copy)
	var center := box.get_center()
	var extent := maxf(box.size.x, maxf(box.size.y, box.size.z))
	copy.global_position -= center
	pivot.rotation_degrees = Vector3(0.0, -30.0, 0.0)
	_cam.size = maxf(extent * 1.2, 0.06)
	_cam.position = Vector3(0.0, 1.5, 1.5) * (extent * 1.6 + 1.0)
	_cam.look_at(Vector3.ZERO, Vector3.UP)
	_vp.render_target_update_mode = SubViewport.UPDATE_ONCE
	await RenderingServer.frame_post_draw
	await RenderingServer.frame_post_draw
	var img := _vp.get_texture().get_image()
	var tex := ImageTexture.create_from_image(img)
	_cache[id] = tex
	_busy = false
	return tex
