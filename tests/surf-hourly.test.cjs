const { test } = require('node:test');
const assert = require('node:assert/strict');
const H = require('../surf-hourly.js');
const time = value => Date.parse(value) / 1000;
const series = (start, count) => Array.from({ length: count }, (_, i) => ({ time: start + i * 3600, sample: i }));

test('Thursday evening continues directly into Friday instead of filtering to one date', () => {
  const rows = series(time('2026-10-22T17:00:00Z'), 29);
  const periods = H.periods(rows);
  assert.equal(periods.length, 29);
  assert.deepEqual(periods.slice(0, 4).map(p => [p.day, p.label]), [
    ['2026-10-22', '19:00–20:00'], ['2026-10-22', '20:00–21:00'],
    ['2026-10-22', '21:00–22:00'], ['2026-10-22', '22:00–23:00']
  ]);
  assert.equal(periods.filter(p => p.day === '2026-10-22').length, 5);
  assert.equal(periods.filter(p => p.day === '2026-10-23').length, 24);
  for (let i = 1; i < periods.length; i++) assert.equal(periods[i - 1].end, periods[i].row.time);
  assert.equal(periods[periods.length - 1].end, rows[rows.length - 1].time + 3600);
});

test('every forecast hour stays visible by default and the requested hour is selected', () => {
  const rows = series(time('2026-10-22T17:00:00Z'), 55);
  const selectedTime = rows[20].time + 1200;
  const periods = H.periods(rows, { selectedTime });
  assert.equal(periods.length, rows.length);
  assert.equal(new Set(periods.map(p => p.day)).size, 4);
  assert.ok(periods.every(p => p.end === p.row.time + 3600));
  assert.deepEqual(periods.filter(p => p.selected).map(p => p.row.time), [rows[20].time]);
});

test('a partial new day retains its first available sample and the last interval stops at the data horizon', () => {
  const rows = [{ time: time('2026-10-22T19:00:00Z') }, ...series(time('2026-10-22T23:00:00Z'), 4)];
  const periods = H.periods(rows);
  assert.deepEqual(periods.map(p => [p.day, p.label]), [
    ['2026-10-22', '21:00–22:00'], ['2026-10-23', '01:00–02:00'], ['2026-10-23', '02:00–03:00'],
    ['2026-10-23', '03:00–04:00'], ['2026-10-23', '04:00–05:00']
  ]);
  assert.strictEqual(periods[1].row, rows[1]);
});

test('the continuous strip retains the 25-hour autumn day and its repeated 02:00', () => {
  const rows = series(time('2026-10-24T22:00:00Z'), 27);
  const hourly = H.periods(rows);
  assert.ok(hourly.every(p => p.end - p.row.time === 3600));
  assert.equal(hourly.filter(p => p.day === '2026-10-25').length, 25);
  assert.ok(hourly.some(p => p.label === '02:00–02:00' && p.zone === 'CEST → CET'));
  assert.ok(hourly.some(p => p.label === '02:00–03:00' && p.zone === 'CET'));
  assert.equal(hourly[25].day, '2026-10-26');
});

test('a selected session keeps its three hours highlighted within the full multi-day strip', () => {
  const rows = series(time('2026-10-22T17:00:00Z'), 29);
  const start = time('2026-10-23T06:00:00Z');
  const periods = H.periods(rows, { session: { start, end: start + 3 * 3600 }, selectedTime: start });
  assert.equal(periods.length, rows.length);
  assert.deepEqual(periods.filter(p => p.inSession).map(p => p.row.time), [start, start + 3600, start + 7200]);
  assert.equal(periods.filter(p => p.selected).length, 1);
  assert.equal(periods[0].day, '2026-10-22');
});

test('sorting does not mutate source rows and absent requested dates are not replaced by another selected hour', () => {
  const rows = series(time('2026-10-22T17:00:00Z'), 5).reverse(), original = [...rows];
  const periods = H.periods(rows, { selectedTime: time('2026-11-01T12:00:00Z') });
  assert.deepEqual(rows, original);
  assert.ok(periods.every(p => !p.selected));
  assert.strictEqual(periods[0].row, rows[rows.length - 1]);
  assert.deepEqual(H.periods([]), []);
  assert.deepEqual(H.periods([null, { time: null }, { time: Infinity }]), []);
});

