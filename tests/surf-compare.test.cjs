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
  const rows = [row(-25, 10), row(-24, 0), row(-22, 4), row(-21, null), { ...row(-20, 9), simulation: null }];
  const summary = C.daily(rows, M, now).get('2026-10-28');
  assert.equal(summary.score, 2);
  assert.equal(summary.hours, 2);
  assert.equal(summary.start, current - 24 * 3600);
  assert.equal(summary.end, current - 21 * 3600);
  assert.equal(C.daily([row(-24, 3)], M, now).get('2026-10-28').score, 3);
  assert.equal(C.daily([row(-24, null)], M, now).get('2026-10-28'), null);
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
  const entries = [entry('past-best',9,-4),entry('upcoming',2,1),entry('past-second',8,-4),entry('too-old',10,-28)];
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

test('history expires after twenty-four hours and never reuses cached future forecasts', () => {
  const now = Date.parse('2026-10-21T18:00:00Z');
  const row = hours => ({time: now / 1000 + hours * 3600, score: 8, height: 1, simulation: {}, daylight: true});
  const saved = [-25, -24, -22, -21, -20, 1].map(row);
  const retained = C.retainHistory([], saved, now);
  assert.deepEqual(retained.map(r => (r.time * 1000 - now) / 3600000), [-24, -22, -21, -20]);
  assert.ok(retained.every(r => r.archived));
  const corrected = C.retainHistory([{...row(-22), score: 4}], saved, now);
  assert.equal(corrected.find(r => r.time === row(-22).time).score, 4);
  const history = C.daily(retained, M, now).get(C.dayKey(now / 1000));
  assert.equal(history.historical, true);
  assert.equal(history.archived, true);
});

test('the oldest of twenty-four hourly samples stays available throughout the current hour',()=>{
  const now=Date.parse('2026-10-24T20:37:00Z'),current=Math.floor(now/3600000)*3600;
  const rows=[-25,-24,-23,-22,1].map(h=>({time:current+h*3600,score:8,height:1,simulation:{},daylight:true}));
  const retained=C.retainHistory([],rows,now);
  assert.deepEqual(retained.map(r=>r.time),[-24,-23,-22].map(h=>current+h*3600));
  const result=C.daily(retained,M,now).get('2026-10-23');
  assert.equal(result.start,current-24*3600);assert.equal(result.historical,true);
});

test('comparison dates always include yesterday from the rolling twenty-four hour history',()=>{
  const morning=C.calendarDays(Date.parse('2026-10-24T00:37:00Z'));
  assert.equal(morning.length,15,'yesterday plus fourteen forecast days');
  assert.deepEqual([morning[0],morning[1],morning.at(-1)],['2026-10-23','2026-10-24','2026-11-06']);
  assert.equal(C.calendarDays(Date.parse('2026-10-24T14:37:00Z'))[0],'2026-10-23');
  assert.equal(C.calendarDays(Date.parse('2026-10-25T10:37:00Z'))[0],'2026-10-24');
  assert.equal(C.calendarDays(Date.parse('2026-03-29T10:37:00Z'))[0],'2026-03-28');
});

