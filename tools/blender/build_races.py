"""Build the dwarves, humans and elves and export one model per race and class.

    blender --background --python tools/blender/build_races.py -- [--preview DIR] [--only LOOK ...]

Writes public/models/<race>_<class>.glb (for example dwarf_knight.glb) for every
look in RACE_LOOKS of src/render/models.js; see kit.py for the part and material
conventions. The classes are the orcs' seven (grunt, slinger, knight, shaman,
berserker, brute, warlock) so the three races fight with the same AI and fill
the same regiments; each race dresses them its own way. Cloth and Armor take
the army's colours in battles.

There are no sprites for these races in the 2D game: they follow the orcs'
chunky low-poly style. Dwarves are short and broad with big beards, humans
stand upright, elves are tall and slim with long ears and hair. Unlike the
orcs, the Head part's origin is the centre of the head.
"""

import math
import os
import sys

import bmesh
from mathutils import Matrix, Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402
from kit import Part, dim  # noqa: E402
from build_orcs import axe, hammer, staff  # noqa: E402

FORWARD = (math.pi / 2 + 0.35, 0, 0)  # melee weapons point forward, a little down
UPRIGHT = (0, 0, 0)  # staffs and spears

STEEL = dim(0xb6c5eb, 0.72)
GOLD = dim(0xb88f20, 0.95)
WOOD = 0x5a3e24
LEATHER = 0x5a3a2c
BOOT = 0x3a2a22

# Body proportions per race (game units; Blender Z-up, facing -Y).
#   leg: hip pivot height and half-spacing, thigh and ankle radius
#   torso: lathe profile [(radius, z), ...] from the hips to the neck, sy its depth
#   arm: shoulder pivot, arm length and radius
#   head: centre of the head, radius and scale
BUILDS = {
    'human': dict(leg_z=0.9, leg_x=0.17, leg_r=(0.13, 0.09), sy=0.62,
                  torso=[(0.27, 0.84), (0.29, 0.98), (0.27, 1.15), (0.33, 1.4), (0.38, 1.62), (0.38, 1.76),
                         (0.24, 1.88), (0.1, 1.94)],
                  arm=(0.47, 0, 1.76), arm_len=0.74, arm_r=0.1,
                  head=(0, -0.02, 2.17), head_r=0.19, head_s=(0.92, 0.98, 1.08), skin=dim(0xe0aa80, 0.85)),
    'dwarf': dict(leg_z=0.52, leg_x=0.2, leg_r=(0.17, 0.14), sy=0.74,
                  torso=[(0.38, 0.46), (0.43, 0.6), (0.48, 0.8), (0.5, 1.02), (0.53, 1.22), (0.46, 1.36),
                         (0.24, 1.44), (0.12, 1.48)],
                  arm=(0.57, 0, 1.28), arm_len=0.6, arm_r=0.14,
                  head=(0, -0.06, 1.63), head_r=0.22, head_s=(1.0, 1.0, 0.95), skin=dim(0xd89a74, 0.85)),
    'elf': dict(leg_z=1.02, leg_x=0.14, leg_r=(0.11, 0.075), sy=0.58,
                torso=[(0.24, 0.96), (0.25, 1.1), (0.21, 1.3), (0.26, 1.55), (0.31, 1.78), (0.31, 1.92),
                       (0.2, 2.04), (0.08, 2.1)],
                arm=(0.39, 0, 1.94), arm_len=0.82, arm_r=0.08,
                head=(0, -0.02, 2.33), head_r=0.17, head_s=(0.86, 0.94, 1.15), skin=dim(0xf0d0b0, 0.82)),
}


def hand_at(b):
    return (0, 0, -(b['arm_len'] + 0.06))


def base_palette(b, **extra):
    p = {'Skin': b['skin'], 'Eye': 0x1c1a20, 'Hair': 0x4a3020, 'Shirt': 0x7a6a50, 'Pants': 0x4a3e30,
         'Boot': BOOT, 'Leather': LEATHER, 'Metal': STEEL, 'Wood': WOOD, 'Gold': GOLD, 'Cloth': 0x8a2a2a,
         'Armor': 0x6a6e7a, 'Beard': 0x6a4a2a, 'Horn': 0xe0d4b8, 'String': 0xe0e0d0, 'Gem': 0x9fd8ff,
         'Paint': 0x8a1010}
    p.update(extra)
    return p


# ------------------------------------------------------------------ helpers

def rod(part, mat, p0, p1, r0, r1=None, segs=6):
    """A tapered cylinder from p0 to p1: bow limbs, strings, braids."""
    p0, p1 = Vector(p0), Vector(p1)
    d = p1 - p0
    rot = Vector((0, 0, 1)).rotation_difference(d.normalized()).to_matrix().to_4x4()
    m = Matrix.Translation((p0 + p1) / 2) @ rot
    res = bmesh.ops.create_cone(part.bm, cap_ends=True, cap_tris=False, segments=segs, radius1=r0,
                                radius2=r0 if r1 is None else r1, depth=d.length, matrix=m)
    return part._claim(res['verts'], mat, False)


def shell(part, mat, r, at, scale, open_face):
    """A sphere with the face cut out: hair caps and hoods. open_face(v) picks the
    vertices to drop, in the sphere's own coordinates."""
    vs = part.sphere(mat, r, at, scale=scale, segs=(16, 10))
    c = Vector(at)
    bmesh.ops.delete(part.bm, geom=[v for v in vs if open_face(v.co - c)], context='VERTS')


def hand(parts, side, item, b, rot, shift=(0, 0, 0)):
    h = hand_at(b)
    parts['Arm' + side].merge(item, (h[0] + shift[0], h[1] + shift[1], h[2] + shift[2]), rot)


