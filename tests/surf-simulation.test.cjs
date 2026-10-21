const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../surf-model.js');
const spot = { id: 'test', lat: 54.8, lon: 18.4, normal: 0 };
const time = Date.UTC(2026,9,20,12)/1000;
const result = {time,height:.8,period:5,energyPeriod:5.7,direction:0,depth:2,distance:200,powerKWm:1.2,
  shoreDistance:150,shoreDistanceMin:100,shoreDistanceMax:200,lat:54.8018,lon:18.4};
const wind = M.windConsensus([{speed:3,direction:180},{speed:3,direction:180}]);
const rows = [{time,score:20,wind,members:[],flags:[],height:5,period:12,powerKWm:90,energyKJm2:15}];
const document = {schema:2,status:'ready',spot,generatedAt:time,maxShoreDistanceM:500,
  windFetchedAt:time,boundaryFetchedAt:time,
  profileGridM:50,profileReference:'estimated-shoreline',
  shoreline:{landDistance:0,waterDistance:100,distance:50},hourly:[result],windUsed:[{time,speed:3,direction:180}]};

test('five directional classes are relative to the beach or to the incoming wave explicitly',()=>{
  const classes=[[0,'onshore'],[45,'cross-on'],[90,'cross'],[135,'cross-off'],[180,'offshore']];
  for(const [direction,label] of classes) assert.equal(M.windRelative({speed:4,direction},spot),label);
  assert.equal(M.windRelativeToWave({speed:4,direction:180},90),'cross');
  assert.equal(M.windRelativeToWave({speed:4,direction:180},0),'offshore');
});
test('fresh SWAN result replaces the session rating without re-transforming its height',()=>{
  const row=M.applySimulation(rows,document,spot,time*1000)[0];
  assert.equal(row.simulation.height,.8);
  assert.equal(row.scoreSource,'swan');
  assert.equal(row.height,.8);
  assert.equal(row.period,5);
  assert.equal(row.powerKWm,1.2);
  assert.ok(row.score >= 0 && row.score <= 1);
  assert.deepEqual(row.simulationWind,document.windUsed[0]);
});
test('expired, wrong-spot and invalid SWAN data never masquerade as a current simulation',()=>{
  for(const doc of [{...document,generatedAt:time-19*3600},{...document,windFetchedAt:time-19*3600},{...document,spot:{...spot,lon:19}},
    {...document,status:'unavailable'},{...document,hourly:[{...result,height:-9}]}, {...document,hourly:[]},
    {...document,schema:1},{...document,hourly:[{...result,distance:501,shoreDistance:451,shoreDistanceMin:401,shoreDistanceMax:501}]}]) {
    const row=M.applySimulation(rows,doc,spot,time*1000)[0];
    assert.equal(row.simulation,null);assert.equal(row.score,null);assert.equal(row.scoreSource,'unavailable');
    for(const field of ['height','period','powerKWm','energyKJm2']) assert.equal(row[field],null,'Never substitute offshore data: '+field);
  }
});
test('profile includes all eleven points from shore boundary to a computed 500 m node',()=>{
  const profile=Array.from({length:11},(_,i)=>({shoreDistance:i*50,distance:50+i*50,shoreDistanceMin:i*50-50,shoreDistanceMax:i*50+50,
    kind:i?'swan-node':'land-boundary',height:i?(i===3?.8:.5+i/10):0,depth:i?2:0}));
  const input={...document,hourly:[{...result,profile}]};
  const weather={hourly:{time:[time],wind_speed_10m_icon_seamless:[3],wind_direction_10m_icon_seamless:[180]}};
  const row=M.buildCoastalForecast(spot,weather,input,time*1000)[0];
  assert.equal(row.height,.8);assert.equal(row.simulation.profile.length,11);
  assert.equal(row.simulation.profile[0].shoreDistance,0);
  assert.equal(row.simulation.profile.at(-1).shoreDistance,500);
  assert.equal(row.members.length,1);assert.equal(row.members[0].height,.8);
  assert.equal(M.buildCoastalForecast(spot,weather,null,time*1000)[0].height,null);
  for(const invalid of [profile.slice(1),[...profile,{...profile[10],shoreDistance:550}],
    profile.map((p,i)=>i===0?{...p,height:1}:p),profile.map((p,i)=>i===3?{...p,height:4}:p)]){
    assert.equal(M.buildCoastalForecast(spot,weather,{...input,hourly:[{...result,profile:invalid}]},time*1000)[0].simulation.profile.length,0);
  }
  const dry=profile.map((p,i)=>i===1?{...p,kind:'dry-model-node',height:0,depth:.02}:p);
  assert.equal(M.buildCoastalForecast(spot,weather,{...input,hourly:[{...result,profile:dry}]},time*1000)[0].simulation.profile.length,11);
  const fakeDry=dry.map((p,i)=>i===1?{...p,depth:2}:p);
  assert.equal(M.buildCoastalForecast(spot,weather,{...input,hourly:[{...result,profile:fakeDry}]},time*1000)[0].simulation.profile.length,0);
});
test('nearshore zero waves stay zero and missing wind does not produce a confident score',()=>{
  const calm=M.applySimulation(rows,{...document,hourly:[{...result,height:0,period:null}]},spot,time*1000)[0];
  assert.equal(calm.score,0);
  const missing=M.applySimulation([{...rows[0],wind:null}],document,spot,time*1000)[0];
  assert.equal(missing.score,null);assert.equal(missing.simulation.height,.8);
});
