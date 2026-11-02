import { Sounds, renderSound, renderOrder } from './sounds.js';
import { setting } from '../core/settings.js';

// The sound effects player. The sounds are synthesised (audio/sounds.js,
// audio/synth.js), rendered once in a worker when the page loads, and played
// with the Web Audio API: placed around the camera (quieter further off,
// panned left or right of the view), echoing in the room, and thinned out
// where many would start at once (a battle's thousands). A browser lets a
// page make sound only after the player has touched it, so nothing plays
// before the first key press, click or tap.

// the rate the sounds are rendered at (the browser resamples them)
const RENDER_RATE = 32000;

// in sim pixels from the camera's focus: full volume within NEAR, nothing
// beyond FAR, at the dungeon's usual zoom (further when the camera pulls
// back, as over a battlefield: what is on screen is heard)
const NEAR = 280;
const FAR = 1500;

// at most this many sounds at once; past it only the louder ones start
const MAX_VOICES = 40;

// how much a world sound echoes, by default, and how big the room's echo is
// in a dungeon and on a battlefield's open grass
const DEFAULT_REVERB = 0.25;
const ROOMS = { dungeon: 1, field: 0.35 };

function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}

class SoundEffects {
  constructor() {
    this.ctx = null;
    // rendered takes: name -> [Float32Array], made into AudioBuffers once
    // there is a context to play them in
    this.raw = new Map();
    this.buffers = new Map();
    this.last = new Map();
    this.playing = new Map();
    this.voices = 0;
    this.loops = new Set();
    this.listener = { x: 0, y: 0, yaw: 0, reach: 1, placed: false };
    this.volume = -1;
    this.hushed = false;
    this.roomKind = 'dungeon';
    this.started = false;
  }

