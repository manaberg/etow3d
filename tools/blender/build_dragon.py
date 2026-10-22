"""Build the dragon and export it: one young body and one old, horned wyrm.

    blender --background --python tools/blender/build_dragon.py -- [--preview DIR] [--only dragon|wyrm]

Writes public/models/dragon.glb (wyrmlings to adults) and public/models/wyrm.glb
(ancients and the great golden wyrm), see kit.py for the conventions. Dragons
are not humanoid, so they have their own rig (DragonRig in src/render/models.js)
and their own parts, each with its origin on the joint the game turns it about:

    Body      torso and neck (breathes)
    Head      skull, upper jaw, horns (lunges and rears)
    Jaw       lower jaw (opens to bite and breathe)
    WingL/R   arm, fingers and membrane (fold, spread and flap)
    Tail      root half of the tail, TailTip the rest (sway)
    LegFL/FR/BL/BR  legs (walk in diagonal pairs)

Every colour of dragon shares the model: the game recolours Scale, Belly, Wing,
Horn, Spine and Eye. Modelled at wyrmling size; the game scales each age.
"""

import math
import os
import sys

import bmesh
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402
from kit import Part  # noqa: E402
from build_races import rod  # noqa: E402

PALETTE = {
    'Scale': 0xa01810,
    'Belly': 0xe0a040,
    'Wing': 0x701010,
    'Horn': 0x2a1a10,
    'Spine': 0x5a0a08,
    'Claw': 0x1a1410,
    'Tooth': 0xf0ead8,
    'Mouth': 0x400808,
    'Eye': 0xffd040,
}

# joints (Blender coordinates: facing -Y, Z up)
HEAD = (0, -1.8, 2.15)
JAW = (0, -1.9, 2.02)
WING = (0.36, -0.4, 1.5)
TAIL = (0, 1.0, 0.95)
TAIL_DOWN = -math.pi / 2 - 0.25
TAIL_LEN = 1.25
TAIL_TIP = (0, TAIL[1] + TAIL_LEN * math.cos(0.25), TAIL[2] - TAIL_LEN * math.sin(0.25))
LEGS = {'FL': (-0.42, -0.55, 0.95), 'FR': (0.42, -0.55, 0.95), 'BL': (-0.48, 0.6, 1.0), 'BR': (0.48, 0.6, 1.0)}

# lay a lathe along the body: profile z runs forward (-Y)
FORWARD = (math.pi / 2, 0, 0)


def poly(part, mat, points):
    """One flat face through the given points (wing membranes)."""
    verts = [part.bm.verts.new(Vector(p)) for p in points]
    part.bm.faces.new(verts)
    return part._claim(verts, mat, False)


def spines(part, points, size):
    for (x, y, z), s in zip(points, size):
        part.cone('Spine', 0.07 * s, 0.0, 0.22 * s, (x, y, z + 0.08 * s), segs=4, rot=(-0.5, 0, 0))


def body(wyrm):
    b = Part('Body', (0, 0, 0))
    b.lathe('Scale', [(0.22, -1.15), (0.48, -0.85), (0.62, -0.35), (0.64, 0.25), (0.54, 0.7), (0.36, 0.98)],
            segs=16, sy=0.8, offset=(0, 0, 1.0), rot=FORWARD, cap_top=True, cap_bottom=True, smooth=True)
    # pale belly plates along the underside
    b.lathe('Belly', [(0.5, -0.8), (0.65, -0.3), (0.66, 0.25), (0.56, 0.68)], segs=8, sy=0.8,
            offset=(0, 0, 1.0), rot=FORWARD, arc=(-0.9, 0.9), smooth=True)
    # neck: up and forward to the head
    neck = [(0, -0.75, 1.25), (0, -1.15, 1.6), (0, -1.5, 1.95), (0, -1.72, 2.12)]
    radii = [0.36, 0.3, 0.25, 0.22]
    for (p0, r0), (p1, r1) in zip(zip(neck, radii), zip(neck[1:], radii[1:])):
        rod(b, 'Scale', p0, p1, r0, r1, segs=10)
        b.sphere('Scale', r1, p1, segs=(10, 6))
    for p, r in zip(neck[:-1], radii):
        b.sphere('Belly', r * 0.85, (p[0], p[1] - r * 0.35, p[2] - r * 0.25), scale=(0.9, 0.7, 0.9), segs=(8, 5))
    pts = [(0, -1.5, 2.2), (0, -1.2, 1.88), (0, -0.85, 1.58), (0, -0.4, 1.56), (0, 0.0, 1.62), (0, 0.4, 1.58),
           (0, 0.8, 1.42)]
    spines(b, pts, [0.7, 0.8, 0.9, 1.0, 1.1, 1.0, 0.9] if not wyrm else [1.1, 1.2, 1.3, 1.5, 1.6, 1.5, 1.3])
    return b


