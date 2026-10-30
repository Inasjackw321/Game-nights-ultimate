// Deep Cut client. The server is authoritative; this file only renders the
// state it is sent and forwards player actions.

const $ = (id) => document.getElementById(id);
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};

// A stable per-browser player id, so a refresh or dropped connection rejoins
// as the same player instead of a new one.
let pid = store.get('deepcut:pid');
if (!pid) {
  pid = (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(/[^a-zA-Z0-9-]/g, '');
  store.set('deepcut:pid', pid);
}

let ws = null;
let roomCode = null;
let state = null;
let clockOffset = 0; // serverNow - clientNow
let retry = 0;
let fatal = false;
let shownRound = null; // which round the answer box was last reset for
let revealedRound = null; // which round's reveal has already animated
let revealDone = true;

// ---- connection ----------------------------------------------------------

function connect(code) {
  roomCode = code.toUpperCase();
  fatal = false;
  const url = new URL(location.href);
  url.searchParams.set('room', roomCode);
  history.replaceState(null, '', url);
  $('roomTag').textContent = roomCode;
  $('roomTag').hidden = false;
  open();
}

function open() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${proto}//${location.host}/api/rooms/${roomCode}/ws?pid=${encodeURIComponent(pid)}`);
  ws.onopen = () => {
    retry = 0;
    banner(null);
    send({ type: 'join', name: store.get('deepcut:name') || 'Player' });
  };
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type === 'state') {
      clockOffset = msg.now - Date.now();
      state = msg;
      render();
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
    banner('Connection lost — reconnecting…');
    const delay = Math.min(5000, 500 * 2 ** retry++);
    setTimeout(() => roomCode && !fatal && open(), delay);
  };
}

function send(msg) {
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
  show('home');
  if (message) toast(message);
}

// ---- home ----------------------------------------------------------------

$('nameInput').value = store.get('deepcut:name') || '';
$('codeInput').addEventListener('input', (e) => {
  e.target.value = e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
});

$('homeForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('nameInput').value.trim();
  if (!name) return $('nameInput').focus();
  store.set('deepcut:name', name);

  if (e.submitter?.dataset.action === 'join') {
    const code = $('codeInput').value.trim();
    if (code.length !== 4) { toast('Room codes are 4 letters.'); return $('codeInput').focus(); }
    // Already connected but not joined (e.g. the name was taken): just retry.
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

// ---- host & player actions ------------------------------------------------

$('shareBtn').onclick = async () => {
  const link = `${location.origin}${location.pathname}?room=${roomCode}`;
  try {
    if (navigator.share && matchMedia('(pointer: coarse)').matches) await navigator.share({ title: 'Deep Cut', text: `Join my Deep Cut room: ${roomCode}`, url: link });
    else { await navigator.clipboard.writeText(link); toast('Invite link copied'); }
  } catch {}
};
$('roundsSel').onchange = $('secondsSel').onchange = () =>
  send({ type: 'settings', rounds: Number($('roundsSel').value), seconds: Number($('secondsSel').value) });
$('startBtn').onclick = () => send({ type: 'start' });
$('revealBtn').onclick = () => send({ type: 'reveal' });
$('nextBtn').onclick = () => send({ type: 'next' });
$('againBtn').onclick = () => send({ type: 'start' });
$('lobbyBtn').onclick = () => send({ type: 'lobby' });

$('answerForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const text = $('answerInput').value.trim();
  if (!text) return $('answerInput').focus();
  send({ type: 'answer', text });
});

$('lobbyPlayers').addEventListener('click', (e) => {
  const id = e.target.closest('[data-kick]')?.dataset.kick;
  const p = state?.players.find((x) => x.id === id);
  if (p && confirm(`Remove ${p.name} from the room?`)) send({ type: 'kick', pid: id });
});

$('reviewList').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-key]');
  if (btn) send({ type: 'review', key: btn.dataset.key, accept: btn.dataset.accept === '1' });
});

// ---- rendering ---------------------------------------------------------------

