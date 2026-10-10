"""The hero: a stylized low-poly teenager in a red hoodie and jeans, rigged, with Idle (blinking) and Walk.
Run inside Blender (through the Blender MCP):

    exec(open(r"H:\\Projects\\English\\godot\\blender\\boy.py").read())

Writes godot/assets/boy.glb. He faces -Y in Blender, which is +Z in Godot (towards the camera).
Height is about 1.67 m. Rounded edges come from Bevel modifiers (applied when exporting).
"""
import sys
sys.path.insert(0, r"H:\Projects\English\godot\blender")
import importlib
import lib
importlib.reload(lib)
from lib import *
import math

reset_scene()

skin = mat("skin", (0.96, 0.76, 0.60), rough=0.7)
skin_dark = mat("skin_dark", (0.86, 0.62, 0.48), rough=0.7)
hair = mat("hair", (0.24, 0.13, 0.07), rough=0.6)
red = mat("hoodie", (0.84, 0.10, 0.10), rough=0.8)
red_dark = mat("hoodie_dark", (0.60, 0.06, 0.07), rough=0.8)
jeans = mat("jeans", (0.17, 0.28, 0.60), rough=0.85)
jeans_light = mat("jeans_light", (0.36, 0.52, 0.82), rough=0.85)
shoe = mat("shoe", (0.95, 0.95, 0.95), rough=0.5)
sole = mat("sole", (0.22, 0.22, 0.24), rough=0.6)
dark = mat("eyes", (0.05, 0.03, 0.03), rough=0.3)
white = mat("white", (1.0, 1.0, 1.0), rough=0.4)
mouth_m = mat("mouth", (0.50, 0.16, 0.16), rough=0.6)

# ---------- skeleton ----------
arm = bpy.data.armatures.new("BoyRig")
rig = bpy.data.objects.new("BoyRig", arm)
bpy.context.scene.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
bpy.context.view_layer.update()
bpy.ops.object.mode_set(mode='EDIT')

HIP, KNEE, ANKLE, SHOULDER, ELBOW, WRIST, NECK = 0.78, 0.43, 0.10, 1.14, 0.88, 0.64, 1.22
BONES = [  # name, head, tail, parent
    ("Root", (0, 0, 0), (0, 0, 0.2), None),
    ("Hips", (0, 0, HIP), (0, 0, HIP + 0.1), "Root"),
    ("Spine", (0, 0, HIP + 0.1), (0, 0, NECK), "Hips"),
    ("Head", (0, 0, NECK), (0, 0, 1.66), "Spine"),
    ("EyeL", (0.085, -0.17, 1.44), (0.085, -0.17, 1.49), "Head"),
    ("EyeR", (-0.085, -0.17, 1.44), (-0.085, -0.17, 1.49), "Head"),
]
for side, s in (("L", 1), ("R", -1)):
    BONES += [
        (f"Thigh{side}", (s * 0.095, 0, HIP), (s * 0.095, 0, KNEE), "Hips"),
        (f"Shin{side}", (s * 0.095, 0, KNEE), (s * 0.095, 0, ANKLE), f"Thigh{side}"),
        (f"Foot{side}", (s * 0.095, 0, ANKLE), (s * 0.095, 0, 0.0), f"Shin{side}"),
        (f"UpperArm{side}", (s * 0.27, 0, SHOULDER), (s * 0.27, 0, ELBOW), "Spine"),
        (f"ForeArm{side}", (s * 0.27, 0, ELBOW), (s * 0.27, 0, WRIST), f"UpperArm{side}"),
    ]
for name, head, tail, parent in BONES:
    eb = arm.edit_bones.new(name)
    eb.head, eb.tail = head, tail
    if parent:
        eb.parent = arm.edit_bones[parent]
bpy.ops.object.mode_set(mode='OBJECT')


