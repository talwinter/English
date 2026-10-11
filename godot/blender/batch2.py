"""Catalog batch 2 (episode 2, "Into the Forest"): two rooms (the dark forest glade, the bear cave) and the props:
bear, father (standing and trapped), fallen tree, berry bush, cave mouth, berries.
Run inside Blender:  exec(open(r"H:\\Projects\\English\\godot\\blender\\batch2.py").read())
Writes godot/assets/{props,shells}/*.glb and catalog/{props,shells}/*.json (then: node tools/build-catalog.js).
"""
import sys
sys.path.insert(0, r"H:\Projects\English\godot\blender")
import importlib
import catalog_lib
importlib.reload(catalog_lib)
from catalog_lib import *
import random

BUILT = []


def start():
    reset_scene()
    p = palette()
    p["bear"] = mat("bear_fur", (0.42, 0.26, 0.14), rough=0.95)
    p["bear_light"] = mat("bear_light", (0.62, 0.43, 0.26), rough=0.95)
    p["bear_dark"] = mat("bear_dark", (0.24, 0.14, 0.08), rough=0.95)
    p["leaf"] = mat("leaf", (0.15, 0.36, 0.2), rough=0.9)
    p["leaf_dark"] = mat("leaf_dark", (0.08, 0.24, 0.15), rough=0.9)
    p["berry"] = mat("berry", (0.8, 0.05, 0.1), rough=0.4)
    p["rock"] = mat("rock", (0.36, 0.36, 0.42), rough=0.95)
    p["rock_dark"] = mat("rock_dark", (0.2, 0.2, 0.26), rough=0.95)
    p["hole"] = mat("hole", (0.01, 0.01, 0.02), rough=1.0)
    p["moss"] = mat("moss", (0.18, 0.3, 0.2), rough=0.95)
    p["tunic"] = mat("f_tunic", (0.45, 0.3, 0.16), rough=0.9)
    p["trousers"] = mat("f_trousers", (0.22, 0.22, 0.3), rough=0.9)
    p["beard"] = mat("f_beard", (0.3, 0.2, 0.12), rough=0.8)
    p["dirt"] = mat("dirt", (0.3, 0.22, 0.16), rough=1.0)
    return p


# ---- rig helpers (same as characters_batch1)
def new_rig(bones):
    arm = bpy.data.armatures.new("Rig")
    rig = bpy.data.objects.new("Rig", arm)
    bpy.context.scene.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig
    bpy.context.view_layer.update()
    bpy.ops.object.mode_set(mode='EDIT')
    for name, head, tail, parent in bones:
        eb = arm.edit_bones.new(name)
        eb.head, eb.tail = head, tail
        if parent:
            eb.parent = arm.edit_bones[parent]
    bpy.ops.object.mode_set(mode='OBJECT')
    for pb in rig.pose.bones:
        pb.rotation_mode = 'XYZ'
    return rig


def bind(rig, ob, bone):
    vg = ob.vertex_groups.new(name=bone)
    vg.add(list(range(len(ob.data.vertices))), 1.0, 'REPLACE')
    ob.parent = rig
    mod = ob.modifiers.new("Armature", 'ARMATURE')
    mod.object = rig
    return ob


def part(rig, name, bone, c0, c1, material, bw=0.03, seg=3):
    ob = box(name, c0, c1, material)
    if bw:
        soften(ob, bw, seg, smooth=True)
    return bind(rig, ob, bone)


def blob(rig, name, bone, center, radii, material):
    return bind(rig, ellipsoid(name, center, radii, 10, 7, material), bone)


def animate(rig, clips):
    rig.animation_data_create()
    ad = rig.animation_data
    for name, (frames, fn) in clips.items():
        act = bpy.data.actions.new(name)
        ad.action = act
        for f in range(frames + 1):
            for bone, v in fn(f / frames).items():
                pb = rig.pose.bones[bone]
                if len(v) == 4:
                    pb.location = v[:3]
                    pb.keyframe_insert("location", frame=f + 1)
                else:
                    pb.rotation_euler = v
                    pb.keyframe_insert("rotation_euler", frame=f + 1)
        tr = ad.nla_tracks.new()
        tr.name = name
        tr.strips.new(name, 1, act)
        ad.action = None
    for pb in rig.pose.bones:
        pb.location = (0, 0, 0)
        pb.rotation_euler = (0, 0, 0)