const SCREENS = ['home', 'lobby', 'answering', 'review', 'reveal', 'final'];
function show(name) {
  for (const s of SCREENS) $(`screen-${s}`).hidden = s !== name;
}

// Mirrors the server: if the host is offline, the longest-standing online
// player can act as host (the server hands the role over when they do).
function amHost() {
  if (state.you === state.hostId) return true;
  const host = state.players.find((p) => p.id === state.hostId);
  if (host?.connected) return false;
  return state.players.find((p) => p.connected)?.id === state.you;
}

function render() {
  const s = state;
  if (!s.joined) {
    // Connected but not in the room yet (name taken, room full): back to the form.
    $('codeInput').value = s.code;
    return show('home');
  }
  document.body.classList.toggle('is-host', amHost());
  show(s.phase);
  ({ lobby: renderLobby, answering: renderAnswering, review: renderReview, reveal: renderReveal, final: renderFinal })[s.phase]();
}

function renderLobby() {
  const s = state;
  const host = amHost();
  $('lobbyCode').textContent = s.code;
  $('playerCount').textContent = `${s.players.length}/10`;
  $('lobbyPlayers').innerHTML = s.players.map((p) => `
    <li>
      <span class="dot ${p.connected ? '' : 'off'}"></span>
      <span class="name">${esc(p.name)}</span>
      ${p.id === s.hostId ? '<span class="tag">host</span>' : ''}
      ${p.id === s.you ? '<span class="tag you">you</span>' : ''}
      ${host && p.id !== s.you ? `<button class="kick" data-kick="${esc(p.id)}" aria-label="Remove ${esc(p.name)}">×</button>` : ''}
    </li>`).join('');
  $('roundsSel').value = String(s.settings.rounds);
  $('secondsSel').value = String(s.settings.seconds);
  ensureOption($('roundsSel'), s.settings.rounds);
  ensureOption($('secondsSel'), s.settings.seconds);
  const n = s.players.filter((p) => p.connected).length;
  $('lobbyHint').textContent = n < 3 ? 'Deep Cut works best with 3 or more players. Share the code!' : `${n} players ready.`;
}

function renderAnswering() {
  const s = state;
  if (shownRound !== s.round) {
    shownRound = s.round;
    $('answerInput').value = '';
    setTimeout(() => $('answerInput').focus(), 50);
  }
  $('roundLabel').textContent = `PROMPT ${s.round + 1} OF ${s.totalRounds}`;
  $('promptText').textContent = s.prompt;
  const locked = s.myAnswer !== null;
  $('answerForm').hidden = locked || !s.joined;
  $('lockedBox').hidden = !locked;
  $('lockedAnswer').textContent = s.myAnswer ?? '';
  $('answerChips').innerHTML = s.players.map((p) =>
    `<li class="${p.answered ? 'done' : ''} ${p.connected ? '' : 'off'}">${p.answered ? '✓ ' : ''}${esc(p.name)}</li>`).join('');
}

