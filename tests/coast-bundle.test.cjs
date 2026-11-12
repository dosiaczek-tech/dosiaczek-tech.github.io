const { test } = require('node:test');
const assert = require('node:assert/strict');
const { slimNearshore, coastBundle } = require('../scripts/coast-bundle.cjs');

test('the coast file keeps everything but the cross-sections, like the published copy', () => {
  const wind = { schema: 1, spotId: 'a', data: { hourly: { time: [1] } } };
  const wave = { schema: 2, spot: { id: 'a' }, windUsed: [{ time: 1, speed: 4 }],
    hourly: [{ time: 1, height: .5, profile: [{ distance: 0 }] }], history: [{ time: 0, height: .4, profile: [] }] };
  const coast = coastBundle([['a', { wind, nearshore: wave }], ['b', { wind: { ...wind, spotId: 'b' } }], ['c', {}]]);
  assert.equal(coast.schema, 1);
  assert.deepEqual(coast.spots.a.wind, wind);
  assert.deepEqual(coast.spots.a.nearshore, { ...wave, hourly: [{ time: 1, height: .5 }], history: [{ time: 0, height: .4 }] });
  assert.deepEqual(coast.spots.b, { wind: { ...wind, spotId: 'b' } });
  assert.equal('c' in coast.spots, false);
  assert.equal(wave.hourly[0].profile.length, 1, 'the served document itself is left intact');
  assert.deepEqual(slimNearshore({ status: 'unavailable', error: 'Brak danych.' }), { status: 'unavailable', error: 'Brak danych.' });
});
