import { STEP } from './constants.js';

// Port of the TimeSlower plugin behind the time stop spell: ease into a
// slower time scale, hold it, then ease back to normal. Durations are in real
// seconds. The caster is exempt from the slow (see Entity.timeExempt).
export class TimeSlower {
  constructor() {
    this.scale = 1;
    this.phase = null;
    this.owner = null;
  }

  alterTimeScale(target, easeIn, hold, easeOut, owner) {
    this.phase = { from: this.scale, target, easeIn, hold, easeOut, t: 0 };
    this.owner = owner || null;
  }

  get active() {
    return this.phase !== null;
  }

  update() {
    const p = this.phase;
    if (!p) {
      return;
    }
    p.t += STEP;
    if (p.t < p.easeIn) {
      this.scale = p.from + (p.target - p.from) * (p.t / p.easeIn);
    } else if (p.t < p.easeIn + p.hold) {
      this.scale = p.target;
    } else if (p.t < p.easeIn + p.hold + p.easeOut) {
      const k = (p.t - p.easeIn - p.hold) / p.easeOut;
      this.scale = p.target + (1 - p.target) * k;
    } else {
      this.scale = 1;
      this.phase = null;
      this.owner = null;
    }
  }

  // Time factor for one entity this step.
  factorFor(entity) {
    if (!this.phase) {
      return 1;
    }
    if (entity && this.owner && (entity === this.owner || entity.timeOwner === this.owner)) {
      return 1;
    }
    return this.scale;
  }
}
