import { Slots, Rarities, Stats, Sets, Gear, formatStat, slotFits, setPiecesWorn } from '../entities/gear.js';
import { actionKeyLabel } from '../core/bindings.js';
import { SpellbookPanel } from './spellbook.js';

// The inventory screen: the worn gear in its five slots, the bag, the
// wizard's resulting stats, and the selected item's properties compared
// with what it would replace. It sits at the right so the wizard stays in
// view in the middle, wearing each change as it is made. Its second tab is
// the spellbook (ui/spellbook.js).

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

const hex = (n) => '#' + n.toString(16).padStart(6, '0');

// A small picture of an item, drawn in its own colours.
function icon(type) {
  const look = type.look;
  let body;
  if (type.slot === 'hat') {
    const c = hex(look.color);
    const b = hex(look.band);
    switch (look.style) {
      case 'crown':
        body = `<path d="M8 30 L8 16 L14 22 L20 10 L26 22 L32 16 L32 30 Z" fill="${c}"/><rect x="8" y="27" width="24" height="4" fill="${b}"/><circle cx="20" cy="24" r="2.2" fill="${hex(look.glow)}"/>`;
        break;
      case 'hood':
        body = `<path d="M8 32 Q8 8 22 8 Q34 10 32 32 Z" fill="${c}"/><path d="M13 32 Q13 16 21 16 Q28 17 27 32 Z" fill="#000" opacity="0.55"/><path d="M13 32 Q13 16 21 16" stroke="${b}" stroke-width="1.5" fill="none"/>`;
        break;
      case 'wide':
        body = `<ellipse cx="20" cy="27" rx="17" ry="4" fill="${c}"/><rect x="12" y="15" width="16" height="12" rx="3" fill="${c}"/><rect x="12" y="22" width="16" height="3" fill="${b}"/>`;
        break;
      case 'mitre':
        body = `<path d="M11 31 L11 16 L20 6 L29 16 L29 31 Z" fill="${c}"/><rect x="11" y="27" width="18" height="4" fill="${b}"/><rect x="19" y="12" width="2" height="12" fill="${b}"/><rect x="16" y="16" width="8" height="2" fill="${b}"/>`;
        break;
      default:
        body = `<ellipse cx="20" cy="30" rx="15" ry="3.5" fill="${c}"/><path d="M12 30 L20 6 Q24 4 29 9 Q24 8 23 12 L28 30 Z" fill="${c}"/><rect x="12" y="25" width="16" height="3" fill="${b}"/>` +
          (look.glow ? `<circle cx="17" cy="20" r="1.4" fill="${hex(look.glow)}"/><circle cx="22" cy="15" r="1.2" fill="${hex(look.glow)}"/>` : '');
    }
  } else if (type.slot === 'robe') {
    const c = hex(look.robe);
    const t = hex(look.trim);
    body = (look.cape ? `<path d="M9 9 L31 9 L35 36 L5 36 Z" fill="${hex(look.cape)}"/>` : '') +
      `<path d="M14 6 L26 6 L33 35 L7 35 Z" fill="${c}"/><path d="M12 6 L28 6 L30 12 L10 12 Z" fill="${hex(look.mantle)}"/>` +
      `<rect x="7" y="32" width="26" height="3" fill="${t}"/><rect x="13" y="18" width="14" height="2.5" fill="${t}"/>`;
  } else if (type.slot === 'staff') {
    const g = hex(look.gem);
    body = `<line x1="9" y1="35" x2="27" y2="11" stroke="${hex(look.wood)}" stroke-width="3.2" stroke-linecap="round"/>` +
      `<circle cx="29" cy="9" r="7" fill="${g}" opacity="0.3"/><circle cx="29" cy="9" r="3.6" fill="${g}"/>`;
  } else {
    const g = hex(look.gem);
    body = `<circle cx="20" cy="23" r="9" fill="none" stroke="${hex(look.band)}" stroke-width="3.5"/>` +
      `<circle cx="20" cy="12" r="6" fill="${g}" opacity="0.3"/><path d="M20 7 L24 12 L20 17 L16 12 Z" fill="${g}"/>`;
  }
  return `<svg viewBox="0 0 40 40" width="40" height="40" aria-hidden="true">${body}</svg>`;
}

export class InventoryScreen {
  constructor(root, game) {
    this.game = game;
    this.node = el('div', 'hud-inventory hidden', root);
    this.node.setAttribute('role', 'dialog');
    this.node.setAttribute('aria-label', 'Inventory');
    // the item shown in the details panel: { item, slot } (slot when worn)
    this.selected = null;
    this.hovered = null;
    // 'gear' or 'spells'
    this.tab = 'gear';
    this.spellbook = new SpellbookPanel(this, game);
  }

  get inventory() {
    const player = this.game.player;
    return player ? player.inventory : null;
  }

