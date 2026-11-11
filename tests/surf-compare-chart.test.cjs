const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chartHours, chartExtent, chartSegments, dayEdges } = require('../surf-compare.js');

test('chart retains all twenty-four hourly scores including night and zero, independently of daily windows', () => {
  const current = Date.parse('2026-10-25T08:00:00Z') / 1000;
  const rows = Array.from({ length: 32 }, (_, i) => ({ time: current + (i - 25) * 3600,
    score: i % 4, simulation: { height: .3 }, daylight: false }));
  const points = chartHours(rows, current * 1000 + 59 * 60000);
  const history = points.filter(p => p.historical);
  assert.equal(history.length, 24);
  assert.deepEqual(history.map(p => p.time), Array.from({ length: 24 }, (_, i) => current - (24 - i) * 3600));
  assert.ok(history.every(p => Number.isFinite(p.score)));
  assert.ok(history.some(p => p.score === 0));
  assert.equal(points.find(p => p.time === current).historical, false);
  assert.equal(points.at(-1).time, rows.at(-1).time);
});

test('chart keeps missing scores as gaps and distinct UTC hours through the autumn clock change', () => {
  const current = Date.parse('2026-10-25T02:00:00Z') / 1000;
  const rows = [
    { time: current, score: 9, simulation: null },
    { time: current - 3600, score: null, simulation: { height: .4 } },
    { time: current - 7200, score: 0, simulation: { height: 0 } },
    { time: current + 7200, score: 4, simulation: { height: 1 } }
  ];
  const original = structuredClone(rows);
  assert.deepEqual(chartHours(rows, current * 1000), [
    { time: current - 7200, score: 0, historical: true },
    { time: current - 3600, score: null, historical: true },
    { time: current, score: null, historical: false },
    { time: current + 7200, score: 4, historical: false }
  ]);
  assert.deepEqual(rows, original);
});

test('chart extent starts and ends at actual ratings across the selected spots, including zero', () => {
  const current = Date.parse('2026-11-06T12:00:00Z') / 1000;
  const hour = (h, score) => ({time:current+h*3600,score});
  const series = [
    {hours:[hour(-12,null),hour(-5,0),hour(-4,2),hour(4,3),hour(5,null)]},
    {hours:[hour(-3,5),hour(7,4),hour(12,null)]},
    {hours:[hour(-20,null),hour(24,NaN)]}
  ];
  const original = structuredClone(series);
  assert.deepEqual(chartExtent(series),{from:current-5*3600,until:current+7*3600});
  assert.deepEqual(chartExtent([series[0]]),{from:current-5*3600,until:current+4*3600});
  assert.deepEqual(series,original);
});

test('chart extent never adds empty future or past hours when only one side has data', () => {
  const current = Date.parse('2026-11-06T12:00:00Z') / 1000;
  for (const offsets of [[-10,-9,-8],[2,3,4],[0]]) {
    const hours = offsets.map(h=>({time:current+h*3600,score:0}));
    assert.deepEqual(chartExtent([{hours}]),{from:hours[0].time,until:hours.at(-1).time});
  }
  assert.equal(chartExtent([]),null);
  assert.equal(chartExtent([{hours:[{time:current,score:null},{time:NaN,score:4}]}]),null);
});

test('chart lines keep continuous hours together and break at missing ratings or missing timestamps', () => {
  const current = Date.parse('2026-11-06T12:00:00Z') / 1000;
  const hour = (h, score) => ({time:current+h*3600,score});
  const hours = [hour(0,0),hour(1,2),hour(2,null),hour(3,4),hour(4,5),hour(6,6),hour(7,NaN),hour(8,0)];
  const original = structuredClone(hours);
  assert.deepEqual(chartSegments(hours),[hours.slice(0,2),hours.slice(3,5),[hours[5]],[hours[7]]]);
  assert.deepEqual(chartSegments([{time:current,score:null}]),[]);
  assert.deepEqual(hours,original);
});

test('chart lines stay continuous through repeated local hours at the autumn clock change', () => {
  const current = Date.parse('2026-10-25T00:00:00Z') / 1000;
  const hours = [0,1,2].map(h=>({time:current+h*3600,score:3+h}));
  assert.deepEqual(chartSegments(hours),[hours]);
  assert.equal(chartExtent([{hours}]).until-chartExtent([{hours}]).from,7200);
});

test('the selected day is framed at its midnights only where the chart has data on both sides', () => {
  const midnight = Date.parse('2026-11-15T00:00:00+01:00') / 1000, day = Array.from({ length: 24 }, (_, i) => midnight + i * 3600);
  assert.deepEqual(dayEdges(day, { from: midnight - 3600, until: midnight + 86400 }), [midnight, midnight + 86400]);
  assert.deepEqual(dayEdges(day.slice(8), { from: midnight + 8 * 3600, until: midnight + 86400 }), [midnight + 86400], 'data starting during the day has no left edge');
  assert.deepEqual(dayEdges(day.slice(0, 18), { from: midnight - 3600, until: midnight + 17 * 3600 }), [midnight], 'data ending during the day has no right edge');
});
