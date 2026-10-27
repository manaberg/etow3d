// How each survival floor is laid out and how it looks, after its name: the
// shape of its rooms and corridors (DungeonGenerator options), what its
// floors, walls and pillars are made of, its water, lava or chasms, its
// light, air and props, and what its rooms are called. The deeper the floor,
// the stranger it gets. Duels keep the classic look.
//
//   layout     DungeonGenerator options (shapes, pillars, pools, river...)
//   mapScale   map size against the plain formula in Game.buildWorld
//   rooms      room names by theme (the HUD shows them, the banner names the
//              throne room, where the stairs wait)
//   wallHeight in world units
//   themeMix   how much of each room theme's own colour shows (0..1)
//   dressing   the classic theme props (throne, shelves, cauldron, coffins,
//              crates): true, or a list of the themes that keep theirs
//   floor      { tex, color, corridor, shine, mottle, glow: { color, map } }
//   wall       { tex, corridorTex, color, corridor, cap, rough, glow }
//   pillar     how free-standing pillars are drawn (render/props.js)
//   liquid     low ground: { kind, bridge } (render/dungeonMesh.js Liquids)
//   light      the fixture that lights the rooms, where it goes and its light
//   sky        hemisphere and ambient light, fog, exposure, the staff's light
//   particles  ambient particles around the camera (render/ambience.js)
//   props      decoration: { kind, place, every|chance|per, themes }
//   storm      lightning strikes now and then

const CLASSIC_ROOMS = {
  hall: 'GREAT HALL', barracks: 'ORC BARRACKS', library: 'FORBIDDEN LIBRARY',
  alchemy: 'ALCHEMY LAB', crypt: 'CRYPT', throne: 'THRONE ROOM'
};

export const ClassicLook = {
  id: 'classic',
  layout: {},
  mapScale: 1,
  rooms: CLASSIC_ROOMS,
  wallHeight: 3.4,
  themeMix: 1,
  dressing: true,
  floor: { tex: 'flagstone', color: 0x5d5a57, corridor: 0x4f4a45 },
  wall: { tex: 'brick', color: 0x6a645c, corridor: 0x5a554e, cap: 0x2e2b28 },
  pillar: 'column',
  liquid: null,
  light: { prop: 'torch', place: 'north', every: 4, color: 0xffb36b },
  sky: { hemi: [0x9aa0c0, 0x30241a, 1.9], ambient: [0x505060, 0.9], fog: [0x07070a, 26, 58], exposure: 1.15, player: [0xffd9a8, 1] },
  particles: [],
  props: []
};

