import { DurableObject } from 'cloudflare:workers';

// A single global Durable Object ("global") with its own SQLite database that
// stores Discord users and finished-game results for the global leaderboard.
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
    `);
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/user') return Response.json(this.upsertUser(await request.json()));
    if (request.method === 'POST' && url.pathname === '/record') return Response.json(this.record(await request.json()));
    if (url.pathname === '/leaderboard') return Response.json(this.leaderboard(url.searchParams.get('game') || 'all'));
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

  record({ game, players, results }) {
    const now = Date.now();
    for (const r of results) {
      // Only users who have signed in exist here; skip anything else.
      const known = this.sql.exec('SELECT 1 FROM users WHERE id = ?', r.userId).toArray().length;
      if (!known) continue;
      this.sql.exec(
        'INSERT INTO results (user_id, game, score, place, players, played_at) VALUES (?, ?, ?, ?, ?, ?)',
        r.userId, game, Math.round(r.score), r.place, players, now,
      );
    }
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
    return { game, rows };
  }

  profile(id) {
    const user = this.sql.exec('SELECT id, name, avatar FROM users WHERE id = ?', id).toArray()[0] ?? null;
    if (!user) return { user: null };
    const games = this.sql.exec(
      `SELECT game, COUNT(*) AS games, SUM(CASE WHEN place = 1 THEN 1 ELSE 0 END) AS wins, MAX(score) AS best
         FROM results WHERE user_id = ? GROUP BY game ORDER BY wins DESC`,
      id,
    ).toArray();
    return { user, games };
  }
}
