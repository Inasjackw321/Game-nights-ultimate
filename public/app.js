// Game Nights Ultimate client. The server is authoritative: this file renders
// the state it is sent and forwards player actions.
import { CREATURES, oceanTexture, spriteUrl } from './sprites.js';
import { RENDERERS, FRAMES } from './games.js';

const $ = (id) => document.getElementById(id);
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};

// A stable per-browser guest id, so a refresh rejoins as the same player.
// (Signed-in players are identified by their Discord account instead.)
let pid = store.get('gn:pid');
if (!pid || !/^[a-zA-Z0-9-]{8,64}$/.test(pid)) {
  pid = (crypto.randomUUID?.() ?? `${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`).replace(/[^a-zA-Z0-9-]/g, '');
  store.set('gn:pid', pid);
}

let me = { authEnabled: false, user: null };
let catalog = [];
let ws = null;
let roomCode = null;
let state = null;
let clockOffset = 0;
let retry = 0;
let fatal = false;
let lastKey = null;
let lastPanelHtml = '';

export const serverNow = () => Date.now() + clockOffset;

// ---- decoration -----------------------------------------------------------

document.body.style.backgroundImage = `url(${oceanTexture()})`;
$('brandFish').src = spriteUrl('host');
$('hostFish').src = spriteUrl('host');
for (let i = 0; i < 14; i++) {
  const b = document.createElement('i');
  b.style.left = `${Math.random() * 100}%`;
  b.style.animationDuration = `${9 + Math.random() * 12}s`;
  b.style.animationDelay = `${-Math.random() * 20}s`;
  b.style.setProperty('--drift', `${(Math.random() - 0.5) * 60}px`);
  const s = 4 + Math.round(Math.random() * 3) * 2;
  b.style.width = b.style.height = `${s}px`;
  $('bubbles').append(b);
}
$('stageDeco').innerHTML = [
  ['coral', '2%', 48], ['kelp', '9%', 36], ['kelp', '88%', 40], ['coral', '93%', 40],
].map(([n, left, h]) => `<img src="${spriteUrl(n)}" style="left:${left};height:${h}px" alt="">`).join('');
$('heroScene').innerHTML = ['crab', 'jelly', 'octopus', 'host', 'seahorse', 'turtle', 'fish']
  .map((n, i) => `<img src="${spriteUrl(n)}" alt="" style="left:${4 + i * 13.5}%;height:${n === 'host' ? 96 : 52}px;animation-delay:${-i * 0.4}s;bottom:${n === 'host' ? 30 : (i % 2) * 22}px">`).join('');

// ---- account --------------------------------------------------------------

async function loadMe() {
  try { me = await (await fetch('/api/me')).json(); } catch {}
  renderUserChip();
}

function renderUserChip() {
  const chip = $('userChip');
  $('signinHint').hidden = !me.authEnabled || Boolean(me.user);
  if (!me.authEnabled) { chip.innerHTML = ''; return; }
  if (!me.user) {
    const next = encodeURIComponent(location.pathname + location.search);
    chip.innerHTML = `<a class="pill discord" href="/auth/discord?next=${next}">Sign in with Discord</a>`;
    return;
  }
  chip.innerHTML = `<button class="pill" id="logoutBtn" title="Sign out"><img src="${esc(me.user.avatar)}" alt="">${esc(me.user.name)} ×</button>`;
  $('logoutBtn').onclick = async () => {
    await fetch('/auth/logout', { method: 'POST' });
    location.reload();
  };
  if (!$('nameInput').value) $('nameInput').value = me.user.name.slice(0, 16);
}

async function loadCatalog() {
  try { catalog = await (await fetch('/api/catalog')).json(); } catch {}
  $('homeGames').innerHTML = catalog.map((g) => gameCard(g)).join('');
}

// ---- connection -----------------------------------------------------------

function connect(code) {
  roomCode = code.toUpperCase();
  fatal = false;
  const url = new URL(location.href);
  url.searchParams.set('room', roomCode);
  url.hash = '';
  history.replaceState(null, '', url);
  $('roomTag').textContent = roomCode;
  $('roomTag').hidden = false;
  renderUserChip();
  open();
}

