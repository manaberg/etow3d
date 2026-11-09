// The spell list, pure data (no imports), so that gear (gear.js) can name
// the spells it strengthens without importing the mage.

// The spell book. `cd` is the cooldown in frames, `need` the manergy that
// must be exceeded and `cost` what a cast spends (a `held` spell spends it
// over each second it is held) and `rank2Cost` what its rank II adds to
// that. A new wizard's 100 manergy pays for three fireballs, or for one of
// the costliest spells (90), and comes back at MANERGY_REGEN (spellbar.js),
// so manergy, not only cooldowns, paces the casting. `flag` is the spellbook
// entry a scroll unlocks and `tier` the flag its rank II sets (the 2D game's
// tier 2). `circle` is the spell's circle as the spellbook names it (any
// spell can drop on any floor), `grows` what rank II adds 30% to (spellbar.js
// RankRules), `text` what the spellbook says it does and `lore` a line of
// flavour under it. Spells are cast from the bar's slots (spellbar.js
// BarSlots); magic missile has its own key.
export const SpellBook = [
  { id: 'missile', name: 'MAGIC MISSILE', cd: 24, need: 0, cost: 0, flag: null, circle: 0, rank2: 'TWO DARTS', rank3: 'THREE DARTS', text: 'Darts that curve in on the foe nearest the cursor and shoot down simple bolts; every wizard level makes them hit monsters harder. Hold to keep casting.', lore: 'The first spell every apprentice learns, and the last one many of them cast.' },
  { id: 'fireball', name: 'FIREBALL', cd: 48, need: 30, cost: 30, rank2Cost: 15, flag: 'hasFireball', tier: 'hasFb2', circle: 1, rank2: 'A SECOND ORB BESIDE THE FIRST', text: 'An orb that bursts on the first foe and scorches those around it.', lore: 'Orc warbands have a word for a wizard with a fireball. None of them is polite.' },
  { id: 'lightning', name: 'CHAIN LIGHTNING', cd: 120, need: 45, cost: 45, rank2Cost: 10, flag: 'hasLightning', tier: 'hasLg2', circle: 2, rank2: 'EVERY JUMP HITS AS HARD AS THE FIRST', text: 'Locks on to the nearest foe in sight and jumps from it to every foe close by.', lore: 'It never strikes only once; that is the whole point of it.' },
  { id: 'ironshot', name: 'IRON SHOT', cd: 300, need: 60, cost: 60, flag: 'hasIronshot', tier: 'hasIs2', circle: 1, rank2: 'TWO CHARGES', text: 'A heavy bolt that pierces through every foe in its line.', lore: 'Conjured iron, heavier than anything poured in the Iron Forges, and just as unwilling to stop.' },
  { id: 'blink', name: 'BLINK', cd: 400, need: 60, cost: 60, flag: 'hasBlink', tier: 'hasBk2', circle: 1, rank2: 'COOLDOWN HALVED', text: 'Teleports you to the cursor, onto open floor only.', lore: 'Between here and there lies a place no one should linger. Blink does not.' },
  { id: 'timestop', name: 'TIME STOP', cd: 1000, need: 70, cost: 90, flag: 'hasTimestop', circle: 4, grows: 'DURATION', text: 'Slows the world around you to a crawl; you and your spells keep full speed.', lore: 'The world holds its breath. The wizard does not.' },
  { id: 'haste', name: 'HASTE', cd: 1000, need: 90, cost: 90, flag: 'hasHaste', circle: 2, grows: 'DURATION', text: 'You run two and a half times as fast for a while.', lore: 'Running is the oldest spell of all, and still the one that has saved the most wizards.' },
  { id: 'image', name: 'MIRROR IMAGE', cd: 1000, need: 70, cost: 70, flag: 'hasImage', circle: 2, text: 'A copy of you that draws the foes\' attention.', lore: 'Orcs swear the wizard of the halls has a twin. They are half right.' },
  { id: 'stun', name: 'CHAIN ROOT', cd: 400, need: 45, cost: 45, flag: 'hasStun', circle: 2, text: 'Roots the nearest foe in sight to the spot, and every foe close to it.', lore: 'Roots older than the Warrens wake at the word and hold whatever stands on them.' },
  { id: 'shield', name: 'SHIELD', cd: 200, need: 60, cost: 60, flag: 'hasShield', circle: 1, grows: 'DURATION', text: 'A bubble that turns blows and sends bolts back at their caster.', lore: 'Not a wall but a mirror: whatever is thrown at it goes home.' },
  { id: 'blizzard', name: 'BLIZZARD', cd: 600, need: 60, cost: 60, rank2Cost: 15, flag: 'hasBlizzard', tier: 'hasBz2', circle: 3, rank2: 'TWICE THE RADIUS', text: 'A storm of ice at the cursor that hurts and slows everything in it.', lore: 'A winter folded small, carried down the stairs and let out all at once.' },
  { id: 'ray', name: 'LIFESTEAL', cd: 0, need: 10, cost: 60, held: true, flag: 'hasRay', circle: 2, grows: 'DAMAGE', text: 'Hold for a red ray that drains your foe\'s life into yours.', lore: 'Blood remembers whose it was, and flows home along the red thread.' },
  { id: 'invis', name: 'INVISIBILITY', cd: 1000, need: 90, cost: 90, flag: 'hasInvis', circle: 3, grows: 'DURATION', text: 'Foes lose sight of you until it wears off.', lore: 'The trick is not to vanish. The trick is to make them forget where to look.' },
  { id: 'fear', name: 'FEAR', cd: 400, need: 70, cost: 70, flag: 'hasFear', circle: 2, grows: 'REACH', text: 'Foes around you flee in a panic.', lore: 'Every creature is born with a terror. This only reminds it.' },
  { id: 'pwkill', name: 'POWER WORD KILL', cd: 300, need: 70, cost: 45, flag: 'hasPwkill', tier: 'hasPwk2', circle: 4, rank2: 'A WIDER, DEEPER SPLASH', text: 'Hover a foe: a word that kills it, and wounds those around it.', lore: 'Some words should never be spoken. This was the first of them.' },
  { id: 'tele', name: 'TELEKINESIS', cd: 1000, need: 30, cost: 30, flag: 'hasTele', circle: 2, text: 'Hover loot to pull it to you from afar.', lore: 'A good wizard never fetches anything. A good wizard asks it to come.' },
  // D&D spells new to the 3D game (see arcana.js)
  { id: 'scorch', name: 'SCORCHING RAY', cd: 90, need: 35, cost: 35, flag: 'hasScorch', circle: 1, grows: 'DAMAGE', text: 'Three fire bolts fanned around your aim.', lore: 'Three threads of fire spun from a single breath: an apprentice\'s first real power.' },
  { id: 'cone', name: 'CONE OF COLD', cd: 180, need: 50, cost: 50, flag: 'hasCone', circle: 2, grows: 'DAMAGE', text: 'Damages and chills every foe in front of you.', lore: 'The Frozen Cisterns breathe like this. The wizard only borrows their breath.' },
  { id: 'thunder', name: 'THUNDERWAVE', cd: 300, need: 45, cost: 45, flag: 'hasThunder', circle: 1, grows: 'DAMAGE', text: 'Blasts the foes around you away.', lore: 'First the sound arrives. Then the orcs arrive somewhere else entirely.' },
  { id: 'meteor', name: 'METEOR SWARM', cd: 900, need: 90, cost: 90, flag: 'hasMeteor', circle: 4, grows: 'DAMAGE', text: 'Rocks rain down around the cursor.', lore: 'The sky is twenty floors of rock away. The stars come down anyway.' },
  { id: 'guardians', name: 'SPIRIT GUARDIANS', cd: 1000, need: 80, cost: 80, flag: 'hasGuardians', circle: 3, grows: 'DAMAGE', text: 'A damaging, slowing aura that follows you.', lore: 'The spirits of wizards who fell on the way down, still keeping watch over those who did not.' },
  { id: 'cloud', name: 'CLOUDKILL', cd: 700, need: 70, cost: 70, flag: 'hasCloud', circle: 3, grows: 'DAMAGE', text: 'A poison cloud at the cursor that rolls away from you.', lore: 'Bottled in the Venom Mires. Uncork it upwind.' },
  { id: 'heal', name: 'HEALING WORD', cd: 600, need: 60, cost: 60, flag: 'hasHeal', circle: 1, grows: 'HEALING', text: 'Heals you at once.', lore: 'One word, softly spoken, and the wound forgets it was ever there.' },
  { id: 'polymorph', name: 'POLYMORPH', cd: 500, need: 60, cost: 60, flag: 'hasPolymorph', circle: 3, grows: 'DURATION', text: 'Hover a foe to turn it into a sheep for a while (bosses and dragons not for long, a wizard only briefly).', lore: 'Orcs have no word for sheep. They have learnt to fear the bleating.' },
  { id: 'disintegrate', name: 'DISINTEGRATE', cd: 360, need: 70, cost: 70, flag: 'hasDisintegrate', circle: 3, grows: 'DAMAGE', text: 'A ray into the first foe in line.', lore: 'It leaves nothing to bury, which the Bone Crypts consider very rude.' },
  { id: 'weapon', name: 'SPIRITUAL WEAPON', cd: 900, need: 70, cost: 70, flag: 'hasWeapon', circle: 3, grows: 'DAMAGE', text: 'A spectral sword that fights beside you.', lore: 'It needs no hand to hold it and never tires of the work.' },
  // ten more, each working in a way no other spell does (arcana.js)
  { id: 'sleep', name: 'SLEEP', cd: 600, need: 45, cost: 45, flag: 'hasSleep', circle: 1, grows: 'HEALTH IT CAN LULL', text: 'The weakest foes around the cursor fall asleep, as many as its pool of health covers, and the rest doze; a blow wakes them. Bosses and dragons wake sooner, and a wizard only dozes.', lore: 'Even orcs dream, mostly of other orcs losing.' },
  { id: 'agathys', name: 'ARMOR OF AGATHYS', cd: 900, need: 60, cost: 60, flag: 'hasAgathys', circle: 1, grows: 'WARD', text: 'A coat of frost that takes the next blows for you; whoever strikes you through it is bitten by the cold and chilled.', lore: 'Named for a wizard of the Frozen Cisterns whom nobody ever struck twice.' },
  { id: 'curse', name: 'BESTOW CURSE', cd: 500, need: 45, cost: 45, flag: 'hasCurse', circle: 2, grows: 'DURATION', text: 'Hover a foe: it takes half again as much damage from everything for ten seconds (a wizard a quarter more, for five).', lore: 'The old words cling like soot, and every blow finds the mark they leave.' },
  { id: 'sphere', name: 'FLAMING SPHERE', cd: 800, need: 60, cost: 60, flag: 'hasSphere', circle: 2, grows: 'DAMAGE', text: 'A ball of fire that rolls after your cursor and burns whatever it touches.', lore: 'It rolls where you look, and it is always hungry.' },
  { id: 'counter', name: 'COUNTERSPELL', cd: 600, need: 45, cost: 45, flag: 'hasCounter', circle: 2, grows: 'REACH', text: 'Unmakes the hostile bolts, meteors and spheres around you and silences the casters near you for a while.', lore: 'The rarest art: a spell that unmakes another. The Red Order teaches it last.' },
  { id: 'swap', name: 'TRANSPOSITION', cd: 500, need: 45, cost: 45, flag: 'hasSwap', circle: 2, text: 'Hover a foe in sight: you trade places with it.', lore: 'The safest place in a fight is sometimes exactly where your foe is standing.' },
  { id: 'phantasm', name: 'PHANTASMAL KILLER', cd: 600, need: 65, cost: 65, flag: 'hasPhantasm', circle: 3, grows: 'DAMAGE', text: 'Hover a foe: its worst nightmare hunts it for five seconds; it flees in terror, and the terror eats at it.', lore: 'The killer is not real. The fear is, and fear is enough.' },
  { id: 'confusion', name: 'CONFUSION', cd: 700, need: 65, cost: 65, flag: 'hasConfusion', circle: 3, grows: 'DURATION', text: 'Foes around the cursor lose their wits: orcs and their kind fall on each other, bigger foes reel, and a wizard\'s spells fly wild.', lore: 'For a few heartbeats every face looks like a foe\'s. Orcs never could tell each other apart.' },
  { id: 'maelstrom', name: 'MAELSTROM', cd: 800, need: 75, cost: 75, flag: 'hasMaelstrom', circle: 3, grows: 'DAMAGE', text: 'A whirlpool at the cursor that drags foes toward its eye and batters them.', lore: 'Called up from the drowned stacks of the Sunken Library, where the water still turns the pages.' },
  { id: 'gravity', name: 'REVERSE GRAVITY', cd: 900, need: 90, cost: 90, flag: 'hasGravity', circle: 4, grows: 'DAMAGE', text: 'Foes around the cursor fall upward, hang helpless, then crash back down.', lore: 'For a moment the floor is the ceiling. Then, all at once, it is the floor again.' }
];

export const SpellById = {};
for (const spell of SpellBook) {
  SpellById[spell.id] = spell;
}