# ---------- body parts, each bound to one bone ----------
def bind(ob, bone):
    vg = ob.vertex_groups.new(name=bone)
    vg.add(list(range(len(ob.data.vertices))), 1.0, 'REPLACE')
    ob.parent = rig
    mod = ob.modifiers.new("Armature", 'ARMATURE')   # after the bevel, so the bevel is applied first
    mod.object = rig
    return ob


def part(name, bone, c0, c1, material, bw=0.03, seg=3):
    ob = box(name, c0, c1, material)
    soften(ob, bw, seg)
    return bind(ob, bone)


def blob(name, bone, center, radii, material):
    ob = ellipsoid(name, center, radii, 10, 7, material)
    soften(ob, 0.0, 1, smooth=True)
    ob.modifiers.remove(ob.modifiers[0])
    return bind(ob, bone)


def tilted(name, bone, center, size, euler, material, bw=0.01):
    ob = box_rot(name, center, size, euler, material)
    soften(ob, bw, 2)
    return bind(ob, bone)


for side, s in (("L", 1), ("R", -1)):
    x = s * 0.095
    # legs
    part(f"Thigh{side}", f"Thigh{side}", (x - 0.092, -0.098, KNEE - 0.04), (x + 0.092, 0.098, HIP + 0.02), jeans, 0.045)
    blob(f"Knee{side}", f"Shin{side}", (x, 0.0, KNEE), (0.082, 0.085, 0.075), jeans)
    part(f"Shin{side}", f"Shin{side}", (x - 0.078, -0.082, ANKLE - 0.01), (x + 0.078, 0.082, KNEE), jeans, 0.035)
    part(f"Cuff{side}", f"Shin{side}", (x - 0.084, -0.088, ANKLE - 0.01), (x + 0.084, 0.088, ANKLE + 0.07), jeans_light, 0.02)
    part(f"Shoe{side}", f"Foot{side}", (x - 0.09, -0.23, 0.035), (x + 0.09, 0.11, 0.135), shoe, 0.05, 3)
    part(f"Sole{side}", f"Foot{side}", (x - 0.094, -0.235, 0.0), (x + 0.094, 0.115, 0.04), sole, 0.02, 2)
    # arms
    ax = s * 0.27
    blob(f"Shoulder{side}", f"UpperArm{side}", (ax, 0.0, SHOULDER - 0.01), (0.075, 0.07, 0.075), red)
    part(f"UpperArm{side}", f"UpperArm{side}", (ax - 0.06, -0.06, ELBOW - 0.02), (ax + 0.06, 0.06, SHOULDER), red, 0.035)
    blob(f"Elbow{side}", f"ForeArm{side}", (ax, 0.0, ELBOW), (0.056, 0.056, 0.055), red)
    part(f"ForeArm{side}", f"ForeArm{side}", (ax - 0.052, -0.052, WRIST), (ax + 0.052, 0.052, ELBOW + 0.01), red, 0.03)
    part(f"Cuff{side}A", f"ForeArm{side}", (ax - 0.056, -0.056, WRIST), (ax + 0.056, 0.056, WRIST + 0.06), red_dark, 0.02)
    part(f"Hand{side}", f"ForeArm{side}", (ax - 0.05, -0.048, WRIST - 0.11), (ax + 0.05, 0.048, WRIST + 0.01), skin, 0.035)

