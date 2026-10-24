import { Actions, RESERVED, bind, bindingOf, keyLabel, resetBindings, onBindingsChange } from '../core/bindings.js';
import { Settings, setting, setSetting, resetSettings } from '../core/settings.js';

// the actions the spellbook binds
const SPELL_KEY = /^(missile|slot\d+)$/;

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

// The controls screen: the camera's turn speeds as sliders, then every action
// with its key; click one, then press a key or mouse button to rebind it
// (Escape cancels). The spell keys are set in the spellbook instead, under
// the bar's slots (ui/spellbook.js). Opened from the main menu, the pause
// screen and the HUD's micro menu. While it is open it takes every key press,
// so nothing reaches the game.
export function openControls({ onClose } = {}) {
  const screen = el('div', 'screen controls-screen', document.body);
  const card = el('div', 'card controls-card', screen);
  el('h2', null, card, 'CONTROLS');
  el('p', 'dim', card, 'Click an action, then press a key or mouse button. Escape cancels; Escape and the arrow keys are fixed.');
  const status = el('div', 'controls-status', card, '');
  const list = el('div', 'controls-list', card);

  el('div', 'controls-group', list, 'CAMERA SPEED');
  const sliders = [];
  for (const s of Settings) {
    const row = el('label', 'controls-row', list);
    el('span', 'controls-label', row, s.label);
    const input = el('input', 'controls-slider', row);
    input.type = 'range';
    input.min = s.min;
    input.max = s.max;
    input.step = s.step;
    const shown = el('span', 'controls-value', row, '');
    const show = () => {
      input.value = setting(s.id);
      shown.textContent = Math.round(setting(s.id) * 100) + '%';
    };
    input.oninput = () => {
      setSetting(s.id, Number(input.value));
      show();
    };
    show();
    sliders.push(show);
  }

  const rows = [];
  let group = null;
  for (const action of Actions) {
    if (action.group !== group) {
      group = action.group;
      el('div', 'controls-group', list, group.toUpperCase());
      if (group === 'Spells') {
        el('div', 'controls-note dim', list, 'Magic missile and the spell bar take their keys in the spellbook (' +
          keyLabel(bindingOf('spellbook')) + ' in game): click the key under a slot, then press the new one.');
      }
    }
    if (SPELL_KEY.test(action.id)) {
      continue;
    }
    const row = el('div', 'controls-row', list);
    el('span', 'controls-label', row, action.label);
    const button = el('button', 'secondary controls-key', row, '');
    button.type = 'button';
    button.onclick = (e) => {
      e.stopPropagation();
      startCapture(action, button);
    };
    rows.push({ action, button });
  }

  const buttons = el('div', 'buttons', card);
  const reset = el('button', 'secondary', buttons, 'Reset to defaults');
  reset.type = 'button';
  reset.onclick = () => {
    stopCapture();
    resetBindings();
    resetSettings();
    for (const show of sliders) {
      show();
    }
    status.textContent = 'Defaults restored.';
  };
  const done = el('button', null, buttons, 'Done');
  done.type = 'button';
  done.onclick = () => close();

  const refresh = () => {
    for (const r of rows) {
      r.button.textContent = keyLabel(bindingOf(r.action.id));
    }
  };
  const unlisten = onBindingsChange(refresh);
  refresh();

  let capturing = null;
  function startCapture(action, button) {
    stopCapture();
    capturing = { action, button };
    button.classList.add('capturing');
    button.textContent = 'Press...';
    status.textContent = 'Press a key or mouse button for ' + action.label.toLowerCase() + '.';
  }
  function stopCapture() {
    if (capturing) {
      capturing.button.classList.remove('capturing');
      capturing = null;
      refresh();
    }
  }
  function assign(code) {
    const { action } = capturing;
    stopCapture();
    const swapped = bind(action.id, code);
    const other = swapped && Actions.find((a) => a.id === swapped);
    status.textContent = action.label + ' :: ' + keyLabel(code) +
      (other ? '. ' + other.label + ' moved to ' + keyLabel(bindingOf(other.id)) + '.' : '.');
  }

  // Capture phase on window, so the game's own key handlers never see presses.
  const onKey = (e) => {
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.type !== 'keydown' || e.repeat) {
      return;
    }
    if (!capturing) {
      if (e.code === 'Escape') {
        close();
      }
      return;
    }
    if (e.code === 'Escape') {
      stopCapture();
      status.textContent = '';
      return;
    }
    if (RESERVED.includes(e.code)) {
      return;
    }
    assign(e.code);
  };
  let swallowClick = false;
  const onMouse = (e) => {
    if (!capturing) {
      // a right click makes no click event, so a stale flag clears here
      swallowClick = false;
      return;
    }
    // the click that started capturing has already happened; this is the new binding
    e.preventDefault();
    e.stopImmediatePropagation();
    swallowClick = true;
    assign('Mouse' + e.button);
  };
  // ...and the click that press makes must not start another capture
  const onClick = (e) => {
    if (swallowClick) {
      swallowClick = false;
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  };
  const onContext = (e) => {
    e.preventDefault();
  };
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('keyup', onKey, true);
  screen.addEventListener('mousedown', onMouse, true);
  screen.addEventListener('click', onClick, true);
  screen.addEventListener('auxclick', onClick, true);
  screen.addEventListener('contextmenu', onContext);

  function close() {
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('keyup', onKey, true);
    unlisten();
    screen.remove();
    if (onClose) {
      onClose();
    }
  }
  return close;
}
