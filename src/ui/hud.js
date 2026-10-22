import { SpellById } from '../entities/mage.js';
import { BarSlots, WizardLevels, ROMAN, rankOf, rankCooldown } from '../entities/spellbar.js';
import { Rarities } from '../entities/gear.js';
import { InventoryScreen } from './inventory.js';
import { DungeonLevels, Races } from '../world/levels.js';
import { Orc } from '../entities/orc.js';
import { Clericorc, Mageorc, Boss } from '../entities/bosses.js';
import { Dragon } from '../entities/dragon.js';
import { DuelWizard } from '../entities/duelWizard.js';
import { Minimap } from './minimap.js';
import { openControls } from './controls.js';
import { actionKeyLabel, bindingsVersion } from '../core/bindings.js';
import { DuelRules } from '../entities/duelRules.js';
import { missileTier } from '../entities/spells.js';

function el(tag, className, parent, text) {
  const node = document.createElement(tag);
  if (className) {
    node.className = className;
  }
  if (text !== undefined) {
    node.textContent = text;
  }
  if (parent) {
    parent.appendChild(node);
  }
  return node;
}

function setText(node, text) {
  if (node.textContent !== text) {
    node.textContent = text;
  }
}

// Everything drawn over the 3D view: bars, spell list, minimap, labels above
// monsters, banners, toasts and the pause and end screens.
// A regiment's name, short enough for its card.
const SHORT = { INFANTRY: 'INF', SLINGERS: 'MISSILE', KNIGHTS: 'KNIGHTS', 'SHOCK TROOPS': 'SHOCK', MYSTICS: 'MYSTICS', DRAGONS: 'DRAGONS' };
function shortName(name) {
  for (const long in SHORT) {
    if (name.startsWith(long)) {
      return SHORT[long] + name.slice(long.length);
    }
  }
  return name;
}

export class Hud {
  constructor(root, game) {
    this.root = root;
    this.game = game;
    this.toasts = [];
    this.fpsTime = 0;
    this.fpsFrames = 0;
    this.fps = 60;
    this.damage = 0;
    this.slowTint = 0;
  }

