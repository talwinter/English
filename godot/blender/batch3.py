"""Catalog batch 3, season 1 kit (episodes 3-7): the frozen lake and the ice cave rooms, the fisherman, the troll,
the ice giant, a rune stone, an ice crystal cluster, an ice fishing hole and the Save Disk.
Run inside Blender:  exec(open(r"H:\\Projects\\English\\godot\\blender\\batch3.py").read())
Writes godot/assets/{props,shells}/*.glb and catalog/{props,shells}/*.json (then: node tools/build-catalog.js).
"""
import sys
sys.path.insert(0, r"H:\Projects\English\godot\blender")
import importlib
import catalog_lib
importlib.reload(catalog_lib)
import rig_lib
importlib.reload(rig_lib)
from rig_lib import *
import random

BUILT = []


def start():
    reset_scene()
    p = palette()
    p["ice_blue"] = mat("ice_blue", (0.36, 0.64, 0.9), rough=0.5)
    p["ice_deep"] = mat("ice_deep", (0.22, 0.46, 0.78), rough=0.5)
    p["ice_white"] = mat("ice_white", (0.88, 0.95, 1.0), rough=0.4)
    p["crystal"] = mat("crystal", (0.55, 0.85, 1.0), rough=0.1, emit=(0.35, 0.7, 1.0), strength=1.6)
    p["rune"] = mat("rune_glow", (0.4, 0.9, 1.0), rough=0.4, emit=(0.3, 0.85, 1.0), strength=4.0)
    p["troll_skin"] = mat("troll_skin", (0.42, 0.52, 0.34), rough=0.9)
    p["troll_dark"] = mat("troll_dark", (0.26, 0.34, 0.22), rough=0.9)
    p["giant_skin"] = mat("giant_skin", (0.78, 0.9, 0.98), rough=0.8)
    p["fur_brown"] = mat("fur_brown", (0.36, 0.24, 0.14), rough=0.95)
    p["coat"] = mat("fisher_coat", (0.16, 0.3, 0.55), rough=0.9)
    p["cap"] = mat("fisher_cap", (0.7, 0.14, 0.1), rough=0.9)
    p["beard_grey"] = mat("beard_grey", (0.7, 0.7, 0.72), rough=0.8)
    p["hole"] = mat("hole", (0.02, 0.05, 0.1), rough=0.3)
    p["disk_blue"] = mat("disk_blue", (0.12, 0.3, 0.85), rough=0.4, emit=(0.15, 0.4, 1.0), strength=1.2)
    p["metal"] = mat("metal", (0.8, 0.82, 0.86), rough=0.3)
    p["rock"] = mat("rock", (0.36, 0.36, 0.42), rough=0.95)
    p["rock_dark"] = mat("rock_dark", (0.2, 0.2, 0.26), rough=0.95)
    return p


