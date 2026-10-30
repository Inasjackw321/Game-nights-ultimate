// "Sign in with Discord" (OAuth2 authorization-code flow) plus a stateless,
// HMAC-signed session cookie. Needs DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET
// and SESSION_SECRET; without them the app runs in guest-only mode.

const SESSION_COOKIE = 'gn_session';
const STATE_COOKIE = 'gn_oauth';
const SESSION_DAYS = 30;
const DISCORD = 'https://discord.com';

export function authEnabled(env) {
  return Boolean(env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET && env.SESSION_SECRET);
}

export async function handleAuth(request, env, url) {
  if (url.pathname === '/auth/discord') return startLogin(env, url);
  if (url.pathname === '/auth/discord/callback') return finishLogin(request, env, url);
  if (url.pathname === '/auth/logout' && request.method === 'POST') {
    return new Response(null, { status: 204, headers: { 'Set-Cookie': cookie(SESSION_COOKIE, '', url, 0) } });
  }
  return null;
}

// The signed-in user for this request, or null.
export async function currentUser(request, env) {
  if (!env.SESSION_SECRET) return null;
  const raw = parseCookies(request.headers.get('Cookie'))[SESSION_COOKIE];
  return raw ? verify(raw, env.SESSION_SECRET) : null;
}

function startLogin(env, url) {
  if (!authEnabled(env)) return new Response('Discord sign-in is not configured on this server.', { status: 501 });
  const state = randomToken();
  const next = safeNext(url.searchParams.get('next'));
  const authorize = new URL(`${DISCORD}/oauth2/authorize`);
  authorize.search = new URLSearchParams({
    response_type: 'code',
    client_id: env.DISCORD_CLIENT_ID,
    scope: 'identify',
    state,
    redirect_uri: redirectUri(url),
    prompt: 'none',
  });
  return new Response(null, {
    status: 302,
    headers: {
      Location: authorize.toString(),
      'Set-Cookie': cookie(STATE_COOKIE, `${state}.${encodeURIComponent(next)}`, url, 600),
    },
  });
}

async function finishLogin(request, env, url) {
  if (!authEnabled(env)) return new Response('Discord sign-in is not configured.', { status: 501 });
  // Cookie is "<state>.<encoded next path>"; the state token itself has no dots.
  const raw = parseCookies(request.headers.get('Cookie'))[STATE_COOKIE] ?? '';
  const dot = raw.indexOf('.');
  const expected = dot > 0 ? raw.slice(0, dot) : '';
  const next = safeNext(decodeURIComponent(dot > 0 ? raw.slice(dot + 1) : ''));
  const code = url.searchParams.get('code');
  if (!code || !expected || url.searchParams.get('state') !== expected) {
    return redirect(`${next}${next.includes('?') ? '&' : '?'}login=failed`, url);
  }

  const tokenRes = await fetch(`${DISCORD}/api/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.DISCORD_CLIENT_ID,
      client_secret: env.DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri(url),
    }),
  });
  if (!tokenRes.ok) return redirect(`${next}${next.includes('?') ? '&' : '?'}login=failed`, url);
  const { access_token: accessToken } = await tokenRes.json();

  const meRes = await fetch(`${DISCORD}/api/users/@me`, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!meRes.ok) return redirect(`${next}${next.includes('?') ? '&' : '?'}login=failed`, url);
  const me = await meRes.json();

  const user = { id: me.id, name: (me.global_name || me.username || 'Diver').slice(0, 32), avatar: avatarUrl(me) };
  await env.HUB.get(env.HUB.idFromName('global')).fetch('https://hub/user', { method: 'POST', body: JSON.stringify(user) });

  const session = await sign({ ...user, exp: Date.now() + SESSION_DAYS * 86400e3 }, env.SESSION_SECRET);
  const headers = new Headers({ Location: next });
  headers.append('Set-Cookie', cookie(SESSION_COOKIE, session, url, SESSION_DAYS * 86400));
  headers.append('Set-Cookie', cookie(STATE_COOKIE, '', url, 0));
  return new Response(null, { status: 302, headers });
}

export function avatarUrl(me) {
  if (me.avatar) return `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png?size=64`;
  const index = Number((BigInt(me.id) >> 22n) % 6n);
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
}

function redirectUri(url) {
  return `${url.origin}/auth/discord/callback`;
}

// Only allow same-site relative paths as the post-login destination.
function safeNext(next) {
  return typeof next === 'string' && /^\/(?!\/)[^\s]*$/.test(next) ? next : '/';
}

function redirect(location, url) {
  return new Response(null, { status: 302, headers: { Location: new URL(location, url.origin).toString() } });
}

function cookie(name, value, url, maxAge) {
  const secure = url.protocol === 'https:' ? '; Secure' : '';
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
}

export function parseCookies(header) {
  const out = {};
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

function randomToken() {
  return b64url(crypto.getRandomValues(new Uint8Array(18)));
}

// ---- signed tokens: base64url(json) + "." + base64url(HMAC-SHA256) ----------

export async function sign(payload, secret) {
  const body = b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret), new TextEncoder().encode(body));
  return `${body}.${b64url(new Uint8Array(sig))}`;
}

export async function verify(token, secret) {
  const [body, sig] = String(token).split('.');
  if (!body || !sig) return null;
  let ok = false;
  try {
    ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), fromB64url(sig), new TextEncoder().encode(body));
  } catch {
    return null;
  }
  if (!ok) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(fromB64url(body)));
    if (!payload.exp || payload.exp < Date.now()) return null;
    return { id: payload.id, name: payload.name, avatar: payload.avatar };
  } catch {
    return null;
  }
}

function hmacKey(secret) {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

function b64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s) {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