# ------------------------------------------------------------------ bodies

def body(race, shirt='Shirt', legs='Pants', arms='Shirt', skirt=None, robe=None):
    """The bare figure every look of a race starts from: torso, legs and boots,
    arms with hands, and the race's head. skirt adds a short tunic skirt, robe a
    floor-length one (both in that material)."""
    b = BUILDS[race]
    sy = b['sy']
    torso = Part('Body', (0, 0, 0))
    torso.lathe(shirt, b['torso'], segs=16, sy=sy, cap_top=True, cap_bottom=True, smooth=True)
    top = b['torso'][-1][1]
    torso.lathe('Skin', [(b['head_r'] * 0.5, top - 0.06), (b['head_r'] * 0.45, top + 0.12)], segs=10,
                smooth=True)
    # shoulders
    ax, _, az = b['arm']
    for sx in (-1, 1):
        torso.sphere(shirt, b['arm_r'] * 1.6, (sx * (ax - b['arm_r'] * 0.4), 0, az - 0.02), scale=(1, 0.9, 0.85),
                     segs=(10, 6))
    hip_r, hip_z = b['torso'][0]
    torso.lathe('Leather', [(hip_r * 1.06, hip_z + 0.1), (hip_r * 1.06, hip_z + 0.18)], segs=16, sy=sy)
    torso.box('Gold', (0.09, 0.03, 0.07), (0, -hip_r * sy * 1.08, hip_z + 0.14))
    if skirt:
        torso.lathe(skirt, [(hip_r * 1.25, hip_z - b['leg_z'] * 0.45), (hip_r * 1.08, hip_z + 0.1)], segs=16,
                    sy=sy * 1.1, cap_bottom=True)
    if robe:
        torso.lathe(robe, [(min(hip_r * 1.9, 0.52), 0.02), (hip_r * 1.6, hip_z * 0.4), (hip_r * 1.25, hip_z * 0.8),
                           (hip_r * 1.08, hip_z + 0.12)], segs=18, sy=sy * 1.15, cap_bottom=True,
                    radial=lambda a, i: 1 + [0.05, 0.03, 0.01, 0][i] * math.cos(a * 7))
    parts = {'Body': torso}

    lz, lx = b['leg_z'], b['leg_x']
    rt, ra = b['leg_r']
    for side, sx in (('L', -1), ('R', 1)):
        leg = Part('Leg' + side, (sx * lx, 0, lz))
        leg.lathe(legs, [(ra, -lz + 0.18), (rt * 0.9, -lz * 0.5), (rt, -0.04), (rt * 0.9, 0.06)], segs=10,
                  cap_top=True, smooth=True)
        leg.box('Boot', (ra * 2.5, ra * 2 + 0.16, 0.22), (0, -0.06, -lz + 0.11))
        leg.lathe('Boot', [(ra * 1.15, -lz + 0.2), (ra * 1.2, -lz + min(0.42, lz * 0.55))], segs=10)
        parts['Leg' + side] = leg

        r = b['arm_r']
        L = b['arm_len']
        arm = Part('Arm' + side, (sx * ax, 0, az))
        arm.lathe(arms, [(r, 0.06), (r * 1.15, -0.12), (r * 1.05, -L * 0.5), (r * 0.9, -L * 0.9)], segs=10,
                  cap_top=True, smooth=True)
        arm.sphere('Skin', r * 0.95, hand_at(b), scale=(1, 1, 1.1), segs=(8, 6))
        parts['Arm' + side] = arm

    head = Part('Head', b['head'])
    hr = b['head_r']
    hs = b['head_s']
    head.sphere('Skin', hr, (0, 0, 0), scale=hs, segs=(14, 10))
    fy = -hr * hs[1]
    for sx in (-1, 1):
        head.sphere('Eye', hr * 0.13, (sx * hr * 0.38, fy * 0.86, hr * 0.12), segs=(6, 4))
    head.sphere('Skin', hr * 0.17, (0, fy * 1.02, -hr * 0.08), scale=(0.8, 1, 1.2), segs=(6, 4))
    if race == 'human':
        for sx in (-1, 1):
            head.sphere('Skin', hr * 0.2, (sx * hr * 0.92, 0, 0), scale=(0.5, 0.8, 1), segs=(6, 4))
    elif race == 'dwarf':
        # big nose, bushy brows, and the beard down to the belt
        head.sphere('Skin', hr * 0.3, (0, fy * 1.05, -hr * 0.08), scale=(0.9, 0.9, 1.1), segs=(8, 6))
        for sx in (-1, 1):
            head.box('Beard', (hr * 0.5, 0.06, 0.07), (sx * hr * 0.38, fy * 0.9, hr * 0.32), rot=(0, sx * 0.2, 0))
            head.sphere('Skin', hr * 0.2, (sx * hr * 0.98, 0, 0), scale=(0.5, 0.8, 1), segs=(6, 4))
        head.lathe('Beard', [(0.06, -0.92), (0.2, -0.75), (0.27, -0.45), (0.26, -0.2), (0.2, -0.04)], segs=12,
                   sy=0.48, offset=(0, fy * 0.82, 0), cap_top=True, cap_bottom=True, smooth=True)
        for sx in (-1, 1):
            head.cone('Beard', 0.05, 0.03, 0.22, (sx * 0.13, fy * 1.04, -0.15), segs=6, rot=(0, sx * 0.9, 0))
    elif race == 'elf':
        for sx in (-1, 1):
            # long ears swept back and up
            head.cone('Skin', 0.05, 0.0, 0.3, (sx * hr * 0.98, 0.04, 0.06), segs=5, rot=(-0.6, sx * 1.1, 0))
    parts['Head'] = head
    return parts, b