# ================================================================ characters
def fisherman():
    p = start()
    rig = new_rig([
        ("Root", (0, 0, 0), (0, 0, 0.2), None),
        ("Spine", (0, 0, 0.9), (0, 0, 1.35), "Root"),
        ("Head", (0, 0, 1.35), (0, 0, 1.78), "Spine"),
        ("ArmL", (0.26, 0, 1.3), (0.26, 0, 0.8), "Spine"),
        ("ArmR", (-0.26, 0, 1.3), (-0.26, 0, 0.8), "Spine"),
    ])
    for s in (-1, 1):
        part(rig, f"leg{s}", "Root", (s * 0.15 - 0.09, -0.09, 0.0), (s * 0.15 + 0.09, 0.09, 0.92), p["trousers"] if "trousers" in p else p["cloth_grey"], 0.04)
        part(rig, f"boot{s}", "Root", (s * 0.15 - 0.1, -0.2, 0.0), (s * 0.15 + 0.1, 0.1, 0.22), p["black"], 0.04)
    part(rig, "coat", "Spine", (-0.3, -0.19, 0.55), (0.3, 0.19, 1.36), p["coat"], 0.08)
    part(rig, "belt", "Spine", (-0.31, -0.2, 0.84), (0.31, 0.2, 0.92), p["leather"], 0.02)
    for side, s in (("L", 1), ("R", -1)):
        part(rig, f"sleeve{side}", f"Arm{side}", (s * 0.26 - 0.07, -0.07, 0.8), (s * 0.26 + 0.07, 0.07, 1.33), p["coat"], 0.03)
        part(rig, f"glove{side}", f"Arm{side}", (s * 0.26 - 0.06, -0.06, 0.68), (s * 0.26 + 0.06, 0.06, 0.82), p["leather"], 0.03)
    part(rig, "neck", "Head", (-0.07, -0.07, 1.3), (0.07, 0.07, 1.42), p["skin"], 0.02)
    part(rig, "head", "Head", (-0.17, -0.16, 1.4), (0.17, 0.16, 1.72), p["skin"], 0.08, 4)
    part(rig, "cap", "Head", (-0.19, -0.18, 1.63), (0.19, 0.18, 1.8), p["cap"], 0.08)
    part(rig, "cap_pom", "Head", (-0.05, -0.05, 1.8), (0.05, 0.05, 1.9), p["white"], 0.04)
    part(rig, "beard", "Head", (-0.16, -0.21, 1.34), (0.16, -0.1, 1.52), p["beard_grey"], 0.05)
    for s in (-1, 1):
        blob(rig, f"eye{s}", "Head", (s * 0.075, -0.165, 1.6), (0.026, 0.011, 0.03), p["black"])
    # the fishing rod in the right hand: a long thin pole going up and forward, with a line down to the ice
    part(rig, "rod", "ArmR", (-0.29, -0.8, 0.7), (-0.25, 0.0, 0.76), p["wood_dark"], 0.01, 1)
    part(rig, "rod_tip", "ArmR", (-0.29, -1.35, 0.55), (-0.27, -0.8, 0.74), p["wood_dark"], 0.005, 1)
    part(rig, "line", "ArmR", (-0.285, -1.36, 0.0), (-0.275, -1.34, 0.56), p["white"], 0.0, 1)
    animate(rig, {"Idle": (96, lambda t: {
        "Root": (0.0, 0.004 * math.sin(2 * math.pi * t), 0.0, "loc"),
        "Spine": (0.02 * math.sin(2 * math.pi * t), 0.0, 0.0),
        "Head": (0.0, 0.08 * math.sin(2 * math.pi * t + 1.0), 0.02),
        "ArmR": (0.06 * math.sin(2 * math.pi * t), 0.0, 0.0),
    })})
    BUILT.append(finish_prop("fisherman", "fisherman", "character",
                             "a friendly fisherman in a blue coat and a red wool cap with a grey beard, holding a fishing rod",
                             ["fisherman", "man", "fisher"], place=("floor",), stand=1.0,
                             anims={"clips": ["Idle"]}, extra={"height": 1.9}))


