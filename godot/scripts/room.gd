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
var entries: Dictionary = {}      # entry_<name> -> Vector3: where he appears when he comes from <name>
var characters: Dictionary = {}   # object id -> Actor (people and animals from the catalog)
var opens: Dictionary = {}        # object id -> { node, axis, angle }
var flickers: Array = []          # flame nodes, scaled a little every frame


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
			elif nm.begins_with("entry_"):
				entries[nm.trim_prefix("entry_")] = n3.global_position
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
		"sun":
			var d := DirectionalLight3D.new()
			d.light_color = Color(1.0, 0.95, 0.85)
			d.light_energy = 0.8
			d.shadow_enabled = true
			d.rotation_degrees = Vector3(-52.0, 28.0, 0.0)
			l = d
		"lamp":
			var o := OmniLight3D.new()
			o.light_color = Color(1.0, 0.8, 0.55)
			o.light_energy = 2.4
			o.omni_range = 10.0
			l = o
		"fire":
			var o := OmniLight3D.new()
			o.light_color = Color(1.0, 0.55, 0.2)
			o.light_energy = 2.2
			o.omni_range = 5.5
			o.shadow_enabled = true
			l = o
		"lantern":
			var o := OmniLight3D.new()
			o.light_color = Color(1.0, 0.8, 0.45)
			o.light_energy = 1.4
			o.omni_range = 4.0
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


# ================================================================ rooms built from the catalog

## Puts the props of a scene on this room (a shell from the catalog). `objects` are the scene's objects with
## the positions the layout builder gave them: at {x, y, rot, z}, stand [x, y], parent, part, of, fixed.
## Positions are in room space (x right, y away from the camera); Godot's z is -y.
func add_props(objects: Array, catalog: Dictionary) -> void:
	var props_cat: Dictionary = catalog.get("props", {})
	var by_id := {}
	for o in objects:
		by_id[String(o["id"])] = o
	for o in objects:
		var id := String(o["id"])
		if o.has("stand"):
			var s: Array = o["stand"]
			stands[id] = Vector3(float(s[0]), 0.0, -float(s[1]))
		if o.has("fixed") or not o.has("at"):
			continue
		var at: Dictionary = o["at"]
		var pos := Vector3(float(at["x"]), float(at.get("z", 0.0)), -float(at["y"]))
		var yaw := deg_to_rad(float(at.get("rot", 0.0)))
		if o.has("of"):
			_add_part_pick(id, o, by_id, props_cat, pos, yaw)
			continue
		var pid := String(o.get("prop", ""))
		if not props_cat.has(pid):
			continue
		var p: Dictionary = props_cat[pid]
		var node: Node3D
		if String(p.get("kind", "")) == "character":
			var a := Actor.new()
			add_child(a)
			a.setup("res://assets/%s" % String(p["glb"]), false)
			a.global_position = pos
			a.rotation.y = yaw
			a.face_yaw = yaw
			a.play("Idle")
			characters[id] = a
			node = a
		else:
			node = (load("res://assets/%s" % String(p["glb"])) as PackedScene).instantiate() as Node3D
			add_child(node)
			node.global_position = pos
			node.rotation.y = yaw
		props[id] = node
		_add_prop_pick(id, p, pos, yaw, at, String(p.get("kind", "")) == "item")
		if String(p.get("kind", "")) != "item" and not o.has("parent"):
			var fp: Array = p.get("footprint", [1.0, 1.0])
			var w := float(fp[0])
			var d := float(fp[1])
			if absf(sin(yaw)) > 0.5:
				var t := w
				w = d
				d = t
			blocks[id] = AABB(Vector3(pos.x - w / 2.0, 0.0, pos.z - d / 2.0), Vector3(w, 1.2, d))
		if p.has("lights"):
			for ld in p["lights"]:
				var at_l: Array = ld["at"]
				var lp := pos + Vector3(float(at_l[0]), float(at_l[2]), -float(at_l[1])).rotated(Vector3.UP, yaw)
				_make_light(String(ld["kind"]), lp, false)
		var anims: Dictionary = p.get("anims", {})
		for fname in anims.get("flicker", []):
			var fn := node.find_child(String(fname), true, false)
			if fn is Node3D:
				flickers.append(fn)
		if p.has("opens"):
			var oc: Dictionary = p["opens"]
			var target := node.find_child(String(oc.get("node", "")), true, false)
			if target is Node3D:
				opens[id] = {"node": target, "axis": String(oc.get("axis", "z")), "angle": float(oc.get("angle", 90.0))}


