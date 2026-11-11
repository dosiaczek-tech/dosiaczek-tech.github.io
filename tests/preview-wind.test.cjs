const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createPreviewWind, usableWind, coversForecast } = require('../scripts/preview-wind.cjs');
const { FORECAST_HOURS } = require('../surf-model.js');
const models = ['icon_seamless', 'gfs_seamless', 'ecmwf_ifs025'];
// Hourly wind from two days back until each listed model's last hour ahead, like an Open-Meteo bundle;
// by default ICON ends after a week while GFS and ECMWF reach past the two-week forecast.
function forecast(now, ahead = {icon_seamless: 180, gfs_seamless: 380, ecmwf_ifs025: 348}) {
  const start = Math.floor(now / 3600000) * 3600 - 48 * 3600;
  const hourly = {time: Array.from({length: 48 + Math.max(...Object.values(ahead)) + 1}, (_, i) => start + i * 3600)};
  for (const model of models) {
    const last = model in ahead ? start + (48 + ahead[model]) * 3600 : -Infinity;
    hourly[`wind_speed_10m_${model}`] = hourly.time.map(t => t <= last ? 5 : null);
    hourly[`wind_direction_10m_${model}`] = hourly.time.map(t => t <= last ? 180 : null);
    hourly[`is_day_${model}`] = hourly.time.map(() => 1);
  }
  return {hourly};
}
const spots = Array.from({length: 5}, (_, i) => ({id:`spot-${i}`, lat:54+i*.1, lon:15+i*.1}));
function weather(value = 5) {
  const hourly = {time:[1792684800,1792688400,1792692000]};
  for(const model of models) {
    hourly[`wind_speed_10m_${model}`] = [value,value,value];
    hourly[`wind_direction_10m_${model}`] = [180,180,180];
    hourly[`is_day_${model}`] = [1,1,1];
  }
  return {hourly};
}
function harness() {
  let now = Date.parse('2026-10-22T18:30:00Z'), mode = 'ok';
  const calls = [];
  const provider = createPreviewWind({spots,batchSize:2,now:()=>now,fetch:async url=>{
    const params = new URL(url).searchParams; calls.push(params);
    if(mode==='offline') throw new Error('offline');
    if(mode==='limited') return {ok:false,status:429,headers:new Headers({'retry-after':'120'})};
    const values = params.get('latitude').split(',').map(lat=>weather(Number(lat)));
    return {ok:true,json:async()=>mode==='malformed'?{hourly:{time:[]}}:values.length===1?values[0]:values};
  }});
  return {provider,calls,now:()=>now,advance:ms=>{now+=ms;},mode:value=>{mode=value;}};
}
test('fresh published wind keeps its original timestamp and never triggers local requests',async()=>{
  const h=harness(), published={schema:1,spotId:spots[0].id,fetchedAt:h.now()-3600000,data:forecast(h.now()),reusedInputs:true};
  assert.strictEqual(await h.provider.get(spots[0].id,published),published);
  assert.equal(h.calls.length,0);
});
test('fresh published wind shorter than the app forecast is replaced by the local fetch, so scores are not cut short',async()=>{
  // An older site version published six days (forecast_days: 6) while the app scores two weeks.
  const h=harness(), sixDays=Object.fromEntries(models.map(model=>[model,6*24-1]));
  const published={schema:1,spotId:spots[0].id,fetchedAt:h.now()-3600000,data:forecast(h.now(),sixDays)};
  assert.equal(usableWind(published,spots[0].id,h.now()),true);
  const served=await h.provider.get(spots[0].id,published);
  assert.notStrictEqual(served,published);
  assert.equal(served.sourceType,'local');
  assert.equal(h.calls.length,1);
  assert.equal(h.calls[0].get('forecast_days'),'16');
});
test('published wind covers the forecast only while two models reach its last hour, give or take 12 hours',()=>{
  const now=Date.parse('2026-11-11T07:00:00Z'), bundle=ahead=>({data:forecast(now,ahead)});
  assert.equal(coversForecast(bundle({icon_seamless:180,gfs_seamless:380,ecmwf_ifs025:348}),now),true,'ICON ends after a week, GFS and ECMWF go on');
  assert.equal(coversForecast(bundle({icon_seamless:180,gfs_seamless:380,ecmwf_ifs025:180}),now),false,'a single model for the second week');
  assert.equal(coversForecast(bundle({icon_seamless:143,gfs_seamless:143,ecmwf_ifs025:143}),now),false,'six days');
  assert.equal(coversForecast(bundle({gfs_seamless:FORECAST_HOURS-12,ecmwf_ifs025:FORECAST_HOURS-12}),now),true);
  assert.equal(coversForecast(bundle({gfs_seamless:FORECAST_HOURS-13,ecmwf_ifs025:FORECAST_HOURS-13}),now),false);
  assert.equal(coversForecast(null,now),false);
});
test('expired published wind is replaced by a real batched fetch shared between concurrent spot requests',async()=>{
  const h=harness(), expired={schema:1,spotId:spots[0].id,fetchedAt:h.now()-6*3600000-1,data:weather()};
  const [a,b]=await Promise.all([h.provider.get(spots[0].id,expired),h.provider.get(spots[1].id)]);
  assert.equal(h.calls.length,1);
  assert.equal(a.sourceType,'local'); assert.equal(a.fetchedAt,h.now()); assert.equal(a.reusedInputs,false);
  assert.equal(b.fetchedAt,a.fetchedAt);
  assert.equal(a.data.hourly.wind_speed_10m_icon_seamless[0],spots[0].lat);
  assert.equal(b.data.hourly.wind_speed_10m_icon_seamless[0],spots[1].lat);
  assert.equal(h.calls[0].get('latitude'),`${spots[0].lat},${spots[1].lat}`);
  assert.equal(h.calls[0].get('models'),models.join(','));
  assert.equal(h.calls[0].get('wind_speed_unit'),'ms');
  assert.equal(h.calls[0].get('past_days'),'2');
  assert.equal(h.calls[0].get('forecast_days'),'16');
  await h.provider.get(spots[0].id);
  assert.equal(h.calls.length,1);
});
test('each batch and the final single location are cached independently',async()=>{
  const h=harness();
  await Promise.all(spots.map(s=>h.provider.get(s.id)));
  assert.equal(h.calls.length,3);
  await Promise.all(spots.map(s=>h.provider.get(s.id)));
  assert.equal(h.calls.length,3);
});
test('refresh failure keeps original cached timestamps for at most six hours and backs off',async()=>{
  const h=harness(), first=await h.provider.get(spots[0].id);
  h.advance(31*60000); h.mode('offline');
  const cached=await h.provider.get(spots[0].id);
  assert.equal(cached.reusedInputs,true); assert.equal(cached.fetchedAt,first.fetchedAt);
  assert.equal(cached.lastRefreshError,'offline');
  await h.provider.get(spots[1].id);
  assert.equal(h.calls.length,2);
  h.advance(6*3600000);
  await assert.rejects(h.provider.get(spots[0].id),/offline/);
});
test('rate limiting honors Retry-After across all batches',async()=>{
  const h=harness(); h.mode('limited');
  await assert.rejects(h.provider.get(spots[0].id),/429/);
  await assert.rejects(h.provider.get(spots[3].id),/429/);
  assert.equal(h.calls.length,1);
  h.advance(119000); h.mode('ok');
  await assert.rejects(h.provider.get(spots[3].id),/429/);
  h.advance(1001);
  assert.equal((await h.provider.get(spots[3].id)).sourceType,'local');
  assert.equal(h.calls.length,2);
});
test('malformed wind and unknown spots never become a new forecast',async()=>{
  const h=harness(); h.mode('malformed');
  await assert.rejects(h.provider.get(spots[0].id),/Niepełna/);
  await assert.rejects(h.provider.get('missing'),/Nieznany/);
  assert.equal(h.calls.length,1);
  const valid={schema:1,spotId:spots[0].id,fetchedAt:h.now(),data:weather()};
  assert.equal(usableWind(valid,spots[0].id,h.now()),true);
  assert.equal(usableWind({...valid,fetchedAt:h.now()+300001},spots[0].id,h.now()),false);
  assert.equal(usableWind({...valid,fetchedAt:h.now()-6*3600000-1},spots[0].id,h.now()),false);
  assert.equal(usableWind(valid,spots[1].id,h.now()),false);
  assert.equal(usableWind({...valid,data:{hourly:{time:[1792684800]}}},spots[0].id,h.now()),false);
});

