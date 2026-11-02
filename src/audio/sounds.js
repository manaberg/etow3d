import { Env, Curve, render, loopify } from './synth.js';

// The game's sound effects, each a recipe rendered by audio/synth.js and
// played by audio/sfx.js. Per sound:
//   dur       seconds rendered (a loop: the length of one turn of it)
//   make      the recipe: (track, random) => layers added to the track
//   vol       how loud it plays, 1 being a spell going off near the wizard
//   gap       the least time between two of it starting (thousands of
//             soldiers fall in a battle; one death sound in `gap` is heard)
//   voices    how many of it may sound at once
//   variants  how many takes are rendered (each a little different)
//   reverb    how much of it goes to the room's echo (0 for the interface)
//   loop      it repeats until stopped (zones that last)
//   ui        an interface sound: never placed in the world

// ------------------------------------------------------------ building blocks

// a low body blow: a falling sine and a thump of noise
function thud(s, { at = 0, f = 120, to = 45, decay = 0.08, amp = 1, bright = 900 } = {}) {
  s.tone({ at, dur: decay * 6, f: Curve.exp(f, to, decay * 2), amp, env: Env.perc(0.001, decay) });
  s.noise({ at, dur: decay * 4, amp: amp * 0.7, env: Env.perc(0.001, decay * 0.6), filter: { type: 'lp', f: bright } });
}

// air moving: noise through a band pass that sweeps from `from` to `to`
function whoosh(s, { at = 0, dur = 0.3, from = 400, to = 1600, q = 1.2, amp = 1, peak = 0.4 } = {}) {
  s.noise({ at, dur, amp, env: Env.swell(dur * peak, dur), filter: { type: 'bp', f: Curve.exp(from, to, dur), q } });
}

// a quick magical rise or fall in pitch
function zip(s, { at = 0, dur = 0.15, from = 300, to = 2400, amp = 1, type = 'sine' } = {}) {
  s.tone({ at, dur: dur * 1.6, f: Curve.exp(from, to, dur), type, amp, env: Env.perc(0.003, dur * 0.5) });
  s.noise({ at, dur, amp: amp * 0.6, env: Env.perc(0.002, dur * 0.4), filter: { type: 'bp', f: Curve.exp(from * 2, to * 2, dur), q: 2 } });
}

// a blast: a deep falling thump, a roar of noise closing down, crackling debris
function blast(s, { deep = 1, length = 1, crackle = 80 } = {}) {
  s.tone({ dur: 0.9 * length, f: Curve.exp(110 / deep, 32 / deep, 0.4 * length), amp: 1.1, env: Env.perc(0.002, 0.22 * length) });
  s.noise({ dur: length, amp: 1, env: Env.perc(0.002, 0.28 * length), filter: { type: 'lp', f: Curve.exp(6000 / deep, 250 / deep, 0.6 * length), q: 0.8 } });
  s.noise({ dur: length, amp: 0.5, color: 'brown', env: Env.perc(0.01, 0.4 * length), filter: { type: 'lp', f: 300 } });
  s.crackle({ at: 0.02, dur: length * 0.9, density: crackle, amp: 0.5, env: Env.perc(0.01, 0.25 * length), filter: { type: 'bp', f: 2500 / deep, q: 0.7 } });
  s.drive(1.6);
}

// a grunt or a growl: a buzzing voice through the formants of a vowel
function voice(s, { at = 0, dur, f, amp = 1, env, vowel = 'ah', rough = 0 }) {
  const vowels = {
    ah: [[700, 1, 4], [1150, 0.6, 5], [2600, 0.25, 6]],
    uh: [[500, 1, 4], [1000, 0.5, 5], [2400, 0.2, 6]],
    oo: [[320, 1, 4], [800, 0.4, 5], [2300, 0.15, 6]],
    ee: [[300, 1, 5], [2200, 0.5, 6], [3000, 0.3, 6]],
    aa: [[850, 1, 4], [1600, 0.6, 5], [2700, 0.25, 6]]
  };
  const formants = vowels[vowel].map(([ff, a, q]) => ({ type: 'bp', f: ff, q, amp: a }));
  s.tone({ at, dur, f, type: 'saw', amp, env, formants });
  if (rough) {
    const breath = typeof amp === 'function' ? (t) => amp(t) * rough : amp * rough;
    s.noise({ at, dur, amp: breath, env, grain: 40, filter: { type: 'bp', f: vowels[vowel][0][0], q: 2 } });
  }
}

// a brassy note (a saw softened by a low pass that opens as it sounds)
function brass(s, { at = 0, dur = 0.5, f, amp = 1, attack = 0.03, release = 0.15 }) {
  s.tone({ at, dur, f: Curve.vibrato(f, 5, 0.004), type: 'saw', amp, env: Env.ar(attack, release, dur),
    filter: { type: 'lp', f: Curve.exp(f * 2, f * 6, attack * 3), q: 1 } });
  s.tone({ at, dur, f: f * 1.003, type: 'saw', amp: amp * 0.5, env: Env.ar(attack, release, dur), filter: { type: 'lp', f: f * 4, q: 0.7 } });
}

const BELL = [[1, 1, 0.5], [2.76, 0.4, 0.25], [5.4, 0.2, 0.12], [8.93, 0.1, 0.06]];
const CHIME = [[1, 1, 0.45], [2, 0.3, 0.3], [3, 0.12, 0.2]];
const METAL = [[1, 1, 0.3], [1.48, 0.6, 0.22], [2.31, 0.45, 0.15], [3.73, 0.3, 0.1], [5.1, 0.2, 0.06]];

// how far a take strays from the base pitch
function vary(random, spread = 0.08) {
  return 1 + (random() * 2 - 1) * spread;
}