function weatherInputs(t) {
  return {
    weather: {data:{utc_offset_seconds:7200,
      hourly_units:{temperature_2m:'°C',cloud_cover:'%'},
      hourly:{time:[t-3600,t,t+3600],temperature_2m:[9,10,11],cloud_cover:[0,100,50]},
      daily_units:{sunrise:'unixtime',sunset:'unixtime'},
      daily:{time:[time('2026-10-21T22:00:00Z')],sunrise:[time('2026-10-22T05:30:00Z')],sunset:[time('2026-10-22T15:45:00Z')]}
    }},
    sea: {data:{hourly_units:{sea_surface_temperature:'°C'},
      hourly:{time:[t+3600,t],sea_surface_temperature:[14,13]}}}
  };
}

test('combined table joins weather and waves by timestamp without changing scoring rows', () => {
  const t=time('2026-10-22T10:00:00Z'), data=weatherInputs(t);
  const source=[{time:t,score:0,simulation:{height:.3},daylight:false}];
  const before=structuredClone(source);
  const combined=H.combine(source,data,{now:t*1000});
  assert.deepEqual(combined.map(r=>r.time),[t]);
  assert.equal(combined[0].score,0);
  assert.strictEqual(combined[0].simulation,source[0].simulation);
  assert.equal(combined[0].weather.waterTemperature,13);
  assert.equal(combined[0].weather.airTemperature,10);
  assert.equal(combined[0].weather.cloudCover,100);
  assert.equal(combined[0].daylight,true);
  assert.deepEqual(source,before);
});

test('weather alone never creates table columns but available waves remain visible without extra weather', () => {
  const t=time('2026-10-22T10:00:00Z');
  const weatherOnly=H.combine([],weatherInputs(t),{now:t*1000});
  assert.deepEqual(weatherOnly,[]);
  const rows=[{time:t,score:4,simulation:{height:.5},daylight:false},{time:t+3600,score:5,simulation:{height:.7},daylight:false}];
  const windWeather={hourly:{time:[t,t+3600],is_day_icon_seamless:[0,1]}};
  const waveOnly=H.combine(rows,null,{windWeather,now:t*1000});
  assert.deepEqual(waveOnly.map(r=>r.daylight),[false,true]);
  assert.equal(waveOnly[0].weather.waterTemperature,null);
  assert.equal(H.combine(rows,null,{now:t*1000})[0].daylight,null);
});

test('merging includes twelve hours of history by default and never substitutes nearby temperatures for gaps', () => {
  const t=time('2026-10-22T10:00:00Z'), data=weatherInputs(t);
  const rows=[t-13*3600,t-12*3600,t,t+2*3600].map(time=>({time,simulation:{height:.6}}));
  const current=H.combine(rows,data,{now:t*1000,historyHours:0});
  assert.deepEqual(current.map(r=>r.time),[t,t+2*3600]);
  assert.equal(current[1].weather.airTemperature,null);
  const history=H.combine(rows,data,{now:t*1000+37*60000});
  assert.ok(history.some(r=>r.time===t-12*3600));
  assert.ok(!history.some(r=>r.time===t-13*3600));
  assert.ok(!history.some(r=>r.time===t-3600));
});

