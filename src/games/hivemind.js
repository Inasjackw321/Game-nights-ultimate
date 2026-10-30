// Hive Mind: the opposite of Deep Cut. Think like the school — score for every
// other player who gave the same answer.
import { groupAnswers, promptGame } from './prompt-round.js';

export const PER_MATCH = 100;
export const BIGGEST_BONUS = 100;

export function scoreHiveMind(classified) {
  // Off-list answers still count here: two people typing the same odd thing
  // is exactly the point.
  const { groups, misses } = groupAnswers(classified, () => true);
  const deltas = Object.fromEntries(Object.keys(classified).map((id) => [id, 0]));
  const sizes = groups.map((g) => g.players.length);
  const biggest = Math.max(0, ...sizes);
  const uniqueBiggest = biggest > 1 && sizes.filter((n) => n === biggest).length === 1;
  const scored = groups.map((g) => {
    const count = g.players.length;
    const bonus = uniqueBiggest && count === biggest ? BIGGEST_BONUS : 0;
    const points = (count - 1) * PER_MATCH + bonus;
    for (const p of g.players) deltas[p] = points;
    return { ...g, count, points, tierName: bonus ? 'Biggest school' : count > 1 ? 'Matched' : 'Swam alone' };
  });
  // Reveal order: loners first, biggest school last.
  scored.sort((a, b) => a.count - b.count);
  return { groups: scored, misses, deltas, extra: {} };
}

export default promptGame({
  meta: {
    id: 'hivemind',
    name: 'Hive Mind',
    tagline: 'Give the answer everyone else gives. Swim with the school.',
    category: 'Word',
    minPlayers: 3,
    options: [
      { key: 'rounds', label: 'Prompts', values: [3, 5, 7, 10], default: 7 },
      { key: 'seconds', label: 'Seconds', values: [15, 20, 25, 35], default: 20 },
    ],
  },
  instant: false,
  score: scoreHiveMind,
});
