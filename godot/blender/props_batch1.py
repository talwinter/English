"""Catalog batch 1: the props of the Viking village (episode 1 and its neighbours).
Run inside Blender:  exec(open(r"H:\\Projects\\English\\godot\\blender\\props_batch1.py").read())
Writes godot/assets/props/<id>.glb and catalog/props/<id>.json for each prop.
"""
import sys
sys.path.insert(0, r"H:\Projects\English\godot\blender")
import importlib
import catalog_lib
importlib.reload(catalog_lib)
from catalog_lib import *

BUILT = []


def start():
    reset_scene()
    return palette()


def prism_yz(name, poly, x0, x1, material, parent=None):
    """Polygon given in (y, z) extruded along X (ridge along X)."""
    n = len(poly)
    verts = [(x0, y, z) for y, z in poly] + [(x1, y, z) for y, z in poly]
    faces = [tuple(range(n - 1, -1, -1)), tuple(range(n, 2 * n))]
    for i in range(n):
        j = (i + 1) % n
        faces.append((i, j, n + j, n + i))
    return obj(name, verts, faces, material, parent)


def pine(p, prefix, x, y, s):
    cylinder(f"{prefix}_trunk", (x, y, 0.3 * s), 0.1 * s, 0.6 * s, 6, 'Z', p["wood_dark"])
    for k, (r, h, z) in enumerate(((0.85, 1.0, 0.55), (0.65, 0.9, 1.15), (0.45, 0.8, 1.7))):
        cone(f"{prefix}_pine{k}", r * s, z * s, (z + h) * s, p["pine"] if k % 2 == 0 else p["pine_dark"], center=(x, y))
        cone(f"{prefix}_snow{k}", r * 0.5 * s, (z + h * 0.55) * s, (z + h) * s + 0.01, p["snow"], center=(x, y))


# ---------------------------------------------------------------- outdoor
def house_viking():
    p = start()
    B("walls", (-2.0, -1.3, 0.0), (2.0, 1.3, 1.9), p["log"], bevel=0.04)
    for i in range(5):                       # log ends / stripes on the front and back
        z = 0.25 + 0.38 * i
        cylinder(f"logf{i}", (0, -1.31, z), 0.1, 4.05, 8, 'X', p["wood"])
        cylinder(f"logb{i}", (0, 1.31, z), 0.1, 4.05, 8, 'X', p["wood"])
    B("stone_base", (-2.08, -1.38, 0.0), (2.08, 1.38, 0.22), p["stone"], bevel=0.04)
    ang = math.degrees(math.atan2(3.15 - 1.85, 1.75))
    L = math.hypot(1.75, 3.15 - 1.85) + 0.3
    for sgn, nm in ((-1, "front"), (1, "back")):
        yc = sgn * 0.88
        zc = (1.85 + 3.15) / 2 + 0.03
        rx = ang if sgn < 0 else -ang          # each slope rises towards the ridge
        box_rot(f"roof_{nm}", (0, yc, zc), (4.9, L, 0.16), (rx, 0, 0), p["wood_dark"])
        box_rot(f"roof_snow_{nm}", (0, yc, zc + 0.12), (4.95, L + 0.05, 0.14), (rx, 0, 0), p["snow"])
    prism_yz("gable_l", [(-1.3, 1.9), (1.3, 1.9), (0, 3.05)], -2.0, -1.9, p["log"])
    prism_yz("gable_r", [(-1.3, 1.9), (1.3, 1.9), (0, 3.05)], 1.9, 2.0, p["log"])
    B("door", (-0.4, -1.37, 0.12), (0.4, -1.31, 1.6), p["red"], bevel=0.02, origin=(-0.4, -1.34, 0.12))   # hinge on the left
    B("door_frame", (-0.5, -1.38, 0.12), (0.5, -1.34, 1.7), p["wood_dark"], bevel=0.02)
    B("door_handle", (0.25, -1.4, 0.8), (0.33, -1.36, 0.88), p["gold"], bevel=0.01)
    B("step", (-0.75, -1.75, 0.0), (0.75, -1.3, 0.14), p["stone"], bevel=0.03)
    B("window_frame", (0.95, -1.36, 0.95), (1.75, -1.32, 1.55), p["wood_dark"], bevel=0.02)
    B("window_glass", (1.02, -1.375, 1.02), (1.68, -1.34, 1.48), p["glow_window"], bevel=0.0)
    B("chimney", (1.2, 0.2, 1.7), (1.7, 0.7, 3.5), p["stone"], bevel=0.03)
    B("chimney_snow", (1.15, 0.15, 3.5), (1.75, 0.75, 3.62), p["snow"], bevel=0.03)
    B("part_door", (-0.5, -1.7, 0.0), (0.5, -1.2, 1.7), p["helper"], bevel=0)
    B("part_window", (0.95, -1.5, 0.95), (1.75, -1.2, 1.55), p["helper"], bevel=0)
    BUILT.append(finish_prop(
        "house_viking", "Viking log house", "scenery",
        "a log house with a snowy roof, a red front door and a lit window; the door and window are parts",
        ["house", "home"], place=("floor",), stand=0.9,
        opens={"part": "door", "node": "door", "axis": "z", "angle": 100},
        lights=[{"kind": "window", "at": [1.35, -2.2, 1.3]}], extra={"back_to_wall": True}))


