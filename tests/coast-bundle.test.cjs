const { test } = require('node:test');
const assert = require('node:assert/strict');
const { slimNearshore, coastBundle, coastParts } = require('../scripts/coast-bundle.cjs');

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

test('the coast parts run west to east, each saying how many there are', () => {
  const at = (id, lon) => [id, { wind: { spotId: id, spot: { lon } }, nearshore: { spot: { id, lon }, hourly: [] } }];
  const parts = coastParts([at('d', 18.6), at('a', 14.2), at('c', 16.9), at('b', 14.2), at('e', 19.3), ['x', { wind: { spotId: 'x' } }]], 4);
  assert.deepEqual(parts.map(part => [part.part, part.parts, Object.keys(part.spots)]),
    [[1, 4, ['a']], [2, 4, ['b', 'c']], [3, 4, ['d']], [4, 4, ['e', 'x']]], 'ties by id, spots without coordinates last');
  assert.deepEqual(coastParts([at('a', 14)], 4).map(part => part.parts), [1]);
  assert.equal(coastParts([], 4).length, 1);
});

