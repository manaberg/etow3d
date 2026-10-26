import { UNIT, clamp } from '../core/constants.js';
import { isTouch, onTouchModeChange } from '../core/device.js';
import { setting } from '../core/settings.js';
import { Arcana } from '../entities/arcana.js';
import { Item } from '../entities/items.js';
import { buildAimGuide } from '../render/models.js';

// how far (CSS px) and how long (ms) a finger may move and stay for a tap
const TAP_SLOP = 12;
const TAP_TIME = 350;
// the joystick starts anywhere on this share of the screen, from the left;
// its knob reaches this far (CSS px) and moves the wizard past the dead zone
const STICK_ZONE = 0.45;
const STICK_RADIUS = 56;
const STICK_DEAD = 8;
// a spell button dragged past AIM_DEAD aims by hand, and AIM_DRAG away
// reaches the spell's full range (CSS px)
const AIM_DEAD = 16;
const AIM_DRAG = 90;
// the wizard aims by itself at foes in sight this close (sim px)
const AUTO_RANGE = 520;
// a bolt aimed by hand bends onto a foe this close to its line (radians)
const SNAP_ANGLE = 0.3;
// a finger turns the camera this much more than the mouse does per pixel
export const TOUCH_TURN = 1.6;
// how fast the camera swings round behind a walking wizard (radians per
// second with the joystick pushed straight sideways, at 100%), and how long
// it leaves the camera alone after a finger turned it by hand (ms)
const FOLLOW_RATE = 1.1;
const FOLLOW_PAUSE = 1200;
// with a target the camera turns to look at it: this share of the way per
// second (at 100%), at most FACE_MAX radians per second, and not for a foe
// closer than FACE_NEAR (sim px), whose bearing jumps about
const FACE_RATE = 4;
const FACE_MAX = 3.5;
const FACE_NEAR = 60;

// How each spell is aimed from a touch screen. `line`: a direction (the
// bolt flies that way, magic missile's darts curve in on the foe nearest
// it); `point`: a spot on the ground, a drag reaching out to `range`;
// `unit` / `item`: a foe or an item near that spot. `radius` is drawn
// around the spot. `hold` spells cast while the button is held, the others
// when it is let go; a spell not listed casts the moment it is touched,
// around the wizard or at the foe the spell picks for itself.
const AIM = {
  missile: { kind: 'line', range: 460, hold: true },
  ray: { kind: 'line', range: 400, hold: true },
  fireball: { kind: 'line', range: 400 },
  ironshot: { kind: 'line', range: 500 },
  scorch: { kind: 'line', range: 420 },
  cone: { kind: 'line', range: Arcana.cone.range },
  disintegrate: { kind: 'line', range: Arcana.disintegrate.range },
  blink: { kind: 'point', range: 340, radius: 26 },
  blizzard: { kind: 'point', range: 440, radius: (p) => (p.hasBz2 ? 192 : 96) },
  meteor: { kind: 'point', range: 440, radius: Arcana.meteor.scatter },
  cloud: { kind: 'point', range: 440, radius: Arcana.cloud.radius },
  pwkill: { kind: 'unit', range: 560, radius: 40 },
  polymorph: { kind: 'unit', range: Arcana.polymorph.range, radius: 40 },
  tele: { kind: 'item', range: 600, radius: 36 }
};

const DEG = Math.PI / 180;

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

function setText(node, text) {
  if (node.textContent !== text) {
    node.textContent = text;
  }
}

const COMPASS = '<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="16" fill="#2a2a34" stroke="#c8a24a" stroke-width="2"/>' +
  '<g class="compass-needle"><path d="M20 5 L25 20 L15 20 Z" fill="#e23a3a"/><path d="M20 35 L25 20 L15 20 Z" fill="#e8e0d0"/></g></svg>';