export const Sounds = {
  // ---------------------------------------------------------- the wizard's bolts

  missile: {
    dur: 0.3, vol: 0.45, gap: 0.04, voices: 6, variants: 4,
    make(s, r) {
      const p = vary(r, 0.12);
      s.tone({ dur: 0.25, f: Curve.exp(1700 * p, 480 * p, 0.18), type: 'tri', amp: 0.7, env: Env.perc(0.003, 0.06) });
      s.tone({ dur: 0.15, f: Curve.exp(2600 * p, 900 * p, 0.12), amp: 0.3, env: Env.perc(0.002, 0.04) });
      s.noise({ dur: 0.12, amp: 0.25, env: Env.perc(0.001, 0.04), filter: { type: 'bp', f: Curve.exp(3200, 1200, 0.1), q: 2 } });
    }
  },
  missileHit: {
    dur: 0.25, vol: 0.4, gap: 0.04, voices: 5, variants: 3,
    make(s, r) {
      const p = vary(r);
      s.noise({ dur: 0.1, amp: 0.7, env: Env.perc(0.001, 0.035), filter: { type: 'bp', f: 2400 * p, q: 1.5 } });
      s.tone({ dur: 0.12, f: Curve.exp(800 * p, 260 * p, 0.08), amp: 0.5, env: Env.perc(0.001, 0.04) });
      thud(s, { f: 160, to: 70, decay: 0.04, amp: 0.5 });
    }
  },
  fireball: {
    dur: 0.65, vol: 0.7, gap: 0.05, voices: 5, variants: 3,
    make(s, r) {
      const p = vary(r, 0.1);
      s.noise({ dur: 0.6, amp: 1, env: Env.swell(0.06, 0.6), filter: { type: 'bp', f: Curve.exp(280 * p, 1500 * p, 0.45), q: 0.8 } });
      s.noise({ dur: 0.5, amp: 0.5, color: 'brown', env: Env.perc(0.01, 0.2), filter: { type: 'lp', f: 500 } });
      s.crackle({ dur: 0.55, density: 90, amp: 0.45, env: Env.swell(0.1, 0.55), filter: { type: 'hp', f: 2500 } });
      s.tone({ dur: 0.3, f: Curve.exp(160 * p, 90 * p, 0.3), type: 'saw', amp: 0.18, env: Env.perc(0.01, 0.12), filter: { type: 'lp', f: 900 } });
    }
  },
  explosion: {
    dur: 1.1, vol: 0.85, gap: 0.06, voices: 4, variants: 3,
    make(s) {
      blast(s, { deep: 1, length: 1 });
    }
  },
  fireHit: {
    dur: 0.4, vol: 0.45, gap: 0.05, voices: 4, variants: 3,
    make(s, r) {
      s.noise({ dur: 0.35, amp: 0.8, env: Env.perc(0.001, 0.09), filter: { type: 'lp', f: Curve.exp(4000 * vary(r), 500, 0.25) } });
      s.crackle({ dur: 0.35, density: 120, amp: 0.5, env: Env.perc(0.005, 0.12) });
    }
  },
  scorch: {
    dur: 0.35, vol: 0.5, gap: 0.05, voices: 4, variants: 3,
    make(s, r) {
      const p = vary(r);
      s.noise({ dur: 0.3, amp: 0.9, env: Env.perc(0.005, 0.09), filter: { type: 'bp', f: Curve.exp(700 * p, 3200 * p, 0.2), q: 1.2 } });
      s.tone({ dur: 0.2, f: Curve.exp(220 * p, 640 * p, 0.15), type: 'saw', amp: 0.2, env: Env.perc(0.005, 0.07), filter: { type: 'lp', f: 1600 } });
      s.crackle({ dur: 0.25, density: 100, amp: 0.3, env: Env.perc(0.01, 0.1) });
    }
  },
  lightning: {
    dur: 0.5, vol: 0.7, gap: 0.05, voices: 4, variants: 3,
    make(s, r) {
      s.noise({ dur: 0.08, amp: 1, env: Env.perc(0.0005, 0.02), filter: { type: 'hp', f: 1500 } });
      s.tone({ dur: 0.35, f: Curve.jitter(140, 0.8, 120, r), type: 'square', amp: 0.4, env: Env.perc(0.002, 0.12), filter: { type: 'bp', f: 2200, q: 1 } });
      s.crackle({ dur: 0.45, density: 260, amp: 0.7, env: Env.perc(0.002, 0.12), filter: { type: 'hp', f: 3000 } });
      thud(s, { f: 90, to: 40, decay: 0.08, amp: 0.4, bright: 400 });
    }
  },
  zap: {
    dur: 0.22, vol: 0.45, gap: 0.04, voices: 5, variants: 4,
    make(s, r) {
      s.noise({ dur: 0.05, amp: 0.9, env: Env.perc(0.0005, 0.012), filter: { type: 'hp', f: 2000 } });
      s.tone({ dur: 0.16, f: Curve.jitter(220, 0.9, 160, r), type: 'square', amp: 0.35, env: Env.perc(0.001, 0.05), filter: { type: 'bp', f: 2800, q: 1 } });
      s.crackle({ dur: 0.18, density: 300, amp: 0.6, env: Env.perc(0.001, 0.05), filter: { type: 'hp', f: 3500 } });
    }
  },
  root: {
    dur: 0.45, vol: 0.5, gap: 0.05, voices: 3, variants: 3,
    make(s, r) {
      const p = vary(r);
      s.tone({ dur: 0.18, f: Curve.exp(260 * p, 900 * p, 0.1), amp: 0.5, env: Env.perc(0.004, 0.06) });
      s.noise({ dur: 0.15, amp: 0.45, env: Env.perc(0.002, 0.06), filter: { type: 'bp', f: 1800, q: 3 } });
      s.crackle({ at: 0.04, dur: 0.38, density: 70, amp: 0.45, env: Env.perc(0.02, 0.14), filter: { type: 'bp', f: 3000, q: 1 } });
    }
  },
  rootHit: {
    dur: 0.5, vol: 0.45, gap: 0.06, voices: 4, variants: 3,
    make(s, r) {
      const p = vary(r);
      s.tone({ dur: 0.42, f: Curve.vibrato(Curve.exp(95 * p, 70 * p, 0.4), 11, 0.05), type: 'saw', amp: 0.55, env: Env.ar(0.02, 0.2, 0.42), filter: { type: 'bp', f: 650, q: 4 } });
      s.noise({ dur: 0.35, amp: 0.4, grain: 50, env: Env.perc(0.01, 0.12), filter: { type: 'bp', f: 2600, q: 1.5 } });
      thud(s, { f: 120, to: 60, decay: 0.05, amp: 0.4 });
    }
  },
  ironshot: {
    dur: 1, vol: 0.85, gap: 0.08, voices: 3, variants: 2,
    make(s, r) {
      const p = vary(r, 0.05);
      thud(s, { f: 80, to: 30, decay: 0.18, amp: 1.1, bright: 2000 });
      s.bell({ f: 420 * p, amp: 0.35, partials: METAL });
      whoosh(s, { dur: 0.35, from: 700, to: 3200, amp: 0.4, peak: 0.2 });
      s.drive(1.4);
    }
  },
  ironHit: {
    dur: 0.35, vol: 0.5, gap: 0.07, voices: 4, variants: 3,
    make(s, r) {
      s.bell({ f: 900 * vary(r, 0.12), amp: 0.5, partials: METAL.map(([a, b, c]) => [a, b, c * 0.5]) });
      s.noise({ dur: 0.08, amp: 0.7, env: Env.perc(0.001, 0.02), filter: { type: 'hp', f: 1500 } });
      thud(s, { f: 140, to: 60, decay: 0.05, amp: 0.6 });
    }
  },
  // lifesteal is held: a grain every tenth of a second, overlapping into a drone
  ray: {
    dur: 0.18, vol: 0.32, gap: 0.09, voices: 3, variants: 4, reverb: 0.15,
    make(s, r) {
      const p = vary(r, 0.04);
      const env = Env.ar(0.04, 0.07, 0.18);
      s.tone({ f: 110 * p, type: 'saw', amp: 0.5, env, filter: { type: 'lp', f: 950, q: 4 } });
      s.tone({ f: 117 * p, type: 'saw', amp: 0.4, env, filter: { type: 'lp', f: 800, q: 3 } });
      s.noise({ amp: 0.25, env, grain: 70, filter: { type: 'bp', f: 420, q: 2 } });
    }
  },
  disintegrate: {
    dur: 0.7, vol: 0.75, gap: 0.08, voices: 3, variants: 2,
    make(s, r) {
      const p = vary(r, 0.05);
      s.tone({ dur: 0.6, f: Curve.exp(1900 * p, 520 * p, 0.45), amp: 0.6, env: Env.perc(0.002, 0.25), fm: { ratio: 1.5, index: Curve.exp(3, 0.2, 0.4) } });
      s.tone({ dur: 0.5, f: 90 * p, type: 'saw', amp: 0.3, env: Env.perc(0.005, 0.2), filter: { type: 'lp', f: 900 } });
      s.noise({ dur: 0.1, amp: 0.5, env: Env.perc(0.001, 0.03), filter: { type: 'hp', f: 5000 } });
      s.crackle({ at: 0.05, dur: 0.5, density: 120, amp: 0.3, env: Env.perc(0.02, 0.2) });
    }
  },

  // ---------------------------------------------------------- other spells

  shield: {
    dur: 0.8, vol: 0.55, gap: 0.1, voices: 2, variants: 2,
    make(s, r) {
      const p = vary(r, 0.05);
      s.tone({ dur: 0.6, f: Curve.exp(280 * p, 900 * p, 0.25), amp: 0.6, env: Env.perc(0.01, 0.3), fm: { ratio: 2, index: 0.3 } });
      for (const [i, f] of [1500, 1910, 2400].entries()) {
        s.tone({ dur: 0.75, f: f * p, amp: (t) => 0.12 * (1 + 0.6 * Math.sin(t * 40 + i)), env: Env.swell(0.12, 0.75) });
      }
      s.noise({ dur: 0.6, amp: 0.12, env: Env.swell(0.1, 0.6), filter: { type: 'bp', f: 2500, q: 2 } });
    }
  },
  block: {
    dur: 0.4, vol: 0.55, gap: 0.08, voices: 3, variants: 3,
    make(s, r) {
      const p = vary(r);
      s.bell({ f: 700 * p, amp: 0.6, partials: METAL.map(([a, b, c]) => [a, b, c * 0.8]) });
      s.noise({ dur: 0.06, amp: 0.6, env: Env.perc(0.001, 0.015), filter: { type: 'hp', f: 2000 } });
      s.tone({ dur: 0.3, f: Curve.vibrato(1300 * p, 18, 0.06), amp: 0.2, env: Env.perc(0.005, 0.1) });
    }
  },
  reflect: {
    dur: 0.3, vol: 0.5, gap: 0.05, voices: 4, variants: 3,
    make(s, r) {
      const p = vary(r);
      s.bell({ f: 1800 * p, amp: 0.5, partials: [[1, 1, 0.12], [2.7, 0.4, 0.06]] });
      s.tone({ dur: 0.1, f: Curve.exp(1200 * p, 2600 * p, 0.06), amp: 0.3, env: Env.perc(0.002, 0.03) });
    }
  },
  blink: {
    dur: 0.4, vol: 0.55, gap: 0.08, voices: 3, variants: 3,
    make(s, r) {
      const p = vary(r);
      zip(s, { dur: 0.12, from: 300 * p, to: 2400 * p, amp: 0.6 });
      s.tone({ at: 0.12, dur: 0.15, f: Curve.exp(1300 * p, 300 * p, 0.08), amp: 0.35, env: Env.perc(0.001, 0.04) });
      s.noise({ at: 0.12, dur: 0.1, amp: 0.3, env: Env.perc(0.001, 0.03), filter: { type: 'bp', f: 1800, q: 2 } });
    }
  },
  fizzle: {
    dur: 0.3, vol: 0.35, gap: 0.12, voices: 2, variants: 2,
    make(s, r) {
      s.noise({ dur: 0.25, amp: 0.5, env: Env.perc(0.002, 0.08), filter: { type: 'bp', f: 900 * vary(r), q: 1 } });
      s.tone({ dur: 0.15, f: Curve.exp(320, 140, 0.12), amp: 0.25, env: Env.perc(0.002, 0.05) });
    }
  },
  haste: {
    dur: 0.65, vol: 0.5, gap: 0.1, voices: 2, variants: 2,
    make(s, r) {
      const p = vary(r, 0.05);
      whoosh(s, { dur: 0.6, from: 300, to: 4200, amp: 0.8, peak: 0.6, q: 1.5 });
      s.tone({ dur: 0.5, f: Curve.exp(200 * p, 1300 * p, 0.45), type: 'tri', amp: 0.3, env: Env.swell(0.35, 0.5) });
      for (let i = 0; i < 6; i++) {
        s.tone({ at: i * 0.07, dur: 0.05, f: 1200 + i * 220, amp: 0.12, env: Env.perc(0.001, 0.015) });
      }
    }
  },
  invis: {
    dur: 0.9, vol: 0.45, gap: 0.1, voices: 2, variants: 2,
    make(s, r) {
      const p = vary(r, 0.05);
      for (const d of [1, 1.006, 0.994]) {
        s.tone({ dur: 0.85, f: Curve.exp(2100 * p * d, 700 * p * d, 0.7), amp: 0.25, env: Env.perc(0.05, 0.3) });
      }
      s.noise({ dur: 0.8, amp: 0.25, env: Env.swell(0.15, 0.8), filter: { type: 'lp', f: Curve.exp(6000, 600, 0.7) } });
    }
  },
  image: {
    dur: 0.7, vol: 0.45, gap: 0.1, voices: 2, variants: 2,
    make(s, r) {
      const p = vary(r, 0.05);
      for (const d of [1, 1.01, 0.99, 1.5]) {
        s.tone({ dur: 0.65, f: Curve.exp(600 * p * d, 1200 * p * d, 0.3), amp: 0.18, env: Env.swell(0.15, 0.65) });
      }
      s.noise({ dur: 0.6, amp: 0.12, env: Env.swell(0.2, 0.6), filter: { type: 'hp', f: 6000 } });
    }
  },
  pop: {
    dur: 0.25, vol: 0.4, gap: 0.05, voices: 3, variants: 3,
    make(s, r) {
      const p = vary(r, 0.15);
      s.tone({ dur: 0.12, f: Curve.exp(900 * p, 200 * p, 0.06), amp: 0.6, env: Env.perc(0.001, 0.04) });
      s.noise({ dur: 0.08, amp: 0.4, env: Env.perc(0.001, 0.025), filter: { type: 'bp', f: 2000 * p, q: 2 } });
    }
  },
  timestop: {
    dur: 1.8, vol: 0.7, gap: 0.5, voices: 1, variants: 1, reverb: 0.5,
    make(s) {
      s.noise({ dur: 0.32, amp: 0.8, env: Env.rise(0.32, 2), filter: { type: 'bp', f: Curve.exp(200, 4000, 0.32), q: 1.5 } });
      s.tone({ at: 0.3, dur: 1.4, f: Curve.exp(620, 70, 1.1), amp: 0.5, env: Env.perc(0.01, 0.5) });
      s.tone({ at: 0.3, dur: 1.4, f: Curve.exp(930, 105, 1.1), type: 'saw', amp: 0.2, env: Env.perc(0.01, 0.4), filter: { type: 'lp', f: 1400 } });
      thud(s, { at: 0.3, f: 70, to: 30, decay: 0.3, amp: 0.8, bright: 500 });
      for (const at of [0.7, 1.15]) {
        s.bell({ at, f: 2100, amp: 0.3, partials: [[1, 1, 0.03], [2.3, 0.5, 0.02]] });
      }
    }
  },
  fear: {
    dur: 1.1, vol: 0.55, gap: 0.3, voices: 2, variants: 2, reverb: 0.4,
    make(s, r) {
      const p = vary(r, 0.05);
      const env = Env.swell(0.25, 1.05);
      s.tone({ f: 70 * p, type: 'saw', amp: 0.45, env, filter: { type: 'lp', f: 420 } });
      s.tone({ f: 74.5 * p, type: 'saw', amp: 0.4, env, filter: { type: 'lp', f: 400 } });
      s.tone({ f: Curve.vibrato(Curve.exp(1300 * p, 1600 * p, 0.6), 9, 0.05), amp: 0.14, env });
      s.noise({ amp: (t) => 0.18 * (0.6 + 0.4 * Math.sin(t * 30)), env, filter: { type: 'bp', f: 900, q: 5 } });
    }
  },
  tele: {
    dur: 0.5, vol: 0.45, gap: 0.1, voices: 2, variants: 2,
    make(s, r) {
      const p = vary(r, 0.05);
      s.pluck({ dur: 0.45, f: 880 * p, amp: 0.6, damp: 0.996 });
      s.bell({ at: 0.05, f: 1760 * p, amp: 0.3, partials: CHIME });
      s.noise({ dur: 0.3, amp: 0.1, env: Env.swell(0.1, 0.3), filter: { type: 'hp', f: 7000 } });
    }
  },
  pwCharge: {
    dur: 1.05, vol: 0.55, gap: 0.5, voices: 2, variants: 1, reverb: 0.4,
    make(s) {
      const env = Env.ar(0.6, 0.05, 1.05);
      s.tone({ f: Curve.exp(55, 110, 1), type: 'saw', amp: 0.5, env, filter: { type: 'lp', f: Curve.exp(200, 1600, 1), q: 2 } });
      s.tone({ f: Curve.exp(82, 156, 1), type: 'saw', amp: 0.4, env, filter: { type: 'lp', f: Curve.exp(200, 1400, 1), q: 2 } });
      s.noise({ amp: (t) => 0.2 * (0.5 + 0.5 * Math.sin(t * 50)), env, filter: { type: 'bp', f: 1300, q: 6 } });
    }
  },
  pwkill: {
    dur: 1.6, vol: 0.95, gap: 0.3, voices: 2, variants: 1, reverb: 0.5,
    make(s) {
      s.tone({ dur: 1.4, f: Curve.exp(55, 28, 0.6), amp: 1, env: Env.perc(0.002, 0.45) });
      for (const f of [65.4, 92.5, 98]) {
        s.tone({ dur: 1.4, f, type: 'saw', amp: 0.35, env: Env.perc(0.005, 0.55), filter: { type: 'lp', f: Curve.exp(1400, 180, 1) } });
      }
      s.noise({ dur: 1, amp: 0.7, env: Env.perc(0.002, 0.3), filter: { type: 'lp', f: Curve.exp(3000, 200, 0.6) } });
      s.bell({ at: 0.02, f: 220, amp: 0.3, partials: BELL.map(([a, b, c]) => [a, b, c * 2]) });
      s.drive(2);
    }
  },
  silence: {
    dur: 0.45, vol: 0.35, gap: 0.15, voices: 2, variants: 2,
    make(s, r) {
      s.noise({ dur: 0.4, amp: 0.6, env: Env.swell(0.05, 0.4), filter: { type: 'lp', f: Curve.exp(1600 * vary(r), 300, 0.35) } });
      s.tone({ dur: 0.35, f: Curve.exp(620, 300, 0.3), amp: 0.15, env: Env.perc(0.01, 0.12) });
    }
  },
  cone: {
    dur: 1, vol: 0.75, gap: 0.1, voices: 2, variants: 2,
    make(s, r) {
      s.noise({ dur: 0.9, amp: 0.8, env: Env.swell(0.06, 0.9), filter: { type: 'bp', f: Curve.exp(6500, 2400, 0.7), q: 0.9 } });
      s.noise({ dur: 0.6, amp: 0.4, env: Env.perc(0.01, 0.2), filter: { type: 'lp', f: 600 } });
      for (const f of [2400, 3100, 3700, 4500]) {
        s.tone({ dur: 0.8, f: f * vary(r, 0.04), amp: (t) => 0.1 * (0.5 + 0.5 * Math.sin(t * (30 + f / 200))), env: Env.perc(0.02, 0.3) });
      }
      s.crackle({ dur: 0.7, density: 120, amp: 0.3, env: Env.perc(0.05, 0.25), filter: { type: 'hp', f: 4000 } });
    }
  },
  thunder: {
    dur: 1.3, vol: 0.9, gap: 0.1, voices: 2, variants: 2, reverb: 0.5,
    make(s) {
      s.tone({ dur: 1.1, f: Curve.exp(62, 28, 0.5), amp: 1, env: Env.perc(0.002, 0.35) });
      s.noise({ dur: 1.2, amp: 1, env: Env.perc(0.001, 0.4), filter: { type: 'lp', f: Curve.exp(4500, 160, 0.7) } });
      s.noise({ dur: 1.2, amp: 0.7, color: 'brown', env: Env.perc(0.04, 0.5), filter: { type: 'lp', f: 220 } });
      s.drive(2);
    }
  },
  meteorFall: {
    dur: 0.55, vol: 0.4, gap: 0.08, voices: 4, variants: 3,
    make(s, r) {
      const p = vary(r, 0.1);
      const env = Env.rise(0.52, 1.5);
      s.tone({ f: Curve.exp(2300 * p, 650 * p, 0.52), amp: 0.4, env });
      s.noise({ amp: 0.7, env, filter: { type: 'bp', f: Curve.exp(3000 * p, 900 * p, 0.52), q: 3 } });
    }
  },
  meteorImpact: {
    dur: 1.5, vol: 0.9, gap: 0.07, voices: 4, variants: 3, reverb: 0.4,
    make(s) {
      blast(s, { deep: 1.4, length: 1.4, crackle: 110 });
    }
  },
  heal: {
    dur: 1.1, vol: 0.5, gap: 0.12, voices: 3, variants: 2,
    make(s, r) {
      const p = vary(r, 0.02);
      for (const [i, f] of [523, 659, 784, 1047].entries()) {
        s.bell({ at: i * 0.07, f: f * p, amp: 0.45, partials: CHIME });
      }
      s.noise({ dur: 0.9, amp: 0.08, env: Env.swell(0.3, 0.9), filter: { type: 'hp', f: 6000 } });
    }
  },
  polymorph: {
    dur: 0.8, vol: 0.55, gap: 0.15, voices: 2, variants: 3,
    make(s, r) {
      const p = vary(r, 0.1);
      s.noise({ dur: 0.2, amp: 0.6, env: Env.perc(0.002, 0.06), filter: { type: 'bp', f: 1500, q: 1 } });
      s.tone({ dur: 0.15, f: Curve.exp(700, 1800, 0.1), amp: 0.25, env: Env.perc(0.002, 0.05) });
      // and the bleat of the sheep
      voice(s, {
        at: 0.12, dur: 0.6, f: Curve.vibrato(Curve.exp(390 * p, 330 * p, 0.55), 26, 0.05), amp: (t) => 0.6 * (0.7 + 0.3 * Math.sin(t * 160)),
        env: Env.ar(0.03, 0.25, 0.6), vowel: 'aa'
      });
    }
  },
  weapon: {
    dur: 0.9, vol: 0.55, gap: 0.2, voices: 2, variants: 2,
    make(s, r) {
      const p = vary(r, 0.04);
      s.noise({ dur: 0.4, amp: 0.5, env: Env.perc(0.002, 0.2), filter: [{ type: 'hp', f: 4000 }, { type: 'bp', f: Curve.exp(5000, 8000, 0.3), q: 2 }] });
      s.bell({ f: 1250 * p, amp: 0.4, partials: [[1, 1, 0.6], [2.4, 0.5, 0.35], [3.9, 0.3, 0.2], [5.3, 0.2, 0.12]] });
      s.tone({ dur: 0.85, f: Curve.vibrato(880 * p, 5, 0.01), amp: 0.15, env: Env.swell(0.3, 0.85) });
    }
  },
  bladeStrike: {
    dur: 0.35, vol: 0.45, gap: 0.08, voices: 3, variants: 3,
    make(s, r) {
      whoosh(s, { dur: 0.15, from: 600, to: 3500, amp: 0.6, peak: 0.6, q: 1.5 });
      s.bell({ at: 0.1, f: 1600 * vary(r), amp: 0.35, partials: METAL.map(([a, b, c]) => [a, b, c * 0.4]) });
      thud(s, { at: 0.1, f: 150, to: 70, decay: 0.04, amp: 0.4 });
    }
  },
  sleep: {
    dur: 1.3, vol: 0.45, gap: 0.2, voices: 2, variants: 2, reverb: 0.4,
    make(s, r) {
      const p = vary(r, 0.02);
      for (const [i, f] of [1047, 880, 784, 659].entries()) {
        s.bell({ at: i * 0.12, f: f * p, amp: 0.35, partials: CHIME, attack: 0.01 });
      }
      s.tone({ dur: 1.2, f: 330 * p, amp: 0.2, env: Env.swell(0.35, 1.2) });
      s.tone({ dur: 1.2, f: 392 * p, amp: 0.16, env: Env.swell(0.45, 1.2) });
      s.noise({ dur: 1.1, amp: 0.1, env: Env.swell(0.4, 1.1), filter: { type: 'lp', f: 1200 } });
    }
  },
  agathys: {
    dur: 0.9, vol: 0.5, gap: 0.2, voices: 2, variants: 2,
    make(s, r) {
      for (let i = 0; i < 12; i++) {
        s.bell({ at: r() * 0.45, f: 2500 + r() * 3500, amp: 0.2, partials: [[1, 1, 0.08], [2.3, 0.4, 0.04]] });
      }
      s.crackle({ dur: 0.6, density: 110, amp: 0.4, env: Env.perc(0.02, 0.2), filter: { type: 'hp', f: 2500 } });
      s.noise({ dur: 0.6, amp: 0.18, env: Env.swell(0.15, 0.6), filter: { type: 'bp', f: 4000, q: 1.5 } });
    }
  },
  shatter: {
    dur: 0.6, vol: 0.5, gap: 0.12, voices: 2, variants: 2,
    make(s, r) {
      s.noise({ dur: 0.3, amp: 0.7, env: Env.perc(0.001, 0.1), filter: { type: 'hp', f: 3000 } });
      for (let i = 0; i < 9; i++) {
        s.bell({ at: 0.01 + r() * 0.25, f: 2000 + r() * 4000, amp: 0.2, partials: [[1, 1, 0.07], [2.6, 0.4, 0.03]] });
      }
    }
  },
  curse: {
    dur: 1, vol: 0.5, gap: 0.2, voices: 2, variants: 2, reverb: 0.4,
    make(s, r) {
      const p = vary(r, 0.03);
      const env = Env.swell(0.12, 0.95);
      for (const f of [110, 116.5, 155.6]) {
        s.tone({ f: Curve.exp(f * p, f * p * 0.9, 0.9), type: 'saw', amp: 0.3, env, filter: { type: 'lp', f: 700 } });
      }
      s.noise({ amp: (t) => 0.15 * (0.5 + 0.5 * Math.sin(t * 36)), env, filter: { type: 'bp', f: 1500, q: 6 } });
      s.tone({ f: 55 * p, amp: 0.3, env });
    }
  },
  sphere: {
    dur: 0.7, vol: 0.55, gap: 0.15, voices: 2, variants: 2,
    make(s) {
      whoosh(s, { dur: 0.6, from: 200, to: 2200, amp: 0.8, peak: 0.25, q: 0.9 });
      thud(s, { at: 0.05, f: 110, to: 50, decay: 0.08, amp: 0.5, bright: 600 });
      s.crackle({ dur: 0.6, density: 120, amp: 0.4, env: Env.swell(0.15, 0.6) });
    }
  },
  counter: {
    dur: 0.75, vol: 0.6, gap: 0.2, voices: 2, variants: 2,
    make(s, r) {
      const p = vary(r, 0.04);
      s.noise({ dur: 0.36, amp: 0.8, env: Env.rise(0.36, 2), filter: { type: 'bp', f: Curve.exp(3200, 400, 0.36), q: 1.5 } });
      s.tone({ dur: 0.4, f: Curve.exp(900 * p, 220 * p, 0.36), amp: 0.3, env: Env.rise(0.36, 1.5) });
      s.bell({ at: 0.34, f: 660 * p, amp: 0.3, partials: CHIME });
      thud(s, { at: 0.34, f: 100, to: 45, decay: 0.08, amp: 0.5, bright: 500 });
    }
  },
  unmake: {
    dur: 0.2, vol: 0.35, gap: 0.04, voices: 4, variants: 3,
    make(s, r) {
      s.noise({ dur: 0.1, amp: 0.6, env: Env.perc(0.001, 0.03), filter: { type: 'hp', f: 2000 } });
      s.tone({ dur: 0.12, f: Curve.exp(1300 * vary(r), 380, 0.08), amp: 0.35, env: Env.perc(0.001, 0.04) });
    }
  },
  swap: {
    dur: 0.55, vol: 0.55, gap: 0.15, voices: 2, variants: 2,
    make(s, r) {
      const p = vary(r, 0.04);
      zip(s, { dur: 0.18, from: 400 * p, to: 1700 * p, amp: 0.5 });
      zip(s, { at: 0.2, dur: 0.2, from: 1700 * p, to: 380 * p, amp: 0.5 });
      s.tone({ dur: 0.45, f: Curve.path([[0, 410 * p], [0.18, 1720 * p], [0.4, 390 * p]]), amp: 0.15, env: Env.swell(0.2, 0.45) });
    }
  },
  phantasm: {
    dur: 1.2, vol: 0.55, gap: 0.2, voices: 2, variants: 2, reverb: 0.5,
    make(s, r) {
      const p = vary(r, 0.05);
      const env = Env.swell(0.3, 1.15);
      const wail = Curve.vibrato(Curve.path([[0, 480 * p], [0.35, 920 * p], [1.1, 380 * p]]), 6, 0.03);
      s.tone({ f: wail, amp: 0.4, env });
      s.tone({ f: (t) => wail(t) * 1.5, amp: 0.12, env });
      s.noise({ amp: 0.15, env, filter: { type: 'bp', f: 1200, q: 8 } });
      s.tone({ f: 55, type: 'saw', amp: 0.2, env, filter: { type: 'lp', f: 220 } });
    }
  },
  confusion: {
    dur: 1, vol: 0.5, gap: 0.2, voices: 2, variants: 2,
    make(s, r) {
      const env = Env.swell(0.2, 0.95);
      for (const [i, f] of [400, 505, 630].entries()) {
        s.tone({ f: Curve.vibrato(f * vary(r, 0.04), 6 + i * 1.7, 0.15, i * 2), amp: 0.25, env });
      }
      s.bell({ at: 0.05, f: Curve.exp(300, 700, 0.3), amp: 0.25, partials: [[1, 1, 0.3]] });
    }
  },
  gravity: {
    dur: 1, vol: 0.6, gap: 0.2, voices: 2, variants: 2,
    make(s, r) {
      const p = vary(r, 0.04);
      whoosh(s, { dur: 0.9, from: 180, to: 3200, amp: 0.8, peak: 0.6, q: 1.6 });
      s.tone({ dur: 0.9, f: Curve.exp(100 * p, 640 * p, 0.8), amp: 0.3, env: Env.swell(0.6, 0.9) });
      s.tone({ dur: 0.9, f: Curve.exp(150 * p, 960 * p, 0.8), type: 'tri', amp: 0.15, env: Env.swell(0.6, 0.9) });
    }
  },
  crash: {
    dur: 0.6, vol: 0.55, gap: 0.06, voices: 4, variants: 3,
    make(s, r) {
      thud(s, { f: 95 * vary(r), to: 38, decay: 0.14, amp: 1, bright: 1400 });
      s.crackle({ dur: 0.4, density: 90, amp: 0.4, env: Env.perc(0.005, 0.12), filter: { type: 'bp', f: 1500, q: 0.8 } });
    }
  },

  // ---------------------------------------------------------- foes' missiles

  throw: {
    dur: 0.3, vol: 0.35, gap: 0.06, voices: 4, variants: 3,
    make(s, r) {
      const p = vary(r, 0.15);
      whoosh(s, { dur: 0.25, from: 380 * p, to: 1300 * p, amp: 0.7, peak: 0.35, q: 1.2 });
    }
  },
  arrow: {
    dur: 0.4, vol: 0.4, gap: 0.05, voices: 4, variants: 3,
    make(s, r) {
      s.pluck({ dur: 0.35, f: 140 * vary(r, 0.1), amp: 0.6, damp: 0.994, bright: 0.45 });
      s.noise({ dur: 0.04, amp: 0.35, env: Env.perc(0.001, 0.01), filter: { type: 'bp', f: 2200, q: 1 } });
      whoosh(s, { at: 0.04, dur: 0.3, from: 1600, to: 700, amp: 0.25, peak: 0.3, q: 2 });
    }
  },
  quarrel: {
    dur: 0.35, vol: 0.42, gap: 0.05, voices: 4, variants: 3,
    make(s, r) {
      thud(s, { f: 220, to: 90, decay: 0.03, amp: 0.7, bright: 2500 });
      s.pluck({ dur: 0.25, f: 220 * vary(r, 0.08), amp: 0.5, damp: 0.985, bright: 0.5 });
      whoosh(s, { at: 0.03, dur: 0.25, from: 1800, to: 800, amp: 0.2, peak: 0.3, q: 2 });
    }
  },
  hexbolt: {
    dur: 0.35, vol: 0.42, gap: 0.06, voices: 4, variants: 3,
    make(s, r) {
      const p = vary(r, 0.15);
      s.tone({ dur: 0.3, f: Curve.exp(900 * p, 300 * p, 0.2), type: 'tri', amp: 0.5, env: Env.perc(0.003, 0.08) });
      s.tone({ dur: 0.3, f: Curve.exp(450 * p, 150 * p, 0.2), type: 'square', amp: 0.2, env: Env.perc(0.003, 0.08), filter: { type: 'lp', f: 1500 } });
      s.noise({ dur: 0.15, amp: 0.25, env: Env.perc(0.002, 0.05), filter: { type: 'bp', f: 1000 * p, q: 2 } });
    }
  },
  shadowbolt: {
    dur: 0.7, vol: 0.65, gap: 0.2, voices: 2, variants: 2, reverb: 0.4,
    make(s, r) {
      const p = vary(r, 0.05);
      whoosh(s, { dur: 0.6, from: 180, to: 650, amp: 0.8, peak: 0.3, q: 2 });
      s.tone({ dur: 0.6, f: 80 * p, type: 'saw', amp: 0.35, env: Env.perc(0.01, 0.25), filter: { type: 'lp', f: 320 } });
      s.tone({ dur: 0.5, f: Curve.exp(170 * p, 60 * p, 0.4), amp: 0.4, env: Env.perc(0.005, 0.2) });
    }
  },
  iceshard: {
    dur: 0.35, vol: 0.4, gap: 0.05, voices: 4, variants: 3,
    make(s, r) {
      s.bell({ f: 3000 * vary(r, 0.1), amp: 0.4, partials: [[1, 1, 0.1], [2.3, 0.4, 0.05]] });
      whoosh(s, { dur: 0.2, from: 6000, to: 3000, amp: 0.4, peak: 0.2, q: 1.5 });
    }
  },
  spit: {
    dur: 0.35, vol: 0.42, gap: 0.05, voices: 4, variants: 3,
    make(s, r) {
      s.noise({ dur: 0.18, amp: 0.8, env: Env.perc(0.002, 0.05), filter: { type: 'bp', f: 1500 * vary(r), q: 2 } });
      s.bubbles({ dur: 0.3, density: 40, amp: 0.4, low: 300, high: 800 });
    }
  },

  // ---------------------------------------------------------- blows and falls

  hit: {
    dur: 0.2, vol: 0.4, gap: 0.04, voices: 5, variants: 4,
    make(s, r) {
      thud(s, { f: 170 * vary(r, 0.15), to: 60, decay: 0.045, amp: 0.8, bright: 1300 });
    }
  },
  boltWall: {
    dur: 0.2, vol: 0.28, gap: 0.04, voices: 4, variants: 3,
    make(s, r) {
      s.noise({ dur: 0.12, amp: 0.6, env: Env.perc(0.001, 0.035), filter: { type: 'bp', f: 1500 * vary(r, 0.2), q: 1.2 } });
      thud(s, { f: 200, to: 90, decay: 0.03, amp: 0.4 });
    }
  },
  swing: {
    dur: 0.25, vol: 0.32, gap: 0.05, voices: 4, variants: 3,
    make(s, r) {
      const p = vary(r, 0.15);
      whoosh(s, { dur: 0.2, from: 280 * p, to: 1500 * p, amp: 0.8, peak: 0.5, q: 1.4 });
    }
  },
  hurt: {
    dur: 0.3, vol: 0.6, gap: 0.08, voices: 2, variants: 4,
    make(s, r) {
      thud(s, { f: 130 * vary(r, 0.1), to: 50, decay: 0.07, amp: 1, bright: 2400 });
      voice(s, { at: 0.005, dur: 0.15, f: Curve.exp(170 * vary(r, 0.08), 115, 0.12), amp: 0.3, env: Env.perc(0.006, 0.05), vowel: 'uh' });
    }
  },
  death: {
    dur: 0.65, vol: 0.5, gap: 0.05, voices: 4, variants: 4,
    make(s, r) {
      const p = vary(r, 0.15);
      voice(s, { dur: 0.35, f: Curve.exp(150 * p, 72 * p, 0.3), amp: 0.6, env: Env.perc(0.012, 0.13), vowel: r() < 0.5 ? 'uh' : 'ah', rough: 0.3 });
      s.noise({ dur: 0.1, amp: 0.3, env: Env.perc(0.001, 0.03), filter: { type: 'bp', f: 1500, q: 1 } });
      thud(s, { at: 0.2, f: 100, to: 42, decay: 0.1, amp: 0.7, bright: 700 });
    }
  },
  deathBig: {
    dur: 1.3, vol: 0.75, gap: 0.2, voices: 2, variants: 2, reverb: 0.4,
    make(s, r) {
      const p = vary(r, 0.08);
      voice(s, { dur: 0.8, f: Curve.exp(110 * p, 48 * p, 0.7), amp: 0.7, env: Env.swell(0.08, 0.8), vowel: 'ah', rough: 0.5 });
      thud(s, { at: 0.45, f: 80, to: 30, decay: 0.2, amp: 1, bright: 900 });
      s.crackle({ at: 0.45, dur: 0.5, density: 60, amp: 0.3, env: Env.perc(0.01, 0.15), filter: { type: 'bp', f: 1200, q: 0.8 } });
      s.drive(1.8);
    }
  },
  enrage: {
    dur: 0.8, vol: 0.55, gap: 0.3, voices: 2, variants: 2,
    make(s, r) {
      voice(s, { dur: 0.75, f: Curve.vibrato(Curve.exp(85 * vary(r, 0.1), 105, 0.3), 23, 0.08), amp: 0.8, env: Env.swell(0.12, 0.75), vowel: 'ah', rough: 0.6 });
      s.drive(3);
    }
  },
  clash: {
    dur: 0.25, vol: 0.32, gap: 0.05, voices: 4, variants: 5,
    make(s, r) {
      s.bell({ f: 1500 + r() * 1600, amp: 0.45, partials: METAL.map(([a, b, c]) => [a, b, c * 0.3]) });
      s.noise({ dur: 0.05, amp: 0.5, env: Env.perc(0.001, 0.012), filter: { type: 'hp', f: 3000 } });
    }
  },

  // ---------------------------------------------------------- dragons

  roar: {
    dur: 2, vol: 0.95, gap: 0.6, voices: 2, variants: 2, reverb: 0.5,
    make(s, r) {
      const p = vary(r, 0.08);
      const env = Env.swell(0.25, 1.9);
      const f = Curve.vibrato(Curve.path([[0, 85 * p], [0.4, 120 * p], [1.9, 66 * p]]), 7, 0.04);
      voice(s, { f, amp: (t) => 0.8 * (0.75 + 0.25 * Math.sin(t * 190)), env, vowel: 'ah', rough: 0.7 });
      voice(s, { f: (t) => f(t) * 1.01, amp: 0.4, env, vowel: 'aa' });
      s.tone({ f: (t) => f(t) / 2, amp: 0.4, env });
      s.noise({ amp: 0.35, env, filter: { type: 'bp', f: 1200, q: 0.8 } });
      s.drive(3);
    }
  },
  bite: {
    dur: 0.35, vol: 0.6, gap: 0.1, voices: 3, variants: 3,
    make(s, r) {
      for (const at of [0, 0.03]) {
        s.noise({ at, dur: 0.04, amp: 0.8, env: Env.perc(0.0005, 0.008), filter: { type: 'bp', f: 2600 * vary(r), q: 1.5 } });
      }
      thud(s, { f: 200, to: 80, decay: 0.05, amp: 0.7 });
      voice(s, { at: 0.02, dur: 0.25, f: 95 * vary(r), amp: 0.4, env: Env.perc(0.01, 0.08), vowel: 'uh', rough: 0.5 });
    }
  },
  breathFire: {
    dur: 1.1, vol: 0.85, gap: 0.3, voices: 3, variants: 2,
    make(s) {
      const env = Env.ar(0.08, 0.35, 1.05);
      s.noise({ amp: 0.9, env, filter: { type: 'bp', f: 600, q: 0.6 } });
      s.noise({ amp: 0.7, color: 'brown', env, filter: { type: 'lp', f: 220 } });
      s.crackle({ density: 160, amp: 0.5, env, filter: { type: 'hp', f: 2500 } });
      s.drive(1.5);
    }
  },
  breathFrost: {
    dur: 1.1, vol: 0.75, gap: 0.3, voices: 3, variants: 2,
    make(s, r) {
      const env = Env.ar(0.08, 0.35, 1.05);
      s.noise({ amp: 0.8, env, filter: [{ type: 'hp', f: 2000 }, { type: 'bp', f: 5000, q: 0.7 }] });
      s.noise({ amp: 0.5, env, filter: { type: 'lp', f: 500 } });
      for (const f of [2600, 3300, 4100]) {
        s.tone({ f: f * vary(r, 0.03), amp: (t) => 0.08 * (0.5 + 0.5 * Math.sin(t * 45)), env });
      }
    }
  },
  breathStorm: {
    dur: 1.1, vol: 0.8, gap: 0.3, voices: 3, variants: 2,
    make(s, r) {
      const env = Env.ar(0.05, 0.3, 1.05);
      s.crackle({ density: 420, amp: 0.8, env, filter: { type: 'hp', f: 2000 } });
      s.tone({ f: Curve.jitter(160, 0.8, 90, r, 1.2), type: 'square', amp: 0.3, env, filter: { type: 'bp', f: 2000, q: 1 } });
      s.noise({ amp: 0.35, env, filter: { type: 'hp', f: 1000 } });
      thud(s, { f: 80, to: 35, decay: 0.15, amp: 0.6, bright: 500 });
    }
  },
  breathGas: {
    dur: 1.1, vol: 0.7, gap: 0.3, voices: 3, variants: 2,
    make(s) {
      const env = Env.ar(0.1, 0.35, 1.05);
      s.noise({ amp: 0.8, env, filter: { type: 'bp', f: 3000, q: 0.5 } });
      s.noise({ amp: 0.4, env, filter: { type: 'lp', f: 600 } });
      s.bubbles({ density: 25, amp: 0.3, env });
    }
  },
  tail: {
    dur: 0.7, vol: 0.65, gap: 0.2, voices: 2, variants: 2,
    make(s) {
      s.noise({ dur: 0.5, amp: 0.8, env: Env.swell(0.22, 0.5), filter: { type: 'bp', f: Curve.path([[0, 150], [0.25, 900], [0.5, 160]]), q: 1.2 } });
      thud(s, { at: 0.3, f: 110, to: 45, decay: 0.1, amp: 0.8, bright: 800 });
    }
  },
  wing: {
    dur: 0.8, vol: 0.7, gap: 0.2, voices: 2, variants: 2, reverb: 0.4,
    make(s) {
      s.noise({ dur: 0.6, amp: 1, env: Env.swell(0.12, 0.6), filter: { type: 'lp', f: Curve.path([[0, 300], [0.12, 900], [0.6, 200]]) } });
      s.tone({ dur: 0.6, f: 52, amp: 0.5, env: Env.swell(0.12, 0.6) });
      s.drive(1.4);
    }
  },
  flaps: {
    dur: 1.2, vol: 0.6, gap: 0.4, voices: 2, variants: 2, reverb: 0.4,
    make(s) {
      for (const [i, at] of [0, 0.35, 0.7].entries()) {
        s.noise({ at, dur: 0.4, amp: 1 - i * 0.2, env: Env.swell(0.1, 0.4), filter: { type: 'lp', f: Curve.path([[0, 300], [0.1, 800], [0.4, 200]]) } });
        s.tone({ at, dur: 0.4, f: 55, amp: 0.4 - i * 0.1, env: Env.swell(0.1, 0.4) });
      }
    }
  },
  land: {
    dur: 0.9, vol: 0.75, gap: 0.2, voices: 2, variants: 2, reverb: 0.4,
    make(s) {
      thud(s, { f: 65, to: 25, decay: 0.28, amp: 1.2, bright: 1000 });
      s.noise({ dur: 0.7, amp: 0.5, color: 'brown', env: Env.perc(0.01, 0.25), filter: { type: 'lp', f: 300 } });
      s.crackle({ dur: 0.6, density: 70, amp: 0.3, env: Env.perc(0.01, 0.2), filter: { type: 'bp', f: 900, q: 0.8 } });
      s.drive(1.6);
    }
  },
  dragonDeath: {
    dur: 2.6, vol: 1, gap: 0.5, voices: 2, variants: 1, reverb: 0.6,
    make(s) {
      const env = Env.swell(0.2, 1.5);
      const f = Curve.vibrato(Curve.path([[0, 110], [0.3, 125], [1.5, 42]]), 6, 0.05);
      voice(s, { f, dur: 1.5, amp: 0.8, env, vowel: 'ah', rough: 0.8 });
      s.tone({ f: (t) => f(t) / 2, dur: 1.5, amp: 0.5, env });
      thud(s, { at: 1.2, f: 60, to: 22, decay: 0.35, amp: 1.2, bright: 900 });
      s.noise({ at: 1.2, dur: 1.2, amp: 0.6, color: 'brown', env: Env.perc(0.02, 0.4), filter: { type: 'lp', f: 300 } });
      s.drive(2.2);
    }
  },

  // ---------------------------------------------------------- loot

  scroll: {
    dur: 0.7, vol: 0.5, gap: 0.1, voices: 2, variants: 2, ui: true,
    make(s) {
      s.noise({ dur: 0.3, amp: 0.5, grain: 70, env: Env.ar(0.01, 0.15, 0.3), filter: { type: 'bp', f: 3200, q: 0.8 } });
      s.bell({ at: 0.15, f: 1319, amp: 0.3, partials: CHIME });
      s.bell({ at: 0.26, f: 1760, amp: 0.3, partials: CHIME });
    }
  },
  potion: {
    dur: 0.8, vol: 0.5, gap: 0.1, voices: 2, variants: 2,
    make(s, r) {
      for (let i = 0; i < 4; i++) {
        const f0 = (230 + r() * 60) * (1 + i * 0.08);
        s.tone({ at: i * 0.11, dur: 0.09, f: Curve.exp(f0, f0 * 2.2, 0.07), amp: 0.5, env: Env.perc(0.004, 0.035) });
      }
      s.noise({ dur: 0.45, amp: 0.15, env: Env.swell(0.1, 0.45), filter: { type: 'lp', f: 500 } });
      s.bell({ at: 0.45, f: 1568, amp: 0.25, partials: CHIME });
    }
  },
  gear: {
    dur: 0.45, vol: 0.5, gap: 0.08, voices: 2, variants: 3, ui: true,
    make(s, r) {
      s.bell({ f: 2200 * vary(r, 0.06), amp: 0.4, partials: [[1, 1, 0.15], [2.4, 0.4, 0.08], [4.1, 0.2, 0.05]] });
      s.bell({ at: 0.07, f: 1800 * vary(r, 0.06), amp: 0.3, partials: [[1, 1, 0.12], [2.4, 0.4, 0.06]] });
      s.noise({ dur: 0.1, amp: 0.3, env: Env.perc(0.002, 0.03), filter: { type: 'lp', f: 900 } });
    }
  },
  gearRare: {
    dur: 1, vol: 0.55, gap: 0.08, voices: 2, variants: 2, ui: true,
    make(s, r) {
      s.bell({ f: 2200 * vary(r, 0.04), amp: 0.4, partials: [[1, 1, 0.15], [2.4, 0.4, 0.08], [4.1, 0.2, 0.05]] });
      for (const [i, f] of [1047, 1319, 1568, 2093].entries()) {
        s.bell({ at: 0.08 + i * 0.07, f, amp: 0.3, partials: CHIME });
      }
      s.noise({ dur: 0.8, amp: 0.08, env: Env.swell(0.3, 0.8), filter: { type: 'hp', f: 7000 } });
    }
  },

  // ---------------------------------------------------------- the descent

  levelUp: {
    dur: 1.8, vol: 0.6, gap: 0.5, voices: 1, variants: 1, ui: true, reverb: 0.3,
    make(s) {
      for (const [i, f] of [392, 523, 659, 784].entries()) {
        brass(s, { at: i * 0.09, dur: 0.2, f, amp: 0.3 });
        s.bell({ at: i * 0.09, f: f * 2, amp: 0.15, partials: CHIME });
      }
      for (const f of [523, 659, 784, 1047]) {
        brass(s, { at: 0.38, dur: 1.3, f, amp: 0.25, attack: 0.04, release: 0.7 });
      }
      s.noise({ at: 0.38, dur: 1.2, amp: 0.05, env: Env.swell(0.3, 1.2), filter: { type: 'hp', f: 7000 } });
    }
  },
  choose: {
    dur: 0.6, vol: 0.45, gap: 0.2, voices: 1, variants: 1, ui: true,
    make(s) {
      s.bell({ f: 784, amp: 0.4, partials: CHIME });
      s.bell({ at: 0.09, f: 1175, amp: 0.4, partials: CHIME });
    }
  },
  stairsOpen: {
    dur: 2.2, vol: 0.6, gap: 1, voices: 1, variants: 1, ui: true, reverb: 0.5,
    make(s) {
      s.noise({ dur: 1.6, amp: 0.7, color: 'brown', grain: 25, env: Env.ar(0.1, 1, 1.6), filter: { type: 'lp', f: 320 } });
      s.bell({ at: 0.3, f: 196, amp: 0.5, partials: BELL.map(([a, b, c]) => [a, b, c * 3.5]) });
      s.bell({ at: 0.3, f: 392, amp: 0.15, partials: CHIME.map(([a, b, c]) => [a, b, c * 2.5]) });
    }
  },
  descend: {
    dur: 1, vol: 0.5, gap: 0.5, voices: 1, variants: 1, ui: true, reverb: 0.4,
    make(s) {
      for (let i = 0; i < 4; i++) {
        thud(s, { at: i * 0.17, f: 110 - i * 8, to: 55, decay: 0.05, amp: 0.8 - i * 0.15, bright: 1500 });
      }
      whoosh(s, { at: 0.2, dur: 0.7, from: 1500, to: 250, amp: 0.3, peak: 0.3, q: 1 });
    }
  },
  trialWin: {
    dur: 2, vol: 0.6, gap: 1, voices: 1, variants: 1, ui: true, reverb: 0.3,
    make(s) {
      brass(s, { at: 0, dur: 0.14, f: 523, amp: 0.3 });
      brass(s, { at: 0.16, dur: 0.14, f: 523, amp: 0.3 });
      brass(s, { at: 0.32, dur: 0.14, f: 523, amp: 0.3 });
      for (const f of [523, 659, 784]) {
        brass(s, { at: 0.5, dur: 0.35, f: f * 1.335, amp: 0.25 });
      }
      for (const f of [523, 659, 784, 1047]) {
        brass(s, { at: 0.9, dur: 1, f, amp: 0.25, attack: 0.04, release: 0.6 });
      }
    }
  },
  trialLose: {
    dur: 2, vol: 0.55, gap: 1, voices: 1, variants: 1, ui: true, reverb: 0.4,
    make(s) {
      brass(s, { at: 0, dur: 0.45, f: 392, amp: 0.3 });
      brass(s, { at: 0.45, dur: 0.45, f: 311, amp: 0.3 });
      for (const f of [262, 311, 392]) {
        brass(s, { at: 0.9, dur: 1, f: f / 2, amp: 0.25, attack: 0.05, release: 0.7 });
      }
    }
  },
  playerDeath: {
    dur: 3, vol: 0.75, gap: 1, voices: 1, variants: 1, ui: true, reverb: 0.6,
    make(s) {
      for (const f of [55, 82.4, 110, 130.8]) {
        s.tone({ f, type: 'saw', amp: 0.3, env: Env.swell(0.08, 2.8), filter: { type: 'lp', f: Curve.exp(1500, 150, 2.5), q: 1.5 } });
      }
      thud(s, { f: 60, to: 25, decay: 0.4, amp: 1, bright: 600 });
      s.bell({ at: 0.05, f: 110, amp: 0.4, partials: BELL.map(([a, b, c]) => [a, b, c * 4]) });
    }
  },
  victory: {
    dur: 3.2, vol: 0.65, gap: 1, voices: 1, variants: 1, ui: true, reverb: 0.4,
    make(s) {
      const notes = [[0, 392], [0.15, 523], [0.3, 659], [0.45, 784], [0.7, 659], [0.85, 784]];
      for (const [at, f] of notes) {
        brass(s, { at, dur: 0.16, f, amp: 0.3 });
      }
      for (const f of [523, 659, 784, 1047, 1319]) {
        brass(s, { at: 1.05, dur: 2, f, amp: 0.2, attack: 0.05, release: 1.2 });
        s.bell({ at: 1.05, f: f * 2, amp: 0.08, partials: CHIME });
      }
      thud(s, { at: 1.05, f: 80, to: 40, decay: 0.3, amp: 0.6, bright: 500 });
    }
  },
  horn: {
    dur: 2.6, vol: 0.75, gap: 2, voices: 1, variants: 1, ui: true, reverb: 0.6,
    make(s) {
      const f = Curve.vibrato(Curve.path([[0, 98], [0.3, 110], [2.4, 108]]), 5, 0.008);
      const env = Env.ar(0.3, 0.6, 2.4);
      s.tone({ f, type: 'saw', amp: 0.5, env, filter: { type: 'lp', f: Curve.path([[0, 250], [0.4, 950], [2.4, 700]]), q: 2 } });
      s.tone({ f: (t) => f(t) * 1.5, type: 'saw', amp: 0.25, env, filter: { type: 'lp', f: 900, q: 1.5 } });
      s.noise({ amp: 0.06, env, filter: { type: 'bp', f: 600, q: 2 } });
      for (const at of [0, 0.5, 1]) {
        thud(s, { at, f: 75, to: 40, decay: 0.15, amp: 0.6, bright: 400 });
      }
    }
  },

  // ---------------------------------------------------------- the interface

  click: {
    dur: 0.08, vol: 0.22, gap: 0.03, voices: 2, variants: 2, ui: true, reverb: 0,
    make(s, r) {
      s.tone({ dur: 0.05, f: 1800 * vary(r, 0.05), amp: 0.6, env: Env.perc(0.0005, 0.01) });
      s.noise({ dur: 0.03, amp: 0.3, env: Env.perc(0.0005, 0.004), filter: { type: 'hp', f: 4000 } });
    }
  },
  open: {
    dur: 0.35, vol: 0.3, gap: 0.08, voices: 1, variants: 2, ui: true, reverb: 0,
    make(s) {
      whoosh(s, { dur: 0.25, from: 1300, to: 3200, amp: 0.6, peak: 0.3, q: 1 });
      thud(s, { at: 0.18, f: 180, to: 110, decay: 0.03, amp: 0.4, bright: 1500 });
    }
  },
  close: {
    dur: 0.3, vol: 0.28, gap: 0.08, voices: 1, variants: 2, ui: true, reverb: 0,
    make(s) {
      whoosh(s, { dur: 0.2, from: 3000, to: 1100, amp: 0.6, peak: 0.3, q: 1 });
      thud(s, { at: 0.12, f: 160, to: 90, decay: 0.03, amp: 0.45, bright: 1200 });
    }
  },

  // ---------------------------------------------------------- lasting zones (loops)

  blizzardLoop: {
    dur: 3, vol: 0.5, voices: 2, variants: 1, loop: true, reverb: 0.3,
    make(s) {
      s.noise({ amp: 0.6, filter: { type: 'bp', f: (t) => 520 + 380 * Math.sin(t * 2.5) + 200 * Math.sin(t * 7), q: 3 } });
      s.noise({ amp: 0.3, filter: { type: 'bp', f: (t) => 1300 + 500 * Math.sin(t * 4.4 + 1), q: 5 } });
      s.noise({ amp: 0.12, filter: { type: 'hp', f: 4500 } });
    }
  },
  meteorRain: {
    dur: 3, vol: 0.55, voices: 2, variants: 1, loop: true, reverb: 0.3,
    make(s) {
      s.noise({ amp: 0.8, color: 'brown', grain: 6, filter: { type: 'lp', f: 180 } });
      s.crackle({ density: 50, amp: 0.4, filter: { type: 'bp', f: 1500, q: 0.7 } });
    }
  },
  fireLoop: {
    dur: 2, vol: 0.35, voices: 2, variants: 1, loop: true,
    make(s) {
      s.noise({ amp: 0.5, filter: { type: 'lp', f: 700 } });
      s.crackle({ density: 70, amp: 0.6, filter: { type: 'hp', f: 2200 } });
    }
  },
  guardiansLoop: {
    dur: 4, vol: 0.35, voices: 2, variants: 1, loop: true, reverb: 0.5,
    make(s, r) {
      for (const f of [220, 277.2, 329.6, 440]) {
        for (const d of [0.996, 1, 1.004]) {
          s.tone({ f: f * d, type: 'saw', amp: 0.12, filter: { type: 'lp', f: (t) => 1300 + 500 * Math.sin(t * 1.57 + r() * 6), q: 1 } });
        }
      }
      s.noise({ amp: 0.05, filter: { type: 'hp', f: 6000 } });
    }
  },
  gasLoop: {
    dur: 3, vol: 0.35, voices: 2, variants: 1, loop: true,
    make(s) {
      s.noise({ amp: 0.4, filter: { type: 'bp', f: 2000, q: 0.7 } });
      s.noise({ amp: 0.3, filter: { type: 'lp', f: 300 } });
      s.bubbles({ density: 10, amp: 0.4, low: 200, high: 500 });
    }
  },
  acidLoop: {
    dur: 2, vol: 0.3, voices: 2, variants: 1, loop: true,
    make(s) {
      s.noise({ amp: 0.4, grain: 30, filter: { type: 'hp', f: 3000 } });
      s.bubbles({ density: 14, amp: 0.4, low: 300, high: 900 });
    }
  },
  gloomLoop: {
    dur: 3, vol: 0.35, voices: 2, variants: 1, loop: true, reverb: 0.4,
    make(s) {
      s.tone({ f: 55, type: 'saw', amp: 0.4, filter: { type: 'lp', f: 300 } });
      s.tone({ f: 58.3, type: 'saw', amp: 0.35, filter: { type: 'lp', f: 300 } });
      s.noise({ amp: 0.2, filter: { type: 'bp', f: 900, q: 3 } });
    }
  },
  maelstromLoop: {
    dur: 3, vol: 0.5, voices: 2, variants: 1, loop: true, reverb: 0.3,
    make(s) {
      s.noise({ amp: 0.7, filter: { type: 'bp', f: (t) => 600 + 320 * Math.sin(t * 3.1), q: 1.5 } });
      s.noise({ amp: 0.5, color: 'brown', filter: { type: 'lp', f: 260 } });
      s.bubbles({ density: 18, amp: 0.3, low: 150, high: 450 });
    }
  },
  sphereLoop: {
    dur: 2, vol: 0.3, voices: 2, variants: 1, loop: true,
    make(s) {
      s.noise({ amp: 0.5, filter: { type: 'lp', f: 600 } });
      s.crackle({ density: 90, amp: 0.5, filter: { type: 'hp', f: 2500 } });
    }
  }
};

