import { SpellBook, SpellById } from '../entities/mage.js';
import { BarSlots, WizardLevels, RankRules, ROMAN, rankOf, rankCooldown } from '../entities/spellbar.js';
import { DuelRules } from '../entities/duelRules.js';
import { DuelSpells, playerSpellId } from '../entities/duelLoot.js';
import { missileTier } from '../entities/spells.js';
import {
  RESERVED, actionKeyLabel, actionLabel, bind, bindSlotKey, bindingOf, currentSlotKeys, keyLabel,
  resetActions, setSlotKeys, slotKeyBlocker
} from '../core/bindings.js';
import { spellIcon } from './spellIcons.js';

// The spellbook tab of the inventory screen, laid out like WoW's: the action
// bar at the top with the key of every slot under it, every spell the wizard
// knows below as a grid of icons, and the selected spell's details with the
// buttons that put it on the bar. Spells go on the bar by dragging an icon
// onto a slot (here or on the HUD's bar), by clicking a spell and then a
// slot, or by double clicking; dragging a slot's spell back onto the book
// takes it off. Clicking the key under a slot (or under magic missile) and
// pressing a key or mouse button binds it. A spell brought onto the bar from
// the book starts on its cooldown (Mage.prepare); moving spells along the bar
// is free, and so is everything while a classic duel's loadout is being
// chosen. Classic duels play on keys of their own (the duel keys), so there
// the slots' keys are the duel keys, and the bar and its keys can be saved
// as the player's loadout for the next classic duels.

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

function schoolTag(parent, id) {
  const school = DuelRules.schools[DuelRules.schoolOf(id)];
  const tag = el('span', 'spell-school', parent, school ? school.tag : '');
  if (school) {
    tag.style.color = school.color;
    tag.title = school.name;
  }
  return tag;
}

// spell circles run to IV, past the ranks' ROMAN
export function circleName(circle) {
  return 'CIRCLE ' + ['', 'I', 'II', 'III', 'IV'][circle];
}

export function seconds(frames) {
  return (frames / 60).toFixed(frames < 600 ? 1 : 0) + ' S';
}

// What each rank of a spell does.
export function rankText(spell, rank) {
  if (rank === 1) {
    return 'AS LEARNT';
  }
  if (spell.id === 'missile') {
    return rank === 2 ? spell.rank2 : spell.rank3;
  }
  if (rank === 2) {
    if (spell.rank2) {
      return spell.rank2;
    }
    return spell.grows ? '+' + Math.round(RankRules.power * 100) + '% ' + spell.grows : 'COOLDOWN -' + Math.round(RankRules.cooldownCut * 100) + '%';
  }
  return 'COOLDOWN -' + Math.round(RankRules.cooldownCut * 100) + '%';
}

// A spell's cooldown for `caster` in frames, ranks and gear counted.
export function cooldownFor(caster, id) {
  if (id === 'missile') {
    return missileTier(caster).cd;
  }
  const spell = SpellById[id];
  return spell.cd ? caster.cooldownOf(spell.cd * rankCooldown(caster, id)) : 0;
}

// The spell being dragged, { id, from } (`from` is the bar slot it was
// dragged off, or -1 from the book), shared with the HUD's bar.
export const SpellDrag = { current: null };

// Makes `node` drag `id` (from bar slot `from`, or -1). `id` may instead be
// a function that returns the { id, from } to drag, or null for nothing.
export function dragSource(node, id, from) {
  node.draggable = true;
  node.addEventListener('dragstart', (e) => {
    const drag = typeof id === 'function' ? id() : { id, from };
    if (!drag) {
      e.preventDefault();
      return;
    }
    SpellDrag.current = drag;
    e.dataTransfer.effectAllowed = 'move';
    // Firefox only starts a drag that carries data
    e.dataTransfer.setData('text/plain', drag.id);
    const icon = node.querySelector('.spell-icon');
    if (icon) {
      e.dataTransfer.setDragImage(icon, icon.offsetWidth / 2, icon.offsetHeight / 2);
    }
    document.body.classList.add('spell-dragging');
  });
  node.addEventListener('dragend', () => {
    SpellDrag.current = null;
    document.body.classList.remove('spell-dragging');
  });
}