function open() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${proto}//${location.host}/api/rooms/${roomCode}/ws?pid=${encodeURIComponent(pid)}`);
  ws.onopen = () => {
    retry = 0;
    banner(null);
    send({ type: 'join', name: store.get('gn:name') || me.user?.name || 'Diver' });
  };
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === 'state') {
      clockOffset = msg.now - Date.now();
      state = msg;
      catalog = msg.catalog;
      route();
    } else if (msg.type === 'error') {
      if (msg.code === 'no_room' || msg.code === 'kicked') {
        fatal = true;
        leave(msg.message);
      } else {
        toast(msg.message);
      }
    }
  };
  ws.onclose = () => {
    if (fatal || !roomCode) return;
    banner('Connection lost, reconnecting…');
    const delay = Math.min(5000, 500 * 2 ** retry++);
    setTimeout(() => roomCode && !fatal && open(), delay);
  };
}

export function send(msg) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function leave(message) {
  roomCode = null;
  state = null;
  try { ws?.close(); } catch {}
  const url = new URL(location.href);
  url.searchParams.delete('room');
  history.replaceState(null, '', url);
  $('roomTag').hidden = true;
  route();
  if (message) toast(message);
}

// ---- home form ----------------------------------------------------------------

$('nameInput').value = store.get('gn:name') || '';
$('codeInput').addEventListener('input', (e) => {
  e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
});
$('homeForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('nameInput').value.trim();
  if (!name) return $('nameInput').focus();
  store.set('gn:name', name);

  if (e.submitter?.dataset.action === 'join') {
    const code = $('codeInput').value.trim();
    if (code.length !== 4) { toast('Room codes are 4 letters.'); return $('codeInput').focus(); }
    if (code === roomCode && ws?.readyState === WebSocket.OPEN) return send({ type: 'join', name });
    return connect(code);
  }
  e.submitter.disabled = true;
  try {
    const res = await fetch('/api/rooms', { method: 'POST' });
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || 'Could not create a room.');
    connect(body.code);
  } catch (err) {
    toast(err.message);
  } finally {
    e.submitter.disabled = false;
  }
});

// ---- routing --------------------------------------------------------------------

window.addEventListener('hashchange', route);
$('boardBack').onclick = (e) => { e.preventDefault(); history.replaceState(null, '', location.pathname + location.search); route(); };

function show(name) {
  for (const s of ['home', 'room', 'board']) $(`screen-${s}`).hidden = s !== name;
}

function route() {
  if (location.hash === '#leaderboard') { show('board'); return renderBoard(); }
  if (!state || !state.joined) {
    if (state) $('codeInput').value = state.code; // connected, but name taken / room full
    return show('home');
  }
  show('room');
  renderRoom();
}

// ---- room ---------------------------------------------------------------------

const meta = (id) => catalog.find((g) => g.id === id);
const amHost = () => state.actingHost === state.you;
const playerById = (id) => state.players.find((p) => p.id === id);

function renderRoom() {
  const s = state;
  const view = s.game;
  const key = `${s.phase}:${s.gameId}:${view?.stage}:${view?.round}:${view?.active ?? ''}`;
  const fresh = key !== lastKey;
  lastKey = key;
  renderSeats(view);

  const h = helpers(fresh);
  let html;
  if (s.phase === 'lobby') html = lobbyPanel(h);
  else if (s.phase === 'final') html = finalPanel(h);
  else html = gamePanel(view, h);
  setPanel(html, fresh);
}

function helpers(fresh) {
  return {
    fresh,
    me: state.you,
    isHost: amHost(),
    esc,
    name: (id) => playerById(id)?.name ?? 'Someone',
    look: (id) => playerById(id)?.look ?? 'fish',
    sprite: spriteUrl,
    players: state.players,
    meta: meta(state.gameId),
  };
}

