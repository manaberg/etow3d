import './style.css';
import { Game } from './game.js';
import { resolveDifficulty } from './entities/duelWizard.js';

// Same URLs as the 2D game: /?mode=duel&ai=hard starts a duel, ?mode=survival
// the descent. Without a mode the main menu is shown.
function resolveMode() {
  const search = (window.location.search || '').toLowerCase();
  const hash = (window.location.hash || '').toLowerCase();
  if (search.includes('mode=duel') || search.includes('duel=1') || hash.includes('duel')) {
    return 'duel';
  }
  if (search.includes('mode=survival')) {
    return 'survival';
  }
  return null;
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

function start(mode, difficulty) {
  menu.classList.add('hidden');
  if (game) {
    game.dispose();
  }
  game = new Game({
    container,
    hudRoot,
    mode,
    difficulty,
    onExit(action) {
      if (action === 'restart') {
        start(mode, difficulty);
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

for (const button of menu.querySelectorAll('[data-mode]')) {
  button.addEventListener('click', () => {
    const mode = button.dataset.mode;
    const ai = button.dataset.ai;
    const query = mode === 'duel' ? '?mode=duel&ai=' + ai : '?mode=survival';
    history.replaceState(null, '', window.location.pathname + query);
    start(mode, ai);
  });
}

if (!supportsWebGL()) {
  document.getElementById('nogl').classList.remove('hidden');
} else {
  const mode = resolveMode();
  if (mode) {
    start(mode, resolveDifficulty());
  }
}
