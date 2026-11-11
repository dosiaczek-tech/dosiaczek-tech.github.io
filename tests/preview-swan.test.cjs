const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createPreviewSwan, usableSwan } = require('../scripts/preview-swan.cjs');
const M = require('../surf-model.js');
const spots = [{id:'a',lat:54.8,lon:18.4,normal:0},{id:'b',lat:54.9,lon:18.5,normal:0}];
const now = Date.parse('2026-10-23T07:00:00Z');
function bundle(spot, age = 0, clock = now) {
  const result={schema:2,version:M.SIMULATION_VERSION,status:'ready',spot,generatedAt:clock/1000-age*3600,
    windFetchedAt:clock/1000-age*3600,boundaryFetchedAt:clock/1000-age*3600,maxShoreDistanceM:500,
    shoreline:{landDistance:0,waterDistance:100,distance:50},
    hourly:[{time:Math.floor(clock/3600000)*3600,height:.8,period:5,direction:0,depth:2,distance:200,
      shoreDistance:150,shoreDistanceMin:100,shoreDistanceMax:200,powerKWm:1.2,lat:54.8018,lon:18.4}]};
  result.history=Array.from({length:24},(_,i)=>({...result.hourly[0],time:result.hourly[0].time-(24-i)*3600}));
  return result;
}
function harness(options = {}) {
  const files = new Map();
  let clock=now, calls=0;
  const provider=createPreviewSwan({spots,now:()=>clock,readStatus:async()=>null,readResult:async id=>files.get(id)||null,
    run:async()=>{calls++;return options.run?options.run(files,clock):{available:0};},...options.provider});
  return {provider,files,calls:()=>calls,advance:ms=>{clock+=ms;}};
}
test('fresh published SWAN is served without starting a solver or changing source timestamps',async()=>{
  const h=harness(),published=bundle(spots[0],1);
  const result=await h.provider.get('a',published);
  assert.equal(h.calls(),0);
  assert.equal(result.generatedAt,published.generatedAt);
  assert.equal(result.boundaryFetchedAt,published.boundaryFetchedAt);
  assert.deepEqual(result.hourly,published.hourly);
  assert.equal(result.refreshPending,false);
  assert.equal(result.sourceType,undefined);
});
test('expired files start one shared coastal calculation and become usable only after genuine new results arrive',async()=>{
  let release;
  const h=harness({run:()=>new Promise(resolve=>{release=resolve;})});
  const oldA=bundle(spots[0],19),oldB=bundle(spots[1],19);
  const [a,b]=await Promise.all([h.provider.get('a',oldA),h.provider.get('b',oldB)]);
  assert.equal(h.calls(),1);
  assert.equal(a.refreshPending,true);assert.equal(b.refreshPending,true);
  assert.equal(a.generatedAt,oldA.generatedAt);
  assert.equal(usableSwan(a,spots[0],now),false);
  const current=bundle(spots[0]);h.files.set('a',current);
  const pending=h.provider.refresh();release({available:1});await pending;
  const updated=await h.provider.get('a',oldA);
  assert.equal(updated.sourceType,'local');assert.equal(updated.refreshPending,false);
  assert.equal(updated.generatedAt,current.generatedAt);
  assert.equal(updated.windFetchedAt,current.windFetchedAt);
  assert.equal(usableSwan(updated,spots[0],now),true);
  assert.equal(h.calls(),1);
});
test('refresh starts at twelve hours while the still-valid published forecast remains visible',async()=>{
  let release;
  const h=harness({run:()=>new Promise(resolve=>{release=resolve;})}),published=bundle(spots[0],12);
  const result=await h.provider.get('a',published);
  assert.equal(h.calls(),1);assert.equal(result.refreshPending,true);
  assert.equal(result.generatedAt,published.generatedAt);
  assert.equal(usableSwan(result,spots[0],now),true);
  const pending=h.provider.refresh();release({available:1});await pending;
});
test('solver failure explains the outage, retains original timestamps and backs off for fifteen minutes',async()=>{
  const h=harness({run:async()=>{throw new Error('solver offline');}}),published=bundle(spots[0],19);
  await h.provider.get('a',published);await h.provider.refresh();
  const failed=await h.provider.get('a',published);
  assert.equal(failed.refreshPending,false);assert.equal(failed.refreshError,'solver offline');
  assert.equal(failed.generatedAt,published.generatedAt);assert.equal(failed.retryAfter,900);
  assert.equal(usableSwan(failed,spots[0],now),false);
  h.advance(899000);await h.provider.get('b',bundle(spots[1],19));assert.equal(h.calls(),1);
  h.advance(1001);await h.provider.get('b',bundle(spots[1],19));await h.provider.refresh();assert.equal(h.calls(),2);
});
test('persistent local results survive server restarts without recalculating the coast for an unsupported spot',async()=>{
  const h=harness({provider:{readStatus:async()=>({version:M.SIMULATION_VERSION,spots:2,available:1,generatedAt:now/1000-3600})}});
  h.files.set('a',bundle(spots[0],1));
  assert.equal((await h.provider.get('a',bundle(spots[0],19))).sourceType,'local');
  const missing=await h.provider.get('b',{schema:2,status:'unavailable',spot:spots[1]});
  assert.equal(missing.status,'unavailable');assert.equal(missing.refreshPending,false);
  assert.equal(h.calls(),0);
});
test('a recovered newer publication replaces older local results',async()=>{
  const h=harness();h.files.set('a',bundle(spots[0],2));
  const published=bundle(spots[0],1),result=await h.provider.get('a',published);
  assert.equal(result.generatedAt,published.generatedAt);assert.equal(result.sourceType,undefined);
  assert.equal(h.calls(),0);
});
test('a model update bypasses the previous-version startup cooldown and refuses older published results',async()=>{
  const h=harness({provider:{readStatus:async()=>({version:'BS-SWAN-1.2-full-profile500',spots:2,available:2,generatedAt:now/1000})}});
  await h.provider.maintain();
  assert.equal(h.calls(),1);
  const old={...bundle(spots[0]),version:'BS-SWAN-1.2-full-profile500'};
  h.files.set('a',bundle(spots[0],1));
  const result=await h.provider.get('a',old);
  assert.equal(usableSwan(old,spots[0],now),false);
  assert.equal(result.version,M.SIMULATION_VERSION);
  assert.equal(result.sourceType,'local');
});
test('a valid full-history local forecast is preferred to a newer publication missing half of the history',async()=>{
  const h=harness(),local=bundle(spots[0],1),published=bundle(spots[0]);
  published.history=published.history.slice(-12);h.files.set('a',local);
  const result=await h.provider.get('a',published);
  assert.equal(result.sourceType,'local');assert.equal(result.generatedAt,local.generatedAt);
  assert.equal(result.history.length,24);assert.equal(h.calls(),0);
});
test('missing history starts a real recalculation instead of duplicating existing hours',async()=>{
  let release;
  const h=harness({run:()=>new Promise(resolve=>{release=resolve;})}),published=bundle(spots[0]);
  published.history=published.history.slice(-12);
  const pending=await h.provider.get('a',published);
  assert.equal(pending.refreshPending,true);assert.equal(pending.history.length,12);assert.equal(h.calls(),1);
  h.files.set('a',bundle(spots[0]));
  const task=h.provider.refresh();release({available:1});await task;
  const ready=await h.provider.get('a',published);
  assert.equal(ready.history.length,24);assert.equal(ready.refreshPending,false);
});
test('status follows the latest complete local computation without replacing a newer publication',async()=>{
  const local={spots:2,available:1,generatedAt:now/1000-60};
  const h=harness({provider:{readStatus:async()=>local}});
  assert.deepEqual(await h.provider.status({spots:2,available:0,generatedAt:now/1000-3600}),{...local,sourceType:'local'});
  const published={spots:2,available:2,generatedAt:now/1000};
  assert.strictEqual(await h.provider.status(published),published);
});
test('local validation uses the same age, geometry and coastal checks as the frontend',async()=>{
  const valid=bundle(spots[0]);
  for(const invalid of [null,{...valid,status:'unavailable'},bundle(spots[0],19),
    {...valid,windFetchedAt:now/1000-19*3600},{...valid,boundaryFetchedAt:now/1000+301},
    {...valid,spot:spots[1]},{...valid,hourly:[{...valid.hourly[0],shoreDistanceMax:501}]},
    {...valid,hourly:[{...valid.hourly[0],height:-1}]},{...valid,hourly:[]}])
    assert.equal(usableSwan(invalid,spots[0],now),false);
  assert.equal(usableSwan({...valid,hourly:[{...valid.hourly[0],height:0,period:null}]},spots[0],now),true);
  const h=harness();await assert.rejects(h.provider.get('unknown'),/Nieznany/);assert.equal(h.calls(),0);
  assert.equal(M.simulationAge({...valid,windFetchedAt:now/1000-19*3600},now),19);
});
