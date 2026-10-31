// Game Nights Ultimate client. The server is authoritative: this file renders
// the state it is sent and forwards player actions.
import { CREATURES, HATS, oceanTexture, spriteUrl, trophyUrl } from './sprites.js';
import { THEMES, THEME_IDS } from './themes.js';
import * as sketchpad from './sketchpad.js';
import { RENDERERS, FRAMES } from './games.js';
import { sfx, isMuted, setMuted, isMusicOn, setMusic } from './sfx.js';
import * as fx from './fx.js';
import { onState } from './director.js';
import * as voice from './voice.js';

export const REACTIONS = ['😂', '🔥', '😱', '👏', '💀', '🐟'];
// Soundboard buttons share the reaction channel (indices 6–10): everyone hears them.
const SOUNDS = [
  { icon: '📯', label: 'Air horn', play: () => sfx.airhorn() },
  { icon: '🥁', label: 'Ba-dum-tss', play: () => sfx.rimshot() },
  { icon: '🙌', label: 'Applause', play: () => sfx.applause() },
  { icon: '🦗', label: 'Crickets', play: () => sfx.crickets() },
  { icon: '🎺', label: 'Sad trombone', play: () => sfx.sadTrombone() },
];

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

$('brandFish').src = spriteUrl('host');
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
$('heroScene').innerHTML = ['cat', 'octopus', 'robot', 'host', 'frog', 'dragon', 'penguin']
  .map((n, i) => `<img src="${spriteUrl(n)}" alt="" style="left:${4 + i * 13.5}%;height:${n === 'host' ? 96 : 52}px;animation-delay:${-i * 0.4}s;bottom:${n === 'host' ? 30 : (i % 2) * 22}px">`).join('');

// ---- worlds (themes) ----------------------------------------------------------

let themeId = null;
const textures = {};
function applyTheme(id) {
  const t = THEMES[id] ? id : 'reef';
  if (t === themeId) return;
  themeId = t;
  const theme = THEMES[t];
  store.set('gn:theme', t);
  document.body.dataset.theme = t;
  textures[t] ??= oceanTexture(theme.shades, theme.streak);
  document.body.style.backgroundImage = `url(${textures[t]})`;
  $('hostFish').src = spriteUrl(theme.host);
  $('stageDeco').innerHTML = theme.deco.map(([n, left, h]) => `<img src="${spriteUrl(n)}" style="left:${left};height:${h}px" alt="">`).join('');
  for (const rock of document.querySelectorAll('.seat .rock')) rock.src = rockUrl();
}
const rockUrl = () => {
  const theme = THEMES[themeId] ?? THEMES.reef;
  return theme.rock ? spriteUrl('rock', { palette: theme.rock, key: `rock-${themeId}` }) : spriteUrl('rock');
};
applyTheme(store.get('gn:theme') || 'reef');

// Every so often something wanders through the world behind the players
// (and now and then something big, like a shark).
setInterval(() => {
  // Wanderers live in the clipped decoration layer so they never widen the page.
  const stage = $('stageDeco');
  if (!stage || $('screen-room').hidden || document.hidden) return;
  const theme = THEMES[themeId] ?? THEMES.reef;
  const big = Math.random() < 0.15;
  const el = document.createElement('img');
  const left = Math.random() < 0.5;
  el.src = spriteUrl(big ? theme.big : theme.wanderers[(Math.random() * theme.wanderers.length) | 0]);
  el.className = `swimmer ${left ? 'left' : ''} ${big ? 'big' : ''}`;
  el.style.top = `${10 + Math.random() * 70}%`;
  el.style.height = `${big ? 44 : 14 + Math.random() * 16}px`;
  el.style.animationDuration = `${big ? 9 : 12 + Math.random() * 10}s`;
  stage.prepend(el);
  setTimeout(() => el.remove(), 23000);
}, 7000);