// Makes `node` take a dragged spell: `drop(drag)` puts it there.
export function dropTarget(node, drop) {
  node.addEventListener('dragover', (e) => {
    if (SpellDrag.current) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      node.classList.add('drop-over');
    }
  });
  node.addEventListener('dragleave', () => node.classList.remove('drop-over'));
  node.addEventListener('drop', (e) => {
    node.classList.remove('drop-over');
    const drag = SpellDrag.current;
    if (drag) {
      e.preventDefault();
      SpellDrag.current = null;
      document.body.classList.remove('spell-dragging');
      drop(drag);
    }
  });
}

export class SpellbookPanel {
  constructor(screen, game) {
    this.screen = screen;
    this.game = game;
    // { id } for a spell, or { slot } for an empty slot
    this.selected = null;
    // the action whose key is being chosen, and what came of the last
    this.capturing = null;
    this.keyMessage = '';
    this.onCapture = null;
  }

  get player() {
    return this.game.player;
  }

  reset() {
    this.selected = null;
    this.stopCapture();
    this.keyMessage = '';
  }

  // Spells the player knows: in the book's order, by circle.
  known() {
    const player = this.player;
    return SpellBook.filter((s) => s.flag && player.knowsSpell(s.id))
      .sort((a, b) => a.circle - b.circle || SpellBook.indexOf(a) - SpellBook.indexOf(b));
  }

  render(node) {
    const player = this.player;
    const game = this.game;
    if (game.loadout) {
      const box = el('div', 'sb-loadout', node);
      el('div', 'sb-loadout-title', box, 'CHOOSE YOUR ' + player.slotLimit + ' SPELLS');
      el('div', 'dim', box, 'Every spell is in your book. Drag the ones you want onto the bar and give each slot its key; changes are free until the duel starts.');
      const rival = game.rival;
      if (rival && rival.known) {
        const names = DuelSpells.filter((e) => rival.known.has(e.id)).map((e) => SpellById[playerSpellId(e)].name);
        el('div', 'sb-rival', box, 'THE RIVAL BRINGS :: ' + names.join(', '));
      }
      const buttons = el('div', 'buttons inv-actions', box);
      const button = (text, fn, cls) => {
        const b = el('button', cls || null, buttons, text);
        b.type = 'button';
        b.onclick = fn;
      };
      button('Start the duel', () => game.toggleInventory(false));
      button('Save as my loadout', () => {
        this.keyMessage = game.saveLoadout(player) ? 'SAVED :: YOUR NEXT CLASSIC DUELS START WITH THIS BAR AND THESE KEYS' : 'COULD NOT SAVE IN THIS BROWSER';
        this.screen.render();
      }, 'secondary');
      button('Default loadout', () => {
        game.applyLoadout(player, game.defaultLoadout());
        this.keyMessage = 'DEFAULT LOADOUT :: SAVE IT TO KEEP IT';
        this.screen.render();
      }, 'secondary');
    }

    let heading = 'ACTION BAR  ' + player.bar.slice(0, player.slotLimit).filter(Boolean).length + ' / ' + player.slotLimit;
    if (!game.duelMode && player.slotLimit < BarSlots.length) {
      heading += '  ::  NEXT SLOT AT LEVEL ' + BarSlots[player.slotLimit].level;
    }
    el('div', 'hud-heading', node, heading);
    const bar = el('div', 'sb-bar', node);
    this.missileTile(bar);
    el('div', 'sb-bar-sep', bar);
    BarSlots.forEach((slot, i) => this.slotTile(bar, i));
    const keyRow = el('div', 'sb-key-row', node);
    el('span', 'sb-key-status' + (this.capturing ? ' capturing' : ''), keyRow,
      this.keyMessage || (currentSlotKeys() ? 'DUEL KEYS :: CLICK THE KEY UNDER A SLOT, THEN PRESS ITS NEW KEY' : 'CLICK THE KEY UNDER A SLOT, THEN PRESS ITS NEW KEY'));
    const reset = el('button', 'secondary sb-reset', keyRow, 'Default keys');
    reset.type = 'button';
    reset.onclick = () => {
      this.stopCapture();
      this.resetKeys();
      this.refresh();
    };

    const known = this.known();
    el('div', 'hud-heading', node, 'SPELLBOOK  ' + known.length + ' / ' + (SpellBook.length - 1) + '  ::  DRAG A SPELL ONTO THE BAR');
    const list = el('div', 'sb-list', node);
    // a slot's spell dragged back onto the book comes off the bar
    dropTarget(list, (drag) => {
      if (drag.from >= 0) {
        player.unprepare(drag.from);
        this.selected = { id: drag.id };
        this.refresh();
      }
    });
    if (!known.length) {
      el('div', 'dim sb-empty', list, 'Your spellbook is empty. Read scrolls to learn spells.');
    }
    for (const spell of known) {
      this.entry(list, spell);
    }

    this.details = el('div', 'inv-details sb-details', node);
    this.renderDetails();
    el('div', 'map-line dim inv-help', node,
      'DRAG OR CLICK A SPELL, THEN A SLOT :: DOUBLE CLICK TO PREPARE OR PUT BACK :: ' + actionKeyLabel('spellbook') + ' / ESC TO CLOSE');
  }