test('legend links start the hourly forecast at Warsaw midnight, also on daylight saving changes', () => {
  const S = require('../surf-session.js');
  for (const [day, utc] of [['2026-11-13', '2026-11-12T23:00:00Z'], ['2026-07-01', '2026-06-30T22:00:00Z'],
    ['2026-03-29', '2026-03-28T23:00:00Z'], ['2026-10-25', '2026-10-24T22:00:00Z']]) {
    const time = C.dayStart(day);
    assert.equal(time, Date.parse(utc) / 1000, day);
    assert.equal(S.parse(`#surf/sobieszewo?time=${time}`).time, time, `${day} is a valid hour link`);
  }
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
test('picker search finds spots despite typos and offers only similar names when nothing matches', () => {
  const spots = require('../surf-spots.js');
  const ids = query => C.pickerMatches(spots, query).spots.map(s => s.id);
  assert.equal(C.pickerMatches(spots, 's').mode, 'all');
  assert.deepEqual(ids('stegna'), ['stegna']);
  assert.equal(ids('stgena')[0], 'stegna');
  assert.equal(ids('sopto')[0], 'sopot');
  assert.equal(ids('wladek')[0], 'wladyslawowo');
  assert.ok(ids('kołobrzg').length > 3 && ids('kołobrzg').every(id => spots.find(s => s.id === id).town === 'Kołobrzeg'));
  const near = C.pickerMatches(spots, 'ustka port');
  assert.equal(near.mode, 'similar'); assert.ok(near.spots.length <= 5 && near.spots.some(s => s.town === 'Ustka'));
  assert.deepEqual(C.pickerMatches(spots, 'xyzq'), { mode: 'none', spots: [] });
});
test('chart zoom never goes below six hours or past the available data', () => {
  const extent = { from: 0, until: 100 * 3600 };
  assert.deepEqual(C.clampView(extent, 10 * 3600, 11 * 3600), { from: 10 * 3600, until: 16 * 3600 });
  assert.deepEqual(C.clampView(extent, -5 * 3600, 15 * 3600), { from: 0, until: 20 * 3600 });
  assert.deepEqual(C.clampView(extent, 95 * 3600, 115 * 3600), { from: 80 * 3600, until: 100 * 3600 });
  assert.deepEqual(C.clampView(extent, -50 * 3600, 500 * 3600), extent);
  assert.deepEqual(C.clampView({ from: 0, until: 3600 }, 0, 600), { from: 0, until: 3600 });
});
test('the chart never zooms out beyond five days', () => {
  const extent = { from: 0, until: 14 * 86400 }, five = 5 * 86400;
  assert.deepEqual(C.clampView(extent, 0, 14 * 86400, five), { from: 0, until: five });
  assert.deepEqual(C.clampView(extent, 12 * 86400, 17 * 86400, five), { from: 9 * 86400, until: 14 * 86400 });
  assert.deepEqual(C.clampView(extent, 86400, 2 * 86400, five), { from: 86400, until: 2 * 86400 });
});
test('where to go lists each spot once with its best window within five days, never finished ones', () => {
  const now = Date.parse('2026-11-07T09:30:00Z'), current = Math.floor(now / 3600000) * 3600;
  const hours = (start, n, score) => Array.from({ length: n }, (_, i) => ({ time: current + (start + i) * 3600, score, daylight: true, simulation: {}, height: 1 }));
  const entries = [
    { id: 'past-best', rows: [...hours(-6, 6, 10), ...hours(24, 3, 4)] },
    { id: 'today', rows: hours(0, 6, 7) },
    { id: 'later', rows: [...hours(48, 3, 8), ...hours(52, 3, 6)] },
    { id: 'too-far', rows: hours(5 * 24, 3, 10) }
  ];
  const top = C.topWindows(entries, M, now);
  assert.ok(top.every(w => w.end * 1000 >= now), 'no finished window');
  assert.ok(!top.some(w => w.id === 'too-far'), 'day six is outside the five days');
  assert.deepEqual(top.map(w => [w.id, (w.start - current) / 3600]), [['later', 48], ['today', 0], ['past-best', 24]]);
  for (let i = 1; i < top.length; i++) assert.ok(top[i - 1].score >= top[i].score);
});
test('proposals for one day keep a running window, drop finished ones and are empty for a past day', () => {
  const now = Date.parse('2026-11-07T09:30:00Z'), current = Math.floor(now / 3600000) * 3600;
  const hours = (start, n, score) => Array.from({ length: n }, (_, i) => ({ time: current + (start + i) * 3600, score, daylight: true, simulation: {}, height: 1 }));
  const entries = [{ id: 'a', rows: [...hours(-4, 4, 10), ...hours(0, 6, 6), ...hours(24, 6, 5)] }, { id: 'b', rows: hours(1, 3, 8) }];
  const today = C.dayKey(now / 1000), tomorrow = C.dayKey(now / 1000 + 86400), yesterday = C.dayKey(now / 1000 - 86400);
  const todays = C.topWindows(entries, M, now, { day: today });
  assert.deepEqual(todays.map(w => [w.id, (w.start - current) / 3600]), [['b', 1], ['a', -2]]);
  assert.ok(C.topWindows(entries, M, now, { day: tomorrow }).every(w => C.dayKey(w.start) === tomorrow));
  assert.deepEqual(C.topWindows(entries, M, now, { day: yesterday }), []);
});
test('a window is listed until the minute after its upper hour and never crosses midnight or the dark', () => {
  const midnight = Date.parse('2026-06-20T00:00:00+02:00') / 1000, hour = h => midnight + h * 3600;
  const at = (h, m = 0, s = 0) => (hour(h) + m * 60 + s) * 1000;
  const row = (h, daylight = true) => ({ time: hour(h), score: 7, daylight, simulation: {}, height: 1 });
  const shown = (rows, now) => C.topWindows([{ id: 'spot', rows }], M, now, { day: '2026-06-20' }).map(w => [w.start, w.end]);
  const evening = [18, 19, 20].map(h => row(h)), window = [[hour(18), hour(21)]];
  for (const now of [at(19), at(19, 30), at(21), at(21, 0, 59)]) assert.deepEqual(shown(evening, now), window);
  assert.deepEqual(shown(evening, at(21, 1)), []);
  assert.deepEqual(shown([21, 22, 23].map(h => row(h)), at(23, 58)), [[hour(21), hour(24)]], 'the last window of a day ends at midnight');
  assert.deepEqual(shown([20, 21, 22].map(h => row(h)), at(23, 58)), [], 'a window that ended at 23:00 is gone');
  assert.deepEqual(shown([22, 23, 24, 25].map(h => row(h)), at(22)), [], 'no window over midnight');
  assert.deepEqual(shown([18, 19, 20].map(h => row(h, false)), at(19)), [], 'hours after dark are not a surf window');
  const day = [8, 9, 10].map(h => ({ ...row(h), score: 3 })), night = [21, 22, 23].map(h => ({ ...row(h, false), score: 9 }));
  assert.deepEqual(shown([...day, ...night], at(7)), [[hour(8), hour(11)]], 'a better evening never beats the day');
});
test('a spot with several great windows never pushes out another compared spot', () => {
  const now = Date.parse('2026-11-07T09:30:00Z'), current = Math.floor(now / 3600000) * 3600;
  const hours = (start, n, score) => Array.from({ length: n }, (_, i) => ({ time: current + (start + i) * 3600, score, daylight: true, simulation: {}, height: 1 }));
  const entries = [{ id: 'twice', rows: [...hours(0, 3, 9), ...hours(4, 3, 9)] },
    ...[...'abc'].map((id, i) => ({ id, rows: hours(i, 3, 8 - i / 10) })),
    { id: 'last', rows: [...hours(0, 3, 2), ...hours(3, 3, 1)] }, { id: 'no-window', rows: hours(0, 2, 8) }];
  const top = C.topWindows(entries, M, now, { day: C.dayKey(now / 1000) });
  assert.deepEqual(top.map(w => w.id), ['twice', 'a', 'b', 'c', 'last'], 'one proposal per spot, in score order, none for a spot without a window');
  assert.equal(top[0].start, current, 'of two equal windows the earlier one stays');
  assert.equal(top.at(-1).start, current, 'a weak spot still shows the better of its windows');
});
