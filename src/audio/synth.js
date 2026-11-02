// Offline sound synthesis. The game's sound effects are not recordings: each
// is a recipe (audio/sounds.js) rendered here, sample by sample, into a
// Float32Array once, which audio/sfx.js then plays as an AudioBuffer. This
// file uses no browser API, so the recipes can be rendered and checked in
// Node as well. Times are in seconds, frequencies in Hz.
//
// Wherever a parameter takes a number it also takes a function of the time
// since its layer began (a pitch sweep, an envelope, a moving cutoff).

const TAU = Math.PI * 2;

// A small seeded random generator (mulberry32), so a sound's variants are
// the same every time the game starts.
export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function value(x, t) {
  return typeof x === 'function' ? x(t) : x;
}

// ------------------------------------------------------------ envelopes

export const Env = {
  // a sharp attack, then an exponential fall (`decay` is the time constant)
  perc(attack, decay) {
    return (t) => (t < attack ? t / attack : Math.exp(-(t - attack) / decay));
  },
  // rises to full over `attack`, holds, and falls to nothing at `end`
  // over `release`
  ar(attack, release, end) {
    return (t) => {
      if (t < attack) {
        return t / attack;
      }
      if (t > end) {
        return 0;
      }
      return Math.min(1, (end - t) / release);
    };
  },
  // a smooth rise to full at `peak`, then a smooth fall to nothing at `end`
  swell(peak, end) {
    return (t) => {
      if (t <= 0 || t >= end) {
        return 0;
      }
      if (t < peak) {
        return Math.sin((t / peak) * Math.PI / 2);
      }
      return Math.cos(((t - peak) / (end - peak)) * Math.PI / 2);
    };
  },
  // grows to full at `end` (a whistle closing in), then stops
  rise(end, power = 2) {
    return (t) => (t >= end ? 0 : Math.pow(t / end, power));
  }
};

// ------------------------------------------------------------ curves

export const Curve = {
  // from a to b over `dur`, exponentially (pitches), then holds b
  exp(a, b, dur) {
    return (t) => a * Math.pow(b / a, Math.min(1, Math.max(0, t / dur)));
  },
  // through the points [time, value], linearly between them
  path(points) {
    return (t) => {
      if (t <= points[0][0]) {
        return points[0][1];
      }
      for (let i = 1; i < points.length; i++) {
        const [t1, v1] = points[i];
        if (t <= t1) {
          const [t0, v0] = points[i - 1];
          return v0 + (v1 - v0) * (t - t0) / (t1 - t0);
        }
      }
      return points[points.length - 1][1];
    };
  },
  // `base` moved up and down by `depth` (a share of it) `rate` times a second
  vibrato(base, rate, depth, phase = 0) {
    return (t) => value(base, t) * (1 + depth * Math.sin(TAU * rate * t + phase));
  },
  // random steps around `base` (within `spread`, a share of it), `rate`
  // steps a second, glided between: a crackling, unsteady pitch
  jitter(base, spread, rate, random, dur = 4) {
    const steps = [];
    for (let i = 0; i <= Math.ceil(dur * rate) + 1; i++) {
      steps.push(1 + (random() * 2 - 1) * spread);
    }
    return (t) => {
      const x = Math.max(0, t * rate);
      const i = Math.floor(x);
      const f = x - i;
      const a = steps[Math.min(i, steps.length - 1)];
      const b = steps[Math.min(i + 1, steps.length - 1)];
      return value(base, t) * (a + (b - a) * f);
    };
  }
};

// ------------------------------------------------------------ filters

// A moving cutoff, resonance, pitch or envelope is read every CONTROL
// samples and glided between: far cheaper than every sample, and no ear can
// tell.
const CONTROL = 16;

// A state variable filter (the trapezoidal kind, stable however fast its
// cutoff moves): low, band or high pass, `q` its resonance. It filters a
// whole layer at once, in place.
class Filter {
  constructor(spec, rate, q) {
    this.type = spec.type;
    this.rate = rate;
    this.cutoff = spec.f;
    this.q = spec.q === undefined ? q : spec.q;
    this.amp = spec.amp === undefined ? 1 : spec.amp;
  }

