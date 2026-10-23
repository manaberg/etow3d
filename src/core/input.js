import { actionFor } from './bindings.js';

// px the mouse may wander between press and release for it to be a click
const CLICK_SLOP = 6;

// Keyboard and mouse input, mapped to actions through the rebindable bindings
// (bindings.js). `pressed` is edge-triggered per simulation step: presses
// queue up until a step consumes them, so nothing is lost when a render frame
// runs no step. While 'camera_drag' is held, mouse movement turns the camera
// (takeLook). A left button press that is let go without dragging also
// reads as 'click' whatever it is bound to (survival loot is picked up by
// clicking its name), so looking around never picks anything up.
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
    this.look = { x: 0, y: 0 };
    // how far the mouse moved since the left button went down, or null
    this.leftTravel = null;
    this.listeners = [];

    this.on(window, 'keydown', (e) => {
      const action = actionFor(e.code);
      if (!action || e.metaKey || e.ctrlKey) {
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
      const action = actionFor(e.code);
      if (action) {
        this.held.delete(action);
      }
    });
    this.on(window, 'blur', () => this.held.clear());
    this.on(element, 'mousedown', (e) => {
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
      const rect = element.getBoundingClientRect();
      this.mouse.x = e.clientX - rect.left;
      this.mouse.y = e.clientY - rect.top;
      this.mouse.inside = true;
    });
    // a drag may cross the HUD or leave the window: follow it on the window
    this.on(window, 'mousemove', (e) => {
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
      this.wheel += Math.sign(e.deltaY);
    }, { passive: false });
  }

  on(target, type, fn, options) {
    target.addEventListener(type, fn, options);
    this.listeners.push([target, type, fn, options]);
  }

  // Moves queued presses into the set the coming step reads.
  beginStep() {
    this.current = this.queued;
    this.queued = new Set();
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
