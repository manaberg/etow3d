import { renderSound, renderOrder } from './sounds.js';

// Renders every sound off the main thread (audio/sfx.js), one take at a
// time, and hands each back as soon as it is done.
self.onmessage = (e) => {
  const { rate } = e.data;
  for (const [name, variant] of renderOrder()) {
    const data = renderSound(name, variant, rate);
    self.postMessage({ name, variant, data }, [data.buffer]);
  }
  self.postMessage({ done: true });
};
