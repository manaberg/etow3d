"""Build the wizard from the eotw sprite (media/mage_plain.png) and export it.

    blender --background --python tools/blender/build_mage.py -- [--preview DIR]

Writes public/models/mage.glb (see kit.py for the part and material conventions).

The wizard has more parts than the other characters, joined up by its own rig
(MageRig in src/render/models.js): the arms bend at the elbow (ForeL and ForeR
hang from ArmL and ArmR, with the hands), a length of sleeve hangs from each
cuff (SleeveL, SleeveR), the staff turns in the hand (Staff, its origin the
grip), and the beard (Beard, BeardTip) and the hair down the back (Hair,
HairTip) swing in two lengths each. Every part's origin is its pivot with the
wizard standing straight, arms at its sides.
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
# recolour Robe, Mantle, Hair, Beard, Trim, Gem and Glow in the game.
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
    'Iron': 0x4c4e54,
    'Page': 0xb8ad88,
    'Gem': 0x9fd8ff,
    'Glow': 0x9fd8ff,
}

# The robe is flattened front to back.
DEPTH = 0.85
SEGS = 36
STEP = 2 * math.pi / SEGS

# Where the parts hinge.
SHOULDER = 1.86
ELBOW = 1.5
HAND = 1.09
ARM_X = 0.46
HEAD = 2.2
CHIN = (0, -0.19, 2.0)
BEARD_TIP = (0, -0.39, 1.64)
NAPE = (0, 0.2, 2.12)
HAIR_TIP = (0, 0.5, 1.7)
# the staff, from its grip: down to its foot and up to its stone
STAFF_FOOT = -1.37
STAFF_GEM = 1.2


def pleat(a):
    """The robe's pleats round its hem: nine of them, not quite alike."""
    return 0.62 * math.cos(a * 9) + 0.38 * math.cos(a * 5 + 1.3)


def pleated(profile, lift=1.0):
    """A radial() for kit.lathe: pleats that deepen towards the hem and are gone at the waist."""
    def radial(a, i):
        z = profile[i][1]
        depth = 0.085 * max(0.0, (1.25 - z) / 1.25) ** 1.2
        return lift * (1 + depth * pleat(a))
    return radial