  build() {
    const root = this.root;
    root.innerHTML = '';
    root.classList.add('hud');
    const game = this.game;
    root.classList.toggle('battle', !!game.battleMode);

    this.labels = el('canvas', 'hud-labels', root);
    this.vignette = el('div', 'hud-vignette', root);
    this.tint = el('div', 'hud-tint', root);

    const top = el('div', 'hud-top', root);
    this.title = el('div', 'hud-title', top);

    const left = el('div', 'hud-left', root);
    const bars = el('div', 'hud-bars', left);
    this.hpBar = this.makeBar(bars, 'HP', 'hp');
    this.myBar = this.makeBar(bars, 'MY', 'my');
    // survival levels (spellbar.js WizardLevels)
    this.xpBar = game.duelMode ? null : this.makeBar(bars, 'LV', 'xp');

    el('div', 'hud-heading', left, 'HOTKEY / SPELL / COOLDOWN');
    const list = el('div', 'hud-spells', left);
    // magic missile on its own key, then the bar's slots (spellbar.js)
    this.spellRows = [null, ...BarSlots].map((slot, i) => {
      const row = el('div', 'spell', list);
      const key = el('span', 'spell-key', row, '');
      const school = el('span', 'spell-school', row, '');
      const name = el('span', 'spell-name', row, '');
      const tier = el('span', 'spell-tier', row, '');
      const cd = el('div', 'spell-cd', row);
      const fill = el('div', 'spell-cd-fill', cd);
      return { action: slot ? slot.action : 'missile', index: i - 1, row, key, school, name, tier, cd, fill, state: null, spellId: undefined };
    });
    this.hint = el('div', 'hud-hint', left, 'Find scrolls to learn spells.');
    this.bookLine = el('div', 'map-line dim hud-book', left, '');
    // what the wizard wears, and the key to the inventory
    this.gearHeading = el('div', 'hud-heading', left, '');
    this.gearList = el('div', 'hud-gear', left);
    this.gearShown = null;

    const right = el('div', 'hud-right', root);
    this.rightPanel = right;
    if (game.duelMode) {
      const rival = el('div', 'hud-rival', right);
      this.rivalName = el('div', 'rival-name', rival);
      this.rivalHp = this.makeBar(rival, '', 'rival-hp');
      this.rivalMy = this.makeBar(rival, '', 'rival-my');
      this.rivalInfo = el('div', 'rival-info', rival);
    }
    if (game.battleMode) {
      const box = el('div', 'hud-battle', right);
      this.battleScore = el('div', 'battle-score', box);
      this.battleArmies = el('div', 'map-line', box);
      this.battleDragons = el('div', 'map-line', box);
      this.battleMode = el('div', 'map-line battle-mode', box);
      this.battleKeys = el('div', 'map-line dim', box);
      this.dragBox = el('div', 'drag-box', root);
      // the player's regiments as clickable cards along the bottom
      this.regimentBar = el('div', 'hud-regiments', root);
      this.regimentCards = [];
    }
    // duels are fought in a small dungeon too, so both modes get the map
    const mapBox = el('div', 'hud-map', right);
    this.mapCanvas = el('canvas', 'minimap', mapBox);
    this.minimap = new Minimap(this.mapCanvas, game);
    this.minimap.render();
    this.roomLabel = el('div', 'map-line', mapBox);
    if (!game.duelMode) {
      this.slainLabel = el('div', 'map-line', mapBox);
      this.goalLabel = el('div', 'map-line goal', mapBox);
    }
    el('div', 'map-line dim', mapBox, actionKeyLabel('map') + ' :: LARGER MAP');

    this.banner = el('div', 'hud-banner', root);
    this.bannerTitle = el('div', 'banner-title', this.banner);
    this.bannerText = el('div', 'banner-text', this.banner);
    this.prompt = el('div', 'hud-prompt', root);
    this.toastBox = el('div', 'hud-toasts', root);

    this.pauseScreen = el('div', 'screen hidden', root);
    const pauseCard = el('div', 'card', this.pauseScreen);
    el('h2', null, pauseCard, 'PAUSED');
    this.pauseHint = el('p', null, pauseCard, '');
    const pauseButtons = el('div', 'buttons', pauseCard);
    const resume = el('button', null, pauseButtons, 'Resume');
    resume.onclick = () => game.setPaused(false);
    const controls = el('button', 'secondary', pauseButtons, 'Controls');
    controls.onclick = () => openControls();
    const menu = el('button', 'secondary', pauseButtons, 'Main menu');
    menu.onclick = () => game.onExit && game.onExit('menu');

    this.inventoryScreen = new InventoryScreen(root, game);
    this.endScreen = el('div', 'screen hidden', root);

    this.pauseButton = el('button', 'hud-pause', root, 'Pause the game');
    this.pauseButton.onclick = () => game.setPaused(!game.paused);
  }

  makeBar(parent, label, kind) {
    const row = el('div', 'bar-row', parent);
    if (label) {
      el('span', 'bar-label', row, label);
    }
    const bar = el('div', 'bar bar-' + kind, row);
    const fill = el('div', 'bar-fill', bar);
    const text = el('span', 'bar-text', bar);
    return { fill, text };
  }

  onFloorChanged() {
    if (this.minimap) {
      this.minimap.render();
    }
  }

  toggleMap() {
    if (!this.minimap) {
      return;
    }
    this.minimap.setLarge(!this.minimap.large);
    this.rightPanel.classList.toggle('large', this.minimap.large);
  }

  toast(message, color) {
    if (!this.toastBox) {
      return;
    }
    const node = el('div', 'toast', this.toastBox, message);
    node.style.color = color || '#fff';
    this.toasts.push({ node, life: 3.2 });
    if (this.toasts.length > 4) {
      const old = this.toasts.shift();
      old.node.remove();
    }
  }

  damageFlash() {
    this.damage = 1;
  }

  timestopFlash() {
    this.slowTint = 1;
  }

  showInventory(open, tab) {
    this.inventoryScreen.show(open, tab);
  }

