"""Tiny mesh helpers for building low-poly props in Blender (flat colours, no textures).

Coordinates are Blender's: X right, Y depth (the camera looks from -Y towards +Y), Z up.
The glTF exporter turns this into Godot's Y-up space, so the room's open front (-Y) faces the Godot camera.
"""
import math
import bpy
from mathutils import Euler, Matrix, Vector

_MATS = {}


def reset_scene():
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.armatures, bpy.data.actions,
                 bpy.data.lights, bpy.data.cameras):
        for b in list(coll):
            coll.remove(b)
    _MATS.clear()


def mat(name, rgb, rough=0.9, emit=None, strength=1.0):
    if name in _MATS:
        return _MATS[name]
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:
        pass
    bsdf = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Base Color'].default_value = (rgb[0], rgb[1], rgb[2], 1.0)
    bsdf.inputs['Roughness'].default_value = rough
    if emit is not None:
        bsdf.inputs['Emission Color'].default_value = (emit[0], emit[1], emit[2], 1.0)
        bsdf.inputs['Emission Strength'].default_value = strength
    m.diffuse_color = (rgb[0], rgb[1], rgb[2], 1.0)
    _MATS[name] = m
    return m


def empty(name, loc=(0, 0, 0), parent=None, rot_z=0.0):
    ob = bpy.data.objects.new(name, None)
    ob.empty_display_type = 'PLAIN_AXES'
    ob.empty_display_size = 0.15
    ob.location = loc
    ob.rotation_euler = (0, 0, rot_z)
    bpy.context.scene.collection.objects.link(ob)
    if parent:
        ob.parent = parent
    return ob


def obj(name, verts, faces, material=None, parent=None):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], faces)
    me.update()
    if material is not None:
        me.materials.append(material)
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    if parent:
        ob.parent = parent
    return ob


