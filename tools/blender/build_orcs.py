"""Build the orcs from the eotw sprites and export one model per look.

    blender --background --python tools/blender/build_orcs.py -- [--preview DIR] [--only LOOK ...]

Writes public/models/orc_<look>.glb for every look in ORC_LOOKS of
src/render/models.js (see kit.py for the part and material conventions).

Sprites: grunt, knight and shaman come from media/orc-1.png, the cleric and mage
bosses from orc_cleric_walkloop.png and orc_mage_walkloop.png, the warlord from
boss-1.png. Slinger, berserker, brute and warlock have no sprite in the 2D game;
they reuse the same body with gear in the same style. The game scales each look
(brute, bosses), so everything is modelled at grunt size.
"""

import math
import os
import sys

import bmesh

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402
from kit import Part, dim  # noqa: E402

# Pivots shared with the rig in src/render/models.js.
LEG = 0.86
ARM = (0.68, -0.05, 1.78)
HEAD = (0, -0.16, 2.05)
HAND = (0, -0.05, -0.92)  # relative to the arm pivot

# Held items: authored upright, then posed in the hand.
FORWARD = (math.pi / 2 + 0.35, 0, 0)  # melee weapons point forward, a little down
UPRIGHT = (0, 0, 0)  # staffs

# Sprite colours, darkened so they hold up under the dungeon lights.
SKIN = dim(0xadc45d, 0.72)
SKIN_DARK = dim(0x6baf81, 0.55)
BOOT = 0x46302c
LEATHER = 0x5a3a2c
STEEL = dim(0xb6c5eb, 0.72)
HELM = dim(0x97a6d0, 0.72)
LOIN = dim(0x4f5a99, 0.85)
GOLD = dim(0xb88f20, 0.95)
TUSK = 0xd8d2b8
WOOD = 0x5a3e24


def palette(**extra):
    p = {'Skin': SKIN, 'SkinDark': SKIN_DARK, 'Boot': BOOT, 'Leather': LEATHER, 'Tusk': TUSK,
         'Eye': 0xffd040, 'Cloth': LOIN, 'Metal': STEEL, 'Wood': WOOD}
    p.update(extra)
    return p


# ------------------------------------------------------------------ body