  // The worn gear's names in their rarity colours, redrawn when it changes.
  updateGear(player, keysChanged) {
    const worn = player.inventory ? player.inventory.worn() : [];
    const key = worn.map((i) => i.uid).join(',') + '/' + (player.inventory ? player.inventory.bag.length : 0);
    if (key === this.gearShown && !keysChanged) {
      return;
    }
    this.gearShown = key;
    const bag = player.inventory ? player.inventory.bag.length : 0;
    setText(this.gearHeading, 'GEAR' + (bag ? ' (+' + bag + ' IN BAG)' : '') + '  ::  ' + actionKeyLabel('inventory') + ' INVENTORY');
    this.gearList.textContent = '';
    for (const item of worn) {
      el('div', 'gear-row', this.gearList, item.type.name).style.color = Rarities[item.type.rarity].color;
    }
  }

  showPause(paused) {
    this.pauseScreen.classList.toggle('hidden', !paused);
    this.pauseHint.textContent = 'Press ESC or ' + actionKeyLabel('pause') + ' to resume.';
  }

  showEnd({ title, text, stats, saved, time, win, duel }) {
    const screen = this.endScreen;
    screen.innerHTML = '';
    screen.classList.remove('hidden');
    const card = el('div', 'card end' + (win ? ' win' : ''), screen);
    el('h2', null, card, title);
    el('p', null, card, text);
    const grid = el('div', 'stats', card);
    const lines = [
      ['Enemies slain', stats.killcount],
      ['Soldiers / knights / healers', stats.orccount + ' / ' + stats.knightcount + ' / ' + stats.shamancount],
      ['Bosses', stats.bosscount],
      ['Scrolls read', stats.scrollcount],
      ['Health / manergy potions', stats.redpotcount + ' / ' + stats.bluepotcount],
      ['Missiles cast', stats.micount],
      ['Fireballs', stats.fbcount],
      ['Lightning / roots', stats.lgcount + ' / ' + stats.crcount]
    ];
    if (time !== undefined) {
      lines.push(['Time played', Math.round(time) + ' s']);
    }
    for (const [label, value] of lines) {
      el('span', 'stat-label', grid, label);
      el('span', 'stat-value', grid, String(value));
    }
    if (!duel) {
      el('p', 'dim', card, saved ? 'Game data saved :: ' + saved.replace(/^Saved\s*/, '') : 'Game data not saved (no backend running).');
    }
    const buttons = el('div', 'buttons', card);
    const again = el('button', null, buttons, this.game.battleMode ? 'Battle again' : (duel ? 'Duel again' : 'Play again'));
    again.onclick = () => this.game.onExit && this.game.onExit('restart');
    const menu = el('button', 'secondary', buttons, 'Main menu');
    menu.onclick = () => this.game.onExit && this.game.onExit('menu');
    this.pauseButton.classList.add('hidden');
  }

  update(dt) {
    const game = this.game;
    const player = game.player;
    this.fpsFrames++;
    this.fpsTime += dt;
    if (this.fpsTime >= 0.5) {
      this.fps = Math.round(this.fpsFrames / this.fpsTime);
      this.fpsFrames = 0;
      this.fpsTime = 0;
    }
    const modeLabel = game.battleMode ? 'MODE: BATTLE' : (game.duelMode ? 'MODE: DUEL' : 'DEPTH ' + game.depth + ' / ' + DungeonLevels.count);
    setText(this.title, 'END OF THE WORLDS 3D ( PRE-ALPHA )  ::  ' + modeLabel + '  ::  SCORE: ' + game.stats.killcount + '  ::  FPS: ' + this.fps);
    if (!player) {
      return;
    }

    // bars: the 2D game drew 1px per point; here they fill against a cap
    const hpCap = Math.max(player.maxHp || 100, 100, player.hp);
    this.hpBar.fill.style.width = Math.max(0, player.hp / hpCap * 100) + '%';
    setText(this.hpBar.text, Math.max(0, Math.round(player.hp)) + '');
    this.myBar.fill.style.width = Math.max(0, Math.min(1, player.manergy / player.maxManergy) * 100) + '%';
    setText(this.myBar.text, Math.max(0, Math.round(player.manergy)) + ' / ' + player.maxManergy);

    if (this.xpBar) {
      const table = WizardLevels.xp;
      const top = player.level >= WizardLevels.max;
      const span = top ? 1 : table[player.level + 1] - table[player.level];
      const into = top ? 1 : player.xp - table[player.level];
      this.xpBar.fill.style.width = Math.max(0, Math.min(1, into / span)) * 100 + '%';
      setText(this.xpBar.text, 'LEVEL ' + player.level + (top ? ' :: MAX' : ' :: ' + Math.floor(into) + ' / ' + span + ' XP'));
    }

    const keysChanged = this.keysVersion !== bindingsVersion();
    this.keysVersion = bindingsVersion();
    for (const r of this.spellRows) {
      this.updateSpellRow(r, player, keysChanged);
    }
    const known = player.learnOrder.filter((id) => player.knowsSpell(id)).length;
    this.hint.style.display = known === 0 && !game.duelMode ? '' : 'none';
    const waiting = player.waitingInBook().length;
    setText(this.bookLine, known ? actionKeyLabel('spellbook') + ' :: SPELLBOOK  ' + known + (waiting ? ' KNOWN :: ' + waiting + ' NOT ON THE BAR' : ' KNOWN') : '');
    this.updateGear(player, keysChanged);

    if (game.duelMode) {
      this.updateRival();
    }
    if (game.battle) {
      this.updateBattle();
    }
    this.updateMap();
    this.updateBanner();
    this.updateToasts(dt);
    this.updateEffects(dt);
    this.drawLabels();
  }

