// Pure game logic: answer normalisation, fuzzy matching and scoring.
// No Cloudflare APIs in here so it can be unit-tested with plain Node.

export const TIERS = {
  1: { name: 'Common', points: 100 },
  2: { name: 'Solid', points: 200 },
  3: { name: 'Rare', points: 350 },
  4: { name: 'Deep cut', points: 500 },
};

// Answers the host approves by hand (not on the list) score as this tier.
export const APPROVED_TIER = 3;

// Lowercase, strip accents/punctuation, collapse spaces, drop a leading article.
export function normalize(text) {
  return String(text ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/^(the|a|an) /, '');
}

// Matching key: spaces removed and a trailing plural "s" dropped, so
// "Bow ties", "bowtie" and "bow-tie" all land on the same key.
export function toKey(text) {
  const compact = normalize(text).replace(/ /g, '');
  return compact.length > 3 && compact.endsWith('s') ? compact.slice(0, -1) : compact;
}

export function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[b.length];
}

// How many typos we forgive scales with length: "ham" must not become "jam",
// but "pachycephalosaurus" deserves some slack.
export function maxTypos(key) {
  if (key.length <= 3) return 0;
  if (key.length <= 5) return 1;
  if (key.length <= 11) return 2;
  return 3;
}

// Prompt pack entries are written as "label|alias|alias; label|alias".
// Builds { answers: [{id, label, tier}], index: Map<key, answerId> }.
export function compilePrompt(prompt) {
  const answers = [];
  const index = new Map();
  for (const [tier, list] of Object.entries(prompt.tiers)) {
    for (const entry of list.split(';')) {
      const names = entry.split('|').map((s) => s.trim()).filter(Boolean);
      if (!names.length) continue;
      const id = answers.length;
      answers.push({ id, label: titleCase(names[0]), tier: Number(tier) });
      for (const name of names) {
        const key = toKey(name);
        if (index.has(key) && index.get(key) !== id) {
          throw new Error(`Prompt "${prompt.id}": "${name}" collides with "${answers[index.get(key)].label}"`);
        }
        index.set(key, id);
      }
    }
  }
  return { ...prompt, answers, index };
}

function titleCase(s) {
  return s.replace(/(^|[\s-])(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase());
}

// Classify one raw answer against a compiled prompt.
//   { kind: 'blank' }
//   { kind: 'match', answerId, label, tier }
//   { kind: 'unknown', key, label }   -> host decides at review time
export function classify(compiled, raw) {
  const key = toKey(raw);
  if (!key) return { kind: 'blank' };

  const exact = compiled.index.get(key);
  if (exact !== undefined) return matchOf(compiled, exact);

  const limit = maxTypos(key);
  if (limit > 0) {
    let best = Infinity;
    let bestIds = new Set();
    for (const [candidate, id] of compiled.index) {
      if (Math.abs(candidate.length - key.length) > limit) continue;
      const d = levenshtein(key, candidate);
      if (d < best) { best = d; bestIds = new Set([id]); }
      else if (d === best) bestIds.add(id);
    }
    // Ambiguous typos ("nigera": Niger or Nigeria?) go to the host instead.
    if (best <= limit && bestIds.size === 1) return matchOf(compiled, [...bestIds][0]);
  }

  return { kind: 'unknown', key, label: cleanLabel(raw) };
}

function matchOf(compiled, id) {
  const a = compiled.answers[id];
  return { kind: 'match', answerId: id, label: a.label, tier: a.tier };
}

function cleanLabel(raw) {
  return String(raw).trim().replace(/\s+/g, ' ').slice(0, 40);
}

// Group unknown answers so that two players typing the same off-list answer
// (allowing for typos) are reviewed — and scored — as one answer.
export function clusterUnknowns(classified) {
  const clusters = [];
  for (const [playerId, c] of Object.entries(classified)) {
    if (c.kind !== 'unknown') continue;
    let cluster = clusters.find((k) => levenshtein(k.key, c.key) <= Math.min(maxTypos(k.key), maxTypos(c.key)));
    if (!cluster) {
      cluster = { key: c.key, label: c.label, players: [] };
      clusters.push(cluster);
    }
    cluster.players.push(playerId);
    c.key = cluster.key;
  }
  return clusters;
}

// Points for one group of identical answers. A unique answer scores its full
// tier value; every extra person who said it splits the value further.
//   unique deep cut = 500, two people on a deep cut = 250 each,
//   half of a 10-player room on a common answer = 20 each.
export function groupPoints(tier, count) {
  return Math.round(TIERS[tier].points / count);
}

// Score a round. `classified` maps playerId -> classify() result (after
// clusterUnknowns has run); `approved` is a Set of unknown keys the host accepted.
// Returns { groups, misses, deltas } with groups ordered for the reveal:
// most-shared first, rarest last.
export function scoreRound(classified, approved) {
  const groups = new Map();
  const misses = new Map();
  const deltas = {};

  for (const [playerId, c] of Object.entries(classified)) {
    deltas[playerId] = 0;
    if (c.kind === 'match' || (c.kind === 'unknown' && approved.has(c.key))) {
      const groupKey = c.kind === 'match' ? `m${c.answerId}` : `u${c.key}`;
      if (!groups.has(groupKey)) {
        groups.set(groupKey, {
          label: c.label,
          tier: c.kind === 'match' ? c.tier : APPROVED_TIER,
          approved: c.kind === 'unknown',
          players: [],
        });
      }
      groups.get(groupKey).players.push(playerId);
    } else {
      const reason = c.kind === 'blank' ? 'No answer' : 'Not accepted';
      const missKey = c.kind === 'blank' ? '' : c.key;
      if (!misses.has(missKey)) misses.set(missKey, { label: c.kind === 'blank' ? '—' : c.label, reason, players: [] });
      misses.get(missKey).players.push(playerId);
    }
  }

  const scored = [...groups.values()].map((g) => {
    const points = groupPoints(g.tier, g.players.length);
    for (const p of g.players) deltas[p] = points;
    return { ...g, count: g.players.length, points, tierName: TIERS[g.tier].name };
  });
  scored.sort((a, b) => b.count - a.count || a.points - b.points);

  return { groups: scored, misses: [...misses.values()], deltas };
}

// A few top-tier answers nobody gave, shown after the reveal.
export function missedDeepCuts(compiled, classified, n = 3, rand = Math.random) {
  const given = new Set(Object.values(classified).filter((c) => c.kind === 'match').map((c) => c.answerId));
  const pool = compiled.answers.filter((a) => a.tier === 4 && !given.has(a.id));
  return shuffle(pool, rand).slice(0, n).map((a) => a.label);
}

export function shuffle(list, rand = Math.random) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
