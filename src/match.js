// Shared text matching: normalisation, typo-tolerant lookup, clustering.
// Pure functions only, so it can be unit-tested with plain Node.

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
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
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

// True when two free-text answers are the same thing, allowing for typos.
export function sameAnswer(a, b) {
  const ka = toKey(a);
  const kb = toKey(b);
  if (!ka || !kb) return false;
  return levenshtein(ka, kb) <= Math.min(maxTypos(ka), maxTypos(kb));
}

// Answer lists are written as "label|alias|alias; label|alias", grouped by
// tier. Builds { answers: [{id, label, tier}], index: Map<key, answerId> }.
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

const SMALL_WORDS = new Set(['and', 'of', 'the', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'de', 'la', 'le', 'el', 'du', 'di', 'da', 'n', 'mont']);
const ROMAN = /^(i|ii|iii|iv|v|vi|vii|viii|ix|x)$/;

// "romeo and juliet" -> "Romeo and Juliet", "henry vi" -> "Henry VI".
// Labels written with any capitals (e.g. "BMW", "McLaren") are kept as-is.
export function titleCase(s) {
  if (s !== s.toLowerCase()) return s;
  return s.split(' ').map((w, i) => {
    if (ROMAN.test(w)) return w.toUpperCase();
    if (i > 0 && SMALL_WORDS.has(w)) return w;
    return w.replace(/(^|-)(\p{L})/gu, (_, sep, ch) => sep + ch.toUpperCase());
  }).join(' ');
}

// Classify one raw answer against a compiled prompt.
//   { kind: 'blank' } | { kind: 'match', answerId, label, tier } | { kind: 'unknown', key, label }
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
    // Ambiguous typos ("nigera": Niger or Nigeria?) are left unmatched.
    if (best <= limit && bestIds.size === 1) return matchOf(compiled, [...bestIds][0]);
  }

  return { kind: 'unknown', key, label: cleanLabel(raw) };
}

function matchOf(compiled, id) {
  const a = compiled.answers[id];
  return { kind: 'match', answerId: id, label: a.label, tier: a.tier };
}

export function cleanLabel(raw, max = 40) {
  return String(raw ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
}

// Group unknown answers so that two players typing the same off-list answer
// (allowing for typos) are treated as one answer. Mutates c.key to the
// cluster's key and returns the clusters.
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

export function shuffle(list, rand = Math.random) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
