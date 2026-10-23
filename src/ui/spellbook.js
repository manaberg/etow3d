import { SpellBook, SpellById } from '../entities/mage.js';
import { BarSlots, WizardLevels, RankRules, ROMAN, rankOf } from '../entities/spellbar.js';
import { DuelRules } from '../entities/duelRules.js';
import { DuelSpells, playerSpellId } from '../entities/duelLoot.js';
import { actionKeyLabel, bindSlotKey, keyLabel, slotKeyBlocker } from '../core/bindings.js';

// The spellbook tab of the inventory screen: the bar's slots at the top, every
// spell the wizard knows below, and the selected spell's details with the
// buttons that put it on the bar. Clicking a spell and then a slot prepares
// it there too. A spell brought onto the bar from the book starts on its
// cooldown (Mage.prepare); moving spells along the bar is free, and so is
// everything while a classic duel's loadout is being chosen. There each slot
// also takes a key of its own (the duel keys), and the bar and its keys can
// be saved as the player's loadout for the next classic duels.

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

function seconds(frames) {
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

export class SpellbookPanel {
  constructor(screen, game) {
    this.screen = screen;
    this.game = game;
    // { id } for a spell, or { slot } for an empty slot
    this.selected = null;
    // the bar slot whose duel key is being chosen, and what came of the last
    this.capturing = -1;
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
      el('div', 'dim', box, 'Every spell is in your book. Put the ones you want on the bar; changes are free until the duel starts.');
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

    let heading = 'SPELL BAR  ' + player.bar.slice(0, player.slotLimit).filter(Boolean).length + ' / ' + player.slotLimit;
    if (!game.duelMode && player.slotLimit < BarSlots.length) {
      heading += '  ::  NEXT SLOT AT LEVEL ' + BarSlots[player.slotLimit].level;
    }
    el('div', 'hud-heading', node, heading);
    const bar = el('div', 'sb-bar', node);
    BarSlots.forEach((slot, i) => this.slotTile(bar, i));
    if (game.loadout) {
      this.renderDuelKeys(node);
    }

    const known = this.known();
    el('div', 'hud-heading', node, 'SPELLBOOK  ' + known.length + ' / ' + (SpellBook.length - 1) + '  ::  MAGIC MISSILE x' + player.missileTier + ' ON ' + actionKeyLabel('missile'));
    const list = el('div', 'sb-list', node);
    if (!known.length) {
      el('div', 'dim', list, 'Your spellbook is empty. Read scrolls to learn spells.');
    }
    for (const spell of known) {
      this.entry(list, spell);
    }

    this.details = el('div', 'inv-details sb-details', node);
    this.renderDetails();
    el('div', 'map-line dim inv-help', node,
      'CLICK A SPELL, THEN A SLOT :: DOUBLE CLICK TO PREPARE OR PUT BACK :: ' + actionKeyLabel('spellbook') + ' / ESC TO CLOSE');
  }

  // Classic duels: a key for each slot of the bar, chosen by clicking the
  // slot's button and pressing a key or mouse button (Escape cancels).
  renderDuelKeys(node) {
    const player = this.player;
    el('div', 'hud-heading', node, 'DUEL KEYS  ::  CLICK A SLOT, THEN PRESS ITS KEY');
    const grid = el('div', 'sb-keys', node);
    for (let i = 0; i < player.slotLimit; i++) {
      const b = el('button', 'secondary sb-keybind' + (this.capturing === i ? ' capturing' : ''), grid);
      b.type = 'button';
      el('span', 'sb-key', b, this.capturing === i ? '...' : actionKeyLabel(BarSlots[i].action));
      el('span', 'sb-keybind-name', b, player.bar[i] ? SpellById[player.bar[i]].name : 'EMPTY');
      b.onclick = (e) => {
        e.stopPropagation();
        this.startCapture(i);
      };
    }
    if (this.keyMessage) {
      el('div', 'sb-key-status', node, this.keyMessage);
    }
  }

  startCapture(i) {
    this.stopCapture();
    this.capturing = i;
    this.keyMessage = 'PRESS A KEY FOR SLOT ' + (i + 1) + ' :: ESC CANCELS';
    const assign = (code) => {
      const action = BarSlots[i].action;
      const blocker = slotKeyBlocker(code);
      this.stopCapture();
      if (blocker) {
        this.keyMessage = keyLabel(code) + (blocker === 'fixed' ? ' CANNOT BE CHANGED' : ' STAYS ON ' + blocker.toUpperCase());
      } else {
        bindSlotKey(action, code);
        this.keyMessage = 'SLOT ' + (i + 1) + ' :: ' + keyLabel(code);
      }
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
        this.stopCapture();
        this.keyMessage = '';
        this.screen.render();
        return;
      }
      assign(e.code);
    };
    const onMouse = (e) => {
      // a left click elsewhere cancels; other buttons can be slot keys
      if (e.button === 0) {
        this.stopCapture();
        this.keyMessage = '';
        this.screen.render();
        return;
      }
      e.preventDefault();
      e.stopImmediatePropagation();
      assign('Mouse' + e.button);
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keyup', onKey, true);
    window.addEventListener('mousedown', onMouse, true);
    this.onCapture = () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('keyup', onKey, true);
      window.removeEventListener('mousedown', onMouse, true);
    };
    this.screen.render();
  }

  stopCapture() {
    if (this.onCapture) {
      this.onCapture();
      this.onCapture = null;
    }
    this.capturing = -1;
  }

  isSelected(ref) {
    const s = this.selected;
    return !!s && ((ref.id && s.id === ref.id) || (ref.slot !== undefined && s.slot === ref.slot));
  }

  slotTile(parent, i) {
    const player = this.player;
    const open = i < player.slotLimit;
    const id = open ? player.bar[i] : null;
    const tile = el('button', 'sb-slot', parent);
    tile.type = 'button';
    el('span', 'sb-key', tile, actionKeyLabel(BarSlots[i].action));
    if (!open) {
      tile.classList.add('locked');
      tile.disabled = true;
      el('span', 'sb-slot-name', tile, this.game.duelMode ? 'CLOSED' : 'LEVEL ' + BarSlots[i].level);
      return;
    }
    if (!id) {
      tile.classList.add('empty');
      el('span', 'sb-slot-name', tile, 'EMPTY');
    } else {
      const spell = SpellById[id];
      schoolTag(tile, id);
      el('span', 'sb-slot-name', tile, spell.name);
      const rank = rankOf(player, id);
      if (rank >= 2) {
        el('span', 'spell-tier', tile, ROMAN[rank]);
      }
    }
    if ((id && this.isSelected({ id })) || (!id && this.isSelected({ slot: i }))) {
      tile.classList.add('selected');
    }
    tile.onclick = () => this.clickSlot(i);
    tile.ondblclick = () => {
      if (id) {
        player.unprepare(i);
        this.selected = { id };
        this.refresh();
      }
    };
  }

  entry(parent, spell) {
    const player = this.player;
    const row = el('button', 'sb-entry', parent);
    row.type = 'button';
    schoolTag(row, spell.id);
    el('span', 'sb-name', row, spell.name);
    const rank = rankOf(player, spell.id);
    el('span', 'sb-rank', row, ROMAN[rank]);
    const at = player.bar.indexOf(spell.id);
    const on = at >= 0 && at < player.slotLimit;
    el('span', 'sb-where' + (on ? ' on' : ''), row, on ? 'ON ' + actionKeyLabel(BarSlots[at].action) : 'IN BOOK');
    if (on) {
      row.classList.add('prepared');
    }
    if (this.isSelected({ id: spell.id })) {
      row.classList.add('selected');
    }
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
    if (sel && sel.id && sel.id !== there) {
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

  refresh() {
    this.screen.render();
  }

  renderDetails() {
    const box = this.details;
    const player = this.player;
    const sel = this.selected;
    if (!sel || !sel.id) {
      el('div', 'dim', box, sel ? 'Pick a spell from the book to prepare in this slot.' : 'Select a spell to see what it does and put it on the bar.');
      return;
    }
    const spell = SpellById[sel.id];
    const school = DuelRules.schools[DuelRules.schoolOf(spell.id)];
    el('div', 'inv-name', box, spell.name).style.color = school ? school.color : '';
    el('div', 'dim', box, (school ? school.name + ' :: ' : '') + 'CIRCLE ' + ROMAN[spell.circle] +
      ' :: COOLDOWN ' + (spell.cd ? seconds(player.cooldownOf(spell.cd)) : 'NONE') + ' :: COST ' + spell.cost);
    el('div', 'inv-text', box, spell.text);
    const ranks = el('div', 'inv-lines', box);
    const rank = rankOf(player, spell.id);
    for (let r = 1; r <= RankRules.max; r++) {
      const line = el('div', 'sb-rank-line' + (r <= rank ? ' reached' : ''), ranks, 'RANK ' + ROMAN[r] + ' :: ' + rankText(spell, r));
      if (r === rank) {
        line.classList.add('current');
      }
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