  // filters `src` into `out` (which may be the same array)
  run(src, out) {
    const rate = this.rate;
    const lp = this.type === 'lp';
    const bp = this.type === 'bp';
    let ic1 = 0;
    let ic2 = 0;
    let a1 = 0;
    let a2 = 0;
    let a3 = 0;
    let k = 1;
    let lastF = -1;
    let lastQ = -1;
    for (let i = 0; i < src.length; i++) {
      if (i % CONTROL === 0) {
        const t = i / rate;
        const f = Math.max(10, Math.min(value(this.cutoff, t), rate * 0.45));
        const q = Math.max(0.1, value(this.q, t));
        if (f !== lastF || q !== lastQ) {
          lastF = f;
          lastQ = q;
          const g = Math.tan(Math.PI * f / rate);
          k = 1 / q;
          a1 = 1 / (1 + g * (g + k));
          a2 = g * a1;
          a3 = g * a2;
        }
      }
      const x = src[i];
      const v3 = x - ic2;
      const v1 = a1 * ic1 + a2 * v3;
      const v2 = ic2 + a2 * ic1 + a3 * v3;
      ic1 = 2 * v1 - ic1;
      ic2 = 2 * v2 - ic2;
      out[i] = lp ? v2 : (bp ? v1 * k : x - k * v1 - v2);
    }
  }
}

// One filter of a layer: { type: 'lp' | 'bp' | 'hp', f, q }, or a list of
// them run one after the other. `q` is the resonance when none is given.
function filterLayer(buf, spec, rate, q = 0.707) {
  if (!spec) {
    return;
  }
  for (const s of Array.isArray(spec) ? spec : [spec]) {
    new Filter(s, rate, q).run(buf, buf);
  }
}

// Several band passes side by side, summed, in place (vowels: a body's
// formants).
function formantLayer(buf, specs, rate) {
  const sum = new Float32Array(buf.length);
  const band = new Float32Array(buf.length);
  for (const s of specs) {
    const f = new Filter(s, rate, 4);
    f.run(buf, band);
    for (let i = 0; i < buf.length; i++) {
      sum[i] += band[i] * f.amp;
    }
  }
  buf.set(sum);
}

// ------------------------------------------------------------ the track

// one turn of a sine, looked up (and interpolated) rather than computed
const SINE_SIZE = 4096;
const SINE = new Float32Array(SINE_SIZE + 1);
for (let i = 0; i <= SINE_SIZE; i++) {
  SINE[i] = Math.sin((i / SINE_SIZE) * TAU);
}

function sine(phase) {
  const x = (phase - Math.floor(phase)) * SINE_SIZE;
  const i = x | 0;
  return SINE[i] + (SINE[i + 1] - SINE[i]) * (x - i);
}

// `x` (a number or a function of time) over `n` samples, read at the
// control rate and glided between
function curve(x, n, rate) {
  const out = new Float32Array(n);
  if (typeof x !== 'function') {
    out.fill(x);
    return out;
  }
  let a = x(0);
  for (let i = 0; i < n; i += CONTROL) {
    const b = x((i + CONTROL) / rate);
    const end = Math.min(n, i + CONTROL);
    for (let j = i; j < end; j++) {
      out[j] = a + (b - a) * (j - i) / CONTROL;
    }
    a = b;
  }
  return out;
}

// a layer's loudness over time: its `amp` times its envelope
function gainCurve(amp, env, n, rate) {
  if (!env) {
    return curve(amp, n, rate);
  }
  return curve((t) => value(amp, t) * env(t), n, rate);
}

// A sound being built: layers are added into `data`. Each layer starts `at`
// seconds in and lasts `dur` (to the end of the track if not given); its
// `env` shapes it, faded in and out over a few milliseconds so it never
// clicks.
export class Track {
  constructor(seconds, rate, random) {
    this.rate = rate;
    this.seconds = seconds;
    this.length = Math.ceil(seconds * rate);
    this.data = new Float32Array(this.length);
    this.random = random;
  }

  // how many samples a layer covers
  span(at, dur) {
    const start = Math.max(0, Math.round(at * this.rate));
    const end = Math.min(this.length, Math.round((at + (dur === undefined ? this.seconds - at : dur)) * this.rate));
    return { start, n: Math.max(0, end - start) };
  }

  // adds a finished layer in at `start`, times its gain, edges faded
  mix(start, buf, gain) {
    const n = buf.length;
    const fade = Math.max(1, Math.round(0.004 * this.rate));
    const d = this.data;
    for (let i = 0; i < n; i++) {
      let edge = 1;
      if (i < fade) {
        edge = i / fade;
      } else if (i > n - fade) {
        edge = (n - i) / fade;
      }
      d[start + i] += buf[i] * gain[i] * edge;
    }
  }

