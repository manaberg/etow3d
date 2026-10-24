etow3d
======

**End of the Worlds 3D**: a 3D remake of [eotw](https://github.com/manaberg/eotw), the
ImpactJS wizard-versus-orcs dungeon game, rebuilt with [Three.js](https://threejs.org).

Pre Alpha 0.1.0

The game plays like the original: the same ten-floor survival descent (now followed by ten
more, down through the dragons' lairs, with duels and battles against your own reflection
between the floors), the same spells, orc classes, mini-bosses, warlord and duel AI, with
the same numbers. It is now rendered
as a lit 3D dungeon seen from an angled camera that follows the mage and can be turned
all the way around it, so you can look ahead whichever way you go.

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

URLs work like the 2D game: `/?mode=survival` starts the descent and `/` shows the main menu.

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
**Controls** on the main menu, the pause screen or the HUD's micro menu (binding a key that is
taken swaps the two); magic missile and the bar's slots take their keys in the spellbook
instead (click the key under a slot, then press the new one). Two sliders on the Controls screen also set how fast the camera turns: by mouse drag and by the turn
keys, from 10% to 200%. Bindings and speeds are saved in the browser. `Esc` always pauses and the arrow keys always move.

| Key | Action |
| --- | --- |
| `W` `A` `S` `D` | move, relative to the camera (`W` walks the way the camera looks) |
| Mouse | aim |
| `LMB` (hold and drag) | turn the camera around the mage (left / right) and tilt it (up / down); it stays where you leave it |
| `Z` / `X` | turn the camera left / right |
| `V` | swing the camera back to the starting view, looking north |
| `RMB` (hold) | magic missile: darts that curve in on the foe nearest the cursor, one at first and up to three with magic missile scrolls (also shoot down stones, warlock bolts and, in the trials, the reflection's missiles) |
| `Q` `E` `F` `R` `2` `4` `1` `3` `C` `5` | the spells on your bar, slots 1 to 10 (see **Spellbook and bar** below) |
| `B` | spellbook: choose which spells sit on the bar and which keys cast them (the game waits while it is open) |
| `Tab` | battle: switch between spell mode and commander mode |
| Commander mode | click / drag to select regiments, right-click ground to march and hold, right-click an enemy to attack it, WASD pans (the way the camera looks) |
| `` ` `` | battle: select all regiments (or click the regiment cards) |
| `J` / `K` / `L` | battle: selected regiments charge / march to the cursor and hold / follow you |
| `Space` | descend the stairs |
| `LMB` on an item's name | survival: every item on screen shows its name on the floor, as in Diablo (tags that would overlap stack upwards); click a name (without dragging) to walk over and pick it up. Scrolls and potions are also picked up by walking over them (a health potion only while you are hurt); gear only by clicking. In the trials all loot is picked up by walking over it |
| `G` | survival: show item names on the floor, or only the one under the cursor |
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
trial. The main menu explains it all under **How the descent works**.

**Trials.** Your reflection (`src/entities/mirror.js`) is a wizard of your level with your
health, manergy, regeneration, speed, armour and magic missile darts, and as many spells as
you have on your bar, but its own: drawn at random from the circles your depth has reached
(table below), at the ranks of your spells. It wears the Red Order's crimson kit, so the two of
you can be told apart. Trials follow the duel rules: duel damage between the wizards, at full
strength (no `hitScale`), and the global cooldown. Both wizards start whole, on the duel scale
(your health times seven, `Trials.hpScale`, so a level 1 wizard has a duellist's 700), and the
share you have left when the trial ends carries on down the stairs, plus the stairs' usual
breather. Trials give no experience; win one and you take one of three spoils instead: a new
spell, another magic missile dart or a rank for a spell you know (one is a rank whenever there
is one to take). Fall and the run is over.

The reflection has the duel rival's brain: it reads the bolts in flight, scores escape
directions, shields or blinks out of hits it cannot dodge, picks tactics (kite, engage, punish,
pressure, retreat, hunt) and learns how far to lead its shots from how you dodge. It thinks
with an easy brain to depth 5, a normal one to depth 12 and a hard one below (`Trials.difficulty`;
`difficulties` in `src/entities/duelRules.js`): a normal brain reacts after 0.4 s, casts at
most every half second, aims loosely, learns slowly and never notices one bolt in five at all
(the easy brain misses one in three); a hard one notices every one.

**Duels.** Most are fought in a small dungeon of six themed rooms and corridors; you start in
the two rooms farthest apart. Walls block sight and bolts, so you can hide, flank and ambush,
and your reflection hunts you through the corridors when it loses you. A third are fought in
the arena, one open hall with no pillars, the wizards starting face to face from opposite ends.
Potions keep appearing around the map (`DuelLoot`), and whoever reaches one first drinks it;
the reflection runs for them when they are worth the trip.

**Battles.** One great battle, fought to the end: you and your reflection each lead a vast
army (blue against red) across open grassland ringed by cliffs. Battles grow with the
descent, like the floors and the reflection: about 300 a side in a battle below the first
floors, then a little over a sixth more every floor, until a battle below floor 19 fields the
largest armies, 5,000 a side: a battle below floor 4 brings about 480 a side, below floor 10
about 1,200 and below floor 16 about 3,100. There is nothing to choose; for testing,
`?army=N` in the URL sets the largest size to any other from 200 to 12,000. Dragons come one for about every 650 soldiers (at least one), and their ages
follow the dungeon's: wyrmlings from the start, young dragons below floor 6, adults below
floor 11 and ancients below floor 15 (`armySize` and `dragonAgesAt` in `BattleRules`). Where
a machine cannot keep up, the battle runs in slow motion.

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
nearest 24 in a battle). The reflection commands its own regiments (line charges, knights
flank, mystics guard it). The battle is won when the reflection falls or its army, dragons
included, is destroyed; if your army is destroyed you escape down the stairs without the
spoils. Battle soldiers have double the dungeon orcs' health.

Armies this size are simulated and drawn with care for speed. Soldiers find foes and
neighbours through a spatial grid rebuilt every step by counting sort, and bolts, zones and
splashes only look at the grid cells around them. Soldiers are drawn instanced
(`src/render/armyRenderer.js`): near the camera the full model with swinging limbs, further
off a coarse copy in one piece, and nothing off screen; the armies' arrows, stones and bolts
are instanced too (`src/render/boltRenderer.js`).

**Dungeon floors.** Twenty floors, from The Upper Halls down to the Throne of the Warlord and on
through the dragons' lairs to The Golden Hoard (`DungeonLevels` in `src/world/levels.js`). Every floor
is a freshly generated dungeon of themed rooms joined by corridors, laid out and dressed after
the floor's name (see **The floors** below). The stairs down wait in the room farthest from the
start (the throne room, which every floor names its own way) and unseal once 40% of the floor's
enemies are slain. Spells are learnt from scrolls into the
spellbook, and kills level the wizard up (see **Spellbook and bar**). Potions heal or raise
maximum manergy. Spells, ranks, the bar, level, gear and stats carry down the stairs.
Besides the 2D game's spells, scrolls teach ten D&D spells new to the 3D game (scorching ray
to spiritual weapon in the table below). Reflections use them too.

**The floors.** Each floor has a look (`src/world/looks.js`): the shape of its rooms and
corridors, what its floors, walls and pillars are made of, its water, lava or chasms, its light,
fog and drifting particles, its props and its room names. The first floor is the classic
dungeon; every floor below gets stranger. Duel trials keep the classic look.

| Depth | Floor | Laid out as | Looks like |
| --- | --- | --- | --- |
| 1 | The Upper Halls | rectangular halls, straight corridors | flagstones, brick, torches, banners, barrels, rugs |
| 2 | The Warrens | small caves joined by narrow, crooked, looping tunnels | dirt, low rough rock, timber shoring, lanterns, roots |
| 3 | The Muster Halls | big halls lined with colonnades, wide corridors | tiles, dressed stone, braziers, war banners, racks, dummies |
| 4 | The Bone Crypts | cross and octagon chapels, narrow passages | slate, walls of skulls, green candles, sarcophagi, bones |
| 5 | The Sunken Library | aisles of bookshelves, flooded pools | wet parquet, walls of books, pale candles, dripping water |
| 6 | The Iron Forges | a channel of molten iron across the map, furnaces for pillars | iron plates, anvils, chains, caged lamps, sparks |
| 7 | The Blood Pits | round arenas around sunken pools of blood, a grand arena | red sand, braziers, spikes, cages, skulls on pikes |
| 8 | The Shadow Vaults | octagonal vaults with bottomless shafts | obsidian, glowing runes, violet crystals, hooded statues; little light |
| 9 | The Burning Deep | caves cut by a river and pools of lava | basalt with glowing cracks, walls hot at the foot, fire vents, embers |
| 10 | Throne of the Warlord | a mirrored fortress, the throne hall facing the gate | marble, carpeted corridors, skull banners, braziers, statues |
| 11 | The Scorched Galleries | long galleries with piers along their walls | charred tiles, glowing soot-streaked brick, burnt paintings, falling ash |
| 12 | The Frozen Cisterns | cisterns forested with ice columns, holes in the ice | ice, frosted stone, icicles, ice crystals, snow |
| 13 | The Storm Halls | tall cross-shaped halls ringed with lightning rods | wet slate, puddles, rain, lightning striking the rods |
| 14 | The Venom Mires | drowned caves full of poisoned pools | mud, mossy rock, giant glowing mushrooms, reeds, spores |
| 15 | The Black Pools | round chambers drowned in tar, islands joined by causeways | obsidian, glossy black pools, violet crystals, monoliths |
| 16 | The Wyrm Warrens | great caverns joined by wide clawed-out burrows | scorched earth, claw-marked rock, nests of eggs, giant bones |
| 17 | The Hoard Vaults | mirrored vaults of heavy piers | gold-veined marble, gold-banded walls, coins, chests, glitter |
| 18 | The Ashen Deep | caves of ash over ruins, chasms lit from below | grey ash, broken columns, dead trees, falling ash |
| 19 | The Boneyard of Kings | yards and tombs, giant ribcages arching over aisles | bone dust, giant skulls, royal sarcophagi, statues, mist |
| 20 | The Golden Hoard | a vast golden cavern for the wyrm | floors of coins, heaps of gold, chests, crowns, gems |

Water, blood, mire, tar, lava, molten iron and chasms are low ground: they stop anything on
foot, the mage included, but bolts, breath and sight pass over them, and blink can cross them.
Corridors cross them on bridges, and the generator bridges any pocket that would otherwise be
cut off, so every floor can be walked from end to end.

**Spellbook and bar.** Every spell a wizard learns goes into its spellbook, but only the spells
on its bar can be cast. Magic missile has its own key (RMB); the bar's ten slots sit on Q, E,
F, R, 2, 4, 1, 3, C and 5, in that order, and `B` opens the spellbook to arrange them
(`src/entities/spellbar.js`, `src/ui/spellbook.js`).

- The HUD is laid out like WoW's: your unit frame (health, manergy, level) at the top left with
  your reflection's beside it in trials, the minimap at the top right, and the action bar
  along the bottom: magic missile, then the bar's slots, each an icon of its spell
  (`src/ui/spellIcons.js`) with its key, rank and charges, a cooldown that sweeps round the
  icon (seconds left on long ones), a blue tint when manergy is short, and a tooltip with the
  spell's cost, cooldown, school and effect. Your experience runs along the top of the
  bar. The micro menu at the bottom right opens the spellbook (it glows while spells wait in
  the book and the bar has room), the inventory, the larger map, the controls and the pause
  screen. Clicking a button of the action bar opens the spellbook on that slot.
- The spellbook shows the bar with the key of every slot under it, every spell you know as a
  grid of icons, and the selected spell's details. Drag a spell onto a slot (in the book or on
  the HUD's action bar) to prepare it, drag slots onto each other to swap them, and drag a
  slot's spell back onto the book to take it off; clicking a spell and then a slot, or double
  clicking, works too. Click the key under a slot (or under magic missile) and press a key or
  mouse button to bind it; a key another action had moves to the slot's old key, and
  **Default keys** puts the spell keys back.

- A new spell goes into the first free slot that suits it: spells with a cooldown of 6.7 s or
  less fill the bar in order from Q, slower ones the number row (4, 1, 3, C, 5) once it opens
  and the first free slot from Q before that. With the bar full it waits in the book.
- A spell brought onto the bar from the book starts on its cooldown (at least 3 s), so swapping
  mid-fight is never free. Moving spells along the bar is free, and the cooldown stays with the
  spell.
- **Levels.** Every kill on a dungeon floor gives experience (the square root of the foe's health,
  three times that for a dark wizard), and each level adds 6 health and 4 manergy. The bar
  opens with three slots (Q, E, F); R opens at level 2, 2 at 4, then 4, 1, 3 and C at 6, 8,
  10 and 12, and 5 at 15, the last level. Slaying about 60% of every floor reaches level 10 on
  the warlord's floor and 15 on the last (`WizardLevels`). A slot that opens takes the newest
  spell waiting in the book. Trials give no experience.
- **Circles.** A scroll (or a trial's spoils, or a reflection's spells) only comes from the
  circles its floor has reached: circle I from floor 1, II from floor 3, III from floor 6 and
  IV from floor 9 (table below).
  While those circles hold spells you do not know, two scrolls in three teach one of them
  (the rest may still), so ranks come once the new spells run out. A slain dark wizard's
  scroll is the exception: it teaches one of its own spells, whatever its circle.
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
| power word kill (hover an enemy; a one-second cast standing still, which a root, fear or polymorph breaks off) | IV | a wider, deeper splash |

**Magic missile tiers.** Magic missile grows with its scrolls (its ranks; `MissileTiers` in
`src/entities/spells.js`): one dart at first, then two, then three, each tier casting a
little slower (cooldown 24, 34 and 44 frames). In the dungeon every dart hits like the 2D
game's single missile (51, plus gear); between wizards a dart deals 36. Scrolls are magic
missile scrolls 15% of the time until the third dart, and a trial's spoils may offer one; your
reflection has as many darts as you, and the dungeon's dark wizards have two from depth 3 and
three from depth 6.

**Global cooldown.** Every spell but magic missile holds back all the others (magic missile
aside) for one second, on every floor and in every trial and for every wizard, on top of its
own cooldown; the bar shows the wait on each slot (`GLOBAL_COOLDOWN` in `src/entities/spellbar.js`). Lifesteal pays
it once when the ray starts, not while it is held.

Every spell belongs to a school of magic, shown beside it in the spellbook:

| School | Spells |
| --- | --- |
| Evocation | magic missile, fireball, chain lightning, scorching ray, cone of cold, thunderwave, meteor swarm |
| Conjuration | iron shot, blink, blizzard, cloudkill, spiritual weapon |
| Abjuration | shield, spirit guardians, healing word |
| Transmutation | haste, time stop, polymorph, disintegrate, telekinesis |
| Enchantment | chain root, fear |
| Illusion | mirror image, invisibility |
| Necromancy | lifesteal, power word kill |

**Gear.** Wizards wear a hat, a robe, a staff and two rings, and what is worn shows on the
model. Loot is rolled as in Diablo (`src/entities/gear.js`):

- **Bases.** Five kinds of hat (pointed hats, wide brims, cowls, mitres, circlets), four of
  robe, five of staff and rings, each in three grades found from floors 1, 6 and 12
  (POINTED HAT, CONJURER'S HAT, ARCHON'S HAT), with a property of its own that grows with
  the grade.
- **Rarity.** Common gear (white) is the base alone. Magic gear (blue) adds a prefix and/or a
  suffix, named after them: BLAZING CONJURER'S HAT OF THE FOX. Rare gear (yellow) has three
  to five affixes under a random name such as GLOOM VISAGE. Each affix comes in grades that
  deeper floors unlock (OF THE JACKAL, FOX, WOLF, TIGER, MAMMOTH for health), and the first
  one tints the item (rare gear glows in it). Rings are always magic or better.
- **Properties.** Health, manergy and their regeneration, movement, armour, cooldowns,
  cheaper spells, spell damage and damage by element (fire, cold, lightning, poison,
  necrotic, radiant, force, iron), missile damage, cheaper fireballs and lightning,
  lifesteal, mending, longer shields, health or manergy per kill, more experience, stronger
  potions, better items found, and shorter roots, fear and polymorph.
- **Sets** (green): seven, from the Wanderer's Garb (from floor 1) to the Archmage's Regalia
  (floor 10), each two to four named pieces whose bonuses grow with every different piece
  worn. The inventory lists a set's pieces and bonuses, the earned ones lit.
- **Uniques** (orange): twenty-one named items with fixed properties and a story, some with a
  price (JESTER'S FOLLY: more experience and better finds for less health).

Deeper floors favour the rarer kinds. `I` opens the inventory: the five worn slots, a bag of
twenty, the wizard's resulting stats, and the selected item (its base, properties and set)
compared with what it would replace; double-click to wear or take off, or drop an item on
the floor. You start in an apprentice's kit; the 2D game's rings and new gear drop from
champions, and the orcs wear gear too (casters now and then a hat or robe, champions often
a ring or a robe, the orc mage a rare hat, the cleric the High Priest's Mitre), which makes
them tougher, faster or harder to hurt and drops when they fall. Your reflection wears the Red
Order's crimson kit but has your stats. The catalogue is `Gear` in
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
notices you and knows magic missile plus random spells from the circles its floor has reached,
as your scrolls do: one every second floor to depth 5 (two there), then one more each floor (no
more than a player that deep has slots on the bar), at rank II from depth 8 and III from depth
15. It fights with an easy brain (slow to react, loose aim) to depth 5 and a normal one below,
moves at your pace, and its root, fear and polymorph hold you half as long as in a duel. When
slain it leaves a gold scroll and a scroll of one of its own spells (one it cast, and one you
do not know if it can), so beating it is the way to deeper magic early.

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
src/world/                  dungeon generator, level plans and trials, floor looks, pathfinder, collision
src/entities/               mage (spell book), spell bar, levels and ranks, orcs, mini-bosses
                            and warlord, duel wizard and reflection, battles, projectiles and
                            zones, loot and stairs
src/render/                 Three.js renderer, dungeon meshes, props, ambience, character
                            models, textures and particle effects
public/models/              character models (.glb) built in Blender
tools/blender/              the Blender scripts that build them
src/ui/                     HUD, minimap, inventory and spellbook, spell icons, controls screen
backend/                    Express + SQLite score server (shared with eotw)
```

The simulation runs at a fixed 60 steps per second and keeps the 2D game's units: positions
in pixels on the ground plane (a 24px collision tile is one 3D unit) and timers in frames, so
the original balance carries over unchanged. Textures and props are procedural: dungeon props
are built from primitives and drawn instanced, a chunk of the map at a time.

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
- Every survival floor below the first is laid out and dressed after its name, with water,
  lava and chasms that stop walkers but not bolts (see **The floors**).
