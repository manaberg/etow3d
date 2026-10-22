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
not saved. It is published that way on Firebase Hosting, at https://etow3d.web.app; see
**Deploying** below.

URLs work like the 2D game: `/?mode=survival` starts the descent, `/?mode=duel&ai=normal|hard|insane`
starts a duel, and `/` shows the main menu.

## Deploying

The game is published as a static site on Firebase Hosting, at https://etow3d.web.app: the
`etow3d` site of the `flubber-8ae55` Firebase project, which also hosts the flubber
generator (https://flubber-8ae55.web.app) and the naval game (https://battlesea.web.app).
Only the built game goes up (`dist/`); the score backend is not deployed there, so runs are
not saved online. `firebase.json` names the site, the folder and the cache headers (no-cache,
except the hashed files in `/assets`), `.firebaserc` the project. Deploy from `main`:

```sh
git checkout main && git pull
npm install
FIREBASE_SERVICE_ACCOUNT=... npm run deploy     # builds, then publishes dist/
npm run build && node scripts/deploy-hosting.mjs --dry-run   # only lists the files
```

`npm run deploy` builds the game and publishes `dist/` with `scripts/deploy-hosting.mjs`,
which talks to the Hosting API directly. It needs `FIREBASE_SERVICE_ACCOUNT`: the
`flubber-8ae55` service account key (Firebase console, Project settings, Service accounts),
as the JSON itself or base64 of it. Keep the key out of the repo.

With your own Google login instead, the Firebase CLI reads the same config:
`npm run build && npx firebase-tools deploy --only hosting:etow3d`. The CLI does not work
with the service account: it first asks the Service Usage API whether Hosting is enabled,
which that account may not do, hence the script.

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

Three modes; the main menu explains each in full under **How each mode works**.

**Battle.** One great battle, fought to the end: you and a rival wizard each lead a vast
army (blue against red) across open grassland ringed by cliffs. The menu sets the size,
about 3,000, 5,000 (the default), 8,000 or 12,000 a side (`?army=N` in the URL sets any
other from 200 to 12,000); where a machine cannot keep up, the battle runs in slow motion.

Both armies are random but equal (`BattleRules` in `src/entities/battle.js`). Each side is a
different race, drawn at random, and rolls its own mix of regiment types around their usual
shares (a rarer type may stay home), but both armies are bought with the same budget of
points: every class has a price (`classCost`, a grunt 0.85 and a warlock 3.2) and every race
a multiplier (`raceCost`), so a costly army is a smaller one. The prices were tuned by
fighting armies against each other with the wizards left out: matched race against race and
mix against mix, on both sides of the field, they come out about as even as two identical
armies do. The races share the orcs' seven classes
under their own names, models and missiles (`Races` in `src/world/levels.js`): dwarves are
slow and take 30% more killing and shoot crossbows; humans are a little tougher, harder
hitting and longer ranged than orcs; elves are quick and shoot a quarter further and
straighter, but are frail.

Dragons fight on both sides (`src/entities/battleDragon.js`): one for about every 650
soldiers, the same ages for both armies (wyrmlings to ancients) in random colours. They
follow their regiment's orders like soldiers, fly over the lines to reach a foe, breathe
through whole regiments (fire and acid leave burning ground and pools, poison a cloud, frost
a blizzard, lightning stuns), and the older ones sweep with their tails, beat their wings,
roar foes into flight and cast their colour's spell. Soldiers on foot cannot reach a dragon
in the air, but archers and spells can. Their bites and breath hit soldiers five times as
hard as they would the mage (`dragonVsTroops`), and they have twice their dungeon health.

Armies are split into regiments by type (infantry, slingers, knights, shock troops, mystics,
dragons), about sixteen a side, each with a banner, deployed in lines with yours along the
bottom of the screen facing up the field; you have 25 seconds to rearrange them before the
battle starts (Space starts it early). Tab switches between spell mode (you play the wizard)
and commander mode (the wizard stands, the camera roams and zooms far out, click or drag to
select regiments, right-click to march them or to attack an enemy regiment); the J/K/L keys
(charge, march and hold, follow) work in both. Soldiers fight by class (brawlers close in,
slingers and warlocks keep range, knights charge, shamans heal) and you turn the fight with
spells: fireballs and blizzards into packed ranks, lightning chaining through them (to the
nearest 24 in a battle). The rival commands its own regiments (line charges, knights flank,
mystics guard it). Both wizards start with ten random spells on a ten-slot bar and a
three-dart magic missile, and duel rules apply between them, including the school lockouts.
The battle is lost when your wizard falls or your army, dragons included, is destroyed.
Battle soldiers have double the dungeon orcs' health.

Armies this size are simulated and drawn with care for speed. Soldiers find foes and
neighbours through a spatial grid rebuilt every step by counting sort, and bolts, zones and
splashes only look at the grid cells around them. Soldiers are drawn instanced
(`src/render/armyRenderer.js`): near the camera the full model with swinging limbs, further
off a coarse copy in one piece, and nothing off screen; the armies' arrows, stones and bolts
are instanced too (`src/render/boltRenderer.js`).

**Survival.** Twenty floors, from The Upper Halls down to the Throne of the Warlord and on
through the dragons' lairs to The Golden Hoard (`DungeonLevels` in `src/world/levels.js`). Every floor
is a freshly generated dungeon of themed rooms (great hall, orc barracks, forbidden library,
alchemy lab, crypt, throne room) joined by corridors. The stairs down wait in the throne room
and unseal once 40% of the floor's enemies are slain. Spells are learnt from scrolls into the
spellbook, and kills level the wizard up (see **Spellbook and bar**). Potions heal or raise
maximum manergy. Spells, ranks, the bar, level, gear and stats carry down the stairs.
Besides the 2D game's spells, scrolls teach ten D&D spells new to the 3D game (scorching ray
to spiritual weapon in the table below). Duels and battles use them too.

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
- **Levels** (survival). Every kill gives experience (the square root of the foe's health,
  three times that for a dark wizard), and each level adds 6 health and 4 manergy. The bar
  opens with three slots (RMB, Q, E); R opens at level 2, F at 4, then 1, 2, 3 and 4 at 6, 8,
  10 and 12, and C at 15, the last level. Slaying about 60% of every floor reaches level 10 on
  the warlord's floor and 15 on the last (`WizardLevels`). A slot that opens takes the newest
  spell waiting in the book. Duels and battles have no levels: progressive duels open six
  slots, classic duels eight and battles all ten.