def hair(p, b, style='cap', mat='Hair'):
    """cap: short hair; long: down the back; bald: none."""
    h = p['Head']
    hr = b['head_r']
    hs = b['head_s']
    if style in ('cap', 'long'):
        shell(h, mat, hr * 1.08, (0, hr * 0.06, hr * 0.06), hs,
              lambda v: v.y < -hr * 0.35 and -hr * 1.1 < v.z < hr * 0.42)
    if style == 'long':
        h.lathe(mat, [(hr * 0.6, -hr * 4.4), (hr * 1.05, -hr * 3.2), (hr * 1.1, -hr * 1.6), (hr * 1.05, -hr * 0.2),
                      (hr * 0.8, hr * 0.6)], segs=12, sy=0.4, dy=[hr * 1.9, hr * 1.8, hr * 1.5, hr * 0.9, hr * 0.4],
                cap_top=True, cap_bottom=True, smooth=True)


def helm(p, b, kind, mat='Metal', crest=None):
    """kettle (brimmed), pot (round), horned, great (closed), cone (pointed),
    winged (tall, with wings)."""
    h = p['Head']
    hr = b['head_r']
    hs = b['head_s']
    top = hr * hs[2]
    if kind == 'great':
        h.lathe(mat, [(hr * 1.12, -top * 0.95), (hr * 1.14, 0), (hr * 1.1, top * 0.75), (hr * 0.7, top * 1.08)],
                segs=14, cap_top=True, cap_bottom=True, sy=hs[1])
        h.box('Eye', (hr * 1.4, 0.03, 0.045), (0, -hr * hs[1] * 1.15, top * 0.12))
        h.box(mat, (0.03, 0.03, top * 0.9), (0, -hr * hs[1] * 1.16, -top * 0.35))
    else:
        shell(h, mat, hr * 1.12, (0, hr * 0.04, hr * 0.1), (hs[0], hs[1], hs[2] * 0.95),
              lambda v: v.z < -hr * 0.05 or (v.y < -hr * 0.4 and v.z < hr * 0.3))
        h.lathe(mat, [(hr * 1.12, hr * 0.05), (hr * 1.13, hr * 0.16)], segs=16, sy=hs[1])
    if kind == 'kettle':
        h.lathe(mat, [(hr * 1.75, hr * 0.02), (hr * 1.1, hr * 0.2)], segs=16, sy=hs[1])
    elif kind == 'horned':
        h.box(mat, (0.04, 0.05, hr * 0.8), (0, -hr * 1.08, -hr * 0.05))
        for sx in (-1, 1):
            h.cone('Horn', 0.07, 0.0, 0.38, (sx * hr * 1.25, 0, hr * 0.55), segs=6, rot=(0, sx * 0.9, 0))
    elif kind == 'cone':
        h.cone(mat, hr * 1.0, 0.0, hr * 1.6, (0, hr * 0.04, hr * 1.3), segs=12)
        h.box(mat, (0.035, 0.04, hr * 0.85), (0, -hr * 1.1, -hr * 0.05))
    elif kind == 'winged':
        h.cone(mat, hr * 1.0, hr * 0.3, hr * 0.9, (0, hr * 0.1, hr * 0.95), segs=12, rot=(0.25, 0, 0))
        for sx in (-1, 1):
            h.prism(crest or mat, [(0, 0), (sx * 0.06, 0.32), (sx * 0.18, 0.46), (sx * 0.1, 0.2)][::sx], 0.03,
                    (sx * hr * 0.95, 0.02, hr * 0.3))
    if crest and kind != 'winged':
        h.prism(crest, [(-0.03, 0), (0.03, 0), (0.03, hr * 1.3), (-0.03, hr * 1.1)], hr * 2.0,
                (0, hr * 0.25, top * (1.08 if kind == 'great' else 0.95)))


def hood(p, b, mat):
    h = p['Head']
    hr = b['head_r']
    shell(h, mat, hr * 1.22, (0, hr * 0.1, hr * 0.08), b['head_s'],
          lambda v: v.y < -hr * 0.3 and -hr * 0.8 < v.z < hr * 0.5)
    h.cone(mat, hr * 0.7, 0.0, hr * 1.4, (0, hr * 0.85, hr * 0.5), segs=8, rot=(-0.9, 0, 0))


def cuirass(p, b, mat='Metal', z0=None, z1=None):
    """Plate over the chest and belly, a little proud of the torso."""
    prof = [(r * 1.08, z) for r, z in b['torso'][:-2] if (z0 is None or z >= z0) and (z1 is None or z <= z1)]
    p['Body'].lathe(mat, prof, segs=16, sy=b['sy'], smooth=True)


def tabard(p, b, mat='Cloth', length=None, emblem=None):
    """A heraldic tabard: front and back panels that follow the torso from the
    shoulders and hang free below the belt."""
    t = b['torso']
    hip_r, hip_z = t[0]
    sy = b['sy']
    L = length if length is not None else b['leg_z'] * 0.55
    prof = [(hip_r * 1.14, hip_z - L), (hip_r * 1.1, hip_z)] + [(r * 1.07, z) for r, z in t[1:-2]]
    for a in (0, math.pi):
        p['Body'].lathe(mat, prof, segs=6, sy=sy, arc=(a - 0.75, a + 0.75))
    if emblem:
        r, z = t[3]
        p['Body'].prism(emblem, [(-0.09, 0), (0.09, 0), (0.09, 0.12), (0, 0.22), (-0.09, 0.12)][::-1], 0.03,
                        (0, -(r * 1.07 * sy + 0.01), z - 0.1))


def pauldrons(p, b, mat='Armor', size=1.0):
    for side in ('L', 'R'):
        r = b['arm_r'] * 1.9 * size
        p['Arm' + side].sphere(mat, r, (0, 0, 0.04), scale=(1.1, 1.05, 0.7), segs=(10, 6))


