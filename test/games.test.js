import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GAMES, GAME_BY_ID, defaultSettings } from '../src/games/index.js';
import { PROMPTS } from '../src/content/prompts.js';
import { FACTS } from '../src/content/facts.js';
import { QUIZ } from '../src/content/quiz.js';
import { classify, clusterUnknowns, compilePrompt, toKey } from '../src/match.js';
import { groupPoints, scoreDeepCut } from '../src/games/deepcut.js';
import { scoreHiveMind } from '../src/games/hivemind.js';
import { buildOptions, isTruth, scoreFib } from '../src/games/fib.js';
import { blitzPoints } from '../src/games/blitz.js';
import { tallyLikely } from '../src/games/likely.js';
import { assignTargets, solvePoints } from '../src/games/whoami.js';
import { handValue, isBlackjack, payout } from '../src/games/blackjack.js';
import { countFace, isRaise, minRaise } from '../src/games/dice.js';
import { makeOdds, raceTrack } from '../src/games/derby.js';
import { BOARD, netWorth, tollFor } from '../src/games/tycoon.js';
import { guessPoints, isClose, maskWord, MAX_INK_POINTS } from '../src/games/sketch.js';

// Deterministic PRNG so failures are reproducible.
function rng(seed = 1) {
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

const pasta = compilePrompt(PROMPTS.find((p) => p.id === 'pasta'));

test('Deep Cut: points split by duplicates, rarest revealed last', () => {
  assert.equal(groupPoints(4, 1), 500);
  assert.equal(groupPoints(1, 5), 20);
  const answers = { a: 'spaghetti', b: 'Spagetti', c: 'spaghetti', d: 'trofie', e: 'tortiglioni', f: 'Tortiglioni!', g: 'pizza', h: '' };
  const classified = Object.fromEntries(Object.entries(answers).map(([p, t]) => [p, classify(pasta, t)]));
  clusterUnknowns(classified);
  const { groups, deltas, misses } = scoreDeepCut(classified, pasta, { rand: rng() });
  assert.deepEqual(groups.map((g) => [g.label, g.count, g.points]), [['Spaghetti', 3, 33], ['Trofie', 1, 500]]);
  assert.deepEqual(deltas, { a: 33, b: 33, c: 33, d: 500, e: 0, f: 0, g: 0, h: 0 });
  assert.equal(misses.length, 3);
});

test('Deep Cut judges answers instantly: off-list answers bounce, real ones lock in', () => {
  const game = GAME_BY_ID.deepcut;
  const ctx = { now: 1000, settings: defaultSettings(game.meta), seen: [], rand: rng(9), name: (id) => id, online: () => true, isHost: () => true, ids: ['a', 'b'] };
  const g = game.init(ctx);
  const prompt = compilePrompt(PROMPTS.find((p) => p.id === g.deck[0]));
  assert.match(game.action(g, 'a', { type: 'answer', text: 'zorblax prime' }, ctx), /isn't on our list/);
  assert.equal(g.answers.a, undefined, 'rejected answers are not locked in');
  const real = prompt.answers.find((x) => x.tier === 2);
  assert.equal(game.action(g, 'a', { type: 'answer', text: real.label.toLowerCase() }, ctx), undefined);
  assert.equal(game.view(g, 'a', ctx).myLabel, real.label);
  assert.match(game.action(g, 'a', { type: 'answer', text: real.label }, ctx), /already locked in/);
  game.action(g, 'b', { type: 'answer', text: prompt.answers.find((x) => x.tier === 4).label }, ctx);
  assert.equal(g.stage, 'reveal', 'round closes the moment everyone is in, no host review');
  assert.deepEqual(g.result.deltas, { a: 200, b: 500 });
});

test('Hive Mind: points for matching others, bonus for the biggest school', () => {
  const answers = { a: 'penne', b: 'penne', c: 'Penne', d: 'ziti', e: 'ziti', f: 'orzo' };
  const classified = Object.fromEntries(Object.entries(answers).map(([p, t]) => [p, classify(pasta, t)]));
  clusterUnknowns(classified);
  const { deltas } = scoreHiveMind(classified);
  assert.deepEqual(deltas, { a: 300, b: 300, c: 300, d: 100, e: 100, f: 0 });
});

test('Fib Factory: truth detection, merged lies, scoring', () => {
  const fact = FACTS.find((f) => f.id === 'wombat');
  assert.ok(isTruth(fact, 'Cubes!'));
  assert.ok(!isTruth(fact, 'spirals'));
  const options = buildOptions(fact, { a: 'pyramids', b: 'Pyramids', c: 'hearts' }, rng());
  assert.equal(options.filter((o) => o.kind === 'lie').length, 2);
  assert.ok(options.length >= 4);
  const pyramid = options.find((o) => o.text === 'pyramids');
  const truth = options.find((o) => o.kind === 'truth');
  const deltas = scoreFib(options, { a: truth.id, c: pyramid.id, d: pyramid.id });
  assert.deepEqual(deltas, { a: 500 + 500, b: 500 }); // a found truth (+500) and fooled c and d with b (+250 each)
  for (const f of FACTS) for (const d of f.decoys) assert.ok(!isTruth(f, d), `${f.id} decoy "${d}" reads as the truth`);
});

test('Blitz: speed bonus and question pack shape', () => {
  assert.equal(blitzPoints(true, 15000, 15000), 1000);
  assert.equal(blitzPoints(true, 0, 15000), 500);
  assert.equal(blitzPoints(false, 9000, 15000), 0);
  for (const q of QUIZ) {
    assert.equal(q.choices.length, 4, q.id);
    assert.equal(new Set(q.choices).size, 4, q.id);
  }
});

test('Most Likely To: voters for the top pick score, ties included', () => {
  const { winners, deltas } = tallyLikely({ a: 'x', b: 'x', c: 'y', x: 'y', y: 'a' });
  assert.deepEqual(winners.sort(), ['x', 'y']);
  assert.deepEqual(deltas, { a: 200, b: 200, c: 200, x: 200 });
});

test('Who Am I?: everyone writes for exactly one other player', () => {
  const ids = ['a', 'b', 'c', 'd', 'e'];
  const t = assignTargets(ids, rng(7));
  assert.deepEqual(Object.values(t).sort(), ids);
  for (const id of ids) assert.notEqual(t[id], id);
  assert.equal(solvePoints(0), 1000);
  assert.equal(solvePoints(20), 200);
});

test('Blackjack: hand values and payouts', () => {
  assert.deepEqual(handValue(['A♠', 'K♥']), { total: 21, soft: true });
  assert.equal(handValue(['A♠', 'A♥', '9♦']).total, 21);
  assert.equal(handValue(['K♠', 'Q♥', '5♦']).total, 25);
  assert.ok(isBlackjack(['A♠', '10♥']));
  assert.deepEqual(payout({ cards: ['A♠', 'K♥'], bet: 100 }, ['10♣', '7♦']), { result: 'blackjack', back: 250 });
  assert.deepEqual(payout({ cards: ['10♠', '9♥'], bet: 100 }, ['10♣', '7♦']), { result: 'win', back: 200 });
  assert.deepEqual(payout({ cards: ['10♠', '7♥'], bet: 100 }, ['10♣', '7♦']), { result: 'push', back: 100 });
  assert.deepEqual(payout({ cards: ['10♠', '9♥', '5♥'], bet: 100 }, ['10♣', '6♦', '9♦']), { result: 'bust', back: 0 });
});

test("Liar's Dice: wild ones and raise rules", () => {
  assert.equal(countFace([1, 2, 3, 3, 5], 3), 3);
  assert.ok(isRaise(null, { qty: 1, face: 2 }));
  assert.ok(isRaise({ qty: 3, face: 4 }, { qty: 3, face: 5 }));
  assert.ok(isRaise({ qty: 3, face: 4 }, { qty: 4, face: 2 }));
  assert.ok(!isRaise({ qty: 3, face: 4 }, { qty: 3, face: 4 }));
  assert.ok(!isRaise(null, { qty: 2, face: 1 }));
  assert.deepEqual(minRaise({ qty: 2, face: 6 }), { qty: 3, face: 2 });
});

test('Reef Derby: fair odds and the chosen winner finishes first', () => {
  const odds = makeOdds(rng(3));
  const chance = odds.reduce((a, o) => a + o.chance, 0);
  assert.ok(Math.abs(chance - 1) < 1e-9);
  for (let w = 0; w < 6; w++) {
    const track = raceTrack(6, w, rng(w + 10));
    const finish = track.map((curve) => curve.findIndex((p) => p >= 1));
    assert.ok(finish.every((f) => f > 0), 'everyone finishes');
    assert.equal(Math.min(...finish), finish[w]);
    assert.equal(finish.filter((f) => f === finish[w]).length, 1);
  }
});

test('Reef Tycoon: tolls grow with coral and reef networks', () => {
  const g = { owner: { 1: 'a' }, level: { 1: 0 }, pearls: { a: 100 } };
  assert.equal(tollFor(g, 1), BOARD[1].toll);
  g.level[1] = 2;
  assert.equal(tollFor(g, 1), Math.round(BOARD[1].toll * 5));
  g.owner[2] = 'a';
  assert.equal(tollFor(g, 1), Math.round(BOARD[1].toll * 5 * 1.5)); // neighbouring plot owned
  assert.equal(netWorth(g, 'a'), 100 + BOARD[1].price + 2 * Math.round(BOARD[1].price * 0.6) + BOARD[2].price);
  assert.equal(BOARD.length, 20);
});

test('Reef Sketch: guessing, hints and close calls', () => {
  assert.equal(guessPoints(80000, 80000), 500);
  assert.equal(guessPoints(0, 80000), 100);
  assert.ok(isClose('jellyfsh', 'jellyfish'));
  assert.ok(isClose('jelly', 'jellyfish'));
  assert.ok(!isClose('jellyfish', 'jellyfish'));
  assert.ok(!isClose('cat', 'whale'));
  assert.equal(maskWord('hot dog', [0, 1, 2, 4, 5, 6], 0), '___ ___');
  assert.equal(maskWord('hot dog', [4, 0], 2), 'h__ d__');
});

test('Reef Sketch: only the artist can draw, and ink is capped', () => {
  const game = GAME_BY_ID.sketch;
  const ctx = { now: 1000, settings: defaultSettings(game.meta), seen: [], rand: rng(3), name: (id) => id, online: () => true, isHost: () => true, ids: ['a', 'b', 'c'] };
  const g = game.init(ctx);
  const artist = g.drawers[0];
  const other = g.ids.find((id) => id !== artist);
  assert.equal(game.ink(g, artist, { k: 's', id: 'x', c: 1, w: 2, p: [1, 2, 3, 4] }), null, 'no drawing while choosing');
  game.action(g, artist, { type: 'choose', index: 0 }, ctx);
  assert.equal(g.stage, 'draw');
  assert.equal(game.view(g, other, ctx).word, null, 'guessers cannot see the word');
  assert.equal(game.view(g, artist, ctx).word, g.word);
  assert.equal(game.ink(g, other, { k: 's', id: 'x', c: 1, w: 2, p: [1, 2] }), null, 'guessers cannot draw');
  assert.deepEqual(game.ink(g, artist, { k: 's', id: 'x', c: 99, w: 9, p: [5000, -3, 10, 20] }), { k: 's', id: 'x', c: 11, w: 4, p: [1000, 0, 10, 20] });
  assert.ok(game.ink(g, artist, { k: 'a', id: 'x', p: [30, 40] }));
  assert.equal(game.inkSnapshot(g).strokes[0].p.length, 6);
  g.inkPoints = MAX_INK_POINTS;
  assert.equal(game.ink(g, artist, { k: 'a', id: 'x', p: [1, 1] }), null, 'ink is capped');
  assert.match(game.action(g, artist, { type: 'answer', text: g.word }, ctx), /artist/);
  assert.equal(game.action(g, other, { type: 'answer', text: 'definitely not it' }, ctx), undefined);
  assert.equal(g.chat.at(-1).text, 'definitely not it');
  game.action(g, other, { type: 'answer', text: g.word.toUpperCase() }, ctx);
  assert.ok(other in g.guessed);
  assert.match(game.action(g, other, { type: 'answer', text: g.word }, ctx), /already got it/);
  assert.ok(!g.chat.some((c) => c.text === g.word), 'correct answers never appear in the chat');
});

// ---- full simulated games for every module --------------------------------

// A tiny fake room: everyone online, time advances when timers expire.
function simulate(game, n, decide, { seed = 1, maxSteps = 5000 } = {}) {
  const ids = Array.from({ length: n }, (_, i) => `p${i}`);
  const rand = rng(seed);
  let now = 1_000_000;
  const seen = [];
  const settings = defaultSettings(game.meta);
  const ctx = (extra = {}) => ({
    now, settings, seen, rand,
    name: (id) => id.toUpperCase(),
    online: () => true,
    hostOnline: () => true,
    isHost: (id) => id === 'p0',
    ...extra,
  });
  const g = game.init(ctx({ ids }));
  assert.deepEqual(Object.keys(g.scores).sort(), ids);
  let steps = 0;
  while (!g.over) {
    assert.ok(++steps < maxSteps, `${game.meta.id} never finished`);
    let acted = false;
    for (const id of ids) {
      const view = game.view(g, id, ctx());
      assert.ok(view && typeof view.title === 'string', `${game.meta.id} view has a title`);
      const msg = decide(view, id, rand);
      if (msg) {
        game.action(g, id, msg, ctx());
        acted = true;
        if (g.over) break;
      }
    }
    if (!acted && !g.over) {
      // Nobody has anything to do: jump to the deadline (or the host advances).
      if (g.deadline) {
        now = g.deadline + 1;
        game.timeout(g, ctx());
      } else {
        const err = game.action(g, 'p0', { type: 'next' }, ctx());
        if (err) game.action(g, 'p0', { type: 'reveal' }, ctx());
      }
    }
  }
  return { g, ids };
}

const pick = (arr, rand) => arr[Math.floor(rand() * arr.length)];

const bots = {
  // Deep Cut bots try a couple of times (off-list guesses bounce back), then give up.
  deepcut: (() => {
    const tries = new Map();
    return (v, id, r) => {
      if (v.stage !== 'answer' || v.myAnswer !== null) return null;
      const k = `${id}:${v.round}`;
      const n = tries.get(k) ?? 0;
      if (n >= 2) return null;
      tries.set(k, n + 1);
      const prompt = compilePrompt(PROMPTS.find((p) => p.text === v.title));
      return { type: 'answer', text: r() < 0.6 ? pick(prompt.answers, r).label : pick(['zorblax', 'qqq', ''], r) };
    };
  })(),
  hivemind: (v, id, r) => v.stage === 'answer' && v.myAnswer === null ? { type: 'answer', text: pick(['penne', 'oak', 'apple'], r) } : null,
  fib: (v, id, r) => {
    if (v.stage === 'write' && v.myAnswer === null) return { type: 'answer', text: `fake ${id} ${Math.floor(r() * 3)}` };
    if (v.stage === 'vote' && v.myVote === null) return { type: 'vote', option: pick(v.options.filter((o) => !o.mine), r).id };
    return null;
  },
  blitz: (v, id, r) => v.stage === 'question' && v.myChoice === null ? { type: 'answer', choice: Math.floor(r() * 4) } : null,
  likely: (v, id, r) => v.stage === 'vote' && v.myVote === null ? { type: 'vote', target: pick(v.candidates.filter((c) => c !== id), r) } : null,
  whoami: (v, id, r) => {
    if (v.stage === 'pick' && !v.myPick) return { type: 'pick', text: pick(['Batman', 'Mario', 'Cleopatra'], r) };
    if (v.stage === 'turn' && v.active === id) return r() < 0.3 ? { type: 'ask', kind: 'guess', text: v.tags ? pick(Object.values(v.tags), r) : 'Batman' } : { type: 'ask', kind: 'question', text: 'Am I real?' };
    if (v.stage === 'respond' && v.active !== id && !v.myResponse) return { type: 'respond', answer: r() < 0.5 ? 'yes' : 'no' };
    return null;
  },
  blackjack: (v, id, r) => {
    if (v.stage === 'bet' && !v.myBet && v.chips >= v.minBet) return { type: 'bet', amount: Math.min(v.chips, 50 + Math.floor(r() * 200)) };
    if (v.stage === 'play' && v.mine && !v.mine.done) return { type: v.mine.total < 15 ? 'hit' : 'stand' };
    return null;
  },
  dice: (v, id, r) => {
    if (v.stage !== 'bid' || v.active !== id) return null;
    if (v.bid && r() < 0.4) return { type: 'liar' };
    const next = minRaise(v.bid);
    return next.qty > v.totalDice ? { type: 'liar' } : { type: 'bid', ...next };
  },
  sketch: (v, id, r) => {
    if (v.stage === 'choose' && v.isDrawer) return { type: 'choose', index: Math.floor(r() * 3) };
    if (v.stage === 'draw' && !v.isDrawer && !(id in v.guessed) && r() < 0.3) return { type: 'answer', text: r() < 0.4 ? 'fish' : 'nope' };
    return null;
  },
  tycoon: (v, id, r) => {
    if (v.active !== id) return null;
    if (v.stage === 'roll') return { type: 'roll' };
    if (v.stage === 'decide') return { type: r() < 0.7 ? 'buy' : 'pass' };
    return null;
  },
  derby: (v, id, r) => v.stage === 'bet' && !v.myBet && v.chips >= v.minBet ? { type: 'bet', racer: Math.floor(r() * 6), amount: Math.min(v.chips, 100) } : null,
};

for (const game of GAMES) {
  test(`simulated ${game.meta.name} game runs to completion`, () => {
    assert.ok(bots[game.meta.id], `no bot for ${game.meta.id}`);
    for (const n of [Math.max(3, game.meta.minPlayers), 6, 10]) {
      for (const seed of [1, 2, 3]) {
        const { g, ids } = simulate(game, n, bots[game.meta.id], { seed });
        for (const id of ids) assert.ok(Number.isFinite(g.scores[id]), `${game.meta.id} score for ${id}`);
      }
    }
  });
}

test('Reef Tycoon: nobody ever goes below zero pearls', () => {
  for (const seed of [4, 5, 6, 7, 8]) {
    const { g, ids } = simulate(GAME_BY_ID.tycoon, 6, bots.tycoon, { seed });
    for (const id of ids) assert.ok(g.pearls[id] >= 0, `seed ${seed}: ${id} has ${g.pearls[id]}`);
    assert.equal(g.turnsTaken, g.maxTurns);
  }
});

test('every game declares sane options', () => {
  for (const g of GAMES) {
    assert.equal(GAME_BY_ID[g.meta.id], g);
    for (const o of g.meta.options) assert.ok(o.values.includes(o.default), `${g.meta.id}.${o.key} default`);
  }
});
