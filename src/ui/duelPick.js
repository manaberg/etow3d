import { SpellById } from '../entities/mage.js';
import { DuelSpells, playerSpellId } from '../entities/duelLoot.js';
import { DuelRules } from '../entities/duelRules.js';
import { DuelLevels } from '../world/levels.js';
import { isTouch } from '../core/device.js';
import { spellIcon } from './spellIcons.js';
import { circleName, cooldownFor, costLabel, schoolTag, seconds } from './spellbook.js';

// The duels' spell choice (Game.offerDuelPick): before each level's fight
// the player chooses one more spell from the duel spell book, keeping the
// ones chosen before. Every spell not yet chosen is listed, by school; a tap
// or click shows what it does, and Fight takes it (with a mouse, a double
// click does too; not with a finger, where a stray tap must not commit).

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

// The spells to choose from: the duel spell book's, by school (as
// DuelRules.schools lists them), then by name.
function choices(chosen) {
  const schools = Object.keys(DuelRules.schools);
  const rank = (id) => {
    const i = schools.indexOf(DuelRules.schoolOf(id));
    return i < 0 ? schools.length : i;
  };
  return DuelSpells.map(playerSpellId)
    .filter((id) => SpellById[id] && !chosen.includes(id))
    .sort((a, b) => rank(a) - rank(b) || SpellById[a].name.localeCompare(SpellById[b].name));
}

// What a spell does, for `player` (its cooldown and cost as it would cast it).
function details(box, player, id) {
  box.innerHTML = '';
  const spell = SpellById[id];
  const school = DuelRules.schools[DuelRules.schoolOf(id)];
  const head = el('div', 'sb-details-head', box);
  spellIcon(id, head, 'large');
  const title = el('div', 'sb-details-title', head);
  el('div', 'inv-name', title, spell.name).style.color = school ? school.color : '';
  const cd = cooldownFor(player, id);
  el('div', 'dim', title, (school ? school.name + ' :: ' : '') + (spell.circle ? circleName(spell.circle) + ' :: ' : '') +
    'COOLDOWN ' + (cd ? seconds(cd) : 'NONE') + ' :: ' + costLabel(player, id));
  el('div', 'inv-text', box, spell.text);
  if (spell.lore) {
    el('div', 'sb-lore', box, spell.lore);
  }
}

export function showDuelPick(screen, { player, level, chosen, onPick, onQuit }) {
  screen.innerHTML = '';
  screen.classList.remove('hidden');
  const card = el('div', 'card duel-pick', screen);
  el('h2', null, card, 'DUEL ' + level + ' OF ' + DuelLevels.count);
  el('p', null, card, level === 1
    ? 'Choose your spell. Your rival brings one of its own, drawn at random. Both of you have magic missile too.'
    : 'Choose one more spell. Your rival brings ' + level + ' of its own, drawn at random.');
  if (chosen.length) {
    const have = el('div', 'duel-pick-have', card);
    el('span', 'dim', have, 'YOUR SPELLS');
    for (const id of chosen) {
      const tag = el('span', 'duel-pick-mine', have);
      spellIcon(id, tag);
      el('span', null, tag, SpellById[id].name);
    }
  }
  const list = el('div', 'sb-list duel-pick-list', card);
  const box = el('div', 'inv-details sb-details duel-pick-details', card);
  el('div', 'dim', box, (isTouch() ? 'Tap' : 'Click') + ' a spell to see what it does.');
  const buttons = el('div', 'buttons', card);
  const fight = el('button', null, buttons, 'Fight');
  fight.type = 'button';
  fight.disabled = true;
  const quit = el('button', 'secondary', buttons, 'Main menu');
  quit.type = 'button';
  quit.onclick = () => onQuit();

  let selected = null;
  const rows = [];
  for (const id of choices(chosen)) {
    const row = el('button', 'sb-entry', list);
    row.type = 'button';
    row.dataset.spell = id;
    spellIcon(id, row);
    const text = el('span', 'sb-entry-text', row);
    el('span', 'sb-name', text, SpellById[id].name);
    schoolTag(el('span', 'sb-sub', text), id);
    row.onclick = () => {
      selected = id;
      for (const r of rows) {
        r.classList.toggle('selected', r === row);
      }
      details(box, player, id);
      fight.disabled = false;
      fight.textContent = 'Fight with ' + SpellById[id].name.toLowerCase();
      // a phone shows the list and the details one above the other
      if (isTouch()) {
        box.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    };
    row.ondblclick = () => {
      if (!isTouch()) {
        onPick(id);
      }
    };
    rows.push(row);
  }
  fight.onclick = () => {
    if (selected) {
      onPick(selected);
    }
  };
}