def gauntlets(p, b, mat='Metal'):
    for side in ('L', 'R'):
        r = b['arm_r']
        L = b['arm_len']
        p['Arm' + side].lathe(mat, [(r * 1.05, -L * 0.62), (r * 1.25, -L * 0.92)], segs=10, cap_top=True)


def greaves(p, b, mat='Metal'):
    for side in ('L', 'R'):
        lz = b['leg_z']
        ra = b['leg_r'][1]
        p['Leg' + side].lathe(mat, [(ra * 1.35, -lz + 0.2), (ra * 1.45, -lz * 0.45), (b['leg_r'][0] * 1.15, -0.02)],
                              segs=10, smooth=True)


def back(p, b):
    """Where things hang on the back: (y of the back surface, chest z)."""
    chest_r, chest_z = b['torso'][-3]
    return chest_r * b['sy'], chest_z


# ------------------------------------------------------------------ held items

def sword(length=0.9, width=0.05, guard=0.28):
    w = Part('w', (0, 0, 0))
    w.lathe('Leather', [(0.035, -0.14), (0.035, 0.06)], segs=6, cap_top=True, cap_bottom=True)
    w.sphere('Gold', 0.05, (0, 0, -0.17), segs=(6, 4), smooth=False)
    w.box('Gold', (guard, 0.05, 0.05), (0, 0, 0.08))
    w.prism('Metal', [(-width, 0.1), (width, 0.1), (width * 0.9, length), (0, length + 0.14), (-width * 0.9, length)],
            0.025, (0, 0, 0))
    return w


def curved_blade(length=0.8):
    w = Part('w', (0, 0, 0))
    w.lathe('Leather', [(0.03, -0.12), (0.03, 0.06)], segs=6, cap_top=True, cap_bottom=True)
    w.box('Gold', (0.06, 0.16, 0.035), (0, 0, 0.07))
    pts = []
    for i in range(7):
        t = i / 6
        pts.append((0.035 + 0.12 * t * t, 0.09 + length * t))
    for i in range(6, -1, -1):
        t = i / 6
        pts.append((-0.03 + 0.12 * t * t + 0.06 * t, 0.09 + length * t))
    w.prism('Metal', pts[:7] + [(0.17, 0.09 + length + 0.08)] + pts[7:], 0.022, (0, 0, 0), rot=(0, 0, math.pi / 2))
    return w


def spear(length=2.2, blade='leaf'):
    w = Part('w', (0, 0, 0))
    w.lathe('Wood', [(0.035, -0.8), (0.03, length - 0.8)], segs=6, cap_top=True, cap_bottom=True)
    tip = length - 0.8
    if blade == 'glaive':
        w.prism('Metal', [(-0.03, tip - 0.05), (0.06, tip), (0.13, tip + 0.25), (0.1, tip + 0.5), (0.0, tip + 0.62),
                          (-0.03, tip + 0.3)], 0.025, (0, 0, 0), rot=(0, 0, math.pi / 2))
    else:
        w.prism('Metal', [(0, tip - 0.04), (0.07, tip + 0.12), (0, tip + 0.42), (-0.07, tip + 0.12)], 0.025,
                (0, 0, 0), rot=(0, 0, math.pi / 2))
    w.lathe('Gold', [(0.04, tip - 0.08), (0.04, tip)], segs=6)
    return w


def morningstar():
    w = Part('w', (0, 0, 0))
    w.lathe('Wood', [(0.04, -0.15), (0.035, 0.6)], segs=6, cap_top=True, cap_bottom=True)
    w.sphere('Metal', 0.13, (0, 0, 0.7), segs=(8, 6), smooth=False)
    for i in range(8):
        a = i / 8 * 2 * math.pi
        rod(w, 'Metal', (0, 0, 0.7), (math.cos(a) * 0.22, math.sin(a) * 0.22, 0.7 + (0.08 if i % 2 else -0.08)),
            0.035, 0.0, segs=4)
    w.cone('Metal', 0.04, 0.0, 0.16, (0, 0, 0.88), segs=4)
    return w


def round_shield(r=0.36, face='Armor', rim='Metal'):
    w = Part('w', (0, 0, 0))
    w.lathe(face, [(r, -0.025), (r, 0.025)], segs=16, cap_top=True, cap_bottom=True)
    w.lathe(rim, [(r + 0.02, -0.03), (r + 0.02, 0.035)], segs=16)
    w.sphere(rim, r * 0.25, (0, 0, 0.03), scale=(1, 1, 0.6), segs=(8, 5))
    return w


def kite_shield(h=0.9, wide=0.32, face='Armor', rim='Metal', emblem='Gold'):
    w = Part('w', (0, 0, 0))
    outline = [(-wide, h * 0.4), (-wide * 0.95, -h * 0.05), (-wide * 0.5, -h * 0.4), (0, -h * 0.6),
               (wide * 0.5, -h * 0.4), (wide * 0.95, -h * 0.05), (wide, h * 0.4), (0, h * 0.46)]
    w.prism(face, outline, 0.05, (0, 0, 0), rot=(-math.pi / 2, 0, 0))
    w.prism(emblem, [(-0.04, -0.2), (0.04, -0.2), (0.04, 0.25), (-0.04, 0.25)], 0.06, (0, 0, 0),
            rot=(-math.pi / 2, 0, 0))
    w.prism(emblem, [(-0.15, 0.06), (0.15, 0.06), (0.15, 0.13), (-0.15, 0.13)], 0.06, (0, 0, 0),
            rot=(-math.pi / 2, 0, 0))
    w.prism(rim, [(x * 1.06, z * 1.04) for x, z in outline], 0.03, (0, 0.01, 0), rot=(-math.pi / 2, 0, 0))
    return w


