const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const M = require('../surf-model.js');

// Kołobrzeg-like beach facing NNW; obstacles shield it from the west.
const profile = Array.from({ length: 72 }, (_, i) => (i === 54 ? 60 : i === 55 ? 40 : 0));
const open = { id: 'test', lat: 54.19, lon: 15.55, normal: 335 };
const sheltered = { ...open, shelter: profile };
const wave = { height: 1.1, period: 5, direction: 320 };
const swan = { ...wave, basis: 'SWAN', blocked: false };
const order = { value: .7, known: true };

test('the shelter of a wind direction is read between the five-degree steps and stays within limits', () => {
  assert.equal(M.windShelter(sheltered, 270), .6);
  assert.equal(M.windShelter(sheltered, 272.5), .5);
  assert.equal(M.windShelter(sheltered, 630), .6, 'directions wrap around');
  assert.equal(M.windShelter(sheltered, 90), 0);
  assert.equal(M.windShelter({ ...open, shelter: profile.map(() => 95) }, 10), .8, 'never a spot without any wind');
  assert.equal(M.windShelter(open, 270), 0);
  assert.equal(M.windShelter({ ...open, shelter: [60] }, 270), 0);
  assert.equal(M.windShelter(sheltered, null), 0);
});

test('a sheltered spot rates the weakened wind and says why; other winds are unchanged', () => {
  const west = { speed: 8, direction: 270, gust: 12 };
  const exposed = M.rate(wave, west, open, null, swan, order), shielded = M.rate(wave, west, sheltered, null, swan, order);
  assert.ok(shielded.components.windQuality > exposed.components.windQuality);
  assert.ok(shielded.score > exposed.score);
  assert.equal(shielded.components.shelter, .6);
  assert.ok(shielded.flags.includes('Na plus: przeszkody osłaniają spot od tego wiatru'));
  assert.ok(!exposed.flags.includes('Na plus: przeszkody osłaniają spot od tego wiatru'));
  const north = { speed: 8, direction: 0, gust: 12 };
  assert.deepEqual(M.rate(wave, north, sheltered, null, swan, order), M.rate(wave, north, open, null, swan, order));
  assert.equal(M.rate(wave, { speed: 2, direction: 270 }, sheltered, null, swan, order).flags.includes('Na plus: przeszkody osłaniają spot od tego wiatru'), false,
    'a light wind needs no shelter');
});

test('a gale blocked by obstacles no longer caps the score', () => {
  const gale = { speed: 13, direction: 270, gust: 18 };
  assert.equal(M.rate(wave, gale, open, null, swan, order).score <= 2, true);
  assert.ok(M.rate(wave, gale, sheltered, null, swan, order).score > 2);
});

test('the catalogue takes a shelter profile only for the position it was measured at', () => {
  const source = name => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
  const context = {};
  vm.runInNewContext(source('surf-community.js'), context);
  context.SurfShelter = { kolobrzeg: { lat: 54.188, lon: 15.554, normal: 335, shelter: profile }, ustka: { lat: 1, lon: 2, normal: 3, shelter: profile } };
  vm.runInNewContext(source('surf-spots.js'), context);
  const byId = id => context.SurfSpots.find(s => s.id === id);
  assert.deepEqual(byId('kolobrzeg').shelter, profile);
  assert.equal(byId('ustka').shelter, undefined, 'a moved spot keeps no stale shelter');
});

test('the published shelter data covers the spots with a forecast and is in the expected shape', () => {
  const spots = require('../surf-spots.js'), data = require('../surf-shelter.js');
  const measured = spots.filter(s => s.shelter);
  assert.ok(measured.length >= 80, `${measured.length} spots with a shelter profile`);
  for (const s of measured) {
    assert.equal(s.shelter.length, 72);
    assert.ok(s.shelter.every(v => Number.isInteger(v) && v >= 0 && v <= 80));
  }
  assert.ok(Object.values(data).every(entry => Array.isArray(entry.point) && entry.point.length === 2));
});