# torso: hoodie body, hem, collar, hood, pocket, drawstrings
part("Pelvis", "Hips", (-0.185, -0.105, HIP - 0.1), (0.185, 0.105, HIP + 0.1), jeans, 0.04)
part("HoodieHem", "Hips", (-0.205, -0.125, HIP - 0.04), (0.205, 0.125, HIP + 0.1), red_dark, 0.04)
part("Hoodie", "Spine", (-0.205, -0.118, HIP + 0.06), (0.205, 0.118, NECK - 0.02), red, 0.065, 3)
part("Collar", "Spine", (-0.12, -0.10, NECK - 0.06), (0.12, 0.10, NECK + 0.04), red_dark, 0.04)
part("Hood", "Spine", (-0.16, 0.06, SHOULDER - 0.08), (0.16, 0.20, NECK + 0.06), red_dark, 0.06)
part("Pocket", "Spine", (-0.135, -0.135, HIP + 0.1), (0.135, -0.105, HIP + 0.24), red_dark, 0.025)
for sx in (-1, 1):
    part(f"String{sx}", "Spine", (sx * 0.05 - 0.008, -0.13, HIP + 0.27), (sx * 0.05 + 0.008, -0.118, NECK - 0.07), white, 0.006, 1)
    part(f"Bead{sx}", "Spine", (sx * 0.05 - 0.014, -0.134, HIP + 0.255), (sx * 0.05 + 0.014, -0.116, HIP + 0.285), white, 0.008, 1)

# head: rounded cube, ears, nose, mouth, eyes (own bones, so they can blink), eyebrows, hair
part("Neck", "Head", (-0.06, -0.06, NECK - 0.05), (0.06, 0.06, NECK + 0.06), skin_dark, 0.02)
part("Head", "Head", (-0.185, -0.175, 1.26), (0.185, 0.175, 1.60), skin, 0.1, 4)
part("EarL", "Head", (0.175, -0.025, 1.385), (0.205, 0.045, 1.465), skin_dark, 0.012)
part("EarR", "Head", (-0.205, -0.025, 1.385), (-0.175, 0.045, 1.465), skin_dark, 0.012)
part("Nose", "Head", (-0.022, -0.195, 1.37), (0.022, -0.165, 1.415), skin_dark, 0.012, 2)
part("Mouth", "Head", (-0.042, -0.18, 1.318), (0.042, -0.168, 1.332), mouth_m, 0.005, 1)
tilted("MouthCornerL", "Head", (0.05, -0.176, 1.336), (0.03, 0.01, 0.012), (0, 28, 0), mouth_m, 0.004)
tilted("MouthCornerR", "Head", (-0.05, -0.176, 1.336), (0.03, 0.01, 0.012), (0, -28, 0), mouth_m, 0.004)
for side, s in (("L", 1), ("R", -1)):
    blob(f"Eye{side}", f"Eye{side}", (s * 0.085, -0.172, 1.44), (0.034, 0.014, 0.047), dark)
    blob(f"Glint{side}", f"Eye{side}", (s * 0.074, -0.183, 1.458), (0.011, 0.006, 0.013), white)
    tilted(f"Brow{side}", "Head", (s * 0.088, -0.178, 1.515), (0.08, 0.014, 0.018), (0, s * -9, 0), hair, 0.006)

part("HairTop", "Head", (-0.195, -0.19, 1.54), (0.195, 0.19, 1.68), hair, 0.075, 3)
part("HairBack", "Head", (-0.19, 0.07, 1.27), (0.19, 0.205, 1.60), hair, 0.07, 3)
part("HairSideL", "Head", (0.17, -0.06, 1.46), (0.205, 0.15, 1.60), hair, 0.025)
part("HairSideR", "Head", (-0.205, -0.06, 1.46), (-0.17, 0.15, 1.60), hair, 0.025)
for i, (hx, rot, w) in enumerate(((-0.125, -14, 0.09), (-0.04, 5, 0.09), (0.05, -6, 0.09), (0.135, 16, 0.09))):
    tilted(f"Fringe{i}", "Head", (hx, -0.185, 1.555), (w, 0.04, 0.13), (0, rot, 0), hair, 0.02)

# ---------- animations (pose bones, then pushed onto NLA tracks so each exports on its own) ----------
bpy.context.scene.render.fps = 24
rig.animation_data_create()
ad = rig.animation_data
for pb in rig.pose.bones:
    pb.rotation_mode = 'XYZ'