  // The key button under a bar tile: click it, then press the new key.
  keyButton(parent, action, enabled) {
    const capturing = this.capturing === action;
    const b = el('button', 'sb-keybind' + (capturing ? ' capturing' : ''), parent, capturing ? '...' : (enabled ? actionKeyLabel(action) : '-'));
    b.type = 'button';
    b.disabled = !enabled;
    b.title = enabled ? 'Click, then press a key or mouse button for ' + this.actionName(action).toLowerCase() : 'No key in this duel';
    b.onclick = (e) => {
      e.stopPropagation();
      if (capturing) {
        this.stopCapture();
        this.keyMessage = '';
        this.refresh();
      } else {
        this.startCapture(action);
      }
    };
    return b;
  }

  actionName(action) {
    if (action === 'missile') {
      return 'MAGIC MISSILE';
    }
    const i = BarSlots.findIndex((s) => s.action === action);
    return i >= 0 ? 'SLOT ' + (i + 1) : actionLabel(action).toUpperCase();
  }

  // Classic duels keep the slots' keys apart from the bindings; outside them
  // a slot's key is its binding, which can take another action's key (that
  // action then gets the old key in exchange).
  slotKeyEditable(action) {
    const duel = currentSlotKeys();
    return action === 'missile' || !duel || action in duel;
  }

  assignKey(action, code) {
    const name = this.actionName(action);
    const duel = currentSlotKeys();
    if (duel && action in duel) {
      const blocker = slotKeyBlocker(code);
      if (blocker) {
        return keyLabel(code) + (blocker === 'fixed' ? ' CANNOT BE CHANGED' : ' STAYS ON ' + blocker.toUpperCase());
      }
      bindSlotKey(action, code);
      return name + ' :: ' + keyLabel(code);
    }
    if (RESERVED.includes(code)) {
      return keyLabel(code) + ' CANNOT BE CHANGED';
    }
    if (duel && Object.values(duel).includes(code)) {
      return keyLabel(code) + ' IS A DUEL SLOT KEY';
    }
    const swapped = bind(action, code);
    let message = name + ' :: ' + keyLabel(code);
    if (swapped) {
      message += ' :: ' + actionLabel(swapped).toUpperCase() + ' MOVED TO ' + keyLabel(bindingOf(swapped));
    }
    return message;
  }

  resetKeys() {
    if (currentSlotKeys()) {
      setSlotKeys(this.game.defaultLoadout().keys);
      resetActions(['missile']);
      this.keyMessage = 'DEFAULT DUEL KEYS';
    } else {
      resetActions(['missile', ...BarSlots.map((s) => s.action)]);
      this.keyMessage = 'DEFAULT SPELL KEYS';
    }
  }