def rock_big():
    p = start()
    ellipsoid("rock_a", (0, 0, 0.32), (0.78, 0.62, 0.48), 9, 6, p["stone"])
    ellipsoid("rock_b", (0.5, -0.1, 0.22), (0.42, 0.38, 0.3), 8, 5, p["stone_dark"])
    ellipsoid("rock_snow", (-0.02, 0.04, 0.66), (0.52, 0.42, 0.16), 9, 5, p["snow"])
    BUILT.append(finish_prop("rock_big", "big rock", "scenery", "a big grey boulder with snow on top",
                             ["rock", "stone", "boulder"], stand=0.7))


def pine_tree():
    p = start()
    pine(p, "t", 0, 0, 1.25)
    BUILT.append(finish_prop("pine_tree", "pine tree", "scenery", "a tall pine tree with snow", ["tree", "pine"], stand=0.8))


def signpost():
    p = start()
    B("post", (-0.05, -0.05, 0.0), (0.05, 0.05, 1.5), p["wood_dark"], bevel=0.015)
    box_rot("board_a", (0.28, -0.07, 1.3), (0.7, 0.05, 0.2), (0, 0, 0), p["wood"])
    box_rot("board_b", (-0.25, -0.07, 1.05), (0.6, 0.05, 0.18), (0, 0, 0), p["wood_light"])
    B("cap", (-0.09, -0.09, 1.5), (0.09, 0.09, 1.56), p["snow"], bevel=0.015)
    BUILT.append(finish_prop("signpost", "wooden sign", "scenery", "a wooden signpost with two boards",
                             ["sign", "signpost", "post"], stand=0.6))


def fence_section():
    p = start()
    for x in (-0.9, 0.0, 0.9):
        B(f"post{x}", (x - 0.06, -0.06, 0.0), (x + 0.06, 0.06, 0.95), p["wood_dark"], bevel=0.015)
        B(f"cap{x}", (x - 0.08, -0.08, 0.95), (x + 0.08, 0.08, 1.02), p["snow"], bevel=0.015)
    for z in (0.35, 0.68):
        B(f"rail{z}", (-0.95, -0.03, z - 0.05), (0.95, 0.03, z + 0.05), p["wood"], bevel=0.01)
    BUILT.append(finish_prop("fence_section", "fence", "decor", "a short wooden fence", ["fence"], stand=0.5))


def barrel():
    p = start()
    cylinder("body", (0, 0, 0.4), 0.32, 0.8, 10, 'Z', p["wood"])
    for z in (0.18, 0.62):
        cylinder(f"band{z}", (0, 0, z), 0.335, 0.07, 10, 'Z', p["iron"])
    cylinder("lid", (0, 0, 0.805), 0.29, 0.02, 10, 'Z', p["wood_dark"])
    BUILT.append(finish_prop("barrel", "barrel", "scenery", "a wooden barrel", ["barrel"], stand=0.6))


def forest_edge():
    p = start()
    for i, (x, y, s) in enumerate(((-1.3, 0.2, 1.2), (-0.5, 0.55, 1.5), (0.4, 0.15, 1.35), (1.2, 0.5, 1.6), (0.0, -0.35, 1.0), (-0.9, -0.4, 0.95), (0.9, -0.3, 1.05))):
        pine(p, f"e{i}", x, y, s)
    BUILT.append(finish_prop("forest_edge", "dark forest", "exit", "a thick group of pine trees: the way into the forest",
                             ["forest", "woods", "path"], place=("edge", "floor"), stand=0.9))


