const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const model = require('../surf-model.js');

function harness() {
  let now = Date.UTC(2026, 9, 20, 12), mode = 'ok', calls = 0;
  const storage = new Map();
  const context = {
    SurfModel: model, URLSearchParams, AbortController, setTimeout, clearTimeout,
    Date: class extends Date { static now() { return now; } },
    localStorage: { getItem: k => storage.get(k) || null, setItem: (k, v) => storage.set(k, v) },
    fetch: async url => {
      if (url.startsWith('data/')) return {ok:false,status:404};
      calls++;
      if (mode === 'offline' || (mode === 'weather-down' && url.includes('api.open-meteo.com/v1/forecast'))) throw new Error('offline');
      if (mode === 'rate-limit') return { ok: false, status: 429 };
      if (url.includes('GetFeatureInfo')) return { ok: true, json: async () => ({ features: [{ properties: { Depth: mode === 'land' ? 2 : -10 } }] }) };
      return { ok: true, json: async () => ({ hourly: { time: [now / 1000] } }) };
    }
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../surf-api.js'), 'utf8'), context);
  return { api: context.SurfAPI, advance: seconds => { now += seconds * 1000; }, mode: v => { mode = v; }, calls: () => calls };
}
const spot = { id: 'test', lat: 54.8, lon: 18.4, normal: 0 };

test('forecast requests are deduplicated and cached, including return to the same spot', async () => {
  const h = harness();
  const [a, b] = await Promise.all([h.api.forecasts(spot), h.api.forecasts(spot)]);
  assert.equal(h.calls(), 2);
  assert.equal(a.marine.fetchedAt, b.marine.fetchedAt);
  await h.api.forecasts(spot);
  assert.equal(h.calls(), 2);
  await h.api.forecasts({ ...spot, lat: 54.85 });
  assert.equal(h.calls(), 4, 'changed geometry cannot reuse an old location');
});

test('outage fallback preserves original timestamp and flags stale data; expires after six hours', async () => {
  const h = harness();
  const initial = await h.api.forecasts(spot);
  h.advance(1900); h.mode('offline');
  const fallback = await h.api.forecasts(spot);
  assert.equal(fallback.marine.stale, true);
  assert.equal(fallback.marine.fetchedAt, initial.marine.fetchedAt);
  assert.equal(fallback.weather.stale, true);
  h.advance(21600);
  const expired = await h.api.forecasts(spot);
  assert.equal(expired.marine, null);
  assert.equal(expired.weather, null);
  assert.equal(expired.errors.length, 2);
});

test('weather failure retains wave data without synthesizing wind', async () => {
  const h = harness(); h.mode('weather-down');
  const result = await h.api.forecasts(spot);
  assert.ok(result.marine);
  assert.equal(result.weather, null);
  assert.equal(result.errors.length, 1);
});

test('rate limit produces a useful error and never invented values', async () => {
  const h = harness(); h.mode('rate-limit');
  const result = await h.api.forecasts(spot);
  assert.equal(result.marine, null);
  assert.match(result.errors[0], /Limit zapytań/);
});

test('land elevation is not converted into water depth; missing profile can be retried', async () => {
  const h = harness(); h.mode('land');
  const land = await h.api.bathymetry(spot);
  assert.equal(land.complete, false);
  assert.ok(land.samples.every(p => p.depth === null));
  h.advance(601); h.mode('ok');
  const water = await h.api.bathymetry(spot);
  assert.equal(water.complete, true);
  assert.ok(water.samples.every(p => p.depth === 10));
});