def key_pose(frame, values):
    """values: {bone: (rx, ry, rz)}; the Root takes a location, the eyes a scale."""
    for bone, v in values.items():
        pb = rig.pose.bones[bone]
        if bone == "Root":
            pb.location = v
            pb.keyframe_insert("location", frame=frame)
        elif bone.startswith("Eye"):
            pb.scale = v
            pb.keyframe_insert("scale", frame=frame)
        else:
            pb.rotation_euler = v
            pb.keyframe_insert("rotation_euler", frame=frame)


def build_action(name, frames, fn):
    act = bpy.data.actions.new(name)
    ad.action = act
    for f in range(0, frames + 1):
        key_pose(f + 1, fn(f / frames, f))
    tr = ad.nla_tracks.new()
    tr.name = name
    tr.strips.new(name, 1, act)
    ad.action = None
    return act


def walk(t, f):
    A, K, B = 0.62, 0.95, 0.5
    out = {}
    s_l = math.sin(2 * math.pi * t)
    for side, ph in (("L", 0.0), ("R", math.pi)):
        p = 2 * math.pi * t + ph
        thigh = -A * math.sin(p)                  # forward = tail towards -Y = negative
        knee = K * max(0.0, math.cos(p)) ** 1.2  # the knee bends while the leg swings forward
        out[f"Thigh{side}"] = (thigh, 0.0, 0.0)
        out[f"Shin{side}"] = (knee, 0.0, 0.0)
        out[f"Foot{side}"] = (-(thigh + knee) * 0.85, 0.0, 0.0)
        arm_p = p + math.pi                       # arms swing against the legs
        out[f"UpperArm{side}"] = (-B * math.sin(arm_p), 0.0, 0.0)   # arm goes back while its leg goes forward
        out[f"ForeArm{side}"] = (-(0.25 + 0.35 * max(0.0, math.sin(arm_p))), 0.0, 0.0)
    out["Root"] = (0.0, 0.028 * math.cos(4 * math.pi * t), 0.0)
    out["Hips"] = (0.0, 0.10 * s_l, 0.0)
    out["Spine"] = (0.05, -0.16 * s_l, 0.0)
    out["Head"] = (-0.04, 0.06 * s_l, 0.0)
    out["EyeL"] = (1.0, 1.0, 1.0)
    out["EyeR"] = (1.0, 1.0, 1.0)
    return out


def idle(t, f):
    s = math.sin(2 * math.pi * t)
    c = math.cos(2 * math.pi * t)
    blink = 1.0
    if 58 <= f <= 62:
        blink = (1.0, 0.55, 0.12, 0.12, 0.55)[f - 58]
    out = {"Root": (0.0, 0.006 * s, 0.0), "Hips": (0.0, 0.02 * s, 0.0),
           "Spine": (0.02 * s, 0.0, 0.0), "Head": (-0.02 * s, 0.12 * c, 0.0),
           "EyeL": (1.0, blink, 1.0), "EyeR": (1.0, blink, 1.0)}
    for side, sg in (("L", 1), ("R", -1)):
        out[f"UpperArm{side}"] = (0.04 * s, 0.0, 0.0)
        out[f"ForeArm{side}"] = (-0.18 - 0.03 * s, 0.0, 0.0)
        out[f"Thigh{side}"] = (0.0, 0.0, 0.0)
        out[f"Shin{side}"] = (0.0, 0.0, 0.0)
        out[f"Foot{side}"] = (0.0, 0.0, 0.0)
    return out


build_action("Walk", 24, walk)
build_action("Idle", 72, idle)
for pb in rig.pose.bones:
    pb.location = (0, 0, 0)
    pb.rotation_euler = (0, 0, 0)
    pb.scale = (1, 1, 1)

export_glb(r"H:\Projects\English\godot\assets\boy.glb", animations=True,
           export_animation_mode='NLA_TRACKS', export_skins=True)
print("boy exported:", [t.name for t in ad.nla_tracks])