func _add_prop_pick(id: String, p: Dictionary, pos: Vector3, yaw: float, at: Dictionary, is_item: bool) -> void:
	var fp: Array = p.get("footprint", [1.0, 1.0])
	var size := Vector3(float(fp[0]), float(p.get("height", 1.0)), float(fp[1]))
	if is_item:
		size = Vector3(maxf(size.x, 0.5), maxf(size.y, 0.3), maxf(size.z, 0.35))
	var body := StaticBody3D.new()
	body.collision_layer = PICK_LAYER
	body.collision_mask = 0
	body.set_meta("pick_id", id)
	var shape := CollisionShape3D.new()
	var bs := BoxShape3D.new()
	bs.size = size
	shape.shape = bs
	body.add_child(shape)
	add_child(body)
	body.global_position = pos + Vector3(0.0, size.y / 2.0, 0.0)
	body.rotation.y = yaw
	picks[id] = body


## The door or window of a placed prop: a click volume over that part of the model.
func _add_part_pick(id: String, o: Dictionary, by_id: Dictionary, props_cat: Dictionary, pos: Vector3, yaw: float) -> void:
	var parent: Dictionary = by_id.get(String(o["of"]), {})
	var p: Dictionary = props_cat.get(String(parent.get("prop", "")), {})
	var part: Dictionary = (p.get("parts", {}) as Dictionary).get(String(o.get("part", "")), {})
	if part.is_empty():
		return
	var c: Array = part["center"]
	var sz: Array = part["size"]
	var local := Vector3(float(c[0]), float(part.get("min_z", 0.0)) + float(sz[2]) / 2.0, -float(c[1]))
	var body := StaticBody3D.new()
	body.collision_layer = PICK_LAYER
	body.collision_mask = 0
	body.set_meta("pick_id", id)
	var shape := CollisionShape3D.new()
	var bs := BoxShape3D.new()
	bs.size = Vector3(float(sz[0]), float(sz[2]), float(sz[1]))
	shape.shape = bs
	body.add_child(shape)
	add_child(body)
	body.global_position = Vector3(pos.x, 0.0, pos.z) + local.rotated(Vector3.UP, yaw)
	body.rotation.y = yaw
	picks[id] = body
	# the part that opens is the prop's "opens" node when this part is the one named there
	var op: Dictionary = p.get("opens", {})
	if op.has("part") and String(op["part"]) == String(o.get("part", "")):
		var holder: Node3D = props.get(String(o["of"]))
		if holder != null:
			var target := holder.find_child(String(op.get("node", "")), true, false)
			if target is Node3D:
				opens[id] = {"node": target, "axis": String(op.get("axis", "z")), "angle": float(op.get("angle", 90.0))}


## Plays the opening of a door or lid (rotation of the node named in the prop's catalog entry).
func open_object(id: String, animate: bool = true) -> bool:
	if not opens.has(id):
		return false
	var d: Dictionary = opens[id]
	var node: Node3D = d["node"]
	var prop_name := "rotation:%s" % String(d["axis"])
	if animate:
		var tw := create_tween().set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
		tw.tween_property(node, prop_name, deg_to_rad(float(d["angle"])), 0.6)
	else:
		node.set_indexed(NodePath(String(d["axis"]).insert(0, "rotation:")), deg_to_rad(float(d["angle"])))
	return true


func _process(_delta: float) -> void:
	if flickers.is_empty():
		return
	var t := Time.get_ticks_msec() / 1000.0
	for i in flickers.size():
		var n := flickers[i] as Node3D
		if is_instance_valid(n):
			var k := 1.0 + 0.12 * sin(t * 11.0 + i * 1.7) + 0.06 * sin(t * 23.0 + i)
			n.scale = Vector3(1.0 / sqrt(k), k, 1.0 / sqrt(k))