const FloorLooks = [
  // 1: the familiar halls under the surface, warm and well kept
  {
    id: 'upperHalls',
    layout: { minRoomW: 9, maxRoomW: 13, minRoomH: 7, maxRoomH: 10, pillars: 'corners', hallPillars: false },
    rooms: CLASSIC_ROOMS,
    themeMix: 0.45,
    dressing: true,
    floor: { tex: 'flagstone', color: 0x72695c, corridor: 0x5c554b },
    wall: { tex: 'brick', color: 0x7e705e, corridor: 0x685e50, cap: 0x2e2b28 },
    pillar: 'column',
    light: { prop: 'torch', place: 'north', every: 4, color: 0xffb060 },
    sky: { hemi: [0xa8a8c0, 0x34281c, 2.0], ambient: [0x585460, 0.95], fog: [0x0a0806, 28, 62], exposure: 1.18, player: [0xffd9a8, 1] },
    particles: [{ kind: 'dust', rate: 5, color: 0x8a7a60 }],
    props: [
      { kind: 'banner', place: 'north', every: 4, offset: 2 },
      { kind: 'barrel', place: 'corner', chance: 0.45, themes: ['barracks', 'alchemy', 'hall'] },
      { kind: 'crate', place: 'corner', chance: 0.3 },
      { kind: 'rug', place: 'center', themes: ['hall', 'library'] }
    ]
  },
  // 2: burrows dug by hand, cramped and crooked, shored up with timber
  {
    id: 'warrens',
    layout: {
      shapes: { cave: 1 }, startShape: 'cave', throneShape: 'cave',
      minRoomW: 8, maxRoomW: 12, minRoomH: 7, maxRoomH: 10,
      corridorWidth: 2, winding: 0.85, erode: 0.32, extraLoopChance: 0.7, pillars: 'scatter'
    },
    rooms: { hall: 'BURROW MOUTH', barracks: 'SLEEPING DEN', library: 'SCROLL HOARD', alchemy: 'FUNGUS CELLAR', crypt: 'BONE PIT', throne: "CHIEFTAIN'S DEN" },
    wallHeight: 2.8,
    themeMix: 0.18,
    floor: { tex: 'dirt', color: 0x806446, corridor: 0x70563c, mottle: 0.25 },
    wall: { tex: 'rock', color: 0x8a6c50, corridor: 0x7a6046, cap: 0x3a2c20, rough: 0.35 },
    pillar: 'stalagmite',
    light: { prop: 'lantern', place: 'wall', every: 5, color: 0xffa24a, power: 0.95, range: 13 },
    sky: { hemi: [0x9c8a74, 0x2a1c10, 1.85], ambient: [0x4e3e2e, 0.9], fog: [0x0a0704, 22, 50], exposure: 1.15, player: [0xffd0a0, 1] },
    particles: [{ kind: 'dust', rate: 9, color: 0x7a6040 }],
    props: [
      { kind: 'beam', place: 'corridor', every: 5 },
      { kind: 'roots', place: 'north', every: 3 },
      { kind: 'mound', place: 'wall', chance: 0.07 },
      { kind: 'mushrooms', place: 'wall', chance: 0.05, themes: ['alchemy', 'crypt', 'library', 'barracks'] },
      { kind: 'bones', place: 'floor', per: 40 }
    ]
  },
  // 3: the orcs' parade halls: broad, square and lined with columns
  {
    id: 'muster',
    layout: { minRoomW: 10, maxRoomW: 15, minRoomH: 8, maxRoomH: 11, corridorWidth: 4, pillars: 'colonnade', extraLoopChance: 0.3 },
    mapScale: 1.08,
    rooms: { hall: 'PARADE GROUND', barracks: 'BARRACKS', library: 'WAR ROOM', alchemy: 'FIELD HOSPITAL', crypt: 'HALL OF THE FALLEN', throne: "MARSHAL'S HALL" },
    wallHeight: 3.8,
    themeMix: 0.22,
    dressing: ['throne'],
    floor: { tex: 'tiles', color: 0x7a766e, corridor: 0x66625c },
    wall: { tex: 'blocks', color: 0x8a867c, corridor: 0x74706a, cap: 0x2c2a28 },
    pillar: 'pier',
    light: { prop: 'brazier', place: 'corner', color: 0xffa040, power: 1.1, range: 15 },
    sky: { hemi: [0xa4aac4, 0x34281c, 2.15], ambient: [0x5a5a64, 1.0], fog: [0x09090b, 30, 66], exposure: 1.18, player: [0xffd9a8, 1] },
    particles: [{ kind: 'embers', rate: 3, color: 0xffa040 }, { kind: 'dust', rate: 3, color: 0x807870 }],
    props: [
      { kind: 'banner', place: 'north', every: 3, offset: 1, color: 0x8a1a1a },
      { kind: 'rack', place: 'wall', chance: 0.1 },
      { kind: 'dummy', place: 'floor', per: 45, themes: ['hall', 'barracks'] },
      { kind: 'shields', place: 'wall', chance: 0.05 },
      { kind: 'barrel', place: 'corner', chance: 0.25 }
    ]
  },
  // 4: chapels of the dead in cross and octagon, walls of skulls, cold light
  {
    id: 'crypts',
    layout: {
      shapes: { cross: 3, octagon: 2, rect: 1 }, startShape: 'octagon', throneShape: 'cross',
      minRoomW: 9, maxRoomW: 13, minRoomH: 9, maxRoomH: 13, corridorWidth: 2, extraLoopChance: 0.25
    },
    mapScale: 1.04,
    rooms: { hall: 'BURIAL GATE', barracks: 'GUARD CRYPT', library: 'SCRIPTORIUM', alchemy: 'EMBALMING ROOM', crypt: 'OSSUARY', throne: 'HIGH SEPULCHRE' },
    wallHeight: 3.2,
    themeMix: 0.18,
    floor: { tex: 'slate', color: 0x52575c, corridor: 0x464a4e },
    wall: { tex: 'skulls', corridorTex: 'blocks', color: 0x9a9480, corridor: 0x6a6a64, cap: 0x26282a },
    pillar: 'column',
    light: { prop: 'candles', place: 'north', every: 4, color: 0xa8ffcc, power: 0.85, range: 12 },
    sky: { hemi: [0x84a4a4, 0x101818, 1.6], ambient: [0x344646, 0.9], fog: [0x0a1210, 22, 48], exposure: 1.12, player: [0xe0ffe8, 0.95] },
    particles: [{ kind: 'wisps', rate: 4, color: 0x60c090 }],
    props: [
      { kind: 'sarcophagus', place: 'wall', chance: 0.1 },
      { kind: 'skulls', place: 'corner', chance: 0.6 },
      { kind: 'bones', place: 'floor', per: 20 },
      { kind: 'urn', place: 'wall', chance: 0.05 }
    ]
  },
  // 5: a library the water got into: aisles of shelves, pools, dripping
  {
    id: 'library',
    layout: {
      minRoomW: 10, maxRoomW: 14, minRoomH: 9, maxRoomH: 12, pillars: 'shelves',
      pools: { chance: 0.75, count: [1, 2], radius: [1.5, 2.6], margin: 2 }
    },
    mapScale: 1.08,
    rooms: { hall: 'FLOODED ATRIUM', barracks: "SCRIBES' DORMITORY", library: 'SUNKEN STACKS', alchemy: 'INK DISTILLERY', crypt: 'DROWNED ARCHIVE', throne: 'GRAND READING ROOM' },
    wallHeight: 3.8,
    themeMix: 0.12,
    floor: { tex: 'planks', color: 0x7e6044, corridor: 0x6a5240, shine: 0.6 },
    wall: { tex: 'books', corridorTex: 'blocks', color: 0xd0c0a8, corridor: 0x707478, cap: 0x2a2018 },
    pillar: 'shelf',
    liquid: { kind: 'water', bridge: 'wood' },
    light: { prop: 'candles', place: 'north', every: 4, color: 0x8ae0ff, power: 0.9, range: 12 },
    sky: { hemi: [0x80aabb, 0x18242e, 1.9], ambient: [0x2e4654, 1.0], fog: [0x061014, 24, 54], exposure: 1.14, player: [0xd8f0ff, 1] },
    particles: [{ kind: 'drips', rate: 12, color: 0x80c0e0 }, { kind: 'motes', rate: 4, color: 0x5090b0 }],
    props: [
      { kind: 'books', place: 'floor', per: 22 },
      { kind: 'pages', place: 'floor', per: 16 },
      { kind: 'lectern', place: 'wall', chance: 0.05 }
    ]
  },
  // 6: iron and fire: furnaces, anvils and a channel of molten metal
  {
    id: 'forges',
    layout: { minRoomW: 11, maxRoomW: 16, minRoomH: 9, maxRoomH: 12, river: { width: [2, 2], meander: 0.45 } },
    mapScale: 1.08,
    rooms: { hall: 'FOUNDRY GATE', barracks: "SMITHS' QUARTERS", library: 'PATTERN ROOM', alchemy: 'QUENCHING VATS', crypt: 'SLAG HEAP', throne: 'GREAT FORGE' },
    wallHeight: 3.6,
    themeMix: 0.12,
    floor: { tex: 'plates', color: 0x7e7a76, corridor: 0x6a6662 },
    wall: { tex: 'iron', color: 0x867c76, corridor: 0x726a66, cap: 0x1a1816 },
    pillar: 'furnace',
    liquid: { kind: 'metal', bridge: 'iron' },
    light: { prop: 'cagelamp', place: 'north', every: 5, color: 0xff8a40, power: 1, range: 14 },
    sky: { hemi: [0xb09484, 0x301810, 1.9], ambient: [0x543828, 1.0], fog: [0x120804, 24, 56], exposure: 1.2, player: [0xffd8b0, 1] },
    particles: [{ kind: 'sparks', rate: 10, color: 0xffb040 }, { kind: 'embers', rate: 5, color: 0xff7020 }],
    props: [
      { kind: 'anvil', place: 'floor', per: 50 },
      { kind: 'chains', place: 'north', every: 5, offset: 2 },
      { kind: 'ore', place: 'corner', chance: 0.5 },
      { kind: 'barrel', place: 'wall', chance: 0.04 }
    ]
  },
  // 7: round fighting pits, each with a sunken pool of blood, sand and spikes
  {
    id: 'bloodPits',
    layout: {
      shapes: { round: 1 }, startShape: 'round', throneShape: 'round', throneSize: [17, 17],
      minRoomW: 11, maxRoomW: 14, minRoomH: 11, maxRoomH: 14, pillars: 'none',
      pools: { kind: 'center', size: 0.36, chance: 0.9, margin: 2, throne: true }
    },
    mapScale: 1.14,
    rooms: { hall: 'HOLDING PENS', barracks: 'GLADIATOR CELLS', library: "BOOKMAKERS' HALL", alchemy: "BUTCHER'S ROOM", crypt: 'CORPSE PIT', throne: 'GRAND ARENA' },
    wallHeight: 3.4,
    themeMix: 0.12,
    floor: { tex: 'sand', color: 0xa47458, corridor: 0x845c46, mottle: 0.2 },
    wall: { tex: 'blocks', color: 0x86544a, corridor: 0x74483e, cap: 0x201010 },
    pillar: 'column',
    liquid: { kind: 'blood', bridge: 'wood' },
    light: { prop: 'brazier', place: 'wall', every: 6, color: 0xff5a30, power: 1.05, range: 14 },
    sky: { hemi: [0xb07a70, 0x300a08, 1.8], ambient: [0x542626, 0.9], fog: [0x140404, 24, 54], exposure: 1.15, player: [0xffd0b0, 1] },
    particles: [{ kind: 'embers', rate: 6, color: 0xff4020 }, { kind: 'mist', rate: 3, color: 0x501010 }],
    props: [
      { kind: 'spikes', place: 'shore', chance: 0.4 },
      { kind: 'cage', place: 'wall', chance: 0.05 },
      { kind: 'pike', place: 'wall', chance: 0.05 },
      { kind: 'blood', place: 'floor', per: 12 }
    ]
  },
  // 8: sealed octagonal vaults, glowing runes, bottomless shafts, little light
  {
    id: 'shadowVaults',
    layout: {
      shapes: { octagon: 3, rect: 1 }, startShape: 'octagon', throneShape: 'octagon',
      minRoomW: 10, maxRoomW: 14, minRoomH: 10, maxRoomH: 13, corridorWidth: 2, winding: 0.25,
      pools: { chance: 0.6, count: [1, 2], radius: [1.5, 2.6], margin: 2 }
    },
    mapScale: 1.14,
    rooms: { hall: 'VEILED GATE', barracks: 'SENTINEL VAULT', library: 'VAULT OF WHISPERS', alchemy: 'DARK RELIQUARY', crypt: 'VAULT OF THE LOST', throne: 'INNER SANCTUM' },
    wallHeight: 3.6,
    themeMix: 0.1,
    floor: { tex: 'obsidian', color: 0x4c4860, corridor: 0x403c52, shine: 0.5 },
    wall: { tex: 'runes', color: 0x544c66, corridor: 0x484258, cap: 0x0c0a10, glow: { color: 0x9a60ff, map: 'wallrunes', strength: 0.55 } },
    pillar: 'obelisk',
    liquid: { kind: 'void', glow: 0x5a20a0, bridge: 'stone' },
    light: { prop: 'crystal', place: 'north', every: 6, color: 0xa070ff, power: 0.85, range: 11 },
    sky: { hemi: [0x625a88, 0x08060c, 1.25], ambient: [0x261e38, 0.75], fog: [0x050408, 16, 40], exposure: 1.12, player: [0xd8c8ff, 0.9] },
    particles: [{ kind: 'wisps', rate: 6, color: 0x8050d0 }],
    props: [
      { kind: 'hooded', place: 'wall', chance: 0.05 },
      { kind: 'urn', place: 'corner', chance: 0.4 },
      { kind: 'circle', place: 'center', themes: ['hall', 'library', 'crypt', 'throne'] }
    ]
  },
  // 9: caves split by rivers of lava, the floor cracked and glowing
  {
    id: 'burningDeep',
    layout: {
      shapes: { cave: 2, round: 1 }, startShape: 'round', throneShape: 'cave',
      minRoomW: 10, maxRoomW: 15, minRoomH: 9, maxRoomH: 12, winding: 0.6, erode: 0.28, pillars: 'scatter',
      river: { width: [2, 3], meander: 0.8 }, pools: { chance: 0.4, count: [1, 1], radius: [1.5, 2.2], margin: 2 }
    },
    mapScale: 1.12,
    rooms: { hall: 'CINDER GATE', barracks: 'EMBER BARRACKS', library: 'BRIMSTONE ARCHIVE', alchemy: 'SULPHUR VATS', crypt: 'CHARNEL VENTS', throne: 'MAGMA HEART' },
    wallHeight: 3.4,
    themeMix: 0.1,
    floor: { tex: 'basalt', color: 0x5e4a42, corridor: 0x503e36, glow: { color: 0xff5010, map: 'cracks', strength: 0.6 } },
    wall: { tex: 'rock', color: 0x664c42, corridor: 0x58423a, cap: 0x1e100a, rough: 0.3, glow: { color: 0xff3a10, map: 'base' } },
    pillar: 'stalagmite',
    liquid: { kind: 'lava', bridge: 'stone' },
    light: { prop: 'vent', place: 'wall', every: 6, color: 0xff6a20, power: 1.1, range: 14 },
    sky: { hemi: [0xb06e50, 0x401008, 1.65], ambient: [0x562412, 0.9], fog: [0x1a0804, 24, 52], exposure: 1.2, player: [0xffd0a0, 1] },
    particles: [{ kind: 'embers', rate: 18, color: 0xff6a20 }],
    props: [
      { kind: 'shards', place: 'shore', chance: 0.12 },
      { kind: 'bones', place: 'floor', per: 40 }
    ]
  },
  // 10: the warlord's fortress: symmetric wings, carpets, braziers, statues
  {
    id: 'warlord',
    layout: {
      mirror: true, shapes: { rect: 2, octagon: 1 }, minRoomW: 10, maxRoomW: 14, minRoomH: 8, maxRoomH: 11,
      throneSize: [20, 13], throneShape: 'rect', corridorWidth: 4, extraLoopChance: 0.25, pillars: 'colonnade'
    },
    mapScale: 1.25,
    rooms: { hall: 'GATE HALL', barracks: "WARLORD'S GUARD", library: 'TROPHY HALL', alchemy: "WAR SHAMANS' DEN", crypt: 'HALL OF SKULLS', throne: 'THRONE ROOM' },
    wallHeight: 4.0,
    themeMix: 0.12,
    dressing: ['throne'],
    floor: { tex: 'marble', color: 0x684e4c, corridor: 0x56403e, shine: 0.5 },
    wall: { tex: 'blocks', color: 0x7c6258, corridor: 0x6a544c, cap: 0x2a1a14 },
    pillar: 'pier',
    light: { prop: 'brazier', place: 'corner', color: 0xffa040, power: 1.15, range: 15 },
    sky: { hemi: [0xb48c74, 0x301010, 1.9], ambient: [0x52302a, 0.9], fog: [0x0c0606, 28, 62], exposure: 1.16, player: [0xffd9a8, 1] },
    particles: [{ kind: 'embers', rate: 5, color: 0xff8030 }],
    props: [
      { kind: 'banner', place: 'north', every: 3, color: 0x7a0a0a, sigil: true },
      { kind: 'carpet', place: 'corridor' },
      { kind: 'statue', place: 'wall', chance: 0.05 },
      { kind: 'skulls', place: 'corner', chance: 0.3 },
      { kind: 'rack', place: 'wall', chance: 0.04 }
    ]
  },
  // 11: long galleries a dragon burnt out: soot, embers, charred paintings
  {
    id: 'scorched',
    layout: {
      shapes: { gallery: 1 }, throneShape: 'gallery', minRoomW: 16, maxRoomW: 22, minRoomH: 6, maxRoomH: 8,
      turnChance: 0.35, pillars: 'none', extraLoopChance: 0.3
    },
    mapScale: 1.22,
    rooms: { hall: 'CHARRED VESTIBULE', barracks: 'BURNT BARRACKS', library: 'ASH GALLERY', alchemy: 'SOOT KILN', crypt: 'CINDER TOMB', throne: 'GALLERY OF FLAME' },
    wallHeight: 3.8,
    themeMix: 0.1,
    floor: { tex: 'tiles', color: 0x625850, corridor: 0x544a44, mottle: 0.5, glow: { color: 0xff4a10, map: 'embers', strength: 0.7 } },
    wall: { tex: 'brick', color: 0x665650, corridor: 0x584a44, cap: 0x100a08, mottle: 0.5, glow: { color: 0xff5a10, map: 'streaks', strength: 0.8 } },
    pillar: 'column',
    light: { prop: 'torch', place: 'north', every: 4, color: 0xff7a30, power: 0.95, range: 13 },
    sky: { hemi: [0x967c6c, 0x201008, 1.6], ambient: [0x46342e, 0.85], fog: [0x0e0806, 24, 54], exposure: 1.15, player: [0xffd0a8, 1] },
    particles: [{ kind: 'ash', rate: 14, color: 0x6a6460 }, { kind: 'embers', rate: 5, color: 0xff6020 }],
    props: [
      { kind: 'frame', place: 'north', every: 3, offset: 1 },
      { kind: 'bust', place: 'wall', chance: 0.05 },
      { kind: 'cinders', place: 'floor', per: 30 },
      { kind: 'scorch', place: 'floor', per: 16 }
    ]
  },
  // 12: frozen cisterns: forests of iced columns, snow, holes in the ice
  {
    id: 'frozen',
    layout: {
      shapes: { rect: 2, round: 1 }, minRoomW: 12, maxRoomW: 16, minRoomH: 10, maxRoomH: 13, pillars: 'grid',
      pools: { chance: 0.55, count: [1, 2], radius: [1.3, 2.1], margin: 2 }
    },
    mapScale: 1.15,
    rooms: { hall: 'FROST GATE', barracks: 'ICEBOUND BARRACKS', library: 'FROZEN ARCHIVE', alchemy: 'BRINE TANKS', crypt: 'ICE TOMBS', throne: 'GREAT CISTERN' },
    wallHeight: 3.6,
    themeMix: 0.08,
    floor: { tex: 'ice', color: 0x9cb6c6, corridor: 0x86a2b2, shine: 1 },
    wall: { tex: 'frost', color: 0xa2bece, corridor: 0x8eaaba, cap: 0xe4f2ff },
    pillar: 'icecolumn',
    liquid: { kind: 'icewater', bridge: 'ice' },
    light: { prop: 'crystal', place: 'north', every: 5, color: 0x9adcff, power: 0.95, range: 13 },
    sky: { hemi: [0xb4d4f4, 0x203040, 1.85], ambient: [0x40586c, 1.0], fog: [0x0a1018, 24, 56], exposure: 1.06, player: [0xe0f0ff, 0.95] },
    particles: [{ kind: 'snow', rate: 40, color: 0xc8e0f0 }],
    props: [
      { kind: 'icicles', place: 'north', every: 1 },
      { kind: 'icecrystals', place: 'corner', chance: 0.6 },
      { kind: 'snowdrift', place: 'wall', chance: 0.1 }
    ]
  },
  // 13: tall halls open to a storm: rain, puddles, lightning on the rods
  {
    id: 'storm',
    layout: { shapes: { rect: 2, cross: 2, octagon: 1 }, minRoomW: 14, maxRoomW: 19, minRoomH: 12, maxRoomH: 15, corridorWidth: 4, pillars: 'ring' },
    mapScale: 1.32,
    rooms: { hall: 'THUNDER GATE', barracks: 'STORMGUARD HALL', library: 'HALL OF SPARKS', alchemy: 'CHARGE VATS', crypt: 'STRUCK TOMBS', throne: 'EYE OF THE STORM' },
    wallHeight: 4.4,
    themeMix: 0.1,
    floor: { tex: 'slate', color: 0x5c626c, corridor: 0x50565e, shine: 0.9 },
    wall: { tex: 'blocks', color: 0x6a7480, corridor: 0x5c6670, cap: 0x14181e },
    pillar: 'rod',
    light: { prop: 'stormlamp', place: 'north', every: 5, color: 0x8ab8ff, power: 0.95, range: 14 },
    sky: { hemi: [0x94a6cc, 0x101420, 1.6], ambient: [0x344056, 0.85], fog: [0x080a10, 26, 60], exposure: 1.12, player: [0xd8e8ff, 1] },
    storm: true,
    particles: [{ kind: 'rain', rate: 140, color: 0x7a98c0 }],
    props: [
      { kind: 'puddle', place: 'floor', per: 9 },
      { kind: 'rubble', place: 'wall', chance: 0.06 }
    ]
  },
  // 14: drowned caves of poisoned mire, reeds and giant glowing mushrooms
  {
    id: 'mires',
    layout: {
      shapes: { cave: 3, round: 1 }, startShape: 'cave', throneShape: 'cave',
      minRoomW: 11, maxRoomW: 15, minRoomH: 9, maxRoomH: 12, winding: 0.7, erode: 0.3, pillars: 'scatter',
      pools: { chance: 0.95, count: [1, 3], radius: [1.5, 3], margin: 2 }
    },
    mapScale: 1.15,
    rooms: { hall: 'MIRE EDGE', barracks: 'BOG CAMP', library: 'ROTTING ARCHIVE', alchemy: 'VENOM STILLS', crypt: 'SUNKEN GRAVES', throne: 'HEART OF THE MIRE' },
    wallHeight: 3.0,
    themeMix: 0.1,
    floor: { tex: 'mud', color: 0x62623c, corridor: 0x545432, shine: 0.4, mottle: 0.3 },
    wall: { tex: 'rock', color: 0x58664a, corridor: 0x4c583e, cap: 0x1e2614, rough: 0.35 },
    pillar: 'mushroom',
    liquid: { kind: 'mire', bridge: 'wood' },
    light: { prop: 'glowshroom', place: 'wall', every: 5, color: 0x9aff6a, power: 0.9, range: 12 },
    sky: { hemi: [0x86a66c, 0x182010, 1.7], ambient: [0x30401e, 0.95], fog: [0x0a1406, 20, 48], exposure: 1.12, player: [0xe8ffd0, 1] },
    particles: [{ kind: 'spores', rate: 10, color: 0x9aff50 }, { kind: 'bubbles', rate: 10, color: 0x80c040 }],
    props: [
      { kind: 'reeds', place: 'shore', chance: 0.35 },
      { kind: 'log', place: 'floor', per: 60 },
      { kind: 'mushrooms', place: 'wall', chance: 0.08 }
    ]
  },
  // 15: round chambers drowned in black pools, islands joined by causeways
  {
    id: 'blackPools',
    layout: {
      shapes: { round: 2, cave: 1 }, startShape: 'round', throneShape: 'round',
      minRoomW: 12, maxRoomW: 16, minRoomH: 11, maxRoomH: 14, pillars: 'none',
      pools: { kind: 'island', chance: 0.85, margin: 2 }
    },
    mapScale: 1.26,
    rooms: { hall: 'OBSIDIAN SHORE', barracks: 'TAR CAMP', library: 'INKWELL ARCHIVE', alchemy: 'PITCH BOILERS', crypt: 'DROWNED TOMBS', throne: 'SUNKEN TEMPLE' },
    wallHeight: 3.4,
    themeMix: 0.08,
    floor: { tex: 'obsidian', color: 0x5a566c, corridor: 0x4c485c, shine: 0.8 },
    wall: { tex: 'rock', color: 0x5a566a, corridor: 0x4e4a5c, cap: 0x0e0c12, rough: 0.2 },
    pillar: 'monolith',
    liquid: { kind: 'tar', bridge: 'stone' },
    light: { prop: 'crystal', place: 'north', every: 5, color: 0xc070ff, power: 1, range: 13 },
    sky: { hemi: [0x8072a6, 0x08060a, 1.7], ambient: [0x2e263e, 0.9], fog: [0x060508, 22, 48], exposure: 1.14, player: [0xe0d0ff, 1] },
    particles: [{ kind: 'bubbles', rate: 12, color: 0x6040a0 }, { kind: 'wisps', rate: 3, color: 0x8060c0 }],
    props: [
      { kind: 'monolith', place: 'wall', chance: 0.04 },
      { kind: 'shards', place: 'shore', chance: 0.1 }
    ]
  },
  // 16: great burrows clawed out by dragons, nests of eggs, old bones
  {
    id: 'wyrmWarrens',
    layout: {
      shapes: { cave: 1 }, startShape: 'cave', throneShape: 'cave',
      minRoomW: 12, maxRoomW: 18, minRoomH: 10, maxRoomH: 14, corridorWidth: 4, winding: 0.9, erode: 0.42,
      extraLoopChance: 0.5, pillars: 'scatter'
    },
    mapScale: 1.32,
    rooms: { hall: 'SCORCHED BURROW', barracks: 'BROOD GUARD', library: 'GNAWED ARCHIVE', alchemy: 'EGG CHAMBER', crypt: 'BONE MIDDEN', throne: 'WYRM NEST' },
    wallHeight: 3.6,
    themeMix: 0.1,
    floor: { tex: 'dirt', color: 0x84583e, corridor: 0x744c34, mottle: 0.35 },
    wall: { tex: 'claws', color: 0x9a6248, corridor: 0x88563e, cap: 0x2e180c, rough: 0.45 },
    pillar: 'boulder',
    light: { prop: 'vent', place: 'wall', every: 6, color: 0xff8a30, power: 1.05, range: 14 },
    sky: { hemi: [0xae8664, 0x2a1408, 1.8], ambient: [0x4e3424, 0.95], fog: [0x120804, 26, 58], exposure: 1.15, player: [0xffd8b0, 1] },
    particles: [{ kind: 'embers', rate: 8, color: 0xff7a20 }, { kind: 'dust', rate: 5, color: 0x8a6040 }],
    props: [
      { kind: 'eggs', place: 'corner', chance: 0.25 },
      { kind: 'bigbone', place: 'floor', per: 45 },
      { kind: 'scales', place: 'floor', per: 22 }
    ]
  },
  // 17: the dragons' treasury: mirrored vaults, heavy piers, gold everywhere
  {
    id: 'hoardVaults',
    layout: { mirror: true, minRoomW: 11, maxRoomW: 15, minRoomH: 10, maxRoomH: 13, pillars: 'thick', throneSize: [17, 13] },
    mapScale: 1.18,
    rooms: { hall: 'COUNTING HOUSE', barracks: 'VAULT GUARD', library: 'LEDGER ROOM', alchemy: 'GEM CUTTERY', crypt: 'SEALED VAULT', throne: 'GRAND VAULT' },
    wallHeight: 3.8,
    themeMix: 0.08,
    floor: { tex: 'marble', color: 0x9c8c6c, corridor: 0x7c705a, shine: 0.6 },
    wall: { tex: 'vault', color: 0xcabca4, corridor: 0x8a8274, cap: 0x3a2e1a },
    pillar: 'goldpier',
    light: { prop: 'brazier', place: 'corner', color: 0xffc860, power: 1.05, range: 14 },
    sky: { hemi: [0xc4ac84, 0x302010, 2.0], ambient: [0x5c4c32, 1.0], fog: [0x0c0904, 26, 60], exposure: 1.15, player: [0xffe8c0, 1] },
    particles: [{ kind: 'glitter', rate: 12, color: 0xffd060 }],
    props: [
      { kind: 'coins', place: 'wall', chance: 0.1 },
      { kind: 'chest', place: 'wall', chance: 0.05 },
      { kind: 'goldbars', place: 'corner', chance: 0.4 },
      { kind: 'urn', place: 'wall', chance: 0.03 }
    ]
  },
  // 18: a grey waste of ash over ruins, dead trees, chasms lit from below
  {
    id: 'ashen',
    layout: {
      shapes: { cave: 2, round: 1 }, minRoomW: 11, maxRoomW: 16, minRoomH: 9, maxRoomH: 13, winding: 0.6, erode: 0.3,
      pillars: 'scatter', pools: { chance: 0.55, count: [1, 2], radius: [1.2, 2.2], margin: 2 }
    },
    mapScale: 1.15,
    rooms: { hall: 'ASHFALL GATE', barracks: 'CINDER CAMP', library: 'BURNT ARCHIVE', alchemy: 'SMOLDERING STILLS', crypt: 'ASH GRAVES', throne: 'HEART OF ASH' },
    wallHeight: 3.2,
    themeMix: 0.06,
    floor: { tex: 'ash', color: 0x7e7c7a, corridor: 0x6e6c6a, mottle: 0.2 },
    wall: { tex: 'rock', color: 0x74706c, corridor: 0x66625e, cap: 0x8a8886, rough: 0.3 },
    pillar: 'broken',
    liquid: { kind: 'void', glow: 0xff4a10, bridge: 'stone' },
    light: { prop: 'vent', place: 'wall', every: 7, color: 0xff6a3a, power: 0.9, range: 13 },
    sky: { hemi: [0x96928e, 0x201a18, 1.6], ambient: [0x46403e, 0.95], fog: [0x18140f, 18, 46], exposure: 1.1, player: [0xffe0c8, 1] },
    particles: [{ kind: 'ash', rate: 40, color: 0x8a8682 }, { kind: 'embers', rate: 3, color: 0xff5010 }],
    props: [
      { kind: 'deadtree', place: 'floor', per: 70 },
      { kind: 'ashmound', place: 'wall', chance: 0.1 },
      { kind: 'bones', place: 'floor', per: 45 }
    ]
  },
  // 19: where kings and dragons were laid to rest: giant ribs, tombs, mist
  {
    id: 'boneyard',
    layout: {
      shapes: { cave: 2, cross: 1, octagon: 1 }, startShape: 'octagon', throneShape: 'octagon',
      minRoomW: 13, maxRoomW: 17, minRoomH: 11, maxRoomH: 14, erode: 0.12, pillars: 'ribcage'
    },
    mapScale: 1.28,
    rooms: { hall: "KINGS' GATE", barracks: 'HONOR GUARD', library: 'HALL OF ANNALS', alchemy: "EMBALMERS' HALL", crypt: 'ROYAL OSSUARY', throne: 'TOMB OF KINGS' },
    wallHeight: 3.6,
    themeMix: 0.08,
    floor: { tex: 'bonedust', color: 0x9e9888, corridor: 0x827c6e },
    wall: { tex: 'skulls', corridorTex: 'blocks', color: 0xb8ae98, corridor: 0x8a867a, cap: 0x2a2a26 },
    pillar: 'column',
    light: { prop: 'candles', place: 'north', every: 4, color: 0xd0ffe8, power: 0.9, range: 13 },
    sky: { hemi: [0xaec4bc, 0x141a18, 1.75], ambient: [0x3e4c48, 0.95], fog: [0x0e1412, 24, 54], exposure: 1.12, player: [0xe8fff4, 1] },
    particles: [{ kind: 'mist', rate: 8, color: 0x3a5048 }, { kind: 'wisps', rate: 3, color: 0x90d0b0 }],
    props: [
      { kind: 'giantskull', place: 'corner', chance: 0.12 },
      { kind: 'sarcophagus', place: 'wall', chance: 0.08, crown: true },
      { kind: 'statue', place: 'wall', chance: 0.035 },
      { kind: 'bones', place: 'floor', per: 20 }
    ]
  },
  // 20: the great golden wyrm's cavern, floored and heaped with gold
  {
    id: 'goldenHoard',
    layout: {
      shapes: { cave: 1, round: 1 }, startShape: 'round', throneShape: 'cave', throneSize: [24, 18], openThrone: true,
      minRoomW: 11, maxRoomW: 16, minRoomH: 9, maxRoomH: 13, corridorWidth: 4, erode: 0.2, pillars: 'scatter'
    },
    mapScale: 1.25,
    rooms: { hall: 'GLITTERING GATE', barracks: 'HOARD GUARD', library: 'CROWN ROOM', alchemy: 'JEWEL CASKS', crypt: 'GILDED TOMBS', throne: 'GOLDEN HOARD' },
    wallHeight: 3.6,
    themeMix: 0.06,
    floor: { tex: 'coins', color: 0xc49c4a, corridor: 0x9e7c3c, shine: 0.8 },
    wall: { tex: 'rock', color: 0x9c7c46, corridor: 0x866c3e, cap: 0x3a2a10, rough: 0.3 },
    pillar: 'goldpile',
    light: { prop: 'brazier', place: 'wall', every: 6, color: 0xffd070, power: 1.1, range: 15 },
    sky: { hemi: [0xd4b474, 0x3a2810, 2.2], ambient: [0x6c5222, 1.1], fog: [0x100a02, 28, 64], exposure: 1.18, player: [0xfff0c8, 1] },
    particles: [{ kind: 'glitter', rate: 26, color: 0xffe080 }],
    props: [
      { kind: 'coins', place: 'wall', chance: 0.14 },
      { kind: 'chest', place: 'wall', chance: 0.05 },
      { kind: 'gems', place: 'corner', chance: 0.3 },
      { kind: 'crown', place: 'floor', per: 60 },
      { kind: 'goblet', place: 'floor', per: 50 }
    ]
  }
];

// The look of a survival floor (1 to 20), filled in from the classic look.
// Below the first floor the start hall gets the floor's pillars too (its
// furnaces, mushrooms or ribs), so a floor shows what it is from the start.
export function floorLook(depth) {
  const index = Math.max(1, Math.min(FloorLooks.length, depth)) - 1;
  return withDefaults(FloorLooks[index]);
}

const filled = new Map();
function withDefaults(look) {
  let out = filled.get(look);
  if (!out) {
    out = {
      ...ClassicLook,
      ...look,
      layout: { hallPillars: true, ...look.layout },
      floor: { ...ClassicLook.floor, ...look.floor },
      wall: { ...ClassicLook.wall, ...look.wall },
      light: { ...ClassicLook.light, ...look.light },
      sky: { ...ClassicLook.sky, ...look.sky },
      dressing: look.dressing || false
    };
    filled.set(look, out);
  }
  return out;
}
