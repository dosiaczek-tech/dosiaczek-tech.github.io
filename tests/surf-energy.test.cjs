const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../surf-model.js');
const close = (value, expected, tolerance = 1e-9) => assert.ok(Math.abs(value - expected) < tolerance, `${value} != ${expected}`);

test('1 m significant height means about 0.63 kJ/m² and 2.45 kW/m at 5 s in deep water', () => {
  const result = M.waveEnergy({ height: 1, period: 5 });
  close(result.energyKJm2, 0.628453125);
  close(result.powerKWm, 2.453, 0.005);
  assert.equal(result.method, 'deep-water');
});

test('doubling height quadruples energy and power; doubling period affects power, not energy density', () => {
  const base = M.waveEnergy({ height: 1, period: 5 });
  const tall = M.waveEnergy({ height: 2, period: 5 });
  const long = M.waveEnergy({ height: 1, period: 10 });
  close(tall.energyKJm2 / base.energyKJm2, 4);
  close(tall.powerKWm / base.powerKWm, 4);
  close(long.energyKJm2, base.energyKJm2);
  close(long.powerKWm / base.powerKWm, 2);
});

test('finite-depth power approaches the deep-water limit and the shallow-water group speed', () => {
  const deep = M.waveEnergy({ height: 1, period: 5 }, 200);
  close(deep.powerKWm, M.waveEnergy({ height: 1, period: 5 }).powerKWm, 0.001);
  assert.equal(deep.method, 'finite-depth');
  const shallow = M.waveEnergy({ height: 0.2, period: 20 }, 1);
  close(shallow.powerKWm / shallow.energyKJm2, Math.sqrt(9.81), 0.02);
});

test('missing height is not zero; missing period retains energy but not power', () => {
  for (const height of [null, undefined, -1, NaN, Infinity, '1']) {
    const result = M.waveEnergy({ height, period: 5 });
    assert.equal(result.energyKJm2, null); assert.equal(result.powerKWm, null);
  }
  for (const period of [null, undefined, 0, -1, NaN, Infinity]) {
    const result = M.waveEnergy({ height: 1, period });
    close(result.energyKJm2, 0.628453125); assert.equal(result.powerKWm, null);
  }
  assert.equal(M.waveEnergy({ height: 0, period: null }).powerKWm, 0);
  for (const depth of [0, -1, NaN, Infinity, '10']) assert.equal(M.waveEnergy({ height: 1, period: 5 }, depth).powerKWm, null);
});

test('energy is calculated per model before aggregation and remains available without wind', () => {
  const time = Date.UTC(2026, 9, 20) / 1000;
  const marine = { hourly: { time: [time], wave_height_dwd_ewam: [1], wave_period_dwd_ewam: [5], wave_direction_dwd_ewam: [0],
    wave_height_ecmwf_wam: [3], wave_period_ecmwf_wam: [10], wave_direction_ecmwf_wam: [0] } };
  const spot = { normal: 0 };
  const row = M.buildForecast(spot, marine, null, null, time * 1000)[0];
  close(row.energyKJm2, 3.142265625);
  close(row.powerKWm, 23.30, 0.03);
  assert.equal(row.energyModels, 2); assert.equal(row.powerModels, 2);
  assert.equal(row.score, null);
  // Only the offshore depth is required here, even if nearshore bathymetry is incomplete.
  const withDepth = M.buildForecast(spot, marine, null, { samples: [{ distance: 100, depth: null }, { distance: 5000, depth: 10 }] }, time * 1000)[0];
  assert.equal(withDepth.powerDepth, 10);
  assert.equal(withDepth.members[0].energetics.method, 'finite-depth');
  marine.hourly.wave_height_ecmwf_wam = [null];
  const partial = M.buildForecast(spot, marine, null, null, time * 1000)[0];
  close(partial.energyKJm2, 0.628453125);
  assert.equal(partial.energyModels, 1); assert.equal(partial.powerModels, 1);
});