// Easter egg: poke the host enough and it gets cross.
let pokes = 0;
let pokeTimer;
$('hostFish').addEventListener('click', () => {
  pokes += 1;
  clearTimeout(pokeTimer);
  pokeTimer = setTimeout(() => { pokes = 0; }, 2500);
  sfx.poke(Math.min(pokes, 10));
  fx.hostAnim(pokes >= 7 ? 'spin' : 'chomp');
  const r = $('hostFish').getBoundingClientRect();
  fx.bubbles(r.left + r.width / 2, r.top + r.height / 2, 6 + pokes * 2);
  if (pokes === 7) { fx.banner('STOP POKING ME!', { color: 'var(--red)', big: true }); fx.shake(2); sfx.boom(); }
  if (pokes === 12) { fx.banner('FINE. HAVE A PARTY.', { color: 'var(--pink)' }); fx.confetti(1); sfx.fanfare(); pokes = 0; }
});

// ---- account --------------------------------------------------------------

async function loadMe() {
  try { me = await (await fetch('/api/me')).json(); } catch {}
  renderUserChip();
}

function renderUserChip() {
  const chip = $('userChip');
  $('signinHint').hidden = Boolean(me.user);
  if (!me.authEnabled && !me.user) {
    // Tell whoever runs the site exactly what's missing.
    $('signinHint').innerHTML = `Discord sign-in isn't switched on yet. Missing Worker secret${me.authMissing?.length === 1 ? '' : 's'}: <b>${(me.authMissing ?? []).map(esc).join(', ')}</b>. Add them with <code>npx wrangler secret put …</code> (see README).`;
    // Always show the button so it's findable; until setup is done it explains why it can't work yet.
    chip.innerHTML = '<button class="pill discord setup" id="loginSetupBtn" type="button">Sign in with Discord</button>';
    $('loginSetupBtn').onclick = () => toast(`Discord sign-in isn't set up on this server yet. Missing: ${(me.authMissing ?? []).join(', ')}. The site owner adds them with "npx wrangler secret put", then refreshes.`, 9000);
    return;
  }
  $('signinHint').textContent = 'Sign in with Discord to earn season points, win trophies and get on the global leaderboard.';
  if (!me.user) {
    const next = encodeURIComponent(location.pathname + location.search);
    chip.innerHTML = `<a class="pill discord" href="/auth/discord?next=${next}">Sign in with Discord</a>`;
    return;
  }
  const cups = me.trophies?.length ? `<span class="cups">🏆${me.trophies.length}</span>` : '';
  chip.innerHTML = `<button class="pill" id="logoutBtn" title="Sign out"><img src="${esc(me.user.avatar)}" alt="">${esc(me.user.name)}${cups} ×</button>`;
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
    if (voice.inVoice()) send({ type: 'voice', on: true, muted: voice.isMicMuted() });
  };
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === 'state') {
      clockOffset = msg.now - Date.now();
      const prev = state;
      state = msg;
      catalog = msg.catalog;
      applyTheme(state.theme);
      route();
      voice.sync(state);
      renderVoiceBar();
      if (location.hash !== '#leaderboard') requestAnimationFrame(() => onState(prev, state));
    } else if (msg.type === 'rtc') {
      voice.onSignal(msg.from, msg.data);
    } else if (msg.type === 'ink') {
      sketchpad.onInk(msg);
    } else if (msg.type === 'disco') {
      startDisco(msg.name);
    } else if (msg.type === 'react') {
      const pt = fx.seatPoint(msg.pid);
      const sound = SOUNDS[msg.r - REACTIONS.length];
      if (pt && REACTIONS[msg.r]) { fx.reaction(pt.x, pt.y - 20, REACTIONS[msg.r]); sfx.react(msg.r); fx.seatAnim(msg.pid, 'hop'); }
      if (pt && sound) { fx.reaction(pt.x, pt.y - 20, sound.icon); sound.play(); fx.seatAnim(msg.pid, 'spin'); }
    } else if (msg.type === 'error' && /so close/i.test(msg.message)) {
      sfx.alert();
      toast(`🔥 ${msg.message}`);
    } else if (msg.type === 'error') {
      sfx.buzz();
      // Bounced answer: shake the box and select the text so retyping is instant.
      const input = $('panel').querySelector('input[name=text]');
      if (input) { input.classList.remove('nope'); void input.offsetWidth; input.classList.add('nope'); input.select(); }
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
  voice.leave();
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
  const custom = s.phase === 'playing' && RENDERERS[s.gameId]?.key;
  const key = custom ? `${s.phase}:${s.gameId}:${custom(view)}` : `${s.phase}:${s.gameId}:${view?.stage}:${view?.round}:${view?.active ?? ''}`;
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
  const seats = $('seats');
  // Seats are kept and updated in place (keyed by player) so creatures keep
  // bobbing and glide to their new spot instead of everything redrawing.
  const existing = new Map([...seats.children].map((el) => [el.dataset.id, el]));
  players.forEach((p, i) => {
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
    const crown = state.phase === 'final' && state.final?.ranking.some((r) => r.id === p.id && r.place === 1) ? '<span class="crown">♛</span>' : '';
    const vbadge = p.voice ? `<span class="vbadge" title="In voice chat">${p.voiceMuted ? '🔇' : '🎧'}</span>` : '';

    let el = existing.get(p.id);
    existing.delete(p.id);
    if (!el) {
      el = document.createElement('div');
      el.dataset.id = p.id;
      el.innerHTML = `<span class="overlay"></span><span class="cwrap"><img class="creature" alt=""><img class="hat" alt="" hidden></span><img class="rock" src="${rockUrl()}" alt=""><span class="pname"></span><span class="pstat"></span>`;
      el.style.left = `${x}%`;
      el.style.top = `${y}%`;
      seats.append(el);
    }
    if (el.className !== classes) el.className = classes;
    el.style.left = `${x}%`;
    el.style.top = `${y}%`;
    el.style.setProperty('--delay', `${-i * 0.37}s`);
    const src = spriteUrl(p.look, { dim: !p.connected });
    const img = el.querySelector('.creature');
    if (img.getAttribute('src') !== src) img.setAttribute('src', src);
    const hat = el.querySelector('.hat');
    const hatSrc = p.hat && p.hat !== 'none' ? spriteUrl(`hat-${p.hat}`) : '';
    if ((hat.getAttribute('src') ?? '') !== hatSrc) {
      if (hatSrc) hat.setAttribute('src', hatSrc); else hat.removeAttribute('src');
      hat.hidden = !hatSrc;
      hat.className = `hat ${p.hat ?? ''}`;
    }
    setHtml(el.querySelector('.overlay'), crown + tag + mark + vbadge);
    setHtml(el.querySelector('.pname'), avatar + esc(p.name));
    setHtml(el.querySelector('.pstat'), stat);
  });
  for (const el of existing.values()) el.remove();
}

