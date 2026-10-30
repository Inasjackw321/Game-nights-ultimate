// End-to-end smoke test against a running server (npm run dev, then npm run smoke).
// Plays Deep Cut, Blackjack and Liar's Dice with bots, two of them "signed in"
// via a session cookie signed with the dev SESSION_SECRET, and checks the
// global leaderboard afterwards.
import assert from 'node:assert/strict';
import { PROMPTS } from '../src/content/prompts.js';
import { compilePrompt } from '../src/match.js';
import { sign } from '../src/auth.js';

const BASE = process.env.BASE ?? 'http://127.0.0.1:8787';
const SECRET = process.env.SESSION_SECRET ?? 'local-dev-secret-change-me';
const WS_BASE = BASE.replace(/^http/, 'ws');
const byText = new Map(PROMPTS.map((p) => [p.text, compilePrompt(p)]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Bot {
  constructor(name, code, { user } = {}) {
    Object.assign(this, { name, code, user, states: [], errors: [], waiters: [] });
    this.pid = `bot-${name}-${Math.random().toString(36).slice(2, 10)}`;
  }
  async connect() {
    const headers = {};
    if (this.user) headers.Cookie = `gn_session=${await sign({ ...this.user, exp: Date.now() + 3600e3 }, SECRET)}`;
    await new Promise((resolve, reject) => {
      this.ws = new WebSocket(`${WS_BASE}/api/rooms/${this.code}/ws?pid=${this.pid}`, { headers });
      this.ws.onopen = () => { this.send({ type: 'join', name: this.name }); resolve(); };
      this.ws.onerror = reject;
      this.ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.type === 'state') this.states.push(msg); else this.errors.push(msg);
        this.waiters = this.waiters.filter((w) => !w());
      };
    });
    return this.until((s) => s.joined, 'join');
  }
  get state() { return this.states.at(-1); }
  get game() { return this.state?.game; }
  send(msg) { this.ws.send(JSON.stringify(msg)); }
  until(pred, label, ms = 25000) {
    return new Promise((resolve, reject) => {
      const ok = (st) => { try { return pred(st); } catch { return false; } };
      const check = () => { if (this.state && ok(this.state)) { clearTimeout(t); resolve(this.state); return true; } return false; };
      const t = setTimeout(() => reject(new Error(`${this.name}: timed out waiting for ${label} (phase ${this.state?.phase}, stage ${this.game?.stage})`)), ms);
      if (!check()) this.waiters.push(check);
    });
  }
  close() { this.ws.close(); }
}

const { code } = await (await fetch(`${BASE}/api/rooms`, { method: 'POST' })).json();
assert.match(code, /^[A-Z]{4}$/);
console.log('room', code);

const stamp = Date.now().toString(36);
const host = new Bot('Host', code, { user: { id: `9${stamp}1`, name: 'Host', avatar: null } });
const ann = new Bot('Ann', code, { user: { id: `9${stamp}2`, name: 'Ann', avatar: null } });
const bo = new Bot('Bo', code);
const cy = new Bot('Cy', code);
const all = [host, ann, bo, cy];
for (const b of all) await b.connect();
await host.until((s) => s.players.length === 4 && s.players.every((p) => p.connected), 'everyone online');
assert.equal(host.state.you, `d_${host.user.id}`, 'signed-in players are keyed by Discord id');
assert.equal(host.state.hostId, host.state.you);
assert.equal(host.state.players.find((p) => p.name === 'Ann').discord, true);
assert.equal(host.state.players.find((p) => p.name === 'Bo').discord, false);

// A forged identity header from a guest must be ignored.
const forger = new WebSocket(`${WS_BASE}/api/rooms/${code}/ws?pid=forger-123456`, { headers: { 'X-GN-User': JSON.stringify({ id: '1', name: 'Mallory' }) } });
const forged = await new Promise((r) => { forger.onmessage = (e) => { r(JSON.parse(e.data)); forger.close(); }; });
assert.equal(forged.you, 'forger-123456');

ann.send({ type: 'start' });
await sleep(200);
assert.match(ann.errors.at(-1)?.message ?? '', /Only the host/);

// ---- Deep Cut ----------------------------------------------------------------
host.send({ type: 'pick', game: 'deepcut' });
host.send({ type: 'settings', key: 'rounds', value: 3 });
host.send({ type: 'settings', key: 'seconds', value: 15 });
await host.until((s) => s.settings.rounds === 3 && s.settings.seconds === 15, 'settings');
host.send({ type: 'start' });