  // An oscillator: `type` sine, tri, saw or square at `f`; `fm` modulates
  // its pitch with a sine at `ratio` times `f`, `index` deep; `filter`,
  // `formants` shape it.
  tone({ at = 0, dur, f, type = 'sine', amp = 1, env, fm, filter, formants }) {
    const rate = this.rate;
    const { start, n } = this.span(at, dur);
    if (!n) {
      return;
    }
    const freq = curve(f, n, rate);
    const index = fm ? curve(fm.index, n, rate) : null;
    const ratio = fm ? fm.ratio : 0;
    const buf = new Float32Array(n);
    const kind = type === 'sine' ? 0 : type === 'tri' ? 1 : type === 'saw' ? 2 : 3;
    let phase = this.random();
    let modPhase = 0;
    for (let i = 0; i < n; i++) {
      let fr = freq[i];
      if (index) {
        modPhase += (fr * ratio) / rate;
        fr += fr * index[i] * sine(modPhase);
      }
      phase += fr / rate;
      const p = phase - Math.floor(phase);
      buf[i] = kind === 0 ? sine(p) : kind === 1 ? (p < 0.5 ? 4 * p - 1 : 3 - 4 * p) : kind === 2 ? 2 * p - 1 : (p < 0.5 ? 1 : -1);
    }
    if (formants) {
      formantLayer(buf, formants, rate);
    }
    filterLayer(buf, filter, rate);
    this.mix(start, buf, gainCurve(amp, env, n, rate));
  }

  // Noise: white or deep ('brown'), through `filter`.
  // `grain`, if set, chops it into random loud and quiet steps that many
  // times a second (rustling paper, a rough growl).
  noise({ at = 0, dur, amp = 1, env, filter, color = 'white', grain }) {
    const rate = this.rate;
    const random = this.random;
    const { start, n } = this.span(at, dur);
    if (!n) {
      return;
    }
    const buf = new Float32Array(n);
    const deep = color === 'brown';
    let brown = 0;
    let level = 1;
    let next = 0;
    for (let i = 0; i < n; i++) {
      let x = random() * 2 - 1;
      if (deep) {
        brown = (brown + x * 0.04) * 0.996;
        x = brown * 3;
      }
      if (grain) {
        if (i >= next) {
          level = 0.15 + random() * 0.85;
          next = i + rate / value(grain, i / rate);
        }
        x *= level;
      }
      buf[i] = x;
    }
    filterLayer(buf, filter, rate);
    this.mix(start, buf, gainCurve(amp, env, n, rate));
  }

  // Crackle: short random clicks, `density` a second on average (fire,
  // sparks, splintering ice), each a burst of noise through `filter`.
  crackle({ at = 0, dur, density = 60, amp = 1, env, filter = { type: 'hp', f: 2000 } }) {
    const rate = this.rate;
    const random = this.random;
    const { start, n } = this.span(at, dur);
    if (!n) {
      return;
    }
    const buf = new Float32Array(n);
    const chance = curve(density, n, rate);
    let left = 0;
    let level = 0;
    let decay = 1;
    for (let i = 0; i < n; i++) {
      if (left <= 0 && random() < chance[i] / rate) {
        left = Math.round((0.0008 + random() * 0.004) * rate);
        level = 0.3 + random() * 0.7;
        decay = Math.exp(-6 / left);
      }
      if (left > 0) {
        buf[i] = (random() * 2 - 1) * level;
        level *= decay;
        left--;
      }
    }
    filterLayer(buf, filter, rate);
    this.mix(start, buf, gainCurve(amp, env, n, rate));
  }

  // A bell or a struck bar: sine partials at `ratios` of `f`, each with its
  // own share of `amp` and its own decay time constant.
  bell({ at = 0, dur, f, amp = 1, partials = [[1, 1, 0.4]], attack = 0.002 }) {
    for (const [ratio, share, decay] of partials) {
      // a partial is silent long before the track ends
      const ring = Math.min(dur === undefined ? Infinity : dur, attack + decay * 8);
      this.tone({ at, dur: ring, f: typeof f === 'function' ? (t) => f(t) * ratio : f * ratio, amp: amp * share, env: Env.perc(attack, decay) });
    }
  }