// Players sit on rocks in a ring around the host fish.
function renderSeats(view) {
  const players = state.players;
  const n = players.length;
  const marks = view?.marks ?? {};
  const tags = view?.tags ?? {};
  const hearts = view?.hearts ?? null;
  const night = state.night ?? {};
  $('seats').innerHTML = players.map((p, i) => {
    const angle = (-90 + (360 / Math.max(n, 1)) * i) * (Math.PI / 180);
    const x = 50 + 41 * Math.cos(angle);
    const y = 53 + 35 * Math.sin(angle);
    const playing = state.phase !== 'lobby' && p.inGame;
    const classes = ['seat',
      p.id === state.you && 'me',
      p.id === state.hostId && 'host',
      !p.connected && 'off',
      state.phase === 'playing' && !p.inGame && 'spectator',
      marks[p.id] === 'turn' && 'turn',
      marks[p.id] === 'out' && 'out',
    ].filter(Boolean).join(' ');
    const mark = marks[p.id] === 'done' ? '<span class="mark">✓</span>' : marks[p.id] === 'solved' ? '<span class="mark solved">★</span>' : '';
    const tag = tags[p.id] ? `<span class="tag ${tags[p.id] === '???' ? 'mystery' : ''}">${esc(tags[p.id])}</span>` : '';
    let stat = '';
    if (hearts && p.id in hearts) {
      const max = view.maxHearts ?? hearts[p.id];
      stat = `<span class="hearts">${'♥'.repeat(hearts[p.id])}<span class="lost">${'♥'.repeat(Math.max(0, max - hearts[p.id]))}</span></span>`;
    } else if (playing && p.score !== null) {
      stat = `${view?.money ? '◆ ' : ''}${p.score}`;
    } else if (state.phase === 'lobby' && night[p.id]?.pearls) {
      stat = `● ${night[p.id].pearls}`;
    }
    const avatar = p.avatar ? `<img src="${esc(p.avatar)}" alt="">` : '';
    return `<div class="${classes}" style="left:${x}%;top:${y}%;--delay:${-i * 0.37}s">
      ${tag}${mark}
      <img class="creature" src="${spriteUrl(p.look, { dim: !p.connected })}" alt="">
      <img class="rock" src="${spriteUrl('rock')}" alt="">
      <span class="pname">${avatar}${esc(p.name)}</span>
      <span class="pstat">${stat}</span>
    </div>`;
  }).join('');
}

function bubble(title, eyebrow = '') {
  return `<div class="say"><img src="${spriteUrl('host')}" alt=""><div class="bubble">${eyebrow ? `<span class="eyebrow">${esc(eyebrow)}</span>` : ''}${esc(title)}</div></div>`;
}

function gameCard(g, { selected = false, button = false } = {}) {
  const icon = { deepcut: 'octopus', hivemind: 'fish', fib: 'squid', blitz: 'eel', likely: 'crab', whoami: 'jelly', blackjack: 'ray', dice: 'turtle', derby: 'seahorse' }[g.id] ?? 'fish';
  const tag = button ? 'button' : 'div';
  const attrs = button ? ` type="button" data-send='${JSON.stringify({ type: 'pick', game: g.id })}'` : '';
  return `<${tag} class="card ${selected ? 'selected' : ''}"${attrs}>
    <img class="gicon" src="${spriteUrl(icon)}" alt="">
    <h3>${esc(g.name)}</h3>
    <p>${esc(g.tagline)}</p>
    <span class="cat ${esc(g.category)}">${esc(g.category)}${g.minPlayers > 1 ? ` · ${g.minPlayers}+` : ''}</span>
  </${tag}>`;
}

function lobbyPanel(h) {
  const s = state;
  const g = meta(s.gameId);
  const online = s.players.filter((p) => p.connected).length;
  const enough = online >= g.minPlayers;
  const taken = new Set(s.players.filter((p) => p.id !== s.you).map((p) => p.look));
  const mine = playerById(s.you)?.look;

  const settings = g.options.map((o) => h.isHost
    ? `<label class="field"><span>${esc(o.label)}</span><select data-setting="${o.key}">${o.values.map((v) => `<option ${v === s.settings[o.key] ? 'selected' : ''}>${v}</option>`).join('')}</select></label>`
    : `<div class="field"><span>${esc(o.label)}</span><b>${s.settings[o.key]}</b></div>`).join('');

  return `
    <div class="lobby-top">
      <div><span class="eyebrow">Room code</span><div class="code-big">${esc(s.code)}</div></div>
      <button class="btn small" type="button" data-local="share">Copy invite link</button>
    </div>
    <div class="section">
      <h3>${h.isHost ? 'PICK A GAME' : 'THE HOST IS PICKING A GAME'}</h3>
      ${h.isHost
        ? `<div class="picker">${catalog.map((c) => gameCard(c, { selected: c.id === s.gameId, button: true })).join('')}</div>`
        : gameCard(g, { selected: true })}
    </div>
    <div class="settings">${settings}</div>
    ${h.isHost
      ? `<button class="btn primary big" type="button" data-send='{"type":"start"}' ${enough ? '' : 'disabled'}>Start ${esc(g.name)}</button>
         ${enough ? '' : `<p class="note center">${esc(g.name)} needs ${g.minPlayers}+ players online. Share the code!</p>`}`
      : '<p class="waiting">Waiting for the host to start</p>'}
    <div class="section">
      <h3>YOUR CREATURE</h3>
      <div class="creature-pick">${CREATURES.map((c) => `<button type="button" class="${c === mine ? 'mine' : ''}" ${taken.has(c) ? 'disabled' : ''} data-send='${JSON.stringify({ type: 'look', look: c })}' aria-label="${c}"><img src="${spriteUrl(c)}" alt=""></button>`).join('')}</div>
    </div>
    ${nightBoard()}
    ${!me.user && me.authEnabled ? '<p class="note">Sign in with Discord (top right) so your wins count on the global leaderboard.</p>' : ''}`;
}