def troll():
    p = start()
    rig = new_rig([
        ("Root", (0, 0, 0), (0, 0, 0.3), None),
        ("Spine", (0, 0, 1.2), (0, -0.1, 1.9), "Root"),
        ("Head", (0, -0.15, 1.95), (0, -0.2, 2.5), "Spine"),
        ("ArmL", (0.55, 0, 1.8), (0.65, -0.1, 0.9), "Spine"),
        ("ArmR", (-0.55, 0, 1.8), (-0.65, -0.1, 0.9), "Spine"),
    ])
    for s in (-1, 1):
        part(rig, f"leg{s}", "Root", (s * 0.28 - 0.17, -0.17, 0.0), (s * 0.28 + 0.17, 0.17, 1.2), p["troll_dark"], 0.07)
        part(rig, f"foot{s}", "Root", (s * 0.28 - 0.2, -0.4, 0.0), (s * 0.28 + 0.2, 0.15, 0.2), p["troll_skin"], 0.07)
    blob(rig, "belly", "Spine", (0, -0.05, 1.35), (0.55, 0.45, 0.6), p["troll_skin"])
    blob(rig, "chest", "Spine", (0, -0.12, 1.85), (0.62, 0.42, 0.45), p["troll_skin"])
    part(rig, "loincloth", "Root", (-0.45, -0.38, 0.85), (0.45, 0.38, 1.25), p["fur_brown"], 0.08)
    for side, s in (("L", 1), ("R", -1)):
        blob(rig, f"shoulder{side}", "Spine", (s * 0.7, 0, 1.95), (0.28, 0.28, 0.28), p["troll_skin"])
        part(rig, f"arm{side}", f"Arm{side}", (s * 0.58 - 0.17, -0.18, 0.95), (s * 0.58 + 0.17, 0.18, 1.9), p["troll_skin"], 0.08)
        blob(rig, f"fist{side}", f"Arm{side}", (s * 0.62, -0.06, 0.82), (0.22, 0.22, 0.22), p["troll_dark"])
    blob(rig, "head", "Head", (0, -0.22, 2.3), (0.34, 0.32, 0.34), p["troll_skin"])
    part(rig, "brow", "Head", (-0.3, -0.52, 2.38), (0.3, -0.3, 2.5), p["troll_dark"], 0.05, 2)
    part(rig, "jaw", "Head", (-0.24, -0.5, 2.0), (0.24, -0.25, 2.18), p["troll_dark"], 0.05, 2)
    for s in (-1, 1):
        blob(rig, f"eye{s}", "Head", (s * 0.14, -0.52, 2.34), (0.05, 0.03, 0.05), p["white"])
        blob(rig, f"pupil{s}", "Head", (s * 0.14, -0.555, 2.34), (0.022, 0.012, 0.022), p["black"])
        part(rig, f"tusk{s}", "Head", (s * 0.15 - 0.03, -0.55, 2.02), (s * 0.15 + 0.03, -0.5, 2.2), p["ice_white"], 0.01, 1)
        part(rig, f"ear{s}", "Head", (s * 0.36 - 0.05, -0.28, 2.3), (s * 0.36 + 0.07, -0.12, 2.45), p["troll_dark"], 0.03, 1)
    # a big wooden club in the right hand
    part(rig, "club", "ArmR", (-0.8, -0.2, 0.7), (-0.5, 0.1, 2.2), p["wood_dark"], 0.06)
    part(rig, "club_head", "ArmR", (-0.9, -0.3, 1.8), (-0.4, 0.2, 2.35), p["wood"], 0.07)
    animate(rig, {"Idle": (110, lambda t: {
        "Root": (0.0, 0.006 * math.sin(2 * math.pi * t), 0.0, "loc"),
        "Spine": (0.025 * math.sin(2 * math.pi * t), 0.0, 0.0),
        "Head": (0.04 * math.sin(2 * math.pi * t + 0.7), 0.12 * math.sin(2 * math.pi * t), 0.0),
        "ArmL": (0.06 * math.sin(2 * math.pi * t + 1.0), 0.0, -0.04),
        "ArmR": (0.03 * math.sin(2 * math.pi * t), 0.0, 0.03),
    })})
    BUILT.append(finish_prop("troll", "troll", "character",
                             "a big green troll with tusks and a wooden club; grumpy but not really dangerous",
                             ["troll", "monster"], place=("floor", "slot"), stand=1.6,
                             anims={"clips": ["Idle"]}, extra={"height": 2.6}))


