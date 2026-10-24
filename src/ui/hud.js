import { SpellById } from '../entities/mage.js';
import { BarSlots, GLOBAL_COOLDOWN, WizardLevels, ROMAN, rankOf, rankCooldown } from '../entities/spellbar.js';
import { InventoryScreen } from './inventory.js';
import { DungeonLevels, Races } from '../world/levels.js';
import { Orc } from '../entities/orc.js';
import { Clericorc, Mageorc, Boss } from '../entities/bosses.js';
import { Dragon } from '../entities/dragon.js';
import { DuelWizard } from '../entities/duelWizard.js';
import { Minimap } from './minimap.js';
import { openControls } from './controls.js';
import { actionKeyLabel, bindingsVersion } from '../core/bindings.js';
import { isTouch } from '../core/device.js';
import { DuelRules } from '../entities/duelRules.js';
import { missileTier } from '../entities/spells.js';
import { spellIcon } from './spellIcons.js';
import { circleName, cooldownFor, dragSource, dropTarget, seconds } from './spellbook.js';

// height of an item's name tag on the floor (CSS px)
const LOOT_TAG_H = 17;

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

// Small pictures for the HUD: the unit frames' portraits and the micro menu.
const SVG = (body) => `<svg viewBox="0 0 40 40" aria-hidden="true">${body}</svg>`;
const HAT = (color, band) => SVG(`<ellipse cx="20" cy="33" rx="16" ry="4" fill="${color}"/><path d="M10 33 L19 5 Q24 3 30 9 Q25 8 24 12 L30 33 Z" fill="${color}"/><rect x="10" y="27" width="20" height="3.4" fill="${band}"/><circle cx="17" cy="20" r="1.4" fill="#fff4c0"/><circle cx="22" cy="14" r="1.1" fill="#fff4c0"/>`);
const ICON_BOOK = SVG('<path d="M6 8 Q13 5 20 9 V34 Q13 30 6 33 Z" fill="#c8a060"/><path d="M34 8 Q27 5 20 9 V34 Q27 30 34 33 Z" fill="#e0bc78"/><path d="M20 9 V34" stroke="#5a3a12" stroke-width="1.5"/><path d="M10 14 Q14 13 17 15 M10 19 Q14 18 17 20 M23 15 Q26 13 30 14 M23 20 Q26 18 30 19" stroke="#5a3a12" stroke-width="1.2" fill="none"/>');
const ICON_BAG = SVG('<path d="M14 10 Q20 4 26 10" stroke="#a87a3a" stroke-width="3" fill="none"/><path d="M9 14 Q9 11 13 11 H27 Q31 11 31 14 L34 32 Q34 35 30 35 H10 Q6 35 6 32 Z" fill="#a8743a"/><path d="M8 18 H32" stroke="#6a4418" stroke-width="2"/><circle cx="20" cy="22" r="2.4" fill="#ffd060"/>');
const ICON_MAP = SVG('<path d="M5 9 L14 6 L26 10 L35 7 V31 L26 34 L14 30 L5 33 Z" fill="#d8c08a"/><path d="M14 6 V30 M26 10 V34" stroke="#8a6a3a" stroke-width="1.2"/><path d="M9 25 Q14 18 19 22 T30 15" stroke="#b4232f" stroke-width="1.6" fill="none" stroke-dasharray="2 2"/><path d="M28 13 L32 17 M32 13 L28 17" stroke="#b4232f" stroke-width="1.8"/>');
const ICON_KEYS = SVG('<rect x="4" y="11" width="32" height="20" rx="3" fill="#8a8f9c"/><g fill="#e8ecf2"><rect x="7" y="14" width="5" height="4" rx="1"/><rect x="14" y="14" width="5" height="4" rx="1"/><rect x="21" y="14" width="5" height="4" rx="1"/><rect x="28" y="14" width="5" height="4" rx="1"/><rect x="7" y="20" width="5" height="4" rx="1"/><rect x="14" y="20" width="5" height="4" rx="1"/><rect x="21" y="20" width="5" height="4" rx="1"/><rect x="28" y="20" width="5" height="4" rx="1"/><rect x="11" y="26" width="18" height="3" rx="1"/></g>');
const ICON_PAUSE = SVG('<circle cx="20" cy="20" r="15" fill="#3a3f4c" stroke="#d8cbb8" stroke-width="2"/><rect x="14" y="12" width="4" height="16" rx="1" fill="#f0e6d6"/><rect x="22" y="12" width="4" height="16" rx="1" fill="#f0e6d6"/>');
const ICON_LOCK = SVG('<path d="M13 18 V13 Q13 6 20 6 Q27 6 27 13 V18" stroke="#9a907e" stroke-width="3" fill="none"/><rect x="10" y="18" width="20" height="16" rx="2" fill="#7a705e"/><circle cx="20" cy="25" r="2.4" fill="#2a2620"/><rect x="19" y="26" width="2" height="4" fill="#2a2620"/>');

