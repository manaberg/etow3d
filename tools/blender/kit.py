"""Shared helpers for the character build scripts (build_mage.py, build_orcs.py).

Characters are made of rigid parts whose origins are the pivots the game animates
(see the Rig class in src/render/models.js): Body, Head, ArmL, ArmR, LegL and
LegR. Held items are modelled into the arm that holds them. Materials are named
by role (Skin, Cloth, Gem, ...) so the game can recolour and flash them; a mesh
using Gem or Glow is unlit in the game and gets a glow sprite.

Blender is Z-up with characters facing -Y; the glTF export turns that into
three.js Y-up facing +Z. Units are game units.
"""

import math
import os

import bmesh
import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
MODELS_DIR = os.path.join(ROOT, 'public', 'models')
BLEND_DIR = os.path.join(HERE, 'blend')

GLOWING = ('Gem', 'Glow')


def dim(hexv, k):
    """Scale an sRGB hex colour; the sprites' values wash out under the game's lights."""
    return ((min(255, int(((hexv >> 16) & 0xff) * k)) << 16) | (min(255, int(((hexv >> 8) & 0xff) * k)) << 8)
            | min(255, int((hexv & 0xff) * k)))


def _linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def materials(palette):
    mats = {}
    for name, hexv in palette.items():
        m = bpy.data.materials.new(name)
        rgb = [_linear(((hexv >> s) & 0xff) / 255) for s in (16, 8, 0)]
        m.diffuse_color = (*rgb, 1)
        m.use_nodes = True
        bsdf = m.node_tree.nodes.get('Principled BSDF')
        bsdf.inputs['Base Color'].default_value = (*rgb, 1)
        bsdf.inputs['Roughness'].default_value = 0.9
        if name in GLOWING:
            bsdf.inputs['Emission Color'].default_value = (*rgb, 1)
            bsdf.inputs['Emission Strength'].default_value = 2.0
        mats[name] = m
    return mats


def _xform(at, rot=(0, 0, 0), scale=(1, 1, 1)):
    return (Matrix.Translation(at) @ Matrix.Rotation(rot[2], 4, 'Z') @ Matrix.Rotation(rot[1], 4, 'Y')
            @ Matrix.Rotation(rot[0], 4, 'X') @ Matrix.Diagonal((*scale, 1)))