def ice_giant():
    p = start()
    rig = new_rig([
        ("Root", (0, 0, 0), (0, 0, 0.3), None),
        ("Spine", (0, 0, 1.7), (0, 0, 2.6), "Root"),
        ("Head", (0, 0, 2.7), (0, -0.1, 3.5), "Spine"),
        ("ArmL", (0.85, 0, 2.5), (1.0, -0.1, 1.3), "Spine"),
        ("ArmR", (-0.85, 0, 2.5), (-1.0, -0.1, 1.3), "Spine"),
    ])
    for s in (-1, 1):
        part(rig, f"leg{s}", "Root", (s * 0.4 - 0.25, -0.25, 0.0), (s * 0.4 + 0.25, 0.25, 1.8), p["ice_deep"], 0.1)
        part(rig, f"boot{s}", "Root", (s * 0.4 - 0.3, -0.6, 0.0), (s * 0.4 + 0.3, 0.25, 0.4), p["fur_brown"], 0.1)
    part(rig, "tunic", "Spine", (-0.8, -0.5, 1.5), (0.8, 0.5, 2.75), p["ice_deep"], 0.15)
    part(rig, "cloak", "Spine", (-0.95, 0.25, 1.4), (0.95, 0.6, 2.9), p["fur_brown"], 0.15)
    for side, s in (("L", 1), ("R", -1)):
        part(rig, f"arm{side}", f"Arm{side}", (s * 0.92 - 0.24, -0.24, 1.3), (s * 0.92 + 0.24, 0.24, 2.6), p["giant_skin"], 0.1)
        blob(rig, f"fist{side}", f"Arm{side}", (s * 1.0, -0.1, 1.2), (0.32, 0.32, 0.32), p["giant_skin"])
    blob(rig, "head", "Head", (0, -0.05, 3.15), (0.5, 0.45, 0.5), p["giant_skin"])
    part(rig, "helmet", "Head", (-0.55, -0.5, 3.3), (0.55, 0.5, 3.75), p["metal"], 0.1)
    for s in (-1, 1):
        part(rig, f"horn{s}", "Head", (s * 0.52 - 0.07, -0.08, 3.55), (s * 0.52 + 0.07, 0.08, 4.1), p["ice_white"], 0.04, 2)
        blob(rig, f"eye{s}", "Head", (s * 0.2, -0.47, 3.2), (0.07, 0.04, 0.08), p["crystal"])
    # a beard of icicles
    for i in range(7):
        x = -0.36 + i * 0.12
        cone(f"icicle{i}", 0.07, 2.35 + (i % 2) * 0.18, 3.0, p["ice_white"], center=(x, -0.5), segs=5)
    part(rig, "nose", "Head", (-0.1, -0.62, 3.05), (0.1, -0.42, 3.22), p["ice_blue"], 0.05, 2)
    animate(rig, {"Idle": (130, lambda t: {
        "Root": (0.0, 0.008 * math.sin(2 * math.pi * t), 0.0, "loc"),
        "Spine": (0.02 * math.sin(2 * math.pi * t), 0.0, 0.0),
        "Head": (0.04 * math.sin(2 * math.pi * t + 0.5), 0.1 * math.sin(2 * math.pi * t), 0.0),
        "ArmL": (0.05 * math.sin(2 * math.pi * t + 1.0), 0.0, -0.03),
        "ArmR": (0.05 * math.sin(2 * math.pi * t), 0.0, 0.03),
    })})
    BUILT.append(finish_prop("ice_giant", "ice giant", "character",
                             "a very tall giant of ice with a metal helmet with horns, a fur cloak and a beard of icicles",
                             ["giant", "ice giant", "monster"], place=("floor", "slot"), stand=2.2,
                             anims={"clips": ["Idle"]}, extra={"height": 4.1}))


