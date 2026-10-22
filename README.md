etow3d
======

**End of the Worlds 3D**: a 3D remake of [eotw](https://github.com/manaberg/eotw), the
ImpactJS wizard-versus-orcs dungeon game, rebuilt with [Three.js](https://threejs.org).

Pre Alpha 0.1.0

The game plays like the original: the same ten-floor survival descent (now followed by ten
more, down through the dragons' lairs), the same spells, orc classes, mini-bosses, warlord
and duel AI, with the same numbers. It is now rendered
as a lit 3D dungeon seen from an angled camera that follows the mage.

## Running it

Needs Node.js 22.13 or newer (the score backend uses `node:sqlite`).

```sh
npm install
npm run dev        # game on http://localhost:5173 (hot reload)
```

`npm run dev` proxies the score endpoints to the backend, so to save runs while developing
also start it in a second terminal with `npm start`.

To serve the built game and the backend together, as in production:

```sh
npm run build
npm start          # http://localhost:8080 (PORT and SESSION_SECRET are read from the environment)
```

The game also runs from any static host (`dist/` after `npm run build`); runs are then just
not saved.

URLs work like the 2D game: `/?mode=survival` starts the descent, `/?mode=duel&ai=normal|hard|insane`
starts a duel, and `/` shows the main menu.

## Controls

These are the default keys. Every action can be moved to another key or mouse button from
**Controls** on the main menu or the pause screen (binding a key that is taken swaps the
two). Bindings are saved in the browser. `Esc` always pauses and the arrow keys always move.

| Key | Action |
| --- | --- |
| `W` `A` `S` `D` | move |
| Mouse | aim |
| `LMB` (hold) | magic missile: three darts that curve in on the foe nearest the cursor (also shoot down stones, warlock bolts and, in duels, the rival's missiles) |
| `RMB` | blink to the cursor |
| `Q` | fireball |
| `E` | iron shot |
| `F` | chain lightning (locks on to the nearest enemy) |
| `R` | time stop |
| `1` | haste |
| `2` | mirror image |
| `3` | chain root |
| `4` | shield (reflects bolts) |
| `5` | blizzard at the cursor |
| `G` (hold) | lifesteal ray |
| `T` | invisibility |
| `C` | fear |
| `X` | power word kill (hover an enemy) |
| `V` | telekinesis (hover loot) |
| `H` | scorching ray (three fire bolts) |
| `Z` | cone of cold (damages and chills in front of you) |
| `B` | thunderwave (blasts nearby enemies away) |
| `6` | meteor swarm at the cursor |
| `7` | spirit guardians (a damaging, slowing aura that follows you) |
| `8` | cloudkill at the cursor (a poison cloud that rolls away from you) |
| `Y` | healing word |
| `U` | polymorph (turns an orc under the cursor into a sheep; a wizard only briefly, and a sheep cannot cast) |
| `9` | disintegrate (a ray into the first enemy in line) |
| `0` | spiritual weapon (a spectral sword that fights beside you) |
| `Tab` | battle: switch between spell mode and commander mode |
| Commander mode | click / drag to select regiments, right-click ground to march and hold, right-click an enemy to attack it, WASD pans |
| `` ` `` | battle: select all regiments (or click the regiment cards) |
| `J` / `K` / `L` | battle: selected regiments charge / march to the cursor and hold / follow you |
| `Space` | descend the stairs |
| Mouse wheel | zoom |
| `M` | larger map |
| `I` | inventory (wear, swap and drop gear; the game waits while it is open) |
| `Esc` / `P` | pause |

## The game

Three modes; the main menu explains each in full under **How each mode works**.

**Battle.** You and a rival wizard each lead an army (blue against red) across open
grassland ringed by cliffs. You pick your army's race on the menu (orcs, dwarves, humans,
elves or random; `?race=dwarf` in the URL) and the rival fields a different race every
battle. The races share the orcs' seven classes under their own names, models and missiles
(`Races` in `src/world/levels.js`): dwarves are slow and take 30% more killing and shoot
crossbows; humans are a little tougher, harder hitting and longer ranged than orcs; elves are
quick and shoot a quarter further and straighter, but are frail. A match is best of five, and every battle is
500 a side. Armies are split into regiments by type (infantry, slingers, knights, shock
troops, mystics), each with a banner, deployed in lines with yours along the bottom of the
screen facing up the field; you rearrange them before the battle (Space starts it early). Tab
switches between spell mode (you play the wizard) and commander mode (the wizard stands, the
camera roams, click or drag to select regiments, right-click to march them or to attack an
enemy regiment); the J/K/L keys (charge, march and hold, follow) work in both. The orcs fight by class (brawlers close in, slingers and warlocks
keep range, knights charge, shamans heal) and you turn the fight with spells: fireballs and
blizzards into packed ranks, lightning chaining through them. The rival commands its own
regiments (line charges, knights flank, mystics guard it). Orcs are drawn instanced
(`src/render/armyRenderer.js`) and find foes and neighbours through a spatial grid, so 400 orcs
cost about a millisecond a step. A battle is lost when your wizard falls or your army is destroyed. Both wizards start
with magic missile and one random spell; after each battle you draft one of three new spells
and the rival learns one. Duel rules apply between the wizards, including the 3 s global
cooldown. Battle orcs have double the dungeon orcs' health (`BattleRules` in
`src/entities/battle.js`).

**Survival.** Twenty floors, from The Upper Halls down to the Throne of the Warlord and on
through the dragons' lairs to The Golden Hoard (`DungeonLevels` in `src/world/levels.js`). Every floor
is a freshly generated dungeon of themed rooms (great hall, orc barracks, forbidden library,
alchemy lab, crypt, throne room) joined by corridors. The stairs down wait in the throne room
and unseal once 40% of the floor's enemies are slain. Spells are learnt from scrolls; tier 2
scrolls upgrade fireball, lightning, iron shot, blink and blizzard. Potions heal or raise
maximum manergy. Spells, gear and stats carry down the stairs.
Besides the 2D game's spells, scrolls teach ten D&D spells new to the 3D game (scorching ray
to spiritual weapon in the table above). Duels and battles use them too.

Every spell belongs to a school of magic, shown beside it in the spell list:

| School | Spells | Lockout |
| --- | --- | --- |
| Evocation | magic missile, fireball, chain lightning, scorching ray, cone of cold, thunderwave, meteor swarm | 3 s |
| Conjuration | iron shot, blink, blizzard, cloudkill, spiritual weapon | 2.5 s |
| Abjuration | shield, spirit guardians, healing word | 4 s |
| Transmutation | haste, time stop, polymorph, disintegrate, telekinesis | 4 s |
| Enchantment | chain root, fear | 3.3 s |
| Illusion | mirror image, invisibility | 3.3 s |
| Necromancy | lifesteal, power word kill | 4 s |

**Gear.** Wizards wear a hat, a robe, a staff and two rings, each with properties (more
health or manergy, faster regen, movement or cooldowns, armour, cheaper fireballs or
lightning, stronger missiles, lifesteal, mending, longer shields), and what is worn shows
on the model. `I` opens the inventory: the five worn slots, a bag of twenty, the wizard's
resulting stats, and the selected item compared with what it would replace; double-click
to wear or take off, or drop an item on the floor. You start in an apprentice's kit; the
2D game's rings and new gear drop from champions, and the orcs wear gear too (casters
now and then a hat or robe, champions often a ring or a robe, the orc mage a rare hat,
the cleric its mitre), which makes them tougher, faster or harder to hurt and drops when
they fall. In duels and battles both wizards wear matching kits (the rival's in red) and
keep the 2D duel's five rings as built-in bonuses. The catalogue is `Gear` in
`src/entities/gear.js`; the pieces are modelled in `src/render/gearModels.js`.

The orcs share the dungeon with warbands of humans (from the first floor), dwarves (from the
second) and elves (from the third), drawn per floor by the plan's `races` weights. Each pack
is one race, with that race's stats, names and missiles; the warlord's guard is always orcs.
Packs guard their rooms until they see, hear or get hit by the player, then rally the pack
and hunt through the dungeon on flow-field paths. Classes: grunt, slinger, knight (charges),
shaman (heals), berserker (enrages), brute and warlock (casts bolts); deeper orcs are tougher
and champions, which grow more common with depth, drop the most loot. Potions are scarce: a
few per floor and rare drops. Orc clerics and orc mages appear from depth 3 and 4 and grow in
number further down, and the warlord waits on the tenth floor; slaying him opens the stairs.

Every floor also hides a dark wizard with the duel rival's brain. It waits in its lair until it
notices you, knows magic missile plus one random spell per floor below the first, fights as a
hard rival from depth 6, and leaves a tier 2 scroll when slain.

Below him the climb steepens (foes' health grows with the square of the depth past 10, to
5.4x on floor 20; damage to 2.6x; more foes, champions and mini-bosses) and dragons lair in
the largest rooms (`src/entities/dragon.js`): wyrmlings from depth 11, then young, adult and
ancient dragons, each age bigger and stronger. Every colour has its own breath, spell and
resistances (a damage multiplier per element; every spell of the mage now carries one):

| Colour | Breath | Ancient's spell | Immune | Weak to |
| --- | --- | --- | --- | --- |
| red | fire cone, leaves burning ground | three fireballs | fire | cold |
| white | frost cone, a slowing blizzard | a fan of ice shards | cold (and chill) | fire |
| blue | lightning line, a short stun | three storm bolts | lightning (resists thunder) | poison |
| green | poison cone, a lingering cloud | a poison cloud on you | poison (resists necrotic) | fire |
| black | acid line, acid pools | three acid bolts | necrotic (resists poison) | radiant, lightning |

All dragons bite, breathe and fly over walls to reach you; adults add a tail sweep at
whoever stands behind them and a frightful roar that makes you flee; ancients add a wing
buffet, their colour's spell and shrug off roots. Before a breath the dragon stops, rears and
its mouth glows; the breath then sweeps slowly after you. Step out of it or raise the shield,
which turns it. On floor 20 the great golden wyrm (immune to fire and poison, resistant to
most else) breathes fire and weakening gas by turns, rains meteors, and at 75%, 50% and 25%
health calls two of its chromatic brood and takes to the air. Slaying it wins the run.

**Duel.** You against a rival wizard in a small dungeon of six themed rooms and corridors (no
stairs); you start in the two rooms farthest apart. Walls block sight and bolts, so you can
hide, flank and ambush, and the rival hunts you through the corridors when it loses you.
The **arena** map (`?map=arena`, or the Rooms / Arena toggle on the menu) is the old
straightforward duel instead: one open hall with no pillars, the wizards starting face to
face from opposite ends.
In **progressive** duels (the default) each wizard starts with magic missile and one random
spell; scrolls and potions keep appearing around the map, and whoever reaches a scroll first
learns a spell they lack (potions heal or restore manergy). The rival runs for loot when it
is worth it and tells you what it learned. **Classic** duels (`?rules=classic`, or the toggle
on the menu) give both wizards every spell from the start, the ten D&D spells included.
Instead of a global cooldown, a cast locks the rest of its school for the school's lockout
(table above), so spells of different schools can be woven back to back; magic missile and
lifesteal never lock (`DuelRules.schools`). Survival has no lockouts. The rival wizard reads the
bolts in flight, scores escape directions, shields or blinks out of hits it cannot dodge,
picks tactics (kite, engage, punish, pressure, retreat, hunt) and learns how far to lead its
shots from how you dodge. Normal, hard and insane differ in reaction time, aim and tricks.

When a survival run ends it is posted to the backend (`/gamestates/gamesave`) like the 2D
game; `GET /api/ladder` and `GET /api/fastest-wins` read the scores back.

## Code layout

```
index.html, src/main.js     menu and start-up
src/game.js                 game state, floors, spawning, aggro and navigation helpers
src/core/                   constants, rebindable input bindings, time stop, entity base class
src/world/                  dungeon generator, level plans, pathfinder, collision
src/entities/               mage (spell book), orcs, mini-bosses and warlord, duel wizard,
                            projectiles and zones, loot and stairs
src/render/                 Three.js renderer, dungeon meshes, character and prop models,
                            textures and particle effects
public/models/              character models (.glb) built in Blender
tools/blender/              the Blender scripts that build them
src/ui/                     HUD, minimap, controls screen
backend/                    Express + SQLite score server (shared with eotw)
```

The simulation runs at a fixed 60 steps per second and keeps the 2D game's units: positions
in pixels on the ground plane (a 24px collision tile is one 3D unit) and timers in frames, so
the original balance carries over unchanged. Textures and props are procedural.

### Character models

The mage and every orc look are modelled in Blender from the 2D game's sprites by
scripts in `tools/blender/`, and exported to `public/models/`. The dwarves, humans and elves
(`build_races.py`, seven classes each, `<race>_<class>.glb`) have no sprites; they follow the
orcs' style. The dragon (`build_dragon.py`: `dragon.glb` for wyrmlings to adults, the horned
`wyrm.glb` for ancients and the golden wyrm) has its own rig of jaw, wings, two-part tail and
four legs, and is recoloured per colour in the game. To rebuild them after changing a script
(needs Blender 4.2 or newer on the `PATH`):

```sh
blender --background --python tools/blender/build_mage.py
blender --background --python tools/blender/build_orcs.py -- --only knight   # or all looks
blender --background --python tools/blender/build_races.py -- --only dwarf   # a race, a look, or all
blender --background --python tools/blender/build_dragon.py
```

Pass `-- --preview DIR` to also render front, three-quarter, side and back views. The
scripts save `.blend` files to `tools/blender/blend/` for editing by hand. Models are
split into rigid parts on the rig's pivots and animated in code; if one fails to load,
the game falls back to the older primitive model.

## Differences from the 2D game

- Bodies slide along walls instead of stopping (and orcs no longer die on wall contact).
- The caster of a time stop, and their spells, are not slowed by it.
- A shield turns reflected bolts against their caster's side.
- Chain lightning and chain root can hit the same orc again after a short delay.
