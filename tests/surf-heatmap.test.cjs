const { test } = require('node:test');
const assert = require('node:assert/strict');
const H = require('../surf-heatmap.js');

test('Polish day runs midnight to midnight with exact one-hour interval labels', () => {
  for (const day of ['2026-11-05', '2026-07-05']) {
    const slots = H.hoursForDay(day);
    assert.equal(slots.length, 24);
    assert.equal(slots[0].label, '00:00–01:00');
    assert.equal(slots[10].label, '10:00–11:00');
    assert.equal(slots[11].label, '11:00–12:00');
    assert.equal(slots.at(-1).label, '23:00–00:00');
    assert.equal(slots.at(-1).nextDay, true);
    assert.ok(slots.every(s => H.dayKey(s.time) === day && s.end - s.time === 3600));
    assert.ok(slots.slice(0, -1).every(s => !s.nextDay));
  }
  assert.equal(new Date(H.hoursForDay('2026-11-05')[0].time * 1000).toISOString(), '2026-11-04T23:00:00.000Z');
  assert.deepEqual(H.hoursForDay('invalid'), []);
});

test('each cell preserves its hourly rating, including zero, night, and gaps', () => {
  const slots = H.hoursForDay('2026-11-05');
  const rows = [
    { time: slots[0].time, score: 0, simulation: { height: 0 }, daylight: false },
    { time: slots[1].time, score: 9.3, simulation: { height: 1 } },
    { time: slots[2].time, score: null, simulation: { height: 1 } },
    { time: slots[3].time, score: 8, simulation: null },
    { time: slots[4].time, score: 10.1, simulation: { height: 1 } },
    { time: slots[5].time, score: NaN, simulation: { height: 1 } },
    { time: slots.at(-1).end, score: 7, simulation: { height: 1 } }
  ];
  const original = structuredClone(rows);
  const cells = H.cellsForDay(rows, '2026-11-05', slots[1].time * 1000 + 59 * 60000);
  assert.equal(cells.length, 24);
  assert.deepEqual(cells.slice(0, 6).map(c => c.score), [0, 9.3, null, null, null, null]);
  assert.equal(cells[0].tone, 'bad');
  assert.equal(cells[1].tone, 'excellent');
  assert.equal(cells[2].tone, 'unknown');
  assert.equal(cells[0].historical, true);
  assert.equal(cells[1].historical, false);
  assert.equal(cells.at(-1).score, null, 'next midnight belongs to the next day');
  assert.deepEqual(rows, original);
});

test('clock changes preserve distinct hours without averaging or inventing scores', () => {
  const autumn = H.hoursForDay('2026-10-25');
  assert.equal(autumn.length, 25);
  const repeated = autumn.filter(s => s.label.startsWith('02:00'));
  assert.equal(repeated.length, 2);
  assert.deepEqual(repeated.map(s => s.offset), ['CEST', 'CET']);
  const rows = repeated.map((s, i) => ({ time: s.time, score: [2, 9][i], simulation: {} }));
  const cells = H.cellsForDay(rows, '2026-10-25');
  assert.deepEqual(cells.filter(c => c.score !== null).map(c => c.score), [2, 9]);
  const spring = H.hoursForDay('2026-03-29');
  assert.equal(spring.length, 23);
  assert.equal(spring[1].label, '01:00–03:00');
  assert.ok(!spring.some(s => s.label.startsWith('02:00')));
});

test('Y-axis contains every catalogue spot once, in actual longitude order', () => {
  const spots = require('../surf-spots.js'), before = spots.map(s => s.id);
  const ordered = H.orderedSpots(spots);
  assert.equal(ordered.length, spots.length);
  assert.deepEqual(ordered.map(s => s.id).sort(), [...before].sort());
  assert.ok(ordered.every((s, i) => !i || ordered[i - 1].lon <= s.lon));
  assert.deepEqual(spots.map(s => s.id), before);
});

test('color boundaries follow the existing 0–10 recommendation scale', () => {
  assert.deepEqual([0, 1.49, 1.5, 2.99, 3, 4.99, 5, 6.49, 6.5, 7.99, 8, 8.99, 9, 10, null, -1, 11].map(H.tone),
    ['bad', 'bad', 'poor', 'poor', 'weak', 'weak', 'fair', 'fair', 'good', 'good', 'great', 'great', 'excellent', 'excellent', 'unknown', 'unknown', 'unknown']);
});

test('saved historical scores fill gaps older than twelve hours without replacing fresh values or resurrecting future forecasts', () => {
  const now = Date.parse('2026-11-05T21:30:00Z');
  const start = H.hoursForDay('2026-11-05')[0].time;
  const row = (time, score) => ({ time, score, simulation: true });
  const saved = [row(start, 0), row(start + 3600, 8), row(now / 1000 + 1800, 9), row(start - 9 * 86400, 5), row(start + 7200, 11)];
  const fresh = [row(start, null), row(start + 3600, 6)];
  const result = H.mergeHistory(fresh, saved, now);
  assert.equal(result.find(r => r.time === start).score, 0);
  assert.equal(result.find(r => r.time === start).archived, true);
  assert.equal(result.find(r => r.time === start + 3600).score, 6);
  assert.equal(result.length, 2);
  assert.equal(H.cellsForDay(result, '2026-11-05', now)[0].tone, 'bad');
});

test('history-only days remain selectable after noon and new midnight does not erase yesterday', () => {
  const now = Date.parse('2026-11-05T21:30:00Z');
  const past = H.hoursForDay('2026-11-04')[0].time;
  const rows = H.mergeHistory([], [{ time: past, score: 7, simulation: true }], now);
  assert.ok(H.calendarDays([rows], now).includes('2026-11-04'));
  assert.ok(H.calendarDays([rows], now).includes('2026-11-10'));
  const tomorrow = Date.parse('2026-11-06T00:15:00Z');
  assert.equal(H.mergeHistory([], rows, tomorrow)[0].score, 7);
});

test('compact score store works with restricted storage and separates coordinate/model keys', async () => {
  const store = H.historyStore(null);
  const time = H.hoursForDay('2026-11-05')[0].time;
  await store.write('v1:spot:54:19:350', [{ time, score: 4, simulation: {} }, { time: time + 3600, score: null, simulation: {} }]);
  assert.deepEqual(await store.read('v1:spot:54:19:350'), [{ time, score: 4, simulation: true }]);
  assert.deepEqual(await store.read('v1:spot:54.1:19:350'), []);
  assert.deepEqual(await store.read('v2:spot:54:19:350'), []);
});
