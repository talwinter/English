"""Catalog batch 1, characters: Grandmother and the hungry wolf (episode 1), rigged, with an Idle loop.
Run inside Blender:  exec(open(r"H:\\Projects\\English\\godot\\blender\\characters_batch1.py").read())
Writes godot/assets/props/<id>.glb and catalog/props/<id>.json. They face -Y (towards the camera).
"""
import sys
sys.path.insert(0, r"H:\Projects\English\godot\blender")
import importlib
import catalog_lib
importlib.reload(catalog_lib)
from catalog_lib import *

BUILT = []


def new_rig(bones):
    """bones: [(name, head, tail, parent)]. Returns the rig object (armature)."""
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
    ob = ellipsoid(name, center, radii, 10, 7, material)
    return bind(rig, ob, bone)


def animate(rig, clips):
    """clips: {name: (frames, fn(t) -> {bone: (rx, ry, rz)})}; each becomes an NLA track so it exports alone."""
    rig.animation_data_create()
    ad = rig.animation_data
    for name, (frames, fn) in clips.items():
        act = bpy.data.actions.new(name)
        ad.action = act
        for f in range(frames + 1):
            for bone, v in fn(f / frames).items():
                pb = rig.pose.bones[bone]
                if len(v) == 4:      # (x, y, z, "loc")
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


# ---------------------------------------------------------------- Grandmother
def grandmother():
    reset_scene()
    p = palette()
    dress = mat("gm_dress", (0.35, 0.22, 0.4), rough=0.9)
    shawl = mat("gm_shawl", (0.7, 0.35, 0.25), rough=0.9)
    apron = mat("gm_apron", (0.92, 0.88, 0.8), rough=0.9)
    hair = p["hair_white"]
    skin = p["skin"]
    glass = mat("gm_glass", (0.1, 0.1, 0.12), rough=0.3)
    rig = new_rig([
        ("Root", (0, 0, 0), (0, 0, 0.2), None),
        ("Spine", (0, 0, 0.75), (0, 0, 1.18), "Root"),
        ("Head", (0, 0, 1.18), (0, 0, 1.55), "Spine"),
        ("ArmL", (0.2, 0, 1.05), (0.2, 0, 0.62), "Spine"),
        ("ArmR", (-0.2, 0, 1.05), (-0.2, 0, 0.62), "Spine"),
    ])
    # long dress (wide at the bottom), apron, shawl
    part(rig, "dress_skirt", "Root", (-0.3, -0.22, 0.0), (0.3, 0.22, 0.8), dress, 0.06)
    part(rig, "dress_hem", "Root", (-0.34, -0.26, 0.0), (0.34, 0.26, 0.12), dress, 0.04)
    part(rig, "dress_top", "Spine", (-0.2, -0.14, 0.75), (0.2, 0.14, 1.12), dress, 0.06)
    part(rig, "apron", "Spine", (-0.15, -0.16, 0.3), (0.15, -0.13, 0.95), apron, 0.02)
    part(rig, "shawl", "Spine", (-0.26, -0.18, 0.98), (0.26, 0.18, 1.14), shawl, 0.07)
    part(rig, "shoe_l", "Root", (0.06, -0.2, 0.0), (0.18, 0.04, 0.07), p["black"], 0.03)
    part(rig, "shoe_r", "Root", (-0.18, -0.2, 0.0), (-0.06, 0.04, 0.07), p["black"], 0.03)
    for side, s in (("L", 1), ("R", -1)):
        part(rig, f"sleeve{side}", f"Arm{side}", (s * 0.2 - 0.05, -0.05, 0.7), (s * 0.2 + 0.05, 0.05, 1.07), dress, 0.03)
        part(rig, f"hand{side}", f"Arm{side}", (s * 0.2 - 0.04, -0.04, 0.6), (s * 0.2 + 0.04, 0.04, 0.71), skin, 0.03)
    # head: soft, with grey hair in a bun and small glasses
    part(rig, "neck", "Head", (-0.05, -0.05, 1.12), (0.05, 0.05, 1.22), skin, 0.02)
    part(rig, "head", "Head", (-0.15, -0.14, 1.2), (0.15, 0.14, 1.5), skin, 0.08, 4)
    part(rig, "hair_top", "Head", (-0.17, -0.15, 1.44), (0.17, 0.15, 1.56), hair, 0.07)
    part(rig, "hair_back", "Head", (-0.16, 0.06, 1.25), (0.16, 0.17, 1.5), hair, 0.06)
    part(rig, "bun", "Head", (-0.07, 0.1, 1.5), (0.07, 0.24, 1.66), hair, 0.05)
    for s in (-1, 1):
        blob(rig, f"eye{s}", "Head", (s * 0.07, -0.145, 1.37), (0.026, 0.011, 0.034), p["black"])
        part(rig, f"lens{s}", "Head", (s * 0.07 - 0.045, -0.152, 1.335), (s * 0.07 + 0.045, -0.146, 1.41), glass, 0.01, 1)
    part(rig, "nose", "Head", (-0.02, -0.17, 1.31), (0.02, -0.14, 1.36), p["skin_dark"] if "skin_dark" in p else skin, 0.01, 2)
    part(rig, "mouth", "Head", (-0.035, -0.15, 1.26), (0.035, -0.142, 1.275), mat("gm_mouth", (0.55, 0.2, 0.2)), 0.004, 1)
    animate(rig, {"Idle": (72, lambda t: {
        "Root": (0.0, 0.004 * math.sin(2 * math.pi * t), 0.0, "loc"),
        "Spine": (0.02 * math.sin(2 * math.pi * t), 0.0, 0.0),
        "Head": (0.0, 0.14 * math.sin(2 * math.pi * t), 0.02),
        "ArmL": (0.05 * math.sin(2 * math.pi * t + 1), 0.0, -0.05),
        "ArmR": (0.05 * math.sin(2 * math.pi * t), 0.0, 0.05),
    })})
    BUILT.append(finish_prop("grandmother", "Grandmother", "character",
                             "the hero's grandmother: an old, kind woman in a long purple dress with white hair in a bun",
                             ["grandmother", "grandma", "woman"], place=("floor",), stand=0.9,
                             anims={"clips": ["Idle"]}, extra={"height": 1.66}))


