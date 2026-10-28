import './style.css';
import { Game } from './game.js';
import { loadModels } from './render/models.js';
import { Actions, actionKeyLabel, onBindingsChange } from './core/bindings.js';
import { openControls } from './ui/controls.js';
import { isTouch, onTouchModeChange } from './core/device.js';
import { SAVE_VERSION, deleteSave, latestSave, listSaves, onSavesChange, readSave } from './core/saves.js';

// The game is one descent: /?mode=survival starts a new one (as in the 2D
// game), /?mode=mobile a new mobile descent (tunnels and duels, made for
// touch screens), and without either the main menu is shown: continue the
// latest save, start a new game or load a save (core/saves.js).
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

// A new run in `mode` ('survival' or 'mobile'), or the run of a `save`.
function start({ mode, save = null }) {
  menu.classList.add('hidden');
  if (game) {
    game.dispose();
  }
  game = new Game({
    container,
    hudRoot,
    mobile: mode === 'mobile',
    save,
    onExit(action) {
      if (action === 'restart') {
        // a new run of the same descent
        start({ mode: game.mobile ? 'mobile' : 'survival' });
      } else {
        game.dispose();
        game = null;
        history.replaceState(null, '', window.location.pathname);
        showMenu('main');
      }
    }
  });
  window.__etow3d = game;
}

// A hidden or closed page keeps the run where it was (Game.saveRun).
function autosave() {
  if (game) {
    game.saveRun(true);
  }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    autosave();
  }
});
window.addEventListener('pagehide', autosave);

// ------------------------------------------------------------ the main menu

// Its views: the main buttons, the new game's two descents, and the saves.
const menuMain = document.getElementById('menu-main');
const newPanel = document.getElementById('menu-new-panel');
const loadPanel = document.getElementById('menu-load-panel');
function showMenu(view) {
  menu.classList.remove('hidden');
  menuMain.classList.toggle('hidden', view !== 'main');
  newPanel.classList.toggle('hidden', view !== 'new');
  loadPanel.classList.toggle('hidden', view !== 'load');
  if (view === 'load') {
    renderSaves();
  }
  renderContinue();
  menu.scrollTop = 0;
}

function saveTitle(save) {
  return (save.kind === 'dungeon' ? 'DEPTH ' : 'BELOW DEPTH ') + save.depth + ' :: ' + save.name;
}

function playTime(seconds) {
  const t = Math.max(0, Math.round(seconds || 0));
  const h = Math.floor(t / 3600);
  const m = Math.floor(t / 60) % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return (h ? h + ':' + pad(m) : m) + ':' + pad(t % 60);
}

function savedWhen(ms) {
  return new Date(ms).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

// Starts the run a save holds; false when it cannot be read.
function loadSave(id) {
  const save = readSave(id);
  if (!save) {
    return false;
  }
  history.replaceState(null, '', window.location.pathname);
  modelsReady.then(() => start({ save }));
  return true;
}

// Continue loads the newest save, shown on the button; with one to
// continue, a new game is no longer the first choice.
const continueButton = document.getElementById('menu-continue');
const continueInfo = document.getElementById('menu-continue-info');
const newButton = document.getElementById('menu-new');
function renderContinue() {
  const latest = latestSave();
  continueButton.classList.toggle('hidden', !latest);
  newButton.classList.toggle('secondary', !!latest);
  if (latest) {
    continueInfo.textContent = saveTitle(latest) + ' :: LEVEL ' + latest.level;
  }
}
continueButton.addEventListener('click', () => {
  const latest = latestSave();
  if (!latest || !loadSave(latest.id)) {
    showMenu('load');
    renderSaves('That save could not be read. Delete it, or load another.');
  }
});
newButton.addEventListener('click', () => showMenu('new'));
document.getElementById('menu-load').addEventListener('click', () => showMenu('load'));
for (const back of document.querySelectorAll('.menu-back')) {
  back.addEventListener('click', () => showMenu('main'));
}
// Escape steps back out of a panel (the controls screen takes its own keys)
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !game && menuMain.classList.contains('hidden') && !document.querySelector('.controls-screen')) {
    showMenu('main');
  }
});

// The saves, newest first: each loads, or is deleted with a second press.
const saveList = document.getElementById('save-list');
function renderSaves(status) {
  saveList.textContent = '';
  if (status) {
    el('p', 'save-status', saveList, status);
  }
  const saves = listSaves();
  if (!saves.length) {
    el('p', 'dim save-empty', saveList, 'No saved games yet.');
    return;
  }
  for (const save of saves) {
    const row = el('div', 'save-row', saveList);
    const info = el('div', 'save-info', row);
    const title = el('div', 'save-title', info);
    if (save.auto) {
      el('span', 'save-tag', title, 'AUTOSAVE');
    }
    title.append(saveTitle(save));
    const loadable = save.version === SAVE_VERSION;
    const meta = loadable
      ? ['LEVEL ' + save.level, save.mobile ? 'MOBILE DESCENT' : 'THE DESCENT', playTime(save.timePlayed) + ' PLAYED', savedWhen(save.savedAt)]
      : ['MADE BY AN OLDER VERSION OF THE GAME', savedWhen(save.savedAt)];
    el('div', 'save-meta', info, meta.join(' :: '));
    const actions = el('div', 'save-actions', row);
    const load = el('button', null, actions, 'Load');
    load.type = 'button';
    load.disabled = !loadable;
    load.addEventListener('click', () => {
      if (!loadSave(save.id)) {
        renderSaves('That save could not be read. Delete it, or load another.');
      }
    });
    const remove = el('button', 'secondary', actions, 'Delete');
    remove.type = 'button';
    let armed = null;
    remove.addEventListener('click', () => {
      if (armed) {
        clearTimeout(armed);
        deleteSave(save.id);
        return;
      }
      remove.textContent = 'Sure?';
      remove.classList.replace('secondary', 'danger');
      armed = setTimeout(() => {
        armed = null;
        remove.textContent = 'Delete';
        remove.classList.replace('danger', 'secondary');
      }, 3000);
    });
  }
}
onSavesChange(() => {
  if (!loadPanel.classList.contains('hidden')) {
    renderSaves();
  }
  renderContinue();
});
renderContinue();

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

// a new run; the page's address stays the menu's, so reloading it offers to
// continue rather than starting another
for (const [button, mode] of [[descendButton, 'survival'], [mobileButton, 'mobile']]) {
  button.addEventListener('click', () => modelsReady.then(() => start({ mode })));
}

if (!supportsWebGL()) {
  document.getElementById('nogl').classList.remove('hidden');
} else if (modeInUrl()) {
  modelsReady.then(() => start({ mode: modeInUrl() }));
}