  // A plucked string (Karplus-Strong): bowstrings, twangs. `damp` near 1
  // rings longer.
  pluck({ at = 0, dur = 0.5, f, amp = 1, damp = 0.995, bright = 0.5 }) {
    const rate = this.rate;
    const { start, n } = this.span(at, dur);
    if (!n) {
      return;
    }
    const period = Math.max(2, Math.round(rate / f));
    const line = new Float32Array(period);
    for (let i = 0; i < period; i++) {
      line[i] = this.random() * 2 - 1;
    }
    const buf = new Float32Array(n);
    let idx = 0;
    for (let i = 0; i < n; i++) {
      const cur = line[idx];
      const next = line[(idx + 1) % period];
      line[idx] = (cur * (1 - bright) + next * bright) * damp;
      idx = (idx + 1) % period;
      buf[i] = cur;
    }
    this.mix(start, buf, curve(amp, n, rate));
  }

  // Bubbles: short rising sine chirps at random, `density` a second.
  bubbles({ at = 0, dur, density = 12, amp = 1, low = 250, high = 700, env }) {
    const rate = this.rate;
    const random = this.random;
    const { start, n } = this.span(at, dur);
    if (!n) {
      return;
    }
    const buf = new Float32Array(n);
    const chance = curve(density, n, rate);
    let left = 0;
    let len = 1;
    let f0 = 300;
    let phase = 0;
    for (let i = 0; i < n; i++) {
      if (left <= 0 && random() < chance[i] / rate) {
        len = Math.round((0.02 + random() * 0.04) * rate);
        left = len;
        f0 = low + random() * (high - low);
        phase = 0;
      }
      if (left > 0) {
        const u = 1 - left / len;
        left--;
        phase += (f0 * (1 + u * 1.5)) / rate;
        buf[i] = sine(phase) * sine(u * 0.5);
      }
    }
    this.mix(start, buf, gainCurve(amp, env, n, rate));
  }

  // ---------------------------------------------------- whole-track effects

  // soft clipping: grit for blasts and growls
  drive(amount) {
    const d = this.data;
    const norm = Math.tanh(amount);
    for (let i = 0; i < d.length; i++) {
      d[i] = Math.tanh(d[i] * amount) / norm;
    }
  }
}

// ------------------------------------------------------------ rendering

// Renders `recipe` (a function of the track) `seconds` long. The result is
// brought to a common loudness (its loudest 50 ms at `LOUDNESS` RMS), soft
// limited so it never clips; how loud each sound plays is then its own
// `vol` (sounds.js).
const LOUDNESS = 0.22;

export function render(recipe, seconds, rate, seed) {
  const random = seeded(seed);
  const track = new Track(seconds, rate, random);
  recipe(track, random);
  const d = track.data;
  const win = Math.max(1, Math.round(0.05 * rate));
  let sum = 0;
  let loudest = 0;
  for (let i = 0; i < d.length; i++) {
    sum += d[i] * d[i];
    if (i >= win) {
      sum -= d[i - win] * d[i - win];
    }
    loudest = Math.max(loudest, sum);
  }
  const rms = Math.sqrt(Math.max(0, loudest) / win);
  const gain = rms > 1e-6 ? LOUDNESS / rms : 0;
  for (let i = 0; i < d.length; i++) {
    const x = d[i] * gain;
    // limit what peaks past 0.9 smoothly towards 1
    d[i] = Math.abs(x) <= 0.9 ? x : Math.sign(x) * (0.9 + 0.1 * Math.tanh((Math.abs(x) - 0.9) / 0.1));
  }
  return d;
}

// Makes the end of a rendered loop flow into its start: the last `fade`
// seconds are folded over the first, and the loop is that much shorter.
export function loopify(data, rate, fade) {
  const n = Math.min(Math.round(fade * rate), Math.floor(data.length / 3));
  const out = data.slice(0, data.length - n);
  for (let i = 0; i < n; i++) {
    const w = i / n;
    // equal power, so the seam is not quieter than the rest
    out[i] = data[i] * Math.sin(w * Math.PI / 2) + data[data.length - n + i] * Math.cos(w * Math.PI / 2);
  }
  // the seam may peak a little higher than the rest
  let peak = 0;
  for (let i = 0; i < n; i++) {
    peak = Math.max(peak, Math.abs(out[i]));
  }
  if (peak > 0.98) {
    for (let i = 0; i < out.length; i++) {
      out[i] *= 0.98 / peak;
    }
  }
  return out;
}
