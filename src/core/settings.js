// Player settings other than key bindings, set on the controls screen and kept
// in this browser's localStorage: how loud the sound effects play (0 = off,
// audio/sfx.js), how fast the camera turns (by mouse, by the turn keys and
// by a finger on a touch screen) and, on a touch screen, how fast it follows
// behind the wizard and turns to face its target (0 = never), as a share of
// the default (1 = 100%); and switches. Sliders are listed under their `group`.

export const Settings = [
  { id: 'sfxVolume', group: 'SOUND', label: 'Sound effects volume (0 = off)', min: 0, max: 1, step: 0.05, value: 0.8 },
  { id: 'cameraDrag', group: 'CAMERA SPEED', label: 'Mouse turn sensitivity', min: 0.1, max: 2, step: 0.05, value: 1 },
  { id: 'cameraTurn', group: 'CAMERA SPEED', label: 'Turn key speed', min: 0.1, max: 2, step: 0.05, value: 1 },
  { id: 'touchTurn', group: 'CAMERA SPEED', label: 'Touch turn sensitivity', min: 0.1, max: 2, step: 0.05, value: 1 },
  { id: 'touchFollow', group: 'CAMERA SPEED', label: 'Touch camera follows behind (0 = off)', min: 0, max: 2, step: 0.05, value: 1 },
  { id: 'touchFace', group: 'CAMERA SPEED', label: 'Touch camera faces the target (0 = off)', min: 0, max: 2, step: 0.05, value: 1 }
];

// On or off, shown as switches on the controls screen. God mode is for
// playtesting: when the wizard falls it may retry the stage, as it came to
// it (Game.retryStage), and the run is not saved.
export const Toggles = [
  { id: 'godMode', label: 'God mode: retry when you die', value: false }
];

const STORAGE_KEY = 'etow3d.settings';

let values = load();

function defaults() {
  const out = {};
  for (const s of [...Settings, ...Toggles]) {
    out[s.id] = s.value;
  }
  return out;
}

// Saved values over the defaults, kept within each setting's range; storage
// may be missing or blocked.
function load() {
  const out = defaults();
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    for (const s of Settings) {
      if (typeof saved[s.id] === 'number' && Number.isFinite(saved[s.id])) {
        out[s.id] = Math.min(s.max, Math.max(s.min, saved[s.id]));
      }
    }
    for (const t of Toggles) {
      if (typeof saved[t.id] === 'boolean') {
        out[t.id] = saved[t.id];
      }
    }
  } catch {
    // keep the defaults
  }
  return out;
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
  } catch {
    // not saved: the settings still hold for this session
  }
}

export function setting(id) {
  return values[id];
}

export function setSetting(id, value) {
  const s = Settings.find((x) => x.id === id);
  if (!s || !Number.isFinite(value)) {
    return;
  }
  values[id] = Math.min(s.max, Math.max(s.min, value));
  save();
}

export function setToggle(id, on) {
  if (Toggles.some((t) => t.id === id)) {
    values[id] = !!on;
    save();
  }
}

export function resetSettings() {
  values = defaults();
  save();
}