def contract(room, floor, spawn, cam_pos, cam_target, fov, lights=(), entries=None):
    x0, y0, x1, y1 = floor
    obj("nav_floor", [(x0, y0, 0), (x1, y0, 0), (x1, y1, 0), (x0, y1, 0)], [(0, 1, 2, 3)], None, room)
    empty("spawn_Hero", (spawn[0], spawn[1], 0.0), room)
    empty("spawn_Byte", (spawn[0] + 1.2, spawn[1] + 0.6, 1.7), room)
    cam = empty("camera", cam_pos, room)
    cam["fov"] = fov
    empty("camera_target", cam_target, room)
    for name, pos in lights:
        empty(f"light_{name}", pos, room)
    for name, pos in (entries or {}).items():
        empty(f"entry_{name}", (pos[0], pos[1], 0.0), room)


# ================================================================ props
def bear():
    p = start()
    rig = new_rig([
        ("Root", (0, 0, 0), (0, 0, 0.2), None),
        ("Body", (0, 0.2, 0.7), (0, -0.3, 0.75), "Root"),
        ("Head", (0, -0.7, 0.85), (0, -1.0, 0.85), "Body"),
    ])
    blob(rig, "body", "Body", (0, 0.15, 0.68), (0.5, 0.78, 0.48), p["bear"])
    blob(rig, "hump", "Body", (0, -0.25, 0.92), (0.4, 0.4, 0.38), p["bear"])
    blob(rig, "belly", "Body", (0, 0.1, 0.5), (0.4, 0.55, 0.3), p["bear_light"])
    for sx in (-1, 1):
        part(rig, f"leg_f{sx}", "Root", (sx * 0.27 - 0.13, -0.5, 0.0), (sx * 0.27 + 0.13, -0.22, 0.55), p["bear_dark"] if sx > 0 else p["bear"], 0.07)
        part(rig, f"leg_b{sx}", "Root", (sx * 0.28 - 0.14, 0.45, 0.0), (sx * 0.28 + 0.14, 0.78, 0.55), p["bear"] if sx > 0 else p["bear_dark"], 0.07)
    part(rig, "head", "Head", (-0.27, -1.05, 0.62), (0.27, -0.6, 1.1), p["bear"], 0.12, 4)
    part(rig, "snout", "Head", (-0.14, -1.28, 0.64), (0.14, -1.02, 0.86), p["bear_light"], 0.07, 3)
    part(rig, "nose", "Head", (-0.07, -1.31, 0.8), (0.07, -1.25, 0.88), p["black"], 0.025, 2)
    for sx in (-1, 1):
        part(rig, f"ear{sx}", "Head", (sx * 0.2 - 0.07, -0.78, 1.04), (sx * 0.2 + 0.07, -0.7, 1.2), p["bear_dark"], 0.04, 2)
        blob(rig, f"eye{sx}", "Head", (sx * 0.12, -1.06, 0.93), (0.04, 0.018, 0.04), p["black"])
    animate(rig, {"Idle": (96, lambda t: {
        "Root": (0.0, 0.006 * math.sin(2 * math.pi * t), 0.0, "loc"),
        "Body": (0.02 * math.sin(2 * math.pi * t), 0.0, 0.0),
        "Head": (0.1 + 0.05 * math.sin(2 * math.pi * t + 0.6), 0.1 * math.sin(2 * math.pi * t), 0.0),
    })})
    BUILT.append(finish_prop("bear", "bear", "character",
                             "a big brown bear on four legs; friendly but hungry",
                             ["bear"], place=("floor", "slot"), stand=1.4,
                             anims={"clips": ["Idle"]}, extra={"height": 1.2}))


def _man_parts(rig, p, standing=True):
    pass


