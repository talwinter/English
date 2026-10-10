"""Grandpa's attic (prologue, proof of concept). Run inside Blender (through the Blender MCP):

    exec(open(r"H:\\Projects\\English\\godot\\blender\\attic.py").read())

Writes godot/assets/attic.glb.

Naming convention read by the Godot side (this is the "catalog" contract, step 1 will formalise it):
  nav_floor        walkable floor (the navigation mesh is baked from it)
  block_<Id>       footprint of a prop: carved out of the navigation mesh (hidden)
  pick_<Id>        clickable volume of a prop (hidden, raycast target)
  stand_<Id>       empty: where the hero stands to use the prop
  light_<name>     empty: where Godot puts a light
Every other mesh is just scenery.
"""
import sys
sys.path.insert(0, r"H:\Projects\English\godot\blender")
import importlib
import lib
importlib.reload(lib)
from lib import *

reset_scene()

# ---------- materials (flat colours: the pixel look comes from the low render size) ----------
floor_a = mat("floor_a", (0.42, 0.27, 0.15))
floor_b = mat("floor_b", (0.37, 0.23, 0.12))
floor_c = mat("floor_c", (0.47, 0.31, 0.18))
wall_m = mat("wall", (0.52, 0.38, 0.24))
roof_m = mat("roof", (0.40, 0.28, 0.17))
beam_m = mat("beam", (0.27, 0.17, 0.09))
desk_m = mat("desk", (0.60, 0.40, 0.21))
desk_dark = mat("desk_dark", (0.45, 0.29, 0.15))
beige = mat("beige", (0.84, 0.78, 0.62), rough=0.6)
beige_dark = mat("beige_dark", (0.68, 0.62, 0.47), rough=0.6)
plastic_dark = mat("plastic_dark", (0.16, 0.15, 0.14), rough=0.5)
screen_m = mat("screen", (0.03, 0.09, 0.05), rough=0.2, emit=(0.15, 0.9, 0.35), strength=0.6)
led_m = mat("led", (0.2, 0.9, 0.2), emit=(0.2, 1.0, 0.2), strength=4.0)
card_m = mat("cardboard", (0.74, 0.55, 0.31))
card_dark = mat("cardboard_dark", (0.60, 0.42, 0.22))
tape_m = mat("tape", (0.80, 0.68, 0.40))
frame_m = mat("frame", (0.30, 0.19, 0.10))
glass_m = mat("glass", (0.70, 0.85, 1.0), rough=0.1, emit=(0.6, 0.8, 1.0), strength=1.3)
bulb_m = mat("bulb", (1.0, 0.9, 0.6), emit=(1.0, 0.82, 0.45), strength=10.0)
cable_m = mat("cable", (0.05, 0.05, 0.05))
nav_m = mat("nav", (0.1, 0.5, 0.1))

room = empty("Attic")

# ---------- room shell: open front (-Y, towards the camera), gable back wall, sloped roof ----------
W, D = 3.0, 2.5            # half width, half depth
KNEE, RIDGE = 1.0, 3.2     # wall height at the sides, height of the ridge

# floor planks (several boards, slight colour variation)
planks = []
n_planks = 12
pw = 2 * W / n_planks
for i in range(n_planks):
    m = (floor_a, floor_b, floor_c)[i % 3]
    x0 = -W + i * pw
    planks.append(box(f"plank_{i}", (x0 + 0.01, -D, -0.12), (x0 + pw - 0.01, D, 0.0), m, room))

box("floor_base", (-W, -D, -0.2), (W, D, -0.02), beam_m, room)   # dark base: the gaps between planks read as lines

# back gable wall
prism_xz("BackWall", [(-W, 0.0), (W, 0.0), (W, KNEE), (0.0, RIDGE), (-W, KNEE)], D, D + 0.12, wall_m, room)

# sloped roof, left and right: thin slabs, normal pointing out
sl = Vector((W, RIDGE - KNEE))              # slope direction (left side, going up to the ridge)
nrm = Vector((-sl.y, sl.x)).normalized()    # outward normal for the left slope
t = 0.14
a = Vector((-W, KNEE))
b = Vector((0.0, RIDGE))
prism_xz("RoofLeft", [(a.x, a.y), (b.x, b.y), (b.x + nrm.x * t, b.y + nrm.y * t), (a.x + nrm.x * t, a.y + nrm.y * t)],
         -D, D, roof_m, room)
a2 = Vector((W, KNEE))
mir = Vector((-nrm.x, nrm.y))    # outward normal of the right slope
prism_xz("RoofRight", [(b.x, b.y), (a2.x, a2.y), (a2.x + mir.x * t, a2.y + mir.y * t), (b.x + mir.x * t, b.y + mir.y * t)],
         -D, D, roof_m, room)

