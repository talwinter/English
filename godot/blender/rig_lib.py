"""Helpers shared by the character and room batches: a rig, parts bound to bones, an animation, and the
naming contract of a shell (see batch2.py / catalog_lib.py)."""
import sys
sys.path.insert(0, r"H:\Projects\English\godotlender")
import catalog_lib
from catalog_lib import *


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


