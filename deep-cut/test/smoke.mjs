// End-to-end smoke test: plays a full 3-prompt game with four bots against a
// running server.   npm run dev   then   npm run smoke  (or BASE=https://… npm run smoke)
import assert from 'node:assert/strict';
import { PROMPTS } from '../src/prompts.js';
import { compilePrompt } from '../src/game.js';

const BASE = process.env.BASE ?? 'http://127.0.0.1:8787';
const WS_BASE = BASE.replace(/^http/, 'ws');
const byText = new Map(PROMPTS.map((p) => [p.text, compilePrompt(p)]));

class Bot {
  constructor(name, code) {
    this.name = name;
    this.code = code;
    this.pid = `bot-${name}-${Math.random().toString(36).slice(2, 10)}`;
    this.states = [];
    this.errors = [];
    this.waiters = [];
  }
  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(`${WS_BASE}/api/rooms/${this.code}/ws?pid=${this.pid}`);
      this.ws.onopen = () => { this.send({ type: 'join', name: this.name }); resolve(); };
      this.ws.onerror = reject;
      this.ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.type === 'state') this.states.push(msg);
        else this.errors.push(msg);
        this.waiters = this.waiters.filter((w) => !w());
      };
    });
  }
  get state() { return this.states.at(-1); }
  send(msg) { this.ws.send(JSON.stringify(msg)); }
  until(pred, label, ms = 20000) {
    return new Promise((resolve, reject) => {
      const check = () => { if (this.state && pred(this.state)) { clearTimeout(t); resolve(this.state); return true; } return false; };
      const t = setTimeout(() => reject(new Error(`${this.name}: timed out waiting for ${label} (phase ${this.state?.phase})`)), ms);
      if (!check()) this.waiters.push(check);
    });
  }
  close() { this.ws.close(); }
}

const { code } = await (await fetch(`${BASE}/api/rooms`, { method: 'POST' })).json();
assert.match(code, /^[A-Z]{4}$/);
console.log('room', code);

const [host, ann, bo, cy] = ['Host', 'Ann', 'Bo', 'Cy'].map((n) => new Bot(n, code));
for (const b of [host, ann, bo, cy]) {
  await b.connect();
  await b.until((s) => s.joined, 'join');
}
await host.until((s) => s.players.length === 4 && s.players.every((p) => p.connected), 'everyone online');
assert.equal(host.state.hostId, host.pid, 'first joiner is host');

// Guests can't drive the game; names must be unique.
ann.send({ type: 'start' });
await new Promise((r) => setTimeout(r, 200));
assert.match(ann.errors.at(-1)?.message ?? '', /Only the host/);
const dupe = new Bot('host', code);
await dupe.connect();
await new Promise((r) => setTimeout(r, 200));
assert.match(dupe.errors.at(-1)?.message ?? '', /already has that name/);
dupe.close();

host.send({ type: 'settings', rounds: 3, seconds: 10 });
await host.until((s) => s.settings.rounds === 3 && s.settings.seconds === 10, 'settings');
host.send({ type: 'start' });

// ---- Round 1: duplicates, a deep cut, an off-list answer the host approves.
let s = await host.until((s) => s.phase === 'answering' && s.round === 0, 'round 1');
let p = byText.get(s.prompt);
const common = p.answers.find((a) => a.tier === 1);
const deep = p.answers.find((a) => a.tier === 4);
host.send({ type: 'answer', text: common.label });
ann.send({ type: 'answer', text: common.label.toLowerCase() });
bo.send({ type: 'answer', text: deep.label });
await bo.until((s) => s.players.filter((x) => x.answered).length === 3, 'three answers in');
for (const b of [host, ann, bo, cy]) {
  const raw = JSON.stringify(b.states);
  if (b !== bo) assert.ok(!raw.includes(deep.label), `${b.name} could see Bo's answer before the reveal`);
}
cy.send({ type: 'answer', text: 'Zorblax Prime' });

s = await host.until((s) => s.phase === 'review', 'review');
assert.equal(s.review.items.length, 1);
assert.equal(ann.state.review.items, null, 'only the host sees off-list answers');
host.send({ type: 'review', key: s.review.items[0].key, accept: true });
await host.until((s) => s.review?.items?.[0]?.accepted, 'approval');
host.send({ type: 'reveal' });
s = await host.until((s) => s.phase === 'reveal', 'reveal 1');
console.log('round 1:', s.prompt, s.result.groups.map((g) => `${g.label}×${g.count}=${g.points}`).join(', '));
const score = (st, name) => st.players.find((x) => x.name === name).score;
assert.equal(score(s, 'Host'), 50);
assert.equal(score(s, 'Ann'), 50);
assert.equal(score(s, 'Bo'), 500);
assert.equal(score(s, 'Cy'), 350);
assert.equal(s.result.groups.at(-1).label, deep.label, 'rarest answer is revealed last');

// ---- Round 2: Cy drops and reconnects; nobody but Ann answers, so the
// server's alarm has to close the round at the deadline.
cy.close();
await host.until((s) => !s.players.find((x) => x.name === 'Cy').connected, 'cy offline');
host.send({ type: 'next' });
s = await host.until((s) => s.phase === 'answering' && s.round === 1, 'round 2');
const cyBack = new Bot('Cy', code);
cyBack.pid = cy.pid;
await cyBack.connect();
await cyBack.until((s) => s.phase === 'answering', 'cy rejoins mid-round');
assert.equal(score(cyBack.state, 'Cy'), 350, 'score survives a reconnect');
assert.equal(cyBack.state.players.length, 4, 'reconnect did not create a new player');
p = byText.get(s.prompt);
ann.send({ type: 'answer', text: p.answers.find((a) => a.tier === 2).label });
const t0 = Date.now();
s = await host.until((s) => s.phase === 'reveal' && s.round === 1, 'deadline reveal', 15000);
const waited = Date.now() - t0;
assert.ok(waited > 5000, `round ended early (${waited}ms)`);
assert.equal(s.result.deltas[ann.pid], 200);
console.log(`round 2: closed by alarm after ${waited}ms`);

// ---- Round 3: host leaves; Ann inherits host duties when she acts.
host.send({ type: 'next' });
s = await ann.until((s) => s.phase === 'answering' && s.round === 2, 'round 3');
for (const b of [host, ann, bo, cyBack]) b.send({ type: 'answer', text: 'qqqqqq' });
await ann.until((s) => s.phase === 'review', 'review 3');
host.close();
await ann.until((s) => !s.players.find((x) => x.name === 'Host').connected, 'host offline');
ann.send({ type: 'reveal' });
s = await ann.until((s) => s.phase === 'reveal' && s.round === 2, 'reveal 3');
assert.equal(s.hostId, ann.pid, 'host role moved to Ann');
assert.equal(s.result.groups.length, 0);
ann.send({ type: 'next' });
s = await ann.until((s) => s.phase === 'final', 'final');
console.log('final:', s.players.map((x) => `${x.name} ${x.score}`).join(', '));

for (const b of [ann, bo, cyBack]) b.close();
console.log('smoke test passed');
