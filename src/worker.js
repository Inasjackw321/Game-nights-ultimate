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
      const user = await currentUser(request, env);
      const trophies = user ? (await (await hub(env).fetch(`https://hub/trophies?id=${encodeURIComponent(user.id)}`)).json()).trophies : [];
      return Response.json({
        authEnabled: authEnabled(env),
        authMissing: authMissing(env),
        redirectUri: `${url.origin}/auth/discord/callback`,
        user,
        trophies,
      });
    }

    if (url.pathname === '/api/catalog') return Response.json(CATALOG);

    if (url.pathname === '/api/ice') return Response.json({ iceServers: await iceServers(env) });

    if (url.pathname === '/api/season') {
      return hub(env).fetch(`https://hub/season?season=${encodeURIComponent(url.searchParams.get('season') ?? '')}`);
    }

    if (url.pathname === '/api/profile') {
      return hub(env).fetch(`https://hub/profile?id=${encodeURIComponent(url.searchParams.get('id') ?? '')}`);
    }

    // Local testing only: lets the smoke test record results in a past season
    // so trophy awarding can be exercised. Enabled by TEST_HOOKS=1 in .dev.vars;
    // never set this in production.
    if (url.pathname === '/api/test/record' && env.TEST_HOOKS === '1' && request.method === 'POST') {
      return hub(env).fetch('https://hub/record', { method: 'POST', body: await request.text() });
    }
    if (url.pathname === '/api/test/user' && env.TEST_HOOKS === '1' && request.method === 'POST') {
      return hub(env).fetch('https://hub/user', { method: 'POST', body: await request.text() });
    }

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

// STUN lets most players connect directly. Some networks (strict mobile
// carriers, office/school Wi-Fi) also need a TURN relay: set TURN_KEY_ID and
// TURN_KEY_API_TOKEN from Cloudflare's Realtime TURN service to enable it.
const STUN = [{ urls: 'stun:stun.cloudflare.com:3478' }, { urls: 'stun:stun.l.google.com:19302' }];

async function iceServers(env) {
  if (!env.TURN_KEY_ID || !env.TURN_KEY_API_TOKEN) return STUN;
  try {
    const res = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${env.TURN_KEY_ID}/credentials/generate-ice-servers`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.TURN_KEY_API_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ttl: 86400 }),
    });
    if (!res.ok) throw new Error(`TURN ${res.status}`);
    const body = await res.json();
    const servers = Array.isArray(body.iceServers) ? body.iceServers : [body.iceServers];
    return [...STUN, ...servers.filter(Boolean)];
  } catch (err) {
    console.error('TURN credentials failed, falling back to STUN only', err);
    return STUN;
  }
}

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
