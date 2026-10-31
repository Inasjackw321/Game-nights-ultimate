// The Reef Sketch canvas. The artist's pen strokes are drawn locally straight
// away and streamed to the room in small batches; everyone else replays them as
// they arrive. Coordinates are 0–1000 on both axes so any screen size works.

export const PALETTE = ['#0a1424', '#ffffff', '#ff5c6c', '#ffa24a', '#ffe066', '#5ff0a8', '#3fae6a', '#6cc4ff', '#5b7cff', '#b38cff', '#ff6fa5', '#8b5a2b'];
export const SIZES = [1, 2, 3, 4];
const WIDTH_PX = { 1: 3, 2: 7, 3: 14, 4: 30 };
const W = 800;
const H = 600;
const FLUSH_MS = 40;

let send = () => {};
let strokes = [];
let version = -1;
let canvas = null;
let g = null;
let view = null;
let tool = { c: 0, w: 2 };
let active = null; // stroke being drawn by me
let pending = [];
let flushTimer = null;

export const currentTool = () => tool;

export function setup(sendFn) {
  send = sendFn;
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ink]');
    if (!b) return;
    const [kind, val] = b.dataset.ink.split(':');
    if (kind === 'color') tool = { ...tool, c: Number(val) };
    if (kind === 'size') tool = { ...tool, w: Number(val) };
    if (kind === 'eraser') tool = { ...tool, c: 1 };
    if (kind === 'undo') { strokes.pop(); redraw(); send({ type: 'ink', op: { k: 'u' } }); }
    if (kind === 'clear') { strokes = []; redraw(); send({ type: 'ink', op: { k: 'c' } }); }
    document.querySelectorAll('[data-ink^="color"],[data-ink^="size"],[data-ink="eraser"]').forEach((el) => {
      const [k, v] = el.dataset.ink.split(':');
      el.classList.toggle('on', (k === 'color' && Number(v) === tool.c) || (k === 'size' && Number(v) === tool.w) || (k === 'eraser' && tool.c === 1));
    });
  });
}

// Ink from the server: one op from the artist, or a full snapshot.
export function onInk(msg) {
  if (msg.v !== version) {
    if (!msg.full) return; // stale op from a previous turn
    version = msg.v;
  }
  if (msg.full) { strokes = msg.full.map((s) => ({ ...s, p: [...s.p] })); redraw(); return; }
  const op = msg.op;
  if (op.k === 'c') { strokes = []; redraw(); }
  else if (op.k === 'u') { strokes.pop(); redraw(); }
  else if (op.k === 's') { strokes.push({ ...op, p: [...op.p] }); drawStroke(strokes.at(-1)); }
  else if (op.k === 'a') {
    const s = strokes.find((x) => x.id === op.id);
    if (!s) return;
    const from = s.p.length;
    s.p.push(...op.p);
    drawStroke(s, from - 2);
  }
}

// Called every frame while Reef Sketch is on screen: (re)binds the canvas
// after re-renders and starts fresh each turn.
export function mount(v, panel) {
  view = v;
  if (v.inkVersion !== version) {
    version = v.inkVersion;
    strokes = [];
    active = null;
    if (v.stage === 'draw') send({ type: 'inkSync' });
  }
  const el = panel.querySelector('canvas.sketch');
  if (el === canvas) return;
  canvas = el;
  if (!canvas) return;
  g = canvas.getContext('2d');
  redraw();
  canvas.addEventListener('pointerdown', down);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('pointerleave', up);
}

const canDraw = () => view?.isDrawer && view.stage === 'draw';

function point(e) {
  const r = canvas.getBoundingClientRect();
  return [Math.round(((e.clientX - r.left) / r.width) * 1000), Math.round(((e.clientY - r.top) / r.height) * 1000)];
}

function down(e) {
  if (!canDraw()) return;
  e.preventDefault();
  canvas.setPointerCapture(e.pointerId);
  const [x, y] = point(e);
  active = { id: Math.random().toString(36).slice(2, 10), c: tool.c, w: tool.w, p: [x, y] };
  strokes.push(active);
  drawStroke(active);
  send({ type: 'ink', op: { k: 's', id: active.id, c: active.c, w: active.w, p: [x, y] } });
}

function move(e) {
  if (!active || !canDraw()) return;
  const events = e.getCoalescedEvents?.() ?? [e];
  for (const ev of events) {
    const [x, y] = point(ev);
    const lx = active.p.at(-2);
    const ly = active.p.at(-1);
    if (Math.abs(x - lx) + Math.abs(y - ly) < 3) continue;
    active.p.push(x, y);
    pending.push(x, y);
    drawStroke(active, active.p.length - 4);
  }
  if (!flushTimer) flushTimer = setTimeout(flush, FLUSH_MS);
}

function up() {
  if (!active) return;
  flush();
  active = null;
}

function flush() {
  clearTimeout(flushTimer);
  flushTimer = null;
  if (!active || !pending.length) { pending = []; return; }
  for (let i = 0; i < pending.length; i += 400) send({ type: 'ink', op: { k: 'a', id: active.id, p: pending.slice(i, i + 400) } });
  pending = [];
}

function redraw() {
  if (!g) return;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, W, H);
  for (const s of strokes) drawStroke(s);
}

// Draw a stroke, or just its tail from point index `from` (an even index).
function drawStroke(s, from = 0) {
  if (!g || !s.p.length) return;
  g.strokeStyle = PALETTE[s.c] ?? PALETTE[0];
  g.fillStyle = g.strokeStyle;
  g.lineWidth = WIDTH_PX[s.w] ?? 7;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const px = (i) => (s.p[i] / 1000) * W;
  const py = (i) => (s.p[i + 1] / 1000) * H;
  if (s.p.length === 2) {
    g.beginPath();
    g.arc(px(0), py(0), g.lineWidth / 2, 0, Math.PI * 2);
    g.fill();
    return;
  }
  const start = Math.max(0, from);
  g.beginPath();
  g.moveTo(px(start), py(start));
  for (let i = start + 2; i < s.p.length; i += 2) g.lineTo(px(i), py(i));
  g.stroke();
}