// Everything drawn over the 3D view, laid out like WoW's: the wizard's and
// the rival's unit frames at the top left, the action bar along the bottom
// with an icon per spell, the micro menu at the bottom right, the minimap at
// the top right, labels above monsters, banners, toasts and the pause and
// end screens.
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

    this.labels = el('canvas', 'hud-labels', root);
    // a spell being spoken (power word kill): its name and how far along
    this.castBar = el('div', 'hud-castbar hidden', root);
    this.castFill = el('div', 'hud-castbar-fill', this.castBar);
    el('div', 'hud-castbar-text', this.castBar, 'POWER WORD KILL');
    // item names on the floor (drawLootLabels), toggled by a key
    this.lootNames = true;
    this.itemTags = [];
    this.vignette = el('div', 'hud-vignette', root);
    this.tint = el('div', 'hud-tint', root);

    const top = el('div', 'hud-top', root);
    this.title = el('div', 'hud-title', top);

    // unit frames: the wizard, and in trials its reflection beside it
    const frames = el('div', 'hud-frames', root);
    const me = this.makeFrame(frames, 'player', HAT('#2a4fa8', '#ffb85a'));
    this.playerFrame = me;
    setText(me.name, 'YOU');
    this.hpBar = this.makeBar(me.body, '', 'hp');
    this.myBar = this.makeBar(me.body, '', 'my');
    const rival = this.makeFrame(frames, 'rival', HAT('#8a1a24', '#ffd060'));
    this.rivalBox = rival.frame;
    this.rivalName = rival.name;
    this.rivalTag = rival.level;
    this.rivalHp = this.makeBar(rival.body, '', 'rival-hp');
    this.rivalMy = this.makeBar(rival.body, '', 'rival-my');
    this.rivalInfo = el('div', 'rival-info', rival.body);

    // the action bar: magic missile on its own key, then the bar's slots
    // (spellbar.js); the wizard's experience runs along its top
    const dock = el('div', 'hud-dock', root);
    this.dock = dock;
    this.hint = el('div', 'hud-hint', dock, 'Find scrolls to learn spells.');
    const strip = el('div', 'xp-strip', dock);
    this.xpBar = { fill: el('div', 'xp-fill', strip), text: el('span', 'xp-text', strip) };
    const bar = el('div', 'action-bar', dock);
    this.spellRows = [null, ...BarSlots].map((slot, i) => {
      const btn = el('div', 'action-btn' + (slot ? '' : ' missile'), bar);
      const r = {
        action: slot ? slot.action : 'missile',
        index: i - 1,
        btn,
        icon: el('div', 'action-icon', btn),
        sweep: el('div', 'action-sweep', btn),
        time: el('span', 'action-time', btn),
        key: el('span', 'action-key', btn),
        rank: el('span', 'action-rank', btn),
        count: el('span', 'action-count', btn),
        state: null,
        spellId: undefined,
        sweepShown: '',
        ownCooling: false
      };
      if (!slot) {
        el('div', 'action-sep', bar);
      }
      // on a touch screen the buttons cast instead (ui/touch.js), and only
      // open the spellbook while it is open already
      btn.addEventListener('mouseenter', () => {
        if (!isTouch()) {
          this.showTip(btn, (tip) => this.fillSpellTip(tip, r));
        }
      });
      btn.addEventListener('mouseleave', () => this.hideTip());
      btn.addEventListener('click', () => {
        if (!isTouch() || this.game.inventoryOpen) {
          this.openSlot(r.index);
        }
      });
      if (slot) {
        // while the spellbook is open, spells drag onto, off and along the bar
        dragSource(btn, () => (r.spellId && this.game.inventoryOpen ? { id: r.spellId, from: r.index } : null));
        dropTarget(btn, (drag) => {
          const book = this.inventoryScreen.spellbook;
          book.dropOnSlot(r.index, drag);
        });
      }
      return r;
    });

    // the micro menu: spellbook, bag, map, controls, pause
    this.micro = el('div', 'hud-micro', root);
    const micro = (svg, tip, fn, cls = '') => {
      const b = el('button', 'micro-btn' + (cls ? ' ' + cls : ''), this.micro);
      b.type = 'button';
      b.tabIndex = -1;
      b.innerHTML = svg;
      // keep the focus off it, so Space and Enter stay the game's
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.onclick = fn;
      b.addEventListener('mouseenter', () => {
        if (isTouch()) {
          return;
        }
        this.showTip(b, (node) => {
          const [title, text] = tip();
          el('div', 'tip-title', node, title);
          if (text) {
            el('div', 'tip-dim', node, text);
          }
        });
      });
      b.addEventListener('mouseleave', () => this.hideTip());
      return { node: b, badge: el('span', 'micro-badge hidden', b, '') };
    };
    this.bookButton = micro(ICON_BOOK, () => ['SPELLBOOK (' + actionKeyLabel('spellbook') + ')', 'Choose your spells and their keys.'],
      () => game.toggleSpellbook());
    this.bagButton = micro(ICON_BAG, () => ['INVENTORY (' + actionKeyLabel('inventory') + ')', 'Your gear and your bag.'],
      () => game.toggleInventory(!(game.inventoryOpen && this.inventoryScreen.tab === 'gear'), 'gear'));
    // touch screens tap the map itself, and reach the controls from the pause screen
    micro(ICON_MAP, () => ['MAP (' + actionKeyLabel('map') + ')', 'The larger map.'], () => this.toggleMap(), 'desktop-only');
    micro(ICON_KEYS, () => ['CONTROLS', 'Movement, camera and every other key.'], () => {
      game.setPaused(true);
      openControls();
    }, 'desktop-only');
    micro(ICON_PAUSE, () => ['PAUSE (' + actionKeyLabel('pause') + ')', ''], () => game.setPaused(!game.paused));

    this.tip = el('div', 'hud-tooltip hidden', root);
    this.tipAnchor = null;

    // the panels of every kind of stage; applyMode shows the current one's
    const right = el('div', 'hud-right', root);
    this.rightPanel = right;
    this.battleBox = el('div', 'hud-battle', right);
    this.battleScore = el('div', 'battle-score', this.battleBox);
    this.battleArmies = el('div', 'map-line', this.battleBox);
    this.battleDragons = el('div', 'map-line', this.battleBox);
    this.battleMode = el('div', 'map-line battle-mode', this.battleBox);
    this.battleKeys = el('div', 'map-line dim', this.battleBox);
    this.dragBox = el('div', 'drag-box', root);
    // the player's regiments as clickable cards along the bottom
    this.regimentBar = el('div', 'hud-regiments', root);
    this.regimentCards = [];
    // duels are fought in a small dungeon too, so every stage gets the map
    const mapBox = el('div', 'hud-map', right);
    this.mapCanvas = el('canvas', 'minimap', mapBox);
    this.minimap = new Minimap(this.mapCanvas, game);
    this.roomLabel = el('div', 'map-line', mapBox);
    this.slainLabel = el('div', 'map-line', mapBox);
    this.goalLabel = el('div', 'map-line goal', mapBox);
    this.mapHint = el('div', 'map-line dim', mapBox, '');
    // touch screens tap the map to enlarge it (and tap it again to close)
    mapBox.addEventListener('click', () => {
      if (isTouch()) {
        this.toggleMap();
      }
    });

    this.banner = el('div', 'hud-banner', root);
    this.bannerTitle = el('div', 'banner-title', this.banner);
    this.bannerText = el('div', 'banner-text', this.banner);
    this.prompt = el('div', 'hud-prompt', root);
    // on a touch screen the stairs' prompt is the button to go down
    this.prompt.addEventListener('click', () => {
      if (isTouch()) {
        game.input.queued.add('descend');
      }
    });
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
    this.applyMode();
  }

  // A new stage: the panels for a dungeon floor, a duel or a battle, and a
  // fresh map.
  applyMode() {
    const game = this.game;
    const floor = !game.duelMode;
    this.root.classList.toggle('battle', !!game.battleMode);
    this.root.classList.toggle('duel', !!game.duelMode);
    this.rivalBox.style.display = game.duelMode ? '' : 'none';
    this.battleBox.style.display = game.battleMode ? '' : 'none';
    this.regimentBar.style.display = game.battleMode ? '' : 'none';
    this.dragBox.style.display = 'none';
    this.slainLabel.style.display = floor ? '' : 'none';
    this.goalLabel.style.display = floor ? '' : 'none';
    if (game.battle) {
      this.buildRegimentCards(game.battle);
    }
    this.minimap.render();
    this.endScreen.classList.add('hidden');
    this.micro.classList.remove('hidden');
  }

  makeFrame(parent, kind, portraitSvg) {
    const frame = el('div', 'unit-frame ' + kind, parent);
    const portrait = el('div', 'uf-portrait', frame);
    portrait.innerHTML = portraitSvg;
    const level = el('span', 'uf-level', portrait, '');
    const body = el('div', 'uf-body', frame);
    const name = el('div', 'uf-name', body, '');
    return { frame, portrait, level, body, name };
  }

  // A tooltip over `anchor`, filled by `fill(node)`, kept on the screen.
  showTip(anchor, fill) {
    const tip = this.tip;
    tip.textContent = '';
    fill(tip);
    tip.classList.remove('hidden');
    const r = anchor.getBoundingClientRect();
    const x = Math.max(8, Math.min(window.innerWidth - tip.offsetWidth - 8, r.left + r.width / 2 - tip.offsetWidth / 2));
    tip.style.left = x + 'px';
    tip.style.top = Math.max(8, r.top - tip.offsetHeight - 10) + 'px';
    this.tipAnchor = anchor;
    this.tipFill = fill;
  }

  hideTip() {
    this.tip.classList.add('hidden');
    this.tipAnchor = null;
  }

  // What a bar button's spell does, in WoW's tooltip order.
  fillSpellTip(tip, r) {
    const player = this.game.player;
    const line = (cls, left, right) => {
      const row = el('div', 'tip-row ' + cls, tip);
      el('span', null, row, left);
      if (right) {
        el('span', 'tip-right', row, right);
      }
      return row;
    };
    if (!player || r.state === 'locked') {
      line('tip-title', 'LOCKED SLOT');
      line('tip-dim', 'Opens at wizard level ' + BarSlots[r.index].level + '.');
      return;
    }
    const id = r.spellId;
    const footer = 'KEY ' + actionKeyLabel(r.action) + ' :: CLICK FOR THE SPELLBOOK';
    if (!id) {
      line('tip-title', 'EMPTY SLOT');
      line('tip-dim', 'Drag a spell here from the spellbook.');
      line('tip-foot', footer);
      return;
    }
    const spell = SpellById[id];
    const rank = rankOf(player, id);
    const school = DuelRules.schools[DuelRules.schoolOf(id)];
    line('tip-title', spell.name, rank >= 2 || id === 'missile' ? 'RANK ' + ROMAN[rank] : '');
    const cd = cooldownFor(player, id);
    line('tip-stat', spell.cost ? spell.cost + ' MANERGY' : 'NO COST', cd ? seconds(cd) + ' COOLDOWN' : 'NO COOLDOWN');
    if (school) {
      line('tip-school', school.name + (spell.circle ? ' :: ' + circleName(spell.circle) : '')).style.color = school.color;
    }
    line('tip-text', spell.text);
    line('tip-foot', footer);
  }

  // A click on the bar opens the spellbook on that slot.
  openSlot(index) {
    const game = this.game;
    if (!game.inventoryOpen || this.inventoryScreen.tab !== 'spells') {
      game.toggleInventory(true, 'spells');
    }
    if (game.inventoryOpen) {
      this.inventoryScreen.spellbook.selectSlot(index);
      this.inventoryScreen.render();
    }
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
    // the first stage starts before the HUD is built
    if (this.minimap) {
      this.applyMode();
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

  // The micro menu's badges: the bag's items, and spells waiting in the book
  // while the bar has room for them.
  updateMicro(player) {
    const bag = player.inventory ? player.inventory.bag.length : 0;
    const badge = (button, text, hot) => {
      setText(button.badge, text);
      button.badge.classList.toggle('hidden', !text);
      button.node.classList.toggle('attention', !!hot);
    };
    badge(this.bagButton, bag ? String(bag) : '');
    const room = player.bar.slice(0, player.slotLimit).some((s) => !s);
    const waiting = room ? player.waitingInBook().length : 0;
    badge(this.bookButton, waiting ? String(waiting) : '', waiting > 0);
    this.bookButton.node.classList.toggle('open', this.game.inventoryOpen && this.inventoryScreen.tab === 'spells');
    this.bagButton.node.classList.toggle('open', this.game.inventoryOpen && this.inventoryScreen.tab === 'gear');
  }

  showPause(paused) {
    this.pauseScreen.classList.toggle('hidden', !paused);
    this.pauseHint.textContent = isTouch() ? 'The game waits.' : 'Press ESC or ' + actionKeyLabel('pause') + ' to resume.';
  }

  showEnd({ title, text, stats, saved, time, win }) {
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
    el('p', 'dim', card, saved ? 'Game data saved :: ' + saved.replace(/^Saved\s*/, '') : 'Game data not saved (no backend running).');
    const buttons = el('div', 'buttons', card);
    const again = el('button', null, buttons, 'Descend again');
    again.onclick = () => this.game.onExit && this.game.onExit('restart');
    const menu = el('button', 'secondary', buttons, 'Main menu');
    menu.onclick = () => this.game.onExit && this.game.onExit('menu');
    this.micro.classList.add('hidden');
    this.hideTip();
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
    const where = 'DEPTH ' + game.depth + ' / ' + DungeonLevels.count + (game.trial ? ' :: ' + game.stageName() : '');
    setText(this.title, 'END OF THE WORLDS 3D ( PRE-ALPHA )  ::  ' + where + '  ::  SCORE: ' + game.stats.killcount + '  ::  FPS: ' + this.fps);
    if (!player) {
      return;
    }

    // bars: the 2D game drew 1px per point; here they fill against a cap
    const hpCap = Math.max(player.maxHp || 100, 100, player.hp);
    this.hpBar.fill.style.width = Math.max(0, player.hp / hpCap * 100) + '%';
    setText(this.hpBar.text, Math.max(0, Math.round(player.hp)) + '');
    this.myBar.fill.style.width = Math.max(0, Math.min(1, player.manergy / player.maxManergy) * 100) + '%';
    setText(this.myBar.text, Math.max(0, Math.round(player.manergy)) + ' / ' + player.maxManergy);
    const ch = player.channel;
    this.castBar.classList.toggle('hidden', !ch);
    if (ch) {
      this.castFill.style.width = Math.min(100, (1 - ch.left / ch.total) * 100) + '%';
    }

    setText(this.playerFrame.level, String(player.level));
    const table = WizardLevels.xp;
    const top = player.level >= WizardLevels.max;
    const span = top ? 1 : table[player.level + 1] - table[player.level];
    const into = top ? 1 : player.xp - table[player.level];
    this.xpBar.fill.style.width = Math.max(0, Math.min(1, into / span)) * 100 + '%';
    setText(this.xpBar.text, 'LEVEL ' + player.level + (top ? ' :: MAX' : ' :: ' + Math.floor(into) + ' / ' + span + ' XP'));

    const keysChanged = this.keysVersion !== bindingsVersion();
    this.keysVersion = bindingsVersion();
    for (const r of this.spellRows) {
      this.updateSpellRow(r, player, keysChanged);
    }
    const known = player.learnOrder.filter((id) => player.knowsSpell(id)).length;
    this.hint.style.display = known === 0 && !game.duelMode ? '' : 'none';
    this.updateMicro(player);

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

  // One button of the action bar: magic missile, a slot's spell, an empty
  // slot, or the next slot still to open. The cooldown sweeps round the icon
  // the way WoW's does, with the seconds left on long ones.
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
    } else if (r.index === player.slotLimit && player.level < WizardLevels.max) {
      state = 'locked';
    } else {
      state = 'hidden';
    }
    if (r.state !== state || r.spellId !== id || keysChanged) {
      r.state = state;
      r.spellId = id;
      r.btn.style.display = state === 'hidden' ? 'none' : '';
      r.btn.classList.toggle('empty', state === 'empty');
      r.btn.classList.toggle('locked', state === 'locked');
      r.icon.textContent = '';
      if (id) {
        spellIcon(id, r.icon);
      } else if (state === 'locked') {
        r.icon.innerHTML = ICON_LOCK;
      }
      setText(r.key, state === 'locked' ? '' : actionKeyLabel(r.action));
      setText(r.count, state === 'locked' ? 'LV' + BarSlots[r.index].level : '');
      setText(r.rank, '');
      setText(r.time, '');
      r.sweepShown = '';
      r.sweep.style.display = 'none';
      if (this.tipAnchor === r.btn) {
        if (state === 'hidden') {
          this.hideTip();
        } else {
          this.showTip(r.btn, this.tipFill);
        }
      }
    }
    r.btn.classList.toggle('draggable', !!id && r.index >= 0 && game.inventoryOpen);
    if (!id) {
      r.btn.classList.remove('cooling', 'starved', 'pressed');
      return;
    }
    const spell = SpellById[id];
    const rank = rankOf(player, id);
    setText(r.rank, id !== 'missile' && rank >= 2 ? ROMAN[rank] : '');
    let left = player.cd[id] || 0;
    const own = left;
    // magic missile's cooldown grows with its darts
    // (or, just put on the bar, the longer wait before it can be cast)
    const base = id === 'missile' ? missileTier(player).cd : player.cooldownOf(spell.cd * rankCooldown(player, id));
    const full = left > base ? Math.max(left, player.cdFull[id] || 0) : base;
    let frac = full > 0 ? 1 - left / full : 1;
    // every spell but magic missile waits out the global cooldown
    if (id !== 'missile' && player.gcd > left) {
      left = player.gcd;
      frac = Math.min(frac, 1 - player.gcd / GLOBAL_COOLDOWN);
    }
    const sweep = left > 0 ? Math.max(0, Math.min(360, frac * 360)).toFixed(0) + 'deg' : '';
    if (sweep !== r.sweepShown) {
      r.sweepShown = sweep;
      r.sweep.style.display = sweep ? '' : 'none';
      if (sweep) {
        r.sweep.style.setProperty('--sweep', sweep);
      }
    }
    setText(r.time, own >= 90 ? String(Math.ceil(own / 60)) : '');
    // a long cooldown that runs out flashes the button
    const ownCooling = own > 0 && full >= 90;
    if (r.ownCooling && !ownCooling) {
      r.btn.classList.remove('ready');
      void r.btn.offsetWidth;
      r.btn.classList.add('ready');
    }
    r.ownCooling = ownCooling;
    const affordable = player.manergy > spell.need && !(id === 'ironshot' && player.is2Charges <= 0 && left > 0);
    r.btn.classList.toggle('cooling', left > 0);
    r.btn.classList.toggle('starved', left <= 0 && !affordable);
    r.btn.classList.toggle('pressed', game.input.held.has(r.action));
    if (id === 'ironshot' && player.hasIs2) {
      setText(r.count, String(player.is2Charges));
    } else if (id === 'missile') {
      setText(r.count, player.missileTier > 1 ? 'x' + player.missileTier : '');
    }
  }

  updateRival() {
    const rival = this.game.rival;
    if (!rival) {
      return;
    }
    setText(this.rivalName, 'YOUR REFLECTION');
    setText(this.rivalTag, String(rival.level));
    this.rivalTag.title = 'Level ' + rival.level + ' (' + rival.difficulty + ')';
    this.rivalHp.fill.style.width = Math.max(0, rival.hp / rival.maxHp * 100) + '%';
    setText(this.rivalHp.text, Math.max(0, Math.round(rival.hp)) + '');
    this.rivalMy.fill.style.width = Math.max(0, rival.manergy / rival.maxManergy * 100) + '%';
    setText(this.rivalMy.text, Math.round(rival.manergy) + '');
    // its bar's spells, as the banner counts them; magic missile apart
    const spells = (rival.known ? ' :: ' + rival.known.size + (rival.known.size === 1 ? ' SPELL' : ' SPELLS') : '') + ' :: MISSILE x' + rival.missileTier;
    setText(this.rivalInfo, rival.difficulty.toUpperCase() + ' :: ' + rival.tactic.toUpperCase() + spells);
  }

  updateBattle() {
    const battle = this.game.battle;
    setText(this.battleScore, 'YOUR ' + Races[battle.races.player].name + ' VS ITS ' + Races[battle.races.enemy].name);
    const dragons = { player: battle.dragonCount('player'), enemy: battle.dragonCount('enemy') };
    setText(this.battleArmies, 'ARMIES :: ' + (battle.armyCount('player') - dragons.player) + ' VS ' + (battle.armyCount('enemy') - dragons.enemy));
    setText(this.battleDragons, 'DRAGONS :: ' + dragons.player + ' VS ' + dragons.enemy);
    const touch = isTouch();
    setText(this.battleMode, (battle.commander ? 'COMMANDER MODE' : 'SPELL MODE') + (touch ? '' : ' :: ' + actionKeyLabel('mode_toggle') + ' TO SWITCH'));
    this.battleMode.classList.toggle('commander', battle.commander);
    let keys;
    if (touch) {
      keys = battle.commander ? 'TAP YOUR SOLDIERS :: TAP GROUND TO MARCH, A FOE TO ATTACK' : 'ORDER THE SELECTED FROM THE BUTTONS';
    } else {
      keys = battle.commander
        ? 'CLICK / DRAG SELECT :: RIGHT CLICK MOVE OR ATTACK'
        : actionKeyLabel('order_charge') + ' CHARGE  ' + actionKeyLabel('order_hold') + ' MARCH  ' + actionKeyLabel('order_follow') + ' FOLLOW';
    }
    setText(this.battleKeys, keys);
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
      // a touch screen has no shift: a tap adds or takes away
      node.onclick = (e) => battle.toggleSelect(regiment.id, e.shiftKey || isTouch());
      return { regiment, node, count, order, fill };
    });
  }

  // A trial is over: what happened and, if it was won, the spoils to choose
  // from (mirror.js). `onPick` gets the chosen spoil's id, or null.
  showTrialEnd({ won, title, text, choices, onPick }) {
    const screen = this.endScreen;
    screen.innerHTML = '';
    screen.classList.remove('hidden');
    this.micro.classList.add('hidden');
    this.hideTip();
    const card = el('div', 'card end' + (won ? ' win' : ''), screen);
    el('h2', null, card, title);
    el('p', null, card, text);
    if (choices.length) {
      el('p', null, card, 'Take your reflection\'s spoils: a spell, a dart or a rank.');
      const buttons = el('div', 'buttons draft', card);
      for (const c of choices) {
        const b = el('button', null, buttons, c.name);
        b.onclick = () => onPick(c.id);
      }
    } else {
      const buttons = el('div', 'buttons', card);
      const b = el('button', null, buttons, 'Descend');
      b.onclick = () => onPick(null);
    }
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
      room = game.stageName();
    }
    setText(this.roomLabel, room);
    setText(this.mapHint, isTouch() ? 'TAP THE MAP :: LARGER MAP' : actionKeyLabel('map') + ' :: LARGER MAP');
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
    const open = game.isStairsOpen();
    const touch = isTouch();
    if (stairs && stairs.playerOn && game.state === 'playing') {
      setText(this.prompt, open ? (touch ? 'DESCEND' : 'PRESS ' + actionKeyLabel('descend').toUpperCase() + ' TO DESCEND') : 'SEALED :: SLAY ' + game.getKillsToUnseal() + ' MORE');
      this.prompt.style.opacity = '1';
      this.prompt.classList.toggle('actionable', touch && open);
    } else {
      this.prompt.style.opacity = '0';
      this.prompt.classList.remove('actionable');
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
      setText(this.bannerTitle, game.stageName() + ' :: ' + count('player') + ' VS ' + count('enemy'));
      const now = isTouch() ? 'ATTACK NOW TO START AT ONCE' : actionKeyLabel('descend') + ' TO ATTACK NOW';
      setText(this.bannerText, 'DEPLOY YOUR REGIMENTS :: ' + now + ' :: ' + Math.ceil(battle.deploy / 60));
      this.banner.style.opacity = '1';
      return;
    }
    // a battle's own banner is the one above, while the armies deploy
    if (battle || game.bannerFrames <= 0 || game.state !== 'playing') {
      this.banner.style.opacity = '0';
      return;
    }
    setText(this.bannerTitle, 'DEPTH ' + game.depth + ' :: ' + game.stageName());
    const plan = DungeonLevels.getPlan(game.depth);
    let text;
    if (game.trial) {
      const rival = game.rival;
      const spells = rival && rival.known ? rival.known.size : 0;
      text = 'YOUR REFLECTION :: LEVEL ' + (rival ? rival.level : '') + ' :: ' + spells + (spells === 1 ? ' SPELL' : ' SPELLS') + ' OF ITS OWN :: SLAY IT TO GO ON';
    } else {
      // every floor names the room where its stairs wait (world/looks.js)
      const stairsRoom = game.world.look.rooms.throne || 'THRONE ROOM';
      text = 'FIND THE STAIRS IN THE ' + stairsRoom;
      if (plan.boss === 'warlord') {
        text = 'THE WARLORD AWAITS IN THE ' + stairsRoom;
      } else if (plan.boss === 'wyrm') {
        text = 'THE GREAT GOLDEN WYRM SLEEPS ON ITS HOARD';
      } else if (plan.dragons) {
        text = 'DRAGONS LAIR ON THIS FLOOR :: FIND THE STAIRS IN THE ' + stairsRoom;
      }
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
    this.itemTags = [];
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
    this.drawLootLabels(ctx, w, h);
  }

  // Survival: item names on the floor, the way Diablo shows them. Every item
  // on screen gets a dark tag in its rarity's colour (or only the one under
  // the cursor, with the names toggled off); tags that would overlap stack
  // upwards, nearest the bottom of the screen first, so each one can be
  // read and clicked. The hovered tag lights up, and clicking it sends the
  // wizard to pick the item up (game.pointedItem keeps the boxes).
  drawLootLabels(ctx, w, h) {
    const game = this.game;
    const player = game.player;
    if (game.duelMode || !player || game.state !== 'playing') {
      return;
    }
    const under = game.hoveredItem();
    const pc = player.center();
    const tags = [];
    for (const e of game.entities) {
      if (e.killed || typeof e.labelColor !== 'function' || !e.view || !e.view.visible) {
        continue;
      }
      if (!this.lootNames && e !== under) {
        continue;
      }
      const c = e.center();
      if (Math.abs(c.x - pc.x) > 1400 || Math.abs(c.y - pc.y) > 1400) {
        continue;
      }
      const p = game.gfx.project(c.x, c.y, 1.4);
      if (!p || p.x < -80 || p.y < -20 || p.x > w + 80 || p.y > h + 40) {
        continue;
      }
      const text = e.label();
      const tw = ctx.measureText(text).width + 12;
      tags.push({ item: e, text, x0: p.x - tw / 2, x1: p.x + tw / 2, y0: p.y - LOOT_TAG_H, y1: p.y });
    }
    tags.sort((a, b) => b.y1 - a.y1);
    const placed = [];
    for (const t of tags) {
      for (let guard = 0; guard < 60; guard++) {
        const hit = placed.find((o) => t.x0 < o.x1 + 2 && t.x1 > o.x0 - 2 && t.y0 < o.y1 + 1 && t.y1 > o.y0 - 1);
        if (!hit) {
          break;
        }
        t.y1 = hit.y0 - 1;
        t.y0 = t.y1 - LOOT_TAG_H;
      }
      placed.push(t);
    }
    const m = game.input.mouse;
    const pointed = m.inside ? placed.find((t) => m.x >= t.x0 && m.x <= t.x1 && m.y >= t.y0 && m.y <= t.y1) : null;
    for (const t of placed) {
      const lit = t === pointed || (!pointed && t.item === under);
      ctx.fillStyle = lit ? 'rgba(46,52,92,0.92)' : 'rgba(0,0,0,0.72)';
      ctx.fillRect(t.x0, t.y0, t.x1 - t.x0, t.y1 - t.y0);
      ctx.strokeStyle = lit ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.14)';
      ctx.strokeRect(t.x0 + 0.5, t.y0 + 0.5, t.x1 - t.x0 - 1, t.y1 - t.y0 - 1);
      ctx.fillStyle = t.item.labelColor();
      ctx.fillText(t.text, (t.x0 + t.x1) / 2, t.y1 - 5);
    }
    this.itemTags = placed;
  }

  dispose() {
    this.root.innerHTML = '';
  }
}
