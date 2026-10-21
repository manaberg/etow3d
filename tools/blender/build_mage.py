"""Build the wizard model from the eotw sprite (media/mage_plain.png) and export it.

    blender --background --python tools/blender/build_mage.py -- [--preview out.png]

Writes public/models/mage.glb and tools/blender/mage.blend. The model is split
into rigid parts whose origins are the pivots the game animates (see buildMage in
src/render/models.js): Body, Head, ArmL, ArmR, LegL, LegR and Staff (held by ArmR).
Materials are named by role so the game can recolour them (duel wizard, mirror
images) and flash them on hits.

Blender is Z-up with the wizard facing -Y; the glTF export turns that into
three.js Y-up facing +Z. Units are game units (the mage is about 2.6 tall).
"""

import math
import os
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
GLB_PATH = os.path.join(ROOT, 'public', 'models', 'mage.glb')
BLEND_PATH = os.path.join(HERE, 'mage.blend')

# Palette sampled from mage_plain.png.
PALETTE = {
    'Robe': 0x8b8b8b,
    'RobeShade': 0x606060,
    'Mantle': 0xbbbcbc,
    'Trim': 0xd8b040,
    'Skin': 0xf4ac78,
    'Hair': 0xddddd3,
    'Beard': 0xf6f6f2,
    'Eye': 0x1c1d1c,
    'Leather': 0x8a5a30,
    'Boot': 0x4a3020,
    'Wood': 0x7c7553,
    'Gem': 0x9fd8ff,
}


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def material(name):
    m = bpy.data.materials.new(name)
    hexv = PALETTE[name]
    rgb = [srgb_to_linear(((hexv >> s) & 0xff) / 255) for s in (16, 8, 0)]
    m.diffuse_color = (*rgb, 1)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*rgb, 1)
    bsdf.inputs['Roughness'].default_value = 0.9
    if name == 'Gem':
        bsdf.inputs['Emission Color'].default_value = (*rgb, 1)
        bsdf.inputs['Emission Strength'].default_value = 2.0
    return m