def father():
    p = start()
    rig = new_rig([
        ("Root", (0, 0, 0), (0, 0, 0.2), None),
        ("Spine", (0, 0, 0.9), (0, 0, 1.35), "Root"),
        ("Head", (0, 0, 1.35), (0, 0, 1.78), "Spine"),
        ("ArmL", (0.25, 0, 1.3), (0.25, 0, 0.8), "Spine"),
        ("ArmR", (-0.25, 0, 1.3), (-0.25, 0, 0.8), "Spine"),
    ])
    for s in (-1, 1):
        part(rig, f"leg{s}", "Root", (s * 0.15 - 0.09, -0.09, 0.0), (s * 0.15 + 0.09, 0.09, 0.92), p["trousers"], 0.04)
        part(rig, f"boot{s}", "Root", (s * 0.15 - 0.1, -0.2, 0.0), (s * 0.15 + 0.1, 0.1, 0.15), p["leather"], 0.04)
    part(rig, "tunic", "Spine", (-0.28, -0.17, 0.78), (0.28, 0.17, 1.35), p["tunic"], 0.07)
    part(rig, "belt", "Spine", (-0.29, -0.18, 0.84), (0.29, 0.18, 0.92), p["leather"], 0.02)
    for side, s in (("L", 1), ("R", -1)):
        part(rig, f"sleeve{side}", f"Arm{side}", (s * 0.25 - 0.06, -0.06, 0.82), (s * 0.25 + 0.06, 0.06, 1.32), p["tunic"], 0.03)
        part(rig, f"hand{side}", f"Arm{side}", (s * 0.25 - 0.05, -0.05, 0.7), (s * 0.25 + 0.05, 0.05, 0.84), p["skin"], 0.03)
    part(rig, "neck", "Head", (-0.07, -0.07, 1.3), (0.07, 0.07, 1.42), p["skin"], 0.02)
    part(rig, "head", "Head", (-0.17, -0.16, 1.4), (0.17, 0.16, 1.72), p["skin"], 0.08, 4)
    part(rig, "hair", "Head", (-0.19, -0.14, 1.62), (0.19, 0.18, 1.78), p["beard"], 0.07)
    part(rig, "beard", "Head", (-0.15, -0.2, 1.36), (0.15, -0.1, 1.52), p["beard"], 0.05)
    for s in (-1, 1):
        blob(rig, f"eye{s}", "Head", (s * 0.075, -0.165, 1.6), (0.026, 0.011, 0.03), p["black"])
    animate(rig, {"Idle": (72, lambda t: {
        "Root": (0.0, 0.004 * math.sin(2 * math.pi * t), 0.0, "loc"),
        "Spine": (0.02 * math.sin(2 * math.pi * t), 0.0, 0.0),
        "Head": (0.0, 0.1 * math.sin(2 * math.pi * t), 0.02),
        "ArmL": (0.05 * math.sin(2 * math.pi * t + 1), 0.0, -0.05),
        "ArmR": (0.05 * math.sin(2 * math.pi * t), 0.0, 0.05),
    })})
    BUILT.append(finish_prop("father", "your father", "character",
                             "the hero's game-father: a strong man with a brown beard and a brown tunic, standing",
                             ["father", "dad", "man"], place=("floor",), stand=0.9,
                             anims={"clips": ["Idle"]}, extra={"height": 1.78}))


