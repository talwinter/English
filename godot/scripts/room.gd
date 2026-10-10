class_name Room
extends Node3D
## A room (or outdoor scene) built in Blender and exported as glTF. It follows the catalog's naming
## contract (documented at the top of godot/blender/attic.py):
##   nav_floor, block_<id>, pick_<id>, stand_<id>, prop_<id>, screen_face, light_<name>,
##   spawn_Hero, spawn_Byte, camera, camera_target (custom property fov), box_flap_*.
## Room only reads that contract and offers it to the game: clickable volumes, stand points, props that
## can be shown or hidden, the fixed camera, lights, and a navigation mesh baked from the floor.

const PICK_LAYER := 2

var picks: Dictionary = {}      # id -> StaticBody3D
var stands: Dictionary = {}     # id -> Vector3
var props: Dictionary = {}      # id -> Node3D (prop_<id>)
var blocks: Dictionary = {}     # id -> AABB (global): furniture footprints
var named: Dictionary = {}      # every named node, for special cases (screen_face, box_flap_front ...)
var spawn_hero := Vector3.ZERO
var spawn_byte := Vector3.ZERO
var cam_pos := Vector3(0.0, 3.3, 5.7)
var cam_target := Vector3(0.0, 1.0, -0.6)
var cam_fov := 50.0
var lights: Array[Light3D] = []
var nav_region: NavigationRegion3D
var scene_root: Node


func build(glb_path: String, dust: bool = true) -> void:
	var packed := load(glb_path) as PackedScene
	scene_root = packed.instantiate()
	add_child(scene_root)
	var cam_marker: Node3D = null
	var target_marker: Node3D = null
	for n in scene_root.find_children("*", "", true, false):
		var nm := String(n.name)
		named[nm] = n
		if n is MeshInstance3D:
			var mi := n as MeshInstance3D
			var box: AABB = mi.global_transform * mi.mesh.get_aabb()
			if nm == "nav_floor":
				mi.layers = 0        # invisible, but still the source geometry of the navigation mesh
				mi.add_to_group("nav_src")
			elif nm.begins_with("block_"):
				mi.visible = false
				blocks[nm.trim_prefix("block_")] = box
			elif nm.begins_with("pick_"):
				mi.visible = false
				var id := nm.trim_prefix("pick_")
				var body := StaticBody3D.new()
				body.collision_layer = PICK_LAYER
				body.collision_mask = 0
				body.set_meta("pick_id", id)
				var shape := CollisionShape3D.new()
				var bs := BoxShape3D.new()
				bs.size = box.size
				shape.shape = bs
				body.add_child(shape)
				add_child(body)
				body.global_position = box.get_center()
				picks[id] = body
		elif n is Node3D:
			var n3 := n as Node3D
			if nm.begins_with("stand_"):
				stands[nm.trim_prefix("stand_")] = n3.global_position
			elif nm.begins_with("prop_"):
				props[nm.trim_prefix("prop_")] = n3
			elif nm == "spawn_Hero":
				spawn_hero = n3.global_position
			elif nm == "spawn_Byte":
				spawn_byte = n3.global_position
			elif nm == "camera":
				cam_marker = n3
				if n3.has_meta("extras"):
					var ex: Variant = n3.get_meta("extras")
					if ex is Dictionary and (ex as Dictionary).has("fov"):
						cam_fov = float(ex["fov"])
			elif nm == "camera_target":
				target_marker = n3
			elif nm.begins_with("light_"):
				_make_light(nm.trim_prefix("light_"), n3.global_position, dust)
	if cam_marker:
		cam_pos = cam_marker.global_position
	if target_marker:
		cam_target = target_marker.global_position