def lantern_post():
    p = start()
    B("post", (-0.05, -0.05, 0.0), (0.05, 0.05, 1.9), p["iron"], bevel=0.015)
    B("arm", (0.0, -0.03, 1.8), (0.4, 0.03, 1.86), p["iron"], bevel=0.01)
    B("lantern", (0.3, -0.1, 1.5), (0.5, 0.1, 1.78), p["lantern"], bevel=0.02)
    B("lantern_top", (0.27, -0.13, 1.78), (0.53, 0.13, 1.86), p["iron"], bevel=0.02)
    BUILT.append(finish_prop("lantern_post", "lantern post", "decor", "an iron post with a glowing lantern",
                             ["lantern", "lamp", "light"], stand=0.6, lights=[{"kind": "lantern", "at": [0.4, -0.3, 1.6]}]))


# ---------------------------------------------------------------- indoor
def fire_pit():
    p = start()
    for i in range(9):
        a = 2 * math.pi * i / 9
        box_rot(f"stone{i}", (math.cos(a) * 0.6, math.sin(a) * 0.6, 0.14), (0.3, 0.22, 0.28), (0, 0, math.degrees(a) + 90),
                p["stone"] if i % 2 else p["stone_dark"])
    box_rot("log_a", (0, 0, 0.12), (0.9, 0.12, 0.12), (0, 0, 25), p["wood_dark"])
    box_rot("log_b", (0, 0, 0.17), (0.9, 0.12, 0.12), (0, 0, -35), p["wood"])
    cone("flame_a", 0.26, 0.15, 0.85, p["flame"], center=(0.0, 0.0), segs=6)
    cone("flame_b", 0.17, 0.15, 0.95, p["flame_core"], center=(0.08, 0.05), segs=5)
    cone("flame_c", 0.14, 0.15, 0.65, p["flame"], center=(-0.12, -0.06), segs=5)
    BUILT.append(finish_prop("fire_pit", "fire", "furniture", "a ring of stones with a warm fire",
                             ["fire", "fireplace", "flame"], stand=0.8, anims={"flicker": ["flame_a", "flame_b", "flame_c"]},
                             lights=[{"kind": "fire", "at": [0.0, -0.2, 0.7]}]))


def table_long():
    p = start()
    B("top", (-1.0, -0.45, 0.74), (1.0, 0.45, 0.82), p["wood_light"], bevel=0.02)
    for sx in (-1, 1):
        for sy in (-1, 1):
            B(f"leg{sx}{sy}", (sx * 0.85 - 0.06, sy * 0.33 - 0.06, 0.0), (sx * 0.85 + 0.06, sy * 0.33 + 0.06, 0.74), p["wood"], bevel=0.015)
    B("beam", (-0.85, -0.04, 0.2), (0.85, 0.04, 0.27), p["wood"], bevel=0.01)
    BUILT.append(finish_prop("table_long", "long wooden table", "furniture", "a long wooden table; small things can be put on it",
                             ["table"], stand=0.65, surface=True, extra={"surface_height": 0.82}))


def chest_wood():
    p = start()
    B("body", (-0.55, -0.32, 0.0), (0.55, 0.32, 0.42), p["wood"], bevel=0.03)
    B("lid", (-0.57, -0.33, 0.42), (0.57, 0.33, 0.6), p["wood_dark"], bevel=0.04, origin=(0.0, 0.32, 0.42))
    for x in (-0.35, 0.35):
        B(f"band{x}", (x - 0.05, -0.34, 0.0), (x + 0.05, 0.34, 0.43), p["iron"], bevel=0.01)
    B("lock", (-0.07, -0.345, 0.25), (0.07, -0.32, 0.38), p["gold"], bevel=0.01)
    B("inside", (-0.5, -0.27, 0.39), (0.5, 0.27, 0.41), p["black"], bevel=0.0)
    # the lid object's pivot is the hinge: place it correctly (its mesh was made relative to the origin above)
    bpy.data.objects["lid"].name = "chest_lid"     # pivot = the hinge at the back
    BUILT.append(finish_prop("chest_wood", "wooden chest", "furniture", "a wooden chest with an iron lock; small things can be inside",
                             ["chest", "box"], stand=0.65, container=True, extra={"inside_height": 0.4},
                             opens={"node": "chest_lid", "axis": "x", "angle": -105}))


