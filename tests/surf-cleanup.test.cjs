const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../surf-model.js');
const spots = require('../surf-spots.js');
const community = require('../surf-community.js');
const sobieszewo = spots.find(s => s.id === 'sobieszewo');
const epoch = Date.UTC(2026, 9, 20, 0) / 1000;
const wind = (speed, direction, gust = speed + 1) => M.windConsensus([{ speed, direction, gust }, { speed, direction, gust }]);
function sequence({ buildStart = 12, buildEnd = 20, turn = 20, finalHeight = 1, period = 5, direction = 0, offshore = 3 } = {}) {
  return Array.from({ length: 32 }, (_, i) => ({
    time: epoch + i * 3600,
    wind: i >= buildStart && i < buildEnd ? wind(8, 0) : i >= turn ? wind(offshore, 180) : wind(3, 90),
    members: Object.keys(M.WAVE_MODELS).map(model => ({ model, height: i >= turn ? finalHeight : 1.5, period, direction })),
    score: 65, height: 1, daylight: true
  }));
}

test('Sobieszewo: north is onshore and south offshore; confirmed remaining waves yield cleanup after two hours', () => {
  assert.equal(M.windRelative(wind(4, 0), sobieszewo), 'onshore');
  assert.equal(M.windRelative(wind(4, 180), sobieszewo), 'offshore');
  const rows = sequence();
  assert.equal(M.detectCleanup(rows, 19, sobieszewo).state, 'building');
  assert.equal(M.detectCleanup(rows, 20, sobieszewo).state, 'turning');
  const clean = M.detectCleanup(rows, 21, sobieszewo);
  assert.equal(clean.state, 'clean');
  assert.equal(clean.buildingHours, 8);
  assert.equal(clean.clearingHours, 2);
  assert.equal(clean.waveSupport, 2);
});

test('southerly wind alone is not evidence of the previous storm or a surfing window', () => {
  const rows = sequence({ buildStart: 0, buildEnd: 0, turn: 0 });
  assert.equal(M.detectCleanup(rows, 24, sobieszewo).state, 'none');
  assert.equal(M.detectCleanup(rows, 1, sobieszewo).state, 'unknown');
  assert.equal(M.detectCleanup(sequence({ buildStart: 18 }), 24, sobieszewo).state, 'none');
});

test('faded, short-period and wrong-direction waves cannot become a cleanup session', () => {
  for (const settings of [{ finalHeight: 0.1 }, { period: 3 }, { direction: 180 }]) {
    const result = M.detectCleanup(sequence(settings), 24, sobieszewo);
    assert.notEqual(result.state, 'clean');
    assert.equal(result.waveSupport, 0);
  }
  assert.equal(M.detectCleanup(sequence({ offshore: 12 }), 24, sobieszewo).state, 'strong-offshore');
  assert.equal(M.detectCleanup(sequence({ finalHeight: 3.2 }), 24, sobieszewo).state, 'rough');
});

test('missing hour or wind after the generating phase is not a calm', () => {
  const missingWind = sequence(); missingWind[20].wind = null;
  assert.equal(M.detectCleanup(missingWind, 24, sobieszewo).state, 'unknown');
  const missingHour = sequence().filter((r, i) => i !== 20);
  assert.equal(M.detectCleanup(missingHour, 23, sobieszewo).state, 'unknown');
});

test('a single optimistic wave model cannot declare a confirmed cleanup', () => {
  const rows = sequence(); rows[24].members[1].height = 0.1;
  const disagreement = M.detectCleanup(rows, 24, sobieszewo);
  assert.equal(disagreement.state, 'uncertain');
  assert.equal(disagreement.waveSupport, 1);
  rows[24].members[1].height = null;
  assert.equal(M.detectCleanup(rows, 24, sobieszewo).state, 'uncertain');
});

test('same north/south sequence on an east-facing beach is not onshore followed by offshore', () => {
  assert.notEqual(M.detectCleanup(sequence(), 24, { ...sobieszewo, normal: 90 }).state, 'clean');
  assert.equal(M.windRelative(wind(4, 180), { ...sobieszewo, normal: 90 }), 'cross');
});

test('detector never reads later times and ignores build-up older than 24 hours', () => {
  const rows = sequence(), before = M.detectCleanup(rows, 24, sobieszewo);
  rows[25].wind = null; rows[26].members = [];
  assert.deepEqual(M.detectCleanup(rows, 24, sobieszewo), before);
  assert.equal(M.detectCleanup(sequence({ buildStart: 0, buildEnd: 4, turn: 4 }), 31, sobieszewo).state, 'none');
});

test('window filter requires three consecutive daylight cleanup hours without adding a score bonus', () => {
  const rows = sequence().map((r, i, all) => ({ ...r, cleanup: M.detectCleanup(all, i, sobieszewo) }));
  const windows = M.bestWindows(rows, 3, { cleanupOnly: true });
  assert.ok(windows.length > 0);
  assert.ok(windows.every(w => w.cleanupHours === 3 && w.start >= rows[21].time && w.score === 65));
  assert.deepEqual(M.bestWindows(rows.map(r => ({ ...r, daylight: false })), 3, { cleanupOnly: true }), []);
});

test('buildForecast retains history for the first forecast hour but does not display past hours', () => {
  const all = sequence();
  const marine = { hourly: { time: all.map(r => r.time) } }, weather = { hourly: { time: all.map(r => r.time) } };
  for (const model of Object.keys(M.WAVE_MODELS)) {
    for (const [field, variable] of [['height', 'wave_height'], ['period', 'wave_period'], ['direction', 'wave_direction']]) marine.hourly[`${variable}_${model}`] = all.map(r => r.members[0][field]);
  }
  for (const model of Object.keys(M.WIND_MODELS)) {
    weather.hourly[`wind_speed_10m_${model}`] = all.map(r => r.wind.speed);
    weather.hourly[`wind_direction_10m_${model}`] = all.map(r => r.wind.direction);
  }
  const result = M.buildForecast(sobieszewo, marine, weather, null, all[24].time * 1000);
  assert.equal(result[0].time, all[24].time);
  assert.equal(result[0].cleanup.state, 'clean');
});

test('community import keeps all 30 surf points, merges 3 duplicates, excludes school and polygons', () => {
  assert.equal(community.length, 30);
  assert.equal(spots.length, 71);
  assert.equal(spots.filter(s => s.community).length, 30);
  for (const record of community) {
    const s = spots.find(s => s.id === (record.mergeInto || record.id));
    assert.ok(s);
    assert.equal(s.lat, record.lat); assert.equal(s.lon, record.lon);
    assert.ok(s.community.source.url.includes('124V-0M-nOqrd7XHs2fK-J9E86LTFxQ-C'));
    if (!record.mergeInto) assert.equal(s.cameras.length, 0, 'nearby camera is not an exact-peak camera');
  }
  assert.ok(!spots.some(s => /SurfAcademy|Kąpielisko|Teren Zamknięty/.test(s.name)));
  assert.equal(sobieszewo.cameras.length, 0);
});
