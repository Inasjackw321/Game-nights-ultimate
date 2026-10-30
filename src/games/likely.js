// Most Likely To: vote for the player who best fits the prompt. Score for
// agreeing with the room.
import { LIKELY } from '../content/social.js';
import { addPoints, clearTimer, deal, everyoneIn, marksFor, setTimer, tooLate, zeroScores } from './kit.js';

export const AGREE_POINTS = 200;
const POOL = LIKELY.map((text, i) => ({ id: `l${i}`, text }));

export function tallyLikely(votes) {
  const counts = {};
  for (const target of Object.values(votes)) counts[target] = (counts[target] ?? 0) + 1;
  const top = Math.max(0, ...Object.values(counts));
  const winners = Object.keys(counts).filter((id) => counts[id] === top);
  const deltas = {};
  for (const [voter, target] of Object.entries(votes)) if (winners.includes(target)) deltas[voter] = AGREE_POINTS;
  return { counts, winners, deltas };
}

export default {
  meta: {
    id: 'likely',
    name: 'Most Likely To',
    tagline: 'Who in the room fits the prompt best? Vote with the crowd.',
    category: 'Social',
    minPlayers: 3,
    options: [
      { key: 'rounds', label: 'Prompts', values: [5, 8, 12], default: 8 },
      { key: 'seconds', label: 'Seconds', values: [15, 20, 30], default: 20 },
    ],
  },

  init(ctx) {
    const g = { ids: ctx.ids, deck: deal(POOL, ctx.settings.rounds, ctx.seen, ctx.rand).map((p) => p.text), round: -1, scores: zeroScores(ctx.ids) };
    next(g, ctx);
    return g;
  },

  action(g, pid, msg, ctx) {
    if (msg.type === 'vote') {
      if (!g.ids.includes(pid)) return 'You joined mid-game — you can play the next one.';
      if (g.stage !== 'vote') return 'Voting is closed.';
      if (tooLate(g, ctx)) return 'Too late — time is up.';
      if (msg.target === pid) return "You can't vote for yourself.";
      if (!g.ids.includes(msg.target)) return 'Pick a player.';
      g.votes[pid] = msg.target;
      if (everyoneIn(g.ids, g.votes, ctx)) reveal(g, ctx);
      return;
    }
    if (msg.type === 'next' && g.stage === 'reveal') {
      if (!ctx.isHost(pid)) return 'Only the host can do that.';
      if (g.round + 1 >= g.deck.length) g.over = true;
      else next(g, ctx);
      return;
    }
    return 'Not right now.';
  },

  timeout(g, ctx) {
    if (g.stage === 'vote') reveal(g, ctx);
  },

  view(g, pid) {
    const base = {
      stage: g.stage, title: `Who's most likely to ${g.deck[g.round]}?`, round: g.round, total: g.deck.length,
      deadline: g.deadline, duration: g.duration, canPlay: g.ids.includes(pid), candidates: g.ids,
    };
    if (g.stage === 'vote') return { ...base, myVote: g.votes[pid] ?? null, marks: marksFor(g.ids, g.votes) };
    return { ...base, result: g.result, last: g.round + 1 >= g.deck.length };
  },
};

function next(g, ctx) {
  g.round += 1;
  g.stage = 'vote';
  g.votes = {};
  g.result = null;
  setTimer(g, ctx.settings.seconds, ctx);
}

function reveal(g, ctx) {
  const { counts, winners, deltas } = tallyLikely(g.votes);
  addPoints(g, deltas);
  g.result = {
    winners: winners.map(ctx.name),
    winnerIds: winners,
    counts,
    votes: Object.entries(g.votes).map(([v, t]) => ({ voter: ctx.name(v), target: ctx.name(t) })),
    deltas,
  };
  g.stage = 'reveal';
  clearTimer(g);
}
