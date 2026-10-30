import { test } from 'node:test';
import assert from 'node:assert/strict';
import { previousSeason, seasonBounds, seasonInfo, seasonOf, seasonPoints, withPlaces } from '../src/seasons.js';

test('seasons are calendar months in UTC', () => {
  assert.equal(seasonOf(Date.UTC(2026, 10, 30, 23, 59)), '2026-11');
  assert.equal(seasonOf(Date.UTC(2026, 11, 1, 0, 0)), '2026-12');
  const { start, end } = seasonBounds('2026-12');
  assert.equal(start, Date.UTC(2026, 11, 1));
  assert.equal(end, Date.UTC(2027, 0, 1));
  assert.equal(seasonInfo('2026-11').name, 'November 2026');
  assert.equal(previousSeason('2027-01'), '2026-12');
});

test('season points reward placing well in bigger games', () => {
  assert.equal(seasonPoints(1, 6), 12);
  assert.equal(seasonPoints(6, 6), 2);
  assert.equal(seasonPoints(1, 3), 6);
  assert.ok(seasonPoints(1, 10) > seasonPoints(1, 4));
});

test('ties share a place', () => {
  const rows = withPlaces([{ points: 30 }, { points: 30 }, { points: 20 }, { points: 5 }]);
  assert.deepEqual(rows.map((r) => r.place), [1, 1, 3, 4]);
});