def door_wall():
    p = start()
    B("post_l", (-0.62, -0.1, 0.0), (-0.5, 0.1, 2.15), p["wood_dark"], bevel=0.02)
    B("post_r", (0.5, -0.1, 0.0), (0.62, 0.1, 2.15), p["wood_dark"], bevel=0.02)
    B("lintel", (-0.66, -0.1, 2.15), (0.66, 0.1, 2.3), p["wood_dark"], bevel=0.02)
    leaf = B("leaf", (-0.5, -0.05, 0.0), (0.5, 0.05, 2.12), p["wood"], bevel=0.02, origin=(-0.5, 0.0, 0.0))
    leaf.name = "door_leaf"                          # pivot = the hinge on the left
    B("leaf_band", (0.0, -0.06, 0.5), (1.0, 0.06, 0.6), p["iron"], bevel=0.01, parent=leaf)
    B("part_door", (-0.65, -0.5, 0.0), (0.65, 0.3, 2.3), p["helper"], bevel=0)
    BUILT.append(finish_prop("door_wall", "wooden door", "exit", "a wooden door in a wall; it leads somewhere else",
                             ["door", "outside"], place=("wall",), stand=0.7, wall=True,
                             opens={"node": "door_leaf", "axis": "z", "angle": 100}))


def bench():
    p = start()
    B("seat", (-0.8, -0.22, 0.38), (0.8, 0.22, 0.45), p["wood"], bevel=0.02)
    for sx in (-1, 1):
        B(f"leg{sx}", (sx * 0.65 - 0.05, -0.17, 0.0), (sx * 0.65 + 0.05, 0.17, 0.38), p["wood_dark"], bevel=0.015)
    BUILT.append(finish_prop("bench", "wooden bench", "furniture", "a simple wooden bench", ["bench", "seat"], stand=0.5))


def shield_wall():
    p = start()
    cylinder("shield", (0, 0, 1.55), 0.4, 0.07, 14, 'Y', p["red"])
    cylinder("shield_ring", (0, -0.035, 1.55), 0.3, 0.02, 14, 'Y', p["gold"])
    cylinder("shield_boss", (0, -0.06, 1.55), 0.1, 0.05, 10, 'Y', p["steel"])
    BUILT.append(finish_prop("shield_wall", "round shield", "decor", "a red and yellow round shield on the wall",
                             ["shield"], place=("wall",), stand=0.6, wall=True))


def shelf_wall():
    p = start()
    B("plank", (-0.6, -0.12, 1.3), (0.6, 0.12, 1.36), p["wood"], bevel=0.015)
    for x, c in ((-0.35, p["cloth_blue"]), (0.0, p["bread_dark"]), (0.38, p["cloth_green"])):
        cylinder(f"jar{x}", (x, 0, 1.36 + 0.1), 0.08, 0.2, 8, 'Z', c)
    BUILT.append(finish_prop("shelf_wall", "wooden shelf", "decor", "a small wooden shelf with jars",
                             ["shelf", "jar", "jars"], place=("wall",), stand=0.6, wall=True))


def bed_simple():
    p = start()
    B("frame", (-0.5, -1.0, 0.18), (0.5, 1.0, 0.36), p["wood"], bevel=0.03)
    for sx in (-1, 1):
        for sy in (-1, 1):
            B(f"leg{sx}{sy}", (sx * 0.45 - 0.05, sy * 0.95 - 0.05, 0.0), (sx * 0.45 + 0.05, sy * 0.95 + 0.05, 0.2), p["wood_dark"], bevel=0.01)
    B("mattress", (-0.46, -0.95, 0.36), (0.46, 0.95, 0.5), p["cloth_cream"], bevel=0.04)
    B("blanket", (-0.48, -0.9, 0.5), (0.48, 0.3, 0.56), p["cloth_blue"], bevel=0.04)
    B("pillow", (-0.3, 0.55, 0.5), (0.3, 0.9, 0.62), p["white"], bevel=0.05)
    BUILT.append(finish_prop("bed_simple", "bed", "furniture", "a simple wooden bed with a blue blanket", ["bed"], stand=0.6))