def leaf_shield(face='Armor'):
    w = Part('w', (0, 0, 0))
    outline = [(0, 0.5), (0.2, 0.3), (0.26, 0.0), (0.18, -0.3), (0, -0.55), (-0.18, -0.3), (-0.26, 0.0),
               (-0.2, 0.3)]
    w.prism(face, outline, 0.04, (0, 0, 0), rot=(-math.pi / 2, 0, 0))
    w.prism('Gold', [(-0.02, -0.45), (0.02, -0.45), (0.02, 0.42), (-0.02, 0.42)], 0.05, (0, 0, 0),
            rot=(-math.pi / 2, 0, 0))
    return w


def shield_on(p, b, item, lift=0.1):
    """Strap a shield (authored facing -Z) to the left forearm, facing forward."""
    hand(p, 'L', item, b, (math.pi / 2, 0, 0), shift=(0, -0.12, lift))


def bow(length=1.5, mat='Wood'):
    """A bow held upright in the left hand, limbs bowing forward, string behind."""
    w = Part('w', (0, 0, 0))
    half = length / 2
    pts = []
    for i in range(9):
        t = -1 + i / 4
        pts.append((0, -0.16 * (1 - t * t) - 0.03 * (1 - abs(t)), t * half))
    for a, c in zip(pts, pts[1:]):
        rod(w, mat, a, c, 0.03, 0.025)
    rod(w, 'String', pts[0], pts[-1], 0.006)
    w.lathe('Leather', [(0.04, -0.08), (0.04, 0.08)], segs=6, offset=(0, -0.19, 0))
    return w


def crossbow():
    """Held in the right hand, stock pointing forward."""
    w = Part('w', (0, 0, 0))
    w.box('Wood', (0.08, 0.7, 0.08), (0, -0.25, 0.05))
    w.box('Wood', (0.07, 0.1, 0.18), (0, 0.06, -0.04))
    for sx in (-1, 1):
        rod(w, 'Metal', (0, -0.55, 0.08), (sx * 0.34, -0.48, 0.08), 0.025, 0.018)
    rod(w, 'String', (-0.34, -0.48, 0.08), (0.34, -0.48, 0.08), 0.006)
    w.box('Metal', (0.02, 0.4, 0.02), (0, -0.4, 0.11))
    return w


def quiver(p, b, mat='Leather', fletch='Shirt'):
    by, cz = back(p, b)
    q = Part('w', (0, 0, 0))
    q.lathe(mat, [(0.08, -0.3), (0.09, 0.3)], segs=8, cap_bottom=True)
    for i in range(4):
        x = (i - 1.5) * 0.04
        q.lathe('Wood', [(0.012, 0.3), (0.012, 0.45)], segs=4, offset=(x, (i % 2) * 0.03, 0))
        q.box(fletch, (0.01, 0.05, 0.1), (x, (i % 2) * 0.03, 0.44))
    p['Body'].merge(q, (0.12, by + 0.08, cz - 0.15), (0, 0.35, 0))


def cape(p, b, mat='Cloth', length=None):
    by, cz = back(p, b)
    ax, _, az = b['arm']
    L = length or az * 0.75
    p['Body'].lathe(mat, [(ax * 0.75, az - L), (ax * 0.7, az - L * 0.5), (ax * 0.62, az - 0.02)], segs=14, sy=0.5,
                    arc=(math.pi * 0.62, math.pi * 1.38), dy=[by * 0.7 + 0.08, by * 0.5 + 0.06, by * 0.3 + 0.04])


# ------------------------------------------------------------------ humans

def human_grunt():
    """Man-at-arms: kettle hat, mail under a tabard, arming sword and round shield."""
    p, b = body('human', shirt='Mail', arms='Mail', skirt='Mail')
    hair(p, b, 'cap')
    helm(p, b, 'kettle')
    tabard(p, b, emblem='Gold')
    hand(p, 'R', sword(), b, FORWARD)
    shield_on(p, b, round_shield(0.34))
    return p, base_palette(b, Mail=dim(0x9aa0aa, 0.75), Cloth=0x2a4fa8, Armor=0x8a2a2a), 2.45


def human_slinger():
    """Archer: green hood, leather jerkin, longbow and a quiver."""
    p, b = body('human', shirt='Leather', skirt='Shirt')
    hair(p, b, 'cap')
    hood(p, b, 'Cloth')
    tabard(p, b, mat='Cloth', length=0.3)
    quiver(p, b, fletch='Gold')
    hand(p, 'L', bow(1.6), b, UPRIGHT)
    return p, base_palette(b, Cloth=0x3a6a30, Shirt=0x5a5a40, String=0xe0e0d0), 2.45


def human_knight():
    """Knight: full plate, a crested great helm, longsword and kite shield."""
    p, b = body('human', shirt='Metal', arms='Metal', legs='Metal')
    helm(p, b, 'great', crest='Cloth')
    tabard(p, b, emblem='Gold')
    pauldrons(p, b, 'Metal', 1.1)
    gauntlets(p, b)
    greaves(p, b)
    hand(p, 'R', sword(1.05, 0.05, 0.34), b, FORWARD)
    shield_on(p, b, kite_shield())
    return p, base_palette(b, Metal=dim(0xc4ccd8, 0.78), Cloth=0x2a4fa8, Armor=0x2a4fa8), 2.45


