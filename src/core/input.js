import { actionFor } from './bindings.js';
import { isTouch, pointer, recentTouch } from './device.js';

// px the mouse may wander between press and release for it to be a click
const CLICK_SLOP = 6;
// wheel deltas given in lines or pages, in px
const LINE_PX = 16;
const PAGE_PX = 400;
// a pinch zooms by e^(PINCH_RATE px) per px of wheel, at most PINCH_MAX px
// an event (a mouse's ctrl + wheel notch stays a modest step)
const PINCH_RATE = 0.01;
const PINCH_MAX = 25;

// The modifier keys. One bound to an action (the item names, on Ctrl) is
// pressed with its own flag set, so its press is not taken for a browser
// shortcut; and the right-hand one presses whatever the left-hand one is
// bound to, unless it is bound to something of its own.
const MODIFIERS = new Set(['ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'ShiftLeft', 'ShiftRight', 'MetaLeft', 'MetaRight']);
const LEFT_HAND = { ControlRight: 'ControlLeft', AltRight: 'AltLeft', ShiftRight: 'ShiftLeft', MetaRight: 'MetaLeft' };

function codeOf(e) {
  return LEFT_HAND[e.code] && !actionFor(e.code) ? LEFT_HAND[e.code] : e.code;
}

// Keyboard and mouse input, mapped to actions through the rebindable bindings
// (bindings.js). `pressed` is edge-triggered per simulation step: presses
// queue up until a step consumes them, so nothing is lost when a render frame
// runs no step. While 'camera_drag' is held, mouse movement turns the camera
// (takeLook). A left button press that is let go without dragging also
// reads as 'click' whatever it is bound to (survival loot is picked up by
// clicking its name), so looking around never picks anything up. On a touch
// screen (ui/touch.js) the on-screen controls press the same actions, set
// `stick` and the aim, and tap() stands in for a click; the mouse events a
// browser makes up after a touch are ignored.
//
// Keys pressed with Ctrl or Cmd are left to the browser (its shortcuts),
// except while Ctrl is held as a key of the game's own (the item names): then
// the game keeps playing, so the wizard walks and casts with the names
// shown. (Ctrl with W still closes the tab in most browsers, which no page
// can stop; main.js asks first while the names are held.)
//
// The wheel: a mouse's zooms a notch at a time (takeWheel). With a trackpad
// (device.js pointer) two fingers swiping turn and tilt the camera instead
// (takeSwipe), along whichever way they mostly go. A pinch zooms either way
// (takeZoom): browsers send a trackpad's pinch as the wheel with ctrl held,
// and Safari as gesture events.
export class Input {
  constructor(element) {
    this.element = element;
    this.held = new Set();
    this.queued = new Set();
    this.current = new Set();
    // pointer in CSS pixels relative to the canvas, and on the ground in sim pixels
    this.mouse = { x: 0, y: 0, inside: false };
    this.ground = { x: 0, y: 0 };
    this.wheel = 0;
    // a trackpad's swipe (wheel px) and a pinch (a zoom factor) not yet taken
    this.swipe = { x: 0, y: 0 };
    this.zoom = 1;
    this.gesture = null;
    // the wheel moved sideways, as a trackpad's fingers do (game.js suggests
    // picking the trackpad on the controls screen)
    this.swiped = false;
    // the ground under the mouse (game.js sets it each frame; null on a
    // touch screen), and whether the mouse moved over the view since the
    // last frame read it (ui/touch.js)
    this.pointer = null;
    this.moved = false;
    this.look = { x: 0, y: 0 };
    // the on-screen joystick: x right, y down on the screen, length up to 1
    this.stick = { x: 0, y: 0 };
    // steps begun so far (touch.js holds a tapped aim until one has read it)
    this.steps = 0;
    // how far the mouse moved since the left button went down, or null
    this.leftTravel = null;
    this.listeners = [];

    // the modifiers held as keys of the game's own
    this.heldModifiers = new Set();
    this.on(window, 'keydown', (e) => {
      const code = codeOf(e);
      const action = actionFor(code);
      if (!action) {
        return;
      }
      if (MODIFIERS.has(code)) {
        this.heldModifiers.add(code);
      } else if (e.metaKey || (e.ctrlKey && !this.ctrlHeld())) {
        return;
      }
      // keep bound keys from scrolling the page or opening quick find
      e.preventDefault();
      if (!e.repeat) {
        this.queued.add(action);
      }
      this.held.add(action);
    });
    this.on(window, 'keyup', (e) => {
      const code = codeOf(e);
      this.heldModifiers.delete(code);
      const action = actionFor(code);
      if (action) {
        this.held.delete(action);
      }
    });
    this.on(window, 'blur', () => {
      this.held.clear();
      this.heldModifiers.clear();
    });
    this.on(element, 'mousedown', (e) => {
      if (recentTouch()) {
        return;
      }
      if (e.button === 0) {
        this.leftTravel = 0;
      }
      const action = actionFor('Mouse' + e.button);
      if (action) {
        e.preventDefault();
        this.queued.add(action);
        this.held.add(action);
      }
    });
    this.on(window, 'mouseup', (e) => {
      if (recentTouch()) {
        return;
      }
      if (e.button === 0) {
        if (this.leftTravel !== null && this.leftTravel < CLICK_SLOP) {
          this.queued.add('click');
        }
        this.leftTravel = null;
      }
      const action = actionFor('Mouse' + e.button);
      if (action) {
        this.held.delete(action);
      }
    });
    this.on(element, 'mousemove', (e) => {
      if (recentTouch()) {
        return;
      }
      const rect = element.getBoundingClientRect();
      this.mouse.x = e.clientX - rect.left;
      this.mouse.y = e.clientY - rect.top;
      this.mouse.inside = true;
      this.moved = true;
    });
    // a drag may cross the HUD or leave the window: follow it on the window
    this.on(window, 'mousemove', (e) => {
      if (recentTouch()) {
        return;
      }
      if (this.leftTravel !== null) {
        this.leftTravel += Math.abs(e.movementX || 0) + Math.abs(e.movementY || 0);
      }
      if (this.held.has('camera_drag')) {
        this.look.x += e.movementX || 0;
        this.look.y += e.movementY || 0;
      }
    });
    this.on(element, 'mouseleave', () => {
      this.mouse.inside = false;
    });
    this.on(element, 'contextmenu', (e) => e.preventDefault());
    this.on(element, 'wheel', (e) => {
      e.preventDefault();
      const px = e.deltaMode === 1 ? LINE_PX : (e.deltaMode === 2 ? PAGE_PX : 1);
      let dx = e.deltaX * px;
      let dy = e.deltaY * px;
      if (e.ctrlKey) {
        // a pinch (Safari's arrives as gesture events instead)
        if (!this.gesture) {
          this.zoom *= Math.exp(Math.max(-PINCH_MAX, Math.min(PINCH_MAX, dy)) * PINCH_RATE);
        }
        return;
      }
      if (pointer() === 'trackpad') {
        if (Math.abs(dx) > Math.abs(dy) * 2) {
          dy = 0;
        } else if (Math.abs(dy) > Math.abs(dx) * 2) {
          dx = 0;
        }
        this.swipe.x += dx;
        this.swipe.y += dy;
        return;
      }
      if (dx && !e.shiftKey) {
        this.swiped = true;
      }
      this.wheel += Math.sign(dy);
    }, { passive: false });
    // Safari's pinch on a trackpad (a touch screen's pinch is ui/touch.js's)
    this.on(element, 'gesturestart', (e) => {
      if (isTouch()) {
        return;
      }
      e.preventDefault();
      this.gesture = { scale: 1 };
    });
    this.on(element, 'gesturechange', (e) => {
      if (isTouch() || !this.gesture || !(e.scale > 0)) {
        return;
      }
      e.preventDefault();
      this.zoom *= this.gesture.scale / e.scale;
      this.gesture.scale = e.scale;
    });
    this.on(element, 'gestureend', () => {
      this.gesture = null;
    });
  }

  on(target, type, fn, options) {
    target.addEventListener(type, fn, options);
    this.listeners.push([target, type, fn, options]);
  }

  // Moves queued presses into the set the coming step reads.
  beginStep() {
    this.current = this.queued;
    this.queued = new Set();
    this.steps++;
  }

  // A tap on a touch screen: a click at that spot on the view.
  tap(x, y) {
    this.mouse.x = x;
    this.mouse.y = y;
    this.mouse.inside = true;
    this.queued.add('click');
  }

  // Ctrl is held as a key of the game's own.
  ctrlHeld() {
    return this.heldModifiers.has('ControlLeft') || this.heldModifiers.has('ControlRight');
  }

  state(action) {
    return this.held.has(action) || this.current.has(action);
  }

  pressed(action) {
    return this.current.has(action);
  }

  // UI-level presses (pause, map) read outside the simulation steps.
  consume(action) {
    if (this.queued.has(action)) {
      this.queued.delete(action);
      return true;
    }
    return false;
  }

  takeWheel() {
    const w = this.wheel;
    this.wheel = 0;
    return w;
  }

  // A trackpad's two-finger swipe since the last call (wheel px: x right,
  // y down, as the page would scroll).
  takeSwipe() {
    const swipe = { x: this.swipe.x, y: this.swipe.y };
    this.swipe.x = 0;
    this.swipe.y = 0;
    return swipe;
  }

  // The zoom factor pinched since the last call (above 1 draws the camera back).
  takeZoom() {
    const zoom = this.zoom;
    this.zoom = 1;
    return zoom;
  }

  // Mouse movement (CSS px) while the camera was dragged, since the last call.
  takeLook() {
    const look = { x: this.look.x, y: this.look.y };
    this.look.x = 0;
    this.look.y = 0;
    return look;
  }

  dispose() {
    for (const [target, type, fn, options] of this.listeners) {
      target.removeEventListener(type, fn, options);
    }
    this.listeners = [];
  }
}