def orc_body(torso='Skin', arms='Skin', legs='Skin', robe=False):
    """The hunched, broad-shouldered orc every look starts from."""
    body = Part('Body', (0, 0, 0))
    # torso leans forward, chest broad, waist narrower
    body.lathe(torso, [(0.34, 0.82), (0.4, 1.0), (0.5, 1.2), (0.6, 1.5), (0.64, 1.68), (0.56, 1.84),
                       (0.34, 1.96), (0.2, 2.0)], segs=14, sy=0.62,
               dy=[0.02, 0.02, 0, -0.02, -0.04, -0.06, -0.1, -0.12], cap_top=True, cap_bottom=True, smooth=True)
    if torso == 'Skin':
        for sx in (-1, 1):
            body.sphere('Skin', 0.2, (sx * 0.2, -0.3, 1.6), scale=(1, 0.5, 0.7), segs=(10, 6))
    for sx in (-1, 1):
        body.sphere(torso, 0.22, (sx * 0.5, -0.04, 1.8), scale=(1, 0.9, 0.8), segs=(10, 6))
    body.lathe(torso, [(0.2, 1.9), (0.19, 2.06)], segs=10, offset=(0, -0.12, 0), smooth=True)
    # hips and loincloth
    body.lathe('Cloth', [(0.38, 0.72), (0.41, 0.86), (0.4, 0.96)], segs=14, sy=0.66, cap_bottom=True)
    body.box('Cloth', (0.32, 0.05, 0.32), (0, -0.27, 0.6), rot=(-0.08, 0, 0))
    body.box('Cloth', (0.32, 0.05, 0.3), (0, 0.27, 0.62), rot=(0.08, 0, 0))
    body.lathe('Leather', [(0.42, 0.93), (0.42, 1.0)], segs=14, sy=0.66)
    if robe:
        body.lathe('Cloth', [(0.62, 0.02), (0.58, 0.3), (0.5, 0.7), (0.43, 0.98)], segs=16, sy=0.8,
                   radial=lambda a, i: 1 + [0.06, 0.04, 0.01, 0][i] * math.cos(a * 7), cap_bottom=True)

    parts = {'Body': body}
    for side, sx in (('L', -1), ('R', 1)):
        leg = Part('Leg' + side, (sx * 0.26, 0, LEG))
        leg.lathe(legs, [(0.13, -0.62), (0.17, -0.4), (0.19, -0.15), (0.17, 0.05)], segs=10, cap_top=True,
                  smooth=True)
        leg.box('Boot', (0.28, 0.38, 0.22), (0, -0.06, -0.75))
        leg.box('Leather', (0.3, 0.3, 0.07), (0, 0, -0.6))
        parts['Leg' + side] = leg

        arm = Part('Arm' + side, (sx * ARM[0], ARM[1], ARM[2]))
        arm.lathe(arms, [(0.16, 0.08), (0.2, -0.15), (0.19, -0.42), (0.14, -0.55)], segs=10, cap_top=True,
                  smooth=True)
        arm.lathe(arms, [(0.14, -0.55), (0.17, -0.68), (0.14, -0.84)], segs=10, smooth=True)
        arm.sphere(arms, 0.15, HAND, scale=(1, 1, 1.05), segs=(10, 6))
        parts['Arm' + side] = arm

    head = Part('Head', HEAD)
    head.sphere('Skin', 0.27, (0, 0.02, 0.05), scale=(1.05, 1, 0.95), segs=(14, 10))
    head.sphere('Skin', 0.22, (0, -0.06, -0.15), scale=(1.3, 1, 0.7), segs=(12, 8))
    head.box('SkinDark', (0.46, 0.1, 0.07), (0, -0.23, 0.08))
    head.sphere('SkinDark', 0.06, (0, -0.28, -0.03), scale=(1.1, 0.8, 0.8), segs=(8, 5))
    for sx in (-1, 1):
        head.box('Eye', (0.09, 0.03, 0.05), (sx * 0.1, -0.25, 0.02))
        head.cone('Tusk', 0.045, 0.0, 0.16, (sx * 0.13, -0.25, -0.13), segs=5)
        head.cone('Skin', 0.08, 0.0, 0.3, (sx * 0.3, 0.02, 0.04), segs=5, rot=(0, sx * 1.3, sx * 0.4))
    parts['Head'] = head
    return parts


def hand(parts, side, item, rot):
    parts['Arm' + side].merge(item, HAND, rot)


def band(part, mat, z, r=0.16, h=0.08):
    part.lathe(mat, [(r, z), (r, z - h)], segs=10)


# ------------------------------------------------------------------ held items

def scimitar():
    w = Part('w', (0, 0, 0))
    w.lathe('Leather', [(0.04, -0.15), (0.04, 0.12)], segs=6, cap_top=True, cap_bottom=True)
    w.box('Metal', (0.06, 0.24, 0.04), (0, 0, 0.14))
    w.prism('Metal', [(-0.05, 0.16), (0.05, 0.16), (0.09, 0.5), (0.14, 0.78), (0.2, 1.0), (0.07, 0.8),
                      (0.0, 0.5)], 0.03, (0, 0, 0), rot=(0, 0, math.pi / 2))
    return w