def human_shaman():
    """Priest: white robe with a coloured stole, tonsure, staff crowned with a sun."""
    p, b = body('human', shirt='Robe', arms='Robe', robe='Robe')
    hair(p, b, 'cap')
    by, cz = back(p, b)
    for sx in (-1, 1):
        p['Body'].box('Cloth', (0.1, 0.04, cz), (sx * 0.12, -(b['torso'][-3][0] * b['sy'] + 0.03), cz * 0.55))
    w = staff('knob', length=2.2, wood='Gold')
    tip = 2.2 - 1.0
    sun = [(math.sin(i / 16 * 2 * math.pi) * (0.22 if i % 2 == 0 else 0.12),
            tip + 0.2 + math.cos(i / 16 * 2 * math.pi) * (0.22 if i % 2 == 0 else 0.12)) for i in range(16)]
    w.prism('Gold', sun, 0.03, (0, 0, 0))
    w.sphere('Gem', 0.08, (0, 0, tip + 0.2), segs=(8, 6), smooth=False)
    hand(p, 'R', w, b, UPRIGHT)
    return p, base_palette(b, Robe=0xd8d0c0, Cloth=0x8a2a2a, Hair=0x7a5a3a, Gem=0xffe070), 2.45


def human_berserker():
    """Zealot: shaven head, bare arms, a ragged tabard, a morning star in each hand."""
    p, b = body('human', shirt='Leather', arms='Skin')
    tabard(p, b, length=0.45)
    p['Head'].box('Paint', (0.2, 0.03, 0.04), (0, -b['head_r'] * 1.02, b['head_r'] * 0.35))
    for side in ('L', 'R'):
        hand(p, side, morningstar(), b, FORWARD)
        p['Arm' + side].lathe('Leather', [(b['arm_r'] * 1.15, -0.5), (b['arm_r'] * 1.2, -0.68)], segs=8)
    return p, base_palette(b, Cloth=0xb01818, Paint=0x8a1010), 2.45


def human_brute():
    """Champion: heavy plate with a plume, a two-handed greatsword."""
    p, b = body('human', shirt='Metal', arms='Metal', legs='Metal')
    helm(p, b, 'pot', crest='Plume')
    p['Head'].box('Metal', (0.3, 0.04, 0.2), (0, -b['head_r'] * 1.08, -0.05))
    cuirass(p, b, 'Armor', z0=1.0)
    pauldrons(p, b, 'Metal', 1.35)
    gauntlets(p, b)
    greaves(p, b)
    cape(p, b, 'Cloth')
    hand(p, 'R', sword(1.5, 0.07, 0.46), b, FORWARD)
    return p, base_palette(b, Metal=dim(0xb0b6c0, 0.7), Armor=0x2a4fa8, Cloth=0x8a2a2a, Plume=0xe8e0d0), 2.45


def human_warlock():
    """Battlemage: hooded robe with a broad belt, staff with a fiery orb."""
    p, b = body('human', shirt='Cloth', arms='Cloth', robe='Cloth')
    hood(p, b, 'Cloth')
    p['Body'].lathe('Gold', [(b['torso'][0][0] * 1.2, b['torso'][0][1] + 0.08),
                             (b['torso'][0][0] * 1.2, b['torso'][0][1] + 0.22)], segs=16, sy=b['sy'])
    hand(p, 'R', staff('orb', length=2.3), b, UPRIGHT)
    return p, base_palette(b, Cloth=0x6a2a4a, Gem=0xffa040), 2.45


# ------------------------------------------------------------------ dwarves

def dwarf_grunt():
    """Warrior: horned helm, mail and a tunic, axe and round shield."""
    p, b = body('dwarf', shirt='Mail', skirt='Cloth')
    helm(p, b, 'horned')
    tabard(p, b, length=0.2)
    pauldrons(p, b, 'Armor', 0.9)
    hand(p, 'R', axe(double=False, length=0.85, blade=0.85), b, FORWARD)
    shield_on(p, b, round_shield(0.4), lift=0.2)
    return p, base_palette(b, Mail=dim(0x9aa0aa, 0.72), Cloth=0x2a6a4a, Beard=0x8a4a20, Horn=0xe8dcc0,
                           Armor=0x6a6e7a), 1.9


def dwarf_slinger():
    """Crossbowman: leather cap, quilted jerkin, a heavy crossbow and a bolt case."""
    p, b = body('dwarf', shirt='Shirt', skirt='Cloth')
    helm(p, b, 'pot', mat='Leather')
    tabard(p, b, length=0.15)
    quiver(p, b, fletch='Cloth')
    hand(p, 'R', crossbow(), b, (0, 0, 0))
    return p, base_palette(b, Shirt=0x8a7a5a, Cloth=0x6a4a2a, Beard=0xb07030, String=0xd0d0c0), 1.9


def dwarf_knight():
    """Ironclad: full plate, a face-masked helm, warhammer and a tower shield."""
    p, b = body('dwarf', shirt='Metal', arms='Metal', legs='Metal')
    helm(p, b, 'great', crest='Gold')
    tabard(p, b, length=0.2, emblem='Gold')
    pauldrons(p, b, 'Armor', 1.15)
    gauntlets(p, b)
    hand(p, 'R', hammer(length=0.9, head=(0.42, 0.24, 0.26)), b, FORWARD)
    shield_on(p, b, kite_shield(0.8, 0.34), lift=0.25)
    return p, base_palette(b, Metal=dim(0xa8b0bc, 0.75), Cloth=0x2a4fa8, Armor=0x8a2a2a, Beard=0x5a3a20), 1.9


