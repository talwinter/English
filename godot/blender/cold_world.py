"""The cold game world the hero lands in at the end of the prologue: a snowy clearing at night
with pines, rocks, mountains, a moon, stars and a few glitching cubes ("this is a computer game").
Run inside Blender:  exec(open(r"H:\\Projects\\English\\godot\\blender\\cold_world.py").read())
Writes godot/assets/cold_world.glb. Same naming contract as the attic (see attic.py).
"""
import sys
sys.path.insert(0, r"H:\Projects\English\godot\blender")
import importlib
import lib
importlib.reload(lib)
from lib import *
import math
import random

reset_scene()
rng = random.Random(7)

snow = mat("snow", (0.80, 0.86, 0.97), rough=0.95)
snow_shade = mat("snow_shade", (0.66, 0.74, 0.90), rough=0.95)
pine = mat("pine", (0.08, 0.26, 0.24), rough=0.9)
pine_dark = mat("pine_dark", (0.05, 0.18, 0.2), rough=0.9)
trunk = mat("trunk", (0.3, 0.18, 0.1), rough=0.9)
rock = mat("rock", (0.36, 0.38, 0.46), rough=0.9)
mount = mat("mountain", (0.28, 0.34, 0.55), rough=1.0)
mount_cap = mat("mountain_cap", (0.85, 0.9, 1.0), rough=1.0)
moon_m = mat("moon", (1.0, 0.96, 0.8), emit=(1.0, 0.95, 0.75), strength=3.0)
star_m = mat("star", (1, 1, 1), emit=(1, 1, 1), strength=3.0)
nav_m = mat("nav", (0.1, 0.5, 0.1))
glitch_mats = [mat("glitch_cyan", (0.2, 0.9, 1.0), emit=(0.1, 0.9, 1.0), strength=2.2),
               mat("glitch_pink", (1.0, 0.2, 0.8), emit=(1.0, 0.1, 0.8), strength=2.2),
               mat("glitch_lime", (0.5, 1.0, 0.3), emit=(0.4, 1.0, 0.2), strength=2.2)]

room = empty("ColdWorld")

# ground: a wide low disc with a lighter clearing in the middle
cylinder("ground", (0, 0, -0.25), 26, 0.5, 20, 'Z', snow_shade, room)
cylinder("clearing", (0, 0, -0.02), 6.5, 0.04, 16, 'Z', snow, room)
for i in range(7):
    a = rng.uniform(0, 2 * math.pi)
    r = rng.uniform(7.5, 14)
    ellipsoid(f"drift_{i}", (math.cos(a) * r, math.sin(a) * r, -0.1), (rng.uniform(1.2, 2.4), rng.uniform(0.9, 1.6), 0.45), 8, 5, snow, room)


def cone(name, r, base_z, top_z, material, parent, segs=7):
    vv = [(0, 0, top_z)] + [(math.cos(2 * math.pi * j / segs) * r, math.sin(2 * math.pi * j / segs) * r, base_z) for j in range(segs)] + [(0, 0, base_z)]
    ff = [(0, 1 + (j + 1) % segs, 1 + j) for j in range(segs)] + [(segs + 1, 1 + j, 1 + (j + 1) % segs) for j in range(segs)]
    return obj(name, vv, ff, material, parent)


def tree(i, x, y, s):
    g = empty(f"tree_{i}", (x, y, 0), room)
    cylinder(f"trunk_{i}", (0, 0, 0.35 * s), 0.12 * s, 0.7 * s, 6, 'Z', trunk, g)
    for k, (r, h, z) in enumerate(((0.95, 1.1, 0.8), (0.72, 1.0, 1.45), (0.48, 0.9, 2.05))):
        cone(f"pine_{i}_{k}", r * s, z * s, (z + h) * s, pine if k % 2 == 0 else pine_dark, g)
        cone(f"pine_snow_{i}_{k}", r * 0.46 * s, (z + h * 0.58) * s, (z + h) * s + 0.01, snow, g)
    return g


