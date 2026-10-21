let nextId = 1;

// Base for everything in the world. Mirrors the Impact entity the 2D game was
// built on: `pos` is the top-left of a `size` box on the ground plane, `vel`
// is in pixels per second, and subclasses set their defaults in `defaults()`
// so spawn settings can override them before `init()` runs.
export class Entity {
  constructor(game, x, y, settings = {}) {
    this.game = game;
    this.id = nextId++;
    this.pos = { x, y };
    this.size = { x: 48, y: 48 };
    this.vel = { x: 0, y: 0 };
    this.killed = false;
    this.view = null;
    this.defaults();
    for (const key in settings) {
      if (key === 'vel') {
        this.vel = { x: settings.vel.x, y: settings.vel.y };
      } else {
        this[key] = settings[key];
      }
    }
    this.init();
  }

  defaults() {}

  init() {}

  // k: frames of game time this step (1 normally, less while time is slowed)
  update(_k) {}

  // Moves by vel against the collision map. Returns the wall hits.
  move(k) {
    const dx = this.vel.x * k / 60;
    const dy = this.vel.y * k / 60;
    if (dx === 0 && dy === 0) {
      return null;
    }
    const res = this.game.world.trace(this.pos.x, this.pos.y, this.size.x, this.size.y, dx, dy);
    this.pos.x = res.x;
    this.pos.y = res.y;
    if (res.hitX || res.hitY) {
      this.onWallHit(res);
    }
    return res;
  }

  onWallHit(_res) {}

  center() {
    return { x: this.pos.x + this.size.x / 2, y: this.pos.y + this.size.y / 2 };
  }

  distanceTo(other) {
    const dx = (this.pos.x + this.size.x / 2) - (other.pos.x + other.size.x / 2);
    const dy = (this.pos.y + this.size.y / 2) - (other.pos.y + other.size.y / 2);
    return Math.sqrt(dx * dx + dy * dy);
  }

  angleTo(other) {
    const a = this.center();
    const b = other.center();
    return Math.atan2(b.y - a.y, b.x - a.x);
  }

  touches(other) {
    return !(
      this.pos.x >= other.pos.x + other.size.x ||
      this.pos.x + this.size.x <= other.pos.x ||
      this.pos.y >= other.pos.y + other.size.y ||
      this.pos.y + this.size.y <= other.pos.y
    );
  }

  // Whether a ground point (sim pixels) lies on this entity, with some slack
  // because a 3D model is harder to point at than a flat sprite.
  containsPoint(x, y, slack = 10) {
    return (
      x >= this.pos.x - slack && x <= this.pos.x + this.size.x + slack &&
      y >= this.pos.y - slack && y <= this.pos.y + this.size.y + slack
    );
  }

  kill() {
    this.killed = true;
  }

  // Called by the game after a kill, once the entity left the entity list.
  dispose() {
    if (this.view) {
      this.game.gfx.remove(this.view);
      this.view = null;
    }
  }

  // Keeps the 3D view in step with the simulation (called once per render).
  syncView(_time) {}
}
