// A 3D season trophy (Three.js): a lathed metal cup with handles, a star
// emblem and a floating pearl on a two-tier marble base with an engraved
// plate. It spins on its own, can be dragged round, and drops in with a bounce.
import * as THREE from 'three';
import { RoomEnvironment } from './vendor/three/addons/environments/RoomEnvironment.js';

const METALS = {
  1: { name: 'GOLD', color: 0xffc93c, plate: '#e9b949', ink: '#4a3203', glow: '#ffe066' },
  2: { name: 'SILVER', color: 0xd6dee8, plate: '#c7d0db', ink: '#26303c', glow: '#e8f2ff' },
  3: { name: 'BRONZE', color: 0xd4874c, plate: '#c98250', ink: '#3d1d08', glow: '#ffb27a' },
};
const ORDINAL = { 1: '1ST', 2: '2ND', 3: '3RD' };

export function supports3d() {
  try {
    const c = document.createElement('canvas');
    return Boolean(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

// Opens a full-screen viewer. Returns a function that closes it.
export function openTrophy({ place = 1, seasonName = '', playerName = '', title = '', subtitle = '', onClose } = {}) {
  const metal = METALS[place] ?? METALS[1];
  const modal = document.createElement('div');
  modal.className = 'trophy-modal';
  modal.innerHTML = `
    <div class="trophy-card" role="dialog" aria-modal="true" aria-label="${escapeHtml(title || `${metal.name} trophy`)}">
      <div class="trophy-head">
        <span class="eyebrow">${escapeHtml(subtitle || seasonName)}</span>
        <h2 style="color:${metal.glow}">${escapeHtml(title || `${metal.name} TROPHY`)}</h2>
      </div>
      <div class="trophy-stage"></div>
      <p class="tiny muted center">Drag to spin it</p>
      <button class="btn primary wide" type="button" data-close>Nice!</button>
    </div>`;
  document.body.append(modal);
  const stage = modal.querySelector('.trophy-stage');

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch {
    stage.innerHTML = '<p class="note center">Your browser can\'t show 3D right now, but the trophy is yours!</p>';
    return wireClose(modal, () => {}, onClose);
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  stage.append(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
  camera.position.set(0, 1.75, 6.3);
  camera.lookAt(0, 1.42, 0);

  // Warm key light, cool "underwater" rim light from behind.
  const key = new THREE.DirectionalLight(0xfff1d6, 2.2);
  key.position.set(2.5, 4, 3);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x6cc4ff, 2.5);
  rim.position.set(-3, 2, -3);
  scene.add(rim);
  scene.add(new THREE.HemisphereLight(0x9fd8ff, 0x0a1424, 0.6));

  const trophy = buildTrophy(metal, place, seasonName, playerName);
  scene.add(trophy.group);
  scene.add(floorShadow());
  const sparkles = makeSparkles(metal.glow);
  scene.add(sparkles);

  // Drag to spin, with a little inertia; otherwise it turns slowly by itself.
  let spin = 0.6;
  let angle = -0.6;
  let dragging = false;
  let lastX = 0;
  const el = renderer.domElement;
  el.style.touchAction = 'none';
  el.addEventListener('pointerdown', (e) => { dragging = true; lastX = e.clientX; el.setPointerCapture(e.pointerId); });
  el.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    lastX = e.clientX;
    angle += dx * 0.012;
    spin = dx * 0.6;
  });
  const stopDrag = () => { dragging = false; };
  el.addEventListener('pointerup', stopDrag);
  el.addEventListener('pointercancel', stopDrag);

  const resize = () => {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(stage);
  resize();

  const clock = new THREE.Clock();
  let raf = 0;
  const born = performance.now();
  const loop = () => {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = (performance.now() - born) / 1000;
    if (!dragging) {
      spin += (0.6 - spin) * Math.min(1, dt * 1.5);
      angle += spin * dt;
    }
    // Entrance: drop in from above, squash, settle.
    const enter = Math.min(1, t / 0.9);
    const drop = (1 - easeOutBounce(enter)) * 2.2;
    const squash = enter < 1 ? 1 : 1 + Math.sin(Math.min(1, (t - 0.9) / 0.3) * Math.PI) * -0.04;
    trophy.group.position.y = drop;
    trophy.group.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));
    trophy.group.rotation.y = angle + (1 - enter) * 4;
    trophy.pearl.position.y = trophy.pearlY + Math.sin(t * 2.2) * 0.05;
    trophy.pearl.rotation.y = t * 1.5;
    sparkles.rotation.y = -t * 0.15;
    sparkles.material.opacity = 0.55 + Math.sin(t * 3.3) * 0.35;
    renderer.render(scene, camera);
  };
  loop();

  const cleanup = () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    scene.traverse((o) => {
      o.geometry?.dispose();
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of mats) { m.map?.dispose(); m.dispose(); }
    });
    scene.environment?.dispose();
    pmrem.dispose();
    renderer.dispose();
  };
  return wireClose(modal, cleanup, onClose);
}