def axe(double=True, length=1.1, blade=1.0):
    w = Part('w', (0, 0, 0))
    w.lathe('Wood', [(0.04, -0.25), (0.04, length)], segs=6, cap_top=True, cap_bottom=True)
    top = length - 0.25
    right = [(0.03, top - 0.2 * blade), (0.25 * blade, top - 0.3 * blade), (0.34 * blade, top),
             (0.25 * blade, top + 0.3 * blade), (0.03, top + 0.2 * blade)]
    w.prism('Metal', right, 0.04, (0, 0, 0), rot=(0, 0, math.pi / 2))
    if double:
        left = [(-x, z) for x, z in reversed(right)]
        w.prism('Metal', left, 0.04, (0, 0, 0), rot=(0, 0, math.pi / 2))
    w.cone('Metal', 0.05, 0.0, 0.14, (0, 0, length + 0.07), segs=4)
    return w


def hammer(length=1.4, head=(0.7, 0.36, 0.4), mat='Metal', haft='Wood', bands=None):
    w = Part('w', (0, 0, 0))
    w.lathe(haft, [(0.06, -0.2), (0.06, length)], segs=6, cap_top=True, cap_bottom=True)
    hx, hy, hz = head
    # the head runs across the haft, sideways from the hand
    w.lathe(mat, [(hz / 2, -hx / 2), (hz / 2, hx / 2)], segs=8, offset=(0, 0, length), rot=(0, math.pi / 2, 0),
            cap_top=True, cap_bottom=True, sy=hy / hz)
    if bands:
        for x in (-hx / 2 + 0.07, hx / 2 - 0.07):
            w.lathe(bands, [(hz / 2 + 0.015, x - 0.03), (hz / 2 + 0.015, x + 0.03)], segs=8,
                    offset=(0, 0, length), rot=(0, math.pi / 2, 0), sy=hy / hz)
    return w


def staff(top='knob', length=2.4, wood='Wood'):
    w = Part('w', (0, 0, 0))
    w.lathe(wood, [(0.04, -1.0), (0.035, length - 1.0)], segs=6, cap_top=True, cap_bottom=True)
    tip = length - 1.0
    if top == 'knob':
        w.sphere(wood, 0.07, (0, 0, tip + 0.04), segs=(6, 4), smooth=False)
        w.sphere('Gem', 0.045, (0, 0, tip + 0.13), segs=(6, 4), smooth=False)
    elif top == 'orb':
        w.lathe(wood, [(0.035, tip), (0.09, tip + 0.1), (0.05, tip + 0.18)], segs=6)
        w.sphere('Gem', 0.1, (0, 0, tip + 0.24), segs=(8, 6), smooth=False)
    elif top == 'star':
        pts = []
        for i in range(10):
            a = i / 10 * 2 * math.pi
            r = 0.17 if i % 2 == 0 else 0.07
            pts.append((math.sin(a) * r, tip + 0.18 + math.cos(a) * r))
        w.prism('Gold', pts, 0.04, (0, 0, 0))
        w.sphere('Gem', 0.06, (0, 0, tip + 0.18), segs=(6, 4), smooth=False)
    return w


# ------------------------------------------------------------------ looks

def grunt():
    """orc-1.png row 1: blue bucket helm with corner horns, one blue pauldron,
    leather strap across the chest, blue loincloth, curved sword."""
    p = orc_body()
    h = p['Head']
    h.box('Helm', (0.6, 0.58, 0.34), (0, 0.02, 0.24))
    h.box('Helm', (0.08, 0.42, 0.3), (-0.3, -0.02, 0.0))
    h.box('Helm', (0.08, 0.42, 0.3), (0.3, -0.02, 0.0))
    for sx in (-1, 1):
        h.box('Helm', (0.1, 0.1, 0.16), (sx * 0.25, 0.02, 0.46))
    p['ArmL'].sphere('Cloth', 0.26, (0, 0, 0.06), scale=(1, 1, 0.7), segs=(10, 6))
    p['ArmL'].sphere('Helm', 0.2, (0, 0, 0.14), scale=(1, 1, 0.5), segs=(10, 6))
    band(p['ArmL'], 'Cloth', -0.76)
    p['Body'].box('Leather', (0.1, 0.05, 1.25), (0, -0.4, 1.38), rot=(0, 0.7, 0))
    hand(p, 'R', scimitar(), FORWARD)
    return p, palette(Helm=HELM), 2.6