// The room's "tonight" leaderboard: pearls for 1st/2nd/3rd in every game.
function nightBoard() {
  const night = state.night ?? {};
  const rows = state.players.filter((p) => night[p.id]).sort((a, b) => night[b.id].pearls - night[a.id].pearls || night[b.id].wins - night[a.id].wins);
  if (!rows.length) return '';
  return `<div class="section"><h3>TONIGHT'S STANDINGS · ● = PEARLS (3/2/1 FOR TOP 3)</h3><ol class="board">${rows.map((p) => `
    <li class="${p.id === state.you ? 'me' : ''}"><img class="mini" src="${spriteUrl(p.look)}" alt=""><span class="name">${esc(p.name)}</span>
    <span class="delta zero">${night[p.id].wins} win${night[p.id].wins === 1 ? '' : 's'} / ${night[p.id].games}</span><span class="score">● ${night[p.id].pearls}</span></li>`).join('')}</ol></div>`;
}

function finalPanel(h) {
  const s = state;
  const f = s.final;
  const g = meta(f.gameId);
  const top = f.ranking.filter((r) => r.place === 1);
  const line = top.length > 1 ? `It's a tie: ${top.map((r) => r.name).join(' & ')}!` : `${top[0]?.name ?? 'Nobody'} wins ${g.name}!`;
  const extra = RENDERERS[f.gameId]?.summary?.(s.game, h) ?? '';
  return `
    ${bubble(line, 'Game over')}
    <ol class="board places">${f.ranking.map((r) => `
      <li data-place="${r.place}" class="${r.id === s.you ? 'me' : ''}"><img class="mini" src="${spriteUrl(h.look(r.id))}" alt="">
      <span class="name">${esc(r.name)}</span><span class="score">${s.game?.money ? '◆ ' : ''}${r.score}</span></li>`).join('')}</ol>
    ${extra}
    <p class="note">${f.ranked ? 'This game counts on the <b>global leaderboard</b> for players signed in with Discord.' : 'Games with fewer than 3 players don\'t count on the global leaderboard.'}</p>
    ${h.isHost
      ? `<div class="btn-row"><button class="btn primary" data-send='{"type":"start"}'>Play again</button><button class="btn" data-send='{"type":"lobby"}'>Pick another game</button></div>`
      : '<p class="waiting">Waiting for the host</p>'}
    ${nightBoard()}`;
}

function gamePanel(view, h) {
  const r = RENDERERS[state.gameId];
  const eyebrow = view.total ? `${h.meta.name} · ${Math.min(view.round + 1, view.total)} of ${view.total}` : h.meta.name;
  const spectating = view.canPlay === false ? '<p class="note">You joined mid-game, so you\'re watching this one. You\'ll be in the next game.</p>' : '';
  return `${bubble(view.title, eyebrow)}${spectating}${r.panel(view, h)}
    ${h.isHost ? '<div class="end-row"><button class="btn small" data-local="end">End game</button></div>' : ''}`;
}

// Replace the panel, keeping whatever the player was typing.
function setPanel(html, fresh) {
  if (html === lastPanelHtml) return;
  lastPanelHtml = html;
  const panel = $('panel');
  const drafts = {};
  let focus = null;
  if (!fresh) {
    for (const el of panel.querySelectorAll('input[name]:not([type=radio])')) drafts[el.name] = el.value;
    const a = document.activeElement;
    if (a?.name && panel.contains(a)) focus = { name: a.name, start: a.selectionStart, end: a.selectionEnd };
  }
  const radios = !fresh ? [...panel.querySelectorAll('input[type=radio]:checked')].map((r) => `${r.name}=${r.value}`) : [];
  panel.innerHTML = html;
  for (const el of panel.querySelectorAll('input[name]:not([type=radio])')) if (el.name in drafts) el.value = drafts[el.name];
  for (const rv of radios) {
    const [n, v] = rv.split('=');
    const el = panel.querySelector(`input[type=radio][name="${n}"][value="${v}"]`);
    if (el) el.checked = true;
  }
  if (focus) {
    const el = panel.querySelector(`[name="${focus.name}"]`);
    el?.focus();
    try { el?.setSelectionRange(focus.start, focus.end); } catch {}
  } else if (fresh) {
    panel.querySelector('input[autofocus]')?.focus({ preventScroll: true });
  }
}