- **Circles** (survival). A scroll only teaches spells of the circles its floor has reached:
  circle I from floor 1, II from floor 3, III from floor 6 and IV from floor 9 (table below).
- **Ranks.** A scroll for a spell you know raises its rank, to III; a gold scroll raises a spell
  on your bar. Magic missile's ranks are its darts. Fireball, chain lightning, iron shot, blink,
  blizzard and power word kill have their own rank II (the 2D game's tier 2 upgrades); every
  other spell's rank II adds 30% to its main number (damage, duration, reach or healing), or,
  for chain root, mirror image and telekinesis, cuts its cooldown by a quarter. Rank III cuts
  every spell's cooldown by a quarter (`RankRules`). Duels are fought with the tier 2 spells,
  so those start at rank II there.

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
game's single missile (51, plus gear); between wizards a dart deals 36. Survival scrolls are
magic missile scrolls 15% of the time until the third dart; progressive duels start both
wizards at one dart (scrolls add more), classic duels and battles give
both all three, and the dungeon's dark wizards have two from depth 3 and three from depth 6.

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

**Duel.** You against a rival wizard in a small dungeon of six themed rooms and corridors (no
stairs); you start in the two rooms farthest apart. Walls block sight and bolts, so you can
hide, flank and ambush, and the rival hunts you through the corridors when it loses you.
The **arena** map (`?map=arena`, or the Rooms / Arena toggle on the menu) is the old
straightforward duel instead: one open hall with no pillars, the wizards starting face to
face from opposite ends.
In **progressive** duels (the default) each wizard starts with a one-dart magic missile and
one random spell; scrolls and potions keep appearing around the map, and whoever reaches a
scroll first learns a spell they lack or adds a magic missile dart until their six bar slots
are full, and after that raises a spell's rank (potions heal or restore manergy). The rival
runs for loot when it is worth it and tells you what it learned. **Classic** duels
(`?rules=classic`, or the toggle on the menu) put every spell in the book, the ten D&D spells
included: the duel opens on the spellbook to choose the eight spells for your bar (free until
you start; the last loadout is remembered), and shows the eight the rival brings (shield, blink
and fireball, and five at random).
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
src/entities/               mage (spell book), spell bar, levels and ranks, orcs, mini-bosses
                            and warlord, duel wizard, projectiles and zones, loot and stairs
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