  // One row of the spell list: magic missile, a slot's spell, an empty slot,
  // or (survival) the next slot still to open.
  updateSpellRow(r, player, keysChanged) {
    const game = this.game;
    let state;
    let id = null;
    if (r.index < 0) {
      state = 'spell';
      id = 'missile';
    } else if (r.index < player.slotLimit) {
      id = player.bar[r.index];
      state = id ? 'spell' : 'empty';
    } else if (r.index === player.slotLimit && !game.duelMode && player.level < WizardLevels.max) {
      state = 'locked';
    } else {
      state = 'hidden';
    }
    if (r.state !== state || r.spellId !== id || keysChanged) {
      r.state = state;
      r.spellId = id;
      r.row.style.display = state === 'hidden' ? 'none' : '';
      r.row.classList.toggle('empty', state === 'empty');
      r.row.classList.toggle('locked', state === 'locked');
      setText(r.key, actionKeyLabel(r.action));
      const school = id ? DuelRules.schools[DuelRules.schoolOf(id)] : null;
      setText(r.school, school ? school.tag : '');
      r.school.style.color = school ? school.color : '';
      r.school.title = school ? school.name : '';
      if (state === 'empty') {
        setText(r.name, 'EMPTY :: ' + actionKeyLabel('spellbook') + ' SPELLBOOK');
      } else if (state === 'locked') {
        setText(r.name, 'OPENS AT LEVEL ' + BarSlots[r.index].level);
      } else if (id) {
        setText(r.name, SpellById[id].name);
      }
      r.cd.style.visibility = id ? '' : 'hidden';
    }
    if (!id) {
      r.tier.style.display = 'none';
      r.row.classList.remove('cooling', 'starved');
      return;
    }
    const spell = SpellById[id];
    const rank = rankOf(player, id);
    r.tier.style.display = id !== 'missile' && rank >= 2 ? '' : 'none';
    setText(r.tier, ROMAN[rank]);
    let left = player.cd[id];
    // magic missile's cooldown grows with its darts
    // (or, just put on the bar, the longer wait before it can be cast)
    const base = id === 'missile' ? missileTier(player).cd : player.cooldownOf(spell.cd * rankCooldown(player, id));
    const full = left > base ? Math.max(left, player.cdFull[id] || 0) : base;
    let frac = full > 0 ? 1 - left / full : 1;
    // in duels a cast locks the rest of its school for a moment
    const lock = player.lockLeft(id);
    if (lock > left) {
      left = lock;
      frac = Math.min(frac, 1 - lock / DuelRules.schools[DuelRules.schoolOf(id)].lockout);
    }
    r.fill.style.width = (frac * 100) + '%';
    const affordable = player.manergy > spell.need && !(id === 'ironshot' && player.is2Charges <= 0 && left > 0);
    r.row.classList.toggle('cooling', left > 0);
    r.row.classList.toggle('starved', left <= 0 && !affordable);
    if (id === 'ironshot' && player.hasIs2) {
      setText(r.name, spell.name + ' x' + player.is2Charges);
    } else if (id === 'missile') {
      setText(r.name, spell.name + (player.missileTier > 1 ? ' x' + player.missileTier : ''));
    }
  }

