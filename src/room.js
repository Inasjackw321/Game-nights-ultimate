import { DurableObject } from 'cloudflare:workers';
import { CATALOG, GAME_BY_ID, defaultSettings } from './games/index.js';
import { GRACE_MS } from './games/kit.js';
import { seasonPoints } from './seasons.js';

const MAX_PLAYERS = 10;
const MAX_NAME = 16;
const IDLE_TTL_MS = 6 * 60 * 60 * 1000; // rooms are wiped after 6h with nobody around
const MIN_RANKED_PLAYERS = 3; // games with fewer players don't count globally
export const CREATURES = ['crab', 'jelly', 'turtle', 'octopus', 'seahorse', 'eel', 'fish', 'squid', 'ray', 'whale'];
const REACTION_COUNT = 6; // matches REACTIONS in public/app.js
const REACT_COOLDOWN_MS = 400;
const MAX_RTC_BYTES = 16 * 1024;
// Pearls for the room's "tonight" leaderboard: 1st, 2nd, 3rd place.
const PEARLS = [3, 2, 1];

// One Durable Object per room code. It holds the only copy of hidden
// information (answers, cards, dice) and owns the clock: every deadline is a
// storage alarm, so timing never depends on players' devices. WebSocket
// Hibernation keeps idle rooms free.
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

    if (request.headers.get('Upgrade') !== 'websocket') return new Response('Expected WebSocket', { status: 426 });

    // Signed-in players are identified by their Discord account (the worker
    // verified the session cookie); guests by a random id their browser keeps.
    const user = parseUser(request.headers.get('X-GN-User'));
    const guestId = url.searchParams.get('pid') ?? '';
    if (!user && !/^[a-zA-Z0-9-]{8,64}$/.test(guestId)) return new Response('Bad player id', { status: 400 });
    const pid = user ? `d_${user.id}` : guestId;

    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server, [pid]);
    server.serializeAttachment({ user });
    if (!this.state) {
      this.send(server, { type: 'error', code: 'no_room', message: 'That room does not exist.' });
      server.close(4004, 'no room');
    } else {
      this.broadcast();
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, raw) {
    if (!this.state) return;
    const [pid] = this.ctx.getTags(ws);
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    if (!msg || typeof msg !== 'object') return;

    // Voice chat set-up messages (WebRTC offers/answers/ICE) are relayed to one
    // player and never stored. The audio itself goes directly between players.
    if (msg.type === 'rtc') {
      const to = String(msg.to ?? '');
      if (!this.state.players[pid] || !this.state.players[to] || to === pid) return;
      if (JSON.stringify(msg.data ?? null).length > MAX_RTC_BYTES) return;
      for (const sock of this.ctx.getWebSockets(to)) this.send(sock, { type: 'rtc', from: pid, data: msg.data });
      return;
    }

    // Emoji reactions are fire-and-forget: relayed to everyone, never stored.
    if (msg.type === 'react') {
      const r = Number(msg.r);
      const now = Date.now();
      this.lastReact ??= new Map();
      if (!this.state.players[pid] || !(r >= 0 && r < REACTION_COUNT) || now - (this.lastReact.get(pid) ?? 0) < REACT_COOLDOWN_MS) return;
      this.lastReact.set(pid, now);
      for (const sock of this.ctx.getWebSockets()) this.send(sock, { type: 'react', pid, r });
      return;
    }

    this.state.lastActive = Date.now();
    const error = this.handle(pid, msg, ws);
    if (error) this.send(ws, { type: 'error', message: error });
    await this.afterChange();
  }

  async webSocketClose(ws) {
    try { ws.close(1000, 'bye'); } catch {}
    if (!this.state) return;
    // The host keeps the role through a refresh; it only moves (lazily) when
    // someone else needs a host action while they're away.
    this.state.lastActive = Date.now();
    // Last tab closed: they've left voice chat too.
    const [pid] = this.ctx.getTags(ws);
    const player = this.state.players[pid];
    if (player?.voice && !this.ctx.getWebSockets(pid).some((s) => s !== ws && s.readyState === WebSocket.OPEN)) player.voice = false;
    await this.afterChange(ws);
  }

  async webSocketError(ws) {
    await this.webSocketClose(ws);
  }

  async alarm() {
    if (!this.state) return;
    const s = this.state;
    if (s.phase === 'playing' && s.game?.deadline && Date.now() >= s.game.deadline) {
      GAME_BY_ID[s.gameId].timeout(s.game, this.makeCtx());
      await this.afterChange();
      return;
    }
    if (this.ctx.getWebSockets().length === 0 && Date.now() - s.lastActive >= IDLE_TTL_MS) {
      this.state = null;
      await this.ctx.storage.deleteAll();
      return;
    }
    await this.scheduleAlarm();
  }

  // ---- actions -------------------------------------------------------------

  handle(pid, msg, ws) {
    const s = this.state;
    const player = s.players[pid];

    if (msg.type === 'join') {
      const { user } = ws.deserializeAttachment() ?? {};
      const name = String(msg.name ?? user?.name ?? '').trim().replace(/\s+/g, ' ').slice(0, MAX_NAME);
      if (!name) return 'Pick a name first.';
      const taken = Object.values(s.players).some((p) => p.id !== pid && p.name.toLowerCase() === name.toLowerCase());
      if (taken) return 'Someone in the room already has that name.';
      if (!player) {
        if (Object.keys(s.players).length >= MAX_PLAYERS) return `Room is full (${MAX_PLAYERS} players max).`;
        const used = new Set(Object.values(s.players).map((p) => p.look));
        s.players[pid] = {
          id: pid,
          name,
          look: CREATURES.find((c) => !used.has(c)) ?? CREATURES[0],
          joinedAt: Date.now(),
          userId: user?.id ?? null,
          avatar: user?.avatar ?? null,
        };
      } else {
        player.name = name;
        if (user) player.avatar = user.avatar;
      }
      if (!s.players[s.hostId]) s.hostId = pid;
      return;
    }

    if (!player) return 'Join the room first.';

    if (msg.type === 'voice') {
      player.voice = Boolean(msg.on);
      player.voiceMuted = Boolean(msg.on && msg.muted);
      return;
    }

    if (msg.type === 'look') {
      if (!CREATURES.includes(msg.look)) return 'Unknown creature.';
      if (Object.values(s.players).some((p) => p.id !== pid && p.look === msg.look)) return 'Someone already picked that one.';
      player.look = msg.look;
      return;
    }

    if (s.phase === 'playing' && !['end', 'kick'].includes(msg.type)) {
      const err = GAME_BY_ID[s.gameId].action(s.game, pid, msg, this.makeCtx());
      return err;
    }

    // Room-level actions are host-only. If the host has dropped, whoever acts
    // first takes over so the night never gets stuck.
    this.ensureHost();
    if (pid !== s.hostId) return 'Only the host can do that.';

    switch (msg.type) {
      case 'pick': {
        if (s.phase === 'playing') return 'Finish this game first.';
        const game = GAME_BY_ID[msg.game];
        if (!game) return 'Unknown game.';
        s.gameId = game.meta.id;
        s.settings = defaultSettings(game.meta);
        s.phase = 'lobby';
        return;
      }
      case 'settings': {
        if (s.phase !== 'lobby') return 'Settings are locked once the game starts.';
        const opt = GAME_BY_ID[s.gameId].meta.options.find((o) => o.key === msg.key);
        const value = Number(msg.value);
        if (!opt || !opt.values.includes(value)) return 'Invalid setting.';
        s.settings[opt.key] = value;
        return;
      }
      case 'start': {
        if (s.phase === 'playing') return 'A game is already running.';
        const game = GAME_BY_ID[s.gameId];
        const ids = this.connectedIds().sort((a, b) => s.players[a].joinedAt - s.players[b].joinedAt);
        if (ids.length < game.meta.minPlayers) return `${game.meta.name} needs at least ${game.meta.minPlayers} players.`;
        s.game = game.init(this.makeCtx({ ids }));
        s.phase = 'playing';
        s.final = null;
        return;
      }
      case 'end': {
        if (s.phase !== 'playing') return 'No game is running.';
        s.game = null;
        s.phase = 'lobby';
        return;
      }
      case 'lobby': {
        if (s.phase !== 'final') return 'Finish the game first.';
        s.phase = 'lobby';
        s.game = null;
        s.final = null;
        return;
      }
      case 'kick': {
        if (msg.pid === pid || !s.players[msg.pid]) return 'Cannot remove that player.';
        if (s.phase === 'playing' && s.game?.ids.includes(msg.pid)) return 'You can only remove players between games.';
        delete s.players[msg.pid];
        for (const sock of this.ctx.getWebSockets(msg.pid)) {
          this.send(sock, { type: 'error', code: 'kicked', message: 'The host removed you from the room.' });
          sock.close(4001, 'kicked');
        }
        return;
      }
      default:
        return 'Unknown action.';
    }
  }

  async afterChange(closing) {
    const s = this.state;
    if (s.phase === 'playing' && s.game?.over) await this.finishGame();
    await this.save();
    this.broadcast(closing);
  }

  async finishGame() {
    const s = this.state;
    const g = s.game;
    const ranking = g.ids
      .map((id) => ({ id, name: s.players[id]?.name ?? 'Someone', score: g.scores[id] ?? 0 }))
      .sort((a, b) => b.score - a.score);
    // Competition ranking: ties share a place.
    ranking.forEach((r, i) => { r.place = i > 0 && r.score === ranking[i - 1].score ? ranking[i - 1].place : i + 1; });

    for (const r of ranking) {
      const n = (s.night[r.id] ??= { wins: 0, games: 0, pearls: 0 });
      n.games += 1;
      if (r.place === 1) n.wins += 1;
      n.pearls += PEARLS[r.place - 1] ?? 0;
    }

    const ranked = ranking.length >= MIN_RANKED_PLAYERS;
    // Season points for signed-in players (guests don't have a season record).
    const season = ranked
      ? Object.fromEntries(ranking.filter((r) => s.players[r.id]?.userId).map((r) => [r.id, seasonPoints(r.place, ranking.length)]))
      : {};
    s.final = { gameId: s.gameId, ranking, ranked, season };
    s.phase = 'final';

    const results = ranking
      .filter((r) => s.players[r.id]?.userId)
      .map((r) => ({ userId: s.players[r.id].userId, score: r.score, place: r.place }));
    if (ranked && results.length && this.env.HUB) {
      try {
        await this.env.HUB.get(this.env.HUB.idFromName('global')).fetch('https://hub/record', {
          method: 'POST',
          body: JSON.stringify({ game: s.gameId, players: ranking.length, results }),
        });
      } catch (err) {
        console.error('leaderboard record failed', err);
      }
    }
  }

  // ---- helpers ---------------------------------------------------------------

  makeCtx(extra = {}) {
    const s = this.state;
    const online = new Set(this.connectedIds());
    s.seen[s.gameId] ??= [];
    return {
      now: Date.now(),
      settings: s.settings,
      seen: s.seen[s.gameId],
      rand: Math.random,
      name: (id) => s.players[id]?.name ?? 'Someone',
      online: (id) => online.has(id),
      hostOnline: () => online.size > 0,
      // `peek` checks without handing the host role over (used by views).
      isHost: (id, { peek } = {}) => {
        if (peek) return id === this.effectiveHost(online);
        this.ensureHost();
        return id === s.hostId;
      },
      ...extra,
    };
  }

  connectedIds(closing) {
    const ids = new Set();
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === closing || ws.readyState !== WebSocket.OPEN) continue;
      const [id] = this.ctx.getTags(ws);
      if (this.state.players[id]) ids.add(id);
    }
    return [...ids];
  }

  // The host if they're online, otherwise the longest-standing online player.
  effectiveHost(online) {
    const s = this.state;
    if (online.has(s.hostId)) return s.hostId;
    return Object.values(s.players).filter((p) => online.has(p.id)).sort((a, b) => a.joinedAt - b.joinedAt)[0]?.id ?? s.hostId;
  }

  ensureHost() {
    this.state.hostId = this.effectiveHost(new Set(this.connectedIds()));
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
    const deadline = s.phase === 'playing' ? s.game?.deadline : null;
    const at = deadline
      ? deadline + GRACE_MS + 100
      : Math.max(s.lastActive + IDLE_TTL_MS, Date.now() + 60 * 60 * 1000);
    await this.ctx.storage.setAlarm(at);
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

  // What one player may see. Hidden information is filtered by each game's view().
  viewFor(pid, closing) {
    const s = this.state;
    const online = new Set(this.connectedIds(closing));
    const game = GAME_BY_ID[s.gameId];
    const ctx = { ...this.makeCtx(), online: (id) => online.has(id) };
    const scores = s.game?.scores ?? {};
    return {
      type: 'state',
      now: Date.now(),
      you: pid,
      joined: Boolean(s.players[pid]),
      code: s.code,
      phase: s.phase,
      hostId: s.hostId,
      actingHost: this.effectiveHost(online),
      catalog: CATALOG,
      gameId: s.gameId,
      settings: s.settings,
      players: Object.values(s.players)
        .sort((a, b) => a.joinedAt - b.joinedAt)
        .map((p) => ({
          id: p.id,
          name: p.name,
          look: p.look,
          avatar: p.avatar,
          discord: Boolean(p.userId),
          voice: Boolean(p.voice && online.has(p.id)),
          voiceMuted: Boolean(p.voiceMuted),
          connected: online.has(p.id),
          score: p.id in scores ? scores[p.id] : null,
          inGame: Boolean(s.game?.ids.includes(p.id)),
        })),
      night: s.night,
      game: s.game && (s.phase === 'playing' || s.phase === 'final') ? game.view(s.game, pid, ctx) : null,
      final: s.final,
    };
  }
}

function freshState(code) {
  return {
    code,
    phase: 'lobby',
    hostId: null,
    players: {},
    gameId: 'deepcut',
    settings: defaultSettings(GAME_BY_ID.deepcut.meta),
    seen: {},
    game: null,
    final: null,
    night: {},
    lastActive: Date.now(),
  };
}

function parseUser(header) {
  if (!header) return null;
  try {
    const u = JSON.parse(header);
    return u && typeof u.id === 'string' ? u : null;
  } catch {
    return null;
  }
}
