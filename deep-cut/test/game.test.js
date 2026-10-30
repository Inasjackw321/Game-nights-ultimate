import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROMPTS } from '../src/prompts.js';
import {
  classify, clusterUnknowns, compilePrompt, groupPoints, levenshtein, normalize, scoreRound, toKey,
} from '../src/game.js';

const pasta = compilePrompt(PROMPTS.find((p) => p.id === 'pasta'));
const africa = compilePrompt(PROMPTS.find((p) => p.id === 'africa'));

test('every prompt compiles without alias collisions and has all four tiers', () => {
  const ids = new Set();
  for (const p of PROMPTS) {
    assert.ok(!ids.has(p.id), `duplicate prompt id ${p.id}`);
    ids.add(p.id);
    const c = compilePrompt(p);
    for (const tier of [1, 2, 3, 4]) {
      assert.ok(c.answers.some((a) => a.tier === tier), `${p.id} has no tier ${tier} answers`);
    }
  }
});

test('normalisation ignores case, accents, punctuation and articles', () => {
  assert.equal(normalize('  The Orecchiétte!! '), 'orecchiette');
  assert.equal(toKey('Bow-Ties'), toKey('bowtie'));
  assert.equal(toKey("Côte d'Ivoire"), toKey('cote divoire'));
});

test('levenshtein', () => {
  assert.equal(levenshtein('kitten', 'sitting'), 3);
  assert.equal(levenshtein('', 'abc'), 3);
  assert.equal(levenshtein('same', 'same'), 0);
});

test('exact, alias and typo matches', () => {
  assert.deepEqual(pick(classify(pasta, 'Spaghetti')), { kind: 'match', label: 'Spaghetti', tier: 1 });
  assert.equal(classify(pasta, 'bow ties').label, 'Farfalle');
  assert.equal(classify(pasta, 'orechiete').label, 'Orecchiette'); // two typos
  assert.equal(classify(pasta, 'pappardele').tier, 3);
});

test('short answers need to be exact', () => {
  assert.equal(classify(pasta, 'zit').kind, 'unknown'); // "ziti" is only one edit away
  assert.equal(classify(pasta, 'orzo').label, 'Orzo');
});

test('ambiguous typos go to the host rather than guessing', () => {
  assert.equal(classify(africa, 'nigera').kind, 'unknown'); // Niger or Nigeria?
  assert.equal(classify(africa, 'Nigeria').label, 'Nigeria');
});

test('blank and unknown answers', () => {
  assert.equal(classify(pasta, '   ').kind, 'blank');
  assert.equal(classify(pasta, 'Pizza').kind, 'unknown');
});

test('points split by the number of players who gave the answer', () => {
  assert.equal(groupPoints(4, 1), 500);
  assert.equal(groupPoints(4, 2), 250);
  assert.equal(groupPoints(1, 5), 20);
});

test('a round scores duplicates, approvals and misses, rarest last', () => {
  const answers = {
    a: 'spaghetti', b: 'Spagetti', c: 'spaghetti',
    d: 'trofie',
    e: 'tortiglioni', f: 'Tortiglioni!',
    g: 'pizza',
    h: '',
  };
  const classified = Object.fromEntries(Object.entries(answers).map(([p, t]) => [p, classify(pasta, t)]));
  const unknowns = clusterUnknowns(classified);
  assert.deepEqual(unknowns.map((u) => u.players.length).sort(), [1, 2]);

  const approved = new Set([toKey('tortiglioni')]);
  const { groups, misses, deltas } = scoreRound(classified, approved);

  assert.deepEqual(groups.map((g) => [g.label, g.count, g.points]), [
    ['Spaghetti', 3, 33],
    ['tortiglioni', 2, 175],
    ['Trofie', 1, 500],
  ]);
  assert.equal(groups[1].approved, true);
  assert.deepEqual(deltas, { a: 33, b: 33, c: 33, d: 500, e: 175, f: 175, g: 0, h: 0 });
  assert.deepEqual(misses.map((m) => m.reason).sort(), ['No answer', 'Not accepted']);
});

function pick({ kind, label, tier }) {
  return { kind, label, tier };
}