  updateRival() {
    const rival = this.game.rival;
    if (!rival) {
      return;
    }
    setText(this.rivalName, 'RIVAL WIZARD ( ' + rival.difficulty.toUpperCase() + ' )');
    this.rivalHp.fill.style.width = Math.max(0, rival.hp / rival.maxHp * 100) + '%';
    setText(this.rivalHp.text, Math.max(0, Math.round(rival.hp)) + '');
    this.rivalMy.fill.style.width = Math.max(0, rival.manergy / rival.maxManergy * 100) + '%';
    setText(this.rivalMy.text, Math.round(rival.manergy) + '');
    const spells = (rival.known ? ' :: SPELLS ' + (rival.known.size + 1) : '') + ' :: MISSILE x' + rival.missileTier;
    setText(this.rivalInfo, 'TACTIC :: ' + rival.tactic.toUpperCase() + spells);
  }

  updateBattle() {
    const battle = this.game.battle;
    setText(this.battleScore, 'YOUR ' + Races[battle.races.player].name + ' VS THE RIVAL\'S ' + Races[battle.races.enemy].name);
    const dragons = { player: battle.dragonCount('player'), enemy: battle.dragonCount('enemy') };
    setText(this.battleArmies, 'ARMIES :: ' + (battle.armyCount('player') - dragons.player) + ' VS ' + (battle.armyCount('enemy') - dragons.enemy));
    setText(this.battleDragons, 'DRAGONS :: ' + dragons.player + ' VS ' + dragons.enemy);
    setText(this.battleMode, (battle.commander ? 'COMMANDER MODE' : 'SPELL MODE') + ' :: ' + actionKeyLabel('mode_toggle') + ' TO SWITCH');
    this.battleMode.classList.toggle('commander', battle.commander);
    setText(this.battleKeys, battle.commander
      ? 'CLICK / DRAG SELECT :: RIGHT CLICK MOVE OR ATTACK'
      : actionKeyLabel('order_charge') + ' CHARGE  ' + actionKeyLabel('order_hold') + ' MARCH  ' + actionKeyLabel('order_follow') + ' FOLLOW');
    // the drag-select box
    const d = battle.drag;
    this.dragBox.style.display = d ? 'block' : 'none';
    if (d) {
      Object.assign(this.dragBox.style, {
        left: Math.min(d.x0, d.x1) + 'px',
        top: Math.min(d.y0, d.y1) + 'px',
        width: Math.abs(d.x1 - d.x0) + 'px',
        height: Math.abs(d.y1 - d.y0) + 'px'
      });
    }
    for (const card of this.regimentCards) {
      const r = card.regiment;
      card.node.classList.toggle('selected', battle.selected.has(r.id));
      card.node.classList.toggle('lost', r.alive === 0);
      setText(card.count, r.alive + '');
      setText(card.order, { hold: 'HLD', charge: 'CHG', follow: 'FLW', attack: 'ATK' }[r.order]);
      card.fill.style.width = (r.alive / r.size * 100) + '%';
    }
  }

  buildRegimentCards(battle) {
    this.regimentBar.innerHTML = '';
    this.regimentCards = battle.regiments.player.map((regiment) => {
      const node = el('button', 'regiment', this.regimentBar);
      node.type = 'button';
      node.title = regiment.name + ' :: click to select, shift-click to add';
      el('span', 'regiment-name', node, shortName(regiment.name));
      const count = el('span', 'regiment-count', node, '');
      const order = el('span', 'regiment-order', node, '');
      const bar = el('div', 'regiment-bar', node);
      const fill = el('div', 'regiment-fill', bar);
      node.onclick = (e) => battle.toggleSelect(regiment.id, e.shiftKey);
      return { regiment, node, count, order, fill };
    });
  }

