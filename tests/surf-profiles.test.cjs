const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const M = require('../surf-model.js');
const H = require('../surf-heatmap.js');

const spot = { id: 'test', lat: 54.35, lon: 18.9, normal: 0 };
const order = { value: .7, known: true };
const light = { speed: 3, direction: 180, gust: 5 };
const at = (height, period = 6) => ({ height, period, direction: 0, basis: 'SWAN', blocked: false });
const rate = (wave, wind, profile) => M.rate(wave, wind, spot, null, wave, order, M.PROFILES[profile]);

test('the intermediate profile is the original rating', () => {
  for (const height of [.3, .9, 1.4, 2.5]) {
    const wave = at(height);
    assert.deepEqual(M.rate(wave, light, spot, null, wave, order), rate(wave, light, 'intermediate'));
  }
  assert.equal(M.profileOf('missing'), M.PROFILES.intermediate);
});

test('a beginner prefers small waves and stays out of big ones', () => {
  assert.ok(rate(at(.6), light, 'beginner').score > rate(at(.6), light, 'intermediate').score);
  assert.ok(rate(at(1.4), light, 'beginner').score < rate(at(1.4), light, 'intermediate').score);
  assert.ok(rate(at(1.7), light, 'beginner').score <= 2, 'from 1.6 m the waves are too big for a beginner');
  const offshore = { speed: 6, direction: 180, gust: 8 };
  assert.ok(rate(at(.7), offshore, 'beginner').flags.includes('Uwaga: wiatr od lądu odpycha od brzegu'));
  assert.ok(rate(at(.7), offshore, 'beginner').components.windQuality < rate(at(.7), offshore, 'intermediate').components.windQuality);
  assert.ok(!rate(at(.7), offshore, 'intermediate').flags.includes('Uwaga: wiatr od lądu odpycha od brzegu'));
});

test('an advanced surfer wants bigger waves and copes with more wind', () => {
  assert.ok(rate(at(2.2), light, 'advanced').score > rate(at(2.2), light, 'intermediate').score);
  assert.ok(rate(at(.6), light, 'advanced').score < rate(at(.6), light, 'intermediate').score);
  const fresh = { speed: 13, direction: 180, gust: 16 };
  assert.ok(rate(at(1.5), fresh, 'intermediate').score <= 2);
  assert.ok(rate(at(1.5), fresh, 'advanced').score > 2);
});

test('a longboard values a long period and a smooth surface more', () => {
  const gain = profile => rate(at(.8, 8), light, profile).score - rate(at(.8, 4), light, profile).score;
  assert.ok(gain('longboard') > gain('intermediate'));
  const cross = { speed: 7, direction: 90, gust: 9 };
  assert.ok(rate(at(.8), cross, 'longboard').components.windQuality < rate(at(.8), cross, 'intermediate').components.windQuality);
});

test('the notes name the chosen profile; the intermediate keeps its wording', () => {
  assert.ok(rate(at(.7), light, 'beginner').flags.includes('Na plus: wysokość dopasowana do profilu „Początkujący”'));
  assert.ok(rate(at(3.2), light, 'advanced').flags.includes('Na minus: duża fala dla profilu „Zaawansowany”'));
  assert.ok(rate(at(.25), light, 'longboard').flags.includes('Na minus: mała fala'));
  assert.ok(rate(at(1.2), light, 'intermediate').flags.includes('Na plus: wysokość dopasowana do rekreacyjnej sesji'));
});

test('the forecast is rated for the chosen profile', () => {
  const time = Date.UTC(2026, 10, 14, 10) / 1000;
  const hourly = { time: [time] };
  for (const model of Object.keys(M.WIND_MODELS)) {
    hourly[`wind_speed_10m_${model}`] = [3];
    hourly[`wind_direction_10m_${model}`] = [180];
  }
  const result = { time, height: 1.9, period: 6, energyPeriod: 6.5, direction: 0, depth: 2, distance: 200, powerKWm: 4,
    shoreDistance: 150, shoreDistanceMin: 100, shoreDistanceMax: 200, lat: 54.3518, lon: 18.9 };
  const simulation = { schema: 2, version: M.SIMULATION_VERSION, status: 'ready', spot, generatedAt: time, windFetchedAt: time, boundaryFetchedAt: time,
    maxShoreDistanceM: 500, profileGridM: 50, profileReference: 'estimated-shoreline', shoreline: { landDistance: 0, waterDistance: 100, distance: 50 }, hourly: [result] };
  const score = profile => M.buildCoastalForecast(spot, { hourly }, simulation, time * 1000, { historyHours: 0, profile })[0].score;
  assert.ok(score('advanced') > score('intermediate'));
  assert.ok(score('intermediate') > score('beginner'));
  assert.equal(score(undefined), score('intermediate'));
});

test('histories and remembered heat map ratings are kept apart by profile', () => {
  assert.equal(M.coastalHistoryKey(spot), M.coastalHistoryKey(spot, 'intermediate'), 'the original history keeps its key');
  assert.notEqual(M.coastalHistoryKey(spot, 'beginner'), M.coastalHistoryKey(spot));
  assert.notEqual(M.coastalHistoryKey(spot, 'beginner'), M.coastalHistoryKey(spot, 'longboard'));
  const storage = new Map();
  global.sessionStorage = { setItem: (k, v) => storage.set(k, v), getItem: k => storage.get(k) ?? null };
  const now = Date.now(), records = new Map([['test', { scores: new Map([[Math.floor(now / 3600000) * 3600, 6.5]]), disputed: new Set(), issue: '' }]]);
  H.remember(records, now, M, 'beginner');
  assert.ok(H.recall(M, now, 'beginner'));
  assert.equal(H.recall(M, now, 'advanced'), null);
  assert.equal(H.recall(M, now), null);
  delete global.sessionStorage;
});

test('both views offer the profile and the page loads its script after the model', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.equal((html.match(/<select data-surfer-profile><\/select>/g) || []).length, 2);
  const order = ['surf-model.js', 'surf-surfer.js', 'surf-app.js', 'surf-compare.js', 'surf-heatmap.js'].map(name => html.indexOf(`src="${name}`));
  assert.ok(order.every((position, i) => position > 0 && (i === 0 || position > order[i - 1])));
});