// The controls of a touch screen (core/device.js picks them). They press
// the same actions as the keys, so the game plays as it does with a mouse:
// - a joystick, wherever a thumb lands on the left of the screen, walks the
//   wizard the way the camera looks;
// - the action bar sits in the bottom right corner around magic missile.
//   The wizard aims by itself at the nearest foe in sight (marked by the
//   cursor ring): hold magic missile to fire at it, tap a spell to cast it
//   there. Drag off a button instead to aim by hand, with a guide on the
//   ground, and let go to cast; let go over the cross to call it off. Spells
//   that need no aim go off the moment they are touched;
// - a finger elsewhere turns the camera, two pinch to zoom, and a tap
//   clicks (an item's name picks it up; in a battle's commander mode it
//   selects regiments and orders them, battle.js tap);
// - buttons for the stairs, a battle's orders, and the camera's compass.
export class TouchControls {
  constructor(game) {
    this.game = game;
    this.input = game.input;
    this.hud = game.hud;
    // live fingers by pointer id: { kind: 'stick' | 'view' | 'spell', ... }
    this.fingers = new Map();
    this.stick = null;
    this.stickRest = { x: 0, y: 0 };
    // the spell finger being aimed, and a cast let go, whose aim holds
    // until a step has read it
    this.aiming = null;
    this.lock = null;
    // the foe the wizard aims at by itself, and the way it last walked
    this.target = null;
    this.facing = { x: 0, y: -1 };
    this.look = { x: 0, y: 0 };
    this.lookedAt = -Infinity;
    this.pinch = null;
    this.cursorShown = false;
    this.autoPaused = false;
    this.listeners = [];
    this.guide = buildAimGuide();
    game.gfx.add(this.guide);
    this.build();
    this.attach();
    this.layout();
  }

  build() {
    const root = this.hud.root;
    // reads the screen's safe area (the notch, the home bar)
    this.safeProbe = el('div', 'touch-safe', root);
    this.stickBase = el('div', 'touch-stick touch-only', root);
    this.stickKnob = el('div', 'touch-stick-knob', this.stickBase);
    this.cancelZone = el('div', 'touch-cancel touch-only hidden', root);
    el('span', 'touch-cancel-x', this.cancelZone, '✕');
    el('span', 'touch-cancel-text', this.cancelZone, 'CANCEL');

    const button = (parent, cls, text, fn) => {
      const b = el('button', cls, parent, text);
      b.type = 'button';
      b.tabIndex = -1;
      b.onclick = fn;
      return b;
    };
    // the compass shows where north is and turns the camera back to it
    this.compass = button(null, 'micro-btn touch-only', '', () => this.game.gfx.resetView());
    this.compass.innerHTML = COMPASS;
    this.hud.micro.insertBefore(this.compass, this.hud.micro.firstChild);
    this.needle = this.compass.querySelector('.compass-needle');

    // battles: the mode (the lit half), the selection and the orders,
    // without keys; while the armies deploy, a button to start at once
    const queue = (action) => () => this.input.queued.add(action);
    this.attackButton = button(root, 'touch-btn touch-attack touch-only hidden', 'ATTACK NOW', queue('descend'));
    this.battleRow = el('div', 'touch-battle touch-only hidden', root);
    this.modeButton = button(this.battleRow, 'touch-btn touch-mode', '', queue('mode_toggle'));
    this.modeCommand = el('span', null, this.modeButton, 'COMMAND');
    this.modeSpells = el('span', null, this.modeButton, 'SPELLS');
    this.allButton = button(this.battleRow, 'touch-btn', '', () => this.toggleAll());
    this.chargeButton = button(this.battleRow, 'touch-btn', 'CHARGE', queue('order_charge'));
    this.followButton = button(this.battleRow, 'touch-btn', 'FOLLOW', queue('order_follow'));

    this.rotateNote = el('div', 'screen touch-rotate hidden', root);
    const card = el('div', 'card', this.rotateNote);
    el('div', 'touch-rotate-icon', card, '⟳');
    el('h2', null, card, 'TURN YOUR PHONE SIDEWAYS');
    el('p', 'dim', card, 'The descent is played in landscape. The game waits until you turn it.');
  }

