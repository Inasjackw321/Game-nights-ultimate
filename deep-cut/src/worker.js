export { Room } from './room.js';

// Letters only, no vowels (so codes don't spell words) and nothing easily misread.
const CODE_ALPHABET = 'BCDFGHJKMNPQRSTVWXZ';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/rooms' && request.method === 'POST') {
      for (let attempt = 0; attempt < 8; attempt++) {
        const code = randomCode();
        const res = await roomStub(env, code).fetch('https://room/create', {
          method: 'POST',
          body: JSON.stringify({ code }),
        });
        if (res.ok) return Response.json({ code });
      }
      return Response.json({ error: 'Could not allocate a room, try again.' }, { status: 503 });
    }

    const ws = url.pathname.match(/^\/api\/rooms\/([A-Za-z]{4})\/ws$/);
    if (ws) {
      const code = ws[1].toUpperCase();
      return roomStub(env, code).fetch(new Request(`https://room/ws${url.search}`, request));
    }

    // Everything else is the static frontend (see "assets" in wrangler.jsonc).
    return env.ASSETS.fetch(request);
  },
};

function roomStub(env, code) {
  return env.ROOMS.get(env.ROOMS.idFromName(code));
}

function randomCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(4));
  return [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}