function wireClose(modal, cleanup, onClose) {
  const close = () => {
    document.removeEventListener('keydown', onKey);
    modal.classList.add('closing');
    setTimeout(() => { cleanup(); modal.remove(); onClose?.(); }, 220);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  modal.addEventListener('click', (e) => { if (e.target === modal || e.target.closest('[data-close]')) close(); });
  modal.querySelector('[data-close]')?.focus();
  return close;
}

// ---- the model ------------------------------------------------------------------

function buildTrophy(metal, place, seasonName, playerName) {
  const group = new THREE.Group();
  const shiny = new THREE.MeshStandardMaterial({ color: metal.color, metalness: 1, roughness: 0.18 });
  const brushed = new THREE.MeshStandardMaterial({ color: metal.color, metalness: 1, roughness: 0.42 });
  const marble = new THREE.MeshStandardMaterial({ color: 0x1b2638, metalness: 0.2, roughness: 0.35 });
  const marbleLight = new THREE.MeshStandardMaterial({ color: 0x2c3c56, metalness: 0.2, roughness: 0.3 });

  // Two-tier base with metal trim.
  const base1 = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.32, 1.5), marble);
  base1.position.y = 0.16;
  const trim = new THREE.Mesh(new THREE.BoxGeometry(1.54, 0.05, 1.54), brushed);
  trim.position.y = 0.335;
  const base2 = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.26, 1.12), marbleLight);
  base2.position.y = 0.49;
  group.add(base1, trim, base2);

  // Engraved plate on the front of the lower tier.
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.22), new THREE.MeshStandardMaterial({
    map: plateTexture(metal, place, seasonName, playerName), metalness: 0.75, roughness: 0.32,
  }));
  plate.position.set(0, 0.16, 0.752);
  group.add(plate);

  // Stem and cup are lathed (spun) profiles: [radius, height] pairs.
  const stem = lathe([[0, 0], [0.34, 0], [0.34, 0.05], [0.24, 0.1], [0.13, 0.22], [0.09, 0.42], [0.09, 0.56], [0.15, 0.62], [0.22, 0.7], [0, 0.7]], shiny);
  stem.position.y = 0.62;
  group.add(stem);

  const cup = lathe([
    [0.12, 0], [0.26, 0.05], [0.4, 0.2], [0.5, 0.45], [0.56, 0.72], [0.6, 0.98], [0.65, 1.06], [0.66, 1.09],
    [0.6, 1.07], [0.55, 0.98], [0.51, 0.74], [0.45, 0.5], [0.35, 0.28], [0.2, 0.14], [0, 0.12],
  ], shiny);
  cup.position.y = 1.3;
  group.add(cup);

  // Handles: half-rings on each side.
  for (const side of [-1, 1]) {
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.05, 16, 40, Math.PI), shiny);
    handle.rotation.z = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    handle.position.set(side * 0.55, 1.95, 0);
    group.add(handle);
  }

  // Star emblem on the front of the cup, with the place number for flair.
  const star = new THREE.Mesh(new THREE.ExtrudeGeometry(starShape(0.17, 0.075), { depth: 0.04, bevelEnabled: true, bevelSize: 0.012, bevelThickness: 0.012, bevelSegments: 2 }), brushed);
  star.position.set(0, 1.88, 0.56);
  star.rotation.x = -0.14;
  group.add(star);

  // A pearl floats above the cup (we are under the sea, after all).
  const pearl = new THREE.Mesh(new THREE.SphereGeometry(0.17, 40, 24), new THREE.MeshPhysicalMaterial({
    color: 0xfff6f0, metalness: 0.1, roughness: 0.15, clearcoat: 1, clearcoatRoughness: 0.08, iridescence: 1, iridescenceIOR: 1.6,
  }));
  const pearlY = 2.72;
  pearl.position.y = pearlY;
  group.add(pearl);

  return { group, pearl, pearlY };
}

function lathe(points, material) {
  const geo = new THREE.LatheGeometry(points.map(([x, y]) => new THREE.Vector2(x, y)), 72);
  const mesh = new THREE.Mesh(geo, material);
  material.side = THREE.DoubleSide;
  return mesh;
}

function starShape(outer, inner) {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? inner : outer;
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) s.moveTo(x, y); else s.lineTo(x, y);
  }
  s.closePath();
  return s;
}

function plateTexture(metal, place, seasonName, playerName) {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 205;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, c.height);
  grad.addColorStop(0, metal.plate);
  grad.addColorStop(0.5, '#ffffff55');
  grad.addColorStop(1, metal.plate);
  g.fillStyle = metal.plate;
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = grad;
  g.globalAlpha = 0.35;
  g.fillRect(0, 0, c.width, c.height);
  g.globalAlpha = 1;
  g.strokeStyle = metal.ink;
  g.lineWidth = 8;
  g.strokeRect(14, 14, c.width - 28, c.height - 28);
  g.fillStyle = metal.ink;
  g.textAlign = 'center';
  g.font = '700 64px "Silkscreen", "Courier New", monospace';
  g.fillText(`${ORDINAL[place] ?? ''} · ${(seasonName || 'SEASON').toUpperCase()}`, c.width / 2, 92);
  g.font = '600 52px "Pixelify Sans", "Courier New", monospace';
  g.fillText((playerName || 'Game Nights Ultimate').slice(0, 26), c.width / 2, 162);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

function floorShadow() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, 'rgba(0,0,0,0.55)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.002;
  return mesh;
}

function makeSparkles(color) {
  const n = 70;
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 0.9 + Math.random() * 0.9;
    pos[i * 3] = Math.cos(a) * r;
    pos[i * 3 + 1] = 0.4 + Math.random() * 2.6;
    pos[i * 3 + 2] = Math.sin(a) * r;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return new THREE.Points(geo, new THREE.PointsMaterial({
    color: new THREE.Color(color), size: 0.06, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
}

function easeOutBounce(x) {
  const n = 7.5625;
  const d = 2.75;
  if (x < 1 / d) return n * x * x;
  if (x < 2 / d) return n * (x -= 1.5 / d) * x + 0.75;
  if (x < 2.5 / d) return n * (x -= 2.25 / d) * x + 0.9375;
  return n * (x -= 2.625 / d) * x + 0.984375;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
