"""Catalog helpers: build a prop or a shell, measure it, and write the model (godot/assets/...) plus its
metadata (catalog/props/<id>.json or catalog/shells/<id>.json). The metadata is measured from the model, so it
can never drift from it. `node tools/build-catalog.js` merges the sidecars into catalog/catalog.json.

Conventions (same as the attic): Blender coordinates, X right, Y away from the camera, Z up; a prop's origin
is the centre of its footprint on the floor and its front faces -Y (towards the camera).
"""
import json
import math
import os
import sys

import bpy
from mathutils import Vector

ROOT = r"H:\Projects\English"
sys.path.insert(0, os.path.join(ROOT, "godot", "blender"))
import lib  # noqa: E402
from lib import *  # noqa: E402,F401,F403

ASSETS = os.path.join(ROOT, "godot", "assets")
CATALOG = os.path.join(ROOT, "catalog")


def palette():
    """The shared colours of the catalog (call after reset_scene)."""
    p = {}
    for name, rgb, rough in [
        ("wood", (0.52, 0.36, 0.20), 0.85), ("wood_dark", (0.33, 0.21, 0.12), 0.85),
        ("wood_light", (0.68, 0.5, 0.3), 0.85), ("log", (0.44, 0.29, 0.16), 0.9),
        ("snow", (0.92, 0.95, 1.0), 0.95), ("snow_shade", (0.7, 0.78, 0.92), 0.95),
        ("stone", (0.52, 0.53, 0.58), 0.9), ("stone_dark", (0.33, 0.34, 0.4), 0.9),
        ("red", (0.66, 0.12, 0.10), 0.8), ("red_dark", (0.42, 0.07, 0.07), 0.8),
        ("iron", (0.3, 0.31, 0.36), 0.5), ("steel", (0.78, 0.8, 0.84), 0.3),
        ("leather", (0.4, 0.22, 0.1), 0.8), ("bread", (0.86, 0.6, 0.3), 0.8), ("bread_dark", (0.66, 0.4, 0.18), 0.8),
        ("pine", (0.08, 0.28, 0.25), 0.9), ("pine_dark", (0.05, 0.19, 0.2), 0.9),
        ("cloth_blue", (0.2, 0.3, 0.6), 0.9), ("cloth_grey", (0.55, 0.55, 0.6), 0.9),
        ("cloth_cream", (0.9, 0.85, 0.7), 0.9), ("cloth_green", (0.25, 0.45, 0.3), 0.9),
        ("skin", (0.96, 0.78, 0.64), 0.7), ("hair_white", (0.9, 0.9, 0.92), 0.7),
        ("fur", (0.5, 0.52, 0.56), 0.9), ("fur_light", (0.72, 0.74, 0.78), 0.9), ("fur_dark", (0.3, 0.31, 0.35), 0.9),
        ("black", (0.04, 0.04, 0.05), 0.5), ("white", (0.97, 0.97, 0.97), 0.5),
        ("rope", (0.72, 0.6, 0.38), 0.9), ("fish", (0.6, 0.7, 0.8), 0.4), ("gold", (0.9, 0.7, 0.2), 0.4),
    ]:
        p[name] = mat(name, rgb, rough=rough)
    p["flame"] = mat("flame", (1.0, 0.55, 0.12), emit=(1.0, 0.45, 0.08), strength=4.0)
    p["flame_core"] = mat("flame_core", (1.0, 0.9, 0.5), emit=(1.0, 0.8, 0.3), strength=6.0)
    p["glow_window"] = mat("glow_window", (1.0, 0.8, 0.45), emit=(1.0, 0.7, 0.3), strength=2.5)
    p["lantern"] = mat("lantern", (1.0, 0.85, 0.5), emit=(1.0, 0.75, 0.35), strength=4.0)
    p["water"] = mat("water", (0.25, 0.5, 0.75), rough=0.15)
    p["ice"] = mat("ice", (0.75, 0.88, 0.98), rough=0.15)
    p["helper"] = mat("helper", (0.1, 0.5, 0.1))
    return p


def soft(ob, width=0.025, seg=2):
    return soften(ob, width, seg, smooth=True)


def B(name, c0, c1, material, parent=None, bevel=0.02, origin=None):
    """A beveled box."""
    ob = box(name, c0, c1, material, parent, origin=origin)
    if bevel:
        soften(ob, bevel, 2, smooth=True)
    return ob


def cone(name, r, base_z, top_z, material, parent=None, center=(0.0, 0.0), segs=7):
    cx, cy = center
    vv = [(cx, cy, top_z)] + [(cx + math.cos(2 * math.pi * j / segs) * r, cy + math.sin(2 * math.pi * j / segs) * r, base_z)
                              for j in range(segs)] + [(cx, cy, base_z)]
    ff = [(0, 1 + (j + 1) % segs, 1 + j) for j in range(segs)] + [(segs + 1, 1 + j, 1 + (j + 1) % segs) for j in range(segs)]
    return obj(name, vv, ff, material, parent)


def _mesh_objects(include_helpers=False):
    out = []
    for ob in bpy.data.objects:
        if ob.type != 'MESH':
            continue
        if not include_helpers and ob.name.startswith(("part_", "pick_", "helper_")):
            continue
        out.append(ob)
    return out