# ---------------------------------------------------------------- items (small things)
def item_key():
    p = start()
    torus = ring_xy("key_ring", (-0.08, 0, 0.02), 0.045, 0.012, 10, 5, p["iron"])
    B("key_shaft", (-0.04, -0.012, 0.01), (0.2, 0.012, 0.035), p["iron"], bevel=0.005)
    B("key_t1", (0.14, -0.012, 0.035), (0.17, 0.012, 0.075), p["iron"], bevel=0.003)
    B("key_t2", (0.18, -0.012, 0.035), (0.2, 0.012, 0.06), p["iron"], bevel=0.003)
    BUILT.append(finish_prop("item_key", "small iron key", "item", "a small old iron key", ["key"], place=("floor", "surface", "inside"), stand=0.5))


def item_sword():
    p = start()
    B("blade", (-0.1, -0.035, 0.012), (0.75, 0.035, 0.03), p["steel"], bevel=0.006)
    B("guard", (-0.14, -0.1, 0.005), (-0.08, 0.1, 0.04), p["gold"], bevel=0.008)
    B("hilt", (-0.34, -0.022, 0.008), (-0.14, 0.022, 0.034), p["leather"], bevel=0.008)
    B("pommel", (-0.4, -0.04, 0.0), (-0.34, 0.04, 0.045), p["gold"], bevel=0.01)
    BUILT.append(finish_prop("item_sword", "sword", "item", "a big Viking sword with a leather handle", ["sword"],
                             place=("floor", "surface", "inside"), stand=0.55))


def item_bread():
    p = start()
    ellipsoid("loaf", (0, 0, 0.07), (0.17, 0.12, 0.08), 9, 6, p["bread"])
    for i in (-1, 0, 1):
        box_rot(f"cut{i}", (i * 0.06, 0, 0.14), (0.015, 0.1, 0.012), (0, 0, 20), p["bread_dark"])
    BUILT.append(finish_prop("item_bread", "loaf of bread", "item", "a fresh round loaf of bread", ["bread", "loaf"],
                             place=("floor", "surface", "inside"), stand=0.5))


def item_rope():
    p = start()
    for i in range(3):
        ring_xy(f"coil{i}", (0, 0, 0.02 + i * 0.03), 0.11 - i * 0.012, 0.016, 12, 5, p["rope"])
    BUILT.append(finish_prop("item_rope", "rope", "item", "a coil of rope", ["rope"], place=("floor", "surface", "inside"), stand=0.5))


def item_torch():
    p = start()
    cylinder("handle", (0, 0, 0.3), 0.025, 0.6, 6, 'Z', p["wood_dark"])
    cone("flame", 0.07, 0.58, 0.8, p["flame"], center=(0, 0), segs=6)
    cone("flame_core", 0.04, 0.58, 0.72, p["flame_core"], center=(0, 0), segs=5)
    BUILT.append(finish_prop("item_torch", "torch", "item", "a wooden torch with a small fire", ["torch"],
                             place=("floor", "surface", "inside"), stand=0.5, lights=[{"kind": "lantern", "at": [0, 0, 0.9]}],
                             anims={"flicker": ["flame", "flame_core"]}))


def item_fish():
    p = start()
    ellipsoid("body", (0, 0, 0.04), (0.17, 0.05, 0.05), 8, 5, p["fish"])
    prism_xz("tail", [(0.15, 0.0), (0.3, 0.07), (0.3, -0.07)], -0.01, 0.01, p["fish"])
    BUILT.append(finish_prop("item_fish", "fish", "item", "a silver fish", ["fish"], place=("floor", "surface", "inside"), stand=0.5))


ALL = [house_viking, rock_big, pine_tree, signpost, fence_section, barrel, forest_edge, lantern_post,
       fire_pit, table_long, chest_wood, door_wall, bench, shield_wall, shelf_wall, bed_simple,
       item_key, item_sword, item_bread, item_rope, item_torch, item_fish]

for fn in ALL:
    try:
        fn()
    except Exception as e:  # keep going: one broken prop must not stop the batch
        import traceback
        print("FAILED", fn.__name__, e)
        traceback.print_exc()
print("props built:", [b["id"] for b in BUILT])