function setHtml(el, html) {
  if (el._html !== html) { el.innerHTML = html; el._html = html; }
}

function bubble(title, eyebrow = '', fresh = false) {
  return `<div class="say"><img src="${spriteUrl((THEMES[themeId] ?? THEMES.reef).host)}" alt=""><div class="bubble ${fresh ? 'enter' : ''}">${eyebrow ? `<span class="eyebrow">${esc(eyebrow)}</span>` : ''}${esc(title)}</div></div>`;
}

function gameCard(g, { selected = false, button = false } = {}) {
  const icon = { deepcut: 'octopus', hivemind: 'fish', fib: 'squid', blitz: 'eel', likely: 'crab', whoami: 'jelly', tycoon: 'whale', sketch: 'cat', blackjack: 'ray', dice: 'turtle', derby: 'seahorse' }[g.id] ?? 'fish';
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
      <h3>${h.isHost ? 'PICK A WORLD' : 'WORLD'}</h3>
      <div class="worlds">${THEME_IDS.map((t) => `<button type="button" class="btn world ${t === (s.theme ?? 'reef') ? 'on' : ''}" data-world="${t}" ${h.isHost ? `data-send='${JSON.stringify({ type: 'theme', theme: t })}'` : 'disabled'}>${THEMES[t].icon} ${esc(THEMES[t].name)}</button>`).join('')}</div>
    </div>
    <div class="section">
      <h3>YOUR CHARACTER</h3>
      <div class="creature-pick">${CREATURES.map((c) => `<button type="button" class="${c === mine ? 'mine' : ''}" ${taken.has(c) ? 'disabled' : ''} data-send='${JSON.stringify({ type: 'look', look: c })}' aria-label="${c}" title="${c}"><img src="${spriteUrl(c)}" alt=""></button>`).join('')}</div>
      <h3 class="sub-h">HAT</h3>
      <div class="creature-pick hats">${HATS.map((hat) => `<button type="button" class="${hat === (playerById(s.you)?.hat ?? 'none') ? 'mine' : ''}" data-send='${JSON.stringify({ type: 'hat', hat })}' aria-label="${hat}" title="${hat}">${hat === 'none' ? '<span class="nohat">✕</span>' : `<img src="${spriteUrl(`hat-${hat}`)}" alt="">`}</button>`).join('')}</div>
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
    ${bubble(line, 'Game over', h.fresh)}
    <ol class="board places">${f.ranking.map((r) => `
      <li data-place="${r.place}" class="${r.id === s.you ? 'me' : ''}"><img class="mini" src="${spriteUrl(h.look(r.id))}" alt="">
      <span class="name">${esc(r.name)}</span><span class="score">${s.game?.money ? '◆ ' : ''}${r.score}</span></li>`).join('')}</ol>
    ${extra}
    ${f.season?.[s.you] ? `<p class="season-gain">🏆 +${f.season[s.you]} season points!</p>` : ''}
    <p class="note">${f.ranked ? `This game counts on the <b>global leaderboard</b> and this month's <b>season</b> for players signed in with Discord.${!me.user && me.authEnabled ? ' Sign in to earn season points and win trophies!' : ''}` : 'Games with fewer than 3 players don\'t count on the global leaderboard or the season.'}</p>
    ${h.isHost
      ? `<div class="btn-row"><button class="btn primary" data-send='{"type":"start"}'>Play again</button><button class="btn" data-send='{"type":"lobby"}'>Pick another game</button></div>`
      : '<p class="waiting">Waiting for the host</p>'}
    ${nightBoard()}`;
}

function gamePanel(view, h) {
  const r = RENDERERS[state.gameId];
  const eyebrow = view.total ? `${h.meta.name} · ${Math.min(view.round + 1, view.total)} of ${view.total}` : h.meta.name;
  const spectating = view.canPlay === false ? '<p class="note">You joined mid-game, so you\'re watching this one. You\'ll be in the next game.</p>' : '';
  return `${bubble(view.title, eyebrow, h.fresh)}${spectating}${r.panel(view, h)}
    ${h.isHost ? '<div class="end-row"><button class="btn small" data-local="end">End game</button></div>' : ''}`;
}

// Replace the panel, keeping whatever the player was typing.
function setPanel(html, fresh) {
  if (html === lastPanelHtml && !fresh) return;
  lastPanelHtml = html;
  const panel = $('panel');
  if (fresh) {
    // New stage: swap the content in with a quick slide.
    panel.innerHTML = html;
    panel.classList.remove('enter');
    void panel.offsetWidth;
    panel.classList.add('enter');
    panel.querySelector('input[autofocus]')?.focus({ preventScroll: true });
  } else {
    // Same stage, small change: patch the DOM so nothing flickers and
    // whatever the player is typing (and where their cursor is) survives.
    const tpl = document.createElement('template');
    tpl.innerHTML = html;
    morph(panel, tpl.content);
  }
}

function morph(target, source) {
  const have = [...target.childNodes];
  const want = [...source.childNodes];
  want.forEach((node, i) => {
    const cur = have[i];
    if (!cur) return target.appendChild(node);
    if (cur.nodeType !== node.nodeType || cur.nodeName !== node.nodeName) return target.replaceChild(node, cur);
    if (cur.nodeType === Node.TEXT_NODE) {
      if (cur.nodeValue !== node.nodeValue) cur.nodeValue = node.nodeValue;
      return;
    }
    if (cur.nodeType !== Node.ELEMENT_NODE) return;
    for (const { name } of [...cur.attributes]) if (!node.hasAttribute(name)) cur.removeAttribute(name);
    for (const { name, value } of [...node.attributes]) if (cur.getAttribute(name) !== value) cur.setAttribute(name, value);
    if (cur.tagName !== 'INPUT' && cur.tagName !== 'TEXTAREA') morph(cur, node);
  });
  for (let i = have.length - 1; i >= want.length; i--) target.removeChild(have[i]);
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

// ---- sound toggles, reactions, button clicks -----------------------------------

function renderSoundButtons() {
  $('muteBtn').textContent = isMuted() ? '🔇 Sound off' : '🔊 Sound on';
  $('musicBtn').textContent = isMusicOn() ? '♪ Music on' : '♪ Music off';
  $('musicBtn').classList.toggle('dim', !isMusicOn());
}
$('muteBtn').onclick = () => { setMuted(!isMuted()); renderSoundButtons(); if (!isMuted()) sfx.ding(); };
$('musicBtn').onclick = () => { setMusic(!isMusicOn()); renderSoundButtons(); };
renderSoundButtons();

// ---- voice chat ----------------------------------------------------------------

voice.setup({ sendFn: send, changed: () => renderVoiceBar() });
sketchpad.setup(send);

function renderVoiceBar() {
  const bar = $('voicebar');
  if (!state?.joined) { bar.innerHTML = ''; return; }
  const others = state.players.filter((p) => p.voice && p.id !== state.you).length;
  if (!voice.inVoice()) {
    bar.innerHTML = `<button class="btn small go" type="button" data-voice="join">🎙 Join voice chat</button>
      ${others ? `<span class="tiny muted">${others} in voice</span>` : ''}`;
    return;
  }
  bar.innerHTML = `<button class="btn small ${voice.isMicMuted() ? 'danger' : 'go'}" type="button" data-voice="mute">${voice.isMicMuted() ? '🔇 Mic muted' : '🎙 Mic on'}</button>
    <button class="btn small" type="button" data-voice="leave">Leave voice</button>
    <span class="tiny muted">${others ? `Talking with ${voice.connectedCount()}/${others}` : 'Nobody else in voice yet'}</span>`;
}

$('voicebar').addEventListener('click', async (e) => {
  const action = e.target.closest('[data-voice]')?.dataset.voice;
  if (action === 'join') {
    try { await voice.join(); toast('You\'re in voice chat. Everyone in voice can hear you.'); }
    catch (err) { toast(err.name === 'NotAllowedError' ? 'Microphone permission was blocked. Allow it in your browser\'s address bar and try again.' : `Couldn't start voice: ${err.message}`, 7000); }
  }
  if (action === 'mute') voice.toggleMute();
  if (action === 'leave') voice.leave();
  renderVoiceBar();
});
setInterval(() => { if (voice.inVoice()) renderVoiceBar(); }, 2000);

