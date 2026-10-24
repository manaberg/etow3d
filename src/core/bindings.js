// Key and mouse bindings, rebindable from the controls screen (the spell keys
// from the spellbook, on the bar's slots) and kept in this
// browser's localStorage. A binding is a KeyboardEvent.code ('KeyQ', 'Digit1',
// 'Space') or a mouse button ('Mouse0' left, 'Mouse1' middle, 'Mouse2' right),
// so any action can sit on any key or button. Escape always pauses and the
// arrow keys always move; neither can be rebound. Movement is relative to the
// camera, which turns (hold the left button and drag, or the turn keys).

// Every action in the order the controls screen lists them. Movement keeps
// the 2D game's keys; spells sit on the bar's slots instead of a key each.
export const Actions = [
  { id: 'up', label: 'Move up', group: 'Movement', key: 'KeyW' },
  { id: 'left', label: 'Move left', group: 'Movement', key: 'KeyA' },
  { id: 'down', label: 'Move down', group: 'Movement', key: 'KeyS' },
  { id: 'right', label: 'Move right', group: 'Movement', key: 'KeyD' },
  { id: 'camera_drag', label: 'Turn camera (hold and move the mouse)', group: 'Camera', key: 'Mouse0' },
  { id: 'camera_left', label: 'Turn camera left', group: 'Camera', key: 'KeyZ' },
  { id: 'camera_right', label: 'Turn camera right', group: 'Camera', key: 'KeyX' },
  { id: 'camera_reset', label: 'Camera back to north', group: 'Camera', key: 'KeyV' },
  { id: 'missile', label: 'Magic missile (hold)', group: 'Spells', key: 'Mouse2' },
  // the spell bar (entities/spellbar.js BarSlots): whatever spell is prepared
  // in each slot, nearest to WASD first
  { id: 'slot1', label: 'Spell slot 1', group: 'Spells', key: 'KeyQ' },
  { id: 'slot2', label: 'Spell slot 2', group: 'Spells', key: 'KeyE' },
  { id: 'slot3', label: 'Spell slot 3', group: 'Spells', key: 'KeyF' },
  { id: 'slot4', label: 'Spell slot 4', group: 'Spells', key: 'KeyR' },
  { id: 'slot5', label: 'Spell slot 5', group: 'Spells', key: 'Digit2' },
  { id: 'slot6', label: 'Spell slot 6', group: 'Spells', key: 'Digit4' },
  { id: 'slot7', label: 'Spell slot 7', group: 'Spells', key: 'Digit1' },
  { id: 'slot8', label: 'Spell slot 8', group: 'Spells', key: 'Digit3' },
  { id: 'slot9', label: 'Spell slot 9', group: 'Spells', key: 'KeyC' },
  { id: 'slot10', label: 'Spell slot 10', group: 'Spells', key: 'Digit5' },
  { id: 'mode_toggle', label: 'Spell mode / commander mode', group: 'Battle', key: 'Tab' },
  { id: 'regiment_all', label: 'Select all regiments', group: 'Battle', key: 'Backquote' },
  { id: 'order_charge', label: 'Selected: charge', group: 'Battle', key: 'KeyJ' },
  { id: 'order_hold', label: 'Selected: march to cursor and hold', group: 'Battle', key: 'KeyK' },
  { id: 'order_follow', label: 'Selected: follow me', group: 'Battle', key: 'KeyL' },
  { id: 'descend', label: 'Descend the stairs', group: 'Game', key: 'Space' },
  { id: 'map', label: 'Larger map', group: 'Game', key: 'KeyM' },
  { id: 'loot_names', label: 'Item names on the floor (toggle)', group: 'Game', key: 'KeyG' },
  { id: 'inventory', label: 'Inventory', group: 'Game', key: 'KeyI' },
  { id: 'spellbook', label: 'Spellbook', group: 'Game', key: 'KeyB' },
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

// v2: spells moved from a key each to the bar's slots, so older saved
// bindings are left behind once. v4: the left button turns the camera, the
// missile moved to the right button and the bar to Q E F R 2 4 1 3 C 5; v2
// bindings carry over without those (v3 was a layout that was soon undone).
const STORAGE_KEY = 'etow3d.bindings.v4';
const OLD_KEY = 'etow3d.bindings.v2';
const MOVED = ['camera_drag', 'missile', 'slot1', 'slot2', 'slot3', 'slot4', 'slot5', 'slot6', 'slot7', 'slot8', 'slot9', 'slot10'];

let bindings = load();
// Classic duels put the bar's slots on keys of the player's duel loadout
// (game.js): while set, the slots answer to these keys instead, and they take
// over whatever else those keys do outside duels.
let slotKeys = null;
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

// Saved bindings over the defaults; storage may be missing or blocked. An
// action added since the bindings were saved is left unbound if its default
// key was since given to something else.
function load() {
  const out = defaults();
  try {
    let saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!saved) {
      saved = JSON.parse(localStorage.getItem(OLD_KEY) || '{}');
      for (const id of MOVED) {
        delete saved[id];
      }
    }
    const taken = new Set();
    for (const id in saved) {
      if (id in out && typeof saved[id] === 'string' && !RESERVED.includes(saved[id])) {
        out[id] = saved[id];
        taken.add(saved[id]);
      }
    }
    for (const id in out) {
      if (!(id in saved) && taken.has(out[id])) {
        out[id] = '';
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
    if (bindings[id] && !(slotKeys && id in slotKeys)) {
      map[bindings[id]] = id;
    }
  }
  if (slotKeys) {
    for (const id in slotKeys) {
      if (slotKeys[id]) {
        map[slotKeys[id]] = id;
      }
    }
  }
  return map;
}

function refresh() {
  byCode = index();
  version++;
  for (const fn of listeners) {
    fn();
  }
}

function changed() {
  save();
  refresh();
}

// The action a key code or mouse button triggers, if any.
export function actionFor(code) {
  return byCode[code];
}

export function bindingOf(action) {
  return slotKeys && action in slotKeys ? slotKeys[action] : bindings[action];
}

// ------------------------------------------------------------ duel slot keys

// Actions a duel slot key may not take over.
const KEPT = ['up', 'left', 'down', 'right', 'missile', 'camera_drag', 'camera_left', 'camera_right', 'camera_reset', 'pause', 'inventory', 'spellbook'];

// Puts the bar's slots on their own keys ({ slot1: 'KeyQ', ... }), or back
// on the bindings (null).
export function setSlotKeys(keys) {
  slotKeys = keys ? { ...keys } : null;
  refresh();
}

export function currentSlotKeys() {
  return slotKeys ? { ...slotKeys } : null;
}

// Why `code` cannot be a duel slot key (the action it must keep), or null.
export function slotKeyBlocker(code) {
  if (RESERVED.includes(code) || code in FIXED) {
    return 'fixed';
  }
  const kept = KEPT.find((id) => bindings[id] === code);
  return kept ? Actions.find((a) => a.id === kept).label : null;
}

// Puts a slot on `code` in the duel keys; a slot already on it takes the old
// key in exchange. Returns false when the key must stay what it is.
export function bindSlotKey(action, code) {
  if (!slotKeys || !(action in slotKeys) || slotKeyBlocker(code)) {
    return false;
  }
  for (const id in slotKeys) {
    if (id !== action && slotKeys[id] === code) {
      slotKeys[id] = slotKeys[action];
    }
  }
  slotKeys[action] = code;
  refresh();
  return true;
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

// Puts only `ids` back on their default keys (the spellbook resets the spell
// keys this way); whatever held one of those keys takes the old key in
// exchange, as with bind.
export function resetActions(ids) {
  for (const id of ids) {
    const action = Actions.find((a) => a.id === id);
    if (action && bindings[id] !== action.key) {
      bind(id, action.key);
    }
  }
}

export function actionLabel(id) {
  const action = Actions.find((a) => a.id === id);
  return action ? action.label : id;
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
  return keyLabel(bindingOf(action));
}
