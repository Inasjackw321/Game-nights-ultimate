// Who Am I?: each player secretly picks a character for someone else. Everyone
// can see the character floating over your head except you. On your turn, ask
// a yes/no question or make a guess; the room answers. Solve it in fewer turns
// for more points.
import { CHARACTERS } from '../content/social.js';
import { cleanLabel, sameAnswer } from '../match.js';
import { clearTimer, everyoneIn, setTimer, shuffleWith, tooLate, zeroScores } from './kit.js';

const PICK_SECONDS = 60;
const TURN_SECONDS = 30;
const RESPOND_SECONDS = 20;
const LOG_SIZE = 12;

export function solvePoints(turnsUsed) {
  return Math.max(200, 1000 - 100 * turnsUsed);
}

// Everyone writes for exactly one other player: a single shuffled cycle.
export function assignTargets(ids, rand) {
  const order = shuffleWith(ids, rand);
  return Object.fromEntries(order.map((id, i) => [id, order[(i + 1) % order.length]]));
}

export default {
  meta: {
    id: 'whoami',
    name: 'Who Am I?',
    tagline: 'Pick a character for a friend. Ask yes/no questions to work out your own.',
    category: 'Guessing',
    minPlayers: 2,
    options: [
      { key: 'rounds', label: 'Turns each', values: [5, 8, 12], default: 8 },
    ],
  },

  init(ctx) {
    const g = {
      ids: ctx.ids,
      scores: zeroScores(ctx.ids),
      targetOf: assignTargets(ctx.ids, ctx.rand),
      chars: {},
      solved: {},
      used: zeroScores(ctx.ids),
      maxTurns: ctx.settings.rounds,
      order: shuffleWith(ctx.ids, ctx.rand),
      turn: -1,
      active: null,
      ask: null,
      responses: {},
      log: [],
      stage: 'pick',
    };
    setTimer(g, PICK_SECONDS, ctx);
    return g;
  },

  action(g, pid, msg, ctx) {
    if (!g.ids.includes(pid)) return 'You joined mid-game — you can play the next one.';
    if (tooLate(g, ctx)) return 'Too late — time is up.';

    if (msg.type === 'pick') {
      if (g.stage !== 'pick') return 'Characters are locked in.';
      const text = cleanLabel(msg.text, 40);
      if (!text) return 'Type a character.';
      g.chars[g.targetOf[pid]] = text;
      const writers = Object.fromEntries(Object.keys(g.chars).map((t) => [writerOf(g, t), true]));
      if (everyoneIn(g.ids, writers, ctx)) startPlay(g, ctx);
      return;
    }

    if (msg.type === 'ask') {
      if (g.stage !== 'turn' || pid !== g.active) return "It's not your turn.";
      const text = cleanLabel(msg.text, 80);
      if (!text) return 'Type a question or a guess.';
      const kind = msg.kind === 'guess' ? 'guess' : 'question';
      if (kind === 'guess' && sameAnswer(text, g.chars[pid])) {
        solve(g, pid, text, ctx);
        return nextTurn(g, ctx);
      }
      g.ask = { kind, text };
      g.responses = {};
      g.stage = 'respond';
      setTimer(g, RESPOND_SECONDS, ctx);
      return;
    }

    if (msg.type === 'respond') {
      if (g.stage !== 'respond') return 'Nothing to answer right now.';
      if (pid === g.active) return "You can't answer your own question!";
      g.responses[pid] = msg.answer === 'yes' ? 'yes' : 'no';
      if (everyoneIn(responders(g), g.responses, ctx)) resolve(g, ctx);
      return;
    }

    return 'Not right now.';
  },

  timeout(g, ctx) {
    if (g.stage === 'pick') startPlay(g, ctx);
    else if (g.stage === 'turn') {
      g.used[g.active] += 1;
      pushLog(g, { who: ctx.name(g.active), kind: 'skip', text: 'ran out of time' });
      nextTurn(g, ctx);
    } else if (g.stage === 'respond') resolve(g, ctx);
  },

  view(g, pid, ctx) {
    // Floating name tags: everyone's character except your own (until solved).
    const tags = {};
    if (g.stage !== 'pick' || g.over) {
      for (const id of g.ids) tags[id] = id === pid && !g.solved[id] && !g.over ? '???' : g.chars[id];
    }
    const marks = {};
    for (const id of g.ids) {
      if (g.solved[id]) marks[id] = 'solved';
      else if (g.stage === 'pick' && g.chars[g.targetOf[id]]) marks[id] = 'done';
      else if (g.stage === 'respond' && id in g.responses) marks[id] = 'done';
    }
    if (g.active && !g.over) marks[g.active] = 'turn';

    const turnsLeft = Object.fromEntries(g.ids.map((id) => [id, g.maxTurns - g.used[id]]));
    const title = g.stage === 'pick'
      ? `Pick a character for ${ctx.name(g.targetOf[pid])}`
      : g.over ? 'Everyone has had their turns!'
      : g.stage === 'respond' ? `${ctx.name(g.active)} ${g.ask.kind === 'guess' ? 'guesses' : 'asks'}: “${g.ask.text}”`
      : `${ctx.name(g.active)}'s turn`;

    return {
      stage: g.over ? 'done' : g.stage,
      title,
      deadline: g.deadline,
      duration: g.duration,
      canPlay: g.ids.includes(pid),
      target: g.targetOf[pid] ? { id: g.targetOf[pid], name: ctx.name(g.targetOf[pid]) } : null,
      myPick: g.chars[g.targetOf[pid]] ?? null,
      active: g.active,
      ask: g.ask,
      myResponse: g.responses[pid] ?? null,
      solved: Boolean(g.solved[pid]),
      turnsLeft,
      tags,
      marks,
      log: g.log,
    };
  },
};

