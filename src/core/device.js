// Touch screen or mouse and keyboard: which controls the game shows. A phone
// or tablet starts on the touch controls (ui/touch.js); after that the last
// kind of input wins, so a touchscreen laptop or an iPad with a trackpad
// switches as it is used: a touch turns the on-screen controls on, moving a
// real mouse turns them off. Keys work either way. The controls screen can
// pin one mode instead ('on' or 'off'), kept in this browser's localStorage.
// The mode shows as the `touch` class on <body>.
//
// On a computer the controls screen also says what moves the pointer: a
// mouse or a laptop's trackpad. A browser cannot tell them apart, so it is
// the player's choice (the game only suggests it, once, when the wheel moves
// sideways as a trackpad's two fingers do). Each keeps its own keys
// (bindings.js), and a trackpad's two-finger swipe turns the camera where
// a mouse wheel zooms (input.js).

export const TouchModes = [
  { id: 'auto', label: 'Auto' },
  { id: 'on', label: 'On' },
  { id: 'off', label: 'Off' }
];

export const Pointers = [
  { id: 'mouse', label: 'Mouse' },
  { id: 'trackpad', label: 'Trackpad' }
];

const STORAGE_KEY = 'etow3d.touch';
const POINTER_KEY = 'etow3d.pointer';

// browsers follow a touch with mouse events of their own for a moment
const MOUSE_AFTER_TOUCH = 800;

let preference = loadPreference();
let detected = startsOnTouch();
let lastTouch = -Infinity;
const listeners = new Set();
let pointerKind = loadPointer();
// whether the player ever picked a pointer (else a trackpad's swipe brings
// the suggestion to pick one), and whether this page already suggested it
let pointerChosen = pointerKind !== null;
let suggested = false;
const pointerListeners = new Set();

function startsOnTouch() {
  try {
    if (window.matchMedia('(pointer: coarse)').matches) {
      return true;
    }
    return navigator.maxTouchPoints > 0 && !window.matchMedia('(any-pointer: fine)').matches;
  } catch {
    return false;
  }
}

function loadPreference() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return TouchModes.some((m) => m.id === saved) ? saved : 'auto';
  } catch {
    return 'auto';
  }
}

function loadPointer() {
  try {
    const saved = localStorage.getItem(POINTER_KEY);
    return Pointers.some((p) => p.id === saved) ? saved : null;
  } catch {
    return null;
  }
}

// 'mouse' or 'trackpad'.
export function pointer() {
  return pointerKind || 'mouse';
}

export function setPointer(id) {
  if (!Pointers.some((p) => p.id === id)) {
    return;
  }
  const was = pointer();
  pointerKind = id;
  pointerChosen = true;
  try {
    localStorage.setItem(POINTER_KEY, id);
  } catch {
    // not saved: the choice still holds for this session
  }
  if (id !== was) {
    for (const fn of pointerListeners) {
      fn(id);
    }
  }
}

export function onPointerChange(fn) {
  pointerListeners.add(fn);
  return () => pointerListeners.delete(fn);
}

// The wheel moved the way a trackpad's fingers do while the game takes a
// mouse: true the first time on this page, if no pointer was ever picked.
export function suggestTrackpad() {
  if (pointerChosen || suggested || pointer() === 'trackpad') {
    return false;
  }
  suggested = true;
  return true;
}

export function isTouch() {
  return preference === 'on' || (preference === 'auto' && detected);
}

export function touchMode() {
  return preference;
}

export function setTouchMode(id) {
  if (!TouchModes.some((m) => m.id === id)) {
    return;
  }
  const was = isTouch();
  preference = id;
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // not saved: the mode still holds for this session
  }
  if (isTouch() !== was) {
    changed();
  }
}

// Whether a mouse event may be one the browser made up for a touch.
export function recentTouch() {
  return performance.now() - lastTouch < MOUSE_AFTER_TOUCH;
}

export function onTouchModeChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function changed() {
  document.body.classList.toggle('touch', isTouch());
  for (const fn of listeners) {
    fn(isTouch());
  }
}

function detect(touch) {
  if (detected === touch) {
    return;
  }
  const was = isTouch();
  detected = touch;
  if (isTouch() !== was) {
    changed();
  }
}

// Capture phase, so the switch is made before any handler reads the mode.
function touched() {
  lastTouch = performance.now();
  detect(true);
}
window.addEventListener('touchstart', touched, { capture: true, passive: true });
window.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'touch' || e.pointerType === 'pen') {
    touched();
  }
}, true);
window.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'mouse' && (e.movementX || e.movementY) && !recentTouch()) {
    detect(false);
  }
}, true);

document.body.classList.toggle('touch', isTouch());
