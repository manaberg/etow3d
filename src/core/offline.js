// Offline play: registers the service worker (src/sw.js, which the build
// writes as sw.js) and keeps the main menu told how it stands:
// - 'saving': the game's files are being saved on this device;
// - 'ready': they all are, so the game plays without a network;
// - 'update': a newer version is saved and waits; applyUpdate() reloads
//   into it (the menu offers it, so a game in progress is never cut off);
// - 'failed': they could not be saved (the game still plays online).
// Only in a build: the dev server's files change all the time.

const listeners = new Set();
let status = 'none';
let registration = null;
let reloading = false;
const watched = new WeakSet();

export function offlineStatus() {
  return status;
}

export function onOfflineStatus(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function set(next) {
  if (next !== status) {
    status = next;
    for (const fn of listeners) {
      fn(status);
    }
  }
}

// Where the registration stands: a version waiting behind the one in use, one
// being saved, or one in use.
function track() {
  const reg = registration;
  if (reg.installing && !watched.has(reg.installing)) {
    const worker = reg.installing;
    watched.add(worker);
    worker.addEventListener('statechange', () => {
      // a version that could not save every file is dropped
      if (worker.state === 'redundant' && !reg.active && !reg.waiting) {
        set('failed');
      } else {
        track();
      }
    });
  }
  if (reg.waiting && navigator.serviceWorker.controller) {
    set('update');
  } else if (reg.active) {
    set('ready');
  } else if (reg.installing || reg.waiting) {
    set('saving');
  }
}

export function startOffline() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) {
    return;
  }
  // the new version took over because the player asked for it
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) {
      window.location.reload();
    }
  });
  navigator.serviceWorker.register('/sw.js').then((reg) => {
    registration = reg;
    reg.addEventListener('updatefound', track);
    track();
    // ask the browser to keep the saved game when space runs short
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().catch(() => {});
    }
  }).catch(() => set('failed'));
  // a home-screen app can stay open for days: look for a new version when it
  // comes back to the front (offline this just fails)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && registration) {
      registration.update().catch(() => {});
    }
  });
}

// Reloads into the waiting version.
export function applyUpdate() {
  if (registration && registration.waiting) {
    reloading = true;
    registration.waiting.postMessage('update');
  }
}