# ================================================================ things
def rune_stone():
    p = start()
    B("slab", (-0.65, -0.22, 0.0), (0.65, 0.22, 2.1), p["rock"], bevel=0.05)
    B("slab_top", (-0.5, -0.2, 2.1), (0.5, 0.2, 2.3), p["rock"], bevel=0.05)
    B("base", (-0.8, -0.35, 0.0), (0.8, 0.35, 0.2), p["rock_dark"], bevel=0.04)
    B("snow_cap", (-0.52, -0.22, 2.28), (0.52, 0.22, 2.4), p["snow"], bevel=0.05)
    # glowing runes on the front face: short bars and a diamond in three rows
    rows = [(1.65, [(-0.3, 0.25), (0.1, 0.35)]), (1.2, [(-0.35, 0.15), (-0.05, 0.3), (0.38, 0.12)]), (0.75, [(-0.2, 0.4), (0.3, 0.2)])]
    for r, (z, bars) in enumerate(rows):
        for k, (x, w) in enumerate(bars):
            B(f"rune{r}_{k}", (x - w / 2, -0.235, z), (x + w / 2, -0.21, z + 0.1), p["rune"], bevel=0.0)
    B("rune_dot", (-0.04, -0.235, 1.9), (0.04, -0.21, 1.98), p["rune"], bevel=0.0)
    BUILT.append(finish_prop("rune_stone", "rune stone", "scenery",
                             "a tall standing stone with glowing blue runes (signs) on its front",
                             ["rune", "runes", "stone", "sign"], place=("floor", "wall"), stand=1.0,
                             lights=[{"kind": "lantern", "at": [0, -0.5, 1.4]}], extra={}))


def ice_crystal():
    p = start()
    rng = random.Random(14)
    for i in range(9):
        a = rng.uniform(0, 2 * math.pi)
        r = rng.uniform(0.0, 0.4)
        h = rng.uniform(0.5, 1.5)
        rad = rng.uniform(0.07, 0.16)
        cone(f"crystal{i}", rad, 0.0, h, p["crystal"], center=(math.cos(a) * r, math.sin(a) * r), segs=5)
    B("ice_base", (-0.5, -0.45, 0.0), (0.5, 0.45, 0.12), p["ice_white"], bevel=0.05)
    BUILT.append(finish_prop("ice_crystal", "ice crystals", "decor",
                             "a cluster of glowing blue ice crystals growing from the ground",
                             ["crystal", "crystals", "ice"], place=("floor",), stand=0.7,
                             lights=[{"kind": "lantern", "at": [0, -0.3, 0.8]}]))


def ice_hole():
    p = start()
    cylinder("rim", (0, 0, 0.025), 0.62, 0.05, 14, 'Z', p["ice_white"])
    cylinder("water", (0, 0, 0.03), 0.42, 0.045, 14, 'Z', p["hole"])
    for i in range(5):
        a = i * 1.26
        B(f"crack{i}", (math.cos(a) * 0.62, math.sin(a) * 0.62 - 0.015, 0.0), (math.cos(a) * 1.1, math.sin(a) * 1.1 + 0.015, 0.035), p["ice_deep"], bevel=0.0)
    BUILT.append(finish_prop("ice_hole", "fishing hole", "decor",
                             "a round hole in the ice where the fisherman fishes",
                             ["hole", "ice", "water"], place=("floor",), stand=0.9))


def save_disk():
    p = start()
    # a floppy disk lying flat, glowing blue: the prize of the season
    B("body", (-0.14, -0.14, 0.02), (0.14, 0.14, 0.045), p["disk_blue"], bevel=0.01)
    B("shutter", (-0.07, 0.0, 0.045), (0.07, 0.14, 0.052), p["metal"], bevel=0.004)
    B("label", (-0.1, -0.13, 0.045), (0.1, -0.02, 0.05), p["white"], bevel=0.003)
    B("notch", (0.1, -0.14, 0.02), (0.14, -0.1, 0.046), p["hole"], bevel=0.0)
    ring_xy("halo", (0, 0, 0.012), 0.24, 0.012, 20, 4, p["crystal"])
    BUILT.append(finish_prop("save_disk", "Save Disk", "item",
                             "a glowing blue floppy disk: a Save Disk that keeps the game from forgetting",
                             ["disk", "save disk", "floppy"], place=("floor", "surface", "inside"), stand=0.5,
                             lights=[{"kind": "lantern", "at": [0, 0, 0.35]}]))


# ================================================================ rooms
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