  // The battle was deployed: fresh map, banner while the armies form up.
  onBattleStart(battle) {
    if (!this.minimap) {
      return;
    }
    this.minimap.render();
    this.endScreen.classList.add('hidden');
    this.pauseButton.classList.remove('hidden');
    this.buildRegimentCards(battle);
  }

  updateMap() {
    const game = this.game;
    // a battle's thousands of dots are redrawn on every third frame
    this.mapFrame = (this.mapFrame || 0) + 1;
    if (!game.battle || this.mapFrame % 3 === 0) {
      this.minimap.draw();
    }
    let room = game.currentRoomIndex >= 0 ? game.world.rooms[game.currentRoomIndex].label : 'CORRIDOR';
    if (game.battleMode) {
      room = 'THE BATTLEFIELD';
    }
    setText(this.roomLabel, room);
    if (game.duelMode) {
      return;
    }
    setText(this.slainLabel, 'SLAIN ' + game.floorSlain + ' / ' + game.levelEnemyTotal);
    let goal;
    const boss = DungeonLevels.getPlan(game.depth).boss;
    if (boss === 'wyrm') {
      goal = 'SLAY THE GREAT GOLDEN WYRM';
    } else if (boss === 'warlord' && !game.warlordSlain) {
      goal = 'SLAY THE WARLORD';
    } else if (game.isStairsOpen()) {
      goal = 'STAIRS UNSEALED';
    } else {
      goal = 'STAIRS SEALED :: ' + game.getKillsToUnseal() + ' MORE';
    }
    setText(this.goalLabel, goal);
    this.goalLabel.classList.toggle('open', game.isStairsOpen());

    const stairs = game.stairs;
    const item = game.state === 'playing' && game.grabbableItem();
    if (stairs && stairs.playerOn && game.state === 'playing') {
      setText(this.prompt, game.isStairsOpen() ? 'PRESS SPACE TO DESCEND' : 'SEALED :: SLAY ' + game.getKillsToUnseal() + ' MORE');
      this.prompt.style.opacity = '1';
    } else if (item) {
      setText(this.prompt, 'PRESS ' + actionKeyLabel('grab') + ' TO GRAB :: ' + item.label());
      this.prompt.style.opacity = '1';
    } else {
      this.prompt.style.opacity = '0';
    }
  }

  updateBanner() {
    const game = this.game;
    const battle = game.battle;
    if (battle && !battle.fighting && game.state === 'playing') {
      const count = (side) => {
        const dragons = battle.dragonCount(side);
        return (battle.armyCount(side) - dragons).toLocaleString('en') + ' ' + Races[battle.races[side]].name + ' AND ' + dragons + (dragons === 1 ? ' DRAGON' : ' DRAGONS');
      };
      setText(this.bannerTitle, 'THE BATTLE :: ' + count('player') + ' VS ' + count('enemy'));
      setText(this.bannerText, 'DEPLOY YOUR REGIMENTS :: ' + actionKeyLabel('descend') + ' TO ATTACK NOW :: ' + Math.ceil(battle.deploy / 60));
      this.banner.style.opacity = '1';
      return;
    }
    if (game.duelMode || game.bannerFrames <= 0) {
      this.banner.style.opacity = '0';
      return;
    }
    const plan = DungeonLevels.getPlan(game.depth);
    setText(this.bannerTitle, 'DEPTH ' + game.depth + ' :: ' + plan.name);
    let text = 'FIND THE STAIRS IN THE THRONE ROOM';
    if (plan.boss === 'warlord') {
      text = 'THE WARLORD AWAITS IN THE THRONE ROOM';
    } else if (plan.boss === 'wyrm') {
      text = 'THE GREAT GOLDEN WYRM SLEEPS ON ITS HOARD';
    } else if (plan.dragons) {
      text = 'DRAGONS LAIR ON THIS FLOOR :: FIND THE STAIRS IN THE THRONE ROOM';
    }
    setText(this.bannerText, text);
    this.banner.style.opacity = String(Math.min(1, game.bannerFrames / 60));
  }

