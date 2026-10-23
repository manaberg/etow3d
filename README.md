etow3d
======

**End of the Worlds 3D**: a 3D remake of [eotw](https://github.com/manaberg/eotw), the
ImpactJS wizard-versus-orcs dungeon game, rebuilt with [Three.js](https://threejs.org).

Pre Alpha 0.1.0

The game plays like the original: the same ten-floor survival descent (now followed by ten
more, down through the dragons' lairs, with duels and battles against your own reflection
between the floors), the same spells, orc classes, mini-bosses, warlord and duel AI, with
the same numbers. It is now rendered as a lit 3D dungeon seen from an angled camera that
follows the mage.

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

URLs work like the 2D game: `/?mode=survival` starts the descent (add `&race=dwarf|human|elf|random`
for your army in battles) and `/` shows the main menu.

## Controls

These are the default keys. Every action can be moved to another key or mouse button from
**Controls** on the main menu or the pause screen (binding a key that is taken swaps the
two). Bindings are saved in the browser. `Esc` always pauses and the arrow keys always move.

| Key | Action |
| --- | --- |
| `W` `A` `S` `D` | move |
| Mouse | aim |
| `LMB` (hold) | magic missile: darts that curve in on the foe nearest the cursor, one at first and up to three with magic missile scrolls (also shoot down stones, warlock bolts and, in duels, the rival's missiles) |
| `RMB` `Q` `E` `R` `F` `1` `2` `3` `4` `C` | the spells on your bar, slots 1 to 10 (see **Spellbook and bar** below) |
| `B` | spellbook: choose which spells sit on the bar (the game waits while it is open) |
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

**The descent.** One run, twenty dungeon floors deep, from The Upper Halls to The Golden Hoard
(`DungeonLevels` in `src/world/levels.js`). Every two or three floors the stairs lead not to the
next floor but to a **trial** against your reflection: a duel, or a battle between two armies.
Each run rolls its own order (`Trials.schedule`): the first trial follows floor 2 or 3, then
one comes every two or three floors, six to nine in all, half duels and half battles, and a
third of the duels are fought in the open arena. A trial keeps the depth of the floor above it.
Your spells, bar, ranks, level, gear and stats go down with you through every floor and every
trial.

**Trials.** Your reflection (`src/entities/mirror.js`) is a wizard of your level with your
health, manergy, regeneration, speed, armour and magic missile darts, and as many spells as
you have on your bar, but its own: drawn at random from the circles your depth has reached
(table below), at the ranks of your spells. It wears the Red Order's crimson kit, so the two of
you can be told apart, and thinks like a dark wizard that deep (normal, hard from depth 6).
Trials follow the duel rules: duel damage between the wizards and the school lockouts (table
below). Both wizards start whole, on the duel scale (your health times seven, `Trials.hpScale`,
so a level 1 wizard has a duellist's 700), and the share you have left when the trial ends
carries on down the stairs, plus the stairs' usual breather. Trials give no experience; win one
and you take one of three spoils instead: a new spell, another magic missile dart or a rank for
a spell you know (one is a rank whenever there is one to take). Fall and the run is over.

**Duels.** Most are fought in a small dungeon of six themed rooms and corridors; you start in
the two rooms farthest apart. Walls block sight and bolts, so you can hide, flank and ambush,
and your reflection hunts you through the corridors when it loses you. A third are fought in
the arena, one open hall with no pillars, the wizards starting face to face from opposite ends.
Potions keep appearing around the map (`DuelLoot`), and whoever reaches one first drinks it.
The reflection reads the bolts in flight, scores escape directions, shields or blinks out of
hits it cannot dodge, picks tactics (kite, engage, punish, pressure, retreat, hunt), runs for
potions when they are worth the trip and learns how far to lead its shots from how you dodge.

**Battles.** You and your reflection each lead an army (blue against red) across open
grassland ringed by cliffs. You pick your army's race on the menu (orcs, dwarves, humans,
elves or random) and the reflection fields a different race. The races share the orcs' seven
classes under their own names, models and missiles (`Races` in `src/world/levels.js`): dwarves
are slow and take 30% more killing and shoot crossbows; humans are a little tougher, harder
hitting and longer ranged than orcs; elves are quick and shoot a quarter further and
straighter, but are frail. Every battle is 500 a side. Armies are split into regiments by type
(infantry, slingers, knights, shock troops, mystics), each with a banner, deployed in lines
with yours along the bottom of the screen facing up the field; the deeper the battle, the more
kinds of regiment take the field (`BattleRules.shares`). You rearrange them before the battle
(Space starts it early). Tab switches between spell mode (you play the wizard) and commander
mode (the wizard stands, the camera roams, click or drag to select regiments, right-click to
march them or to attack an enemy regiment); the J/K/L keys (charge, march and hold, follow)
work in both. The orcs fight by class (brawlers close in, slingers and warlocks keep range,
knights charge, shamans heal) and you turn the fight with spells: fireballs and blizzards into
packed ranks, lightning chaining through them. The reflection commands its own regiments (line
charges, knights flank, mystics guard it). Orcs are drawn instanced (`src/render/armyRenderer.js`)
and find foes and neighbours through a spatial grid, so 400 orcs cost about a millisecond a
step. The battle is won when the reflection falls or its army is destroyed; if your army is
destroyed you escape down the stairs without the spoils. Battle orcs have double the dungeon
orcs' health (`BattleRules` in `src/entities/battle.js`).

**Dungeon floors.** Twenty floors, from The Upper Halls down to the Throne of the Warlord and on
through the dragons' lairs to The Golden Hoard (`DungeonLevels` in `src/world/levels.js`). Every floor
is a freshly generated dungeon of themed rooms (great hall, orc barracks, forbidden library,
alchemy lab, crypt, throne room) joined by corridors. The stairs down wait in the throne room
and unseal once 40% of the floor's enemies are slain. Spells are learnt from scrolls into the
spellbook, and kills level the wizard up (see **Spellbook and bar**). Potions heal or raise
maximum manergy. Spells, ranks, the bar, level, gear and stats carry down the stairs.
Besides the 2D game's spells, scrolls teach ten D&D spells new to the 3D game (scorching ray
to spiritual weapon in the table below). Reflections use them too.

**Spellbook and bar.** Every spell a wizard learns goes into its spellbook, but only the spells
on its bar can be cast. Magic missile has its own key (LMB); the bar's ten slots sit on RMB, Q,
E, R, F, 1, 2, 3, 4 and C, nearest to WASD first, and `B` opens the spellbook to arrange them
(`src/entities/spellbar.js`, `src/ui/spellbook.js`).

- A new spell goes into the first free slot that suits it: blink to RMB, spells with a cooldown
  of 6.7 s or less to Q, E, R and F, slower ones to the number row. With the bar full it waits
  in the book.
- A spell brought onto the bar from the book starts on its cooldown (at least 3 s), so swapping
  mid-fight is never free. Moving spells along the bar is free, and the cooldown stays with the
  spell.
- **Levels.** Every kill on a dungeon floor gives experience (the square root of the foe's health,
  three times that for a dark wizard), and each level adds 6 health and 4 manergy. The bar
  opens with three slots (RMB, Q, E); R opens at level 2, F at 4, then 1, 2, 3 and 4 at 6, 8,
  10 and 12, and C at 15, the last level. Slaying about 60% of every floor reaches level 10 on
  the warlord's floor and 15 on the last (`WizardLevels`). A slot that opens takes the newest
  spell waiting in the book. Trials give no experience.
- **Circles.** A scroll (or a trial's spoils, or a reflection's spells) only comes from the
  circles its floor has reached: circle I from floor 1, II from floor 3, III from floor 6 and
  IV from floor 9 (table below).
- **Ranks.** A scroll for a spell you know raises its rank, to III; a gold scroll raises a spell
  on your bar. Magic missile's ranks are its darts. Fireball, chain lightning, iron shot, blink,
  blizzard and power word kill have their own rank II (the 2D game's tier 2 upgrades); every
  other spell's rank II adds 30% to its main number (damage, duration, reach or healing), or,
  for chain root, mirror image and telekinesis, cuts its cooldown by a quarter. Rank III cuts
  every spell's cooldown by a quarter (`RankRules`).

| Spell | Circle | Rank II |
| --- | --- | --- |
| fireball | I | a second orb beside the first |
| iron shot | I | two charges |
| blink | I | cooldown halved |
| shield (reflects bolts) | I | +30% duration |
| scorching ray (three fire bolts) | I | +30% damage |
| thunderwave (blasts nearby enemies away) | I | +30% damage |
| healing word | I | +30% healing |
| chain lightning (locks on to the nearest enemy) | II | every jump hits as hard as the first |
| chain root | II | cooldown -25% |
| haste | II | +30% duration |
| mirror image | II | cooldown -25% |
| lifesteal (hold) | II | +30% damage |
| cone of cold (damages and chills in front of you) | II | +30% damage |
| fear | II | +30% reach |
| telekinesis (hover loot) | II | cooldown -25% |
| blizzard at the cursor | III | twice the radius |
| invisibility | III | +30% duration |
| polymorph (turns an orc under the cursor into a sheep; a wizard only briefly, and a sheep cannot cast) | III | +30% duration |
| cloudkill at the cursor (a poison cloud that rolls away from you) | III | +30% damage |
| spirit guardians (a damaging, slowing aura that follows you) | III | +30% damage |
| spiritual weapon (a spectral sword that fights beside you) | III | +30% damage |
| disintegrate (a ray into the first enemy in line) | III | +30% damage |
| time stop | IV | +30% duration |
| meteor swarm at the cursor | IV | +30% damage |
| power word kill (hover an enemy) | IV | a wider, deeper splash |

**Magic missile tiers.** Magic missile grows with its scrolls (its ranks; `MissileTiers` in
`src/entities/spells.js`): one dart at first, then two, then three, each tier casting a
little slower (cooldown 24, 34 and 44 frames). In the dungeon every dart hits like the 2D
game's single missile (51, plus gear); between wizards a dart deals 36. Scrolls are
magic missile scrolls 15% of the time until the third dart, and a trial's spoils may offer one;
your reflection has as many darts as you, and the dungeon's dark wizards have two from depth 3
and three from depth 6.

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

In a trial, instead of a global cooldown, a cast locks the rest of its school for the
school's lockout (table above), so spells of different schools can be woven back to back;
magic missile and lifesteal never lock (`DuelRules.schools`). Dungeon floors have no lockouts.

**Gear.** Wizards wear a hat, a robe, a staff and two rings, each with properties (more
health or manergy, faster regen, movement or cooldowns, armour, cheaper fireballs or
lightning, stronger missiles, lifesteal, mending, longer shields), and what is worn shows
on the model. `I` opens the inventory: the five worn slots, a bag of twenty, the wizard's
resulting stats, and the selected item compared with what it would replace; double-click
to wear or take off, or drop an item on the floor. You start in an apprentice's kit; the
2D game's rings and new gear drop from champions, and the orcs wear gear too (casters
now and then a hat or robe, champions often a ring or a robe, the orc mage a rare hat,
the cleric its mitre), which makes them tougher, faster or harder to hurt and drops when
they fall. Your reflection wears the Red Order's crimson kit but has your stats. The catalogue is `Gear` in
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
notices you, knows magic missile plus one random spell per floor below the first (no more than
a player that deep has slots on the bar), at rank II from depth 8 and III from depth 15, fights
as a hard rival from depth 6, and leaves a gold scroll when slain.

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

When a run ends it is posted to the backend (`/gamestates/gamesave`) like the 2D
game; `GET /api/ladder` and `GET /api/fastest-wins` read the scores back.

## Code layout

```
index.html, src/main.js     menu and start-up
src/game.js                 game state, the run's stages, spawning, aggro and navigation helpers
src/core/                   constants, rebindable input bindings, time stop, entity base class
src/world/                  dungeon generator, level plans and trials, pathfinder, collision
src/entities/               mage (spell book), spell bar, levels and ranks, orcs, mini-bosses
                            and warlord, duel wizard and reflection, battles, projectiles and
                            zones, loot and stairs
src/render/                 Three.js renderer, dungeon meshes, character and prop models,
                            textures and particle effects
public/models/              character models (.glb) built in Blender
tools/blender/              the Blender scripts that build them
src/ui/                     HUD, minimap, inventory and spellbook, controls screen
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
