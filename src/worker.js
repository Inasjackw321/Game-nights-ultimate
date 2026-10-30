import { authEnabled, authMissing, currentUser, handleAuth } from './auth.js';
import { CATALOG } from './games/index.js';

export { Room } from './room.js';
export { Hub } from './hub.js';

// Letters only, no vowels (so codes don't spell words) and nothing easily misread.
const CODE_ALPHABET = 'BCDFGHJKMNPQRSTVWXZ';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    const auth = await handleAuth(request, env, url);
    if (auth) return auth;

    if (url.pathname === '/api/me') {
      return Response.json({
        authEnabled: authEnabled(env),
        authMissing: authMissing(env),
        redirectUri: `${url.origin}/auth/discord/callback`,
        user: await currentUser(request, env),
      });
    }

    if (url.pathname === '/api/catalog') return Response.json(CATALOG);

    if (url.pathname === '/api/leaderboard') {
      const game = url.searchParams.get('game') ?? 'all';
      return hub(env).fetch(`https://hub/leaderboard?game=${encodeURIComponent(game)}`);
    }

    if (url.pathname === '/api/rooms' && request.method === 'POST') {
      for (let attempt = 0; attempt < 8; attempt++) {
        const code = randomCode();
        const res = await roomStub(env, code).fetch('https://room/create', { method: 'POST', body: JSON.stringify({ code }) });
        if (res.ok) return Response.json({ code });
      }
      return Response.json({ error: 'Could not allocate a room, try again.' }, { status: 503 });
    }

    const ws = url.pathname.match(/^\/api\/rooms\/([A-Za-z]{4})\/ws$/);
    if (ws) {
      // Never trust an identity header from the client: rebuild headers and
      // only attach the user the session cookie proves.
      const headers = new Headers(request.headers);
      headers.delete('X-GN-User');
      const user = await currentUser(request, env);
      if (user) {
        headers.set('X-GN-User', JSON.stringify(user));
        // Keep the leaderboard's copy of their name and avatar fresh.
        ctx.waitUntil(hub(env).fetch('https://hub/user', { method: 'POST', body: JSON.stringify(user) }));
      }
      return roomStub(env, ws[1].toUpperCase()).fetch(new Request(`https://room/ws${url.search}`, { headers }));
    }

    // Everything else is the static frontend (see "assets" in wrangler.jsonc).
    return env.ASSETS.fetch(request);
  },
};

function hub(env) {
  return env.HUB.get(env.HUB.idFromName('global'));
}

function roomStub(env, code) {
  return env.ROOMS.get(env.ROOMS.idFromName(code));
}

function randomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}
