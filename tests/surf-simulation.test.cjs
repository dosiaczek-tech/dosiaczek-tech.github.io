const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../surf-model.js');
const spot = { id: 'test', lat: 54.8, lon: 18.4, normal: 0 };
const time = Date.UTC(2026,9,20,12)/1000;
const result = {time,height:.8,period:5,energyPeriod:5.7,direction:0,depth:2,distance:200,powerKWm:1.2};
const wind = M.windConsensus([{speed:3,direction:180},{speed:3,direction:180}]);
const rows = [{time,score:20,wind,members:[],flags:[]}];
const document = {schema:1,status:'ready',spot,generatedAt:time,hourly:[result],windUsed:[{time,speed:3,direction:180}]};

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
  assert.equal(row.regionalScore,20);
  assert.ok(row.score>row.regionalScore);
  assert.deepEqual(row.simulationWind,document.windUsed[0]);
});
test('expired, wrong-spot and invalid SWAN data never masquerade as a current simulation',()=>{
  for(const doc of [{...document,generatedAt:time-19*3600},{...document,spot:{...spot,lon:19}},
    {...document,status:'unavailable'},{...document,hourly:[{...result,height:-9}]}, {...document,hourly:[]}]) {
    const row=M.applySimulation(rows,doc,spot,time*1000)[0];
    assert.equal(row.simulation,null);assert.equal(row.score,20);assert.equal(row.scoreSource,'regional');
  }
});
test('nearshore zero waves stay zero and missing wind does not produce a confident score',()=>{
  const calm=M.applySimulation(rows,{...document,hourly:[{...result,height:0,period:null}]},spot,time*1000)[0];
  assert.equal(calm.score,0);
  const missing=M.applySimulation([{...rows[0],wind:null}],document,spot,time*1000)[0];
  assert.equal(missing.score,null);assert.equal(missing.simulation.height,.8);
});