def father_trapped():
    p = start()
    # lying on his back along Y: head towards the camera (-Y), legs away from it
    rig = new_rig([
        ("Root", (0, 0, 0), (0, 0, 0.2), None),
        ("Torso", (0, -0.3, 0.2), (0, 0.2, 0.2), "Root"),
        ("Head", (0, -0.65, 0.22), (0, -0.95, 0.22), "Torso"),
        ("ArmL", (0.3, -0.4, 0.22), (0.3, -0.9, 0.5), "Torso"),
        ("ArmR", (-0.3, -0.4, 0.22), (-0.3, -0.9, 0.3), "Torso"),
    ])
    part(rig, "tunic", "Torso", (-0.3, -0.68, 0.0), (0.3, 0.25, 0.3), p["tunic"], 0.07)
    part(rig, "belt", "Torso", (-0.31, 0.12, 0.0), (0.31, 0.22, 0.31), p["leather"], 0.02)
    for s in (-1, 1):
        part(rig, f"leg{s}", "Root", (s * 0.15 - 0.1, 0.2, 0.0), (s * 0.15 + 0.1, 1.15, 0.2), p["trousers"], 0.04)
        part(rig, f"boot{s}", "Root", (s * 0.15 - 0.1, 1.1, 0.0), (s * 0.15 + 0.1, 1.35, 0.17), p["leather"], 0.04)
    part(rig, "armL", "ArmL", (0.3, -0.85, 0.15), (0.45, -0.35, 0.34), p["tunic"], 0.04)
    part(rig, "handL", "ArmL", (0.28, -1.0, 0.2), (0.48, -0.85, 0.4), p["skin"], 0.04)
    part(rig, "armR", "ArmR", (-0.45, -0.7, 0.0), (-0.3, -0.35, 0.18), p["tunic"], 0.04)
    part(rig, "handR", "ArmR", (-0.48, -0.9, 0.0), (-0.28, -0.7, 0.14), p["skin"], 0.04)
    part(rig, "head", "Head", (-0.17, -1.0, 0.0), (0.17, -0.66, 0.34), p["skin"], 0.08, 4)
    part(rig, "hair", "Head", (-0.19, -0.9, 0.0), (0.19, -0.64, 0.22), p["beard"], 0.07)
    part(rig, "beard", "Head", (-0.14, -1.03, 0.0), (0.14, -0.9, 0.16), p["beard"], 0.05)
    for s in (-1, 1):
        blob(rig, f"eye{s}", "Head", (s * 0.075, -0.96, 0.3), (0.026, 0.02, 0.012), p["black"])
    animate(rig, {"Idle": (72, lambda t: {
        "Torso": (0.02 * math.sin(2 * math.pi * t), 0.0, 0.0),
        "Head": (0.0, 0.0, 0.18 * math.sin(2 * math.pi * t)),
        "ArmL": (0.5 * math.sin(2 * math.pi * t), 0.0, 0.25 * math.sin(4 * math.pi * t)),
    })})
    BUILT.append(finish_prop("father_trapped", "your father (on the ground)", "character",
                             "the hero's game-father lying on the ground; his legs are stuck, he waves one hand",
                             ["father", "dad", "man"], place=("floor",), stand=1.0,
                             anims={"clips": ["Idle"]}, extra={"height": 0.4}))


def fallen_tree():
    p = start()
    cylinder("trunk", (0, 0, 0.42), 0.42, 3.8, 9, 'X', p["log"])
    cylinder("trunk_inner", (0, 0, 0.42), 0.44, 3.4, 9, 'X', p["wood_dark"])
    cylinder("stump_end", (-1.95, 0, 0.42), 0.4, 0.06, 9, 'X', p["wood_light"])
    for i, (x, dy, dz, s) in enumerate(((-0.9, -0.35, 0.78, 1.0), (0.5, 0.4, 0.8, 1.2), (1.2, -0.3, 0.62, 0.8))):
        B(f"branch{i}", (x - 0.05, dy - 0.06 * s, dz - 0.03), (x + 0.05, dy + 0.06 * s, dz + 0.5 * s), p["wood_dark"], bevel=0.015)
        cone(f"needles{i}", 0.38 * s, dz + 0.1 * s, dz + 0.8 * s, p["pine_dark"], center=(x, dy))
    cylinder("snow_top", (0, 0, 0.84), 0.2, 3.2, 7, 'X', p["snow"])
    BUILT.append(finish_prop("fallen_tree", "fallen tree", "scenery",
                             "a very big pine tree lying on the ground, too heavy to move",
                             ["tree", "log", "trunk"], place=("floor",), stand=1.1, extra={}))


def berry_bush():
    p = start()
    rng = random.Random(3)
    for i, (x, y, z, r) in enumerate(((0, 0, 0.35, 0.42), (-0.3, 0.1, 0.3, 0.3), (0.3, -0.05, 0.3, 0.32), (0.05, 0.2, 0.5, 0.3))):
        ellipsoid(f"leaf{i}", (x, y, z), (r, r, r * 0.85), 8, 6, p["leaf"] if i % 2 == 0 else p["leaf_dark"])
    for i in range(14):
        a = rng.uniform(0, 2 * math.pi)
        r = rng.uniform(0.3, 0.45)
        ellipsoid(f"berry{i}", (math.cos(a) * r * 0.9, -abs(math.sin(a)) * r * 0.9 - 0.05, rng.uniform(0.25, 0.65)), (0.05, 0.05, 0.05), 6, 4, p["berry"])
    BUILT.append(finish_prop("berry_bush", "bush with red berries", "scenery",
                             "a small green bush with many red berries (the berries can be taken)",
                             ["bush", "berries", "berry"], place=("floor",), stand=0.8))


