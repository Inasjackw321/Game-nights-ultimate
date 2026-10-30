// Chiptune sound effects and an optional music loop, synthesised with the
// Web Audio API (no audio files). Browsers only allow sound after the first
// tap/click, so the context is unlocked on the first pointer event.

const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};

let ctx = null;
let master = null;
let musicBus = null;
let muted = store.get('gn:muted') === '1';
let musicOn = store.get('gn:music') === '1';
let musicTimer = null;

function audio() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);
    musicBus = ctx.createGain();
    musicBus.gain.value = 0.22;
    musicBus.connect(master);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

addEventListener('pointerdown', () => { audio(); if (musicOn) startMusic(); }, { once: true });

export const isMuted = () => muted;
export const isMusicOn = () => musicOn;

export function setMuted(m) {
  muted = m;
  store.set('gn:muted', m ? '1' : '0');
  if (master) master.gain.setTargetAtTime(m ? 0 : 0.5, ctx.currentTime, 0.02);
}

export function setMusic(on) {
  musicOn = on;
  store.set('gn:music', on ? '1' : '0');
  if (on) startMusic(); else stopMusic();
}

// ---- primitives -------------------------------------------------------------

function tone(freq, dur, { type = 'square', vol = 0.18, slide = null, delay = 0, bus = null, attack = 0.005 } = {}) {
  const a = audio();
  if (!a || (muted && bus !== musicBus)) return;
  const t = a.currentTime + delay;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(bus ?? master);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function noise(dur, { vol = 0.2, freq = 2000, q = 1, type = 'bandpass', delay = 0, sweep = null } = {}) {
  const a = audio();
  if (!a || muted) return;
  const t = a.currentTime + delay;
  const len = Math.max(1, Math.floor(a.sampleRate * dur));
  const buf = a.createBuffer(1, len, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + dur);
  f.Q.value = q;
  const g = a.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t);
}

const seq = (notes, step, opts) => notes.forEach((n, i) => n && tone(n, step * 0.95, { ...opts, delay: (opts?.delay ?? 0) + i * step }));

// ---- the sound board -----------------------------------------------------------