def head(wyrm):
    h = Part('Head', HEAD)
    h.sphere('Scale', 0.3, (0, -0.12, 0.06), scale=(0.95, 1.25, 0.8), segs=(14, 9))
    # upper jaw and snout
    h.cone('Scale', 0.22, 0.12, 0.62, (0, -0.55, -0.02), segs=10, rot=FORWARD, scale=(1, 0.75, 1))
    h.sphere('Scale', 0.13, (0, -0.86, -0.0), scale=(1.1, 0.9, 0.75), segs=(8, 6))
    for sx in (-1, 1):
        h.sphere('Eye', 0.065, (sx * 0.2, -0.32, 0.16), scale=(0.8, 1.2, 0.8), segs=(8, 5))
        # brow ridge
        h.box('Scale', (0.12, 0.26, 0.05), (sx * 0.19, -0.3, 0.23), rot=(0, sx * 0.3, 0))
        h.sphere('Mouth', 0.025, (sx * 0.06, -0.97, 0.05), segs=(6, 4))
        # horns sweep back and up
        h.cone('Horn', 0.08, 0.0, 0.62, (sx * 0.17, 0.2, 0.33), segs=6, rot=(-0.95, sx * 0.25, 0))
        for i in range(4):
            h.cone('Tooth', 0.025, 0.0, 0.08, (sx * 0.12, -0.45 - i * 0.12, -0.14), segs=4, rot=(math.pi, 0, 0))
        if wyrm:
            # a crown of lesser horns, cheek frills and a spiked beard
            h.cone('Horn', 0.06, 0.0, 0.45, (sx * 0.27, 0.12, 0.18), segs=6, rot=(-1.2, sx * 0.9, 0))
            h.cone('Horn', 0.05, 0.0, 0.32, (sx * 0.3, -0.02, 0.0), segs=5, rot=(-1.4, sx * 1.2, 0))
            h.prism('Wing', [(0, 0), (sx * 0.35, 0.05), (sx * 0.3, -0.25)][::sx], 0.03, (sx * 0.22, 0.02, 0.0),
                    rot=(0, 0, 0))
    if wyrm:
        h.cone('Horn', 0.06, 0.0, 0.3, (0, -0.1, -0.22), segs=5, rot=(math.pi - 0.4, 0, 0))
        h.cone('Horn', 0.045, 0.0, 0.22, (0, -0.68, 0.12), segs=5, rot=(-0.4, 0, 0))
    h.box('Mouth', (0.2, 0.55, 0.03), (0, -0.55, -0.13))
    return h


def jaw():
    j = Part('Jaw', JAW)
    j.cone('Scale', 0.17, 0.08, 0.62, (0, -0.36, -0.04), segs=8, rot=FORWARD, scale=(1, 0.6, 1))
    j.box('Mouth', (0.18, 0.5, 0.03), (0, -0.38, 0.03))
    for sx in (-1, 1):
        for i in range(3):
            j.cone('Tooth', 0.022, 0.0, 0.07, (sx * 0.09, -0.2 - i * 0.12, 0.06), segs=4)
    return j


