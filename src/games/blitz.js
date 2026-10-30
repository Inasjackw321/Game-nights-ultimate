// Blitz: rapid multiple choice. Right answers score 500, plus up to 500 more
// the faster you lock in.
import { QUIZ } from '../content/quiz.js';
import { addPoints, clearTimer, deal, everyoneIn, marksFor, setTimer, shuffleWith, tooLate, zeroScores } from './kit.js';

const REVEAL_SECONDS = 7;

export function blitzPoints(correct, msLeft, duration) {
  if (!correct) return 0;
  return 500 + Math.round(500 * Math.max(0, Math.min(1, msLeft / duration)));
}

export default {
  meta: {
    id: 'blitz',
    name: 'Blitz',
    tagline: 'Quick-fire quiz. Fast and right beats slow and right.',
    category: 'Trivia',
    minPlayers: 1,
    options: [
      { key: 'rounds', label: 'Questions', values: [5, 10, 15], default: 10 },
      { key: 'seconds', label: 'Seconds', values: [10, 15, 20], default: 15 },
    ],
  },

  init(ctx) {
    const deck = deal(QUIZ, ctx.settings.rounds, ctx.seen, ctx.rand).map((q) => {
      const order = shuffleWith(q.choices.map((c, i) => i), ctx.rand);
      return { q: q.q, choices: order.map((i) => q.choices[i]), correct: order.indexOf(0) };
    });
    const g = { ids: ctx.ids, deck, round: -1, scores: zeroScores(ctx.ids) };
    nextQuestion(g, ctx);
    return g;
  },

  action(g, pid, msg, ctx) {
    if (msg.type === 'answer') {
      if (!g.ids.includes(pid)) return 'You joined mid-game — you can play the next one.';
      if (g.stage !== 'question') return 'Too late!';
      if (tooLate(g, ctx)) return 'Too late — time is up.';
      if (pid in g.picks) return 'You already answered.';
      const choice = Number(msg.choice);
      if (!(choice >= 0 && choice < 4)) return 'Pick an answer.';
      g.picks[pid] = { choice, left: Math.max(0, g.deadline - ctx.now) };
      if (everyoneIn(g.ids, g.picks, ctx)) reveal(g, ctx);
      return;
    }
    if (msg.type === 'next' && g.stage === 'reveal') {
      if (!ctx.isHost(pid)) return 'Only the host can do that.';
      advance(g, ctx);
      return;
    }
    return 'Not right now.';
  },

  timeout(g, ctx) {
    if (g.stage === 'question') reveal(g, ctx);
    else if (g.stage === 'reveal') advance(g, ctx);
  },

  view(g, pid) {
    const q = g.deck[g.round];
    const base = { stage: g.stage, title: q.q, choices: q.choices, round: g.round, total: g.deck.length, deadline: g.deadline, duration: g.duration, canPlay: g.ids.includes(pid) };
    if (g.stage === 'question') return { ...base, myChoice: g.picks[pid]?.choice ?? null, marks: marksFor(g.ids, g.picks) };
    return { ...base, result: g.result, myChoice: g.picks[pid]?.choice ?? null, last: g.round + 1 >= g.deck.length };
  },
};

function nextQuestion(g, ctx) {
  g.round += 1;
  g.stage = 'question';
  g.picks = {};
  g.result = null;
  setTimer(g, ctx.settings.seconds, ctx);
}

function reveal(g, ctx) {
  const q = g.deck[g.round];
  const duration = g.duration;
  const deltas = {};
  const counts = [0, 0, 0, 0];
  for (const id of g.ids) {
    const p = g.picks[id];
    if (p) counts[p.choice] += 1;
    deltas[id] = p ? blitzPoints(p.choice === q.correct, p.left, duration) : 0;
  }
  addPoints(g, deltas);
  const fastest = Object.entries(g.picks)
    .filter(([, p]) => p.choice === q.correct)
    .sort((a, b) => b[1].left - a[1].left)[0];
  g.result = { correct: q.correct, counts, deltas, fastest: fastest ? ctx.name(fastest[0]) : null };
  g.stage = 'reveal';
  setTimer(g, REVEAL_SECONDS, ctx);
}

function advance(g, ctx) {
  if (g.round + 1 >= g.deck.length) { g.over = true; clearTimer(g); }
  else nextQuestion(g, ctx);
}
