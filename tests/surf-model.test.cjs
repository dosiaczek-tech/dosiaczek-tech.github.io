const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const M = require('../surf-model.js');
const spots = require('../surf-spots.js');
const spot = { lat: 54.8, lon: 18.4, normal: 0 };
const wave = { height: 1, period: 6, direction: 0 };
const wind = M.windConsensus([{ speed: 3, direction: 180, gust: 5 }]);
const bath = { samples: [{ distance: 100, depth: 0.6 }, { distance: 250, depth: 2 }, { distance: 500, depth: 4 }, { distance: 1000, depth: 8 }, { distance: 2000, depth: 12 }, { distance: 5000, depth: 20 }] };

test('meteorological wind directions wrap at north and do not cancel into a false calm', () => {
  const north = M.windConsensus([{ speed: 4, direction: 359 }, { speed: 4, direction: 1 }]);
  assert.ok(M.angle(north.direction, 0) < 0.01);
  const opposite = M.windConsensus([{ speed: 7, direction: 0 }, { speed: 7, direction: 180 }]);
  assert.equal(opposite.direction, null);
  assert.equal(opposite.speed, 7);
  assert.equal(M.rate(wave, opposite, spot, bath), null);
});

test('missing fields are not zero waves, zero wind or a usable forecast', () => {
  assert.equal(M.median([null, undefined, NaN]), null);
  assert.equal(M.windConsensus([{ speed: null, direction: 0 }]), null);
  assert.equal(M.rate({ ...wave, height: null }, wind, spot, bath), null);
  assert.equal(M.rate(wave, null, spot, bath), null);
  assert.equal(M.rate({ ...wave, height: 0 }, wind, spot, bath).score, 0);
  assert.equal(M.rate({ ...wave, period: 0 }, wind, spot, bath), null);
});

test('dispersion obeys shallow and deep-water limits', () => {
  const shallow = M.dispersion(15, 0.5), deep = M.dispersion(6, 200);
  assert.ok(Math.abs(shallow.c / Math.sqrt(9.81 * 0.5) - 1) < 0.01);
  assert.ok(Math.abs(deep.c / (9.81 * 6 / (2 * Math.PI)) - 1) < 0.001);
  assert.ok(Math.abs(deep.cg / deep.c - 0.5) < 0.001);
});

test('bathymetry limits breaking height and preserves energy over constant depth', () => {
  const local = M.transform(wave, spot, bath);
  assert.equal(local.breaking, true);
  assert.ok(Math.abs(local.height - 0.78 * local.depth) < 1e-9);
  assert.ok(local.distance >= 100 && local.distance <= 5000);
  const flat = { samples: bath.samples.map(p => ({ ...p, depth: 20 })) };
  assert.ok(Math.abs(M.transform(wave, spot, flat).height - 1) < 1e-9);
  assert.equal(M.transform(wave, spot, { samples: bath.samples.map((p, i) => ({ ...p, depth: i ? p.depth : null })) }), null);
});

test('offshore is from land, onshore is from sea; rear waves cannot earn a good score', () => {
  const onshore = M.windConsensus([{ speed: 7, direction: 0 }]);
  assert.equal(M.rate(wave, wind, spot, bath).windType, 'offshore');
  assert.equal(M.rate(wave, onshore, spot, bath).windType, 'onshore');
  assert.ok(M.rate(wave, wind, spot, bath).score > M.rate(wave, onshore, spot, bath).score);
  assert.equal(M.rate({ ...wave, direction: 180 }, wind, spot, bath).score, 0);
  assert.ok(M.rate({ ...wave, height: 4 }, wind, spot, bath).score <= 25);
});

test('spot geometry projects offshore, not inland', () => {
  assert.ok(M.offshore(spot).lat > spot.lat);
  assert.ok(Math.abs(M.offshore(spot).lon - spot.lon) < 0.00001);
  assert.ok(M.offshore({ ...spot, normal: 90 }).lon > spot.lon);
});

test('time alignment uses UTC timestamps, never array index; missing wind leaves score empty', () => {
  const time = Date.UTC(2026, 9, 24, 22) / 1000; // Weekend of Polish DST transition.
  const marine = { hourly: { time: [time, time + 3600], wave_height_dwd_ewam: [1, 1], wave_period_dwd_ewam: [6, 6], wave_direction_dwd_ewam: [0, 0] } };
  const weather = { hourly: { time: [time + 3600], wind_speed_10m_icon_seamless: [3], wind_direction_10m_icon_seamless: [180], is_day_icon_seamless: [1] } };
  const rows = M.buildForecast(spot, marine, weather, null, time * 1000);
  assert.equal(rows[0].score, null);
  assert.equal(rows[0].height, 1);
  assert.ok(rows[1].score > 0);
  assert.equal(rows[1].agreement, 'Ograniczona liczba modeli');
});

test('best windows require three adjacent daylight hours and do not overlap', () => {
  const rows = Array.from({ length: 12 }, (_, i) => ({ time: i * 3600, score: 80 - i, daylight: i > 1, height: 1 }));
  const windows = M.bestWindows(rows);
  assert.equal(windows.length, 3);
  assert.equal(windows[0].start, 7200);
  assert.ok(windows.every((w, i) => windows.slice(i + 1).every(n => w.end <= n.start || n.end <= w.start)));
  assert.deepEqual(M.bestWindows([{ time: 0, score: 90, daylight: true }, { time: 3600, score: null, daylight: true }, { time: 7200, score: 90, daylight: true }]), []);
});

test('all surf camera IDs exist; gulf, port and city cameras are not mapped by town', () => {
  const html = fs.readFileSync(require.resolve('../index.html'), 'utf8');
  const context = { document: { addEventListener() {} } };
  vm.createContext(context);
  vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1] + ';globalThis.ids = CAMERAS.map(c=>c.id)', context);
  const ids = spots.flatMap(s => s.cameras);
  assert.equal(new Set(ids).size, ids.length);
  assert.equal(new Set(spots.map(s => s.id)).size, spots.length);
  for (const id of ids) assert.ok(context.ids.includes(id), id);
  for (const id of ['puck-zatoka-pucka', 'chalupy-solar', 'rewa', 'hel', 'kuznica', 'jastarnia', 'jurata', 'darlowo-port', 'gdansk-motlawa']) assert.ok(!ids.includes(id), id);
  for (const s of spots) assert.ok(s.lat > 53 && s.lat < 55 && s.lon > 14 && s.lon < 20 && s.normal >= 0 && s.normal < 360);
});
