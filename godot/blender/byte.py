"""Byte: the hero's sidekick, a flying mouse-pointer arrow with wings and a friendly face.
Run inside Blender:  exec(open(r"H:\\Projects\\English\\godot\\blender\\byte.py").read())
Writes godot/assets/byte.glb. He faces -Y (towards the camera); about 0.5 m tall.
Godot flaps the wings by turning wing_pivot_L / wing_pivot_R, and bobs the whole thing.
"""
import sys
sys.path.insert(0, r"H:\Projects\English\godot\blender")
import importlib
import lib
importlib.reload(lib)
from lib import *

reset_scene()

body_m = mat("byte_body", (0.93, 0.98, 1.0), rough=0.35, emit=(0.4, 0.7, 0.9), strength=0.35)
outline_m = mat("byte_outline", (0.03, 0.04, 0.08), rough=0.6)
eye_m = mat("byte_eye", (0.02, 0.02, 0.05), rough=0.2)
glint_m = mat("byte_glint", (1, 1, 1), emit=(1, 1, 1), strength=2.0)
wing_m = mat("byte_wing", (0.75, 0.95, 1.0), rough=0.3, emit=(0.3, 0.85, 1.0), strength=1.4)
wing_dark = mat("byte_wing_edge", (0.2, 0.55, 0.85), rough=0.4, emit=(0.1, 0.5, 0.9), strength=1.0)

S = 0.034                      # cursor units -> metres
POINTS = [(0, 0), (0, 17), (4.2, 13), (7, 19.5), (10, 18.2), (7.2, 12), (12.5, 12)]   # (u right, v down)


def cur(u, v):
    return ((u - 6.0) * S, -(v - 9.5) * S)   # centred: x right, z up


poly = [cur(u, v) for u, v in POINTS][::-1]       # CCW for prism_xz
root = empty("Byte", (0, 0, 0))
T = 0.07
prism_xz("byte_outline", [(x * 1.16, z * 1.16) for x, z in poly], -T * 0.75, T * 0.75, outline_m, root)
prism_xz("byte_body", poly, -T, T, body_m, root)

# face on the front (-Y)
for i, u in enumerate((2.5, 5.3)):
    x, z = cur(u, 8.2)
    ellipsoid(f"byte_eye{i}", (x, -T - 0.004, z), (0.034, 0.012, 0.05), 8, 6, eye_m, root)
    ellipsoid(f"byte_glint{i}", (x - 0.008, -T - 0.014, z + 0.02), (0.011, 0.005, 0.014), 6, 4, glint_m, root)
mx, mz = cur(3.9, 11.0)
box("byte_mouth", (mx - 0.035, -T - 0.006, mz - 0.006), (mx + 0.035, -T, mz + 0.006), eye_m, root)
box_rot("byte_mouth_l", (mx - 0.042, -T - 0.003, mz + 0.008), (0.022, 0.006, 0.008), (0, 40, 0), eye_m, root)
box_rot("byte_mouth_r", (mx + 0.042, -T - 0.003, mz + 0.008), (0.022, 0.006, 0.008), (0, -40, 0), eye_m, root)

# wings: three feathers each, pivot at the shoulder (object origin), so they can flap
for side, s in (("L", -1), ("R", 1)):
    ux, uz = cur(9.0 if s > 0 else 0.3, 6.0)
    pivot = empty(f"wing_pivot_{side}", (ux, 0.02, uz), root)
    feathers = [((0.0, 0.0), (0.16, 0.10), (0.26, 0.04), (0.2, -0.02), (0.05, -0.04)),
                ((0.0, 0.01), (0.14, 0.2), (0.22, 0.17), (0.2, 0.08), (0.06, 0.0)),
                ((0.0, 0.0), (0.08, 0.29), (0.15, 0.26), (0.16, 0.14), (0.05, 0.0))]
    for k, pts in enumerate(feathers):
        p = [(s * x, z) for x, z in pts]
        if s < 0:
            p = p[::-1]
        prism_xz(f"wing_{side}_{k}", p, -0.012 - 0.004 * k, 0.012 - 0.004 * k, wing_m if k < 2 else wing_dark, pivot)

export_glb(r"H:\Projects\English\godot\assets\byte.glb")
print("byte exported")
