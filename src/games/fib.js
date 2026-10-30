// Fib Factory: everyone writes a convincing fake answer to a strange-but-true
// fact, then votes for what they think is real. Score for spotting the truth
// and for every player your lie fools.
import { FACTS } from '../content/facts.js';
import { cleanLabel, sameAnswer } from '../match.js';
import { addPoints, clearTimer, deal, everyoneIn, marksFor, setTimer, shuffleWith, tooLate, zeroScores } from './kit.js';

export const TRUTH_POINTS = 500;
export const FOOL_POINTS = 250;
const VOTE_SECONDS = 25;
const MIN_OPTIONS = 4;

export function isTruth(fact, text) {
  return [fact.answer, ...(fact.alts ?? [])].some((t) => sameAnswer(t, text));
}

// Merge identical lies, add the truth and enough house decoys to reach
// MIN_OPTIONS, then shuffle.
export function buildOptions(fact, lies, rand) {
  const options = [];
  for (const [pid, text] of Object.entries(lies)) {
    const same = options.find((o) => sameAnswer(o.text, text));
    if (same) same.authors.push(pid);
    else options.push({ text, kind: 'lie', authors: [pid] });
  }
  options.push({ text: fact.answer, kind: 'truth', authors: [] });
  for (const d of shuffleWith(fact.decoys ?? [], rand)) {
    if (options.length >= MIN_OPTIONS) break;
    if (!options.some((o) => sameAnswer(o.text, d))) options.push({ text: d, kind: 'house', authors: [] });
  }
  return shuffleWith(options, rand).map((o, i) => ({ ...o, id: i }));
}

export function scoreFib(options, votes) {
  const deltas = {};
  const add = (id, n) => { deltas[id] = (deltas[id] ?? 0) + n; };
  for (const [voter, optionId] of Object.entries(votes)) {
    const o = options[optionId];
    if (!o) continue;
    if (o.kind === 'truth') add(voter, TRUTH_POINTS);
    for (const author of o.authors) if (author !== voter) add(author, FOOL_POINTS);
  }
  return deltas;
}

export default {
  meta: {
    id: 'fib',
    name: 'Fib Factory',
    tagline: 'Write a fake answer that sounds real. Spot the truth.',
    category: 'Bluffing',
    minPlayers: 3,
    options: [
      { key: 'rounds', label: 'Facts', values: [3, 5, 7], default: 5 },
      { key: 'seconds', label: 'Seconds to lie', values: [30, 45, 60], default: 45 },
    ],
  },

  init(ctx) {
    const g = {
      ids: ctx.ids,
      deck: deal(FACTS, ctx.settings.rounds, ctx.seen, ctx.rand).map((f) => f.id),
      round: -1,
      scores: zeroScores(ctx.ids),
    };
    nextFact(g, ctx);
    return g;
  },

  action(g, pid, msg, ctx) {
    const fact = factOf(g);
    if (!g.ids.includes(pid) && msg.type !== 'next') return 'You joined mid-game — you can play the next one.';
    if (msg.type === 'answer') {
      if (g.stage !== 'write') return 'Lies are closed.';
      if (tooLate(g, ctx)) return 'Too late — time is up.';
      const text = cleanLabel(msg.text, 50);
      if (!text) return 'Write something!';
      if (isTruth(fact, text)) return "That's actually the real answer! Write a fake one.";
      g.lies[pid] = text;
      if (everyoneIn(g.ids, g.lies, ctx)) openVoting(g, ctx);
      return;
    }
    if (msg.type === 'vote') {
      if (g.stage !== 'vote') return 'Voting is closed.';
      if (tooLate(g, ctx)) return 'Too late — time is up.';
      const o = g.options[msg.option];
      if (!o) return 'Pick an option.';
      if (o.authors.includes(pid)) return "You can't vote for your own lie.";
      g.votes[pid] = o.id;
      if (everyoneIn(g.ids, g.votes, ctx)) reveal(g, ctx);
      return;
    }
    if (msg.type === 'next' && g.stage === 'reveal') {
      if (!ctx.isHost(pid)) return 'Only the host can do that.';
      if (g.round + 1 >= g.deck.length) g.over = true;
      else nextFact(g, ctx);
      return;
    }
    return 'Not right now.';
  },

  timeout(g, ctx) {
    if (g.stage === 'write') openVoting(g, ctx);
    else if (g.stage === 'vote') reveal(g, ctx);
  },

  view(g, pid) {
    const fact = factOf(g);
    const base = { stage: g.stage, title: fact.text, round: g.round, total: g.deck.length, deadline: g.deadline, duration: g.duration, canPlay: g.ids.includes(pid) };
    if (g.stage === 'write') return { ...base, myAnswer: g.lies[pid] ?? null, marks: marksFor(g.ids, g.lies) };
    if (g.stage === 'vote') {
      return {
        ...base,
        options: g.options.map((o) => ({ id: o.id, text: o.text, mine: o.authors.includes(pid) })),
        myVote: g.votes[pid] ?? null,
        marks: marksFor(g.ids, g.votes),
      };
    }
    return { ...base, result: g.result, last: g.round + 1 >= g.deck.length };
  },
};

function factOf(g) {
  return FACTS.find((f) => f.id === g.deck[g.round]);
}

function nextFact(g, ctx) {
  g.round += 1;
  g.stage = 'write';
  g.lies = {};
  g.votes = {};
  g.options = [];
  g.result = null;
  setTimer(g, ctx.settings.seconds, ctx);
}

function openVoting(g, ctx) {
  g.options = buildOptions(factOf(g), g.lies, ctx.rand);
  g.stage = 'vote';
  setTimer(g, VOTE_SECONDS, ctx);
}

function reveal(g, ctx) {
  const deltas = scoreFib(g.options, g.votes);
  addPoints(g, deltas);
  const votersOf = (id) => Object.entries(g.votes).filter(([, o]) => o === id).map(([v]) => ctx.name(v));
  // Lies first, truth last.
  const order = { house: 0, lie: 1, truth: 2 };
  g.result = {
    options: [...g.options]
      .sort((a, b) => order[a.kind] - order[b.kind])
      .map((o) => ({ text: o.text, kind: o.kind, authors: o.authors.map(ctx.name), voters: votersOf(o.id) })),
    deltas,
  };
  g.stage = 'reveal';
  clearTimer(g);
}