def dwarf_shaman():
    """Runepriest: robe, gold-braided white beard, staff with a glowing rune stone."""
    p, b = body('dwarf', shirt='Cloth', arms='Cloth', robe='Cloth')
    hair(p, b, 'cap', mat='Beard')
    h = p['Head']
    for z in (-0.4, -0.65):
        h.lathe('Gold', [(0.2 if z > -0.5 else 0.15, z), (0.2 if z > -0.5 else 0.15, z + 0.05)], segs=12, sy=0.48,
                offset=(0, -b['head_r'] * 0.82, 0))
    w = staff('knob', length=1.8)
    w.box('Gem', (0.16, 0.08, 0.22), (0, 0, 0.95))
    hand(p, 'R', w, b, UPRIGHT, shift=(0, 0, 0.38))
    return p, base_palette(b, Cloth=0x3a4a7a, Beard=0xe0dcd0, Gem=0x60ffd0), 1.9


def dwarf_berserker():
    """Slayer: bare-chested and tattooed, a towering orange crest, two axes."""
    p, b = body('dwarf', shirt='Skin', arms='Skin', skirt='Cloth')
    h = p['Head']
    hr = b['head_r']
    for i in range(5):
        h.cone('Hair', 0.07, 0.0, 0.45, (0, -hr * 0.6 + i * hr * 0.35, hr * 1.1 + 0.15), segs=5)
    for sx in (-1, 1):
        p['Body'].box('Paint', (0.06, 0.04, 0.5), (sx * 0.22, -0.4, 1.0), rot=(0, sx * 0.4, 0))
    for side in ('L', 'R'):
        hand(p, side, axe(double=False, length=0.7, blade=0.75), b, FORWARD)
        p['Arm' + side].lathe('Gold', [(b['arm_r'] * 1.1, -0.42), (b['arm_r'] * 1.12, -0.5)], segs=8)
    return p, base_palette(b, Cloth=0x6a2a1a, Hair=0xff6a10, Beard=0xff7a20, Paint=0x2a4aa0), 1.9


def dwarf_brute():
    """Ironbreaker: heavy gromril plate head to toe, a great two-handed hammer."""
    p, b = body('dwarf', shirt='Metal', arms='Metal', legs='Metal')
    helm(p, b, 'horned')
    cuirass(p, b, 'Armor', z0=0.7)
    pauldrons(p, b, 'Metal', 1.3)
    gauntlets(p, b)
    greaves(p, b)
    hand(p, 'R', hammer(length=1.2, head=(0.62, 0.34, 0.36), bands='Gold'), b, FORWARD)
    return p, base_palette(b, Metal=dim(0x8a9098, 0.8), Armor=0x8a2a2a, Beard=0x3a2a20, Horn=0xd8ccb0), 1.9


def dwarf_warlock():
    """Runesmith: leather apron over the robe, a rune hammer that burns."""
    p, b = body('dwarf', shirt='Cloth', arms='Cloth', skirt='Cloth')
    helm(p, b, 'pot', mat='Gold')
    hip_r, hip_z = b['torso'][0]
    p['Body'].box('Leather', (0.5, 0.04, 0.85), (0, -(b['torso'][2][0] * b['sy'] + 0.05), hip_z + 0.15))
    w = hammer(length=1.3, head=(0.36, 0.22, 0.24), bands='Gold')
    w.box('Gem', (0.04, 0.1, 0.12), (0.19, 0, 1.3))
    w.box('Gem', (0.04, 0.1, 0.12), (-0.19, 0, 1.3))
    hand(p, 'R', w, b, UPRIGHT)
    return p, base_palette(b, Cloth=0x7a3a2a, Beard=0x9a9a94, Gem=0xff8a20), 1.9


# ------------------------------------------------------------------ elves

def elf_grunt():
    """Spearman: tall pointed helm, scale shirt under a tabard, spear and leaf shield."""
    p, b = body('elf', shirt='Mail', arms='Shirt', skirt='Cloth')
    hair(p, b, 'long')
    helm(p, b, 'cone')
    tabard(p, b, length=0.5)
    hand(p, 'R', spear(2.4), b, UPRIGHT)
    shield_on(p, b, leaf_shield())
    return p, base_palette(b, Mail=dim(0xc8d0d8, 0.78), Shirt=0x2a5a4a, Cloth=0x2a6a5a, Hair=0xe8d890,
                           Armor=0x2a6a5a), 2.6


def elf_slinger():
    """Archer: green cloak and hood, a long recurved bow and a quiver."""
    p, b = body('elf', shirt='Shirt', skirt='Shirt')
    hair(p, b, 'long')
    hood(p, b, 'Cloth')
    cape(p, b, 'Cloth')
    quiver(p, b, fletch='Gold')
    hand(p, 'L', bow(1.9, mat='Bow'), b, UPRIGHT)
    return p, base_palette(b, Shirt=0x5a6a3a, Cloth=0x2a5a2a, Hair=0xb8a070, Bow=0xd8c080, String=0xe8e8e0), 2.6


def elf_knight():
    """Blade knight: silver plate, a winged helm, glaive and leaf shield."""
    p, b = body('elf', shirt='Metal', arms='Metal', legs='Metal')
    hair(p, b, 'long')
    helm(p, b, 'winged', crest='Armor')
    tabard(p, b, length=0.55, emblem='Gold')
    pauldrons(p, b, 'Armor', 1.05)
    greaves(p, b)
    hand(p, 'R', spear(2.4, blade='glaive'), b, FORWARD)
    shield_on(p, b, leaf_shield('Metal'))
    return p, base_palette(b, Metal=dim(0xdce4ec, 0.82), Cloth=0x2a4fa8, Armor=0x2a4fa8, Hair=0xf0e8c0), 2.6


