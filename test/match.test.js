import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROMPTS } from '../src/content/prompts.js';
import { classify, clusterUnknowns, compilePrompt, levenshtein, normalize, sameAnswer, titleCase, toKey } from '../src/match.js';

const pasta = compilePrompt(PROMPTS.find((p) => p.id === 'pasta'));
const africa = compilePrompt(PROMPTS.find((p) => p.id === 'africa'));

test('every prompt compiles without alias collisions and has all four tiers', () => {
  const ids = new Set();
  for (const p of PROMPTS) {
    assert.ok(!ids.has(p.id), `duplicate prompt id ${p.id}`);
    ids.add(p.id);
    const c = compilePrompt(p);
    for (const tier of [1, 2, 3, 4]) assert.ok(c.answers.some((a) => a.tier === tier), `${p.id} has no tier ${tier}`);
  }
});

test('normalisation ignores case, accents, punctuation and articles', () => {
  assert.equal(normalize('  The Orecchiétte!! '), 'orecchiette');
  assert.equal(toKey('Bow-Ties'), toKey('bowtie'));
  assert.equal(toKey("Côte d'Ivoire"), toKey('cote divoire'));
});

test('title case keeps small words low and roman numerals up', () => {
  assert.equal(titleCase('romeo and juliet'), 'Romeo and Juliet');
  assert.equal(titleCase('henry vi'), 'Henry VI');
  assert.equal(titleCase('BMW'), 'BMW');
});

test('levenshtein', () => {
  assert.equal(levenshtein('kitten', 'sitting'), 3);
  assert.equal(levenshtein('', 'abc'), 3);
});

test('exact, alias and typo matches', () => {
  assert.equal(classify(pasta, 'Spaghetti').label, 'Spaghetti');
  assert.equal(classify(pasta, 'bow ties').label, 'Farfalle');
  assert.equal(classify(pasta, 'orechiete').label, 'Orecchiette');
  assert.equal(classify(pasta, 'pappardele').tier, 3);
});

test('short answers must be exact; ambiguous typos stay unmatched', () => {
  assert.equal(classify(pasta, 'zit').kind, 'unknown');
  assert.equal(classify(africa, 'nigera').kind, 'unknown');
  assert.equal(classify(pasta, '   ').kind, 'blank');
});

test('unknown answers cluster with typos', () => {
  const c = { a: classify(pasta, 'tortiglioni'), b: classify(pasta, 'Tortiglion'), x: classify(pasta, 'pizza') };
  assert.deepEqual(clusterUnknowns(c).map((k) => k.players.length).sort(), [1, 2]);
  assert.ok(sameAnswer('Spider-Man', 'spiderman'));
  assert.ok(!sameAnswer('cat', 'bat'));
});
