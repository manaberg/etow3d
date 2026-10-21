// Key and mouse bindings, rebindable from the controls screen and kept in this
// browser's localStorage. A binding is a KeyboardEvent.code ('KeyQ', 'Digit1',
// 'Space') or a mouse button ('Mouse0' left, 'Mouse1' middle, 'Mouse2' right),
// so any action can sit on any key or button. Escape always pauses and the
// arrow keys always move; neither can be rebound.

// Every action in the order the controls screen lists them. The defaults are
// the 2D game's keys.
export const Actions = [
  { id: 'up', label: 'Move up', group: 'Movement', key: 'KeyW' },
  { id: 'left', label: 'Move left', group: 'Movement', key: 'KeyA' },
  { id: 'down', label: 'Move down', group: 'Movement', key: 'KeyS' },
  { id: 'right', label: 'Move right', group: 'Movement', key: 'KeyD' },
  { id: 'missile', label: 'Magic missile (hold)', group: 'Spells', key: 'Mouse0' },
  { id: 'blink', label: 'Blink to cursor', group: 'Spells', key: 'Mouse2' },
  { id: 'fireball', label: 'Fireball', group: 'Spells', key: 'KeyQ' },
  { id: 'ironshot', label: 'Iron shot', group: 'Spells', key: 'KeyE' },
  { id: 'lightning', label: 'Chain lightning', group: 'Spells', key: 'KeyF' },
  { id: 'timestop', label: 'Time stop', group: 'Spells', key: 'KeyR' },
  { id: 'haste', label: 'Haste', group: 'Spells', key: 'Digit1' },
  { id: 'image', label: 'Mirror image', group: 'Spells', key: 'Digit2' },
  { id: 'stun', label: 'Chain root', group: 'Spells', key: 'Digit3' },
  { id: 'shield', label: 'Shield', group: 'Spells', key: 'Digit4' },
  { id: 'blizzard', label: 'Blizzard', group: 'Spells', key: 'Digit5' },
  { id: 'ray', label: 'Lifesteal (hold)', group: 'Spells', key: 'KeyG' },
  { id: 'invis', label: 'Invisibility', group: 'Spells', key: 'KeyT' },
  { id: 'fear', label: 'Fear', group: 'Spells', key: 'KeyC' },
  { id: 'pwkill', label: 'Power word kill', group: 'Spells', key: 'KeyX' },
  { id: 'telekinesis', label: 'Telekinesis', group: 'Spells', key: 'KeyV' },
  { id: 'scorch', label: 'Scorching ray', group: 'Spells', key: 'KeyH' },
  { id: 'cone', label: 'Cone of cold', group: 'Spells', key: 'KeyZ' },
  { id: 'thunder', label: 'Thunderwave', group: 'Spells', key: 'KeyB' },
  { id: 'meteor', label: 'Meteor swarm', group: 'Spells', key: 'Digit6' },
  { id: 'guardians', label: 'Spirit guardians', group: 'Spells', key: 'Digit7' },
  { id: 'cloud', label: 'Cloudkill', group: 'Spells', key: 'Digit8' },
  { id: 'heal', label: 'Healing word', group: 'Spells', key: 'KeyY' },
  { id: 'polymorph', label: 'Polymorph', group: 'Spells', key: 'KeyU' },
  { id: 'disintegrate', label: 'Disintegrate', group: 'Spells', key: 'Digit9' },
  { id: 'weapon', label: 'Spiritual weapon', group: 'Spells', key: 'Digit0' },
  { id: 'descend', label: 'Descend the stairs', group: 'Game', key: 'Space' },
  { id: 'map', label: 'Larger map', group: 'Game', key: 'KeyM' },
  { id: 'pause', label: 'Pause', group: 'Game', key: 'KeyP' }
];

const FIXED = {
  Escape: 'pause',
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right'
};

export const RESERVED = ['Escape'];

const STORAGE_KEY = 'etow3d.bindings';

let bindings = load();
let byCode = index();
let version = 0;
const listeners = new Set();

function defaults() {
  const out = {};
  for (const a of Actions) {
    out[a.id] = a.key;
  }
  return out;
}

// Saved bindings over the defaults; storage may be missing or blocked.
function load() {
  const out = defaults();
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    for (const id in saved) {
      if (id in out && typeof saved[id] === 'string' && !RESERVED.includes(saved[id])) {
        out[id] = saved[id];
      }
    }
  } catch {
    // keep the defaults
  }
  return out;
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bindings));
  } catch {
    // not saved: the bindings still hold for this session
  }
}

function index() {
  const map = { ...FIXED };
  for (const id in bindings) {
    map[bindings[id]] = id;
  }
  return map;
}

function changed() {
  byCode = index();
  version++;
  save();
  for (const fn of listeners) {
    fn();
  }
}

// The action a key code or mouse button triggers, if any.
export function actionFor(code) {
  return byCode[code];
}

export function bindingOf(action) {
  return bindings[action];
}

// Binds `code` to `action`. An action already on that code takes the old
// binding of `action` in exchange, so nothing is left unbound. Returns the
// action that was swapped, or null.
export function bind(action, code) {
  if (RESERVED.includes(code) || !(action in bindings)) {
    return null;
  }
  const previous = bindings[action];
  let swapped = null;
  for (const id in bindings) {
    if (id !== action && bindings[id] === code) {
      bindings[id] = previous;
      swapped = id;
    }
  }
  bindings[action] = code;
  changed();
  return swapped;
}

export function resetBindings() {
  bindings = defaults();
  changed();
}

// Bumped on every change, so views can refresh their key labels cheaply.
export function bindingsVersion() {
  return version;
}

export function onBindingsChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

const NAMES = {
  Mouse0: 'LMB', Mouse1: 'MMB', Mouse2: 'RMB', Mouse3: 'MB4', Mouse4: 'MB5',
  Space: 'Space', Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']',
  Backslash: '\\', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/',
  ShiftLeft: 'L-Shift', ShiftRight: 'R-Shift', ControlLeft: 'L-Ctrl', ControlRight: 'R-Ctrl',
  AltLeft: 'L-Alt', AltRight: 'R-Alt', MetaLeft: 'L-Cmd', MetaRight: 'R-Cmd', CapsLock: 'Caps',
  Tab: 'Tab', Enter: 'Enter', Backspace: 'Bksp', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right'
};

// Short label for a key code: 'KeyQ' -> 'Q', 'Digit1' -> '1', 'Mouse2' -> 'RMB'.
export function keyLabel(code) {
  if (!code) {
    return '-';
  }
  if (NAMES[code]) {
    return NAMES[code];
  }
  if (code.startsWith('Key')) {
    return code.slice(3);
  }
  if (code.startsWith('Digit')) {
    return code.slice(5);
  }
  if (code.startsWith('Numpad')) {
    return 'Num' + code.slice(6);
  }
  return code;
}

export function actionKeyLabel(action) {
  return keyLabel(bindings[action]);
}