let s = await host.until((s) => s.phase === 'playing' && s.game.stage === 'answer', 'deep cut round 1');
const prompt = byText.get(s.game.title);
const common = prompt.answers.find((a) => a.tier === 1);
const deep = prompt.answers.find((a) => a.tier === 4);
host.send({ type: 'answer', text: common.label });
ann.send({ type: 'answer', text: common.label.toLowerCase() });
bo.send({ type: 'answer', text: deep.label });
await bo.until((s) => Object.keys(s.game.marks).length === 3, 'three answers in');
for (const b of [host, ann, cy]) assert.ok(!JSON.stringify(b.states).includes(deep.label), `${b.name} saw Bo's answer early`);
// Off-list answers bounce straight back; Cy then gets a real one in.
cy.send({ type: 'answer', text: 'Zorblax Prime' });
await sleep(300);
assert.match(cy.errors.at(-1)?.message ?? '', /isn't on our list/);
assert.ok(!(cy.state.you in host.game.marks), 'a bounced answer is not locked in');
const solid = prompt.answers.find((a) => a.tier === 2);
cy.send({ type: 'answer', text: solid.label });
s = await host.until((s) => s.game.stage === 'reveal', 'instant reveal (no host review)');
const score = (st, name) => st.players.find((p) => p.name === name).score;
assert.deepEqual(['Host', 'Ann', 'Bo', 'Cy'].map((n) => score(s, n)), [50, 50, 500, 200]);
console.log('deep cut round 1:', s.game.result.groups.map((g) => `${g.label}×${g.count}=${g.points}`).join(', '));

// Round 2: Cy drops and comes back; only Ann answers so the alarm closes it.
cy.close();
await host.until((s) => !s.players.find((p) => p.name === 'Cy').connected, 'cy offline');
host.send({ type: 'next' });
s = await host.until((s) => s.game.stage === 'answer' && s.game.round === 1, 'round 2');
const cyBack = new Bot('Cy', code);
cyBack.pid = cy.pid;
await cyBack.connect();
assert.equal(score(cyBack.state, 'Cy'), 200, 'score survives a reconnect');
assert.equal(cyBack.state.players.length, 4);
ann.send({ type: 'answer', text: byText.get(s.game.title).answers.find((a) => a.tier === 2).label });
const t0 = Date.now();
await host.until((s) => s.game.stage === 'reveal' && s.game.round === 1, 'deadline reveal', 25000);
assert.ok(Date.now() - t0 > 8000, 'round closed by the alarm, not early');
host.send({ type: 'next' });
s = await host.until((s) => s.game.round === 2, 'round 3');
const r3 = byText.get(s.game.title).answers.find((a) => a.tier === 1).label;
for (const b of [host, ann, bo, cyBack]) b.send({ type: 'answer', text: r3 });
await host.until((s) => s.game.stage === 'reveal' && s.game.round === 2, 'reveal 3');
host.send({ type: 'next' });
s = await host.until((s) => s.phase === 'final', 'deep cut final');
assert.equal(s.final.ranking[0].name, 'Bo');
assert.equal(s.final.ranked, true);
assert.equal(s.night[bo.pid].pearls, 3);
console.log('deep cut final:', s.final.ranking.map((r) => `${r.place}. ${r.name} ${r.score}`).join(', '));

// ---- Blackjack -------------------------------------------------------------------
const players = [host, ann, bo, cyBack];
host.send({ type: 'pick', game: 'blackjack' });
host.send({ type: 'settings', key: 'rounds', value: 5 });
await host.until((s) => s.phase === 'lobby' && s.gameId === 'blackjack' && s.settings.rounds === 5, 'blackjack picked');
host.send({ type: 'start' });
for (let hand = 1; hand <= 5; hand++) {
  await host.until((s) => s.phase === 'playing' && s.game.stage === 'bet' && s.game.round === hand - 1, `bet ${hand}`);
  for (const b of players) b.send({ type: 'bet', amount: 100 });
  await host.until((s) => s.game.stage !== 'bet', `deal ${hand}`);
  // Everyone stands on 15+, hits otherwise.
  while (host.game.stage === 'play') {
    for (const b of players) {
      const mine = b.game.mine;
      if (mine && !mine.done) b.send({ type: mine.total < 15 ? 'hit' : 'stand' });
    }
    await sleep(150);
  }
  s = await host.until((s) => s.game.stage === 'settle', `settle ${hand}`);
  const chips = s.players.filter((p) => p.inGame).reduce((a, p) => a + p.score, 0);
  assert.ok(chips >= 0);
  host.send({ type: 'next' });
}
s = await host.until((s) => s.phase === 'final' && s.final.gameId === 'blackjack', 'blackjack final');
console.log('blackjack final:', s.final.ranking.map((r) => `${r.name} ◆${r.score}`).join(', '));

// ---- Liar's Dice (host leaves mid-game; Ann inherits host duties) ---------------
host.send({ type: 'pick', game: 'dice' });
host.send({ type: 'settings', key: 'dice', value: 2 });
await host.until((s) => s.gameId === 'dice' && s.settings.dice === 2, 'dice picked');
host.send({ type: 'start' });
await host.until((s) => s.phase === 'playing', 'dice start');
let leftHost = false;
const dicePlayers = () => (leftHost ? [ann, bo, cyBack] : players);
while (ann.state.phase === 'playing') {
  const v = ann.game;
  if (v.stage === 'bid') {
    const actor = dicePlayers().find((b) => b.state.you === v.active);
    if (actor) {
      if (v.bid) actor.send({ type: 'liar' });
      else actor.send({ type: 'bid', qty: 1, face: 2 });
    }
  } else if (v.stage === 'reveal') {
    if (!leftHost) { host.close(); leftHost = true; await sleep(300); }
    ann.send({ type: 'next' });
  }
  await sleep(250);
}
s = ann.state;
assert.equal(s.phase, 'final');
assert.equal(s.hostId, ann.state.you, 'host role moved to Ann');
console.log('dice final:', s.final.ranking.map((r) => `${r.place}. ${r.name}`).join(', '));

// ---- Global leaderboard -------------------------------------------------------------
const board = await (await fetch(`${BASE}/api/leaderboard?game=all`)).json();
const hostRow = board.rows.find((r) => r.id === host.user.id);
const annRow = board.rows.find((r) => r.id === ann.user.id);
assert.ok(hostRow && annRow, 'signed-in players are on the global board');
assert.equal(hostRow.games, 3);
assert.ok(!board.rows.some((r) => r.name === 'Bo'), 'guests are not on the board');
const dc = await (await fetch(`${BASE}/api/leaderboard?game=deepcut`)).json();
assert.ok(dc.rows.some((r) => r.id === ann.user.id));
console.log('leaderboard:', board.rows.filter((r) => [host.user.id, ann.user.id].includes(r.id)).map((r) => `${r.name} ${r.wins}W/${r.games}G`).join(', '));

for (const b of [ann, bo, cyBack]) b.close();
console.log('smoke test passed');