def cave_mouth():
    p = start()
    rng = random.Random(8)
    blob_at = [(-1.2, 0.0, 0.7, 0.9, 0.7, 0.8), (1.2, 0.0, 0.7, 0.9, 0.7, 0.8), (-0.8, 0.0, 1.5, 1.0, 0.8, 0.7),
               (0.8, 0.0, 1.5, 1.0, 0.8, 0.7), (0.0, 0.0, 1.9, 1.3, 0.8, 0.6), (-1.7, 0.1, 1.5, 0.7, 0.6, 0.9), (1.7, 0.1, 1.5, 0.7, 0.6, 0.9)]
    for i, (x, y, z, rx, ry, rz) in enumerate(blob_at):
        ellipsoid(f"rock{i}", (x, y, z), (rx, ry, rz), 8, 6, p["rock"] if i % 2 == 0 else p["rock_dark"])
    ellipsoid("opening", (0, -0.3, 0.75), (0.65, 0.35, 0.8), 10, 7, p["hole"])
    B("floor_dark", (-0.6, -0.5, 0.0), (0.6, 1.0, 0.06), p["hole"], bevel=0)
    for i in range(5):
        ellipsoid(f"snowcap{i}", (-1.5 + i * 0.75, 0.0, 2.35 - abs(i - 2) * 0.28), (0.4, 0.5, 0.14), 6, 4, p["snow"])
    BUILT.append(finish_prop("cave_mouth", "cave", "exit",
                             "a dark cave opening in a rock wall: the way into the cave",
                             ["cave", "hole"], place=("edge", "floor"), stand=1.0))


def item_berries():
    p = start()
    ellipsoid("leaf", (0, 0, 0.012), (0.1, 0.06, 0.012), 6, 4, p["leaf"])
    for i, (x, y) in enumerate(((-0.04, 0.0), (0.04, 0.01), (0.0, -0.04), (0.05, -0.03), (-0.05, -0.03), (0.0, 0.04))):
        ellipsoid(f"b{i}", (x, y, 0.045), (0.032, 0.032, 0.032), 6, 4, p["berry"])
    BUILT.append(finish_prop("item_berries", "berries", "item", "a handful of red berries", ["berries", "berry"],
                             place=("floor", "surface", "inside"), stand=0.5))


# ================================================================ rooms
def forest_glade():
    p = start()
    rng = random.Random(21)
    room = empty("ShellForestGlade")
    cylinder("ground", (0, 2, -0.3), 30, 0.6, 24, 'Z', p["snow_shade"], room)
    B("glade", (-6.5, -3.0, -0.06), (6.5, 4.5, 0.0), p["snow"], room, bevel=0)
    for i in range(16):     # dark patches of earth between the trees
        x, y = rng.uniform(-5.5, 5.5), rng.uniform(-2.4, 3.8)
        cylinder(f"patch{i}", (x, y, 0.004), rng.uniform(0.3, 0.7), 0.01, 8, 'Z', p["dirt"], room)
    for i in range(34):     # a thick dark forest all around the back
        x = -15 + i * 0.95 + rng.uniform(-0.3, 0.3)
        y = 5.0 + rng.uniform(0, 4.5)
        pine(p, f"back{i}", x, y, rng.uniform(1.5, 2.6))
    for i in range(7):      # trees at the sides, close to the camera
        side = -1 if i % 2 == 0 else 1
        pine(p, f"side{i}", side * rng.uniform(6.3, 8.0), rng.uniform(-2.0, 3.5), rng.uniform(1.6, 2.3))
    contract(room, (-5.0, -1.8, 5.0, 3.2), (-3.6, -1.0), (0.0, -8.6, 3.9), (0.0, 0.8, 1.1), 50.0,
             lights=[("sun", (6, -8, 9))], entries={"default": (-3.6, -1.0), "cave": (3.8, 0.4), "left": (-4.4, 0.3)})
    BUILT.append(finish_shell(
        "forest_glade", "dark forest glade", "outdoor",
        "a snowy clearing in a thick dark pine forest, in dim cold light; space for a big fallen tree; the way out is at the left or right edge",
        [-5.0, -1.8, 5.0, 3.2], [-3.6, -1.0],
        walls={"back": 3.2},
        slots={"left_edge": [-4.2, 0.4], "right_edge": [4.2, 0.4], "center": [0.0, 1.0]},
        camera={"pos": [0.0, -8.6, 3.9], "target": [0.0, 0.8, 1.1], "fov": 50.0},
        extra={"sky": [0.28, 0.34, 0.45], "ambient": [0.62, 0.7, 0.86], "ambient_energy": 1.0, "light": "sun"}))