def knight():
    """orc-1.png row 4: round helm with a red crest knob, red pauldrons on both
    shoulders, blue loincloth, double-bladed battle axe."""
    p = orc_body()
    h = p['Head']
    h.sphere('Helm', 0.31, (0, 0.02, 0.1), scale=(1.05, 1, 0.9), segs=(14, 8))
    h.lathe('Helm', [(0.33, 0.02), (0.33, 0.1)], segs=14)
    h.box('Helm', (0.06, 0.06, 0.2), (0, -0.31, 0.02))
    h.sphere('Armor', 0.06, (0, 0.02, 0.42), segs=(8, 5))
    for side in ('L', 'R'):
        a = p['Arm' + side]
        a.sphere('Armor', 0.27, (0, 0, 0.06), scale=(1.05, 1.05, 0.72), segs=(10, 6))
        a.sphere('ArmorDark', 0.24, (0, 0, -0.06), scale=(1.1, 1.1, 0.4), segs=(10, 4))
    p['Body'].box('Leather', (0.07, 0.05, 0.6), (-0.3, -0.37, 1.58))
    p['Body'].box('Leather', (0.07, 0.05, 0.6), (0.3, -0.37, 1.58))
    hand(p, 'R', axe(double=True), FORWARD)
    return p, palette(Helm=HELM, Armor=dim(0xad494b, 0.85), ArmorDark=dim(0x82475f, 0.8)), 2.6


def shaman():
    """orc-1.png row 7: antler headdress with a gold gem, khaki robe with a sash
    over one shoulder, gold belt and armband, tall wooden staff."""
    p = orc_body(robe=True)
    b = p['Body']
    b.box('Cloth', (0.16, 0.05, 1.2), (0.05, -0.4, 1.4), rot=(0, -0.6, 0))
    b.lathe('Gold', [(0.43, 0.92), (0.43, 1.0)], segs=14, sy=0.66)
    band(p['ArmL'], 'Gold', -0.2, r=0.21)
    h = p['Head']
    h.lathe('Bone', [(0.28, 0.12), (0.29, 0.22)], segs=14)
    h.sphere('Gem', 0.05, (0, -0.29, 0.2), segs=(6, 4), smooth=False)
    for sx in (-1, 1):
        # antlers: a main beam swept up and out with two tines
        h.cone('Bone', 0.05, 0.025, 0.45, (sx * 0.24, 0.0, 0.42), segs=5, rot=(0, sx * 0.5, 0))
        h.cone('Bone', 0.03, 0.0, 0.22, (sx * 0.38, 0.0, 0.58), segs=5, rot=(0, sx * 1.1, 0))
        h.cone('Bone', 0.03, 0.0, 0.2, (sx * 0.2, 0.0, 0.66), segs=5, rot=(0, sx * -0.2, 0))
    hand(p, 'R', staff('knob', wood='Staff'), UPRIGHT)
    return p, palette(Cloth=dim(0xb5b377, 0.72), Bone=dim(0xe0deb1, 0.85), Gold=GOLD, Staff=dim(0x82705a, 0.8),
                      Gem=0x80ff80), 2.6


def slinger():
    """No sprite: a lean scout with a leather hood and vest, sling and stone bag."""
    p = orc_body()
    h = p['Head']
    hood = h.sphere('Leather', 0.31, (0, 0.04, 0.08), scale=(1.05, 1, 1), segs=(14, 9))
    bmesh.ops.delete(h.bm, geom=[v for v in hood if v.co.y < -0.12 and v.co.z < 0.18], context='VERTS')
    b = p['Body']
    b.lathe('Cloth', [(0.5, 1.2), (0.6, 1.5), (0.62, 1.7)], segs=14, sy=0.64, dy=[0, -0.02, -0.04],
            arc=(0.5, 2 * math.pi - 0.5))
    b.box('Leather', (0.3, 0.2, 0.35), (0.42, -0.2, 0.95))
    sling = Part('w', (0, 0, 0))
    sling.lathe('Leather', [(0.015, 0.0), (0.015, 0.5)], segs=4)
    sling.sphere('Cloth', 0.12, (0, 0, 0.55), segs=(6, 5), smooth=False)
    hand(p, 'R', sling, (math.pi, 0, 0))
    return p, palette(Skin=dim(0xc2e058, 0.66), Cloth=dim(0x9a8650, 0.75)), 2.6


