const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../surf-model.js');
const W = require('../surf-weather.js');
const hazards = require('../surf-hazards.js');
const spots = require('../surf-spots.js');

test('the wetsuit follows the water and gets extras in cold air', () => {
  assert.equal(W.wetsuit(4), '6/5 mm, buty, rękawice, kaptur');
  assert.equal(W.wetsuit(9.5, 7), '5/4 mm, buty, rękawice, kaptur');
  assert.equal(W.wetsuit(11, 14), '5/4 mm, buty');
  assert.equal(W.wetsuit(11, 5), '5/4 mm, buty, rękawice');
  assert.equal(W.wetsuit(14, 10), '4/3 mm, buty');
  assert.equal(W.wetsuit(14, 20), '4/3 mm');
  assert.equal(W.wetsuit(17), '3/2 mm');
  assert.equal(W.wetsuit(20), '2 mm lub shorty');
  assert.equal(W.wetsuit(23), 'lycra');
  assert.equal(W.wetsuit(null), null);
});

test('sea ice off the beach warns, lowers the confidence and holds the score down', () => {
  const spot = { id: 'test', lat: 54.35, lon: 18.9, normal: 0 };
  const time = Date.UTC(2027, 0, 20, 10) / 1000;
  const hourly = { time: [time] };
  for (const model of Object.keys(M.WIND_MODELS)) { hourly[`wind_speed_10m_${model}`] = [3]; hourly[`wind_direction_10m_${model}`] = [180]; }
  const at = ice => {
    const result = { time, height: 1.2, period: 6, energyPeriod: 6.5, direction: 0, depth: 2, distance: 200, powerKWm: 4, ice,
      shoreDistance: 150, shoreDistanceMin: 100, shoreDistanceMax: 200, lat: 54.3518, lon: 18.9 };
    const simulation = { schema: 2, version: M.SIMULATION_VERSION, status: 'ready', spot, generatedAt: time, windFetchedAt: time, boundaryFetchedAt: time,
      maxShoreDistanceM: 500, profileGridM: 50, profileReference: 'estimated-shoreline', shoreline: { landDistance: 0, waterDistance: 100, distance: 50 }, hourly: [result] };
    return M.buildCoastalForecast(spot, { hourly }, simulation, time * 1000, { historyHours: 0 })[0];
  };
  const open = at(0), floes = at(.15), frozen = at(.6);
  assert.ok(open.score > 1);
  assert.equal(floes.score, open.score);
  assert.ok(floes.flags.includes('Uwaga: kra na morzu'));
  assert.ok(floes.confidence.reasons.includes('Lód na morzu — model fal go nie uwzględnia'));
  assert.ok(frozen.score <= 1);
  assert.ok(frozen.flags.includes('Lód na morzu — fale tłumione, surfing niemożliwy lub niebezpieczny'));
  assert.equal(at(null).score, open.score, 'no ice data is no ice');
});

test('every spot has its hazard notes for its own position', () => {
  for (const spot of spots) {
    const entry = hazards[spot.id];
    assert.ok(entry, spot.id);
    assert.equal(entry.lat, spot.lat); assert.equal(entry.lon, spot.lon);
    assert.ok(Array.isArray(entry.notes) && entry.notes.every(note => typeof note === 'string' && note.length > 20));
  }
  assert.ok(hazards['kolobrzeg-latarnia-surf'].notes.some(note => note.startsWith('Wejście do portu')), 'Kołobrzeg harbour entrance');
});