class Part:
    """Accumulates geometry for one rigid part; each piece gets a material slot."""

    def __init__(self, name, pivot):
        self.name = name
        self.pivot = Vector(pivot)
        self.bm = bmesh.new()
        self.slots = []
        self.smooth = set()

    def _slot(self, mat_name):
        if mat_name not in self.slots:
            self.slots.append(mat_name)
        return self.slots.index(mat_name)

    def _claim(self, verts, mat_name, smooth):
        faces = {f for v in verts for f in v.link_faces}
        idx = self._slot(mat_name)
        for f in faces:
            f.material_index = idx
            f.smooth = smooth
        return faces

    # Coordinates below are relative to the part's pivot.
    def lathe(self, mat_name, profile, segs=16, radial=None, sy=1.0, cap_top=False, cap_bottom=False,
              offset=(0, 0, 0), smooth=False, arc=None, dy=None):
        """Revolve [(radius, z), ...] around Z. radial(angle, i) scales a ring's radius,
        dy[i] shifts a ring along Y."""
        rings = []
        full = arc is None
        a0, a1 = arc if arc else (0, 2 * math.pi)
        n = segs if full else segs + 1
        for i, (r, z) in enumerate(profile):
            ring = []
            for s in range(n):
                a = a0 + (a1 - a0) * s / segs
                k = radial(a, i) if radial else 1.0
                ring.append(self.bm.verts.new((
                    offset[0] + math.sin(a) * r * k,
                    offset[1] + (dy[i] if dy else 0) - math.cos(a) * r * k * sy,
                    offset[2] + z,
                )))
            rings.append(ring)
        for a, b in zip(rings, rings[1:]):
            for s in range(n if full else n - 1):
                t = (s + 1) % n
                self.bm.faces.new((a[s], a[t], b[t], b[s]))
        if cap_bottom and full:
            self.bm.faces.new(list(reversed(rings[0])))
        if cap_top and full:
            self.bm.faces.new(rings[-1])
        verts = [v for ring in rings for v in ring]
        self._claim(verts, mat_name, smooth)
        return verts

    def sphere(self, mat_name, radius, at, scale=(1, 1, 1), segs=(12, 8), smooth=True):
        m = Matrix.Translation(at) @ Matrix.Diagonal((*scale, 1))
        res = bmesh.ops.create_uvsphere(self.bm, u_segments=segs[0], v_segments=segs[1], radius=radius, matrix=m)
        self._claim(res['verts'], mat_name, smooth)
        return res['verts']

    def box(self, mat_name, size, at, rot=(0, 0, 0)):
        m = (Matrix.Translation(at) @ Matrix.Rotation(rot[2], 4, 'Z') @ Matrix.Rotation(rot[1], 4, 'Y')
             @ Matrix.Rotation(rot[0], 4, 'X') @ Matrix.Diagonal((*size, 1)))
        res = bmesh.ops.create_cube(self.bm, size=1.0, matrix=m)
        self._claim(res['verts'], mat_name, False)
        return res['verts']

    def cone(self, mat_name, r1, r2, depth, at, segs=8, rot=(0, 0, 0), scale=(1, 1, 1), smooth=False):
        m = (Matrix.Translation(at) @ Matrix.Rotation(rot[2], 4, 'Z') @ Matrix.Rotation(rot[0], 4, 'X')
             @ Matrix.Diagonal((*scale, 1)))
        res = bmesh.ops.create_cone(self.bm, cap_ends=True, cap_tris=False, segments=segs,
                                    radius1=r1, radius2=r2, depth=depth, matrix=m)
        self._claim(res['verts'], mat_name, smooth)
        return res['verts']

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


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    mats = {name: material(name) for name in PALETTE}
    parts = []

    # ---------------------------------------------------------------- body
    # Long grey robe flaring to the floor, with fold ridges like the sprite's
    # vertical highlight stripes, a pale shoulder mantle, belt and chest pouch.
    body = Part('Body', (0, 0, 0))

    def folds(a, i):
        # deeper folds near the hem, none at the waist
        depth = [0.07, 0.05, 0.02, 0, 0, 0, 0][i]
        return 1 + depth * math.cos(a * 8)

    body.lathe('Robe', [(0.66, 0.02), (0.62, 0.3), (0.52, 0.8), (0.42, 1.25), (0.38, 1.4), (0.41, 1.62),
                        (0.36, 1.86)], segs=24, radial=folds, sy=0.85, cap_bottom=True)
    body.lathe('RobeShade', [(0.67, 0.0), (0.68, 0.07)], segs=24, radial=lambda a, i: 1 + 0.07 * math.cos(a * 8),
               sy=0.85)
    body.lathe('Leather', [(0.42, 1.28), (0.43, 1.36)], segs=16, sy=0.85)
    body.box('Trim', (0.09, 0.03, 0.08), (0, -0.375, 1.32))
    # pouch held at the chest (the brown patch under the beard)
    body.box('Leather', (0.2, 0.12, 0.2), (0, -0.4, 1.47), rot=(0.15, 0, 0))
    body.box('Boot', (0.22, 0.04, 0.03), (0, -0.465, 1.55))
    # mantle: a short cape over the shoulders, open at the front under the beard
    body.lathe('Mantle', [(0.62, 1.58), (0.58, 1.72), (0.46, 1.9), (0.24, 2.0)], segs=20, sy=0.8,
               radial=lambda a, i: 1 + (0.04 * math.cos(a * 5) if i == 0 else 0), arc=(0.4, 2 * math.pi - 0.4))
    body.lathe('RobeShade', [(0.2, 1.96), (0.2, 2.06)], segs=12, sy=0.85)
    parts.append(body)

    # ---------------------------------------------------------------- legs
    for side, x in (('L', -0.2), ('R', 0.2)):
        leg = Part('Leg' + side, (x, 0, 0.5))
        leg.box('Boot', (0.2, 0.32, 0.16), (0, -0.1, -0.42))
        leg.box('Boot', (0.17, 0.17, 0.2), (0, 0, -0.3))
        parts.append(leg)

    # ---------------------------------------------------------------- arms
    # Wide wizard sleeves that flare at the cuff, hands poking out.
    for side, x in (('L', -0.46), ('R', 0.46)):
        arm = Part('Arm' + side, (x, 0, 1.86))
        arm.lathe('Robe', [(0.12, 0.04), (0.15, -0.2), (0.17, -0.5), (0.22, -0.66)], segs=10, cap_top=True)
        arm.lathe('RobeShade', [(0.22, -0.66), (0.2, -0.7), (0.12, -0.68)], segs=10)
        arm.sphere('Skin', 0.1, (0, 0, -0.76), scale=(1, 1, 1.15), segs=(8, 6))
        parts.append(arm)

    # ---------------------------------------------------------------- head
    # Peach face framed by white hair that falls down the back to the waist,
    # bushy brows, long pointed beard, gold circlet with a gem on the brow.
    head = Part('Head', (0, 0, 2.2))
    head.sphere('Skin', 0.23, (0, 0, 0), scale=(0.95, 0.9, 1.05), segs=(14, 10))
    head.sphere('Skin', 0.045, (0, -0.225, -0.02), segs=(6, 4))
    for ex in (-0.085, 0.085):
        head.sphere('Eye', 0.032, (ex, -0.205, 0.03), segs=(6, 4))
        head.box('Hair', (0.11, 0.05, 0.04), (ex, -0.215, 0.085), rot=(0, 0, 0))
    # hair cap: a shell over the top and back, open over the face
    cap = head.sphere('Hair', 0.27, (0, 0.02, 0.03), scale=(1, 1, 1.05), segs=(16, 10))
    doomed = [v for v in cap if v.co.y < -0.06 and v.co.z < 0.13 and v.co.z > -0.3]
    bmesh.ops.delete(head.bm, geom=doomed, context='VERTS')
    # long hair down the back
    head.lathe('Hair', [(0.18, -1.0), (0.27, -0.85), (0.3, -0.55), (0.29, -0.25), (0.26, 0.0), (0.2, 0.18)],
               segs=14, sy=0.4, dy=[0.4, 0.42, 0.4, 0.3, 0.18, 0.08], cap_top=True, cap_bottom=True,
               smooth=True)
    # side locks framing the face
    for sx in (-1, 1):
        head.cone('Hair', 0.03, 0.07, 0.3, (sx * 0.19, -0.04, -0.12), segs=6, smooth=True)
    # moustache and beard
    head.sphere('Beard', 0.1, (0, -0.215, -0.075), scale=(1.5, 0.5, 0.45), segs=(10, 6))
    for sx in (-1, 1):
        head.cone('Beard', 0.03, 0.05, 0.16, (sx * 0.12, -0.2, -0.12), segs=6, rot=(0.0, 0, 0), smooth=True)
    head.cone('Beard', 0.02, 0.22, 0.72, (0, -0.3, -0.4), segs=10, rot=(-0.3, 0, 0), scale=(1, 0.55, 1),
              smooth=True)
    head.cone('Beard', 0.01, 0.12, 0.4, (0, -0.4, -0.62), segs=8, rot=(-0.3, 0, 0), scale=(1, 0.5, 1),
              smooth=True)
    # circlet: the gold band across the brow in the sprite
    head.lathe('Trim', [(0.245, 0.12), (0.245, 0.155)], segs=18, sy=0.95)
    head.sphere('Gem', 0.03, (0, -0.24, 0.14), segs=(6, 4), smooth=False)
    parts.append(head)

    # ---------------------------------------------------------------- staff
    # Tall plain staff from the sprite, gripped by the right hand. Its pivot is
    # the hand; the game hangs it off the ArmR pivot.
    staff = Part('Staff', (0.46, 0, 1.86 - 0.76))
    staff.lathe('Wood', [(0.04, -1.08), (0.035, 0.3), (0.03, 1.32)], segs=6, cap_top=True, cap_bottom=True)
    staff.lathe('Wood', [(0.03, 1.32), (0.06, 1.38), (0.07, 1.46), (0.05, 1.52)], segs=6)
    staff.sphere('Gem', 0.07, (0, 0, 1.56), segs=(6, 4), smooth=False)
    staff.lathe('Leather', [(0.048, 0.12), (0.048, -0.12)], segs=6)
    parts.append(staff)

    return [p.build(mats) for p in parts]


