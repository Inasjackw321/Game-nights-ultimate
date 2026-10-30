// Visual effects: pixel particles, screen shake, floating score pops, splash
// banners and creature/host reactions. All purely cosmetic.

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const COLORS = ['#ffe066', '#ff6fa5', '#5ff0a8', '#6cc4ff', '#b38cff', '#ffa24a', '#ffffff'];

// ---- particle canvas -------------------------------------------------------

const canvas = document.createElement('canvas');
canvas.className = 'fx-canvas';
document.body.append(canvas);
const g = canvas.getContext('2d');
let particles = [];
let running = false;

function resize() {
  canvas.width = Math.ceil(innerWidth / 3);
  canvas.height = Math.ceil(innerHeight / 3);
}
resize();
addEventListener('resize', resize);

function loop() {
  g.clearRect(0, 0, canvas.width, canvas.height);
  particles = particles.filter((p) => p.life > 0);
  for (const p of particles) {
    p.vy += p.gravity;
    p.vx *= p.drag;
    p.vy *= p.drag;
    p.x += p.vx;
    p.y += p.vy;
    p.life -= 1;
    if (p.kind === 'bubble') p.x += Math.sin((p.life + p.seed) / 6) * 0.3;
    g.globalAlpha = Math.min(1, p.life / 20);
    g.fillStyle = p.color;
    const s = p.size;
    if (p.kind === 'bubble') {
      g.fillRect(p.x - s, p.y, 1, s); g.fillRect(p.x + s - 1, p.y, 1, s);
      g.fillRect(p.x, p.y - s, s, 1); g.fillRect(p.x, p.y + s - 1, s, 1);
    } else {
      g.fillRect(Math.round(p.x), Math.round(p.y), s, p.flat ? Math.max(1, s - 1) : s);
    }
  }
  g.globalAlpha = 1;
  if (particles.length) requestAnimationFrame(loop);
  else running = false;
}

function spawn(list) {
  if (reduced) list = list.slice(0, Math.ceil(list.length / 6));
  particles.push(...list);
  if (particles.length > 1400) particles.splice(0, particles.length - 1400);
  if (!running) { running = true; requestAnimationFrame(loop); }
}

// Screen pixels -> canvas pixels (canvas is drawn at 1/3 scale, upscaled).
const cx = (x) => x / 3;

export function burst(x, y, { count = 40, colors = COLORS, speed = 3, gravity = 0.08, life = 70, size = 2, kind = 'confetti', spread = Math.PI * 2, angle = -Math.PI / 2 } = {}) {
  spawn(Array.from({ length: count }, () => {
    const a = angle + (Math.random() - 0.5) * spread;
    const v = speed * (0.4 + Math.random());
    return {
      x: cx(x), y: cx(y), vx: Math.cos(a) * v, vy: Math.sin(a) * v,
      gravity: kind === 'bubble' ? -0.03 : gravity, drag: kind === 'bubble' ? 0.97 : 0.985,
      life: life * (0.6 + Math.random() * 0.6), size: size + (Math.random() < 0.3 ? 1 : 0),
      color: colors[(Math.random() * colors.length) | 0], kind, flat: Math.random() < 0.5, seed: Math.random() * 100,
    };
  }));
}

export function confetti(intensity = 1) {
  for (let i = 0; i < 3; i++) {
    setTimeout(() => {
      burst(innerWidth * (0.2 + 0.3 * i), innerHeight * 0.35, { count: 70 * intensity, speed: 4.5, spread: Math.PI * 1.2, life: 110 });
    }, i * 140);
  }
}

export function fireworks(seconds = 3) {
  const end = Date.now() + seconds * 1000;
  const fire = () => {
    if (Date.now() > end) return;
    const x = innerWidth * (0.15 + Math.random() * 0.7);
    const y = innerHeight * (0.15 + Math.random() * 0.35);
    const c = COLORS[(Math.random() * COLORS.length) | 0];
    burst(x, y, { count: 60, colors: [c, '#ffffff', c], speed: 3.4, gravity: 0.05, life: 80, size: 2 });
    setTimeout(fire, 220 + Math.random() * 260);
  };
  fire();
}

export function bubbles(x, y, count = 14) {
  burst(x, y, { count, kind: 'bubble', colors: ['rgba(200,235,255,0.9)'], speed: 1.2, life: 90, size: 3, spread: Math.PI, angle: -Math.PI / 2 });
}

// ---- screen shake & flash ------------------------------------------------------

export function shake(strength = 1) {
  if (reduced) return;
  const main = document.getElementById('main');
  main.style.setProperty('--shake', `${4 * strength}px`);
  main.classList.remove('shake');
  void main.offsetWidth;
  main.classList.add('shake');
}

export function flash(color = '#ffffff') {
  const el = document.createElement('div');
  el.className = 'fx-flash';
  el.style.background = color;
  document.body.append(el);
  setTimeout(() => el.remove(), 450);
}

// ---- text: banners & floating numbers -------------------------------------------

export function banner(text, { color = 'var(--yellow)', sub = '', big = false } = {}) {
  const el = document.createElement('div');
  el.className = `fx-banner ${big ? 'big' : ''}`;
  el.innerHTML = `<b style="color:${color}">${escapeHtml(text)}</b>${sub ? `<span>${escapeHtml(sub)}</span>` : ''}`;
  document.body.append(el);
  setTimeout(() => el.remove(), 1700);
}

export function floatText(x, y, text, color = 'var(--green)', delay = 0) {
  setTimeout(() => {
    const el = document.createElement('div');
    el.className = 'fx-float';
    el.textContent = text;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.color = color;
    document.body.append(el);
    setTimeout(() => el.remove(), 1400);
  }, delay);
}

export function reaction(x, y, emoji) {
  const el = document.createElement('div');
  el.className = 'fx-react';
  el.textContent = emoji;
  el.style.left = `${x + (Math.random() - 0.5) * 30}px`;
  el.style.top = `${y}px`;
  el.style.setProperty('--sway', `${(Math.random() - 0.5) * 80}px`);
  document.body.append(el);
  setTimeout(() => el.remove(), 2200);
}

// ---- creatures --------------------------------------------------------------------

export function seatEl(id) {
  return document.querySelector(`.seat[data-id="${CSS.escape(id)}"]`);
}

export function seatPoint(id) {
  const el = seatEl(id)?.querySelector('.creature');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

export function seatAnim(id, name) {
  const el = seatEl(id)?.querySelector('.creature');
  if (!el) return;
  el.classList.remove('hop', 'spin', 'wobble', 'arrive', 'squash');
  void el.offsetWidth;
  el.classList.add(name);
  setTimeout(() => el.classList.remove(name), 900);
}

export function hostAnim(name) {
  const el = document.getElementById('hostFish');
  if (!el) return;
  el.classList.remove('chomp', 'spin', 'wobble', 'jump');
  void el.offsetWidth;
  el.classList.add(name);
  setTimeout(() => el.classList.remove(name), 1000);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