  updateToasts(dt) {
    for (let i = this.toasts.length - 1; i >= 0; i--) {
      const t = this.toasts[i];
      t.life -= dt;
      t.node.style.opacity = String(Math.min(1, t.life / 0.6));
      if (t.life <= 0) {
        t.node.remove();
        this.toasts.splice(i, 1);
      }
    }
  }

  updateEffects(dt) {
    this.damage = Math.max(0, this.damage - dt * 2.5);
    this.vignette.style.opacity = String(this.damage * 0.8);
    const slowed = this.game.time.active;
    const target = slowed ? 1 : 0;
    this.slowTint += (target - this.slowTint) * Math.min(1, dt * 6);
    this.tint.style.opacity = String(this.slowTint * 0.5);
    this.tint.classList.toggle('rival', !!(this.game.time.owner && this.game.time.owner !== this.game.player));
  }

  // Health bars and names over monsters near the player.
  drawLabels() {
    const game = this.game;
    const canvas = this.labels;
    const w = game.gfx.width;
    const h = game.gfx.height;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(w * ratio) || canvas.height !== Math.round(h * ratio)) {
      canvas.width = Math.round(w * ratio);
      canvas.height = Math.round(h * ratio);
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const player = game.player;
    if (!player) {
      return;
    }
    ctx.font = '600 11px "Silkscreen", "Courier New", monospace';
    ctx.textAlign = 'center';
    // battles: soldiers' bars only near the camera, and not zoomed far out
    const view = game.battle ? (game.battle.commander ? game.battle.cam : player.center()) : null;
    const barRange = game.gfx.zoom * 24 * 1.4;
    const soldierBars = !game.battle || game.gfx.zoom < 110;
    for (const e of game.entities) {
      if (e.side && e.rig && !e.isDragon && !e.killed && e.hp < e.maxHp) {
        // battle soldiers: a small bar in their side's colour once they are hurt
        if (!soldierBars || Math.abs(e._cx - view.x) > barRange || Math.abs(e._cy - view.y) > barRange) {
          continue;
        }
        const c = e.center();
        const p = game.gfx.project(c.x, c.y, e.rig.height + 0.3);
        if (p && p.x > -30 && p.y > -30 && p.x < w + 30 && p.y < h + 30) {
          ctx.fillStyle = 'rgba(0,0,0,0.6)';
          ctx.fillRect(p.x - 15, p.y - 1, 30, 5);
          ctx.fillStyle = e.side === 'player' ? '#5a9aff' : '#ff4a4a';
          ctx.fillRect(p.x - 14, p.y, 28 * Math.max(0, e.hp / e.maxHp), 3);
        }
        continue;
      }
      if (e.killed || !(e instanceof Orc || e instanceof Clericorc || e instanceof Mageorc || e instanceof Boss || e instanceof Dragon || e instanceof DuelWizard)) {
        continue;
      }
      if (e.invis || (!e.side && e.distanceTo(player) > 900) || !e.rig) {
        continue;
      }
      const c = e.center();
      const p = game.gfx.project(c.x, c.y, e.rig.height + 0.5);
      if (!p || p.x < -60 || p.y < -30 || p.x > w + 60 || p.y > h + 30) {
        continue;
      }
      const big = e instanceof Boss || e instanceof DuelWizard || e.miniBoss || e.isBoss;
      // battle dragons: bars from anywhere, names only up close
      const named = !e.side || game.gfx.zoom < 80;
      const bw = big ? 90 : 48;
      const ratioHp = Math.max(0, Math.min(1, e.hp / e.maxHp));
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillRect(p.x - bw / 2 - 1, p.y - 1, bw + 2, 7);
      ctx.fillStyle = e.side === 'player' ? '#5a9aff' : (e.aggro || game.duelMode ? '#e33' : '#a55');
      ctx.fillRect(p.x - bw / 2, p.y, bw * ratioHp, 5);
      if (!named) {
        continue;
      }
      const text = (e.label ? e.label + ' ' : '') + Math.max(0, Math.round(e.hp));
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillText(text, p.x + 1, p.y - 4);
      ctx.fillStyle = e.isChampion ? '#ffd060' : (big ? '#ff9ad0' : '#f0e0d0');
      ctx.fillText(text, p.x, p.y - 5);
    }
  }

  dispose() {
    this.root.innerHTML = '';
  }
}