  on(target, type, fn, options) {
    target.addEventListener(type, fn, options);
    this.listeners.push([target, type, fn, options]);
  }

  attach() {
    const canvas = this.game.gfx.canvas;
    this.on(canvas, 'pointerdown', (e) => this.viewDown(e));
    this.on(window, 'pointermove', (e) => this.fingerMove(e));
    this.on(window, 'pointerup', (e) => this.fingerUp(e, false));
    this.on(window, 'pointercancel', (e) => this.fingerUp(e, true));
    // touches on the view never scroll, zoom or select the page
    const keep = (e) => {
      if (isTouch() && e.cancelable) {
        e.preventDefault();
      }
    };
    this.on(canvas, 'touchstart', keep, { passive: false });
    this.on(canvas, 'touchmove', keep, { passive: false });
    this.on(document, 'gesturestart', keep);
    for (const r of this.hud.spellRows) {
      this.on(r.btn, 'pointerdown', (e) => this.spellDown(e, r));
      // nor do they drag the button or make the clicks a mouse would
      // (the spellbook, while open, takes the bar's clicks as usual)
      this.on(r.btn, 'touchstart', (e) => {
        if (!this.game.inventoryOpen) {
          keep(e);
        }
      }, { passive: false });
      this.on(r.btn, 'contextmenu', keep);
    }
    this.on(window, 'resize', () => this.layout());
    this.on(document, 'visibilitychange', () => this.releaseAll());
    this.offMode = onTouchModeChange(() => {
      this.releaseAll();
      this.input.mouse.inside = false;
      this.layout();
    });
  }

  // Whether the game takes the fingers now (no screen over it).
  playing() {
    const game = this.game;
    return game.state === 'playing' && !game.paused && !game.inventoryOpen;
  }

  viewFingers() {
    return [...this.fingers.values()].filter((f) => f.kind === 'view');
  }

  // ------------------------------------------------------------ fingers

  viewDown(e) {
    if (e.pointerType === 'mouse' || !isTouch()) {
      return;
    }
    e.preventDefault();
    if (!this.playing()) {
      return;
    }
    const f = { kind: 'view', x: e.clientX, y: e.clientY, t0: performance.now(), travel: 0 };
    if (!this.stick && e.clientX < window.innerWidth * STICK_ZONE) {
      f.kind = 'stick';
      this.stick = { x0: e.clientX, y0: e.clientY };
    }
    this.fingers.set(e.pointerId, f);
  }

  spellDown(e, r) {
    const game = this.game;
    if (e.pointerType === 'mouse' || !isTouch() || game.inventoryOpen) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    if (!this.playing() || !game.player) {
      return;
    }
    if (r.state === 'empty') {
      // an empty slot opens the spellbook on it, to fill it
      game.hud.openSlot(r.index);
      return;
    }
    if (r.state !== 'spell') {
      return;
    }
    const aim = AIM[r.spellId] || null;
    const f = { kind: 'spell', row: r, action: r.action, spell: r.spellId, aim, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, cancel: false };
    this.fingers.set(e.pointerId, f);
    this.input.held.add(r.action);
    if (!aim || aim.hold) {
      // spells without aim go off at once, held ones start at once (a step
      // sees even the quickest tap)
      this.input.queued.add(r.action);
    }
    if (aim) {
      this.aiming = f;
    }
  }

  fingerMove(e) {
    const f = this.fingers.get(e.pointerId);
    if (!f) {
      return;
    }
    const dx = e.clientX - f.x;
    const dy = e.clientY - f.y;
    f.x = e.clientX;
    f.y = e.clientY;
    if (f.kind === 'spell') {
      f.cancel = !f.aim.hold && this.dragged(f) && this.overCancel(f.x, f.y);
      return;
    }
    f.travel += Math.abs(dx) + Math.abs(dy);
    if (f.kind === 'stick') {
      this.moveStick(f);
      return;
    }
    const views = this.viewFingers();
    if (views.length >= 2) {
      // two fingers pinch the zoom (and neither is a tap any more)
      const d = Math.hypot(views[0].x - views[1].x, views[0].y - views[1].y);
      if (this.pinch && d > 0) {
        this.game.gfx.zoomScale(this.pinch / d);
      }
      this.pinch = d;
      for (const v of views) {
        v.travel += TAP_SLOP;
      }
    } else {
      this.look.x += dx;
      this.look.y += dy;
      this.lookedAt = performance.now();
    }
  }

