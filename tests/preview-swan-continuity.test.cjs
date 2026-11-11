const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createPreviewSwan } = require('../scripts/preview-swan.cjs');
const M = require('../surf-model.js');
const spot = require('../surf-spots.js').find(s => s.id === 'sobieszewo');
const HOUR = 3600000;
const start = Date.parse('2026-10-24T18:00:00Z');

function forecast(clock, location = spot) {
  const current = Math.floor(clock / HOUR) * 3600;
  const row = time => ({ time, height: .8, period: 5, direction: 0, depth: 2,
    distance: 200, shoreDistance: 150, shoreDistanceMin: 100, shoreDistanceMax: 200,
    powerKWm: 1.2, lat: location.lat + .0018, lon: location.lon });
  return { schema: 2, version: M.SIMULATION_VERSION, status: 'ready', spot: location,
    generatedAt: clock / 1000, windFetchedAt: clock / 1000, boundaryFetchedAt: clock / 1000,
    maxShoreDistanceM: 500, shoreline: { landDistance: 0, waterDistance: 100, distance: 50 },
    history: Array.from({ length: 24 }, (_, i) => row(current - (24 - i) * 3600)),
    hourly: Array.from({ length: 121 }, (_, i) => row(current + i * 3600)) };
}
function scored(bundle, clock) {
  const times = [...bundle.history, ...bundle.hourly].map(row => row.time);
  const hourly = { time: times };
  for (const model of Object.keys(M.WIND_MODELS)) {
    hourly[`wind_speed_10m_${model}`] = times.map(() => 3);
    hourly[`wind_direction_10m_${model}`] = times.map(() => 180);
    hourly[`is_day_${model}`] = times.map(() => 1);
  }
  return M.buildCoastalForecast(spot, { hourly }, bundle, clock);
}

test('Sobieszewo regains its score on unattended startup using its current coordinates', async () => {
  let local = forecast(start - 48 * HOUR, { ...spot, lat: 54.350, lon: 18.831 });
  assert.ok(scored(local, start).every(row => row.score === null));
  let runs = 0;
  const provider = createPreviewSwan({ spots: [spot], now: () => start,
    readStatus: async () => ({ version: M.SIMULATION_VERSION, spots: 1, available: 1, generatedAt: (start - 48 * HOUR) / 1000 }),
    readResult: async () => local,
    run: async () => { runs++; local = forecast(start); return { available: 1 }; } });
  // No get() request is needed to repair stale local data.
  await provider.maintain();
  assert.equal(runs, 1);
  const result = await provider.get(spot.id);
  assert.equal(result.spot.lat, 54.34652508378602);
  assert.equal(result.spot.lon, 18.91065779954801);
  const current = scored(result, start).find(row => row.time === start / 1000);
  assert.ok(Number.isFinite(current.score));
  assert.equal(current.scoreSource, 'swan');
  assert.equal(result.refreshPending, false);
});

test('twenty-four scored historical hours survive days without page requests, including the DST change', async () => {
  let clock = start, local = forecast(clock), runs = 0;
  const provider = createPreviewSwan({ spots: [spot], now: () => clock,
    readStatus: async () => ({ version: M.SIMULATION_VERSION, spots: 1, available: 1, generatedAt: start / 1000 }),
    readResult: async () => local,
    run: async () => { runs++; local = forecast(clock); return { available: 1 }; } });
  await provider.maintain();
  assert.equal(runs, 0, 'startup respects the persisted six-hour cooldown');
  for (let hour = 1; hour <= 72; hour++) {
    clock = start + hour * HOUR;
    await provider.maintain();
    const rows = scored(local, clock);
    const history = rows.filter(row => row.time < clock / 1000);
    assert.deepEqual(history.map(row => row.time),
      Array.from({ length: 24 }, (_, i) => clock / 1000 - (24 - i) * 3600));
    assert.ok(history.every(row => Number.isFinite(row.score) && row.scoreSource === 'swan'));
    assert.ok(rows.some(row => row.time === clock / 1000 && Number.isFinite(row.score)));
    assert.ok(M.simulationAge(local, clock) < 6);
  }
  assert.equal(runs, 12);
  const result = await provider.get(spot.id);
  assert.equal(result.generatedAt, clock / 1000);
  assert.equal(result.refreshPending, false);
});

test('background refresh shares pending work and retries failures only after backoff', async () => {
  let clock = start, runs = 0, release;
  const provider = createPreviewSwan({ spots: [spot], now: () => clock,
    readStatus: async () => null, readResult: async () => null,
    run: async () => {
      runs++;
      if (runs === 1) throw new Error('offline');
      await new Promise(resolve => { release = resolve; });
      return { available: 1 };
    } });
  await provider.maintain();
  clock += 14 * 60000;
  await provider.maintain();
  assert.equal(runs, 1);
  clock += 60000;
  const task = provider.maintain();
  await new Promise(resolve => setImmediate(resolve));
  const other = provider.maintain();
  const pending = await provider.get(spot.id);
  assert.equal(pending.refreshPending, true);
  assert.equal(runs, 2);
  release();
  await Promise.all([task, other]);
  await provider.maintain();
  assert.equal(runs, 2);
});
