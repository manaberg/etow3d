// Saved games, kept in this browser's localStorage: every run's autosave
// (rewritten at the start of each stage, and when the game is left or the
// page hidden) and the saves made from the pause screen. Each save is kept
// under a key of its own, and an index of their summaries lists them on the
// main menu without reading them all. Storage may be missing, blocked or
// full: every call copes, and writeSave says whether the save was kept.

const INDEX_KEY = 'etow3d.saves';
const SAVE_KEY = 'etow3d.save.';
// raised when saves made by an older build can no longer be loaded
export const SAVE_VERSION = 1;
// the runs played last keep their autosaves
const MAX_AUTOSAVES = 5;

const listeners = new Set();

function readIndex() {
  try {
    const list = JSON.parse(localStorage.getItem(INDEX_KEY) || '[]');
    return Array.isArray(list) ? list.filter((s) => s && typeof s.id === 'string' && Number.isFinite(s.savedAt)) : [];
  } catch {
    return [];
  }
}

function changed() {
  for (const fn of listeners) {
    fn();
  }
}

function randomId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function newRunId() {
  return randomId();
}

export function autosaveId(runId) {
  return 'auto-' + runId;
}

export function newSaveId() {
  return 'save-' + randomId();
}

// Every save's summary, newest first.
export function listSaves() {
  return readIndex().sort((a, b) => b.savedAt - a.savedAt);
}

// The newest save this build can load, or null.
export function latestSave() {
  return listSaves().find((s) => s.version === SAVE_VERSION) || null;
}

// A save's contents, or null when it is missing, unreadable or was made by a
// build that cannot load it.
export function readSave(id) {
  try {
    const data = JSON.parse(localStorage.getItem(SAVE_KEY + id) || 'null');
    if (!data || data.version !== SAVE_VERSION || !Array.isArray(data.run) ||
      !Number.isInteger(data.stage) || !data.run[data.stage] || typeof data.stats !== 'object') {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

// Keeps a save under `id` (replacing one of the same id): `summary` is what
// the menu lists, `data` what loading needs. Returns whether it was stored.
export function writeSave(id, summary, data) {
  try {
    localStorage.setItem(SAVE_KEY + id, JSON.stringify({ ...data, version: SAVE_VERSION }));
    let list = readIndex().filter((s) => s.id !== id);
    list.push({ ...summary, id, savedAt: Date.now(), version: SAVE_VERSION });
    const autos = list.filter((s) => s.auto).sort((a, b) => b.savedAt - a.savedAt);
    for (const old of autos.slice(MAX_AUTOSAVES)) {
      localStorage.removeItem(SAVE_KEY + old.id);
      list = list.filter((s) => s !== old);
    }
    localStorage.setItem(INDEX_KEY, JSON.stringify(list));
  } catch {
    return false;
  }
  changed();
  return true;
}

export function deleteSave(id) {
  try {
    localStorage.removeItem(SAVE_KEY + id);
    const list = readIndex();
    const left = list.filter((s) => s.id !== id);
    if (left.length === list.length) {
      return;
    }
    localStorage.setItem(INDEX_KEY, JSON.stringify(left));
  } catch {
    return;
  }
  changed();
}

export function onSavesChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