test('Tuesday is the final day when Wednesday has weather but no wave forecast', () => {
  const t=time('2026-10-27T21:00:00Z');
  const rows=series(t,6).map((row,i)=>({...row,simulation:i<2?{height:.5+i*.1}:null,wind:{speed:4+i}}));
  const conditions={weather:{data:{hourly_units:{temperature_2m:'°C',cloud_cover:'%'},
    hourly:{time:rows.map(r=>r.time),temperature_2m:[10,9,8,7,6,5],cloud_cover:[0,10,20,30,40,50]}}},
    sea:{data:{hourly_units:{sea_surface_temperature:'°C'},hourly:{time:rows.map(r=>r.time),sea_surface_temperature:[14,13,12,11,10,9]}}}};
  const combined=H.combine(rows,conditions,{now:t*1000});
  assert.deepEqual(combined.map(r=>r.time),[t,t+3600]);
  assert.deepEqual(combined.map(r=>[r.weather.airTemperature,r.weather.waterTemperature,r.weather.cloudCover,r.wind.speed]),
    [[10,14,0,4],[9,13,10,5]]);
  const periods=H.periods(combined);
  assert.equal(periods.length,2);
  assert.deepEqual([...new Set(periods.map(p=>p.day))],['2026-10-27']);
  assert.equal(periods.at(-1).end,t+2*3600);
  assert.ok(periods.at(-1).label.endsWith('24:00'));
});

test('a real zero-height wave forecast stays visible, while absent or invalid heights never become columns', () => {
  const t=time('2026-10-22T10:00:00Z');
  const heights=[null,undefined,NaN,Infinity,-1,'0',0,.7];
  const rows=heights.map((height,i)=>({time:t+i*3600,simulation:{height},score:null,wind:{speed:0}}));
  rows.push({time:t+8*3600,height:1,simulation:null},{time:null,simulation:{height:1}},null);
  const before=structuredClone(rows);
  const combined=H.combine(rows,weatherInputs(t),{now:t*1000});
  assert.deepEqual(combined.map(r=>r.time),[t+6*3600,t+7*3600]);
  assert.deepEqual(combined.map(r=>r.simulation.height),[0,.7]);
  assert.ok(combined.every(r=>r.score===null&&r.wind.speed===0));
  assert.deepEqual(rows,before);
});

test('missing wave hours are skipped without merging or dropping the surrounding hourly columns', () => {
  const t=time('2026-10-27T08:00:00Z');
  const rows=series(t,7).map((row,i)=>({...row,simulation:[1,5].includes(i)?null:{height:.4}}));
  const combined=H.combine(rows,null,{now:t*1000});
  const periods=H.periods(combined,{selectedTime:t+3600});
  assert.deepEqual(periods.map(p=>p.label),['09:00–10:00','11:00–12:00','12:00–13:00','13:00–14:00','15:00–16:00']);
  assert.ok(periods.every(p=>!p.selected));
  for(const period of periods)for(let time=period.row.time;time<period.end;time+=3600)
    assert.ok(combined.some(r=>r.time===time));
  assert.deepEqual(periods.map(p=>p.row.time),[0,2,3,4,6].map(h=>t+h*3600));
});

test('empty rows and columns are omitted while zeros stay aligned with their forecast times', () => {
  const periods = [{row:{time:1}},{row:{time:2}},{row:{time:3}}];
  const fields = [
    {key:'score',values:[null,0,7]},
    {key:'height',values:[null,0,null]},
    {key:'airTemperature',values:[null,undefined,'']}
  ];
  const before = structuredClone(fields);
  const table = H.compactTable(periods,fields);
  assert.deepEqual(table.periods.map(p=>p.row.time),[2,3]);
  assert.deepEqual(table.fields,[{key:'score',values:[0,7]},{key:'height',values:[0,null]}]);
  assert.strictEqual(table.periods[0],periods[1]);
  assert.deepEqual(fields,before);
});

test('a completely missing forecast leaves no placeholder rows or time columns', () => {
  const periods = [{row:{time:1}},{row:{time:2}}];
  assert.deepEqual(H.compactTable(periods,[{key:'score',values:[null,null]}]),{periods:[],fields:[]});
  assert.deepEqual(H.compactTable(periods,[]),{periods:[],fields:[]});
  assert.deepEqual(H.compactTable([],[]),{periods:[],fields:[]});
});