  startCapture(action) {
    this.stopCapture();
    this.capturing = action;
    this.keyMessage = 'PRESS A KEY OR MOUSE BUTTON FOR ' + this.actionName(action) + ' :: ESC CANCELS';
    const assign = (code) => {
      this.stopCapture();
      this.keyMessage = this.assignKey(action, code);
      this.screen.render();
    };
    const cancel = () => {
      this.stopCapture();
      this.keyMessage = '';
      this.screen.render();
    };
    // capture phase on the window, so the game never sees the press
    const onKey = (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.type !== 'keydown' || e.repeat) {
        return;
      }
      if (e.code === 'Escape') {
        cancel();
        return;
      }
      assign(e.code);
    };
    const onMouse = (e) => {
      // a left click elsewhere cancels; other buttons can be spell keys
      if (e.button === 0) {
        if (!e.target.closest || !e.target.closest('.sb-keybind')) {
          cancel();
        }
        return;
      }
      e.preventDefault();
      e.stopImmediatePropagation();
      assign('Mouse' + e.button);
    };
    const onContext = (e) => e.preventDefault();
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keyup', onKey, true);
    window.addEventListener('mousedown', onMouse, true);
    window.addEventListener('contextmenu', onContext, true);
    this.onCapture = () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('keyup', onKey, true);
      window.removeEventListener('mousedown', onMouse, true);
      // the right button's menu comes after the press that bound it
      setTimeout(() => window.removeEventListener('contextmenu', onContext, true), 300);
    };
    this.screen.render();
  }

  stopCapture() {
    if (this.onCapture) {
      this.onCapture();
      this.onCapture = null;
    }
    this.capturing = null;
  }

  isSelected(ref) {
    const s = this.selected;
    return !!s && ((ref.id && s.id === ref.id) || (ref.slot !== undefined && s.slot === ref.slot));
  }

  // Magic missile has its own key and never leaves the bar.
  missileTile(parent) {
    const player = this.player;
    const col = el('div', 'sb-col', parent);
    const tile = el('button', 'sb-slot missile', col);
    tile.type = 'button';
    spellIcon('missile', tile);
    if (player.missileTier > 1) {
      el('span', 'sb-count', tile, 'x' + player.missileTier);
    }
    if (this.isSelected({ id: 'missile' })) {
      tile.classList.add('selected');
    }
    tile.title = 'Magic missile';
    tile.onclick = () => {
      this.selected = { id: 'missile' };
      this.refresh();
    };
    this.keyButton(col, 'missile', true);
  }

  slotTile(parent, i) {
    const player = this.player;
    const action = BarSlots[i].action;
    const open = i < player.slotLimit;
    const id = open ? player.bar[i] : null;
    const col = el('div', 'sb-col', parent);
    const tile = el('button', 'sb-slot', col);
    tile.type = 'button';
    if (!open) {
      tile.classList.add('locked');
      tile.disabled = true;
      el('span', 'sb-lock', tile, this.game.duelMode ? 'X' : 'LV' + BarSlots[i].level);
      tile.title = this.game.duelMode ? 'Closed in this mode' : 'Opens at level ' + BarSlots[i].level;
      // closed slots keep their keys outside classic duels
      this.keyButton(col, action, !this.game.duelMode && this.slotKeyEditable(action));
      return;
    }
    if (!id) {
      tile.classList.add('empty');
      spellIcon(null, tile);
      tile.title = 'Empty :: drag a spell here';
    } else {
      spellIcon(id, tile);
      tile.title = SpellById[id].name.toLowerCase();
      const rank = rankOf(player, id);
      if (rank >= 2) {
        el('span', 'sb-rank-badge', tile, ROMAN[rank]);
      }
      dragSource(tile, id, i);
    }
    if ((id && this.isSelected({ id })) || (!id && this.isSelected({ slot: i }))) {
      tile.classList.add('selected');
    }
    dropTarget(tile, (drag) => this.dropOnSlot(i, drag));
    tile.onclick = () => this.clickSlot(i);
    tile.ondblclick = () => {
      if (id) {
        player.unprepare(i);
        this.selected = { id };
        this.refresh();
      }
    };
    this.keyButton(col, action, this.slotKeyEditable(action));
  }

  // A spell dropped on bar slot `i`, from the book or another slot.
  dropOnSlot(i, drag) {
    const player = this.player;
    if (i >= player.slotLimit || drag.id === 'missile') {
      return;
    }
    if (drag.from >= 0) {
      player.swapSlots(drag.from, i);
    } else {
      this.prepare(drag.id, i);
    }
    this.selected = { id: drag.id };
    this.refresh();
  }

  entry(parent, spell) {
    const player = this.player;
    const row = el('button', 'sb-entry', parent);
    row.type = 'button';
    spellIcon(spell.id, row);
    const text = el('span', 'sb-entry-text', row);
    el('span', 'sb-name', text, spell.name);
    const sub = el('span', 'sb-sub', text);
    schoolTag(sub, spell.id);
    el('span', 'sb-rank', sub, 'RANK ' + ROMAN[rankOf(player, spell.id)]);
    const at = player.bar.indexOf(spell.id);
    const on = at >= 0 && at < player.slotLimit;
    if (on) {
      row.classList.add('prepared');
      el('span', 'sb-where', row, actionKeyLabel(BarSlots[at].action));
    }
    if (this.isSelected({ id: spell.id })) {
      row.classList.add('selected');
    }
    // from the book even when on the bar: dropped on a slot it moves there
    dragSource(row, spell.id, -1);
    row.onclick = () => this.clickSpell(spell.id);
    row.ondblclick = () => {
      if (on) {
        player.unprepare(at);
      } else {
        const slot = player.bar.findIndex((s, i) => !s && i < player.slotLimit);
        if (slot < 0) {
          this.game.hud.toast('THE BAR IS FULL :: PICK A SLOT TO REPLACE', '#ff8a70');
        } else {
          this.prepare(spell.id, slot);
        }
      }
      this.selected = { id: spell.id };
      this.refresh();
    };
  }

  prepare(id, slot) {
    this.player.prepare(id, slot, this.game.loadout);
  }

  clickSlot(i) {
    const player = this.player;
    const sel = this.selected;
    const there = player.bar[i];
    if (sel && sel.id && sel.id !== 'missile' && sel.id !== there) {
      // the selected spell goes here (swapping when it is on the bar too)
      this.prepare(sel.id, i);
      this.selected = { id: sel.id };
    } else if (there) {
      this.selected = { id: there };
    } else {
      this.selected = { slot: i };
    }
    this.refresh();
  }

  clickSpell(id) {
    const sel = this.selected;
    if (sel && sel.slot !== undefined && !this.player.prepared(id)) {
      this.prepare(id, sel.slot);
    }
    this.selected = { id };
    this.refresh();
  }

  // Opens on bar slot `i` (clicked on the HUD's bar): its spell, or the
  // empty slot ready for one; -1 is magic missile.
  selectSlot(i) {
    const id = i < 0 ? 'missile' : this.player.bar[i];
    this.selected = id ? { id } : { slot: i };
  }

  refresh() {
    this.screen.render();
  }

  renderDetails() {
    const box = this.details;
    const player = this.player;
    const sel = this.selected;
    if (!sel || !sel.id) {
      el('div', 'dim', box, sel ? 'Pick a spell from the book (or drag one) to prepare in this slot.' : 'Select a spell to see what it does and put it on the bar.');
      return;
    }
    const spell = SpellById[sel.id];
    const school = DuelRules.schools[DuelRules.schoolOf(spell.id)];
    const head = el('div', 'sb-details-head', box);
    spellIcon(spell.id, head, 'large');
    const title = el('div', 'sb-details-title', head);
    el('div', 'inv-name', title, spell.name).style.color = school ? school.color : '';
    const cd = cooldownFor(player, spell.id);
    el('div', 'dim', title, (school ? school.name + ' :: ' : '') + (spell.circle ? circleName(spell.circle) + ' :: ' : '') +
      'COOLDOWN ' + (cd ? seconds(cd) : 'NONE') + ' :: COST ' + spell.cost);
    el('div', 'inv-text', box, spell.text);
    const ranks = el('div', 'inv-lines', box);
    const rank = rankOf(player, spell.id);
    for (let r = 1; r <= RankRules.max; r++) {
      const line = el('div', 'sb-rank-line' + (r <= rank ? ' reached' : ''), ranks, 'RANK ' + ROMAN[r] + ' :: ' + rankText(spell, r));
      if (r === rank) {
        line.classList.add('current');
      }
    }
    if (spell.id === 'missile') {
      el('div', 'dim', box, 'Always ready on ' + actionKeyLabel('missile') + '; magic missile scrolls add darts.');
      return;
    }
    if (rank < RankRules.max) {
      el('div', 'dim', box, 'Another scroll of it raises its rank.');
    }

    const at = player.bar.indexOf(spell.id);
    const on = at >= 0 && at < player.slotLimit;
    const buttons = el('div', 'buttons inv-actions sb-actions', box);
    el('span', 'sb-actions-label', buttons, on ? 'MOVE TO' : 'PREPARE ON');
    for (let i = 0; i < player.slotLimit; i++) {
      if (i === at) {
        continue;
      }
      const there = player.bar[i];
      const b = el('button', 'secondary', buttons, actionKeyLabel(BarSlots[i].action) + (there ? ' :: ' + SpellById[there].name : ''));
      b.type = 'button';
      b.title = there ? (on ? 'Swap with ' : 'Replaces ') + SpellById[there].name.toLowerCase() : 'Empty slot';
      b.onclick = () => {
        this.prepare(spell.id, i);
        this.refresh();
      };
    }
    if (on) {
      const back = el('button', 'secondary', buttons, 'Back to book');
      back.type = 'button';
      back.onclick = () => {
        player.unprepare(at);
        this.refresh();
      };
    } else if (!this.game.loadout) {
      el('div', 'dim sb-note', box, 'A spell brought onto the bar starts on its cooldown (at least ' + seconds(WizardLevels.prepareFrames).toLowerCase() + '). Moving spells along the bar is free.');
    }
  }
}
