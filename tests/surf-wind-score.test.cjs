const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../surf-model.js');
const W = require('../surf-wind-map.js');
const spot = {lat:54.35,lon:18.83,normal:0};
const wind = {speed:3,direction:180};
function rate(height, period=6, w=wind) {
  const wave={height,period,direction:0};
  return M.rate(wave,w,spot,null,{...wave,depth:2,...M.waveEnergy(wave,2)});
}
test('tiny short waves remain poor but clean sub-metre waves can be worthwhile',()=>{
  const wave={height:.314,period:3.616,direction:358.8,depth:1.83,powerKWm:.189};
  const r=M.rate(wave,wind,spot,null,wave);
  assert.ok(r.score <= 1);
  assert.equal(M.scoreLabel(r.score,r.height),'Odpuść wyjazd specjalnie na surfing');
  assert.equal(rate(.1,9).score,0);
  assert.ok(rate(.8,6).score >= 6);
  assert.ok(rate(.8,6).score > rate(1.5,6,{speed:10,direction:0}).score);
});
test('larger waves improve score until storm limits; short periods and storms remain penalized',()=>{
  const scores=[1,1.5,2].map(h=>rate(h).score);
  assert.ok(scores[0] === scores[1] && scores[1] > scores[2]);
  assert.ok(rate(3).score <= 2);
  assert.ok(rate(2,6,{...wind,gust:18}).score <= 2);
  assert.ok(rate(2,3).score <= 3);
});
test('three-hour recommendation penalizes a weak hour without a sub-metre cap',()=>{
  const rows=[.8,1.5,1.5].map((height,i)=>({time:i*3600,daylight:true,height,score:i?8:1}));
  assert.equal(M.bestWindows(rows)[0].score,4.3);
});
test('wind arrows move opposite meteorological direction on a north-up map',()=>{
  const n=W.geometry(spot,{speed:3,direction:0}).arrow;
  const s=W.geometry(spot,{speed:3,direction:180}).arrow;
  const e=W.geometry(spot,{speed:3,direction:90}).arrow;
  const w=W.geometry(spot,{speed:3,direction:270}).arrow;
  assert.ok(n.tip.lat<n.from.lat && s.tip.lat>s.from.lat);
  assert.ok(e.tip.lon<e.from.lon && w.tip.lon>w.from.lon);
  assert.equal(W.geometry(spot,null).arrow,null);
  assert.equal(W.geometry(spot,{speed:0,direction:90}).arrow,null);
});

test('wind scoring is continuous at direction classes and penalizes gusts',()=>{
  const before=rate(1,6,{speed:5,direction:157.49}).score;
  const after=rate(1,6,{speed:5,direction:157.51}).score;
  assert.ok(Math.abs(after-before)<=.1);
  assert.ok(rate(1,6,{...wind,gust:13}).score<rate(1,6,wind).score);
  assert.equal(rate(1,6,{direction:180}),null);
});