_BOX_FACES = [(0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]


def _box_verts(c0, c1):
    x0, y0, z0 = c0
    x1, y1, z1 = c1
    return [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
            (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]


def box(name, c0, c1, material=None, parent=None, origin=None):
    """Axis-aligned box from min corner c0 to max corner c1.
    origin: the object's pivot (for example a hinge); the box keeps its place in the room."""
    verts = _box_verts(c0, c1)
    if origin is not None:
        verts = [(v[0] - origin[0], v[1] - origin[1], v[2] - origin[2]) for v in verts]
    ob = obj(name, verts, _BOX_FACES, material, parent)
    if origin is not None:
        ob.location = origin
    return ob


def box_rot(name, center, size, euler_deg, material=None, parent=None):
    """Box of `size` centred at `center`, rotated about its own centre (degrees)."""
    h = (size[0] / 2, size[1] / 2, size[2] / 2)
    rot = Euler([math.radians(a) for a in euler_deg], 'XYZ').to_matrix()
    verts = [rot @ Vector(v) + Vector(center) for v in _box_verts((-h[0], -h[1], -h[2]), h)]
    return obj(name, verts, _BOX_FACES, material, parent)


def frustum(name, front, back, material=None, parent=None):
    """Box-like solid whose front rectangle (y0) and back rectangle (y1) differ in size.
    front/back: (cx, cz, half_w, half_h, y). Used for the CRT monitor."""
    fx, fz, fw, fh, fy = front
    bx, bz, bw, bh, by = back
    v = [(fx - fw, fy, fz - fh), (fx + fw, fy, fz - fh), (bx + bw, by, bz - bh), (bx - bw, by, bz - bh),
         (fx - fw, fy, fz + fh), (fx + fw, fy, fz + fh), (bx + bw, by, bz + bh), (bx - bw, by, bz + bh)]
    return obj(name, v, _BOX_FACES, material, parent)


def prism_xz(name, poly, y0, y1, material=None, parent=None):
    """Convex polygon given in (x, z) CCW (x right, z up), extruded from y0 to y1."""
    n = len(poly)
    verts = [(x, y0, z) for x, z in poly] + [(x, y1, z) for x, z in poly]
    faces = [tuple(range(n)), tuple(range(2 * n - 1, n - 1, -1))]
    for i in range(n):
        j = (i + 1) % n
        faces.append((i, n + i, n + j, j))
    return obj(name, verts, faces, material, parent)


def cylinder(name, center, radius, height, segs=8, axis='Z', material=None, parent=None):
    verts = []
    for z in (-height / 2, height / 2):
        for i in range(segs):
            a = 2 * math.pi * i / segs
            verts.append((radius * math.cos(a), radius * math.sin(a), z))
    faces = [tuple(range(segs - 1, -1, -1)), tuple(range(segs, 2 * segs))]
    for i in range(segs):
        j = (i + 1) % segs
        faces.append((i, j, segs + j, segs + i))
    rot = {'Z': Matrix.Identity(3), 'Y': Matrix.Rotation(math.radians(90), 3, 'X'),
           'X': Matrix.Rotation(math.radians(90), 3, 'Y')}[axis]
    verts = [rot @ Vector(v) + Vector(center) for v in verts]
    return obj(name, verts, faces, material, parent)


def sphere(name, center, radius, segs=8, rings=6, material=None, parent=None):
    verts = [(0, 0, radius)]
    for r in range(1, rings):
        phi = math.pi * r / rings
        for s in range(segs):
            th = 2 * math.pi * s / segs
            verts.append((radius * math.sin(phi) * math.cos(th), radius * math.sin(phi) * math.sin(th),
                          radius * math.cos(phi)))
    verts.append((0, 0, -radius))
    faces = []
    for s in range(segs):
        faces.append((0, 1 + (s + 1) % segs, 1 + s))
    for r in range(rings - 2):
        for s in range(segs):
            a = 1 + r * segs + s
            b = 1 + r * segs + (s + 1) % segs
            faces.append((a, b, b + segs, a + segs))
    last = len(verts) - 1
    base = 1 + (rings - 2) * segs
    for s in range(segs):
        faces.append((last, base + s, base + (s + 1) % segs))
    verts = [Vector(v) + Vector(center) for v in verts]
    return obj(name, verts, faces, material, parent)


def ring_xz(name, center, major, minor, segs=16, tube=6, material=None, parent=None):
    """Torus lying in the XZ plane (faces along Y): a round window frame."""
    cx, cy, cz = center
    verts = []
    for i in range(segs):
        a = 2 * math.pi * i / segs
        rad = Vector((math.cos(a), 0, math.sin(a)))
        for j in range(tube):
            b = 2 * math.pi * j / tube
            p = Vector(center) + rad * (major + minor * math.cos(b)) + Vector((0, minor * math.sin(b), 0))
            verts.append(p)
    faces = []
    for i in range(segs):
        i2 = (i + 1) % segs
        for j in range(tube):
            j2 = (j + 1) % tube
            faces.append((i * tube + j, i2 * tube + j, i2 * tube + j2, i * tube + j2))
    return obj(name, verts, faces, material, parent)


def ellipsoid(name, center, radii, segs=10, rings=7, material=None, parent=None):
    ob = sphere(name, (0, 0, 0), 1.0, segs, rings, material, parent)
    for v in ob.data.vertices:
        v.co = (v.co.x * radii[0] + center[0], v.co.y * radii[1] + center[1], v.co.z * radii[2] + center[2])
    ob.data.update()
    return ob


def soften(ob, width=0.03, segments=3, smooth=True):
    """Rounded edges (a Bevel modifier, applied on export) and smooth shading; flat faces stay flat."""
    mod = ob.modifiers.new("Bevel", 'BEVEL')
    mod.width = width
    mod.segments = segments
    mod.limit_method = 'ANGLE'
    try:
        mod.harden_normals = True
    except Exception:
        pass
    if smooth:
        me = ob.data
        try:
            me.shade_smooth()
        except Exception:
            for p in me.polygons:
                p.use_smooth = True
    return ob


def ring_xy(name, center, major, minor, segs=16, tube=6, material=None, parent=None):
    """Torus lying flat (in the XY plane): a coil of cable."""
    verts = []
    for i in range(segs):
        a = 2 * math.pi * i / segs
        rad = Vector((math.cos(a), math.sin(a), 0))
        for j in range(tube):
            b = 2 * math.pi * j / tube
            verts.append(Vector(center) + rad * (major + minor * math.cos(b)) + Vector((0, 0, minor * math.sin(b))))
    faces = []
    for i in range(segs):
        i2 = (i + 1) % segs
        for j in range(tube):
            j2 = (j + 1) % tube
            faces.append((i2 * tube + j, i * tube + j, i * tube + j2, i2 * tube + j2))
    return obj(name, verts, faces, material, parent)


def export_glb(path, animations=False, **extra):
    """Exports everything in the scene (each script starts with reset_scene())."""
    bpy.context.view_layer.update()
    kwargs = dict(filepath=path, export_format='GLB', use_selection=False, export_apply=True,
                  export_yup=True, export_cameras=False, export_lights=False,
                  export_animations=animations)
    kwargs.update(extra)
    bpy.ops.export_scene.gltf(**kwargs)