  show(open, tab = 'gear') {
    const opening = open && this.node.classList.contains('hidden');
    this.node.classList.toggle('hidden', !open);
    if (!open) {
      this.spellbook.stopCapture();
    }
    if (open) {
      if (opening || tab !== this.tab) {
        this.selected = null;
        this.hovered = null;
        this.spellbook.reset();
      }
      this.tab = tab;
      this.render();
    }
  }

  // Wear, take off and drop. Each redraws the screen; the wizard's model
  // changes through the inventory's owner (Mage.onGearChanged).
  equip(item, slot) {
    if (this.inventory.equip(item, slot)) {
      this.selected = { item, slot: this.slotOf(item) };
    }
    this.render();
  }

  unequip(slot) {
    const item = this.inventory.equipped[slot];
    if (!this.inventory.unequip(slot)) {
      this.game.hud.toast('BAG FULL', '#ff8a70');
    } else {
      this.selected = { item, slot: null };
    }
    this.render();
  }

  drop(item) {
    const player = this.game.player;
    if (this.inventory.remove(item)) {
      const loot = this.game.dropGear(player, item);
      // left alone until the wizard steps off it
      loot.persistent = true;
      loot.waitClear = true;
    }
    this.selected = null;
    this.hovered = null;
    this.render();
  }

  slotOf(item) {
    const slot = Slots.find((s) => this.inventory.equipped[s.id] === item);
    return slot ? slot.id : null;
  }

  render() {
    const inv = this.inventory;
    const node = this.node;
    node.innerHTML = '';
    if (!inv) {
      return;
    }
    const head = el('div', 'inv-head', node);
    const tabs = el('div', 'inv-tabs', head);
    for (const [tab, label, action] of [['gear', 'GEAR', 'inventory'], ['spells', 'SPELLBOOK', 'spellbook']]) {
      const b = el('button', 'inv-tab' + (this.tab === tab ? ' active' : ''), tabs, label);
      b.type = 'button';
      b.title = label.toLowerCase() + ' (' + actionKeyLabel(action) + ')';
      b.setAttribute('aria-pressed', String(this.tab === tab));
      b.onclick = () => this.show(true, tab);
    }
    const close = el('button', 'secondary inv-close', head, this.game.loadout ? 'Start' : 'Close');
    close.type = 'button';
    close.title = 'Close (' + actionKeyLabel(this.tab === 'spells' ? 'spellbook' : 'inventory') + ' or Esc)';
    close.onclick = () => this.game.toggleInventory(false);
    if (this.tab === 'spells') {
      this.details = null;
      this.spellbook.render(node);
      return;
    }

    el('div', 'hud-heading', node, 'WORN');
    const worn = el('div', 'inv-slots', node);
    for (const slot of Slots) {
      const item = inv.equipped[slot.id];
      const cell = el('div', 'inv-slot', worn);
      const tile = this.tile(cell, item, { item, slot: slot.id });
      tile.classList.add('worn');
      if (!item) {
        tile.classList.add('empty');
        tile.title = slot.label + ' :: empty';
      }
      el('div', 'inv-slot-label', cell, slot.label);
    }

    this.renderStats(el('div', 'inv-stats', node));

    el('div', 'hud-heading', node, 'BAG  ' + inv.bag.length + ' / ' + inv.size);
    const bag = el('div', 'inv-bag', node);
    for (let i = 0; i < inv.size; i++) {
      const item = inv.bag[i] || null;
      const tile = this.tile(bag, item, { item, slot: null });
      if (!item) {
        tile.classList.add('empty');
      }
    }

    this.details = el('div', 'inv-details', node);
    this.renderDetails();
    el('div', 'map-line dim inv-help', node, 'CLICK TO SELECT :: DOUBLE CLICK TO WEAR OR TAKE OFF :: ' + actionKeyLabel('inventory') + ' / ESC TO CLOSE');
  }

  tile(parent, item, ref) {
    const tile = el('button', 'inv-tile', parent);
    tile.type = 'button';
    tile.item = item;
    if (!item) {
      tile.disabled = !ref.slot;
      return tile;
    }
    const rarity = Rarities[item.type.rarity];
    tile.style.setProperty('--rarity', rarity.color);
    tile.innerHTML = icon(item.type);
    tile.title = item.type.name;
    tile.setAttribute('aria-label', item.type.name + (ref.slot ? ' (worn)' : ''));
    if (this.selected && this.selected.item === item) {
      tile.classList.add('selected');
    }
    // selecting only restyles, so the tile survives for a double click
    tile.onclick = () => {
      this.selected = ref;
      for (const t of this.node.querySelectorAll('.inv-tile')) {
        t.classList.toggle('selected', t.item === item);
      }
      this.renderDetails();
    };
    tile.ondblclick = () => {
      if (ref.slot) {
        this.unequip(ref.slot);
      } else {
        this.equip(item);
      }
    };
    tile.onmouseenter = () => {
      this.hovered = ref;
      this.renderDetails();
    };
    tile.onmouseleave = () => {
      this.hovered = null;
      this.renderDetails();
    };
    return tile;
  }