def berserker():
    """No sprite: bare-chested, red mohawk and war paint, fur kilt, an axe in each hand."""
    p = orc_body()
    h = p['Head']
    h.prism('Hair', [(-0.04, 0.0), (0.04, 0.0), (0.03, 0.2), (-0.03, 0.2)], 0.5, (0, 0.02, 0.3),
            rot=(0, 0, 0))
    for i, z in enumerate((0.33, 0.3, 0.25)):
        h.cone('Hair', 0.05, 0.0, 0.2, (0, -0.2 + i * 0.2, z + 0.15), segs=4)
    for sx in (-1, 1):
        h.box('Paint', (0.05, 0.03, 0.22), (sx * 0.1, -0.26, -0.06))
    p['Body'].box('Paint', (0.5, 0.05, 0.06), (0, -0.39, 1.5))
    for side in ('L', 'R'):
        band(p['Arm' + side], 'Leather', -0.72, r=0.17, h=0.14)
        hand(p, side, axe(double=False, length=0.8, blade=0.8), FORWARD)
    return p, palette(Skin=dim(0x9a5a30, 1.0), SkinDark=dim(0x6a3a20, 1.0), Cloth=0x4a2a1a, Hair=0xd03010,
                      Paint=0x8a1010, Eye=0xff6020), 2.6


def brute():
    """No sprite: hulking, spiked iron pauldrons, studded harness, a huge maul."""
    p = orc_body()
    for side, sx in (('L', -1), ('R', 1)):
        a = p['Arm' + side]
        a.sphere('Metal', 0.29, (0, 0, 0.05), scale=(1.1, 1.1, 0.7), segs=(10, 6))
        for i in range(3):
            a.cone('Metal', 0.06, 0.0, 0.22, (sx * 0.08 * (i - 1), -0.08 + 0.08 * i, 0.27), segs=4)
        band(a, 'Leather', -0.7, r=0.18, h=0.16)
    b = p['Body']
    for sx in (-1, 1):
        b.box('Leather', (0.09, 0.05, 1.25), (0, -0.4, 1.38), rot=(0, sx * 0.7, 0))
    b.sphere('Metal', 0.07, (0, -0.42, 1.45), segs=(6, 4))
    hand(p, 'R', hammer(), FORWARD)
    return p, palette(Skin=dim(0x5f8a3a, 0.85), SkinDark=dim(0x3d5a26, 0.9), Cloth=0x4a3a2a,
                      Metal=dim(0x8a8e96, 0.9)), 2.6


def warlock():
    """No sprite: grey-blue skin, deep purple hooded robe, staff with a violet orb."""
    p = orc_body(robe=True)
    b = p['Body']
    b.lathe('Cloth', [(0.5, 1.2), (0.6, 1.5), (0.66, 1.7), (0.58, 1.86)], segs=14, sy=0.64,
            dy=[0, -0.02, -0.04, -0.06])
    b.lathe('Trim', [(0.43, 0.92), (0.43, 1.0)], segs=14, sy=0.66)
    h = p['Head']
    hood = h.sphere('Cloth', 0.34, (0, 0.06, 0.1), scale=(1.05, 1.05, 1.1), segs=(14, 9))
    bmesh.ops.delete(h.bm, geom=[v for v in hood if v.co.y < -0.14 and v.co.z < 0.22], context='VERTS')
    h.cone('Cloth', 0.2, 0.0, 0.4, (0, 0.2, 0.42), segs=8, rot=(-0.5, 0, 0))
    for side in ('L', 'R'):
        p['Arm' + side].lathe('Cloth', [(0.2, 0.06), (0.22, -0.3), (0.26, -0.7)], segs=10, cap_top=True)
    hand(p, 'R', staff('orb'), UPRIGHT)
    return p, palette(Skin=dim(0x5a6a8a, 1.05), SkinDark=dim(0x3a4a66, 1.0), Cloth=0x3a2060, Trim=0x8a6ac0,
                      Gem=0xb060ff, Eye=0xc070ff), 2.6


