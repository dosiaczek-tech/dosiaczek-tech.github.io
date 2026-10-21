const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../surf-compare.js');
const M = require('../surf-model.js');

test('first visit picks five unique spots and saved choices survive subsequent visits', () => {
  const catalog = Array.from({length: 10}, (_, i) => ({id: `spot-${i}`}));
  const first = C.choose(catalog, null, () => .5);
  assert.equal(first.length, 5);
  assert.equal(new Set(first).size, 5);
  assert.deepEqual(C.choose(catalog, first, () => { throw new Error('Must not reroll'); }), first);
  const repaired = C.choose(catalog, [first[0], first[0], 'removed'], () => 0);
  assert.equal(repaired[0], first[0]);
  assert.equal(new Set(repaired).size, 5);
  assert.equal(C.choose(catalog, {broken: true}).length, 5);
});

test('daily result selects the best future daylight session and leaves missing days unrated', () => {
  const start = Date.parse('2026-10-21T06:00:00Z') / 1000;
  const rows = [3, 3, 3, 8, 8, 8].map((score, i) => ({time: start + i * 3600, score, daylight: true, height: .8, simulation: {height: .8}}));
  const day = C.dayKey(start);
  assert.equal(C.daily(rows, M, start * 1000).get(day).score, 8);
  assert.equal(C.daily(rows, M, (start + 4 * 3600) * 1000).get(day), null);
  assert.equal(C.daily(rows.map(r => ({...r, daylight: false})), M, start * 1000).get(day), null);
  assert.equal(C.daily(rows.map(r => ({...r, score: null})), M, start * 1000).get(day), null);
  assert.equal(C.daily(rows.map(r => ({...r, simulation: null})), M, start * 1000).size, 0);
});

test('daily grouping uses Warsaw dates and cannot join windows across midnight or missing hours', () => {
  const start = Date.parse('2026-10-21T21:00:00Z') / 1000;
  const rows = [0, 1, 2].map(i => ({time: start + i * 3600, score: 8, daylight: true, height: 1, simulation: {}}));
  assert.equal(C.dayKey(start), '2026-10-21');
  assert.equal(C.dayKey(start + 3600), '2026-10-22');
  assert.ok([...C.daily(rows, M, start * 1000).values()].every(v => v === null));
  const gap = rows.map((r, i) => ({...r, time: start - 8 * 3600 + i * 7200}));
  assert.ok([...C.daily(gap, M, (start - 10 * 3600) * 1000).values()].every(v => v === null));
});
