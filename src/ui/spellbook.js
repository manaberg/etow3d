import { SpellBook, SpellById } from '../entities/mage.js';
import { BarSlots, WizardLevels, RankRules, ROMAN, rankOf } from '../entities/spellbar.js';
import { DuelRules } from '../entities/duelRules.js';
import { actionKeyLabel } from '../core/bindings.js';

// The spellbook tab of the inventory screen: the bar's slots at the top, every
// spell the wizard knows below, and the selected spell's details with the
// buttons that put it on the bar. Clicking a spell and then a slot prepares
// it there too. A spell brought onto the bar from the book starts on its
// cooldown (Mage.prepare); moving spells along the bar is free.

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
  }

  get player() {
    return this.game.player;
  }

  reset() {
    this.selected = null;
  }

  // Spells the player knows: in the book's order, by circle.
  known() {
    const player = this.player;
    return SpellBook.filter((s) => s.flag && player.knowsSpell(s.id))
      .sort((a, b) => a.circle - b.circle || SpellBook.indexOf(a) - SpellBook.indexOf(b));
  }

  render(node) {
    const player = this.player;
    let heading = 'SPELL BAR  ' + player.bar.slice(0, player.slotLimit).filter(Boolean).length + ' / ' + player.slotLimit;
    if (player.slotLimit < BarSlots.length) {
      heading += '  ::  NEXT SLOT AT LEVEL ' + BarSlots[player.slotLimit].level;
    }
    el('div', 'hud-heading', node, heading);
    const bar = el('div', 'sb-bar', node);
    BarSlots.forEach((slot, i) => this.slotTile(bar, i));

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
      el('span', 'sb-slot-name', tile, 'LEVEL ' + BarSlots[i].level);
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
    this.player.prepare(id, slot);
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
    } else {
      el('div', 'dim sb-note', box, 'A spell brought onto the bar starts on its cooldown (at least ' + seconds(WizardLevels.prepareFrames).toLowerCase() + '). Moving spells along the bar is free.');
    }
  }
}