def cleric():
    """orc_cleric_walkloop.png (boss): red plate cuirass with gold trim, broad red
    pauldrons edged in gold, red helm with gold horns, red breeches, gold bracers,
    great axe."""
    p = orc_body(torso='Armor', legs='Cloth')
    b = p['Body']
    for z in (1.0, 1.32, 1.86):
        b.lathe('Gold', [(0.6 if z > 1.2 else 0.43, z - 0.035), (0.6 if z > 1.2 else 0.43, z + 0.035)], segs=14,
                sy=0.62, dy=[-0.04, -0.04])
    b.prism('Gold', [(-0.16, 1.5), (0.16, 1.5), (0.0, 1.7)], 0.03, (0, -0.39, 0))
    for side in ('L', 'R'):
        a = p['Arm' + side]
        a.sphere('Armor', 0.32, (0, 0, 0.04), scale=(1.15, 1.05, 0.62), segs=(12, 6))
        a.lathe('Gold', [(0.36, -0.08), (0.37, -0.02)], segs=12)
        a.lathe('Gold', [(0.17, -0.62), (0.19, -0.84)], segs=10, cap_top=True)
    h = p['Head']
    h.sphere('Armor', 0.31, (0, 0.03, 0.1), scale=(1.05, 1, 0.92), segs=(14, 8))
    h.lathe('Gold', [(0.33, 0.04), (0.33, 0.12)], segs=14)
    h.box('Gold', (0.06, 0.04, 0.24), (0, -0.31, 0.12))
    for sx in (-1, 1):
        h.cone('Gold', 0.07, 0.0, 0.34, (sx * 0.3, 0.0, 0.32), segs=6, rot=(0, sx * 0.7, 0))
    hand(p, 'R', axe(double=False, length=1.2, blade=1.15), FORWARD)
    return p, palette(Armor=dim(0xad494b, 0.8), Cloth=dim(0x7b3637, 0.9), Gold=GOLD, Metal=STEEL,
                      Leather=dim(0x7b3637, 0.6)), 2.6


def mage():
    """orc_mage_walkloop.png (boss): golden fan crown, red-brown beard, gold
    collar, rust-red skirt with a gold hem, gold staff with a star."""
    p = orc_body(robe=True)
    b = p['Body']
    b.lathe('Gold', [(0.62, 0.02), (0.63, 0.1)], segs=16, sy=0.8)
    b.lathe('Gold', [(0.43, 0.92), (0.43, 1.0)], segs=14, sy=0.66)
    # broad collar over the shoulders and chest
    b.lathe('Gold', [(0.7, 1.68), (0.56, 1.86), (0.26, 1.98)], segs=16, sy=0.68, dy=[-0.06, -0.08, -0.12])
    b.prism('Gold', [(-0.2, 1.68), (0.2, 1.68), (0.0, 1.38)], 0.04, (0, -0.42, 0))
    h = p['Head']
    h.cone('Beard', 0.03, 0.2, 0.42, (0, -0.24, -0.32), segs=8, rot=(-0.2, 0, 0), scale=(1, 0.6, 1))
    h.lathe('Gold', [(0.29, 0.14), (0.3, 0.24)], segs=14)
    fan = []
    for i in range(9):
        a = math.radians(-80 + i * 20)
        r = 0.5 if i % 2 == 0 else 0.4
        fan.append((math.sin(a) * r, 0.18 + math.cos(a) * r))
    h.prism('Gold', [(0, 0.1)] + fan[::-1], 0.06, (0, 0.06, 0))
    h.sphere('Gem', 0.05, (0, -0.3, 0.2), segs=(6, 4), smooth=False)
    for side in ('L', 'R'):
        band(p['Arm' + side], 'Gold', -0.7, r=0.18, h=0.1)
    hand(p, 'R', staff('star', wood='Gold'), UPRIGHT)
    return p, palette(Skin=dim(0xadc45d, 0.75), Cloth=dim(0xc96a54, 0.8), Gold=GOLD, Beard=dim(0x9c5b4c, 0.85),
                      Gem=0xff5040, Eye=0xc070ff), 2.6


