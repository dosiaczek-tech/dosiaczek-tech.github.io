const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../surf-model.js');

const epoch = Date.UTC(2026, 10, 14, 0) / 1000;
const wind = (speed, direction, gust = speed + 1) => M.windConsensus([{ speed, direction, gust }, { speed, direction, gust }]);
// Twelve hours of a storm wind, then the given clearing wind; the waves at the spot stay at 1 m.
function storm(spot, build, clear, hours = 16) {
  return Array.from({ length: hours }, (_, i) => ({
    time: epoch + i * 3600, height: i < 12 ? 1.2 : 1,
    wind: i < 12 ? wind(...build) : wind(...clear),
    members: [{ model: 'bs-swan-coast500', height: i < 12 ? 1.2 : 1, period: 5, direction: 15 }]
  }));
}

test('Chałupy: a north-westerly storm along the beach builds, a westerly from the land side clears', () => {
  const chalupy = { id: 'chalupy', normal: 35 };
  const rows = storm(chalupy, [11, 315], [5, 270]);
  assert.equal(M.detectCleanup(rows, 11, chalupy).state, 'building', 'NW is 80° from the beach but the waves are there');
  assert.equal(M.detectCleanup(rows, 12, chalupy).state, 'turning');
  const clean = M.detectCleanup(rows, 14, chalupy);
  assert.equal(clean.state, 'clean');
  assert.equal(clean.label, 'Okno wywiewki po nawianiu', 'W is cross-off at Chałupy');
});

test('an along-shore wind without waves at the spot is not a build-up', () => {
  const chalupy = { id: 'chalupy', normal: 35 };
  const rows = storm(chalupy, [11, 315], [5, 270]).map(r => ({ ...r, height: .3 }));
  assert.notEqual(M.detectCleanup(rows, 14, chalupy).state, 'clean');
});

test('a wind dying down to a breeze from any side clears the water after a storm', () => {
  const beach = { id: 'beach', normal: 0 };
  const rows = storm(beach, [9, 0], [2.5, 20]);
  const result = M.detectCleanup(rows, 14, beach);
  assert.equal(result.state, 'clean');
  assert.equal(result.label, 'Ucichanie po nawianiu');
  assert.notEqual(M.detectCleanup(storm(beach, [9, 0], [4, 20]), 14, beach).state, 'clean', 'a fresh onshore breeze still roughens it');
});

test('behind obstacles a strong wind is weak at the spot, so the water clears', () => {
  const open = { id: 'kolobrzeg', normal: 335 };
  const sheltered = { ...open, shelter: Array.from({ length: 72 }, (_, i) => (i >= 50 && i <= 58 ? 75 : 0)) };
  const rows = storm(open, [10, 320], [9, 270]);
  assert.notEqual(M.detectCleanup(rows, 14, open).state, 'clean');
  assert.equal(M.detectCleanup(rows, 14, sheltered).state, 'clean', 'the breakwater takes 75% of the westerly');
});

test('the wind counts half relative to the beach, half to the incoming wave', () => {
  const spot = { id: 'test', normal: 0 };
  const order = { value: .7, known: true };
  const rated = waveDirection => {
    const wave = { height: 1, period: 6, direction: waveDirection, basis: 'SWAN', blocked: false };
    return M.rate(wave, { speed: 6, direction: 220, gust: 7 }, spot, null, wave, order).components.windQuality;
  };
  // 140° from the beach normal; straight against a wave from 40°, 160° on average.
  assert.ok(rated(40) > rated(0));
  assert.ok(rated(300) < rated(0), 'against a wave from 300° the same wind blows more across its faces');
});