  // The knob follows the finger; a finger that runs off past its reach
  // drags the base along.
  moveStick(f) {
    const s = this.stick;
    let dx = f.x - s.x0;
    let dy = f.y - s.y0;
    const d = Math.hypot(dx, dy);
    if (d > STICK_RADIUS) {
      s.x0 = f.x - dx / d * STICK_RADIUS;
      s.y0 = f.y - dy / d * STICK_RADIUS;
      dx = f.x - s.x0;
      dy = f.y - s.y0;
    }
    const on = d > STICK_DEAD;
    this.input.stick.x = on ? dx / STICK_RADIUS : 0;
    this.input.stick.y = on ? dy / STICK_RADIUS : 0;
  }

  fingerUp(e, cancelled) {
    const f = this.fingers.get(e.pointerId);
    if (!f) {
      return;
    }
    this.fingers.delete(e.pointerId);
    if (f.kind === 'spell') {
      this.spellUp(f, cancelled);
      return;
    }
    if (f.kind === 'stick') {
      this.stick = null;
      this.input.stick.x = 0;
      this.input.stick.y = 0;
    }
    if (this.viewFingers().length < 2) {
      this.pinch = null;
    }
    if (!cancelled && f.travel < TAP_SLOP && performance.now() - f.t0 < TAP_TIME) {
      this.tap(f.x, f.y);
    }
  }

  spellUp(f, cancelled) {
    this.input.held.delete(f.action);
    if (this.aiming === f) {
      this.aiming = [...this.fingers.values()].find((o) => o.kind === 'spell' && o.aim) || null;
    }
    if (!f.aim || f.aim.hold || cancelled || f.cancel || !this.playing()) {
      return;
    }
    const aim = this.resolve(f);
    if (!aim.point) {
      return;
    }
    this.input.queued.add(f.action);
    this.lock = { point: aim.point, target: aim.target, until: this.input.steps + 1 };
  }

  // A tap: commander mode selects and orders (battle.js tap); otherwise it
  // is a click there, aimed at the ground under it until a step reads it.
  tap(x, y) {
    const game = this.game;
    if (!this.playing()) {
      return;
    }
    if (game.battle && game.battle.commander) {
      game.battle.tap({ x, y });
      return;
    }
    const g = game.gfx.pickGround({ x, y });
    this.input.tap(x, y);
    if (g) {
      this.lock = { point: g, target: null, until: this.input.steps + 1, tap: true };
    }
  }

  releaseAll() {
    for (const f of this.fingers.values()) {
      if (f.kind === 'spell') {
        this.input.held.delete(f.action);
      }
    }
    this.fingers.clear();
    this.stick = null;
    this.aiming = null;
    this.pinch = null;
    this.input.stick.x = 0;
    this.input.stick.y = 0;
  }

  dragged(f) {
    return Math.hypot(f.x - f.x0, f.y - f.y0) > AIM_DEAD;
  }

  overCancel(x, y) {
    const r = this.cancelZone.getBoundingClientRect();
    const slop = 14;
    return r.width > 0 && x > r.left - slop && x < r.right + slop && y > r.top - slop && y < r.bottom + slop;
  }

  // Camera turning by finger since the last call (CSS px).
  takeLook() {
    const look = { x: this.look.x, y: this.look.y };
    this.look.x = 0;
    this.look.y = 0;
    return look;
  }

