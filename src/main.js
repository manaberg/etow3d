import './style.css';
import { Game } from './game.js';
import { loadModels } from './render/models.js';
import { Actions, actionKeyLabel, onBindingsChange } from './core/bindings.js';
import { openControls } from './ui/controls.js';
import { isTouch, onTouchModeChange } from './core/device.js';

// The game is one descent: /?mode=survival starts it (as in the 2D game),
// /?mode=mobile the mobile descent (tunnels and duels, made for touch
// screens), and without either the main menu is shown.
function modeInUrl() {
  const m = /[?&]mode=(survival|mobile)/i.exec(window.location.search || '');
  return m ? m[1].toLowerCase() : null;
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

function start(mode) {
  menu.classList.add('hidden');
  if (game) {
    game.dispose();
  }
  game = new Game({
    container,
    hudRoot,
    mobile: mode === 'mobile',
    onExit(action) {
      if (action === 'restart') {
        start(mode);
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

// The menu's key list follows the current bindings, or tells how the
// touch controls work (ui/touch.js).
const menuControls = document.getElementById('menu-controls');
const TOUCH_GUIDE = [
  ['Move', 'put a thumb down anywhere on the left half and drag'],
  ['Missile', 'hold the big button at the bottom right: the darts fly at the foe in the ring'],
  ['Spells', 'tap one around it to cast at the ringed foe, or drag off it to aim by hand and let go'],
  ['Cancel', 'drag an aimed spell onto the cross and let go'],
  ['Camera', 'it looks at the ringed foe, else swings round behind you as you walk; drag elsewhere to turn it yourself, pinch to zoom'],
  ['Loot', 'tap an item\'s name on the floor; scrolls and potions are picked up by walking over them'],
  ['Map', 'tap the map to enlarge it; the buttons at the top open the spellbook, the bag and the pause screen'],
  ['Battles', 'COMMAND to lead the army: tap your soldiers, then tap ground to march or a foe to attack'],
  ['iPhone', 'Share, then Add to Home Screen, to play full screen']
];
function renderMenuControls() {
  menuControls.textContent = '';
  menuControls.classList.toggle('touch-guide', isTouch());
  if (isTouch()) {
    for (const [what, how] of TOUCH_GUIDE) {
      const div = document.createElement('div');
      const kbd = document.createElement('kbd');
      kbd.textContent = what;
      div.append(kbd, ' ' + how);
      menuControls.appendChild(div);
    }
    return;
  }
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
onTouchModeChange(renderMenuControls);

// On a touch screen the mobile descent is the one offered first.
const descendButton = document.getElementById('descend');
const mobileButton = document.getElementById('descend-mobile');
function renderModeButtons() {
  descendButton.classList.toggle('secondary', isTouch());
  mobileButton.classList.toggle('secondary', !isTouch());
}
renderModeButtons();
onTouchModeChange(renderModeButtons);
document.getElementById('open-controls').addEventListener('click', () => openControls());

for (const [button, mode] of [[descendButton, 'survival'], [mobileButton, 'mobile']]) {
  button.addEventListener('click', () => {
    history.replaceState(null, '', window.location.pathname + '?mode=' + mode);
    modelsReady.then(() => start(mode));
  });
}

if (!supportsWebGL()) {
  document.getElementById('nogl').classList.remove('hidden');
} else if (modeInUrl()) {
  modelsReady.then(() => start(modeInUrl()));
}