def frozen_lake():
    p = start()
    rng = random.Random(41)
    room = empty("ShellFrozenLake")
    cylinder("ground", (0, 2, -0.3), 34, 0.6, 24, 'Z', p["snow_shade"], room)
    lake = mat("ice_lake", (0.17, 0.4, 0.72), rough=0.5)        # outdoors the sun is strong: darker than the cave's ice
    lake_deep = mat("ice_lake_deep", (0.1, 0.27, 0.55), rough=0.5)
    lake_light = mat("ice_lake_light", (0.3, 0.55, 0.82), rough=0.5)
    B("shore", (-7.0, -3.2, -0.06), (7.0, -1.1, 0.12), p["snow"], room, bevel=0.05)       # the snowy shore: a low bank
    B("ice", (-7.0, -1.1, -0.1), (7.0, 5.0, 0.03), lake, room, bevel=0)                  # the frozen lake
    for i in range(14):    # cracks in the ice
        x, y = rng.uniform(-6, 6), rng.uniform(-0.6, 4.4)
        l = rng.uniform(0.8, 2.2)
        ang = rng.uniform(0, math.pi)
        box_rot(f"crack{i}", (x, y, 0.035), (l, 0.05, 0.012), (0, 0, math.degrees(ang)), lake_deep, room)
    for i in range(8):     # lighter patches
        cylinder(f"patch{i}", (rng.uniform(-6, 6), rng.uniform(-0.5, 4.6), 0.032), rng.uniform(0.5, 1.2), 0.01, 10, 'Z', lake_light, room)
    for i in range(24):    # the far shore: pine trees
        pine(p, f"far{i}", -13 + i * 1.1 + rng.uniform(-0.3, 0.3), 6.2 + rng.uniform(0, 3.0), rng.uniform(1.3, 2.2))
    for i in range(5):     # mountains
        cx = -12 + i * 6.2
        vv = [(cx, 22, rng.uniform(6, 9))] + [(cx + math.cos(2 * math.pi * j / 6) * 6, 22 + math.sin(2 * math.pi * j / 6) * 6, -0.4) for j in range(6)]
        obj(f"mountain{i}", vv, [(0, 1 + (j + 1) % 6, 1 + j) for j in range(6)], p["snow_shade"], room)
    for sx in (-1, 1):     # snow banks on the sides
        for i in range(3):
            ellipsoid(f"bank{sx}{i}", (sx * (6.8 + i * 0.4), 0.5 + i * 1.6, 0.0), (1.4, 1.1, 0.6), 8, 5, p["snow"], room)
    contract(room, (-5.0, -1.8, 5.0, 3.2), (0.0, -1.2), (0.0, -8.6, 3.9), (0.0, 0.8, 1.1), 50.0,
             lights=[("sun", (6, -8, 9))], entries={"default": (0.0, -1.2), "left": (-4.4, 0.0), "right": (4.4, 0.0), "far": (0.0, 3.0)})
    BUILT.append(finish_shell(
        "frozen_lake", "frozen lake", "outdoor",
        "a wide frozen lake seen from the snowy shore: smooth blue ice with cracks, pines and mountains on the far side; things can stand on the ice",
        [-5.0, -1.8, 5.0, 3.2], [0.0, -1.2],
        walls={"back": 3.2},
        slots={"shore": [0.0, -1.2], "ice_middle": [0.0, 1.4], "far_side": [0.0, 2.9], "left_edge": [-4.2, 0.4], "right_edge": [4.2, 0.4]},
        camera={"pos": [0.0, -8.6, 3.9], "target": [0.0, 0.8, 1.1], "fov": 50.0},
        extra={"sky": [0.6, 0.76, 0.92], "ambient": [0.8, 0.88, 0.98], "ambient_energy": 0.7, "light": "sun"}))