// The zones' loops, and what each starts with.
export const ZoneSounds = {
  blizzard: { loop: 'blizzardLoop', start: 'cone' },
  meteors: { loop: 'meteorRain' },
  fire: { loop: 'fireLoop' },
  guardians: { loop: 'guardiansLoop', start: 'image' },
  cloud: { loop: 'gasLoop', start: 'breathGas' },
  acid: { loop: 'acidLoop' },
  gloom: { loop: 'gloomLoop' },
  maelstrom: { loop: 'maelstromLoop' }
};

// What a bolt sounds like leaving its caster (null: nothing), and how much
// faster or slower it plays.
export const BoltSounds = {
  missile: ['missile'],
  fireball: ['fireball'],
  fireball2: ['fireball', 0.8],
  ironshot: ['ironshot'],
  ironshot2: ['ironshot'],
  lightning: ['lightning'],
  chain: null,
  root: ['root'],
  rootchain: null,
  ray: ['ray'],
  stone: ['throw'],
  missile2: ['hexbolt', 0.85],
  arrow: ['arrow'],
  quarrel: ['quarrel'],
  runebolt: ['hexbolt', 0.75],
  sunbolt: ['hexbolt', 1.15],
  moonbolt: ['hexbolt', 1.3],
  iceshard: ['iceshard'],
  stormbolt: ['zap', 0.8],
  acidbolt: ['spit'],
  scorch: ['scorch'],
  shadowbolt: ['shadowbolt']
};

