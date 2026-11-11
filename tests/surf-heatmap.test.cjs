const { test } = require('node:test');
const assert = require('node:assert/strict');
const H = require('../surf-heatmap.js');

test('columns run hour by hour from the current hour to the last rated hour of any spot', () => {
  const now = Date.parse('2026-11-10T18:25:00Z'), first = Date.parse('2026-11-10T18:00:00Z') / 1000;
  const spots = [
    new Map([[first - 3600, 9], [first, 4], [first + 2 * 3600, 6]]),
    new Map([[first + 5 * 3600, 2], [first + 9 * 3600, null], [first + 8 * 3600, 11], [first + 7 * 3600 + 60, 7]])
  ];
  const times = H.timeline(spots, now);
  assert.equal(times[0], first, 'the past hour is left out, the current one stays');
  assert.equal(times.at(-1), first + 5 * 3600, 'missing, invalid and unaligned ratings do not extend the grid');
  assert.ok(times.every((time, i) => !i || time - times[i - 1] === 3600));
  assert.deepEqual(H.timeline([new Map(), new Map([[first - 3600, 8]])], now), []);
});

test('the autumn clock change keeps both 02:00 hours as separate, named columns', () => {
  const first = Date.parse('2026-10-24T22:00:00Z') / 1000;
  const times = H.timeline([new Map([[first + 4 * 3600, 5]])], first * 1000);
  assert.equal(times.length, 5);
  assert.deepEqual(times.map(H.hourLabel), ['00:00–01:00', '01:00–02:00', '02:00–02:00 CEST', '02:00–03:00 CET', '03:00–04:00']);
  assert.equal(H.hourLabel(Date.parse('2026-11-10T13:00:00Z') / 1000), '14:00–15:00');
});

test('a point on the grid picks its cell, with the outer edges belonging to the outer cells', () => {
  assert.deepEqual(H.cellAt(0, 0, 340, 364, 336, 91), { row: 0, column: 0 });
  assert.deepEqual(H.cellAt(340, 364, 340, 364, 336, 91), { row: 90, column: 335 });
  assert.deepEqual(H.cellAt(-3, 400, 340, 364, 336, 91), { row: 90, column: 0 });
  assert.deepEqual(H.cellAt(170, 9, 340, 364, 336, 91), { row: 2, column: 168 });
});

test('a selected cell gets a darker shade of its own colour', () => {
  assert.equal(H.shade('#f3cf60'), '#b69b48');
  assert.equal(H.shade('#A9AEDB', .5), '#55576e');
  assert.equal(H.shade('#ffffff', 1), '#ffffff');
  assert.equal(H.shade('rgb(1, 2, 3)'), 'rgb(1, 2, 3)');
});

test('rows contain every catalogue spot once, in actual longitude order', () => {
  const spots = require('../surf-spots.js'), before = spots.map(s => s.id);
  const ordered = H.orderedSpots(spots);
  assert.equal(ordered.length, spots.length);
  assert.deepEqual(ordered.map(s => s.id).sort(), [...before].sort());
  assert.ok(ordered.every((s, i) => !i || ordered[i - 1].lon <= s.lon));
  assert.deepEqual(spots.map(s => s.id), before);
  assert.equal(ordered[0].id, 'swinoujscie');
  assert.equal(ordered.at(-1).id, 'piaski');
});

test('color boundaries follow the existing 0–10 recommendation scale', () => {
  assert.deepEqual([0, 1.49, 1.5, 2.99, 3, 4.99, 5, 6.49, 6.5, 7.99, 8, 8.99, 9, 10, null, undefined, -1, 11].map(H.tone),
    ['bad', 'bad', 'poor', 'poor', 'weak', 'weak', 'fair', 'fair', 'good', 'good', 'great', 'great', 'excellent', 'excellent', 'unknown', 'unknown', 'unknown', 'unknown']);
});

test('a zoomed view maps a point to the tile under it', () => {
  const view = { x: { from: .5, to: .75 }, y: { from: .25, to: .5 } };
  assert.deepEqual(H.cellAt(0, 0, 400, 400, 100, 40, view), { row: 10, column: 50 });
  assert.deepEqual(H.cellAt(399, 399, 400, 400, 100, 40, view), { row: 19, column: 74 });
  assert.deepEqual(H.cellAt(200, 200, 400, 400, 100, 40, view), { row: 15, column: 62 });
});

// View edges are fractions, so they are compared with a rounding tolerance.
const near = (actual, from, to, message) =>
  assert.ok(Math.abs(actual.from - from) < 1e-9 && Math.abs(actual.to - to) < 1e-9, `${message || ''} ${JSON.stringify(actual)}`);

test('pinching keeps the grid point under the fingers and stops at the edges and the zoom limit', () => {
  const full = { from: 0, to: 1 };
  near(H.viewAxis(full, .5, .5, 2, 10), .25, .75);
  near(H.viewAxis(full, 0, 0, 4, 10), 0, .25, 'zooming at an edge keeps that edge');
  near(H.viewAxis(full, .5, .5, 100, 4), .375, .625, 'tiles stop growing at the limit');
  near(H.viewAxis({ from: .25, to: .75 }, .5, .5, .1, 10), 0, 1, 'zooming out stops at the whole grid');
  near(H.viewAxis({ from: .25, to: .75 }, .5, .7, 1, 10), .15, .65, 'moving the fingers moves the grid with them');
  near(H.viewAxis({ from: .25, to: .75 }, .5, 1.5, 1, 10), 0, .5);
  near(H.viewAxis(full, .2, .9, 1, 10), 0, 1, 'the whole grid cannot be dragged away');
});

test('keys bring the selected tile into a zoomed view with the smallest move', () => {
  const axis = { from: .2, to: .4 };
  assert.equal(H.followAxis(axis, 25, 100), axis, 'a visible tile does not move the view');
  near(H.followAxis(axis, 40, 100), .21, .41);
  near(H.followAxis(axis, 10, 100), .1, .3);
});

test('axis labels name the first and last tile whose centre is in view', () => {
  assert.deepEqual(H.visibleEnds({ from: 0, to: 1 }, 335), [0, 334]);
  assert.deepEqual(H.visibleEnds({ from: .25, to: .5 }, 100), [25, 49]);
  assert.deepEqual(H.visibleEnds({ from: .254, to: .496 }, 100), [25, 49]);
  assert.deepEqual(H.visibleEnds({ from: .256, to: .494 }, 100), [26, 48]);
});