def cave_interior():
    p = start()
    rng = random.Random(33)
    room = empty("ShellCave")
    W, D = 4.2, 2.8
    B("floor_base", (-W, -D, -0.2), (W, D, -0.02), p["rock_dark"], room, bevel=0)
    for i in range(20):     # flat stones on the ground
        x, y = rng.uniform(-3.8, 3.8), rng.uniform(-2.4, 2.4)
        cylinder(f"flag{i}", (x, y, 0.0), rng.uniform(0.35, 0.8), 0.02, 7, 'Z', p["rock"] if i % 2 else p["stone_dark"], room)
    # the rock walls: three staggered rows of wide, flat boulders so they read as a cave wall, not as pillars
    for row, (z, rz) in enumerate(((0.45, 0.65), (1.35, 0.8), (2.35, 0.8))):
        n = 9
        for i in range(n):
            x = -W - 0.5 + (i + (0.5 if row % 2 else 0)) * ((2 * W + 1.0) / (n - 1))
            ellipsoid(f"wallb{row}_{i}", (x, D + 0.25 + rng.uniform(-0.1, 0.1), z + rng.uniform(-0.1, 0.15)),
                      (rng.uniform(0.85, 1.15), rng.uniform(0.6, 0.8), rz * rng.uniform(0.9, 1.15)), 8, 6,
                      p["rock"] if (i + row) % 2 else p["rock_dark"], room)
        for sx in (-1, 1):
            m = 5
            for i in range(m):
                y = -D + (i + (0.5 if row % 2 else 0)) * ((2 * D + 0.6) / (m - 1))
                ellipsoid(f"walls{row}_{sx}_{i}", (sx * (W + 0.25 + rng.uniform(-0.1, 0.1)), y, z + rng.uniform(-0.1, 0.15)),
                          (rng.uniform(0.6, 0.8), rng.uniform(0.85, 1.15), rz * rng.uniform(0.9, 1.15)), 8, 6,
                          p["rock"] if (i + row) % 2 else p["rock_dark"], room)
    for i in range(9):      # a low ceiling of rock out of sight, with stalactites
        x = -W + i * (2 * W / 8)
        cone(f"drip{i}", 0.13, 3.0, 3.8, p["rock_dark"], center=(x, rng.uniform(-1, 2)), segs=5)
    contract(room, (-3.7, -1.6, 3.7, 2.35), (-2.6, -1.0), (0.0, -6.8, 3.3), (0.0, 0.7, 1.15), 50.0,
             lights=[("lamp", (0.0, -0.3, 3.0))], entries={"default": (-2.6, -1.0), "outside": (-3.3, 0.0)})
    BUILT.append(finish_shell(
        "cave_interior", "bear cave inside", "indoor",
        "a cold rocky cave with a flat stone floor, a dim light from the entrance at the left; walls at the back, left and right",
        [-3.7, -1.6, 3.7, 2.35], [-2.6, -1.0],
        walls={"back": 2.45, "left": -3.85, "right": 3.85},
        slots={"center": [0.0, 0.5], "back_left": [-2.0, 1.6], "back_right": [2.2, 1.6]},
        camera={"pos": [0.0, -6.8, 3.3], "target": [0.0, 0.7, 1.15], "fov": 50.0},
        extra={"sky": [0.03, 0.03, 0.05], "ambient": [0.5, 0.52, 0.66], "ambient_energy": 0.9, "light": "lamp"}))


ALL = (bear, father, father_trapped, fallen_tree, berry_bush, cave_mouth, item_berries, forest_glade, cave_interior)
for fn in [f for f in ALL if not globals().get("ONLY") or f.__name__ in ONLY]:
    try:
        fn()
    except Exception as e:
        import traceback
        print("FAILED", fn.__name__, e)
        traceback.print_exc()
print("batch 2 built:", [b["id"] for b in BUILT])