// One delegated handler for every button and form in the panel.
$('panel').addEventListener('click', async (e) => {
  const el = e.target.closest('[data-send],[data-local]');
  if (!el || el.disabled) return;
  if (el.dataset.send) return send(JSON.parse(el.dataset.send));
  if (el.dataset.local === 'share') {
    const link = `${location.origin}${location.pathname}?room=${roomCode}`;
    try {
      if (navigator.share && matchMedia('(pointer: coarse)').matches) await navigator.share({ title: 'Game Nights Ultimate', text: `Join my room: ${roomCode}`, url: link });
      else { await navigator.clipboard.writeText(link); toast('Invite link copied'); }
    } catch {}
  }
  if (el.dataset.local === 'end' && confirm('End this game for everyone?')) send({ type: 'end' });
});
$('panel').addEventListener('change', (e) => {
  const key = e.target.dataset.setting;
  if (key) send({ type: 'settings', key, value: Number(e.target.value) });
});
$('panel').addEventListener('submit', (e) => {
  const form = e.target.closest('form[data-form]');
  if (!form) return;
  e.preventDefault();
  const data = Object.fromEntries(new FormData(form, e.submitter));
  if ('text' in data && !String(data.text).trim()) return form.querySelector('[name=text]')?.focus();
  send({ type: form.dataset.form, ...data });
  if (form.dataset.clear !== undefined) form.reset();
});

// ---- timer + animation loop -------------------------------------------------------

function tick() {
  const v = state?.phase === 'playing' ? state.game : null;
  const timer = $('timer');
  if (v?.deadline && v.duration) {
    const left = Math.max(0, v.deadline - serverNow());
    timer.hidden = false;
    $('timerNum').textContent = Math.ceil(left / 1000);
    $('timerFill').style.transform = `scaleX(${left / v.duration})`;
    timer.classList.toggle('hurry', left < 5000);
  } else {
    timer.hidden = true;
  }
  if (v && FRAMES[state.gameId]) FRAMES[state.gameId](v, $('panel'), serverNow());
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

// ---- global leaderboard -----------------------------------------------------------

let boardGame = 'all';
async function renderBoard() {
  if (!catalog.length) await loadCatalog();
  $('boardTabs').innerHTML = [{ id: 'all', name: 'All games' }, ...catalog]
    .map((g) => `<button class="btn ${g.id === boardGame ? 'primary' : ''}" data-game="${g.id}">${esc(g.name)}</button>`).join('');
  $('boardBody').innerHTML = '<p class="waiting">Loading</p>';
  let data;
  try { data = await (await fetch(`/api/leaderboard?game=${boardGame}`)).json(); } catch { data = { rows: [] }; }
  if (!data.rows.length) {
    $('boardBody').innerHTML = `<p class="note">No ranked games yet. ${me.authEnabled ? 'Sign in with Discord and play a game with 3+ people to get on the board.' : ''}</p>`;
    return;
  }
  $('boardBody').innerHTML = `<table class="table"><thead><tr><th>#</th><th>Player</th><th>Wins</th><th>Games</th><th>Win %</th><th>Best</th></tr></thead><tbody>
    ${data.rows.map((r, i) => `<tr class="${me.user?.id === r.id ? 'me' : ''}"><td>${i + 1}</td>
      <td><span class="who">${r.avatar ? `<img src="${esc(r.avatar)}" alt="">` : ''}${esc(r.name)}</span></td>
      <td>${r.wins}</td><td>${r.games}</td><td>${Math.round((r.wins / r.games) * 100)}%</td><td>${r.best}</td></tr>`).join('')}
  </tbody></table>`;
}
$('boardTabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-game]');
  if (b) { boardGame = b.dataset.game; renderBoard(); }
});

// ---- utilities ------------------------------------------------------------------

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

let toastTimer;
function toast(text) {
  $('toast').textContent = text;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3000);
}

function banner(text) {
  $('banner').hidden = !text;
  $('banner').textContent = text ?? '';
}

// ---- boot -------------------------------------------------------------------------

await Promise.all([loadMe(), loadCatalog()]);
const params = new URLSearchParams(location.search);
if (params.get('login') === 'failed') toast('Discord sign-in failed, please try again.');
const linked = params.get('room');
if (linked && /^[a-z]{4}$/i.test(linked)) {
  $('codeInput').value = linked.toUpperCase();
  if (store.get('gn:name') || me.user) connect(linked);
  else { route(); $('nameInput').focus(); }
} else {
  route();
}
