const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const M = require('../surf-model.js');
const spots = require('../surf-spots.js');
const beaches = require('../surf-beach.js');

const WARNING = 'Uwaga: stromy brzeg — fala może rzucać tuż przy plaży';
const order = { value: .7, known: true };
const wind = { speed: 3, direction: 180, gust: 5 };
const rate = (beachSlope, height, peakPeriod) => {
  const wave = { height, period: 5, direction: 0 };
  return M.rate(wave, wind, { id: 'test', normal: 0, beachSlope }, null, { ...wave, basis: 'SWAN', blocked: false, peakPeriod }, order);
};

test('the surf similarity of the beach slope and the waves at the spot', () => {
  const L0 = 9.81 * 49 / (2 * Math.PI);
  assert.ok(Math.abs(M.shorebreak(.08, .8, 7) - .08 / Math.sqrt(.8 / L0)) < 1e-12);
  assert.equal(M.shorebreak(undefined, .8, 7), null);
  assert.equal(M.shorebreak(.08, 0, 7), null);
});

test('a steep beach warns when the waves at the spot are big and long enough to dump, without changing the score', () => {
  const steep = rate(1 / 10, .8, 7.5), plain = rate(undefined, .8, 7.5);
  assert.ok(steep.flags.includes(WARNING));
  assert.ok(steep.components.shorebreak >= M.SHOREBREAK);
  assert.equal(steep.score, plain.score, 'only a warning');
  assert.ok(!plain.flags.includes(WARNING), 'no scan, no warning');
  assert.ok(!rate(1 / 10, .3, 7.5).flags.includes(WARNING), 'small waves do no harm');
  assert.ok(!rate(1 / 10, 2.5, 5).flags.includes(WARNING), 'steep, short waves spill even here');
  assert.ok(!rate(1 / 40, .8, 9).flags.includes(WARNING), 'a gentle beach is not steep');
});

test('the slope belongs to the spot position it was measured at', () => {
  const measured = Object.entries(beaches);
  assert.ok(measured.length > 50);
  for (const [id, entry] of measured) {
    const spot = spots.find(s => s.id === id);
    assert.ok(spot, id);
    assert.ok(entry.slope >= 0 && entry.slope <= .5 && entry.lines >= 3, id);
    if (entry.lat === spot.lat && entry.lon === spot.lon && entry.normal === spot.normal) assert.equal(spot.beachSlope, entry.slope, id);
    else assert.equal(spot.beachSlope, undefined, `${id} moved since the scan`);
  }
});

test('the page loads the slopes before the spots', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.ok(html.indexOf('src="surf-beach.js') > -1);
  assert.ok(html.indexOf('src="surf-beach.js') < html.indexOf('src="surf-spots.js'));
});
