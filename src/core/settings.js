// Player settings other than key bindings, set on the controls screen and kept
// in this browser's localStorage: how fast the camera turns, as a share of
// the default speed (1 = 100%).

export const Settings = [
  { id: 'cameraDrag', label: 'Mouse turn sensitivity', min: 0.1, max: 2, step: 0.05, value: 1 },
  { id: 'cameraTurn', label: 'Turn key speed', min: 0.1, max: 2, step: 0.05, value: 1 }
];

const STORAGE_KEY = 'etow3d.settings';

let values = load();

function defaults() {
  const out = {};
  for (const s of Settings) {
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

export function resetSettings() {
  values = defaults();
  save();
}