// What a bolt sounds like striking a body (anything not listed: 'hit';
// null: nothing, the bolt's own sound is enough).
export const HitSounds = {
  missile: 'missileHit',
  missile2: 'missileHit',
  fireball: 'explosion',
  fireball2: 'explosion',
  ironshot: 'ironHit',
  ironshot2: 'ironHit',
  lightning: 'zap',
  chain: 'zap',
  stormbolt: 'zap',
  root: 'rootHit',
  rootchain: 'rootHit',
  shadowbolt: 'rootHit',
  scorch: 'fireHit',
  iceshard: 'shatter',
  ray: null
};

export function hitSound(kind) {
  return kind in HitSounds ? HitSounds[kind] : 'hit';
}

// The spells that go off as they are spent (the rest are heard through their
// bolts, zones or arcana casts).
export const SpendSounds = {
  shield: 'shield',
  blink: 'blink',
  timestop: 'timestop',
  fear: 'fear',
  image: 'image',
  invis: 'invis',
  haste: 'haste',
  tele: 'tele'
};

// a dragon's breath by its element
export const BreathSounds = {
  fire: 'breathFire',
  cold: 'breathFrost',
  lightning: 'breathStorm',
  poison: 'breathGas',
  acid: 'breathGas',
  necrotic: 'breathGas',
  weakening: 'breathGas'
};

// ------------------------------------------------------------ rendering

// A sound's takes are seeded by its name, so each starts the same way every
// time the game loads.
function seedOf(name, variant) {
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) {
    h = Math.imul(h ^ name.charCodeAt(i), 16777619);
  }
  return (h + variant * 104729) >>> 0;
}

// One take of a sound as samples at `rate`; a loop comes back ready to
// repeat seamlessly.
export function renderSound(name, variant, rate) {
  const def = Sounds[name];
  const data = render(def.make, def.dur, rate, seedOf(name, variant));
  return def.loop ? loopify(data, rate, Math.min(0.4, def.dur / 4)) : data;
}

// Every take to render, the first take of every sound before any second
// one, so each sound can be heard as early as possible.
export function renderOrder() {
  const order = [];
  const most = Math.max(...Object.values(Sounds).map((d) => d.variants || 1));
  for (let v = 0; v < most; v++) {
    for (const [name, def] of Object.entries(Sounds)) {
      if (v < (def.variants || 1)) {
        order.push([name, v]);
      }
    }
  }
  return order;
}