def export(objects):
    os.makedirs(os.path.dirname(GLB_PATH), exist_ok=True)
    for ob in objects:
        ob.select_set(True)
    bpy.ops.export_scene.gltf(filepath=GLB_PATH, export_format='GLB', use_selection=True,
                              export_apply=True, export_yup=True, export_materials='EXPORT')
    bpy.ops.wm.save_as_mainfile(filepath=BLEND_PATH)


def preview(path):
    """Front, three-quarter and back renders side by side, for checking against the sprite."""
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_WORKBENCH'
    scene.display.shading.light = 'STUDIO'
    scene.display.shading.color_type = 'MATERIAL'
    scene.display.shading.show_cavity = True
    scene.render.resolution_x = 480
    scene.render.resolution_y = 640
    scene.render.film_transparent = False
    world = bpy.data.worlds.new('World')
    world.color = (0.05, 0.05, 0.05)
    scene.world = world
    cam = bpy.data.objects.new('Cam', bpy.data.cameras.new('Cam'))
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = 3.4
    scene.collection.objects.link(cam)
    scene.camera = cam
    base, ext = os.path.splitext(path)
    shots = []
    for label, yaw in (('front', 0), ('three', -40), ('side', -90), ('back', 180)):
        a = math.radians(yaw)
        cam.location = (math.sin(a) * -8 * -1, -math.cos(a) * 8, 1.55)
        cam.rotation_euler = (math.radians(90), 0, a)
        out = f'{base}_{label}{ext}'
        scene.render.filepath = out
        bpy.ops.render.render(write_still=True)
        shots.append(out)
    print('PREVIEW', ' '.join(shots))


if __name__ == '__main__':
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    objs = build()
    export(objs)
    print('EXPORTED', GLB_PATH)
    if '--preview' in argv:
        preview(argv[argv.index('--preview') + 1])
