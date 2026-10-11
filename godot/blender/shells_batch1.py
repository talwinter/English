"""Catalog batch 1, rooms: three shells for the Viking village (episode 1 and its neighbours).
Run inside Blender:  exec(open(r"H:\\Projects\\English\\godot\\blender\\shells_batch1.py").read())
A shell holds the ground, walls, camera, lights, nav floor and any FIXED things (the bridge, the river);
the props of an episode are placed on it by the layout builder.
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
    return palette()


def contract(room, floor, spawn, cam_pos, cam_target, fov, lights=(), entries=None):
    """The naming contract every shell follows (see attic.py)."""
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


# ---------------------------------------------------------------- the snowy yard of the village
def village_yard():
    p = start()
    rng = random.Random(11)
    room = empty("ShellVillageYard")
    cylinder("ground", (0, 2, -0.3), 30, 0.6, 24, 'Z', p["snow_shade"], room)
    B("yard", (-6.5, -3.0, -0.06), (6.5, 4.5, 0.0), p["snow"], room, bevel=0)
    for i in range(9):      # a trodden path from the front towards the right
        B(f"path{i}", (-1.2 + i * 0.85, -2.6 + i * 0.28, 0.0), (-0.5 + i * 0.85, -1.6 + i * 0.28, 0.012), p["wood_light"], room, bevel=0)
    for i in range(26):     # the forest wall at the back
        x = -14 + i * 1.1 + rng.uniform(-0.3, 0.3)
        y = 6.0 + rng.uniform(0, 3.5)
        pine(p, f"back{i}", x, y, rng.uniform(1.3, 2.2))
    for i in range(5):      # mountains
        cx = -12 + i * 6.2
        vv = [(cx, 20, rng.uniform(6, 9))] + [(cx + math.cos(2 * math.pi * j / 6) * 6, 20 + math.sin(2 * math.pi * j / 6) * 6, -0.4) for j in range(6)]
        obj(f"mountain{i}", vv, [(0, 1 + (j + 1) % 6, 1 + j) for j in range(6)], p["snow_shade"], room)
    contract(room, (-5.0, -1.8, 5.0, 3.2), (0.0, -1.0), (0.0, -8.6, 3.9), (0.0, 0.8, 1.1), 50.0,
             lights=[("sun", (6, -8, 9))], entries={"default": (0.0, -1.0), "left": (-4.4, 0.3), "right": (4.4, 0.3)})
    BUILT.append(finish_shell(
        "village_yard", "snowy village yard", "outdoor",
        "an open snowy yard in daylight with a trodden path; pines and mountains far behind; the way out is at the left or right edge",
        [-5.0, -1.8, 5.0, 3.2], [0.0, -1.0],
        walls={"back": 3.2},
        slots={"left_edge": [-4.2, 0.4], "right_edge": [4.2, 0.4], "center": [0.0, 1.0]},
        camera={"pos": [0.0, -8.6, 3.9], "target": [0.0, 0.8, 1.1], "fov": 50.0},
        extra={"sky": [0.62, 0.76, 0.92], "ambient": [0.86, 0.9, 0.98], "ambient_energy": 1.2, "light": "sun"}))


# ---------------------------------------------------------------- inside a Viking longhouse
def longhouse_interior():
    p = start()
    room = empty("ShellLonghouse")
    W, D = 4.2, 2.8
    B("floor_base", (-W, -D, -0.2), (W, D, -0.02), p["wood_dark"], room, bevel=0)
    n = 14
    for i in range(n):
        x0 = -W + i * (2 * W / n)
        B(f"plank{i}", (x0 + 0.01, -D, -0.1), (x0 + 2 * W / n - 0.01, D, 0.0), (p["wood"], p["wood_light"], p["wood_dark"])[i % 3], room, bevel=0)
    for i in range(9):      # log walls: back and the two sides
        z = 0.2 + i * 0.32
        cylinder(f"logb{i}", (0, D + 0.12, z), 0.17, 2 * W + 0.4, 8, 'X', p["log"] if i % 2 else p["wood"], room)
        for sx in (-1, 1):
            cylinder(f"logs{sx}{i}", (sx * (W + 0.12), 0, z), 0.17, 2 * D + 0.4, 8, 'Y', p["log"] if i % 2 else p["wood"], room)
    ang = math.degrees(math.atan2(2.2, W))
    for sx in (-1, 1):      # the roof: two slopes (rotation about Y), rafters under them, a ridge beam
        box_rot(f"roof{sx}", (sx * W / 2, 0, 3.15), (math.hypot(W, 2.2) + 0.3, 2 * D + 0.6, 0.16), (0, sx * ang, 0), p["wood_dark"], room)
        for y in (-2.2, -0.7, 0.8, 2.3):
            box_rot(f"rafter{sx}_{y}", (sx * W / 2, y, 3.0), (math.hypot(W, 2.2), 0.14, 0.18), (0, sx * ang, 0), p["wood"], room)
    B("ridge", (-0.1, -D, 4.2), (0.1, D, 4.35), p["wood_dark"], room, bevel=0)
    contract(room, (-3.7, -1.6, 3.7, 2.35), (0.8, -1.2), (0.0, -6.8, 3.3), (0.0, 0.7, 1.15), 50.0,
             lights=[("lamp", (0.0, 0.2, 3.0))], entries={"default": (0.8, -1.2), "door": (3.2, 0.2)})
    BUILT.append(finish_shell(
        "longhouse_interior", "Viking longhouse inside", "indoor",
        "a warm log room with a plank floor and a high roof; walls at the back, left and right; the front is open to the camera",
        [-3.7, -1.6, 3.7, 2.35], [0.8, -1.2],
        walls={"back": 2.45, "left": -3.85, "right": 3.85},
        slots={"center": [0.0, 0.5], "hearth": [-2.6, 1.2], "by_door": [3.0, 0.2]},
        camera={"pos": [0.0, -6.8, 3.3], "target": [0.0, 0.7, 1.15], "fov": 50.0},
        extra={"sky": [0.05, 0.04, 0.07], "ambient": [0.8, 0.62, 0.45], "ambient_energy": 1.0, "light": "lamp"}))


# ---------------------------------------------------------------- the river with the old bridge
def river_bridge():
    p = start()
    rng = random.Random(5)
    room = empty("ShellRiverBridge")
    B("bank_near", (-9.0, -4.0, -0.4), (9.0, 0.9, 0.0), p["snow"], room, bevel=0)
    B("bank_far", (-9.0, 3.7, -0.4), (9.0, 12.0, 0.0), p["snow"], room, bevel=0)
    B("water", (-9.0, 0.9, -0.5), (9.0, 3.7, -0.12), p["ice"], room, bevel=0)
    for i in range(12):
        B(f"floe{i}", (-8 + i * 1.4, 1.2 + rng.uniform(0, 1.9), -0.1), (-7.2 + i * 1.4, 1.7 + rng.uniform(0, 1.9), -0.02), p["snow"], room, bevel=0)
    for i in range(8):      # the old wooden bridge across the river (fixed: part of the room)
        B(f"bplank{i}", (-0.95, 0.85 + i * 0.37, 0.04), (0.95, 0.85 + i * 0.37 + 0.33, 0.14), p["wood"] if i % 2 else p["wood_light"], room, bevel=0.01)
    for sx in (-1, 1):
        B(f"rail{sx}", (sx * 0.95 - 0.04, 0.85, 0.7), (sx * 0.95 + 0.04, 3.75, 0.78), p["wood_dark"], room, bevel=0.01)
        for k in range(4):
            B(f"post{sx}{k}", (sx * 0.95 - 0.06, 0.9 + k * 0.92 - 0.06, 0.0), (sx * 0.95 + 0.06, 0.9 + k * 0.92 + 0.06, 0.85), p["wood_dark"], room, bevel=0.01)
            B(f"cap{sx}{k}", (sx * 0.95 - 0.08, 0.9 + k * 0.92 - 0.08, 0.85), (sx * 0.95 + 0.08, 0.9 + k * 0.92 + 0.08, 0.92), p["snow"], room, bevel=0.01)
    for i in range(22):     # the forest across the river, trees on this side
        pine(p, f"far{i}", -12 + i * 1.15 + rng.uniform(-0.3, 0.3), 5.2 + rng.uniform(0, 3.0), rng.uniform(1.2, 2.0))
    for i in range(8):
        pine(p, f"near{i}", -11 + i * 3.2, -2.9 + rng.uniform(-0.2, 0.2), rng.uniform(1.0, 1.5))
    # fixed, clickable parts of this room (the contract: pick_<id>, stand_<id>)
    B("pick_bridge", (-1.0, 0.85, 0.0), (1.0, 3.7, 1.0), p["helper"], room, bevel=0)
    B("pick_river", (-8.0, 1.0, -0.1), (-1.15, 3.6, 0.3), p["helper"], room, bevel=0)
    B("pick_forest", (-3.0, 4.6, 0.0), (3.0, 8.0, 3.0), p["helper"], room, bevel=0)
    empty("stand_bridge", (0.0, 0.2, 0.0), room)
    empty("stand_river", (-2.6, 0.3, 0.0), room)
    empty("stand_forest", (0.0, 0.2, 0.0), room)
    contract(room, (-5.0, -1.8, 5.0, 0.8), (-3.5, -0.8), (0.0, -7.2, 3.3), (0.0, 1.6, 0.8), 52.0,
             lights=[("sun", (6, -8, 9))], entries={"default": (-3.5, -0.8), "village": (-4.4, -0.6)})
    # the walkable ground: this bank and the bridge, as one mesh of two parts
    bpy.data.objects.remove(bpy.data.objects["nav_floor"], do_unlink=True)
    verts = [(-5.0, -1.8, 0), (5.0, -1.8, 0), (5.0, 0.86, 0), (-5.0, 0.86, 0),
             (-0.95, 0.85, 0), (0.95, 0.85, 0), (0.95, 3.7, 0), (-0.95, 3.7, 0)]
    obj("nav_floor", verts, [(0, 1, 2, 3), (4, 5, 6, 7)], None, room)
    BUILT.append(finish_shell(
        "river_bridge", "river with an old bridge", "outdoor",
        "a frozen river with an old wooden bridge going into a snowy forest on the far side; you stand on this bank",
        [-5.0, -1.8, 5.0, 0.8], [-3.5, -0.8],
        walls={},
        slots={"bridge_middle": [0.0, 2.2], "bridge_start": [0.0, 1.2], "bank_left": [-3.5, -0.5], "bank_right": [3.5, -0.5]},
        fixed=[
            {"id": "bridge", "name": "the old bridge", "words": ["bridge"], "desc": "an old wooden bridge across the river"},
            {"id": "river", "name": "the river", "words": ["river", "water"], "desc": "a frozen river"},
            {"id": "forest", "name": "the forest", "words": ["forest", "woods"], "desc": "the dark pine forest across the river"},
        ],
        camera={"pos": [0.0, -7.2, 3.3], "target": [0.0, 1.6, 0.8], "fov": 52.0},
        extra={"sky": [0.6, 0.74, 0.9], "ambient": [0.86, 0.9, 0.98], "ambient_energy": 1.2, "light": "sun"}))


for fn in (village_yard, longhouse_interior, river_bridge):
    try:
        fn()
    except Exception as e:
        import traceback
        print("FAILED", fn.__name__, e)
        traceback.print_exc()
print("shells built:", [b["id"] for b in BUILT])
