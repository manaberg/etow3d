// Touch screen or mouse and keyboard: which controls the game shows. A phone
// or tablet starts on the touch controls (ui/touch.js); after that the last
// kind of input wins, so a touchscreen laptop or an iPad with a trackpad
// switches as it is used: a touch turns the on-screen controls on, moving a
// real mouse turns them off. Keys work either way. The controls screen can
// pin one mode instead ('on' or 'off'), kept in this browser's localStorage.
// The mode shows as the `touch` class on <body>.

export const TouchModes = [
  { id: 'auto', label: 'Auto' },
  { id: 'on', label: 'On' },
  { id: 'off', label: 'Off' }
];

const STORAGE_KEY = 'etow3d.touch';

// browsers follow a touch with mouse events of their own for a moment
const MOUSE_AFTER_TOUCH = 800;

let preference = loadPreference();
let detected = startsOnTouch();
let lastTouch = -Infinity;
const listeners = new Set();

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