let lastReact = 0;
$('reactions').innerHTML = REACTIONS.map((r, i) => `<button type="button" data-react="${i}" aria-label="React ${r}">${r}</button>`).join('')
  + '<span class="sep"></span>'
  + SOUNDS.map((snd, i) => `<button type="button" class="sound" data-react="${REACTIONS.length + i}" aria-label="${snd.label}" title="${snd.label}">${snd.icon}</button>`).join('')
  + '<button type="button" class="disco-btn" data-disco aria-label="Disco mode" title="Disco mode!">🪩</button>';
$('reactions').addEventListener('click', (e) => {
  if (e.target.closest('[data-disco]')) return send({ type: 'disco' });
  const b = e.target.closest('[data-react]');
  if (!b || Date.now() - lastReact < 450) return;
  lastReact = Date.now();
  send({ type: 'react', r: Number(b.dataset.react) });
});

document.addEventListener('pointerdown', (e) => {
  if (e.target.closest('.btn:not(:disabled), button.card, .creature-pick button:not(:disabled), .pill')) sfx.click();
});

// ---- disco mode ----------------------------------------------------------------

let discoTimer;
function startDisco(name) {
  const SECONDS = 8;
  document.body.classList.add('disco');
  clearTimeout(discoTimer);
  discoTimer = setTimeout(() => document.body.classList.remove('disco'), SECONDS * 1000);
  fx.banner('DISCO TIME!', { color: 'var(--pink)', big: true, sub: name ? `${name} dropped the ball` : '' });
  sfx.disco(SECONDS);
  fx.hostAnim('spin');
  for (let i = 0; i < SECONDS; i++) setTimeout(() => fx.confetti(0.25), i * 1000);
}

