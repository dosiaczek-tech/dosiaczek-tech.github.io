const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../surf-compare.js');
const M = require('../surf-model.js');

test('Wednesday night shown on the chart receives a historical average even with only two hours and zero scores', () => {
  const now = Date.parse('2026-10-29T09:37:00Z');
  const rows = [0, 1].map(i => ({ time: Date.parse('2026-10-28T21:00:00Z') / 1000 + i * 3600,
    score: 0, daylight: false, simulation: { height: .04 } }));
  const days = C.daily(rows, M, now), summary = days.get('2026-10-28');
  assert.equal(summary.score, 0);
  assert.equal(summary.kind, 'history-average');
  assert.equal(summary.hours, 2);
  assert.equal(summary.historical, true);
  assert.deepEqual(C.bestSpots([{ id: 'sobieszewo', days }], '2026-10-28'), ['sobieszewo']);
  assert.equal(C.chartHours(rows, now).filter(r => r.historical).length, summary.hours);
});

test('historical average uses only available scored hours, including a single sample, and never invents missing scores', () => {
  const now = Date.parse('2026-10-29T08:00:00Z'), current = now / 1000;
  const row = (h, score) => ({ time: current + h * 3600, score, daylight: false, simulation: {} });
  const rows = [row(-13, 10), row(-12, 0), row(-10, 4), row(-9, null), { ...row(-8, 9), simulation: null }];
  const summary = C.daily(rows, M, now).get('2026-10-28');
  assert.equal(summary.score, 2);
  assert.equal(summary.hours, 2);
  assert.equal(summary.start, current - 12 * 3600);
  assert.equal(summary.end, current - 9 * 3600);
  assert.equal(C.daily([row(-12, 3)], M, now).get('2026-10-28').score, 3);
  assert.equal(C.daily([row(-12, null)], M, now).get('2026-10-28'), null);
  assert.equal(C.daily([row(1, 3)], M, now).get('2026-10-29'), null);
});

test('automatic selection uses only the selected date and randomizes only equal scores', () => {
  const now = Date.parse('2026-10-21T08:00:00Z');
  const entry = (id, score, day = 1) => ({id, rows: [0, 1, 2].map(h => ({
    time: now / 1000 + day * 86400 + h * 3600, score, daylight: true, height: 1, simulation: {}
  }))});
  const entries = [entry('best', 9), entry('second', 8), ...Array.from({length: 8}, (_, i) => entry(`tie${i}`, 7)),
    entry('poor', 2), entry('today', 10, 0), entry('outside', 10, 6), {id: 'missing', rows: []}];
  const data = entries.map(({id,rows})=>({id,days:C.daily(rows,M,now)}));
  const a = C.bestSpots(data, '2026-10-22', () => .5);
  const b = C.bestSpots(data, '2026-10-22', () => .99);
  assert.equal(a.length, 5);
  assert.deepEqual(a.slice(0, 2), ['best', 'second']);
  assert.ok(a.slice(2).every(id => id.startsWith('tie')));
  assert.notDeepEqual(a, b);
  assert.deepEqual(C.bestSpots(data, '2026-10-21'), ['today']);
  assert.deepEqual(C.bestSpots(data, '2026-10-23'), []);
  assert.deepEqual(C.bestSpots([{id:'missing',days:new Map()}], '2026-10-22'), []);
  assert.deepEqual(C.bestSpots([{id:'only',days:C.daily(entry('only',0).rows,M,now)}], '2026-10-22'), ['only']);
});

test('each day selects its own five spots from the entire catalog rather than sorting the previous five', () => {
  const now = Date.parse('2026-10-21T04:00:00Z');
  const entries = Array.from({length:12},(_,i)=>{
    const rows = [0,1].flatMap(day=>[0,1,2].map(h=>({
      time:Date.parse('2026-10-21T08:00:00Z')/1000+day*86400+h*3600,
      score:(day===0?12-i:i+1)/2,daylight:true,height:1,simulation:{}
    })));
    return {id:`spot-${i}`,days:C.daily(rows,M,now)};
  });
  const before = structuredClone(entries);
  assert.deepEqual(C.bestSpots(entries,'2026-10-21'),['spot-0','spot-1','spot-2','spot-3','spot-4']);
  assert.deepEqual(C.bestSpots(entries,'2026-10-22'),['spot-11','spot-10','spot-9','spot-8','spot-7']);
  assert.deepEqual(entries,before);
});