def bounds(objs):
    """World-space min and max corners of the given mesh objects."""
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    bpy.context.view_layer.update()
    for ob in objs:
        mw = ob.matrix_world
        for c in ob.bound_box:
            v = mw @ Vector(c)
            lo = Vector((min(lo.x, v.x), min(lo.y, v.y), min(lo.z, v.z)))
            hi = Vector((max(hi.x, v.x), max(hi.y, v.y), max(hi.z, v.z)))
    return lo, hi


def _r(v):
    return round(float(v), 3)


def part_info(objs_by_name):
    """Pick volumes of named parts of a prop (objects whose names start with part_)."""
    parts = {}
    for ob in _mesh_objects(include_helpers=True):
        if not ob.name.startswith("part_"):
            continue
        lo, hi = bounds([ob])
        pid = ob.name[len("part_"):]
        parts[pid] = {
            "center": [_r((lo.x + hi.x) / 2), _r((lo.y + hi.y) / 2)],
            "size": [_r(hi.x - lo.x), _r(hi.y - lo.y), _r(hi.z - lo.z)],
            "min_z": _r(lo.z),
        }
    return parts


def finish_prop(pid, name, kind, desc, words, place=("floor",), stand=0.6, surface=False, container=False,
                opens=None, anims=None, lights=None, extra=None, wall=False):
    """Measures and exports the prop that is currently in the scene.
    kind: scenery | furniture | item | character | exit | decor
    place: where it may stand: floor, wall (against a wall), edge (at the border of the room), surface (on a
           prop with surface=true), inside (in a container)
    stand: how far in front of the footprint the hero stands to use it
    opens: {"node": name, "axis": "x"|"y"|"z", "angle": degrees}: the part that moves when it opens
    """
    parts = part_info(None)
    # remove helper meshes so they are not exported
    for ob in list(bpy.data.objects):
        if ob.name.startswith(("part_", "helper_")):
            bpy.data.objects.remove(ob, do_unlink=True)
    meshes = _mesh_objects()
    lo, hi = bounds(meshes)
    footprint = [_r(hi.x - lo.x), _r(hi.y - lo.y)]
    cx, cy = (lo.x + hi.x) / 2, (lo.y + hi.y) / 2
    entry = {
        "id": pid, "name": name, "kind": kind, "glb": f"props/{pid}.glb", "desc": desc, "words": list(words),
        "footprint": footprint, "height": _r(hi.z), "center_offset": [_r(cx), _r(cy)],
        "place": list(place), "stand": stand, "surface": surface, "container": container,
    }
    if parts:
        entry["parts"] = parts
    if opens:
        entry["opens"] = opens
    if anims:
        entry["anims"] = anims
    if lights:
        entry["lights"] = lights
    if wall:
        entry["wall"] = True
    if extra:
        entry.update(extra)
    os.makedirs(os.path.join(ASSETS, "props"), exist_ok=True)
    os.makedirs(os.path.join(CATALOG, "props"), exist_ok=True)
    export_glb(os.path.join(ASSETS, "props", f"{pid}.glb"), animations=bool(anims and anims.get("clips")),
               **({"export_animation_mode": "NLA_TRACKS", "export_skins": True} if anims and anims.get("clips") else {}))
    with open(os.path.join(CATALOG, "props", f"{pid}.json"), "w", encoding="utf-8") as f:
        json.dump(entry, f, indent=1, ensure_ascii=False)
    return entry


def finish_shell(sid, name, kind, desc, floor, spawn, walls=None, blocked=None, slots=None, fixed=None,
                 camera=None, extra=None):
    """Exports the shell in the scene. floor = [x0, y0, x1, y1] placement area in room space."""
    for ob in list(bpy.data.objects):
        if ob.name.startswith("helper_"):
            bpy.data.objects.remove(ob, do_unlink=True)
    entry = {
        "id": sid, "name": name, "kind": kind, "glb": f"shells/{sid}.glb", "desc": desc,
        "floor": floor, "spawn": spawn, "walls": walls or {}, "blocked": blocked or [],
        "slots": slots or {}, "fixed": fixed or [],
    }
    if camera:
        entry["camera"] = camera
    if extra:
        entry.update(extra)
    os.makedirs(os.path.join(ASSETS, "shells"), exist_ok=True)
    os.makedirs(os.path.join(CATALOG, "shells"), exist_ok=True)
    export_glb(os.path.join(ASSETS, "shells", f"{sid}.glb"))
    with open(os.path.join(CATALOG, "shells", f"{sid}.json"), "w", encoding="utf-8") as f:
        json.dump(entry, f, indent=1, ensure_ascii=False)
    return entry


def pine(p, prefix, x, y, s):
    """A snowy pine tree (trunk, three cones with snow), centred at (x, y)."""
    cylinder(f"{prefix}_trunk", (x, y, 0.3 * s), 0.1 * s, 0.6 * s, 6, 'Z', p["wood_dark"])
    for k, (r, h, z) in enumerate(((0.85, 1.0, 0.55), (0.65, 0.9, 1.15), (0.45, 0.8, 1.7))):
        cone(f"{prefix}_pine{k}", r * s, z * s, (z + h) * s, p["pine"] if k % 2 == 0 else p["pine_dark"], center=(x, y))
        cone(f"{prefix}_snow{k}", r * 0.5 * s, (z + h * 0.55) * s, (z + h) * s + 0.01, p["snow"], center=(x, y))