  // The camera's own turning on a touch screen. With a target (the ringed
  // foe) it looks at it from behind the wizard, so the joystick circles it
  // and backs away from it; otherwise it swings round behind the wizard as
  // it walks: towards the way the joystick points, faster the more
  // sideways, so a thumb steers like a third-person game (not while backing
  // away). Neither for a moment after a finger turned the camera by hand,
  // nor in commander mode. Returns the yaw to turn this frame.
  followYaw(dt) {
    const game = this.game;
    const player = game.player;
    if (!isTouch() || !player || player.dead || (game.battle && game.battle.commander) ||
      performance.now() - this.lookedAt < FOLLOW_PAUSE) {
      return 0;
    }
    const face = FACE_RATE * setting('touchFace');
    const target = this.target;
    if (face && target && !target.killed) {
      const c = player.center();
      const t = target.center();
      const dx = t.x - c.x;
      const dy = t.y - c.y;
      if (Math.hypot(dx, dy) < FACE_NEAR) {
        return 0;
      }
      // the camera looks along (-sin yaw, -cos yaw) on the ground
      const want = Math.atan2(-dx, -dy);
      let turn = want - game.gfx.yaw;
      turn -= Math.PI * 2 * Math.round(turn / (Math.PI * 2));
      const step = turn * Math.min(1, face * dt);
      return Math.max(-FACE_MAX * dt, Math.min(FACE_MAX * dt, step));
    }
    const s = this.input.stick;
    const rate = FOLLOW_RATE * setting('touchFollow');
    if (!rate || !this.stick || !(s.x || s.y) || player.isFeared) {
      return 0;
    }
    if (Math.hypot(player.vel.x, player.vel.y) < 1) {
      return 0;
    }
    // the stick's angle clockwise from straight ahead
    const a = Math.atan2(s.x, -s.y);
    if (Math.cos(a) < -0.25) {
      return 0;
    }
    return -Math.sin(a) * rate * dt;
  }

  toggleAll() {
    const battle = this.game.battle;
    if (!battle) {
      return;
    }
    if (this.allSelected(battle)) {
      battle.selected = new Set();
    } else {
      battle.selectAll();
    }
  }

  allSelected(battle) {
    const alive = battle.regiments.player.filter((r) => r.alive > 0);
    return alive.length > 0 && alive.every((r) => battle.selected.has(r.id));
  }

  // ------------------------------------------------------------ aiming

  // A screen direction (the way a finger dragged) on the ground, for the
  // way the camera looks.
  screenDir(dx, dy) {
    const d = this.game.gfx.alignToView(dx, dy);
    const len = Math.hypot(d.x, d.y) || 1;
    return { x: d.x / len, y: d.y / len };
  }

  // The way the wizard is heading: the joystick's, else the way it last walked.
  heading() {
    const s = this.input.stick;
    return s.x || s.y ? this.screenDir(s.x, s.y) : this.facing;
  }

  // Aiming looks past pillars, shelves and ribs (only walls hide a foe), so
  // a column passing between the wizard and its foe keeps the ring on it.
  inSight(a, b) {
    return this.game.world.hasLineOfSight(a.x, a.y, b.x, b.y, true);
  }

  foes() {
    return this.game.hostilesOf('player').filter((e) => !e.killed && !e.invis);
  }

  // The foe the wizard aims at by itself: the nearest one in sight within
  // AUTO_RANGE (a wizard or a boss counts as a little nearer), keeping the
  // one it had while that one is not much further than the nearest.
  pickTarget() {
    const player = this.game.player;
    const c = player.center();
    const near = [];
    for (const e of this.foes()) {
      const p = e.center();
      const d = Math.hypot(p.x - c.x, p.y - c.y);
      if (d < AUTO_RANGE) {
        near.push({ e, score: d * (e.isDuelWizard || e.isBoss ? 0.8 : 1) });
      }
    }
    near.sort((a, b) => a.score - b.score);
    let best = null;
    for (let i = 0; i < near.length && i < 8 && !best; i++) {
      if (this.inSight(c, near[i].e.center())) {
        best = near[i];
      }
    }
    if (!best) {
      return null;
    }
    const kept = this.target !== best.e && near.find((n) => n.e === this.target);
    if (kept && kept.score < best.score * 1.3 && this.inSight(c, kept.e.center())) {
      return kept.e;
    }
    return best.e;
  }

