import './style.css';
import { Game } from './game.js';
import { resolveDifficulty } from './entities/duelWizard.js';
import { loadModels } from './render/models.js';
import { Actions, actionKeyLabel, onBindingsChange } from './core/bindings.js';
import { openControls } from './ui/controls.js';

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

// Duel rules: progressive (one spell, loot the rest) unless ?rules=classic.
let duelRules = /[?&]rules=classic/i.test(window.location.search) ? 'classic' : 'progressive';
function showDuelRules() {
  for (const b of document.querySelectorAll('[data-rules]')) {
    b.classList.toggle('active', b.dataset.rules === duelRules);
    b.setAttribute('aria-pressed', b.dataset.rules === duelRules ? 'true' : 'false');
  }
}
for (const b of document.querySelectorAll('[data-rules]')) {
  b.addEventListener('click', () => {
    duelRules = b.dataset.rules;
    showDuelRules();
  });
}
showDuelRules();

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
    rules: duelRules,
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
  for (const action of Actions) {
    if (action.group !== 'Movement') {
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
      query = '?mode=duel&ai=' + ai + (duelRules === 'classic' ? '&rules=classic' : '');
    } else if (mode === 'battle') {
      query = '?mode=battle&ai=' + ai;
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