// ---- timer + animation loop -------------------------------------------------------

// Countdown beeps only while players are expected to act.
const TICK_STAGES = new Set(['answer', 'write', 'vote', 'question', 'pick', 'turn', 'respond', 'bet', 'play', 'bid']);
let lastSecond = null;

function tick() {
  const v = state?.phase === 'playing' ? state.game : null;
  const timer = $('timer');
  if (v?.deadline && v.duration) {
    const left = Math.max(0, v.deadline - serverNow());
    const secs = Math.ceil(left / 1000);
    if (TICK_STAGES.has(v.stage) && secs !== lastSecond) {
      if (secs <= 5 && secs > 0) { sfx.tick(secs <= 3); timer.classList.remove('pulse'); void timer.offsetWidth; timer.classList.add('pulse'); }
      if (secs === 0 && lastSecond === 1) { sfx.timeUp(); fx.hostAnim('wobble'); }
    }
    lastSecond = secs;
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
  for (const b of $('boardMode').querySelectorAll('[data-mode]')) b.classList.toggle('primary', b.dataset.mode === boardMode);
  $('seasonView').hidden = boardMode !== 'season';
  $('alltimeView').hidden = boardMode !== 'alltime';
  if (boardMode === 'season') return renderSeason();
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
  $('boardBody').innerHTML = `<table class="table"><thead><tr><th>#</th><th>Player</th><th>Wins</th><th>Games</th><th>Win %</th><th>🏆</th></tr></thead><tbody>
    ${data.rows.map((r, i) => `<tr class="${me.user?.id === r.id ? 'me' : ''}"><td>${i + 1}</td>
      <td><span class="who">${r.avatar ? `<img src="${esc(r.avatar)}" alt="">` : ''}${esc(r.name)}</span></td>
      <td>${r.wins}</td><td>${r.games}</td><td>${Math.round((r.wins / r.games) * 100)}%</td><td>${r.trophies ? `${r.trophies}${r.golds ? ` <span class="gold">(${r.golds}★)</span>` : ''}` : '—'}</td></tr>`).join('')}
  </tbody></table>`;
}

// ---- seasons & trophies -------------------------------------------------------------

const PLACE_NAMES = { 1: 'Gold', 2: 'Silver', 3: 'Bronze' };
let boardMode = 'season';
let seasonId = '';
let seasonData = null;

$('boardMode').addEventListener('click', (e) => {
  const b = e.target.closest('[data-mode]');
  if (!b) return;
  boardMode = b.dataset.mode;
  renderBoard();
});

async function renderSeason() {
  const view = $('seasonView');
  if (!seasonData || seasonData.season.id !== (seasonId || seasonData.season.id)) view.innerHTML = '<p class="waiting">Loading</p>';
  try { seasonData = await (await fetch(`/api/season?season=${seasonId}`)).json(); } catch { view.innerHTML = '<p class="note">Couldn\'t load the season.</p>'; return; }
  const { season, rows, past } = seasonData;
  const options = [`<option value="">This season</option>`, ...past.map((p) => `<option value="${p.id}" ${p.id === seasonId ? 'selected' : ''}>${esc(p.nickname)} · ${esc(p.name)}</option>`)].join('');
  const table = rows.length
    ? `<table class="table season-table"><thead><tr><th>#</th><th>Player</th><th>Points</th><th>Games</th><th>Wins</th></tr></thead><tbody>
      ${rows.map((r) => `<tr class="${me.user?.id === r.id ? 'me' : ''} ${r.place <= 3 ? `podium p${r.place}` : ''}">
        <td>${r.place <= 3 ? `<img class="cup-icon" src="${trophyUrl(r.place)}" alt="${PLACE_NAMES[r.place]}">` : r.place}</td>
        <td><span class="who">${r.avatar ? `<img src="${esc(r.avatar)}" alt="">` : ''}${esc(r.name)}</span></td>
        <td class="pts">${r.points}</td><td>${r.games}</td><td>${r.wins}</td></tr>`).join('')}</tbody></table>`
    : `<p class="note center">${season.current ? 'No ranked games yet this season. Be the first on the board!' : 'Nobody played ranked games that season.'}</p>`;

  const cabinet = me.user
    ? `<div class="section"><h3>YOUR TROPHY CABINET</h3>${me.trophies?.length
        ? `<div class="cabinet">${me.trophies.map((t) => `<button class="card cab" type="button" data-trophy="${t.id}"><img src="${trophyUrl(t.place)}" alt=""><b>${PLACE_NAMES[t.place]}</b><span>${esc(t.nickname)}</span><span class="muted">${esc(t.name)}</span></button>`).join('')}</div>`
        : '<p class="note">No trophies yet. Finish a season in the top 3 to win one!</p>'}</div>`
    : `<p class="note">${me.authEnabled ? 'Sign in with Discord (top right) to earn season points and win trophies.' : 'Season points and trophies need Discord sign-in, which isn\'t set up on this server yet.'}</p>`;

  $('seasonView').innerHTML = `
    <div class="season-hero">
      <div class="trophy-row">${[2, 1, 3].map((p) => `<button class="trophy-btn p${p}" type="button" data-preview="${p}" title="See the ${PLACE_NAMES[p]} trophy in 3D"><img src="${trophyUrl(p)}" alt=""><span>${PLACE_NAMES[p]}</span></button>`).join('')}</div>
      <span class="eyebrow">${season.current ? 'This season' : 'Final standings'}</span>
      <h3 class="season-name">${esc(season.nickname)} Season</h3>
      <p class="muted">${esc(season.name)}${season.current ? ` · <span class="countdown" data-ends="${season.end}"></span>` : ''}</p>
      <p class="tiny muted">Top 3 at the end of the month win a trophy. Tap one to see it in 3D.</p>
    </div>
    <label class="field season-pick"><span>Season</span><select id="seasonSelect">${options}</select></label>
    ${table}
    <p class="note">Every ranked game (3+ players) earns points: <b>2 × (players − your place + 1)</b>. Winning a 6-player game is worth 12, last place still gets 2.</p>
    ${cabinet}`;
  tickCountdown();
}

$('seasonView').addEventListener('change', (e) => {
  if (e.target.id === 'seasonSelect') { seasonId = e.target.value; renderSeason(); }
});
$('seasonView').addEventListener('click', (e) => {
  const preview = e.target.closest('[data-preview]');
  if (preview) {
    const place = Number(preview.dataset.preview);
    const s = seasonData.season;
    showTrophy({ place, seasonName: s.name, playerName: me.user ? `${me.user.name}?` : 'Could be you!', title: `${PLACE_NAMES[place].toUpperCase()} TROPHY`, subtitle: `${s.nickname} Season prize · ${['', '1st', '2nd', '3rd'][place]} place` });
  }
  const cab = e.target.closest('[data-trophy]');
  if (cab) {
    const t = me.trophies.find((x) => String(x.id) === cab.dataset.trophy);
    if (t) showTrophy({ place: t.place, seasonName: t.name, playerName: me.user.name, title: `${PLACE_NAMES[t.place].toUpperCase()} TROPHY`, subtitle: `${t.nickname} Season · ${t.points} points` });
  }
});

function tickCountdown() {
  const el = document.querySelector('.countdown[data-ends]');
  if (!el) return;
  const left = Math.max(0, Number(el.dataset.ends) - Date.now());
  const d = Math.floor(left / 86400e3);
  const h = Math.floor((left % 86400e3) / 3600e3);
  const m = Math.floor((left % 3600e3) / 60e3);
  const sec = Math.floor((left % 60e3) / 1000);
  el.textContent = left ? `ends in ${d ? `${d}d ` : ''}${h}h ${m}m ${d ? '' : `${sec}s`}` : 'ending now!';
}
setInterval(tickCountdown, 1000);

async function showTrophy(opts, { celebrate = false } = {}) {
  sfx.whoosh();
  if (celebrate) { sfx.victory(); fx.fireworks(4); fx.flash('#ffe066'); }
  else later(500, () => sfx.ding());
  try {
    const { openTrophy } = await import('./trophy3d.js');
    openTrophy(opts);
  } catch (err) {
    console.error(err);
    toast(`${opts.title}: ${opts.subtitle}`, 5000);
  }
}
const later = (ms, fn) => setTimeout(fn, ms);

// A trophy you haven't seen yet pops up with fireworks the next time you visit.
function celebrateNewTrophies() {
  if (!me.trophies?.length) return;
  let seen = [];
  try { seen = JSON.parse(store.get('gn:trophiesSeen') || '[]'); } catch {}
  const fresh = me.trophies.filter((t) => !seen.includes(t.id));
  store.set('gn:trophiesSeen', JSON.stringify(me.trophies.map((t) => t.id)));
  const t = fresh.sort((a, b) => a.place - b.place)[0];
  if (!t) return;
  showTrophy({ place: t.place, seasonName: t.name, playerName: me.user.name, title: 'YOU WON A TROPHY!', subtitle: `${t.nickname} Season · ${PLACE_NAMES[t.place]} · ${t.points} points` }, { celebrate: true });
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
function toast(text, ms = 3000) {
  $('toast').textContent = text;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, ms);
}

function banner(text) {
  $('banner').hidden = !text;
  $('banner').textContent = text ?? '';
}

// ---- boot -------------------------------------------------------------------------

await Promise.all([loadMe(), loadCatalog()]);
celebrateNewTrophies();
const params = new URLSearchParams(location.search);
if (params.get('login') === 'failed') {
  const why = {
    cancelled: 'Discord sign-in was cancelled.',
    expired: 'Sign-in took too long or cookies are blocked. Please try again.',
    token: `Discord rejected the sign-in. Check the Client Secret, and that this exact redirect is added in the Discord developer portal: ${me.redirectUri}`,
    profile: "Couldn't read your Discord profile. Please try again.",
  }[params.get('reason')] ?? 'Discord sign-in failed, please try again.';
  toast(why, 9000);
  const clean = new URL(location.href);
  clean.searchParams.delete('login');
  clean.searchParams.delete('reason');
  history.replaceState(null, '', clean);
}
const linked = params.get('room');
if (linked && /^[a-z]{4}$/i.test(linked)) {
  $('codeInput').value = linked.toUpperCase();
  if (store.get('gn:name') || me.user) connect(linked);
  else { route(); $('nameInput').focus(); }
} else {
  route();
}