test('a moved spot refreshes ID-only or wrong-location wind and records the requested coordinates',async()=>{
  const spot=require('../surf-spots.js').find(s=>s.id==='sobieszewo');
  const now=Date.parse('2026-10-24T20:00:00Z');
  for(const oldPoint of [undefined,{id:spot.id,lat:54.35,lon:18.831}]){
    const calls=[];
    const provider=createPreviewWind({spots:[spot],now:()=>now,fetch:async url=>{
      calls.push(new URL(url).searchParams);
      return {ok:true,json:async()=>weather()};
    }});
    const old={schema:1,spotId:spot.id,spot:oldPoint,fetchedAt:now,data:weather()};
    const updated=await provider.get(spot.id,old);
    assert.equal(calls.length,1);assert.equal(calls[0].get('latitude'),String(spot.lat));assert.equal(calls[0].get('longitude'),String(spot.lon));
    assert.deepEqual(updated.spot,{id:spot.id,lat:spot.lat,lon:spot.lon});
    assert.equal(usableWind(old,spot.id,now,spot),false);assert.equal(usableWind(updated,spot.id,now,spot),true);
    assert.strictEqual(await provider.get(spot.id,old),updated);assert.equal(calls.length,1);
  }
});

test('explicit wind coordinates are validated for every spot and cannot be inferred from an API grid cell',()=>{
  const spot=spots[0],bundle={schema:1,spotId:spot.id,fetchedAt:Date.now(),data:weather(),spot:{...spot}};
  assert.equal(usableWind(bundle,spot.id,Date.now(),spot),true);
  assert.equal(usableWind({...bundle,spot:{...spot,lon:spot.lon+.01}},spot.id,Date.now(),spot),false);
  assert.equal(usableWind({...bundle,spot:{id:spot.id}},spot.id,Date.now(),spot),false);
});
