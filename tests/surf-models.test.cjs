const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const M = require('../surf-model.js');

const names = ['ecmwf_wam', 'dmi_wam_nsb', 'dwd_ewam', 'ncep_gfswave025'];
const spot = { id: 'test', lat: 54.35, lon: 18.9, normal: 0 };

test('every offshore model reaches the point in the proportion SWAN gave the chosen one, at most what the depth carries', () => {
  // 1.3 m offshore would be 1.04 m at the point; 1.4 m of water carries about 0.84 m.
  const record = { height: .8, depth: 1.4, boundary: { model: 'dmi_wam_nsb', heights: [.9, 1.0, 1.3, null] } };
  assert.deepEqual(M.modelHeights(record, names), [
    { model: 'ecmwf_wam', height: .72 }, { model: 'dmi_wam_nsb', height: .8 }, { model: 'dwd_ewam', height: .84 }]);
  assert.equal(M.modelHeights({ ...record, boundary: { ...record.boundary, heights: [.03, .04, .05, .06] } }, names), null,
    'no ratio from an almost flat sea');
  assert.equal(M.modelHeights({ ...record, boundary: { ...record.boundary, heights: [null, 1, null, null] } }, names), null, 'one model is no range');
  assert.equal(M.modelHeights({ height: .8, depth: 2, boundary: { model: 'dmi_wam_nsb' } }, names), null, 'older results');
  // GFS Wave's 25 km cell next to land reads 0 m while the others say 1.2-1.7 m: left out, as in the agreement check.
  const outlier = { height: .9, depth: 2, boundary: { model: 'ecmwf_wam', heights: [1.2, 1.68, 1.74, 0] } };
  assert.deepEqual(M.modelHeights(outlier, names).map(m => m.model), ['ecmwf_wam', 'dmi_wam_nsb', 'dwd_ewam']);
  const close = { height: .9, depth: 2, boundary: { model: 'ecmwf_wam', heights: [.9, 1.0, 1.05, 1.1] } };
  assert.equal(M.modelHeights(close, names).length, 4, 'models that roughly agree all stay');
  const chosenOff = { height: .9, depth: 2, boundary: { model: 'ncep_gfswave025', heights: [1.2, 1.68, 1.74, .3] } };
  assert.equal(M.modelHeights(chosenOff, names).length, 4, 'the model SWAN ran stays');
});

function forecast(byModel) {
  const time = Date.UTC(2026, 10, 14, 10) / 1000, times = [time, time + 3600, time + 7200];
  const hourly = { time: times };
  for (const model of Object.keys(M.WIND_MODELS)) {
    hourly[`wind_speed_10m_${model}`] = [3, 3, 3];
    hourly[`wind_direction_10m_${model}`] = [180, 180, 180];
  }
  const rows = times.map(t => ({ time: t, height: .7, period: 5, energyPeriod: 5.5, direction: 0, depth: 2, distance: 200, powerKWm: 2,
    shoreDistance: 150, shoreDistanceMin: 100, shoreDistanceMax: 200, lat: 54.3518, lon: 18.9,
    boundary: { model: 'ecmwf_wam', models: 4, agree: true, heights: [1.0, 1.4, .7, 1.1] } }));
  const simulation = { schema: 2, version: M.SIMULATION_VERSION, status: 'ready', spot, generatedAt: time, windFetchedAt: time, boundaryFetchedAt: time,
    maxShoreDistanceM: 500, profileGridM: 50, profileReference: 'estimated-shoreline', shoreline: { landDistance: 0, waterDistance: 100, distance: 50 },
    waveModels: names, hourly: rows };
  return M.buildCoastalForecast(spot, { hourly }, simulation, time * 1000, { historyHours: 0, byModel });
}

test('each model is rated like the forecast when the spot page asks for it', () => {
  const rows = forecast(true);
  assert.equal(rows[0].models.length, 4);
  const byModel = Object.fromEntries(rows[0].models.map(m => [m.model, m]));
  assert.equal(byModel.ecmwf_wam.height, .7);
  assert.equal(byModel.ecmwf_wam.score, rows[0].score, 'the chosen model is the forecast itself');
  assert.ok(byModel.dmi_wam_nsb.height > byModel.ecmwf_wam.height && byModel.dmi_wam_nsb.score > byModel.ecmwf_wam.score,
    'a bigger small wave rates higher');
  assert.equal(forecast(false)[0].models, undefined, 'the ranking and the heat map skip it');
  const window = M.modelWindow(rows);
  assert.equal(window.models, 4);
  assert.equal(window.low, .49);
  assert.equal(window.high, .98);
  // The window rule of bestWindows on each model's hours: 70% of the mean and 30% of the weakest hour.
  const windowScore = name => {
    const scores = rows.map(r => r.models.find(m => m.model === name).score);
    return Math.round((.7 * scores.reduce((a, b) => a + b, 0) / scores.length + .3 * Math.min(...scores)) * 10) / 10;
  };
  assert.equal(window.minScore, windowScore('dwd_ewam'));
  assert.equal(window.maxScore, windowScore('dmi_wam_nsb'));
  assert.equal(M.modelWindow([...rows, { ...rows[0], models: undefined }]), null, 'every hour needs the models');
});

test('the help explains the range by the models', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.match(html, /<strong>Wg modeli fal<\/strong>/);
});
