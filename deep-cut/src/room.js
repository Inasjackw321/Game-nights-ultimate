import { DurableObject } from 'cloudflare:workers';
import { PROMPTS } from './prompts.js';
import { classify, clusterUnknowns, compilePrompt, missedDeepCuts, scoreRound, shuffle } from './game.js';

const MAX_PLAYERS = 10;
const MAX_NAME = 16;
const MAX_ANSWER = 40;
const GRACE_MS = 500; // late packets still count if sent before the deadline
const IDLE_TTL_MS = 6 * 60 * 60 * 1000; // rooms are wiped after 6h of nobody connected

const compiled = new Map(PROMPTS.map((p) => [p.id, compilePrompt(p)]));

// One Durable Object per room. It is the only place answers live until the
// reveal, owns the clock (deadlines are enforced with storage alarms), and
// uses the WebSocket Hibernation API so idle rooms cost nothing.
export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.state = null;
    ctx.blockConcurrencyWhile(async () => {
      this.state = (await ctx.storage.get('state')) ?? null;
    });
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === '/create') {
      if (this.state && this.isLive()) return new Response('taken', { status: 409 });
      const { code } = await request.json();
      this.state = freshState(code);
      await this.save();
      return new Response('ok');
    }

    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('Expected WebSocket', { status: 426 });
    }
    const pid = url.searchParams.get('pid') ?? '';
    if (!/^[a-zA-Z0-9_-]{8,64}$/.test(pid)) return new Response('Bad player id', { status: 400 });

    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server, [pid]);
    if (!this.state) {
      server.send(JSON.stringify({ type: 'error', code: 'no_room', message: 'That room does not exist.' }));
      server.close(4004, 'no room');
    } else {
      this.broadcast(); // others see this player come back online
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, raw) {
    if (!this.state) return;
    const [pid] = this.ctx.getTags(ws);
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    const error = await this.handle(pid, msg);
    if (error) this.send(ws, { type: 'error', message: error });
  }

  async webSocketClose(ws) {
    try { ws.close(1000, 'bye'); } catch {}
    if (!this.state) return;
    // The host keeps the role through a refresh; it only moves (lazily, in
    // ensureHost) when someone else needs a host action while they're away.
    this.state.lastActive = Date.now();
    await this.commit(ws);
  }

  async webSocketError(ws) {
    await this.webSocketClose(ws);
  }

  async alarm() {
    if (!this.state) return;
    const s = this.state;
    if (s.phase === 'answering' && Date.now() >= s.deadline) {
      await this.endAnswering();
      return;
    }
    if (this.ctx.getWebSockets().length === 0 && Date.now() - s.lastActive >= IDLE_TTL_MS) {
      this.state = null;
      await this.ctx.storage.deleteAll();
      return;
    }
    await this.scheduleAlarm();
  }

  // ---- game actions ----------------------------------------------------

  async handle(pid, msg) {
    const s = this.state;
    const player = s.players[pid];
    s.lastActive = Date.now();

    if (msg.type === 'join') {
      const name = String(msg.name ?? '').trim().replace(/\s+/g, ' ').slice(0, MAX_NAME);
      if (!name) return 'Pick a name first.';
      const taken = Object.values(s.players).some((p) => p.id !== pid && p.name.toLowerCase() === name.toLowerCase());
      if (taken) return 'Someone in the room already has that name.';
      if (!player) {
        if (Object.keys(s.players).length >= MAX_PLAYERS) return `Room is full (${MAX_PLAYERS} players max).`;
        s.players[pid] = { id: pid, name, score: 0, joinedAt: Date.now() };
      } else {
        player.name = name;
      }
      if (!s.players[s.hostId]) s.hostId = pid;
      return this.commit();
    }

    if (!player) return 'Join the room first.';

    if (msg.type === 'answer') {
      if (s.phase !== 'answering') return 'Answers are closed.';
      if (Date.now() > s.deadline + GRACE_MS) return 'Too late — time is up.';
      if (pid in s.answers) return 'You already locked in an answer.';
      s.answers[pid] = String(msg.text ?? '').slice(0, MAX_ANSWER);
      const everyoneIn = this.connectedIds().every((id) => id in s.answers);
      if (everyoneIn) return this.endAnswering();
      return this.commit();
    }

    // Everything below is host-only. If the host has dropped, whoever acts
    // first takes over so the game never gets stuck.
    this.ensureHost();
    if (pid !== s.hostId) return 'Only the host can do that.';

    switch (msg.type) {
      case 'settings': {
        if (s.phase !== 'lobby') return 'Settings are locked once the game starts.';
        s.settings.rounds = clamp(Number(msg.rounds) || 7, 3, 10);
        s.settings.seconds = clamp(Number(msg.seconds) || 25, 10, 60);
        return this.commit();
      }
      case 'start': {
        if (s.phase !== 'lobby' && s.phase !== 'final') return 'A game is already running.';
        for (const p of Object.values(s.players)) p.score = 0;
        s.deck = this.dealPrompts(s.settings.rounds);
        s.round = -1;
        return this.startRound();
      }
      case 'review': {
        if (s.phase !== 'review') return 'Nothing to review.';
        if (msg.accept) s.approved[msg.key] = true;
        else delete s.approved[msg.key];
        return this.commit();
      }
      case 'reveal': {
        if (s.phase !== 'review') return 'Nothing to reveal.';
        return this.reveal();
      }
      case 'next': {
        if (s.phase !== 'reveal') return 'Not yet.';
        if (s.round + 1 >= s.deck.length) {
          s.phase = 'final';
          return this.commit();
        }
        return this.startRound();
      }
      case 'lobby': {
        if (s.phase !== 'final') return 'Finish the game first.';
        s.phase = 'lobby';
        s.result = null;
        return this.commit();
      }
      case 'kick': {
        if (msg.pid === pid || !s.players[msg.pid]) return 'Cannot remove that player.';
        delete s.players[msg.pid];
        delete s.answers[msg.pid];
        for (const ws of this.ctx.getWebSockets(msg.pid)) {
          this.send(ws, { type: 'error', code: 'kicked', message: 'The host removed you from the room.' });
          ws.close(4001, 'kicked');
        }
        return this.commit();
      }
      default:
        return 'Unknown action.';
    }
  }

  dealPrompts(n) {
    // Avoid prompts this room has already seen until the pack runs out.
    const s = this.state;
    let fresh = PROMPTS.filter((p) => !s.seen.includes(p.id));
    if (fresh.length < n) { s.seen = []; fresh = PROMPTS; }
    const deck = shuffle(fresh).slice(0, n).map((p) => p.id);
    s.seen.push(...deck);
    return deck;
  }

  async startRound() {
    const s = this.state;
    s.round += 1;
    s.phase = 'answering';
    s.answers = {};
    s.classified = {};
    s.unknowns = [];
    s.approved = {};
    s.result = null;
    s.deadline = Date.now() + s.settings.seconds * 1000;
    return this.commit();
  }

  async endAnswering() {
    const s = this.state;
    const prompt = compiled.get(s.deck[s.round]);
    // Everyone in the room this round is scored; silence counts as blank.
    for (const id of Object.keys(s.players)) {
      s.classified[id] = classify(prompt, s.answers[id] ?? '');
    }
    s.unknowns = clusterUnknowns(s.classified);
    this.ensureHost();
    const hostOnline = this.connectedIds().includes(s.hostId);
    if (s.unknowns.length && hostOnline) {
      s.phase = 'review';
      s.deadline = null;
      return this.commit();
    }
    return this.reveal();
  }

  async reveal() {
    const s = this.state;
    const prompt = compiled.get(s.deck[s.round]);
    const approved = new Set(Object.keys(s.approved));
    // Players who joined during review were never classified, so score 0.
    const { groups, misses, deltas } = scoreRound(s.classified, approved);
    for (const [id, pts] of Object.entries(deltas)) {
      if (s.players[id]) s.players[id].score += pts;
    }
    const name = (id) => s.players[id]?.name ?? 'Someone';
    s.result = {
      groups: groups.map((g) => ({ ...g, players: g.players.map(name) })),
      misses: misses.map((m) => ({ ...m, players: m.players.map(name) })),
      deltas,
      missed: missedDeepCuts(prompt, s.classified),
    };
    s.phase = 'reveal';
    s.deadline = null;
    return this.commit();
  }

  // ---- helpers ------------------------------------------------------------

  connectedIds(closing) {
    const ids = new Set();
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === closing || ws.readyState !== WebSocket.OPEN) continue;
      const [id] = this.ctx.getTags(ws);
      if (this.state.players[id]) ids.add(id);
    }
    return [...ids];
  }

  ensureHost(closing) {
    const s = this.state;
    const online = this.connectedIds(closing);
    if (s.players[s.hostId] && online.includes(s.hostId)) return;
    const next = Object.values(s.players)
      .filter((p) => online.includes(p.id))
      .sort((a, b) => a.joinedAt - b.joinedAt)[0];
    if (next) s.hostId = next.id;
    else if (!s.players[s.hostId]) s.hostId = null;
  }

  isLive() {
    return Date.now() - this.state.lastActive < IDLE_TTL_MS || this.ctx.getWebSockets().length > 0;
  }

  async save() {
    await this.ctx.storage.put('state', this.state);
    await this.scheduleAlarm();
  }

  async scheduleAlarm() {
    const s = this.state;
    const at = s.phase === 'answering'
      ? s.deadline + GRACE_MS + 100
      : Math.max(s.lastActive + IDLE_TTL_MS, Date.now() + 60 * 60 * 1000);
    await this.ctx.storage.setAlarm(at);
  }

  // Persist, then push a personalised view to every socket. Returns nothing
  // so `return this.commit()` reads as "no error".
  async commit(closing) {
    await this.save();
    this.broadcast(closing);
  }

  broadcast(closing) {
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === closing) continue;
      const [pid] = this.ctx.getTags(ws);
      this.send(ws, this.viewFor(pid, closing));
    }
  }

  send(ws, data) {
    try { ws.send(JSON.stringify(data)); } catch {}
  }

  // What one player is allowed to see. Other players' answers never leave
  // the server before the reveal; the host additionally sees off-list answers
  // (without names) during review.
  viewFor(pid, closing) {
    const s = this.state;
    const online = new Set(this.connectedIds(closing));
    const inRound = s.phase === 'answering' || s.phase === 'review' || s.phase === 'reveal';
    const prompt = inRound ? compiled.get(s.deck[s.round]) : null;
    return {
      type: 'state',
      now: Date.now(),
      you: pid,
      joined: Boolean(s.players[pid]),
      code: s.code,
      phase: s.phase,
      hostId: s.hostId,
      settings: s.settings,
      round: s.round,
      totalRounds: s.deck.length,
      prompt: prompt ? prompt.text : null,
      deadline: s.phase === 'answering' ? s.deadline : null,
      myAnswer: s.answers[pid] ?? null,
      players: Object.values(s.players)
        .sort((a, b) => a.joinedAt - b.joinedAt)
        .map((p) => ({
          id: p.id,
          name: p.name,
          score: p.score,
          connected: online.has(p.id),
          answered: p.id in s.answers,
        })),
      review: s.phase === 'review'
        ? {
            pending: s.unknowns.length,
            items: pid === s.hostId
              ? s.unknowns.map((u) => ({ key: u.key, label: u.label, count: u.players.length, accepted: Boolean(s.approved[u.key]) }))
              : null,
          }
        : null,
      result: s.phase === 'reveal' ? s.result : null,
    };
  }
}

function freshState(code) {
  return {
    code,
    phase: 'lobby',
    hostId: null,
    players: {},
    settings: { rounds: 7, seconds: 25 },
    deck: [],
    seen: [],
    round: -1,
    deadline: null,
    answers: {},
    classified: {},
    unknowns: [],
    approved: {},
    result: null,
    lastActive: Date.now(),
  };
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}
