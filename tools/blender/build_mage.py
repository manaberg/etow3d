"""Build the wizard from the eotw sprite (media/mage_plain.png) and export it.

    blender --background --python tools/blender/build_mage.py -- [--preview DIR]

Writes public/models/mage.glb (see kit.py for the part and material conventions).
"""

import math
import os
import sys

import bmesh

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import kit  # noqa: E402
from kit import Part  # noqa: E402

# The sprite's greys, darkened: the player stands in a bright light and the
# sprite's own values wash out to white. The duel wizard and mirror images
# recolour Robe, Mantle, Hair, Beard, Trim and Gem in the game.
PALETTE = {
    'Robe': 0x5c5c5e,
    'RobeShade': 0x3a3a3c,
    'Mantle': 0x7a7a7c,
    'Trim': 0xc09a30,
    'Skin': 0xc8845a,
    'Hair': 0x7e7e78,
    'Beard': 0x9a9a94,
    'Eye': 0x1c1d1c,
    'Leather': 0x6a4426,
    'Boot': 0x3a2618,
    'Wood': 0x6a6446,
    'Gem': 0x9fd8ff,
}


def build():
    parts = []

    # ---------------------------------------------------------------- body
    # Long robe flaring to the floor, with fold ridges like the sprite's
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
    # Wide wizard sleeves that flare at the cuff, hands poking out. The right
    # hand grips the sprite's tall plain staff, topped with a small focus gem.
    for side, x in (('L', -0.46), ('R', 0.46)):
        arm = Part('Arm' + side, (x, 0, 1.86))
        arm.lathe('Robe', [(0.12, 0.04), (0.15, -0.2), (0.17, -0.5), (0.22, -0.66)], segs=10, cap_top=True)
        arm.lathe('RobeShade', [(0.22, -0.66), (0.2, -0.7), (0.12, -0.68)], segs=10)
        arm.sphere('Skin', 0.1, (0, 0, -0.76), scale=(1, 1, 1.15), segs=(8, 6))
        if side == 'R':
            hand = (0, 0, -0.76)
            arm.lathe('Wood', [(0.04, -1.08), (0.035, 0.3), (0.03, 1.32)], segs=6, cap_top=True, cap_bottom=True,
                      offset=hand)
            arm.lathe('Wood', [(0.03, 1.32), (0.06, 1.38), (0.07, 1.46), (0.05, 1.52)], segs=6, offset=hand)
            arm.lathe('Leather', [(0.048, 0.12), (0.048, -0.12)], segs=6, offset=hand)
            arm.sphere('Gem', 0.07, (0, 0, -0.76 + 1.56), segs=(6, 4), smooth=False)
        parts.append(arm)

    # ---------------------------------------------------------------- head
    # Face framed by white hair that falls down the back to the waist, bushy
    # brows, long pointed beard, gold circlet with a gem on the brow.
    head = Part('Head', (0, 0, 2.2))
    head.sphere('Skin', 0.23, (0, 0, 0), scale=(0.95, 0.9, 1.05), segs=(14, 10))
    head.sphere('Skin', 0.045, (0, -0.225, -0.02), segs=(6, 4))
    for ex in (-0.085, 0.085):
        head.sphere('Eye', 0.032, (ex, -0.205, 0.03), segs=(6, 4))
        head.box('Hair', (0.11, 0.05, 0.04), (ex, -0.215, 0.085))
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
        head.cone('Beard', 0.03, 0.05, 0.16, (sx * 0.12, -0.2, -0.12), segs=6, smooth=True)
    head.cone('Beard', 0.02, 0.22, 0.72, (0, -0.3, -0.4), segs=10, rot=(-0.3, 0, 0), scale=(1, 0.55, 1),
              smooth=True)
    head.cone('Beard', 0.01, 0.12, 0.4, (0, -0.4, -0.62), segs=8, rot=(-0.3, 0, 0), scale=(1, 0.5, 1),
              smooth=True)
    # circlet: the gold band across the brow in the sprite
    head.lathe('Trim', [(0.245, 0.12), (0.245, 0.155)], segs=18, sy=0.95)
    head.sphere('Gem', 0.03, (0, -0.24, 0.14), segs=(6, 4), smooth=False)
    parts.append(head)

    return parts


if __name__ == '__main__':
    args = kit.cli_args(sys.argv)
    kit.reset()
    kit.export('mage', build(), PALETTE)
    if args['preview']:
        kit.preview(os.path.join(args['preview'], 'mage.png'), height=2.6)
