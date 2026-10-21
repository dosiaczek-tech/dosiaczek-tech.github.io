const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../surf-compare.js');
const M = require('../surf-model.js');

test('automatic selection keeps the highest future scores and randomizes only ties', () => {
  const now = Date.parse('2026-10-21T08:00:00Z');
  const entry = (id, score, day = 1) => ({id, rows: [0, 1, 2].map(h => ({
    time: now / 1000 + day * 86400 + h * 3600, score, daylight: true, height: 1, simulation: {}
  }))});
  const entries = [entry('best', 9), entry('second', 8), ...Array.from({length: 8}, (_, i) => entry(`tie${i}`, 7)),
    entry('poor', 2), entry('today', 10, 0), entry('outside', 10, 6), {id: 'missing', rows: []}];
  const a = C.bestSpots(entries, M, now, () => .5);
  const b = C.bestSpots(entries, M, now, () => .99);
  assert.equal(a.length, 5);
  assert.deepEqual(a.slice(0, 2), ['best', 'second']);
  assert.ok(a.slice(2).every(id => id.startsWith('tie')));
  assert.notDeepEqual(a, b);
  assert.deepEqual(C.bestSpots([{id: 'missing', rows: []}], M, now), []);
  assert.deepEqual(C.bestSpots([entry('only', 0)], M, now), ['only']);
});

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
  assert.equal(C.daily(rows, M, (start + 4 * 3600) * 1000).get(day).historical, true);
  assert.equal(C.daily(rows, M, (start + 4 * 3600) * 1000).get(day).score, 8);
  assert.equal(C.daily(rows.map(r => ({...r, daylight: false})), M, start * 1000).get(day), null);
  assert.equal(C.daily(rows.map(r => ({...r, score: null})), M, start * 1000).get(day), null);
  assert.equal(C.daily(rows.map(r => ({...r, simulation: null})), M, start * 1000).size, 0);
});

test('history expires after twelve hours and never reuses cached future forecasts', () => {
  const now = Date.parse('2026-10-21T18:00:00Z');
  const row = hours => ({time: now / 1000 + hours * 3600, score: 8, height: 1, simulation: {}, daylight: true});
  const saved = [-13, -12, -10, -9, -8, 1].map(row);
  const retained = C.retainHistory([], saved, now);
  assert.deepEqual(retained.map(r => (r.time * 1000 - now) / 3600000), [-12, -10, -9, -8]);
  assert.ok(retained.every(r => r.archived));
  const corrected = C.retainHistory([{...row(-10), score: 4}], saved, now);
  assert.equal(corrected.find(r => r.time === row(-10).time).score, 4);
  const history = C.daily(retained, M, now).get(C.dayKey(now / 1000));
  assert.equal(history.historical, true);
  assert.equal(history.archived, true);
});

test('future sessions take priority over better historical sessions', () => {
  const now = Date.parse('2026-10-21T10:00:00Z');
  const rows = [-3, -2, -1, 1, 2, 3].map(h => ({time: now / 1000 + h * 3600, score: h < 0 ? 9 : 4, daylight: true, height: 1, simulation: {}}));
  const result = C.daily(rows, M, now).get(C.dayKey(now / 1000));
  assert.equal(result.score, 4);
  assert.equal(result.historical, false);
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