placed = []
n = 0
while n < 22:
    a = rng.uniform(0, 2 * math.pi)
    r = rng.uniform(6.8, 15)
    x, y = math.cos(a) * r, math.sin(a) * r
    if y < -4.5 and abs(x) < 6:          # keep the view from the camera (south) open
        continue
    if any((x - px) ** 2 + (y - py) ** 2 < 1.6 for px, py in placed):
        continue
    placed.append((x, y))
    tree(n, x, y, rng.uniform(0.9, 1.7))
    n += 1

for i in range(6):
    a = rng.uniform(0, 2 * math.pi)
    r = rng.uniform(5, 12)
    ellipsoid(f"rock_{i}", (math.cos(a) * r, math.sin(a) * r, 0.1), (rng.uniform(0.5, 1.0), rng.uniform(0.4, 0.8), rng.uniform(0.35, 0.6)), 6, 4, rock, room)

# mountains far away (north)
for i in range(7):
    a = math.radians(rng.uniform(40, 140))
    r = rng.uniform(26, 34)
    h = rng.uniform(7, 13)
    w = rng.uniform(5, 9)
    cx, cy = math.cos(a) * r, math.sin(a) * r
    vv = [(cx, cy, h)] + [(cx + math.cos(2 * math.pi * j / 6) * w, cy + math.sin(2 * math.pi * j / 6) * w, -0.4) for j in range(6)]
    ff = [(0, 1 + (j + 1) % 6, 1 + j) for j in range(6)]
    obj(f"mountain_{i}", vv, ff, mount, room)
    cv = [(cx, cy, h + 0.01)] + [(cx + math.cos(2 * math.pi * j / 6) * w * 0.38, cy + math.sin(2 * math.pi * j / 6) * w * 0.38, h * 0.62) for j in range(6)]
    obj(f"mountain_cap_{i}", cv, ff, mount_cap, room)

# moon and stars
sphere("moon", (-14, 30, 17), 2.6, 12, 8, moon_m, room)
sv, sf = [], []
for i in range(110):
    a = rng.uniform(0, 2 * math.pi)
    e = math.acos(rng.uniform(0.05, 1.0))
    r = 60
    c = (math.cos(a) * math.sin(e) * r, math.sin(a) * math.sin(e) * r, math.cos(e) * r * 0.6 + 4)
    s = rng.uniform(0.12, 0.3)
    base = len(sv)
    sv += [(c[0] - s, c[1], c[2] - s), (c[0] + s, c[1], c[2] - s), (c[0], c[1], c[2] + s)]
    sf.append((base, base + 1, base + 2))
obj("stars", sv, sf, star_m, room)

# glitching cubes: this is a computer game, and it is not quite stable
for i in range(9):
    a = rng.uniform(0, 2 * math.pi)
    r = rng.uniform(3.5, 9)
    z = rng.uniform(0.8, 4.5)
    s = rng.uniform(0.12, 0.4)
    c = (math.cos(a) * r, math.sin(a) * r, z)
    box_rot(f"glitch_{i}", c, (s, s, s * rng.choice((0.4, 1.0, 1.6))), (rng.uniform(0, 60), rng.uniform(0, 60), rng.uniform(0, 90)),
            glitch_mats[i % 3], room)

# ---------- contract ----------
verts = [(math.cos(2 * math.pi * j / 12) * 4.6, math.sin(2 * math.pi * j / 12) * 4.6, 0.0) for j in range(12)]
obj("nav_floor", verts, [tuple(range(12))], nav_m, room)
empty("spawn_Hero", (0.0, 0.0, 0.0), room)
empty("spawn_Byte", (1.25, -0.7, 1.6), room)
cam = empty("camera", (0.0, -7.2, 2.7), room)
cam["fov"] = 52.0
empty("camera_target", (0.0, 0.5, 1.15), room)
empty("light_moon", (-14, 30, 17), room)

export_glb(r"H:\Projects\English\godot\assets\cold_world.glb")
print("cold world exported")
