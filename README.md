etow3d
======

**End of the Worlds 3D**: a 3D remake of [eotw](https://github.com/manaberg/eotw), the
ImpactJS wizard-versus-orcs dungeon game, rebuilt with [Three.js](https://threejs.org).

Pre Alpha 0.1.0

The game plays like the original: the same ten-floor survival descent, the same spells,
orc classes, mini-bosses, warlord and duel AI, with the same numbers. It is now rendered
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

| Key | Action |
| --- | --- |
| `W` `A` `S` `D` | move |
| Mouse | aim |
| `LMB` (hold) | magic missile |
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
| `Space` | descend the stairs |
| Mouse wheel | zoom |
| `M` | larger map |
| `Esc` / `P` | pause |

## The game

**Survival.** Ten floors, from The Upper Halls down to the Throne of the Warlord. Every floor
is a freshly generated dungeon of themed rooms (great hall, orc barracks, forbidden library,
alchemy lab, crypt, throne room) joined by corridors. The stairs down wait in the throne room
and unseal once half of the floor's enemies are slain. Spells are learnt from scrolls; tier 2
scrolls upgrade fireball, lightning, iron shot, blink and blizzard. Potions heal or raise
maximum manergy, and rings add passive effects. Spells, rings and stats carry down the stairs.

Orcs guard their rooms until they see, hear or get hit by the player, then rally the pack
and hunt through the dungeon on flow-field paths. Classes: grunt, slinger, knight (charges),
shaman (heals), berserker (enrages), brute and warlock (casts bolts); deeper orcs are tougher
and champions always drop loot. Orc clerics and orc mages appear from depth 4 and 5, and the
warlord waits on the tenth floor.

**Duel.** A one-room arena where both wizards have every spell. The rival wizard reads the
bolts in flight, scores escape directions, shields or blinks out of hits it cannot dodge,
picks tactics (kite, engage, punish, pressure, retreat, hunt) and learns how far to lead its
shots from how you dodge. Normal, hard and insane differ in reaction time, aim and tricks.

When a survival run ends it is posted to the backend (`/gamestates/gamesave`) like the 2D
game; `GET /api/ladder` and `GET /api/fastest-wins` read the scores back.

## Code layout

```
index.html, src/main.js     menu and start-up
src/game.js                 game state, floors, spawning, aggro and navigation helpers
src/core/                   constants, input bindings, time stop, entity base class
src/world/                  dungeon generator, level plans, pathfinder, collision
src/entities/               mage (spell book), orcs, mini-bosses and warlord, duel wizard,
                            projectiles and zones, loot and stairs
src/render/                 Three.js renderer, dungeon meshes, procedural models,
                            textures and particle effects
src/ui/                     HUD, minimap
backend/                    Express + SQLite score server (shared with eotw)
```

The simulation runs at a fixed 60 steps per second and keeps the 2D game's units: positions
in pixels on the ground plane (a 24px collision tile is one 3D unit) and timers in frames, so
the original balance carries over unchanged. All models and textures are procedural; there
are no image assets.

## Differences from the 2D game

- Bodies slide along walls instead of stopping (and orcs no longer die on wall contact).
- The caster of a time stop, and their spells, are not slowed by it.
- A shield turns reflected bolts against their caster's side.
- Chain lightning and chain root can hit the same orc again after a short delay.
