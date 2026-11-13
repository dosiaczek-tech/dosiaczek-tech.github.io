const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../surf-model.js');

const spot = { id: 'test', normal: 0 };
const order = { value: .7, known: true };
const wind = { speed: 3, direction: 180, gust: 5 };
const rate = (local, period = 4.5) => {
  const wave = { height: 1, period, direction: 0 };
  return M.rate(wave, wind, spot, null, { ...wave, basis: 'SWAN', blocked: false, ...local }, order);
};

test('the period counts by the peak period at the spot when SWAN gives it', () => {
  const swellish = rate({ peakPeriod: 8 }), windsea = rate({ peakPeriod: 4.8 });
  assert.equal(swellish.components.peakPeriod, 8);
  assert.equal(swellish.components.periodQuality, .9);
  assert.ok(Math.abs(windsea.components.periodQuality - .26) < 1e-9);
  assert.ok(swellish.score > windsea.score);
  assert.ok(swellish.flags.includes('Na plus: dłuższy okres fal'));
  assert.ok(windsea.flags.includes('Krótka, wiatrowa fala'));
  assert.ok(rate({ peakPeriod: 3.8 }).score <= 3, 'a very short chop stays at most 3');
});

test('a result without the peak period keeps the mean-period rating', () => {
  const old = rate({}, 5);
  assert.equal(old.components.peakPeriod, null);
  assert.equal(old.components.periodQuality, .6);
  assert.ok(!old.flags.includes('Krótka, wiatrowa fala'));
});

test('a swell holding most of the energy offshore is a plus', () => {
  assert.ok(rate({ peakPeriod: 7, boundary: { model: 'dwd_ewam', models: 4, agree: true, swell: .6 } }).flags.includes('Na plus: przeważa martwa fala'));
  assert.ok(!rate({ peakPeriod: 7, boundary: { model: 'dwd_ewam', models: 4, agree: true, swell: .3 } }).flags.includes('Na plus: przeważa martwa fala'));
  assert.ok(!rate({ peakPeriod: 7, boundary: { model: 'ecmwf_wam', models: 4, agree: true } }).flags.includes('Na plus: przeważa martwa fala'));
});