def build():
    parts = []

    # ---------------------------------------------------------------- body
    # Long pleated robe flaring to the floor, a gold band above its dark hem
    # and a paler panel edged in gold down the front; belt, buckle, a pouch
    # and a spellbook at the hips; a mantle over the shoulders.
    body = Part('Body', (0, 0, 0))
    hem = [(0.71, 0.0), (0.705, 0.05)]
    band = [(0.705, 0.05), (0.695, 0.16)]
    robe = [(0.695, 0.16), (0.66, 0.36), (0.585, 0.68), (0.5, 1.0), (0.43, 1.24), (0.395, 1.36), (0.41, 1.5),
            (0.425, 1.64), (0.4, 1.8), (0.3, 1.94), (0.18, 2.0)]
    body.lathe('RobeShade', hem, segs=SEGS, radial=pleated(hem), sy=DEPTH, cap_bottom=True)
    body.lathe('Trim', band, segs=SEGS, radial=pleated(band), sy=DEPTH)
    body.lathe('Robe', robe, segs=SEGS, radial=pleated(robe), sy=DEPTH, smooth=True)
    # the front panel lies on the two facets either side of the middle, its
    # gold edges on the next ones out
    skirt = robe[:5]
    chest = robe[5:9]
    for run in (skirt, chest):
        body.lathe('Mantle', run, segs=2, radial=pleated(run, 1.012), sy=DEPTH, arc=(-STEP, STEP), smooth=True)
        for side in (-1, 1):
            body.lathe('Trim', run, segs=1, radial=pleated(run, 1.014), sy=DEPTH,
                       arc=(side * STEP, side * (STEP + 0.045)))
    # belt, with its buckle and the end hanging from it
    body.lathe('Leather', [(0.43, 1.285), (0.44, 1.33), (0.43, 1.385)], segs=18, sy=DEPTH)
    body.box('Trim', (0.13, 0.03, 0.11), (0, -0.378, 1.335))
    body.box('RobeShade', (0.07, 0.03, 0.05), (0, -0.386, 1.335))
    body.box('Leather', (0.055, 0.02, 0.2), (0.085, -0.385, 1.2), rot=(0.06, 0.08, 0))
    body.box('Trim', (0.06, 0.024, 0.03), (0.092, -0.392, 1.105), rot=(0.06, 0.08, 0))

    def at_hip(a, r, z):
        return (math.sin(a) * r, -math.cos(a) * r * DEPTH, z)

    # a pouch on the staff side
    a = 0.85
    body.box('Leather', (0.17, 0.1, 0.17), at_hip(a, 0.475, 1.17), rot=(0, 0, a))
    body.box('Boot', (0.18, 0.11, 0.07), at_hip(a, 0.48, 1.235), rot=(0, 0, a))
    body.box('Trim', (0.035, 0.03, 0.035), at_hip(a, 0.535, 1.21), rot=(0, 0, a))
    body.box('Leather', (0.04, 0.03, 0.1), at_hip(a, 0.45, 1.29), rot=(0, 0, a))
    # a spellbook hanging at the other hip, spine up
    a = -1.25
    for dx in (-0.06, 0.06):
        strap = at_hip(a + dx / 0.45, 0.455, 1.23)
        body.box('Leather', (0.025, 0.03, 0.16), strap, rot=(0, 0, a))
    body.box('Page', (0.2, 0.065, 0.26), at_hip(a, 0.505, 1.04), rot=(0, 0, a))
    body.box('Leather', (0.22, 0.02, 0.28), at_hip(a, 0.548, 1.04), rot=(0, 0, a))
    body.box('Leather', (0.22, 0.02, 0.28), at_hip(a, 0.462, 1.04), rot=(0, 0, a))
    body.box('Leather', (0.22, 0.1, 0.03), at_hip(a, 0.505, 1.175), rot=(0, 0, a))
    body.box('Trim', (0.07, 0.012, 0.07), at_hip(a, 0.562, 1.04), rot=(0, math.pi / 4, a))
    body.box('Trim', (0.03, 0.11, 0.05), at_hip(a, 0.505, 0.93), rot=(0, 0, a))
    # mantle: a short cape over the shoulders, open at the front under the
    # beard, gold along its scalloped edge and clasped at the throat
    cape = [(0.665, 1.55), (0.645, 1.68), (0.575, 1.86), (0.4, 1.985), (0.21, 2.03)]

    def scallop(a, i):
        return 1 + (0.045 * math.cos(a * 7), 0.02 * math.cos(a * 7), 0, 0, 0)[i]

    opening = (0.38, 2 * math.pi - 0.38)
    body.lathe('Mantle', cape, segs=28, sy=0.82, radial=scallop, arc=opening, smooth=True)
    body.lathe('Trim', [(0.668, 1.522), (0.667, 1.556)], segs=28, sy=0.82,
               radial=lambda a, i: 1 + 0.045 * math.cos(a * 7), arc=opening)
    for side in (-1, 1):
        body.sphere('Trim', 0.045, (side * 0.15, -0.3, 1.9), scale=(1, 0.6, 1), segs=(8, 5), smooth=False)
    body.box('Trim', (0.28, 0.02, 0.022), (0, -0.295, 1.9))
    # collar and neck
    body.lathe('RobeShade', [(0.2, 1.97), (0.225, 2.03), (0.19, 2.07)], segs=14, sy=0.9)
    body.lathe('Skin', [(0.105, 1.94), (0.095, 2.1)], segs=10, smooth=True)
    parts.append(body)

    # ---------------------------------------------------------------- legs
    # Soft boots with turned-up toes, a cuff at the ankle.
    for side, x in (('L', -0.2), ('R', 0.2)):
        leg = Part('Leg' + side, (x, 0, 0.5))
        side_on = (0, 0, math.pi / 2)
        leg.prism('Boot', [(0.11, -0.5), (-0.25, -0.5), (-0.36, -0.43), (-0.3, -0.38), (-0.12, -0.33),
                           (-0.08, -0.17), (0.11, -0.17)], 0.19, (0, 0, 0), rot=side_on)
        leg.prism('RobeShade', [(0.12, -0.5), (-0.26, -0.5), (-0.26, -0.47), (0.12, -0.47)], 0.205, (0, 0, 0),
                  rot=side_on)
        leg.lathe('Leather', [(0.125, -0.21), (0.135, -0.16), (0.125, -0.11)], segs=8, offset=(0, -0.015, 0))
        leg.lathe('Robe', [(0.1, -0.13), (0.1, 0.02)], segs=8, offset=(0, -0.015, 0))
        parts.append(leg)

    # ---------------------------------------------------------------- arms
    # The upper arm to the elbow, then a wide sleeve that flares to a gold
    # cuff, dark inside, the hand in its mouth; from the back of the cuff
    # hangs the long point of the sleeve. The right hand is a fist for the
    # staff, the left is open.
    for side, x in (('L', -ARM_X), ('R', ARM_X)):
        arm = Part('Arm' + side, (x, 0, SHOULDER))
        arm.sphere('Robe', 0.14, (0, 0, -0.03), scale=(1, 1, 0.8), segs=(10, 6))
        arm.lathe('Robe', [(0.15, 0.0), (0.152, -0.2), (0.158, ELBOW - SHOULDER - 0.02)], segs=10, smooth=True)
        parts.append(arm)

        fore = Part('Fore' + side, (x, 0, ELBOW))
        fore.sphere('Robe', 0.16, (0, 0, 0), segs=(10, 6))
        sleeve = [(0.158, 0.0), (0.168, -0.11), (0.2, -0.22), (0.25, -0.32)]
        back = [0, 0.005, 0.025, 0.05]
        fore.lathe('Robe', sleeve, segs=12, dy=back, smooth=True)
        fore.lathe('Trim', [(0.25, -0.32), (0.256, -0.355)], segs=12, dy=[0.05, 0.055])
        fore.lathe('RobeShade', [(0.256, -0.355), (0.225, -0.365), (0.08, -0.27)], segs=12, dy=[0.055, 0.05, 0.01])
        fore.lathe('Skin', [(0.058, -0.24), (0.05, -0.36)], segs=8, smooth=True)
        hand = HAND - ELBOW
        inward = -1 if side == 'R' else 1
        if side == 'R':
            fore.sphere('Skin', 0.088, (0, 0, hand), scale=(0.95, 1.1, 1.0), segs=(8, 6))
            fore.box('Skin', (0.15, 0.075, 0.11), (0, -0.065, hand - 0.005))
            fore.box('Skin', (0.05, 0.11, 0.05), (inward * 0.07, -0.05, hand + 0.05), rot=(0.5, 0, 0))
        else:
            fore.box('Skin', (0.05, 0.12, 0.13), (0, 0, hand + 0.01))
            fore.box('Skin', (0.045, 0.11, 0.11), (inward * 0.012, -0.004, hand - 0.105), rot=(0, inward * -0.22, 0))
            fore.box('Skin', (0.04, 0.04, 0.1), (inward * 0.02, -0.08, hand - 0.005), rot=(0.55, 0, 0))
        parts.append(fore)

        drape = Part('Sleeve' + side, (x, 0.19, ELBOW - 0.33))
        drape.lathe('Robe', [(0.2, 0.05), (0.2, -0.06), (0.14, -0.22), (0.035, -0.38)], segs=10, sy=0.55,
                    dy=[-0.02, 0, 0.03, 0.06], smooth=True, cap_bottom=True)
        drape.lathe('Trim', [(0.035, -0.38), (0.02, -0.41)], segs=10, sy=0.55, dy=[0.06, 0.065], cap_bottom=True)
        parts.append(drape)

    # ---------------------------------------------------------------- staff
    # A tall crooked staff shod with iron, bound with leather at the grip;
    # three claws at its head hold the stone.
    staff = Part('Staff', (ARM_X, 0, HAND))
    shaft = [(0.034, STAFF_FOOT + 0.06), (0.04, -1.0), (0.044, -0.5), (0.046, 0.0), (0.043, 0.38), (0.047, 0.7),
             (0.052, 0.96)]
    staff.lathe('Wood', shaft, segs=7, dy=[0, 0.014, -0.012, 0, 0.016, -0.01, 0], dx=[0, -0.01, 0.012, 0, -0.012, 0.014, 0])
    staff.lathe('Iron', [(0.026, STAFF_FOOT), (0.044, STAFF_FOOT + 0.04), (0.044, STAFF_FOOT + 0.12)], segs=7,
                cap_bottom=True)
    staff.lathe('Leather', [(0.053, 0.14), (0.057, 0.0), (0.053, -0.14)], segs=7)
    staff.sphere('Wood', 0.062, (0.014, -0.01, 0.6), scale=(1, 1, 1.25), segs=(6, 4), smooth=False)
    staff.lathe('Trim', [(0.058, 0.93), (0.066, 0.96), (0.058, 0.99)], segs=7)
    staff.lathe('Wood', [(0.052, 0.99), (0.07, 1.06)], segs=7, cap_top=True)
    for i in range(3):
        a = i * 2 * math.pi / 3 + 0.5
        out = (math.sin(a), -math.cos(a))
        staff.cone('Wood', 0.036, 0.026, 0.17, (out[0] * 0.075, out[1] * 0.075, 1.1), segs=5, rot=(0.62, 0, a))
        staff.cone('Wood', 0.026, 0.008, 0.2, (out[0] * 0.095, out[1] * 0.095, 1.26), segs=5, rot=(-0.33, 0, a))
    staff.sphere('Gem', 0.082, (0, 0, STAFF_GEM), scale=(1, 1, 1.3), segs=(6, 4), smooth=False)
    parts.append(staff)

    # ---------------------------------------------------------------- head
    # A long face with a hooked nose under bushy brows, framed by white hair;
    # a gold circlet with a gem on the brow; moustache and a bearded jaw.
    head = Part('Head', (0, 0, HEAD))
    head.sphere('Skin', 0.225, (0, 0, 0.01), scale=(0.95, 0.98, 1.06), segs=(14, 10))
    head.sphere('Skin', 0.16, (0, -0.04, -0.12), scale=(1, 1, 0.95), segs=(10, 6))
    head.prism('Skin', [(0.0, 0.075), (-0.125, -0.035), (-0.09, -0.065), (0.0, -0.055)], 0.062, (0, -0.2, 0),
               rot=(0, 0, math.pi / 2))
    for side in (-1, 1):
        head.sphere('Eye', 0.028, (side * 0.088, -0.2, 0.035), segs=(6, 4))
        head.box('Hair', (0.125, 0.055, 0.048), (side * 0.092, -0.21, 0.092), rot=(0.15, side * 0.28, side * -0.12))
        head.sphere('Skin', 0.06, (side * 0.212, 0.01, -0.01), scale=(0.4, 0.8, 1.1), segs=(6, 4))
    # hair cap: a shell over the top and back, open over the face
    cap = head.sphere('Hair', 0.27, (0, 0.02, 0.03), scale=(1, 1, 1.05), segs=(16, 10))
    doomed = [v for v in cap if v.co.y < -0.06 and v.co.z < 0.13 and v.co.z > -0.3]
    bmesh.ops.delete(head.bm, geom=doomed, context='VERTS')
    # side locks framing the face
    for side in (-1, 1):
        head.cone('Hair', 0.025, 0.075, 0.36, (side * 0.2, -0.035, -0.14), segs=6, smooth=True)
    # moustache drooping either side of the mouth, and the beard on the jaw
    for side in (-1, 1):
        head.cone('Beard', 0.012, 0.05, 0.22, (side * 0.1, -0.225, -0.135), segs=6, rot=(0, side * -0.78, 0),
                  smooth=True)
        head.sphere('Beard', 0.09, (side * 0.165, -0.07, -0.11), scale=(0.6, 0.9, 1.3), segs=(8, 5))
    head.sphere('Beard', 0.17, (0, -0.1, -0.2), scale=(1.05, 0.8, 0.9), segs=(10, 6))
    # circlet: the gold band across the brow in the sprite, rising to a point
    head.lathe('Trim', [(0.243, 0.12), (0.246, 0.16)], segs=18, sy=0.97)
    head.prism('Trim', [(0, 0.1), (0.055, 0.15), (0, 0.215), (-0.055, 0.15)], 0.02, (0, -0.238, 0), rot=(0.1, 0, 0))
    head.sphere('Glow', 0.03, (0, -0.25, 0.152), segs=(6, 4), smooth=False)
    parts.append(head)

    # ---------------------------------------------------------------- beard
    # The beard falls to the belt in two lengths; the upper one lies out over
    # the chest.
    beard = Part('Beard', CHIN)
    beard.lathe('Beard', [(0.16, 0.03), (0.175, -0.1), (0.165, -0.2), (0.15, -0.28), (0.13, -0.37)], segs=12,
                sy=0.55, dy=[0, -0.08, -0.16, -0.2, -0.2], smooth=True, cap_top=True)
    parts.append(beard)

    tip = Part('BeardTip', BEARD_TIP)
    tip.lathe('Beard', [(0.13, 0.0), (0.105, -0.14), (0.06, -0.3), (0.012, -0.46)], segs=12, sy=0.5,
              dy=[0, -0.015, -0.02, -0.01], smooth=True, cap_bottom=True)
    parts.append(tip)

    # ---------------------------------------------------------------- hair
    # Long hair down the back to the waist, out over the mantle, in two
    # lengths, the lower one tapering to a point.
    hair = Part('Hair', NAPE)
    hair.lathe('Hair', [(0.19, 0.28), (0.245, 0.13), (0.25, -0.07), (0.24, -0.2), (0.225, -0.31), (0.21, -0.43)],
               segs=14, sy=[0.42, 0.42, 0.46, 0.5, 0.52, 0.52], dy=[-0.11, -0.02, 0.16, 0.27, 0.3, 0.3], smooth=True,
               cap_top=True)
    parts.append(hair)

    ends = Part('HairTip', HAIR_TIP)
    ends.lathe('Hair', [(0.21, 0.01), (0.185, -0.15), (0.14, -0.3), (0.08, -0.44), (0.015, -0.56)], segs=14,
               sy=[0.52, 0.52, 0.5, 0.5, 0.5], dy=[0, 0, 0.005, 0.01, 0.01], smooth=True, cap_bottom=True)
    parts.append(ends)

    return parts


if __name__ == '__main__':
    args = kit.cli_args(sys.argv)
    kit.reset()
    kit.export('mage', build(), PALETTE)
    if args['preview']:
        kit.preview(os.path.join(args['preview'], 'mage.png'), height=2.9)