func _make_light(kind: String, at: Vector3, dust: bool) -> void:
	var l: Light3D
	match kind:
		"bulb":
			var o := OmniLight3D.new()
			o.light_color = Color(1.0, 0.82, 0.5)
			o.light_energy = 5.0
			o.omni_range = 9.0
			o.shadow_enabled = true
			l = o
			if dust:
				_add_dust(at + Vector3(0.0, -0.4, 0.2))
		"window":
			var o := OmniLight3D.new()
			o.light_color = Color(0.55, 0.7, 1.0)
			o.light_energy = 1.3
			o.omni_range = 5.0
			l = o
		"moon":
			var d := DirectionalLight3D.new()
			d.light_color = Color(0.62, 0.72, 1.0)
			d.light_energy = 1.1
			d.shadow_enabled = true
			d.rotation_degrees = Vector3(-42.0, 150.0, 0.0)
			l = d
		_:
			var o := OmniLight3D.new()
			o.omni_range = 6.0
			l = o
	add_child(l)
	l.global_position = at
	lights.append(l)


## A few specks of dust floating in the light.
func _add_dust(at: Vector3) -> void:
	var p := CPUParticles3D.new()
	p.amount = 36
	p.lifetime = 10.0
	p.preprocess = 10.0
	p.emission_shape = CPUParticles3D.EMISSION_SHAPE_SPHERE
	p.emission_sphere_radius = 1.5
	p.direction = Vector3(0.3, 0.5, 0.0)
	p.spread = 180.0
	p.initial_velocity_min = 0.02
	p.initial_velocity_max = 0.07
	p.gravity = Vector3.ZERO
	var q := QuadMesh.new()
	q.size = Vector2(0.03, 0.03)
	var m := StandardMaterial3D.new()
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.albedo_color = Color(1.0, 0.93, 0.72, 0.55)
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	m.billboard_mode = BaseMaterial3D.BILLBOARD_ENABLED
	q.material = m
	p.mesh = q
	add_child(p)
	p.global_position = at


## Bakes the navigation mesh: the floor, with the furniture footprints cut out.
func bake_navigation() -> void:
	for id in blocks:
		var b: AABB = blocks[id]
		var ob := NavigationObstacle3D.new()
		ob.affect_navigation_mesh = true
		ob.carve_navigation_mesh = false
		ob.height = 1.2
		ob.vertices = PackedVector3Array([
			Vector3(b.position.x, 0, b.position.z), Vector3(b.position.x, 0, b.end.z),
			Vector3(b.end.x, 0, b.end.z), Vector3(b.end.x, 0, b.position.z)])
		ob.add_to_group("nav_src")
		add_child(ob)
		ob.global_position = Vector3(0, -0.1, 0)
	var nm := NavigationMesh.new()
	nm.cell_size = 0.1
	nm.cell_height = 0.1
	nm.agent_radius = 0.28
	nm.agent_height = 1.5
	nm.agent_max_climb = 0.2
	nm.agent_max_slope = 40.0
	nm.geometry_parsed_geometry_type = NavigationMesh.PARSED_GEOMETRY_MESH_INSTANCES
	nm.geometry_source_geometry_mode = NavigationMesh.SOURCE_GEOMETRY_GROUPS_EXPLICIT
	nm.geometry_source_group_name = &"nav_src"
	nav_region = NavigationRegion3D.new()
	nav_region.navigation_mesh = nm
	add_child(nav_region)
	nav_region.bake_navigation_mesh(false)


func closest_walkable(p: Vector3) -> Vector3:
	return NavigationServer3D.map_get_closest_point(nav_region.get_navigation_map(), p)


func path_between(a: Vector3, b: Vector3) -> PackedVector3Array:
	return NavigationServer3D.map_get_path(nav_region.get_navigation_map(), a, b, true)


func on_furniture(p: Vector3) -> String:
	for id in blocks:
		var b: AABB = blocks[id]
		if p.x > b.position.x and p.x < b.end.x and p.z > b.position.z and p.z < b.end.z:
			return String(id)
	return ""


# ---------- showing and hiding things the episode controls

func set_object_visible(id: String, shown: bool) -> void:
	if props.has(id):
		(props[id] as Node3D).visible = shown
	if picks.has(id):
		(picks[id] as StaticBody3D).collision_layer = PICK_LAYER if shown else 0
