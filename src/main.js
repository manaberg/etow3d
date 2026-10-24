import './style.css';
import { Game } from './game.js';
import { loadModels } from './render/models.js';
import { Actions, actionKeyLabel, onBindingsChange } from './core/bindings.js';
import { openControls } from './ui/controls.js';
import { BattleRules } from './entities/battle.js';

// The game is one descent: /?mode=survival starts it (as in the 2D game), and
// without it the main menu is shown.
function startsAtOnce() {
  return /[?&]mode=survival/i.test(window.location.search || '');
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

// The armies of the battle trials: BattleRules.army a side unless ?army=N
// (the battle reads it from the URL).
let army = (window.location.search.match(/[?&]army=(\d+)/i) || [])[1] || String(BattleRules.army);
function showArmy() {
  for (const b of document.querySelectorAll('[data-army]')) {
    const on = b.dataset.army === army;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  }
}
for (const b of document.querySelectorAll('[data-army]')) {
  b.addEventListener('click', () => {
    army = b.dataset.army;
    showArmy();
  });
}
showArmy();

function start() {
  menu.classList.add('hidden');
  if (game) {
    game.dispose();
  }
  game = new Game({
    container,
    hudRoot,
    onExit(action) {
      if (action === 'restart') {
        start();
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

document.getElementById('descend').addEventListener('click', () => {
  history.replaceState(null, '', window.location.pathname + '?mode=survival&army=' + army);
  modelsReady.then(() => start());
});

if (!supportsWebGL()) {
  document.getElementById('nogl').classList.remove('hidden');
} else if (startsAtOnce()) {
  modelsReady.then(() => start());
}
