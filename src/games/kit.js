// Helpers shared by game modules.
//
// A game module is a plain object:
//   meta:   { id, name, tagline, category, minPlayers, options: [{ key, label, values, default }] }
//   init(ctx)                    -> g        fresh game state (must set g.ids and g.scores)
//   action(g, pid, msg, ctx)     -> error?   a player did something
//   timeout(g, ctx)                          g.deadline passed
//   view(g, pid, ctx)            -> object   what this player may see
// Modules set g.deadline (ms epoch) to ask the room for a timer, and g.over = true
// when the game is finished. g.scores ({pid: number}) decides the final ranking.
//
// ctx (built fresh by the room for every call):
//   now, settings, seen (prompt ids this room has used), rand,
//   name(id), online(id), isHost(id)

export const GRACE_MS = 500;

export function setTimer(g, seconds, ctx) {
  g.deadline = ctx.now + seconds * 1000;
  g.duration = seconds * 1000;
}

export function clearTimer(g) {
  g.deadline = null;
  g.duration = null;
}

export function tooLate(g, ctx) {
  return g.deadline != null && ctx.now > g.deadline + GRACE_MS;
}

// Every connected player in `ids` has an entry in `map`.
export function everyoneIn(ids, map, ctx) {
  const online = ids.filter((id) => ctx.online(id));
  return online.length > 0 && online.every((id) => id in map);
}

export function marksFor(ids, map, mark = 'done') {
  return Object.fromEntries(ids.filter((id) => id in map).map((id) => [id, mark]));
}

// Draw n items from a pool, avoiding ones this room has already seen until
// the pool runs out. `seen` is mutated.
export function deal(pool, n, seen, rand = Math.random) {
  let fresh = pool.filter((p) => !seen.includes(p.id));
  if (fresh.length < n) {
    seen.length = 0;
    fresh = pool;
  }
  const picked = shuffleWith(fresh, rand).slice(0, n);
  seen.push(...picked.map((p) => p.id));
  return picked;
}

export function shuffleWith(list, rand = Math.random) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function addPoints(g, deltas) {
  for (const [id, pts] of Object.entries(deltas)) g.scores[id] = (g.scores[id] ?? 0) + pts;
}

export function zeroScores(ids, start = 0) {
  return Object.fromEntries(ids.map((id) => [id, start]));
}

export function option(ctx, key) {
  return ctx.settings[key];
}