# knee walls under the eaves
box("KneeWallLeft", (-W - 0.12, -D, 0.0), (-W, D, KNEE + 0.02), wall_m, room)
box("KneeWallRight", (W, -D, 0.0), (W + 0.12, D, KNEE + 0.02), wall_m, room)


def ccw(poly):
    area = sum(poly[i][0] * poly[(i + 1) % len(poly)][1] - poly[(i + 1) % len(poly)][0] * poly[i][1]
               for i in range(len(poly)))
    return poly if area > 0 else poly[::-1]


# rafters (follow the inside of the roof), ridge beam, two collar ties
r_w = 0.10
d = 0.13
for k, y in enumerate((-2.2, -0.9, 0.4, 1.7)):
    for side in (-1, 1):
        n_out = nrm if side < 0 else mir
        p0 = (side * W, KNEE)
        p1 = (0.0, RIDGE)
        o = (-n_out.x * d, -n_out.y * d)   # towards the room
        poly = ccw([p0, p1, (p1[0] + o[0], p1[1] + o[1]), (p0[0] + o[0], p0[1] + o[1])])
        prism_xz(f"rafter_{k}_{'L' if side < 0 else 'R'}", poly, y - r_w / 2, y + r_w / 2, beam_m, room)
box("ridge_beam", (-0.07, -D, RIDGE - 0.22), (0.07, D, RIDGE - 0.02), beam_m, room)
for y in (-1.3, 1.2):
    box(f"collar_tie_{'a' if y < 0 else 'b'}", (-1.0, y - 0.05, 2.45), (1.0, y + 0.05, 2.55), beam_m, room)

# ---------- desk against the back wall ----------
DX, DY = 0.4, 2.05
desk = empty("Desk", (0, 0, 0), room)
box("desk_top", (DX - 0.75, DY - 0.375, 0.70), (DX + 0.75, DY + 0.375, 0.76), desk_m, desk)
for sx in (-1, 1):
    for sy in (-1, 1):
        box(f"desk_leg_{sx}_{sy}", (DX + sx * 0.70 - 0.04, DY + sy * 0.32 - 0.04, 0.0),
            (DX + sx * 0.70 + 0.04, DY + sy * 0.32 + 0.04, 0.70), desk_dark, desk)
box("desk_drawers", (DX + 0.30, DY - 0.33, 0.30), (DX + 0.68, DY + 0.33, 0.70), desk_m, desk)
box("desk_drawer_line", (DX + 0.30, DY - 0.335, 0.49), (DX + 0.68, DY - 0.325, 0.51), desk_dark, desk)
box("desk_knob_a", (DX + 0.46, DY - 0.35, 0.58), (DX + 0.52, DY - 0.33, 0.62), plastic_dark, desk)
box("desk_knob_b", (DX + 0.46, DY - 0.35, 0.38), (DX + 0.52, DY - 0.33, 0.42), plastic_dark, desk)

# ---------- Grandpa's 1987 computer (beige PC: desktop case + CRT monitor + keyboard) ----------
comp = empty("Computer", (0, 0, 0), room)
cx = DX - 0.15           # computer sits left of centre so the drawers keep their place
box("pc_case", (cx - 0.27, DY - 0.17, 0.76), (cx + 0.27, DY + 0.19, 0.90), beige, comp)
box("pc_case_slot_a", (cx - 0.22, DY - 0.175, 0.80), (cx - 0.04, DY - 0.17, 0.82), plastic_dark, comp)   # floppy drive
box("pc_case_slot_b", (cx + 0.04, DY - 0.175, 0.80), (cx + 0.22, DY - 0.17, 0.82), plastic_dark, comp)   # floppy drive
box("pc_case_led", (cx + 0.20, DY - 0.175, 0.86), (cx + 0.23, DY - 0.17, 0.88), led_m, comp)
box("pc_case_band", (cx - 0.27, DY - 0.172, 0.835), (cx + 0.27, DY - 0.17, 0.85), beige_dark, comp)
frustum("crt_body", (cx, 1.07, 0.21, 0.17, DY - 0.15), (cx, 1.07, 0.12, 0.10, DY + 0.18), beige, comp)
box("crt_bezel", (cx - 0.23, DY - 0.175, 0.88 + 0.11), (cx + 0.23, DY - 0.15, 0.88 + 0.46), beige_dark, comp)
box("crt_screen", (cx - 0.17, DY - 0.18, 0.88 + 0.16), (cx + 0.17, DY - 0.17, 0.88 + 0.42), screen_m, comp)
box("crt_base", (cx - 0.14, DY - 0.05, 0.90), (cx + 0.14, DY + 0.10, 0.93), beige_dark, comp)
# keyboard: base, key block, a few light keys
box("kb_base", (cx - 0.24, DY - 0.50, 0.76), (cx + 0.24, DY - 0.30, 0.79), beige, comp)
box("kb_keys", (cx - 0.22, DY - 0.48, 0.79), (cx + 0.22, DY - 0.32, 0.81), beige_dark, comp)
for r in range(4):
    for c in range(9):
        kx = cx - 0.20 + c * 0.047
        ky = DY - 0.475 + r * 0.04
        box(f"key_{r}_{c}", (kx, ky, 0.81), (kx + 0.035, ky + 0.028, 0.83), beige, comp)