def wing(side, wyrm):
    sx = -1 if side == 'L' else 1
    w = Part('Wing' + side, (sx * WING[0], WING[1], WING[2]))
    span = 1.25 if wyrm else 1.0
    elbow = (sx * 0.9 * span, 0.15, 0.55)
    wrist = (sx * 1.85 * span, 0.5, 0.42)
    tips = [(sx * 2.75 * span, 1.15, -0.05), (sx * 2.3 * span, 1.65, -0.3), (sx * 1.6 * span, 1.95, -0.45),
            (sx * 0.9 * span, 1.75, -0.4)]
    root = (sx * 0.15, 1.15, -0.15)
    rod(w, 'Scale', (0, 0, 0), elbow, 0.1, 0.08)
    rod(w, 'Scale', elbow, wrist, 0.08, 0.06)
    w.sphere('Scale', 0.09, elbow, segs=(6, 4))
    w.sphere('Scale', 0.07, wrist, segs=(6, 4))
    w.cone('Claw', 0.04, 0.0, 0.18, (wrist[0] + sx * 0.05, wrist[1] - 0.08, wrist[2] + 0.1), segs=4, rot=(0.6, 0, 0))
    for t in tips:
        rod(w, 'Scale', wrist, t, 0.05, 0.015, segs=5)
    # the membrane, panel by panel from the arm out to each finger
    edge = [wrist] + tips + [root]
    poly(w, 'Wing', [(0, 0, 0), elbow, wrist, root])
    for a, b in zip(edge[1:], edge[2:]):
        poly(w, 'Wing', [wrist, a, b])
    return w


def tail(wyrm):
    t = Part('Tail', TAIL)
    t.lathe('Scale', [(0.3, -0.05), (0.24, 0.6), (0.17, TAIL_LEN + 0.05)], segs=10, rot=(TAIL_DOWN, 0, 0),
            cap_bottom=True, smooth=True)
    t.lathe('Belly', [(0.25, 0.0), (0.18, TAIL_LEN)], segs=6, rot=(TAIL_DOWN, 0, 0), arc=(-0.8, 0.8))
    s = 1.3 if wyrm else 0.85
    spines(t, [(0, 0.35, 0.22), (0, 0.75, 0.12), (0, 1.1, 0.02)], [s, s * 0.9, s * 0.8])
    tip = Part('TailTip', TAIL_TIP)
    tip.lathe('Scale', [(0.17, -0.05), (0.11, 0.8), (0.04, 1.5)], segs=8, rot=(-math.pi / 2 - 0.12, 0, 0),
              cap_top=True, smooth=True)
    end = (0, 1.5 * math.cos(0.12), -1.5 * math.sin(0.12))
    # spade at the end of the tail
    tip.prism('Spine', [(0, 0), (0.18, 0.15), (0, 0.5), (-0.18, 0.15)], 0.04, (end[0], end[1] - 0.1, end[2]),
              rot=(-math.pi / 2, 0, 0))
    spines(tip, [(0, 0.35, 0.1), (0, 0.75, 0.03)], [s * 0.7, s * 0.6])
    return t, tip


def leg(name, front):
    px, py, pz = LEGS[name]
    sx = -1 if px < 0 else 1
    leg = Part('Leg' + name, LEGS[name])
    leg.sphere('Scale', 0.26 if front else 0.32, (sx * 0.04, 0, 0), scale=(0.8, 1, 1.1), segs=(10, 6))
    knee = (sx * 0.08, -0.12 if front else 0.18, -0.48)
    foot = (sx * 0.06, -0.08, -pz + 0.08)
    rod(leg, 'Scale', (sx * 0.04, 0, -0.05), knee, 0.17 if front else 0.21, 0.12)
    rod(leg, 'Scale', knee, foot, 0.11, 0.09)
    leg.sphere('Scale', 0.12, knee, segs=(6, 4))
    leg.box('Scale', (0.24, 0.32, 0.12), (foot[0], foot[1] - 0.08, -pz + 0.06))
    for i in (-1, 0, 1):
        leg.cone('Claw', 0.035, 0.0, 0.16, (foot[0] + i * 0.08, foot[1] - 0.27, -pz + 0.05), segs=4,
                 rot=(math.pi / 2 + 0.3, 0, 0))
    return leg


def build(wyrm):
    parts = [body(wyrm), head(wyrm), jaw(), wing('L', wyrm), wing('R', wyrm)]
    parts.extend(tail(wyrm))
    for name in LEGS:
        parts.append(leg(name, name.startswith('F')))
    return parts


if __name__ == '__main__':
    args = kit.cli_args(sys.argv)
    for name, wyrm in (('dragon', False), ('wyrm', True)):
        if args['only'] and name not in args['only']:
            continue
        kit.reset()
        kit.export(name, build(wyrm), PALETTE)
        if args['preview']:
            kit.preview(os.path.join(args['preview'], name + '.png'), height=4.5)