class Part:
    """Accumulates geometry for one rigid part; each piece gets a material slot.
    Coordinates passed to the shape methods are relative to the part's pivot."""

    def __init__(self, name, pivot):
        self.name = name
        self.pivot = Vector(pivot)
        self.bm = bmesh.new()
        self.slots = []

    def _claim(self, verts, mat_name, smooth):
        if mat_name not in self.slots:
            self.slots.append(mat_name)
        idx = self.slots.index(mat_name)
        for f in {f for v in verts for f in v.link_faces}:
            f.material_index = idx
            f.smooth = smooth
        return verts

    def lathe(self, mat_name, profile, segs=16, radial=None, sy=1.0, cap_top=False, cap_bottom=False,
              offset=(0, 0, 0), smooth=False, arc=None, dy=None, rot=(0, 0, 0)):
        """Revolve [(radius, z), ...] around Z. radial(angle, i) scales a ring's radius,
        dy[i] shifts a ring along Y, arc=(a0, a1) leaves it open (angle 0 faces front)."""
        m = _xform(offset, rot)
        rings = []
        full = arc is None
        a0, a1 = arc if arc else (0, 2 * math.pi)
        n = segs if full else segs + 1
        for i, (r, z) in enumerate(profile):
            ring = []
            for s in range(n):
                a = a0 + (a1 - a0) * s / segs
                k = radial(a, i) if radial else 1.0
                p = Vector((math.sin(a) * r * k, (dy[i] if dy else 0) - math.cos(a) * r * k * sy, z))
                ring.append(self.bm.verts.new(m @ p))
            rings.append(ring)
        for a, b in zip(rings, rings[1:]):
            for s in range(n if full else n - 1):
                t = (s + 1) % n
                self.bm.faces.new((a[s], a[t], b[t], b[s]))
        if cap_bottom and full:
            self.bm.faces.new(list(reversed(rings[0])))
        if cap_top and full:
            self.bm.faces.new(rings[-1])
        return self._claim([v for ring in rings for v in ring], mat_name, smooth)

    def sphere(self, mat_name, radius, at, scale=(1, 1, 1), segs=(12, 8), smooth=True, rot=(0, 0, 0)):
        res = bmesh.ops.create_uvsphere(self.bm, u_segments=segs[0], v_segments=segs[1], radius=radius,
                                        matrix=_xform(at, rot, scale))
        return self._claim(res['verts'], mat_name, smooth)

    def box(self, mat_name, size, at, rot=(0, 0, 0)):
        res = bmesh.ops.create_cube(self.bm, size=1.0, matrix=_xform(at, rot, size))
        return self._claim(res['verts'], mat_name, False)

    def cone(self, mat_name, r1, r2, depth, at, segs=8, rot=(0, 0, 0), scale=(1, 1, 1), smooth=False):
        """r1 at the bottom (-depth/2), r2 at the top."""
        res = bmesh.ops.create_cone(self.bm, cap_ends=True, cap_tris=False, segments=segs, radius1=r1,
                                    radius2=r2, depth=depth, matrix=_xform(at, rot, scale))
        return self._claim(res['verts'], mat_name, smooth)

    def prism(self, mat_name, outline, depth, at, rot=(0, 0, 0)):
        """Extrude a flat outline [(x, z), ...] (counter-clockwise seen from the front)
        by depth along Y: blades, crown spikes, plates."""
        m = _xform(at, rot)
        front = [self.bm.verts.new(m @ Vector((x, -depth / 2, z))) for x, z in outline]
        back = [self.bm.verts.new(m @ Vector((x, depth / 2, z))) for x, z in outline]
        self.bm.faces.new(front)
        self.bm.faces.new(list(reversed(back)))
        n = len(outline)
        for i in range(n):
            j = (i + 1) % n
            self.bm.faces.new((front[j], front[i], back[i], back[j]))
        return self._claim(front + back, mat_name, False)

    def merge(self, other, at=(0, 0, 0), rot=(0, 0, 0)):
        """Move another part's geometry into this one, placed by at/rot. Lets a held
        item be authored upright (grip at the origin, pointing up +Z) and then posed."""
        m = _xform(at, rot)
        vmap = {v: self.bm.verts.new(m @ v.co) for v in other.bm.verts}
        for f in other.bm.faces:
            nf = self.bm.faces.new([vmap[v] for v in f.verts])
            name = other.slots[f.material_index]
            if name not in self.slots:
                self.slots.append(name)
            nf.material_index = self.slots.index(name)
            nf.smooth = f.smooth
        other.bm.free()

    def build(self, mats):
        me = bpy.data.meshes.new(self.name)
        bmesh.ops.recalc_face_normals(self.bm, faces=self.bm.faces)
        self.bm.to_mesh(me)
        self.bm.free()
        for s in self.slots:
            me.materials.append(mats[s])
        ob = bpy.data.objects.new(self.name, me)
        ob.location = self.pivot
        bpy.context.collection.objects.link(ob)
        return ob


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def export(name, parts, palette):
    """Build the parts and write public/models/<name>.glb and tools/blender/blend/<name>.blend."""
    mats = materials(palette)
    objects = [p.build(mats) for p in parts]
    os.makedirs(MODELS_DIR, exist_ok=True)
    os.makedirs(BLEND_DIR, exist_ok=True)
    for ob in objects:
        ob.select_set(True)
    glb = os.path.join(MODELS_DIR, name + '.glb')
    bpy.ops.export_scene.gltf(filepath=glb, export_format='GLB', use_selection=True, export_apply=True,
                              export_yup=True, export_materials='EXPORT')
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(BLEND_DIR, name + '.blend'))
    print('EXPORTED', glb)


def preview(path, height=2.6):
    """Front, three-quarter, side and back renders, for checking against the sprite."""
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_WORKBENCH'
    scene.display.shading.light = 'STUDIO'
    scene.display.shading.color_type = 'MATERIAL'
    scene.display.shading.show_cavity = True
    scene.render.resolution_x = 360
    scene.render.resolution_y = 480
    world = bpy.data.worlds.new('World')
    world.color = (0.05, 0.05, 0.05)
    scene.world = world
    cam = bpy.data.objects.new('Cam', bpy.data.cameras.new('Cam'))
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = height * 1.35
    scene.collection.objects.link(cam)
    scene.camera = cam
    base, ext = os.path.splitext(path)
    for label, yaw in (('front', 0), ('three', -40), ('side', -90), ('back', 180)):
        a = math.radians(yaw)
        cam.location = (8 * math.sin(a), -8 * math.cos(a), height * 0.55)
        cam.rotation_euler = (math.radians(90), 0, a)
        scene.render.filepath = f'{base}_{label}{ext}'
        bpy.ops.render.render(write_still=True)


def cli_args(argv):
    """Arguments after `--`: [--preview DIR] [--only NAME ...]."""
    args = argv[argv.index('--') + 1:] if '--' in argv else []
    out = {'preview': None, 'only': []}
    i = 0
    while i < len(args):
        if args[i] == '--preview':
            out['preview'] = args[i + 1]
            i += 2
        elif args[i] == '--only':
            out['only'].append(args[i + 1])
            i += 2
        else:
            i += 1
    return out