export const sfx = {
  click: () => tone(660, 0.04, { vol: 0.08 }),
  lock: () => { tone(523, 0.06, { vol: 0.12 }); tone(784, 0.1, { vol: 0.12, delay: 0.06 }); },
  hop: () => tone(300 + Math.random() * 200, 0.12, { type: 'triangle', vol: 0.12, slide: 900 }),
  join: () => seq([523, 659, 784, 1047], 0.07, { vol: 0.12 }),
  leave: () => seq([784, 523, 392], 0.08, { vol: 0.08, type: 'triangle' }),
  tick: (urgent) => tone(urgent ? 1320 : 990, 0.04, { vol: urgent ? 0.14 : 0.08 }),
  timeUp: () => { tone(220, 0.4, { type: 'sawtooth', vol: 0.14, slide: 110 }); noise(0.3, { freq: 600, vol: 0.12 }); },
  pop: (i = 0) => tone(320 + i * 90, 0.1, { type: 'triangle', vol: 0.16, slide: 640 + i * 140 }),
  bubble: () => tone(500 + Math.random() * 500, 0.08, { type: 'sine', vol: 0.12, slide: 1400 + Math.random() * 600 }),
  ding: () => { tone(1319, 0.3, { type: 'sine', vol: 0.18 }); tone(1760, 0.4, { type: 'sine', vol: 0.12, delay: 0.08 }); },
  buzz: () => tone(150, 0.4, { type: 'sawtooth', vol: 0.14, slide: 90 }),
  wah: () => { [392, 370, 349].forEach((n, i) => tone(n, 0.28, { type: 'sawtooth', vol: 0.1, delay: i * 0.3 })); tone(330, 0.9, { type: 'sawtooth', vol: 0.1, slide: 260, delay: 0.9 }); },
  coin: (delay = 0) => { tone(988, 0.06, { vol: 0.12, delay }); tone(1319, 0.18, { vol: 0.12, delay: delay + 0.06 }); },
  chips: () => { for (let i = 0; i < 5; i++) noise(0.05, { freq: 5000 + Math.random() * 3000, q: 8, vol: 0.12, delay: i * 0.05 }); },
  card: (delay = 0) => noise(0.07, { freq: 3500, q: 0.7, vol: 0.18, delay, type: 'highpass' }),
  dice: () => { for (let i = 0; i < 9; i++) noise(0.04, { freq: 1800 + Math.random() * 2500, q: 6, vol: 0.16, delay: i * 0.05 + Math.random() * 0.03 }); },
  whoosh: () => noise(0.45, { freq: 300, sweep: 4000, q: 1.5, vol: 0.14 }),
  splash: () => { noise(0.35, { freq: 1200, sweep: 300, q: 0.8, vol: 0.18 }); sfx.bubble(); },
  boom: () => { noise(0.7, { type: 'lowpass', freq: 900, sweep: 60, vol: 0.4 }); tone(90, 0.6, { type: 'sine', vol: 0.3, slide: 35 }); },
  horn: () => { tone(440, 0.6, { type: 'sawtooth', vol: 0.12 }); tone(554, 0.6, { type: 'sawtooth', vol: 0.1 }); tone(659, 0.6, { type: 'square', vol: 0.06 }); },
  drumroll: (dur = 1.2) => { for (let t = 0; t < dur; t += 0.045) noise(0.04, { freq: 300, q: 1, vol: 0.06 + (t / dur) * 0.14, delay: t, type: 'lowpass' }); },
  alert: () => seq([880, 0, 880, 1175], 0.08, { vol: 0.14 }),
  start: () => { seq([440, 0, 440, 0, 880], 0.16, { vol: 0.16 }); sfx.whoosh(); },
  fanfare: () => {
    seq([523, 659, 784, 1047, 0, 784, 1047], 0.09, { vol: 0.14 });
    seq([262, 0, 392, 0, 523, 0, 523], 0.09, { vol: 0.1, type: 'triangle' });
  },
  deepcut: () => {
    sfx.boom();
    seq([784, 988, 1175, 1568, 1175, 1568, 2093], 0.07, { vol: 0.14, delay: 0.1 });
  },
  victory: () => {
    const m = [523, 523, 523, 659, 0, 587, 659, 0, 784, 0, 1047];
    seq(m, 0.11, { vol: 0.15 });
    seq([131, 0, 196, 0, 165, 0, 196, 0, 262, 0, 262], 0.11, { vol: 0.12, type: 'triangle' });
  },
  chomp: () => { tone(200, 0.06, { vol: 0.12, slide: 80 }); tone(180, 0.06, { vol: 0.12, slide: 70, delay: 0.1 }); },
  react: (i = 0) => tone([660, 784, 880, 988, 1175, 523][i % 6], 0.08, { type: 'triangle', vol: 0.1, slide: 1500 }),
};

// ---- a tiny bubbly music loop (off by default) ---------------------------------

const BPM = 112;
const SCALE = [0, 3, 5, 7, 10]; // minor pentatonic
const ROOTS = [220, 174.61, 196, 164.81]; // A F G E
let step = 0;

function startMusic() {
  const a = audio();
  if (!a || musicTimer) return;
  const s16 = 60 / BPM / 4;
  musicTimer = setInterval(() => {
    const bar = Math.floor(step / 16) % ROOTS.length;
    const root = ROOTS[bar];
    const i = step % 16;
    if (i % 4 === 0) tone(root / 2, s16 * 3, { type: 'triangle', vol: 0.5, bus: musicBus });
    if (i % 2 === 0) {
      const deg = SCALE[(i / 2 + bar * 2 + (i > 8 ? 2 : 0)) % SCALE.length];
      tone(root * 2 * 2 ** (deg / 12), s16 * 1.4, { type: 'square', vol: 0.16, bus: musicBus });
    }
    if (i === 6 || i === 14) tone(root * 4 * 2 ** (SCALE[(bar + i) % 5] / 12), s16, { type: 'sine', vol: 0.12, bus: musicBus });
    step += 1;
  }, s16 * 1000);
}

function stopMusic() {
  clearInterval(musicTimer);
  musicTimer = null;
}