def elf_shaman():
    """Druid: a green robe, a crown of branches, a living staff with a green glow."""
    p, b = body('elf', shirt='Cloth', arms='Cloth', robe='Cloth')
    hair(p, b, 'long')
    h = p['Head']
    hr = b['head_r']
    h.lathe('Wood', [(hr * 1.08, hr * 0.5), (hr * 1.08, hr * 0.62)], segs=14, sy=b['head_s'][1])
    for sx in (-1, 1):
        rod(h, 'Wood', (sx * hr * 0.6, 0, hr * 0.62), (sx * hr * 1.3, 0.02, hr * 1.9), 0.025, 0.012)
        rod(h, 'Wood', (sx * hr * 1.0, 0.01, hr * 1.25), (sx * hr * 0.5, 0.02, hr * 2.0), 0.018, 0.008)
        h.sphere('Leaf', 0.05, (sx * hr * 1.2, -0.02, hr * 0.7), scale=(1, 0.4, 1.4), segs=(6, 4))
    w = Part('w', (0, 0, 0))
    w.lathe('Wood', [(0.045, -1.0), (0.04, 1.0), (0.05, 1.15)], segs=6, cap_bottom=True,
            radial=lambda a, i: 1 + 0.15 * math.sin(a * 3 + i))
    for sx in (-1, 1):
        rod(w, 'Wood', (0, 0, 1.1), (sx * 0.14, 0, 1.4), 0.03, 0.012)
        w.sphere('Leaf', 0.06, (sx * 0.1, -0.02, 1.2), scale=(1, 0.4, 1.5), segs=(6, 4))
    w.sphere('Gem', 0.08, (0, 0, 1.3), segs=(8, 6), smooth=False)
    hand(p, 'R', w, b, UPRIGHT)
    return p, base_palette(b, Cloth=0x3a6a2a, Hair=0x8a5a30, Leaf=0x4a9a30, Gem=0x9fff60), 2.6


def elf_berserker():
    """Wardancer: light clothes, a long braid, war paint, a curved blade in each hand."""
    p, b = body('elf', shirt='Skin', arms='Skin', skirt='Cloth')
    h = p['Head']
    hr = b['head_r']
    hair(p, b, 'cap')
    for i in range(5):
        h.sphere('Hair', hr * 0.32, (0, hr * 0.9 + i * 0.015, -hr * 0.2 - i * hr * 0.55), segs=(6, 4))
    for sx in (-1, 1):
        h.box('Paint', (0.04, 0.03, 0.2), (sx * hr * 0.4, -hr * 0.95, -hr * 0.1))
        p['Body'].box('Paint', (0.04, 0.03, 0.45), (sx * 0.14, -0.3, 1.6), rot=(0, sx * 0.35, 0))
    p['Body'].lathe('Cloth', [(0.29, 1.62), (0.31, 1.78)], segs=14, sy=b['sy'])
    for side in ('L', 'R'):
        hand(p, side, curved_blade(0.75), b, FORWARD)
    return p, base_palette(b, Cloth=0x6a2a6a, Hair=0xd04040, Paint=0x2a8aa0), 2.6


def elf_brute():
    """Sentinel: tall ornate plate, a high crested helm, a great two-handed glaive."""
    p, b = body('elf', shirt='Metal', arms='Metal', legs='Metal')
    helm(p, b, 'cone', crest='Armor')
    cuirass(p, b, 'Armor', z0=1.3)
    pauldrons(p, b, 'Metal', 1.4)
    gauntlets(p, b)
    greaves(p, b)
    cape(p, b, 'Cloth')
    w = spear(2.7, blade='glaive')
    w.lathe('Gold', [(0.045, 0.5), (0.045, 0.6)], segs=6)
    hand(p, 'R', w, b, FORWARD)
    return p, base_palette(b, Metal=dim(0xd0c890, 0.8), Armor=0x2a6a5a, Cloth=0x2a6a5a), 2.6


def elf_warlock():
    """Sorcerer: a high-collared violet robe, silver circlet, a crystal staff."""
    p, b = body('elf', shirt='Cloth', arms='Cloth', robe='Cloth')
    hair(p, b, 'long')
    h = p['Head']
    hr = b['head_r']
    h.lathe('Gold', [(hr * 0.98, hr * 0.38), (hr * 0.98, hr * 0.5)], segs=14, sy=b['head_s'][1])
    h.sphere('Gem', 0.03, (0, -hr * 0.98, hr * 0.45), segs=(6, 4), smooth=False)
    ax, _, az = b['arm']
    p['Body'].lathe('Cloth', [(0.3, az - 0.05), (0.36, az + 0.25)], segs=14, sy=0.7, arc=(math.pi * 0.55, math.pi * 1.45))
    w = staff('knob', length=2.4, wood='Gold')
    w.cone('Gem', 0.08, 0.0, 0.32, (0, 0, 1.62), segs=6)
    w.cone('Gem', 0.08, 0.0, 0.14, (0, 0, 1.39), segs=6, rot=(math.pi, 0, 0))
    hand(p, 'R', w, b, UPRIGHT)
    return p, base_palette(b, Cloth=0x4a2a8a, Hair=0xe8e8f0, Gem=0x60e0ff), 2.6


LOOKS = {f.__name__: f for f in (
    human_grunt, human_slinger, human_knight, human_shaman, human_berserker, human_brute, human_warlock,
    dwarf_grunt, dwarf_slinger, dwarf_knight, dwarf_shaman, dwarf_berserker, dwarf_brute, dwarf_warlock,
    elf_grunt, elf_slinger, elf_knight, elf_shaman, elf_berserker, elf_brute, elf_warlock)}

if __name__ == '__main__':
    args = kit.cli_args(sys.argv)
    for name, make in LOOKS.items():
        if args['only'] and not any(name == o or name.startswith(o + '_') for o in args['only']):
            continue
        kit.reset()
        parts, pal, height = make()
        kit.export(name, list(parts.values()), pal)
        if args['preview']:
            kit.preview(os.path.join(args['preview'], name + '.png'), height=height)