test('today ranks future sessions ahead of better historical ones and retains explicitly marked history', () => {
  const now = Date.parse('2026-10-21T12:00:00Z');
  const entry = (id,score,start)=>({id,days:C.daily([0,1,2].map(h=>({
    time:now/1000+(start+h)*3600,score,daylight:true,height:1,simulation:{}
  })),M,now)});
  const entries = [entry('past-best',9,-4),entry('upcoming',2,1),entry('past-second',8,-4),entry('too-old',10,-16)];
  assert.deepEqual(C.bestSpots(entries,'2026-10-21'),['upcoming','past-best','past-second']);
  assert.equal(entries[0].days.get('2026-10-21').historical,true);
});

test('partial or missing daily sessions never fill the five-place ranking with unrelated spots', () => {
  const now = Date.parse('2026-10-21T04:00:00Z');
  const row = h=>({time:now/1000+(4+h)*3600,score:7,daylight:true,height:1,simulation:{}});
  const entries = [
    {id:'complete',rows:[0,1,2].map(row)},
    {id:'incomplete',rows:[0,1].map(row)},
    {id:'night',rows:[0,1,2].map(h=>({...row(h),daylight:false}))},
    {id:'no-waves',rows:[0,1,2].map(h=>({...row(h),simulation:null}))},
    {id:'no-score',rows:[0,1,2].map(h=>({...row(h),score:null}))},
    {id:'other-day',rows:[0,1,2].map(h=>({...row(h),time:row(h).time+86400}))}
  ].map(({id,rows})=>({id,days:C.daily(rows,M,now)}));
  assert.deepEqual(C.bestSpots(entries,'2026-10-21'),['complete']);
  assert.deepEqual(C.bestSpots(entries,'2026-10-22'),['other-day']);
  assert.deepEqual(C.bestSpots(entries,'2026-10-23'),[]);
});

test('empty comparison starts with five unfilled slots and never adds random spots', () => {
  const catalog = Array.from({length: 10}, (_, i) => ({id: `spot-${i}`}));
  for(const value of [undefined,null,[],{broken:true}]) assert.deepEqual(C.choose(catalog,value),['','','','','']);
  assert.deepEqual(C.choose(catalog,['','','spot-2']),['','','spot-2','','']);
});

test('comparison choices retain their slots and reject duplicates or removed spots without replacing them', () => {
  const catalog=Array.from({length:6},(_,i)=>({id:`spot-${i}`}));
  const selection=['spot-1','', 'spot-1','removed','spot-4','spot-5'],before=[...selection];
  assert.deepEqual(C.choose(catalog,selection),['spot-1','','','','spot-4','spot-5']);
  assert.deepEqual(selection,before);
});

test('comparison retains up to fifteen selected spots and ignores slots beyond that limit', () => {
  const catalog = Array.from({length:20},(_,i)=>({id:`spot-${i}`}));
  const selection = catalog.map(spot=>spot.id), before = [...selection];
  assert.deepEqual(C.choose(catalog,selection.slice(0,15)),selection.slice(0,15));
  assert.deepEqual(C.choose(catalog,selection),selection.slice(0,15));
  assert.deepEqual(selection,before);
});

test('extra comparison slots stay empty until selected and retain their positions when cleared or invalid', () => {
  const catalog = Array.from({length:15},(_,i)=>({id:`spot-${i}`}));
  const firstFive = catalog.slice(0,5).map(spot=>spot.id);
  for(let size=6;size<=15;size++) {
    const selection = [...firstFive,...Array(size-5).fill('')];
    assert.deepEqual(C.choose(catalog,selection),selection);
  }
  const selection = [...firstFive,'spot-1','removed','','spot-14',...Array(6).fill('')];
  assert.deepEqual(C.choose(catalog,selection),[...firstFive,'','','','spot-14',...Array(6).fill('')]);
  assert.deepEqual(C.choose(catalog,Array(15).fill('')),Array(15).fill(''));
});

