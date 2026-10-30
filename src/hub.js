import { DurableObject } from 'cloudflare:workers';
import { TROPHY_PLACES, seasonBounds, seasonInfo, seasonOf, withPlaces } from './seasons.js';

// Points a result is worth for the season (see seasonPoints in seasons.js).
const POINTS_SQL = '2 * MAX(1, r.players - r.place + 1)';

// A single global Durable Object ("global") with its own SQLite database that
// stores Discord users, finished-game results, seasons and trophies.
// No separate database to provision: it ships with the Worker.
export class Hub extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        avatar TEXT,
        created_at INTEGER NOT NULL,
        seen_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        game TEXT NOT NULL,
        score INTEGER NOT NULL,
        place INTEGER NOT NULL,
        players INTEGER NOT NULL,
        played_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS results_game ON results (game, user_id);
      CREATE INDEX IF NOT EXISTS results_user ON results (user_id);
      CREATE INDEX IF NOT EXISTS results_time ON results (played_at);
      CREATE TABLE IF NOT EXISTS trophies (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        season TEXT NOT NULL,
        place INTEGER NOT NULL,
        points INTEGER NOT NULL,
        awarded_at INTEGER NOT NULL,
        UNIQUE (user_id, season)
      );
      CREATE TABLE IF NOT EXISTS seasons_done (
        season TEXT PRIMARY KEY,
        finalized_at INTEGER NOT NULL
      );
    `);
  }

  async fetch(request) {
    const url = new URL(request.url);
    this.finalizeSeasons();
    if (request.method === 'POST' && url.pathname === '/user') return Response.json(this.upsertUser(await request.json()));
    if (request.method === 'POST' && url.pathname === '/record') return Response.json(this.record(await request.json()));
    if (url.pathname === '/leaderboard') return Response.json(this.leaderboard(url.searchParams.get('game') || 'all'));
    if (url.pathname === '/season') return Response.json(this.season(url.searchParams.get('season')));
    if (url.pathname === '/trophies') return Response.json({ trophies: this.trophies(url.searchParams.get('id')) });
    if (url.pathname === '/profile') return Response.json(this.profile(url.searchParams.get('id')));
    return new Response('not found', { status: 404 });
  }

  upsertUser({ id, name, avatar }) {
    const now = Date.now();
    this.sql.exec(
      `INSERT INTO users (id, name, avatar, created_at, seen_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, avatar = excluded.avatar, seen_at = excluded.seen_at`,
      id, name, avatar, now, now,
    );
    return { ok: true };
  }

  // `playedAt` and `finalize` only come from the dev-only test hook (see worker.js).
  record({ game, players, results, playedAt, finalize }) {
    const at = Number.isFinite(playedAt) ? playedAt : Date.now();
    for (const r of results) {
      // Only users who have signed in exist here; skip anything else.
      const known = this.sql.exec('SELECT 1 FROM users WHERE id = ?', r.userId).toArray().length;
      if (!known) continue;
      this.sql.exec(
        'INSERT INTO results (user_id, game, score, place, players, played_at) VALUES (?, ?, ?, ?, ?, ?)',
        r.userId, game, Math.round(r.score), r.place, players, at,
      );
    }
    if (finalize) this.finalizeSeasons({ force: true });
    return { ok: true };
  }

  // Ranked by wins, then win rate, then total games played.
  leaderboard(game) {
    const where = game === 'all' ? '' : 'WHERE r.game = ?';
    const args = game === 'all' ? [] : [game];
    const rows = this.sql.exec(
      `SELECT u.id, u.name, u.avatar,
              COUNT(*) AS games,
              SUM(CASE WHEN r.place = 1 THEN 1 ELSE 0 END) AS wins,
              SUM(CASE WHEN r.place <= 3 THEN 1 ELSE 0 END) AS podiums,
              MAX(r.score) AS best,
              MAX(r.played_at) AS last_played
         FROM results r JOIN users u ON u.id = r.user_id
         ${where}
        GROUP BY u.id
        ORDER BY wins DESC, (wins * 1.0 / games) DESC, games DESC
        LIMIT 50`,
      ...args,
    ).toArray();
    return { game, rows: this.withTrophyCounts(rows) };
  }

  standings(seasonId, limit = 50) {
    const { start, end } = seasonBounds(seasonId);
    const rows = this.sql.exec(
      `SELECT u.id, u.name, u.avatar,
              SUM(${POINTS_SQL}) AS points,
              COUNT(*) AS games,
              SUM(CASE WHEN r.place = 1 THEN 1 ELSE 0 END) AS wins
         FROM results r JOIN users u ON u.id = r.user_id
        WHERE r.played_at >= ? AND r.played_at < ?
        GROUP BY u.id
        ORDER BY points DESC, wins DESC, games ASC
        LIMIT ?`,
      start, end, limit,
    ).toArray();
    return withPlaces(rows);
  }

  season(requested) {
    const current = seasonOf(Date.now());
    const id = /^\d{4}-\d{2}$/.test(requested ?? '') && requested <= current ? requested : current;
    const past = this.sql.exec('SELECT season FROM seasons_done ORDER BY season DESC LIMIT 24').toArray().map((r) => seasonInfo(r.season));
    return {
      season: { ...seasonInfo(id), current: id === current, finalized: id !== current },
      rows: this.standings(id),
      past,
    };
  }

  // Award trophies for every season that has ended and hasn't been awarded yet.
  // Runs lazily on each request, so no scheduler is needed.
  finalizeSeasons({ force = false } = {}) {
    if (!force && Date.now() - (this.lastFinalize ?? 0) < 60_000) return;
    this.lastFinalize = Date.now();
    const current = seasonOf(Date.now());
    const { start } = seasonBounds(current);
    const pending = this.sql.exec(
      `SELECT DISTINCT strftime('%Y-%m', played_at / 1000, 'unixepoch') AS season
         FROM results WHERE played_at < ?
       EXCEPT SELECT season FROM seasons_done`,
      start,
    ).toArray();
    const now = Date.now();
    for (const { season } of pending) {
      for (const row of this.standings(season, 20)) {
        if (row.place > TROPHY_PLACES) break;
        this.sql.exec(
          'INSERT OR IGNORE INTO trophies (user_id, season, place, points, awarded_at) VALUES (?, ?, ?, ?, ?)',
          row.id, season, row.place, row.points, now,
        );
      }
      this.sql.exec('INSERT OR IGNORE INTO seasons_done (season, finalized_at) VALUES (?, ?)', season, now);
    }
  }

  trophies(userId) {
    if (!userId) return [];
    return this.sql.exec(
      `SELECT t.id, t.season, t.place, t.points, t.awarded_at, u.name
         FROM trophies t JOIN users u ON u.id = t.user_id
        WHERE t.user_id = ? ORDER BY t.season DESC`,
      userId,
    ).toArray().map((t) => ({ ...t, ...seasonInfo(t.season), id: t.id }));
  }

  withTrophyCounts(rows) {
    if (!rows.length) return rows;
    const counts = new Map(this.sql.exec(
      `SELECT user_id, SUM(CASE WHEN place = 1 THEN 1 ELSE 0 END) AS gold, COUNT(*) AS total FROM trophies GROUP BY user_id`,
    ).toArray().map((r) => [r.user_id, r]));
    return rows.map((r) => ({ ...r, trophies: counts.get(r.id)?.total ?? 0, golds: counts.get(r.id)?.gold ?? 0 }));
  }

  profile(id) {
    const user = this.sql.exec('SELECT id, name, avatar FROM users WHERE id = ?', id).toArray()[0] ?? null;
    if (!user) return { user: null };
    const games = this.sql.exec(
      `SELECT game, COUNT(*) AS games, SUM(CASE WHEN place = 1 THEN 1 ELSE 0 END) AS wins, MAX(score) AS best
         FROM results WHERE user_id = ? GROUP BY game ORDER BY wins DESC`,
      id,
    ).toArray();
    return { user, games, trophies: this.trophies(id) };
  }
}
