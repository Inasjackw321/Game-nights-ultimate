// Reef Derby: bet play chips on a race of sea creatures. Long shots pay big.
// Odds are fair (payout = 1 / chance), so it's luck plus nerve.
import { clearTimer, everyoneIn, setTimer, shuffleWith, tooLate, zeroScores } from './kit.js';

export const START_CHIPS = 1000;
export const MIN_BET = 10;
const BET_SECONDS = 25;
const RACE_SECONDS = 9; // the client animates the race over ~8s
const RESULT_SECONDS = 8;
const TICKS = 48;

export const RACERS = [
  { id: 'crab', name: 'Sir Snapsalot' },
  { id: 'jelly', name: 'Jelly Belly' },
  { id: 'turtle', name: 'Turbo Shell' },
  { id: 'octopus', name: 'Inky Legs' },
  { id: 'seahorse', name: 'Neigh-mo' },
  { id: 'eel', name: 'Eelectric' },
];
const WEIGHTS = [30, 22, 18, 14, 10, 6];

export function makeOdds(rand) {
  const weights = shuffleWith(WEIGHTS, rand);
  const total = weights.reduce((a, b) => a + b, 0);
  return RACERS.map((r, i) => ({ ...r, chance: weights[i] / total, payout: Math.round((total / weights[i]) * 10) / 10 }));
}

export function pickWinner(odds, rand) {
  let x = rand();
  for (let i = 0; i < odds.length; i++) {
    x -= odds[i].chance;
    if (x <= 0) return i;
  }
  return odds.length - 1;
}

// Progress curves (0..1 per tick) that make `winner` cross the line first.
export function raceTrack(n, winner, rand) {
  const finishes = shuffleWith(Array.from({ length: n - 1 }, (_, i) => TICKS - 12 + i * 2 + Math.floor(rand() * 2)), rand);
  finishes.splice(winner, 0, TICKS - 15);
  return finishes.map((finish) => {
    const steps = Array.from({ length: TICKS }, () => 0.4 + rand() * 1.2);
    const toFinish = steps.slice(0, finish).reduce((a, b) => a + b, 0);
    let sum = 0;
    return [0, ...steps.map((s) => {
      sum += s;
      return Math.min(1, Math.round((sum / toFinish) * 1000) / 1000);
    })];
  });
}

export default {
  meta: {
    id: 'derby',
    name: 'Reef Derby',
    tagline: 'Bet play chips on racing sea creatures. Long shots pay big.',
    category: 'Casino',
    minPlayers: 1,
    options: [
      { key: 'rounds', label: 'Races', values: [3, 5, 7], default: 5 },
    ],
  },

  init(ctx) {
    const g = { ids: ctx.ids, scores: zeroScores(ctx.ids, START_CHIPS), race: 0, maxRaces: ctx.settings.rounds };
    startBetting(g, ctx);
    return g;
  },

  action(g, pid, msg, ctx) {
    if (!g.ids.includes(pid)) return 'You joined mid-game — you can play the next one.';
    if (tooLate(g, ctx)) return 'Too late — time is up.';
    if (msg.type === 'bet') {
      if (g.stage !== 'bet') return 'Betting is closed.';
      const racer = Number(msg.racer);
      const amount = Math.floor(Number(msg.amount));
      if (!g.odds[racer]) return 'Pick a racer.';
      if (!(amount >= MIN_BET)) return `Minimum bet is ${MIN_BET}.`;
      if (amount > g.scores[pid]) return "You don't have that many chips.";
      g.bets[pid] = { racer, amount };
      if (everyoneIn(g.ids.filter((id) => g.scores[id] >= MIN_BET), g.bets, ctx)) startRace(g, ctx);
      return;
    }
    if (msg.type === 'next' && g.stage === 'result') {
      if (!ctx.isHost(pid)) return 'Only the host can do that.';
      advance(g, ctx);
      return;
    }
    return 'Not right now.';
  },

  timeout(g, ctx) {
    if (g.stage === 'bet') startRace(g, ctx);
    else if (g.stage === 'race') finish(g, ctx);
    else if (g.stage === 'result') advance(g, ctx);
  },

  view(g, pid) {
    const tags = {};
    const marks = {};
    for (const [id, b] of Object.entries(g.bets)) {
      marks[id] = 'done';
      if (g.stage !== 'bet') tags[id] = `${b.amount} on ${RACERS[b.racer].name}`;
    }
    const title = g.stage === 'bet' ? `Race ${g.race} of ${g.maxRaces}: place your bets`
      : g.stage === 'race' ? "And they're off!"
      : `${g.odds[g.winner].name} wins!`;
    return {
      stage: g.stage,
      title,
      round: g.race - 1,
      total: g.maxRaces,
      deadline: g.deadline,
      duration: g.duration,
      canPlay: g.ids.includes(pid),
      chips: g.scores[pid] ?? 0,
      minBet: MIN_BET,
      odds: g.odds.map(({ id, name, payout }) => ({ id, name, payout })),
      myBet: g.bets[pid] ?? null,
      track: g.stage === 'bet' ? null : g.track,
      raceStart: g.raceStart ?? null,
      winner: g.stage === 'result' ? g.winner : null,
      deltas: g.stage === 'result' ? g.deltas : null,
      last: g.race >= g.maxRaces,
      tags,
      marks,
      money: true,
    };
  },
};

function startBetting(g, ctx) {
  g.race += 1;
  g.stage = 'bet';
  g.bets = {};
  g.odds = makeOdds(ctx.rand);
  g.track = null;
  g.winner = null;
  g.deltas = null;
  setTimer(g, BET_SECONDS, ctx);
}

function startRace(g, ctx) {
  for (const [id, b] of Object.entries(g.bets)) g.scores[id] -= b.amount;
  g.winner = pickWinner(g.odds, ctx.rand);
  g.track = raceTrack(g.odds.length, g.winner, ctx.rand);
  g.raceStart = ctx.now;
  g.stage = 'race';
  setTimer(g, RACE_SECONDS, ctx);
}

function finish(g, ctx) {
  g.deltas = {};
  for (const [id, b] of Object.entries(g.bets)) {
    const won = b.racer === g.winner ? Math.round(b.amount * g.odds[b.racer].payout) : 0;
    g.scores[id] += won;
    g.deltas[id] = won - b.amount;
  }
  g.stage = 'result';
  setTimer(g, RESULT_SECONDS, ctx);
}

function advance(g, ctx) {
  if (g.race >= g.maxRaces || g.ids.every((id) => g.scores[id] < MIN_BET)) {
    g.over = true;
    clearTimer(g);
    return;
  }
  startBetting(g, ctx);
}
