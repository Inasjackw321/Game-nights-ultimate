// Deep Cut: name something nobody else will. Rare, correct answers score most.
import { shuffleWith } from './kit.js';
import { groupAnswers, promptGame } from './prompt-round.js';

export const TIERS = {
  1: { name: 'Common', points: 100 },
  2: { name: 'Solid', points: 200 },
  3: { name: 'Rare', points: 350 },
  4: { name: 'Deep cut', points: 500 },
};
// Off-list answers the host approves score as this tier.
export const APPROVED_TIER = 3;

// A unique answer scores its full tier value; each extra person who said it
// splits it further: unique deep cut = 500, half of a 10-player room on a
// common answer = 20 each.
export function groupPoints(tier, count) {
  return Math.round(TIERS[tier].points / count);
}

export function scoreDeepCut(classified, approved, prompt, ctx) {
  const { groups, misses } = groupAnswers(classified, (key) => approved.has(key));
  const deltas = Object.fromEntries(Object.keys(classified).map((id) => [id, 0]));
  const scored = groups.map((g) => {
    const tier = g.tier ?? APPROVED_TIER;
    const points = groupPoints(tier, g.players.length);
    for (const p of g.players) deltas[p] = points;
    return { ...g, tier, tierName: g.offList ? 'Approved · Rare' : TIERS[tier].name, count: g.players.length, points };
  });
  // Reveal order: most-shared first, rarest last.
  scored.sort((a, b) => b.count - a.count || a.points - b.points);

  const given = new Set(Object.values(classified).filter((c) => c.kind === 'match').map((c) => c.answerId));
  const missed = shuffleWith(prompt.answers.filter((a) => a.tier === 4 && !given.has(a.id)), ctx?.rand)
    .slice(0, 3).map((a) => a.label);
  return { groups: scored, misses, deltas, extra: { missed } };
}

export default promptGame({
  meta: {
    id: 'deepcut',
    name: 'Deep Cut',
    tagline: 'Name something nobody else will. Rare answers win.',
    category: 'Word',
    minPlayers: 2,
    options: [
      { key: 'rounds', label: 'Prompts', values: [3, 5, 7, 10], default: 7 },
      { key: 'seconds', label: 'Seconds', values: [15, 20, 25, 35, 45], default: 25 },
    ],
  },
  review: true,
  score: scoreDeepCut,
});