// Countdown runs off the server's deadline, corrected for clock skew.
function tick() {
  if (state?.phase === 'answering' && state.deadline) {
    const left = Math.max(0, state.deadline - (Date.now() + clockOffset));
    const total = state.settings.seconds * 1000;
    $('timerFill').style.transform = `scaleX(${left / total})`;
    $('timerNum').textContent = Math.ceil(left / 1000);
    $('timerNum').classList.toggle('hurry', left < 5000);
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

function renderReview() {
  const s = state;
  $('reviewRound').textContent = `PROMPT ${s.round + 1} OF ${s.totalRounds}`;
  $('reviewPrompt').textContent = s.prompt;
  const n = s.review.pending;
  $('reviewWait').textContent = `The host is checking ${n} answer${n === 1 ? '' : 's'} that ${n === 1 ? "isn't" : "aren't"} on the list…`;
  const items = s.review.items;
  if (!items) {
    $('reviewList').innerHTML = '<li><span class="label muted">Taking over as host — one moment…</span></li>';
    return;
  }
  $('reviewList').innerHTML = items.map((u) => `
    <li class="${u.accepted ? 'ok' : ''}">
      <span class="label">${esc(u.label)}</span>
      ${u.count > 1 ? `<span class="count">×${u.count}</span>` : ''}
      <span class="toggle">
        <button class="btn yes ${u.accepted ? 'on' : ''}" data-key="${esc(u.key)}" data-accept="1">Accept</button>
        <button class="btn no ${u.accepted ? '' : 'on'}" data-key="${esc(u.key)}" data-accept="0">Reject</button>
      </span>
    </li>`).join('');
}

function renderReveal() {
  const s = state;
  const r = s.result;
  const animate = revealedRound !== s.round;
  revealedRound = s.round;
  const STEP = 650;

  $('revealRound').textContent = `PROMPT ${s.round + 1} OF ${s.totalRounds}`;
  $('revealPrompt').textContent = s.prompt;
  $('groups').innerHTML = r.groups.length
    ? r.groups.map((g, i) => `
      <li class="group t${g.tier} ${g.count === 1 ? 'solo' : ''} ${animate ? 'animate' : ''}" style="animation-delay:${i * STEP}ms">
        <span class="label">${esc(g.label)}</span>
        <span class="pts">+${g.points}</span>
        <span class="meta"><span class="tier">${g.approved ? 'Approved · Rare' : g.tierName}</span> · ${g.count === 1 ? 'only one' : `${g.count} said it`}</span>
        <span class="who">${g.players.map(esc).join(', ')}</span>
      </li>`).join('')
    : '<li class="muted">No accepted answers this round.</li>';

  $('misses').innerHTML = r.misses.map((m) =>
    `<div class="miss">${m.reason === 'No answer' ? 'No answer' : `<s>${esc(m.label)}</s> not accepted`}: ${m.players.map(esc).join(', ')}</div>`).join('');
  $('missedCuts').innerHTML = r.missed.length
    ? `Deep cuts nobody said: ${r.missed.map((x) => `<b>${esc(x)}</b>`).join(', ')}`
    : '';

  renderBoard($('revealBoard'), r.deltas);
  $('nextBtn').textContent = s.round + 1 >= s.totalRounds ? 'Final scores' : 'Next prompt';

  if (animate) {
    revealDone = false;
    $('nextBtn').disabled = true;
    setTimeout(() => { revealDone = true; $('nextBtn').disabled = false; }, r.groups.length * STEP + 400);
  } else {
    $('nextBtn').disabled = !revealDone;
  }
}

function renderFinal() {
  const ranked = [...state.players].sort((a, b) => b.score - a.score);
  const top = ranked[0];
  const tied = ranked.filter((p) => p.score === top?.score);
  $('winnerLine').textContent = !top ? 'Game over'
    : tied.length > 1 ? `It's a tie: ${tied.map((p) => p.name).join(' & ')}!`
    : `${top.name} wins!`;
  renderBoard($('finalBoard'));
}

function renderBoard(el, deltas) {
  const ranked = [...state.players].sort((a, b) => b.score - a.score);
  el.innerHTML = ranked.map((p) => {
    const d = deltas?.[p.id];
    return `<li class="${p.id === state.you ? 'me' : ''}">
      <span class="name">${esc(p.name)}</span>
      ${deltas ? `<span class="delta ${d ? '' : 'zero'}">+${d ?? 0}</span>` : ''}
      <span class="score">${p.score}</span>
    </li>`;
  }).join('');
}

// ---- utilities --------------------------------------------------------------

function ensureOption(select, value) {
  if (![...select.options].some((o) => Number(o.value) === value)) {
    select.add(new Option(String(value)));
    select.value = String(value);
  }
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

let toastTimer;
function toast(text) {
  $('toast').textContent = text;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 2800);
}

function banner(text) {
  $('banner').hidden = !text;
  $('banner').textContent = text ?? '';
}

// ---- boot ---------------------------------------------------------------------

const linked = new URLSearchParams(location.search).get('room');
if (linked && /^[a-z]{4}$/i.test(linked)) {
  $('codeInput').value = linked.toUpperCase();
  if (store.get('deepcut:name')) connect(linked);
  else { show('home'); $('nameInput').focus(); }
} else {
  show('home');
}