def boss():
    """boss-1.png (warlord): black plate from head to foot with red seams, tall
    crowned helm with burning eye slits, red gem at the belt, a huge war hammer."""
    p = orc_body(torso='Armor', arms='Armor', legs='ArmorDark')
    b = p['Body']
    for sx in (-1, 1):
        # broad flat pauldrons that jut past the arms
        b.prism('Armor', [(0.0, 1.72), (sx * 0.95, 1.82), (sx * 0.85, 1.94), (0.0, 2.02)], 0.5, (0, -0.02, 0))
        b.box('Trim', (0.12, 0.03, 0.04), (sx * 0.3, -0.39, 1.62))
    b.lathe('ArmorDark', [(0.44, 0.92), (0.45, 1.06)], segs=14, sy=0.66)
    b.sphere('Glow', 0.07, (0, -0.31, 0.99), segs=(8, 5), smooth=False)
    b.lathe('Trim', [(0.5, 1.22), (0.5, 1.26)], segs=14, sy=0.62)
    for side in ('L', 'R'):
        a = p['Arm' + side]
        a.lathe('ArmorDark', [(0.18, -0.6), (0.22, -0.66), (0.2, -0.86)], segs=10, cap_top=True)
        band(a, 'Trim', -0.7, r=0.225, h=0.04)
        p['Leg' + side].box('Trim', (0.2, 0.04, 0.04), (0, -0.19, -0.35))
    h = p['Head']
    h.lathe('Armor', [(0.37, -0.34), (0.39, -0.1), (0.38, 0.2), (0.3, 0.44)], segs=12, sy=0.95, cap_top=True,
            cap_bottom=True)
    for i in range(5):
        x = -0.22 + i * 0.11
        h.prism('Armor', [(x - 0.05, 0.4), (x + 0.05, 0.4), (x, 0.58)], 0.06, (0, -0.26 + abs(x) * 0.4, 0))
    for sx in (-1, 1):
        h.box('Glow', (0.1, 0.03, 0.03), (sx * 0.1, -0.37, 0.05), rot=(0, sx * 0.25, 0))
    h.box('Trim', (0.03, 0.03, 0.26), (0, -0.37, -0.12))
    hand(p, 'R', hammer(length=1.5, head=(0.75, 0.42, 0.42), mat='ArmorDark', haft='Metal', bands='Trim'), FORWARD)
    return p, palette(Armor=0x343236, ArmorDark=0x242326, Trim=0x8a2020, Glow=0xff2010, Metal=0x4a494c,
                      Cloth=0x2a2a2e, Eye=0xff2010), 2.6


LOOKS = {f.__name__: f for f in (grunt, slinger, knight, shaman, berserker, brute, warlock, cleric, mage, boss)}

if __name__ == '__main__':
    args = kit.cli_args(sys.argv)
    for name, make in LOOKS.items():
        if args['only'] and name not in args['only']:
            continue
        kit.reset()
        parts, pal, height = make()
        kit.export('orc_' + name, list(parts.values()), pal)
        if args['preview']:
            kit.preview(os.path.join(args['preview'], 'orc_' + name + '.png'), height=height)