  // Aim assist for a bolt aimed by hand: the foe in sight closest to its
  // line, within SNAP_ANGLE of it and in range.
  alongLine(c, dir, range) {
    const near = [];
    for (const e of this.foes()) {
      const p = e.center();
      const vx = p.x - c.x;
      const vy = p.y - c.y;
      const along = vx * dir.x + vy * dir.y;
      if (along <= 0 || along > range + e.size.x / 2) {
        continue;
      }
      const across = Math.max(0, Math.abs(vx * dir.y - vy * dir.x) - e.size.x / 2);
      const angle = Math.atan2(across, along);
      if (angle < SNAP_ANGLE) {
        near.push({ e, angle });
      }
    }
    near.sort((a, b) => a.angle - b.angle);
    for (let i = 0; i < near.length && i < 6; i++) {
      if (this.inSight(c, near[i].e.center())) {
        return near[i].e;
      }
    }
    return null;
  }

  nearestItem(point, range) {
    let best = null;
    let bestD = range;
    for (const e of this.game.entities) {
      if (e.killed || !(e instanceof Item) || !e.view || !e.view.visible) {
        continue;
      }
      const p = e.center();
      const d = Math.hypot(p.x - point.x, p.y - point.y);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  // Blink only lands on open floor: the furthest open spot on the way to `to`.
  blinkSpot(c, to) {
    const player = this.game.player;
    const dx = to.x - c.x;
    const dy = to.y - c.y;
    const d = Math.hypot(dx, dy);
    for (let t = d; t > 20; t -= 12) {
      const x = c.x + dx / d * t;
      const y = c.y + dy / d * t;
      if (this.game.world.canStandAt(x - player.size.x / 2, y - player.size.y / 2, player.size.x, player.size.y)) {
        return { x, y };
      }
    }
    return null;
  }

  // Where a spell finger aims: by hand once dragged off its button (the
  // drag's direction turned the way the camera looks, its length scaled to
  // the spell's range), else at the foe the wizard aims at by itself (blink:
  // the way it is heading; telekinesis: the nearest item). Returns the
  // point (null when the spell has nowhere to go), the foe or item there,
  // and whether it was aimed by hand.
  resolve(f) {
    const game = this.game;
    const c = game.player.center();
    const aim = f.aim;
    const dx = f.x - f.x0;
    const dy = f.y - f.y0;
    const manual = this.dragged(f);
    const dir = manual ? this.screenDir(dx, dy) : this.heading();
    if (aim.kind === 'line') {
      const target = manual ? this.alongLine(c, dir, aim.range) : this.target;
      const point = target ? target.center() : { x: c.x + dir.x * aim.range, y: c.y + dir.y * aim.range };
      return { point, target, manual };
    }
    let point;
    let target = null;
    if (manual) {
      const reach = Math.min(1, Math.hypot(dx, dy) / AIM_DRAG) * aim.range;
      point = { x: c.x + dir.x * reach, y: c.y + dir.y * reach };
    } else if (f.spell === 'blink') {
      point = { x: c.x + dir.x * aim.range, y: c.y + dir.y * aim.range };
    } else if (aim.kind === 'item') {
      target = this.nearestItem(c, aim.range);
      point = target ? target.center() : null;
    } else {
      target = this.target;
      point = target ? target.center() : { x: c.x + dir.x * 200, y: c.y + dir.y * 200 };
    }
    if (f.spell === 'blink') {
      point = this.blinkSpot(c, point);
    } else if (manual && aim.kind === 'unit') {
      target = game.hostileNear(point, 120);
    } else if (manual && aim.kind === 'item') {
      target = this.nearestItem(point, 120);
    }
    if (target) {
      point = target.center();
    }
    return { point, target, manual };
  }

  // ------------------------------------------------------------ per frame

  // Aims for the coming steps and draws the controls. Returns false when the
  // mouse is in charge instead.
  update() {
    const game = this.game;
    const input = this.input;
    this.checkOrientation();
    this.cursorShown = false;
    this.guide.visible = false;
    if (!isTouch()) {
      this.cancelZone.classList.add('hidden');
      return false;
    }
    if (!this.playing() && this.fingers.size) {
      this.releaseAll();
    }
    this.showStick();
    this.showBattle();
    this.showCompass();
    const player = game.player;
    this.cancelZone.classList.toggle('hidden', !(this.aiming && !this.aiming.aim.hold && this.dragged(this.aiming)));
    this.cancelZone.classList.toggle('over', !!(this.aiming && this.aiming.cancel));
    if (!player || player.dead || !game.world) {
      return true;
    }
    const speed = Math.hypot(player.vel.x, player.vel.y);
    if (speed > 1) {
      this.facing = { x: player.vel.x / speed, y: player.vel.y / speed };
    }
    this.target = this.pickTarget();
    let aim = null;
    if (this.lock && input.steps < this.lock.until) {
      aim = this.lock;
    } else {
      if (this.lock && this.lock.tap) {
        input.mouse.inside = false;
      }
      this.lock = null;
      if (this.aiming) {
        aim = this.resolve(this.aiming);
      }
    }
    let point = aim && aim.point;
    if (!point) {
      // at rest the wizard faces its foe, else the way it walks
      const c = player.center();
      point = this.target ? this.target.center() : { x: c.x + this.facing.x * 160, y: c.y + this.facing.y * 160 };
    }
    input.ground.x = point.x;
    input.ground.y = point.y;
    this.cursorShown = !!(aim ? aim.target : this.target);
    if (this.aiming && aim === this.lock) {
      return true;
    }
    this.drawGuide(this.aiming, aim);
    return true;
  }

  // The guide on the ground for the spell being aimed: red over the cross,
  // or where a blink finds no open floor.
  drawGuide(f, aim) {
    const g = this.guide;
    if (!f || !aim || (f.aim.hold && !aim.manual)) {
      return;
    }
    const u = g.userData;
    const player = this.game.player;
    const c = player.center();
    g.visible = true;
    g.position.set(c.x * UNIT, 0, c.y * UNIT);
    const bad = f.cancel || !aim.point;
    for (const m of u.materials) {
      m.color.setHex(bad ? 0xff5a4a : 0x9fd8ff);
    }
    const kind = f.aim.kind;
    u.reach.visible = kind !== 'line';
    u.reach.scale.set(f.aim.range * UNIT, f.aim.range * UNIT, 1);
    u.line.visible = !!aim.point && (kind === 'line' || f.spell === 'blink');
    u.spot.visible = !!aim.point && kind !== 'line';
    if (!aim.point) {
      return;
    }
    const dx = aim.point.x - c.x;
    const dy = aim.point.y - c.y;
    if (u.line.visible) {
      const length = kind === 'line' && !aim.target ? f.aim.range : Math.hypot(dx, dy);
      u.line.rotation.y = -Math.atan2(dy, dx);
      u.line.scale.set(Math.max(0.01, length * UNIT), 1, 0.9);
    }
    if (u.spot.visible) {
      const radius = typeof f.aim.radius === 'function' ? f.aim.radius(player) : f.aim.radius;
      u.spot.position.set(dx * UNIT, 0.055, dy * UNIT);
      u.spot.scale.set(radius * UNIT, 1, radius * UNIT);
    }
  }

  showStick() {
    const s = this.stick;
    const x = s ? s.x0 : this.stickRest.x;
    const y = s ? s.y0 : this.stickRest.y;
    this.stickBase.style.left = x + 'px';
    this.stickBase.style.top = y + 'px';
    this.stickBase.classList.toggle('active', !!s);
    const k = this.input.stick;
    this.stickKnob.style.transform = 'translate(' + (k.x * STICK_RADIUS) + 'px, ' + (k.y * STICK_RADIUS) + 'px)';
  }

  showBattle() {
    const battle = this.game.battle;
    this.hud.root.classList.toggle('commander', !!battle && battle.commander);
    const shown = !!battle && this.game.state === 'playing';
    this.battleRow.classList.toggle('hidden', !shown);
    this.attackButton.classList.toggle('hidden', !shown || battle.fighting);
    if (!battle) {
      return;
    }
    this.modeCommand.classList.toggle('on', battle.commander);
    this.modeSpells.classList.toggle('on', !battle.commander);
    setText(this.allButton, this.allSelected(battle) ? 'NONE' : 'ALL');
    const none = battle.selected.size === 0;
    this.chargeButton.disabled = none;
    this.followButton.disabled = none;
  }

  // The needle points where north lies on the screen: turned by the
  // camera's yaw, clockwise.
  showCompass() {
    const angle = (this.game.gfx.yaw / DEG).toFixed(1);
    if (this.needleAngle !== angle) {
      this.needleAngle = angle;
      this.needle.setAttribute('transform', 'rotate(' + angle + ' 20 20)');
    }
  }

  // Phones are played sideways: held upright, the game waits (and goes on
  // once turned back, unless paused by hand meanwhile).
  checkOrientation() {
    const game = this.game;
    const upright = isTouch() && window.innerHeight > window.innerWidth && window.innerWidth < 640;
    this.rotateNote.classList.toggle('hidden', !upright);
    if (upright && game.state === 'playing' && !game.paused) {
      game.setPaused(true);
      this.autoPaused = true;
    } else if (!upright && this.autoPaused) {
      this.autoPaused = false;
      if (game.paused) {
        game.setPaused(false);
      }
    }
  }

  // The action bar on a touch screen: magic missile as the big button in
  // the bottom right corner and the bar's slots in two arcs around it, the
  // first four close in and the other six further out; every slot keeps its
  // place as more open. Sizes follow the screen.
  layout() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const safe = getComputedStyle(this.safeProbe);
    const inset = (side) => parseFloat(safe['padding' + side]) || 0;
    const s = clamp(Math.min(h / 400, w / 760), 0.72, 1.2);
    const cx = w - inset('Right') - 76 * s;
    const cy = h - inset('Bottom') - 72 * s;
    const place = (node, x, y, size) => {
      node.style.setProperty('--tx', x.toFixed(1) + 'px');
      node.style.setProperty('--ty', y.toFixed(1) + 'px');
      node.style.setProperty('--ts', size.toFixed(1) + 'px');
    };
    const arc = (radius, from, to, n, i) => {
      const a = (from + (to - from) * (n > 1 ? i / (n - 1) : 0)) * DEG;
      return { x: cx + Math.cos(a) * radius, y: cy + Math.sin(a) * radius };
    };
    this.hud.spellRows.forEach((r, i) => {
      if (i === 0) {
        place(r.btn, cx, cy, 88 * s);
      } else if (i <= 4) {
        const p = arc(120 * s, 180, 270, 4, i - 1);
        place(r.btn, p.x, p.y, 58 * s);
      } else {
        const p = arc(186 * s, 180, 270, 6, i - 5);
        place(r.btn, p.x, p.y, 50 * s);
      }
    });
    const cancel = arc(258 * s, 225, 225, 1, 0);
    place(this.cancelZone, cancel.x, cancel.y, 66 * s);
    this.stickRest = { x: inset('Left') + 100 * s, y: h - inset('Bottom') - 96 * s };
  }

  dispose() {
    for (const [target, type, fn, options] of this.listeners) {
      target.removeEventListener(type, fn, options);
    }
    this.listeners = [];
    this.offMode();
    this.game.gfx.remove(this.guide);
  }
}