box("kb_cable", (cx - 0.01, DY - 0.30, 0.76), (cx + 0.01, DY - 0.17, 0.775), plastic_dark, comp)

# ---------- cardboard box on the floor (left) ----------
BX, BY = -1.7, 0.2
cb = empty("Box", (0, 0, 0), room)
box("box_body", (BX - 0.35, BY - 0.30, 0.0), (BX + 0.35, BY + 0.30, 0.45), card_m, cb)
box_rot("box_flap_front", (BX, BY - 0.40, 0.55), (0.70, 0.30, 0.02), (-35, 0, 0), card_dark, cb)
box_rot("box_flap_back", (BX, BY + 0.40, 0.55), (0.70, 0.30, 0.02), (35, 0, 0), card_dark, cb)
box_rot("box_flap_left", (BX - 0.40, BY, 0.52), (0.30, 0.60, 0.02), (0, -25, 0), card_m, cb)
box("box_tape", (BX - 0.06, BY - 0.301, 0.0), (BX + 0.06, BY - 0.299, 0.45), tape_m, cb)
box("box_inside", (BX - 0.32, BY - 0.27, 0.40), (BX + 0.32, BY + 0.27, 0.44), plastic_dark, cb)

# ---------- round window in the back wall ----------
WX, WZ, WR = -1.5, 1.45, 0.38
win = empty("Window", (0, 0, 0), room)
ring_xz("window_frame", (WX, D - 0.005, WZ), WR, 0.04, 16, 6, frame_m, win)
cylinder("window_glass", (WX, D - 0.015, WZ), WR, 0.02, 16, axis='Y', material=glass_m, parent=win)
box("window_bar_h", (WX - WR, D - 0.03, WZ - 0.015), (WX + WR, D - 0.01, WZ + 0.015), frame_m, win)
box("window_bar_v", (WX - 0.015, D - 0.03, WZ - WR), (WX + 0.015, D - 0.01, WZ + WR), frame_m, win)

# ---------- hanging bulb ----------
bulb = empty("Bulb", (0, 0, 0), room)
HX, HY = 0.0, 0.2
cylinder("bulb_cable", (HX, HY, (RIDGE - 0.22 + 2.35) / 2), 0.012, (RIDGE - 0.22) - 2.35, 4, material=cable_m, parent=bulb)
cylinder("bulb_socket", (HX, HY, 2.31), 0.04, 0.09, 8, material=plastic_dark, parent=bulb)
sphere("bulb_glass", (HX, HY, 2.18), 0.095, 8, 6, bulb_m, bulb)
empty("light_bulb", (HX, HY, 2.15), room)

# ---------- logic helpers: navigation floor, footprints, click volumes, stand points ----------
# walkable region = where the hero's head clears the roof (|x| <= 2.1) and not right against the front edge
nav = box("nav_floor", (-2.1, -2.3, 0.0), (2.1, 2.3, 0.001), nav_m, room)
box("block_Desk", (DX - 0.80, DY - 0.45, 0.0), (DX + 0.80, D, 0.8), nav_m, room)
box("block_Box", (BX - 0.45, BY - 0.40, 0.0), (BX + 0.45, BY + 0.40, 0.6), nav_m, room)
box("pick_Computer", (cx - 0.29, DY - 0.52, 0.76), (cx + 0.29, DY + 0.20, 1.30), nav_m, room)
box("pick_Desk", (DX - 0.75, DY - 0.375, 0.0), (DX + 0.75, DY + 0.375, 0.76), nav_m, room)
box("pick_Box", (BX - 0.38, BY - 0.33, 0.0), (BX + 0.38, BY + 0.33, 0.6), nav_m, room)
box("pick_Window", (WX - WR - 0.05, D - 0.08, WZ - WR - 0.05), (WX + WR + 0.05, D + 0.0, WZ + WR + 0.05), nav_m, room)
empty("stand_Computer", (cx - 0.95, 1.45, 0.0), room)   # beside the desk, so the hero does not hide the screen
empty("stand_Desk", (DX + 0.4, 1.2, 0.0), room)
empty("stand_Box", (BX + 1.0, BY - 0.1, 0.0), room)
empty("stand_Window", (WX, 1.7, 0.0), room)
empty("spawn_Hero", (0.0, -1.2, 0.0), room)

export_glb(r"H:\Projects\English\godot\assets\attic.glb")
print("attic exported", len(bpy.data.objects), "objects")