test('one point describes the available wave forecast without inventing points for weather-only hours', () => {
  const rows = [
    {simulation:{shoreDistance:250,depth:2.21,height:0}},
    {simulation:{shoreDistance:250,depth:2.21,height:.8}},
    {weather:{airTemperature:10}}
  ];
  const before = structuredClone(rows);
  assert.deepEqual(H.pointSummary(rows),{shoreDistance:{min:250,max:250},depth:{min:2.21,max:2.21}});
  assert.deepEqual(rows,before);
  assert.deepEqual(H.pointSummary([{simulation:{shoreDistance:100,depth:1.91}}]),
    {shoreDistance:{min:100,max:100},depth:{min:1.91,max:1.91}});
});

test('a varying point is summarized across all displayed hours', () => {
  const rows = series(time('2026-10-22T07:00:00Z'),4).map(row =>
    ({...row,simulation:{shoreDistance:250,depth:2.21}}));
  rows[1].simulation = {shoreDistance:300,depth:2.6};
  assert.deepEqual(H.periods(rows).map(period=>period.row.time),rows.map(row=>row.time));
  assert.deepEqual(H.pointSummary(rows),{shoreDistance:{min:250,max:300},depth:{min:2.21,max:2.6}});
});

test('missing, partial and invalid coastal points leave no shared description', () => {
  const rows = [null,{}, {simulation:null},
    ...[null,undefined,NaN,Infinity,'250',-50,0,501].map(shoreDistance=>({simulation:{shoreDistance,depth:2}})),
    ...[null,undefined,NaN,Infinity,'2',-1,0].map(depth=>({simulation:{shoreDistance:250,depth}}))];
  assert.equal(H.pointSummary(rows),null);
  assert.equal(H.pointSummary([]),null);
  assert.deepEqual(H.pointSummary([...rows,{simulation:{shoreDistance:500,depth:3}}]),
    {shoreDistance:{min:500,max:500},depth:{min:3,max:3}});
});

test('day-part shortcuts target 06:00, 12:00 and 18:00 of the chosen Warsaw day in the hourly table', () => {
  const start=time('2026-10-22T22:00:00Z'),rows=series(start,48);
  const periods=H.periods(rows);
  assert.deepEqual(H.dayPartTargets(periods,'2026-10-23').map(part=>[part.key,part.time]),[
    ['morning',start+6*3600],['afternoon',start+12*3600],['evening',start+18*3600]
  ]);
  assert.deepEqual(H.dayPartTargets(periods,'2026-10-24').map(part=>part.time),[30,36,42].map(h=>start+h*3600));
  assert.equal(H.dayPart(start+5*3600),null);
  assert.equal(H.dayPart(start+6*3600),'morning');
  assert.equal(H.dayPart(start+12*3600),'afternoon');
  assert.equal(H.dayPart(start+18*3600),'evening');
  assert.equal(H.dayPart(null),null);
});

test('day-part shortcuts use the first available hour within the part and never substitute another part or date', () => {
  const periods=H.periods([
    ...series(time('2026-10-23T13:00:00Z'),9),
    ...series(time('2026-10-24T05:00:00Z'),3)
  ]);
  assert.deepEqual(H.dayPartTargets(periods,'2026-10-23').map(part=>part.time),[
    null,time('2026-10-23T13:00:00Z'),time('2026-10-23T16:00:00Z')
  ]);
  assert.deepEqual(H.dayPartTargets(periods,'2026-10-24').map(part=>part.time),[time('2026-10-24T05:00:00Z'),null,null]);
  assert.ok(H.dayPartTargets(periods,'2026-10-25').every(part=>part.time===null));
  assert.ok(H.dayPartTargets([], '2026-10-23').every(part=>part.time===null));
});

test('day-part shortcuts follow local clock time across the autumn DST change', () => {
  const periods=H.periods(series(time('2026-10-23T22:00:00Z'),49));
  assert.deepEqual(H.dayPartTargets(periods,'2026-10-24').map(part=>part.time),[
    time('2026-10-24T04:00:00Z'),time('2026-10-24T10:00:00Z'),time('2026-10-24T16:00:00Z')
  ]);
  assert.deepEqual(H.dayPartTargets(periods,'2026-10-25').map(part=>part.time),[
    time('2026-10-25T05:00:00Z'),time('2026-10-25T11:00:00Z'),time('2026-10-25T17:00:00Z')
  ]);
});