function writerOf(g, target) {
  return Object.keys(g.targetOf).find((w) => g.targetOf[w] === target);
}

function responders(g) {
  return g.ids.filter((id) => id !== g.active);
}

function startPlay(g, ctx) {
  // Fill in characters for anyone whose writer didn't pick in time.
  const pool = shuffleWith(CHARACTERS.filter((c) => !Object.values(g.chars).includes(c)), ctx.rand);
  for (const id of g.ids) if (!g.chars[id]) g.chars[id] = pool.pop();
  nextTurn(g, ctx);
}

function nextTurn(g, ctx) {
  g.ask = null;
  g.responses = {};
  const n = g.order.length;
  for (let step = 1; step <= n; step++) {
    const id = g.order[(g.turn + step) % n];
    if (!g.solved[id] && g.used[id] < g.maxTurns) {
      g.turn = (g.turn + step) % n;
      g.active = id;
      g.stage = 'turn';
      setTimer(g, ctx.online(id) ? TURN_SECONDS : 3, ctx); // skip absent players quickly
      return;
    }
  }
  g.active = null;
  g.over = true;
  clearTimer(g);
}

function resolve(g, ctx) {
  const votes = Object.values(g.responses);
  const yes = votes.filter((v) => v === 'yes').length;
  const no = votes.length - yes;
  const who = ctx.name(g.active);
  if (g.ask.kind === 'guess') {
    if (yes > no) {
      solve(g, g.active, g.ask.text, ctx);
    } else {
      g.used[g.active] += 1;
      pushLog(g, { who, kind: 'guess', text: g.ask.text, answer: 'Nope' });
    }
  } else {
    g.used[g.active] += 1;
    const answer = !votes.length ? 'No answers' : yes > no ? 'Yes' : no > yes ? 'No' : 'Split';
    pushLog(g, { who, kind: 'question', text: g.ask.text, answer });
  }
  nextTurn(g, ctx);
}

function solve(g, pid, text, ctx) {
  g.scores[pid] += solvePoints(g.used[pid]);
  g.solved[pid] = true;
  g.used[pid] += 1;
  pushLog(g, { who: ctx.name(pid), kind: 'solved', text: g.chars[pid], guess: text });
}

function pushLog(g, entry) {
  g.log.push(entry);
  if (g.log.length > LOG_SIZE) g.log.shift();
}