  renderStats(box) {
    const player = this.game.player;
    const row = (label, value) => {
      el('span', 'stat-label', box, label);
      el('span', 'stat-value', box, value);
    };
    row('HP', Math.max(0, Math.round(player.hp)) + ' / ' + Math.round(player.maxHp));
    row('MANERGY', Math.round(player.manergy) + ' / ' + Math.round(player.maxManergy));
    for (const key in Stats) {
      if (key === 'maxHp' || key === 'maxManergy') {
        continue;
      }
      const value = player.bonus(key);
      if (value) {
        el('span', 'inv-bonus', box, formatStat(key, value));
      }
    }
  }

  renderDetails() {
    const box = this.details;
    if (!box) {
      return;
    }
    box.innerHTML = '';
    const ref = this.hovered || this.selected;
    if (!ref || !ref.item) {
      el('div', 'dim', box, 'Select an item to see what it does.');
      return;
    }
    const inv = this.inventory;
    const { item, slot } = ref;
    const type = item.type;
    const rarity = Rarities[type.rarity];
    const title = el('div', 'inv-name', box, type.name);
    title.style.color = rarity.color;
    const kind = Slots.find((s) => s.kind === type.slot);
    // rolled gear names its base under its own name
    const base = type.baseName && type.baseName !== type.name ? ' :: ' + type.baseName : '';
    el('div', 'dim', box, rarity.label + ' ' + (type.slot === 'ring' ? 'RING' : kind.label) + base + (slot ? ' :: WORN' : ''));
    const lines = el('div', 'inv-lines', box);
    for (const key in type.stats) {
      this.statLine(lines, key, type.stats[key]);
    }
    el('div', 'inv-text', box, type.text);
    if (type.set) {
      this.renderSet(box, type.set);
    }

    // what wearing it would change, against what it replaces
    if (!slot) {
      const target = inv.freeSlot(type) || Slots.find((s) => s.kind === type.slot).id;
      const current = inv.equipped[target];
      if (current) {
        el('div', 'hud-heading', box, 'INSTEAD OF ' + current.type.name);
        const diff = el('div', 'inv-lines', box);
        const keys = new Set([...Object.keys(type.stats), ...Object.keys(current.type.stats)]);
        let any = false;
        for (const key of keys) {
          const d = (type.stats[key] || 0) - (current.type.stats[key] || 0);
          if (Math.abs(d) > 1e-6) {
            this.statLine(diff, key, d);
            any = true;
          }
        }
        if (!any) {
          el('div', 'dim', diff, 'NO CHANGE');
        }
      }
    }

    // actions only for the selected item, not one merely hovered
    if (this.selected !== ref && this.hovered) {
      return;
    }
    const buttons = el('div', 'buttons inv-actions', box);
    const button = (text, fn, cls) => {
      const b = el('button', cls || null, buttons, text);
      b.type = 'button';
      b.onclick = fn;
    };
    if (slot) {
      button('Take off', () => this.unequip(slot));
    } else if (type.slot === 'ring') {
      for (const s of Slots.filter((x) => slotFits(x.id, type))) {
        button('Wear ' + (s.id === 'ring1' ? 'left' : 'right'), () => this.equip(item, s.id));
      }
    } else {
      button('Wear', () => this.equip(item));
    }
    button('Drop', () => this.drop(item), 'secondary');
  }

  // A set: its pieces (the worn ones lit) and its bonuses (the earned ones
  // lit).
  renderSet(box, setId) {
    const set = Sets[setId];
    const inv = this.inventory;
    const worn = setPiecesWorn(inv, setId);
    const wornIds = new Set(inv.worn().map((i) => i.type.id));
    const head = el('div', 'hud-heading inv-set-name', box, set.name + '  ' + worn + ' / ' + set.pieces.length);
    head.style.color = Rarities.set.color;
    const pieces = el('div', 'inv-lines', box);
    for (const id of set.pieces) {
      el('div', 'inv-set-piece' + (wornIds.has(id) ? ' on' : ''), pieces, Gear[id].name);
    }
    const bonuses = el('div', 'inv-lines', box);
    for (const [count, bonus] of set.bonuses) {
      const text = '(' + count + ') ' + Object.entries(bonus).map(([k, v]) => formatStat(k, v)).join(', ');
      el('div', 'inv-set-bonus' + (worn >= count ? ' on' : ''), bonuses, text);
    }
  }

  statLine(parent, key, value) {
    const spec = Stats[key];
    const line = el('div', 'inv-stat', parent, formatStat(key, value));
    const helps = spec ? Math.sign(value) === spec.good : value > 0;
    line.classList.add(helps ? 'good' : 'bad');
  }

  dispose() {
    this.node.remove();
  }
}
