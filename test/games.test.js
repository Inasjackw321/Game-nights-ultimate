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
  const { groups, deltas, misses } = scoreDeepCut(classified, new Set([toKey('tortiglioni')]), pasta, { rand: rng() });
  assert.deepEqual(groups.map((g) => [g.label, g.count, g.points]), [['Spaghetti', 3, 33], ['tortiglioni', 2, 175], ['Trofie', 1, 500]]);
  assert.deepEqual(deltas, { a: 33, b: 33, c: 33, d: 500, e: 175, f: 175, g: 0, h: 0 });
  assert.equal(misses.length, 2);
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
  deepcut: (v, id, r) => v.stage === 'answer' && v.myAnswer === null ? { type: 'answer', text: pick(['spaghetti', 'Egypt', 'gold', 'zorblax', ''], r) } : null,
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

test('every game declares sane options', () => {
  for (const g of GAMES) {
    assert.equal(GAME_BY_ID[g.meta.id], g);
    for (const o of g.meta.options) assert.ok(o.values.includes(o.default), `${g.meta.id}.${o.key} default`);
  }
});