  // Starts rendering and waits for the first touch of the page.
  init() {
    if (this.started || typeof window === 'undefined') {
      return;
    }
    this.started = true;
    this.renderAll();
    const unlock = () => this.unlock();
    for (const type of ['pointerdown', 'keydown', 'touchend']) {
      window.addEventListener(type, unlock, { capture: true, passive: true });
    }
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) {
        return;
      }
      if (document.visibilityState === 'hidden') {
        this.ctx.suspend().catch(() => {});
      } else {
        this.ctx.resume().catch(() => {});
      }
    });
    // every button of the menus and screens clicks
    document.addEventListener('click', (e) => {
      const button = e.target instanceof Element ? e.target.closest('button') : null;
      if (button && !button.disabled) {
        this.ui('click');
      }
    }, true);
  }

  // In a worker where there is one, else a take at a time between frames.
  renderAll() {
    const keep = (name, variant, data) => {
      const takes = this.raw.get(name) || [];
      takes[variant] = data;
      this.raw.set(name, takes);
    };
    let worker = null;
    try {
      worker = new Worker(new URL('./renderWorker.js', import.meta.url), { type: 'module' });
    } catch {
      worker = null;
    }
    if (worker) {
      worker.onmessage = (e) => {
        if (e.data.done) {
          worker.terminate();
        } else {
          keep(e.data.name, e.data.variant, e.data.data);
        }
      };
      worker.onerror = () => {
        worker.terminate();
        this.renderHere(keep);
      };
      worker.postMessage({ rate: RENDER_RATE });
    } else {
      this.renderHere(keep);
    }
  }

  renderHere(keep) {
    const order = renderOrder().filter(([name, v]) => !(this.raw.get(name) || [])[v]);
    const next = () => {
      const job = order.shift();
      if (!job) {
        return;
      }
      keep(job[0], job[1], renderSound(job[0], job[1], RENDER_RATE));
      setTimeout(next, 0);
    };
    next();
  }

  // The first touch: the audio context, the mixer and the room's echo.
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended' && document.visibilityState !== 'hidden') {
        this.ctx.resume().catch(() => {});
      }
      return;
    }
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) {
      return;
    }
    try {
      // an iPhone plays through its silent switch only as 'playback'
      if (navigator.audioSession) {
        navigator.audioSession.type = 'playback';
      }
    } catch {
      // not settable here
    }
    let ctx = null;
    for (const make of [() => new Context({ latencyHint: 'interactive' }), () => new Context()]) {
      try {
        ctx = make();
        break;
      } catch {
        // an older browser: try it plain
      }
    }
    if (!ctx) {
      return;
    }
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 12;
    comp.ratio.value = 4;
    comp.attack.value = 0.003;
    comp.release.value = 0.25;
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.connect(comp);
    // the lasting zones' loops, hushed while the game holds still
    this.loopBus = ctx.createGain();
    this.loopBus.connect(this.master);
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.roomEcho(1.7);
    this.room = ctx.createGain();
    // the room the game was already in when the audio woke
    this.room.gain.value = ROOMS[this.roomKind] === undefined ? ROOMS.dungeon : ROOMS[this.roomKind];
    this.reverb.connect(this.room);
    this.room.connect(this.master);
    this.applyVolume();
    ctx.resume().catch(() => {});
  }

  // An impulse response for the room's echo: a few early reflections, then
  // noise dying away, darker as it goes.
  roomEcho(seconds) {
    const ctx = this.ctx;
    const n = Math.round(seconds * ctx.sampleRate);
    const buffer = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buffer.getChannelData(ch);
      let low = 0;
      for (let i = 0; i < n; i++) {
        const t = i / ctx.sampleRate;
        const white = Math.random() * 2 - 1;
        // the tail loses its highs as it fades
        const dark = Math.min(0.95, t * 1.4);
        low = low * dark + white * (1 - dark);
        d[i] = low * Math.exp(-t * 4.2) * 0.5;
      }
      for (const [at, g] of [[0.011, 0.5], [0.023, 0.35], [0.037, 0.28], [0.052, 0.2]]) {
        const i = Math.round((at + ch * 0.004) * ctx.sampleRate);
        if (i < n) {
          d[i] += g;
        }
      }
    }
    return buffer;
  }

  ready() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  // The volume set on the controls screen (0 is off), heard as a square law
  // so the slider feels even.
  applyVolume() {
    const v = setting('sfxVolume');
    if (v === this.volume || !this.master) {
      return;
    }
    this.volume = v;
    this.master.gain.setTargetAtTime(v * v * 0.9, this.ctx.currentTime, 0.03);
  }

  // A rendered take of `name` as an AudioBuffer, or null while it renders.
  buffer(name) {
    let list = this.buffers.get(name);
    const takes = this.raw.get(name);
    if (!takes) {
      return null;
    }
    if (!list) {
      list = [];
      this.buffers.set(name, list);
    }
    const choices = [];
    for (let v = 0; v < takes.length; v++) {
      if (!takes[v]) {
        continue;
      }
      if (!list[v]) {
        const data = takes[v];
        const buf = this.ctx.createBuffer(1, data.length, RENDER_RATE);
        buf.copyToChannel(data, 0);
        list[v] = buf;
        // the samples now live in the buffer
        takes[v] = true;
      }
      choices.push(list[v]);
    }
    return choices.length ? choices[Math.floor(Math.random() * choices.length)] : null;
  }

  // ----------------------------------------------------------- the world

  // Where the camera looks from: its focus in sim pixels, how far it has
  // turned (renderer.js yaw) and how far back it stands against the
  // dungeon's usual (`reach`, 1 there). Called every frame.
  listen(x, y, yaw, reach = 1) {
    this.listener.x = x;
    this.listener.y = y;
    this.listener.yaw = yaw;
    this.listener.reach = reach;
    this.listener.placed = true;
    if (!this.ctx) {
      return;
    }
    this.applyVolume();
    for (const loop of this.loops) {
      this.placeLoop(loop, false);
    }
  }

  // How loud a sound at (x, y) is heard, and where it sits left to right.
  placement(x, y) {
    const l = this.listener;
    if (x === undefined || !l.placed) {
      return { gain: 1, pan: 0 };
    }
    const dx = x - l.x;
    const dy = y - l.y;
    const d = Math.hypot(dx, dy);
    const near = NEAR * l.reach;
    const far = FAR * l.reach;
    let gain = 1;
    if (d > near) {
      const u = Math.min(1, (d - near) / (far - near));
      gain = (1 - u) * (1 - u);
    }
    // the screen's right, on the ground (renderer.js alignToView)
    const side = dx * Math.cos(l.yaw) - dy * Math.sin(l.yaw);
    return { gain, pan: clamp(side / Math.max(d, 240 * l.reach), -1, 1) * 0.75 };
  }

  // The world's room: a dungeon echoes, a battlefield barely.
  setRoom(kind) {
    this.roomKind = kind;
    if (this.room) {
      this.room.gain.setTargetAtTime(ROOMS[kind] === undefined ? ROOMS.dungeon : ROOMS[kind], this.ctx.currentTime, 0.1);
    }
  }

  // While the game holds still (paused, the inventory open, a level's spell
  // to choose) the zones' loops fall silent.
  hush(on) {
    if (on === this.hushed || !this.loopBus) {
      return;
    }
    this.hushed = on;
    this.loopBus.gain.setTargetAtTime(on ? 0 : 1, this.ctx.currentTime, 0.08);
  }

  // A voice: the take through its gain and pan, into the mix and the echo.
  voice(def, buffer, gain, pan, rate, bus) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate;
    const amp = ctx.createGain();
    amp.gain.value = gain;
    src.connect(amp);
    let out = amp;
    if (ctx.createStereoPanner) {
      const panner = ctx.createStereoPanner();
      panner.pan.value = pan;
      amp.connect(panner);
      out = panner;
    }
    out.connect(bus);
    const echo = def.reverb === undefined ? (def.ui ? 0.1 : DEFAULT_REVERB) : def.reverb;
    let send = null;
    if (echo > 0) {
      send = ctx.createGain();
      send.gain.value = echo;
      out.connect(send);
      send.connect(this.reverb);
    }
    return { src, amp, panner: out === amp ? null : out, send };
  }

  // a voice that ended lets go of its nodes
  release(v) {
    for (const node of [v.src, v.amp, v.panner, v.send]) {
      if (node) {
        node.disconnect();
      }
    }
  }

  // Whether `name` started too lately to start again (its `gap`).
  tooSoon(name, def) {
    const last = this.last.get(name);
    return last !== undefined && this.ctx.currentTime - last < (def.gap === undefined ? 0.03 : def.gap);
  }

  // Plays `name` once. `x`, `y`: where in the world (sim pixels), or
  // nowhere for a sound of the wizard's own or of the interface; `rate`
  // plays it faster or slower; `vol` scales it. Returns whether it played.
  play(name, { x, y, rate = 1, vol = 1 } = {}) {
    if (!this.ready()) {
      return false;
    }
    const def = Sounds[name];
    if (!def || setting('sfxVolume') <= 0) {
      return false;
    }
    this.applyVolume();
    if (this.tooSoon(name, def)) {
      return false;
    }
    const busy = this.playing.get(name) || 0;
    if (busy >= (def.voices || 4)) {
      return false;
    }
    const place = def.ui ? { gain: 1, pan: 0 } : this.placement(x, y);
    const gain = (def.vol === undefined ? 0.6 : def.vol) * vol * place.gain;
    if (gain < 0.01 || (this.voices >= MAX_VOICES && gain < 0.35)) {
      return false;
    }
    const buffer = this.buffer(name);
    if (!buffer) {
      return false;
    }
    // world sounds stray a little in pitch, so repeats never sound alike
    const stray = def.ui ? 1 : 1 + (Math.random() - 0.5) * 0.08;
    const v = this.voice(def, buffer, gain, place.pan, rate * stray, this.master);
    this.last.set(name, this.ctx.currentTime);
    this.playing.set(name, busy + 1);
    this.voices++;
    v.src.onended = () => {
      this.playing.set(name, (this.playing.get(name) || 1) - 1);
      this.voices--;
      this.release(v);
    };
    v.src.start();
    return true;
  }

  // `name` from where `entity` stands.
  at(name, entity, options = {}) {
    // (soldiers call this thousands of times a second: the cheap refusals first)
    if (!entity || !this.ready() || !Sounds[name] || this.tooSoon(name, Sounds[name])) {
      return false;
    }
    const c = entity.center();
    return this.play(name, { ...options, x: c.x, y: c.y });
  }

  // An interface sound, heard the same wherever the camera is.
  ui(name, options) {
    return this.play(name, options);
  }

  // ----------------------------------------------------------- loops

  // A sound that repeats at (x, y) until stopped: returns a handle to move
  // and stop it (a handle that got no voice stays silent, but takes the
  // same calls).
  loop(name, x, y) {
    const handle = { name, x, y, v: null, stopped: false };
    handle.move = (nx, ny) => {
      handle.x = nx;
      handle.y = ny;
    };
    handle.stop = () => this.stopLoop(handle);
    if (!this.ready() || setting('sfxVolume') <= 0) {
      return handle;
    }
    const def = Sounds[name];
    const busy = this.playing.get(name) || 0;
    const buffer = def && busy < (def.voices || 2) ? this.buffer(name) : null;
    if (!buffer) {
      return handle;
    }
    handle.def = def;
    handle.v = this.voice(def, buffer, 0, 0, 1, this.loopBus);
    handle.v.src.loop = true;
    // each loop starts somewhere else in its turn
    handle.v.src.start(this.ctx.currentTime, Math.random() * buffer.duration);
    this.playing.set(name, busy + 1);
    this.voices++;
    this.loops.add(handle);
    this.placeLoop(handle, true);
    return handle;
  }

  placeLoop(handle, fresh) {
    const place = this.placement(handle.x, handle.y);
    const now = this.ctx.currentTime;
    const gain = (handle.def.vol === undefined ? 0.4 : handle.def.vol) * place.gain;
    // a fresh loop fades in; a moving one glides
    handle.v.amp.gain.setTargetAtTime(gain, now, fresh ? 0.12 : 0.05);
    if (handle.v.panner) {
      handle.v.panner.pan.setTargetAtTime(place.pan, now, 0.05);
    }
  }

  stopLoop(handle) {
    if (handle.stopped) {
      return;
    }
    handle.stopped = true;
    if (!handle.v) {
      return;
    }
    this.loops.delete(handle);
    const now = this.ctx.currentTime;
    handle.v.amp.gain.cancelScheduledValues(now);
    handle.v.amp.gain.setTargetAtTime(0, now, 0.12);
    handle.v.src.stop(now + 0.6);
    handle.v.src.onended = () => {
      this.playing.set(handle.name, (this.playing.get(handle.name) || 1) - 1);
      this.voices--;
      this.release(handle.v);
    };
  }

  // every loop, at once (a game closed)
  stopLoops() {
    for (const handle of [...this.loops]) {
      this.stopLoop(handle);
    }
  }
}

export const sfx = new SoundEffects();