# ---------------------------------------------------------------- the hungry wolf
def wolf():
    reset_scene()
    p = palette()
    rig = new_rig([
        ("Root", (0, 0, 0), (0, 0, 0.2), None),
        ("Body", (0, 0.1, 0.55), (0, -0.2, 0.6), "Root"),
        ("Head", (0, -0.55, 0.78), (0, -0.85, 0.8), "Body"),
        ("Tail", (0, 0.62, 0.62), (0, 0.95, 0.5), "Body"),
    ])
    fur, light, dark = p["fur"], p["fur_light"], p["fur_dark"]
    # a thin wolf: narrow body, long legs
    blob(rig, "body", "Body", (0, 0.12, 0.62), (0.2, 0.58, 0.26), fur)
    blob(rig, "chest", "Body", (0, -0.28, 0.62), (0.22, 0.28, 0.3), light)
    blob(rig, "rump", "Body", (0, 0.5, 0.6), (0.19, 0.24, 0.23), fur)
    part(rig, "neck", "Body", (-0.12, -0.62, 0.6), (0.12, -0.3, 0.9), fur, 0.06)
    for sx in (-1, 1):
        part(rig, f"leg_f{sx}", "Root", (sx * 0.12 - 0.045, -0.36 - 0.05, 0.0), (sx * 0.12 + 0.045, -0.36 + 0.05, 0.55), dark if sx > 0 else fur, 0.025)
        part(rig, f"leg_b{sx}", "Root", (sx * 0.12 - 0.05, 0.5 - 0.06, 0.0), (sx * 0.12 + 0.05, 0.5 + 0.07, 0.5), dark if sx < 0 else fur, 0.03)
    part(rig, "head", "Head", (-0.14, -0.84, 0.72), (0.14, -0.52, 0.98), fur, 0.06, 3)
    part(rig, "snout", "Head", (-0.07, -1.06, 0.74), (0.07, -0.8, 0.88), light, 0.04, 3)
    part(rig, "nose", "Head", (-0.035, -1.085, 0.84), (0.035, -1.04, 0.89), p["black"], 0.015, 2)
    for sx in (-1, 1):
        part(rig, f"ear{sx}", "Head", (sx * 0.1 - 0.035, -0.62, 0.96), (sx * 0.1 + 0.035, -0.56, 1.12), dark, 0.02, 2)
        blob(rig, f"eye{sx}", "Head", (sx * 0.075, -0.86, 0.87), (0.028, 0.012, 0.028), p["black"])
        blob(rig, f"glint{sx}", "Head", (sx * 0.068, -0.872, 0.88), (0.009, 0.005, 0.009), p["white"])
        part(rig, f"brow{sx}", "Head", (sx * 0.075 - 0.04, -0.86, 0.9), (sx * 0.075 + 0.04, -0.85, 0.925), dark, 0.006, 1)
    part(rig, "tail", "Tail", (-0.05, 0.6, 0.45), (0.05, 1.0, 0.62), fur, 0.04, 3)
    animate(rig, {"Idle": (72, lambda t: {
        "Root": (0.0, 0.005 * math.sin(2 * math.pi * t), 0.0, "loc"),
        "Body": (0.015 * math.sin(2 * math.pi * t), 0.0, 0.0),
        "Head": (0.12 + 0.05 * math.sin(2 * math.pi * t + 0.8), 0.18 * math.sin(2 * math.pi * t), 0.0),
        "Tail": (0.0, 0.0, 0.5 * math.sin(4 * math.pi * t)),
    })})
    BUILT.append(finish_prop("wolf", "wolf", "character",
                             "a big, thin grey wolf with sad eyes; hungry, not scary",
                             ["wolf", "dog"], place=("floor", "slot"), stand=1.1,
                             anims={"clips": ["Idle"]}, extra={"height": 1.0}))


for fn in (grandmother, wolf):
    try:
        fn()
    except Exception as e:
        import traceback
        print("FAILED", fn.__name__, e)
        traceback.print_exc()
print("characters built:", [b["id"] for b in BUILT])
