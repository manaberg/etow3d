import './style.css';
import { Game } from './game.js';
import { resolveDifficulty } from './entities/duelWizard.js';
import { loadModels } from './render/models.js';
import { Actions, actionKeyLabel, onBindingsChange } from './core/bindings.js';
import { openControls } from './ui/controls.js';
import { BattleRules } from './entities/battle.js';

// Same URLs as the 2D game: /?mode=duel&ai=hard starts a duel, ?mode=survival
// the descent, ?mode=battle&ai=hard a battle. Without a mode the main menu is shown.
function resolveMode() {
  const search = (window.location.search || '').toLowerCase();
  const hash = (window.location.hash || '').toLowerCase();
  if (search.includes('mode=battle')) {
    return 'battle';
  }
  if (search.includes('mode=duel') || search.includes('duel=1') || hash.includes('duel')) {
    return 'duel';
  }
  if (search.includes('mode=survival')) {
    return 'survival';
  }
  return null;
}

function supportsWebGL() {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

const menu = document.getElementById('menu');
const container = document.getElementById('viewport');
const hudRoot = document.getElementById('hud');
let game = null;
const modelsReady = loadModels();

// Duel options: progressive rules (one spell, loot the rest) unless
// ?rules=classic, fought in the rooms dungeon unless ?map=arena. Battle
// armies are BattleRules.army a side unless ?army=N.
const armyParam = (window.location.search.match(/[?&]army=(\d+)/i) || [])[1];
const duelOptions = {
  rules: /[?&]rules=classic/i.test(window.location.search) ? 'classic' : 'progressive',
  map: /[?&]map=arena/i.test(window.location.search) ? 'arena' : 'rooms',
  army: armyParam || String(BattleRules.army)
};
function showDuelOptions() {
  for (const key of Object.keys(duelOptions)) {
    for (const b of document.querySelectorAll('[data-' + key + ']')) {
      const on = b.dataset[key] === duelOptions[key];
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }
}
for (const key of Object.keys(duelOptions)) {
  for (const b of document.querySelectorAll('[data-' + key + ']')) {
    b.addEventListener('click', () => {
      duelOptions[key] = b.dataset[key];
      showDuelOptions();
    });
  }
}
showDuelOptions();

function start(mode, difficulty) {
  menu.classList.add('hidden');
  if (game) {
    game.dispose();
  }
  game = new Game({
    container,
    hudRoot,
    mode,
    difficulty,
    rules: duelOptions.rules,
    map: duelOptions.map,
    onExit(action) {
      if (action === 'restart') {
        start(mode, difficulty);
      } else {
        game.dispose();
        game = null;
        history.replaceState(null, '', window.location.pathname);
        menu.classList.remove('hidden');
      }
    }
  });
  window.__etow3d = game;
}

// The menu's key list follows the current bindings.
const menuControls = document.getElementById('menu-controls');
function renderMenuControls() {
  menuControls.textContent = '';
  const row = (keys, text) => {
    const div = document.createElement('div');
    for (const k of keys) {
      const kbd = document.createElement('kbd');
      kbd.textContent = k;
      div.appendChild(kbd);
    }
    div.appendChild(document.createTextNode(' ' + text));
    menuControls.appendChild(div);
  };
  row(['up', 'left', 'down', 'right'].map(actionKeyLabel), 'move');
  // the spell bar's ten slots share one line
  const slots = Actions.filter((a) => /^slot\d+$/.test(a.id));
  for (const action of Actions) {
    if (action === slots[0]) {
      row(slots.map((a) => actionKeyLabel(a.id)), 'the spells on your bar (more slots open as you level)');
    } else if (action.group !== 'Movement' && !slots.includes(action)) {
      row([actionKeyLabel(action.id)], action.label.toLowerCase());
    }
  }
  row(['Wheel'], 'zoom');
  row(['Esc'], 'pause');
}
renderMenuControls();
onBindingsChange(renderMenuControls);
document.getElementById('open-controls').addEventListener('click', () => openControls());

for (const button of menu.querySelectorAll('[data-mode]')) {
  button.addEventListener('click', () => {
    const mode = button.dataset.mode;
    const ai = button.dataset.ai;
    let query = '?mode=survival';
    if (mode === 'duel') {
      query = '?mode=duel&ai=' + ai + (duelOptions.rules === 'classic' ? '&rules=classic' : '') +
        (duelOptions.map === 'arena' ? '&map=arena' : '');
    } else if (mode === 'battle') {
      query = '?mode=battle&ai=' + ai + '&army=' + duelOptions.army;
    }
    history.replaceState(null, '', window.location.pathname + query);
    modelsReady.then(() => start(mode, ai));
  });
}

if (!supportsWebGL()) {
  document.getElementById('nogl').classList.remove('hidden');
} else {
  const mode = resolveMode();
  if (mode) {
    modelsReady.then(() => start(mode, resolveDifficulty()));
  }
}