test('daily result selects the best future daylight session and leaves missing days unrated', () => {
  const start = Date.parse('2026-10-21T06:00:00Z') / 1000;
  const rows = [3, 3, 3, 8, 8, 8].map((score, i) => ({time: start + i * 3600, score, daylight: true, height: .8, simulation: {height: .8}}));
  const day = C.dayKey(start);
  assert.equal(C.daily(rows, M, start * 1000).get(day).score, 8);
  assert.equal(C.daily(rows, M, (start + 4 * 3600) * 1000).get(day).historical, true);
  assert.equal(C.daily(rows, M, (start + 4 * 3600) * 1000).get(day).score, 8);
  assert.equal(C.daily(rows.map(r => ({...r, daylight: false})), M, start * 1000).get(day), null);
  assert.equal(C.daily(rows.map(r => ({...r, score: null})), M, start * 1000).get(day), null);
  assert.equal(C.daily(rows.map(r => ({...r, simulation: null})), M, start * 1000).size, 0);
});

test('history expires after twelve hours and never reuses cached future forecasts', () => {
  const now = Date.parse('2026-10-21T18:00:00Z');
  const row = hours => ({time: now / 1000 + hours * 3600, score: 8, height: 1, simulation: {}, daylight: true});
  const saved = [-13, -12, -10, -9, -8, 1].map(row);
  const retained = C.retainHistory([], saved, now);
  assert.deepEqual(retained.map(r => (r.time * 1000 - now) / 3600000), [-12, -10, -9, -8]);
  assert.ok(retained.every(r => r.archived));
  const corrected = C.retainHistory([{...row(-10), score: 4}], saved, now);
  assert.equal(corrected.find(r => r.time === row(-10).time).score, 4);
  const history = C.daily(retained, M, now).get(C.dayKey(now / 1000));
  assert.equal(history.historical, true);
  assert.equal(history.archived, true);
});

test('the oldest of twelve hourly samples stays available throughout the current hour',()=>{
  const now=Date.parse('2026-10-24T20:37:00Z'),current=Math.floor(now/3600000)*3600;
  const rows=[-13,-12,-11,-10,1].map(h=>({time:current+h*3600,score:8,height:1,simulation:{},daylight:true}));
  const retained=C.retainHistory([],rows,now);
  assert.deepEqual(retained.map(r=>r.time),[-12,-11,-10].map(h=>current+h*3600));
  const result=C.daily(retained,M,now).get('2026-10-24');
  assert.equal(result.start,current-12*3600);assert.equal(result.historical,true);
});

test('comparison dates include yesterday exactly when the rolling history crosses a Warsaw date boundary',()=>{
  const morning=C.calendarDays(Date.parse('2026-10-24T00:37:00Z'));
  assert.deepEqual(morning,['2026-10-23','2026-10-24','2026-10-25','2026-10-26','2026-10-27','2026-10-28','2026-10-29']);
  assert.equal(C.calendarDays(Date.parse('2026-10-24T14:37:00Z'))[0],'2026-10-24');
  assert.equal(C.calendarDays(Date.parse('2026-10-25T10:37:00Z'))[0],'2026-10-25');
  assert.equal(C.calendarDays(Date.parse('2026-03-29T10:37:00Z'))[0],'2026-03-28');
});

test('future sessions take priority over better historical sessions', () => {
  const now = Date.parse('2026-10-21T10:00:00Z');
  const rows = [-3, -2, -1, 1, 2, 3].map(h => ({time: now / 1000 + h * 3600, score: h < 0 ? 9 : 4, daylight: true, height: 1, simulation: {}}));
  const result = C.daily(rows, M, now).get(C.dayKey(now / 1000));
  assert.equal(result.score, 4);
  assert.equal(result.historical, false);
});

test('daily grouping uses Warsaw dates and cannot join windows across midnight or missing hours', () => {
  const start = Date.parse('2026-10-21T21:00:00Z') / 1000;
  const rows = [0, 1, 2].map(i => ({time: start + i * 3600, score: 8, daylight: true, height: 1, simulation: {}}));
  assert.equal(C.dayKey(start), '2026-10-21');
  assert.equal(C.dayKey(start + 3600), '2026-10-22');
  assert.ok([...C.daily(rows, M, start * 1000).values()].every(v => v === null));
  const gap = rows.map((r, i) => ({...r, time: start - 8 * 3600 + i * 7200}));
  assert.ok([...C.daily(gap, M, (start - 10 * 3600) * 1000).values()].every(v => v === null));
});
