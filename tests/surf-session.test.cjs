const { test } = require('node:test');
const assert = require('node:assert/strict');
const S = require('../surf-session.js');
const M = require('../surf-model.js');
const start = Date.parse('2026-10-24T07:00:00Z') / 1000;
const rows = Array.from({length: 6}, (_, i) => ({time: start + i * 3600, height: 1, score: i < 3 ? 6 : 9, daylight: true, simulation: {height: 1}}));

test('session links retain the spot, Warsaw day and exact start; ordinary spot links still work', () => {
  assert.deepEqual(S.parse(`#surf/sobieszewo?day=2026-10-24&start=${start}`), {spotId: 'sobieszewo', day: '2026-10-24', start});
  assert.deepEqual(S.parse('#surf/sobieszewo'), {spotId: 'sobieszewo', day: null, start: null});
  for (const day of ['2026-02-30', 'no-date']) assert.equal(S.parse(`#surf/sobieszewo?day=${day}`).day, null);
  for (const value of ['NaN', 'Infinity', '99999999999999999', String(start - 86400)])
    assert.equal(S.parse(`#surf/sobieszewo?day=2026-10-24&start=${value}`).start, null);
});

test('an exact requested session is not replaced by the better session later that day', () => {
  const request = S.parse(`#surf/sobieszewo?day=2026-10-24&start=${start}`);
  const result = S.resolve(rows, request, M, (start - 3600) * 1000);
  assert.equal(result.score, 6);
  assert.equal(result.start, start);
  assert.equal(result.rows.length, 3);
  assert.equal(result.historical, false);
  assert.equal(S.resolve(rows.slice(1), request, M, (start - 3600) * 1000), null);
  assert.equal(S.resolve(rows, request, M, (start + 4 * 3600) * 1000).historical, true);
});

test('day-only links select that day best future session and never another day', () => {
  assert.equal(S.resolve(rows, {day: '2026-10-24', start: null}, M, (start - 3600) * 1000).score, 9);
  assert.equal(S.resolve(rows, {day: '2026-10-25', start: null}, M, (start - 3600) * 1000), null);
  assert.equal(S.resolve(rows, null, M), null);
});