def ice_cave():
    p = start()
    rng = random.Random(52)
    room = empty("ShellIceCave")
    W, D = 4.2, 2.8
    B("floor_base", (-W, -D, -0.2), (W, D, -0.02), p["ice_deep"], room, bevel=0)
    for i in range(18):
        cylinder(f"slab{i}", (rng.uniform(-3.8, 3.8), rng.uniform(-2.4, 2.4), 0.0), rng.uniform(0.4, 0.9), 0.02, 7, 'Z', p["ice_blue"] if i % 2 else p["ice_white"], room)
    for row, (z, rz) in enumerate(((0.45, 0.65), (1.35, 0.8), (2.35, 0.8))):
        n = 9
        for i in range(n):
            x = -W - 0.5 + (i + (0.5 if row % 2 else 0)) * ((2 * W + 1.0) / (n - 1))
            ellipsoid(f"wallb{row}_{i}", (x, D + 0.25 + rng.uniform(-0.1, 0.1), z + rng.uniform(-0.1, 0.15)),
                      (rng.uniform(0.85, 1.15), rng.uniform(0.6, 0.8), rz * rng.uniform(0.9, 1.15)), 8, 6,
                      p["ice_blue"] if (i + row) % 2 else p["ice_deep"], room)
        for sx in (-1, 1):
            m = 5
            for i in range(m):
                y = -D + (i + (0.5 if row % 2 else 0)) * ((2 * D + 0.6) / (m - 1))
                ellipsoid(f"walls{row}_{sx}_{i}", (sx * (W + 0.25 + rng.uniform(-0.1, 0.1)), y, z + rng.uniform(-0.1, 0.15)),
                          (rng.uniform(0.6, 0.8), rng.uniform(0.85, 1.15), rz * rng.uniform(0.9, 1.15)), 8, 6,
                          p["ice_blue"] if (i + row) % 2 else p["ice_deep"], room)
    for i in range(11):      # icicles from the ceiling and glowing crystals in the walls
        cone(f"icicle{i}", rng.uniform(0.08, 0.16), 3.0, rng.uniform(3.5, 4.1), p["ice_white"], center=(-W + i * (2 * W / 10), rng.uniform(-1, 2.2)), segs=5)
    for i in range(6):
        cone(f"glow{i}", rng.uniform(0.1, 0.18), 0.0, rng.uniform(0.7, 1.3), p["crystal"], center=(rng.choice([-1, 1]) * rng.uniform(3.0, 3.8), rng.uniform(-1.4, 2.0)), segs=5)
    contract(room, (-3.7, -1.6, 3.7, 2.35), (-2.6, -1.0), (0.0, -6.8, 3.3), (0.0, 0.7, 1.15), 50.0,
             lights=[("lamp", (0.0, -0.3, 3.0))], entries={"default": (-2.6, -1.0), "outside": (-3.3, 0.0)})
    BUILT.append(finish_shell(
        "ice_cave", "ice cave", "indoor",
        "a cold cave made of blue ice with icicles and glowing crystals, dark; walls at the back, left and right",
        [-3.7, -1.6, 3.7, 2.35], [-2.6, -1.0],
        walls={"back": 2.45, "left": -3.85, "right": 3.85},
        slots={"center": [0.0, 0.5], "back_left": [-2.0, 1.6], "back_right": [2.2, 1.6]},
        camera={"pos": [0.0, -6.8, 3.3], "target": [0.0, 0.7, 1.15], "fov": 50.0},
        extra={"sky": [0.02, 0.04, 0.08], "ambient": [0.5, 0.62, 0.85], "ambient_energy": 0.8, "light": "lamp"}))


ALL = (fisherman, troll, ice_giant, rune_stone, ice_crystal, ice_hole, save_disk, frozen_lake, ice_cave)
for fn in [f for f in ALL if not globals().get("ONLY") or f.__name__ in ONLY]:
    try:
        fn()
    except Exception as e:
        import traceback
        print("FAILED", fn.__name__, e)
        traceback.print_exc()
print("batch 3 built:", [b["id"] for b in BUILT])
