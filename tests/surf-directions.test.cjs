const { test } = require('node:test');
const assert = require('node:assert/strict');
const D = require('../surf-directions.js');
const M = require('../surf-model.js');
const close = (value, expected) => assert.ok(Math.abs(value - expected) < 1e-8, `${value} differs from ${expected}`);

test('incoming wind and waves point toward land; offshore points from the beach toward the sea', () => {
  for (const normal of [0, 85, 180, 270, 335]) {
    const wind = D.wind({speed:5,direction:normal},{normal});
    const wave = D.wave({height:1,direction:normal},{normal});
    for (const motion of [wind,wave]) {
      close(motion.dx,0);close(motion.dy,1);assert.equal(motion.rotation,180);
      assert.equal(motion.label,'Do brzegu');assert.equal(motion.relation,'onshore');
    }
    const offshore = D.wind({speed:5,direction:normal+180},{normal});
    close(offshore.dx,0);close(offshore.dy,-1);assert.equal(offshore.rotation,0);
    assert.equal(offshore.label,'Od brzegu');
  }
});

test('left and right follow a person facing the sea, including east-facing beaches', () => {
  const cases = [
    {direction:270,normal:0,dx:1,dy:0,side:'w prawo'},
    {direction:90,normal:0,dx:-1,dy:0,side:'w lewo'},
    {direction:0,normal:90,dx:1,dy:0,side:'w prawo'},
    {direction:180,normal:90,dx:-1,dy:0,side:'w lewo'}
  ];
  for (const {direction,normal,dx,dy,side} of cases) {
    const motion=D.relative(direction,normal);
    close(motion.dx,dx);close(motion.dy,dy);
    assert.equal(motion.label,'Wzdłuż brzegu');assert.ok(motion.description.includes(side));
  }
  const northwest=D.relative(315,0);
  assert.ok(northwest.dx>0&&northwest.dy>0);assert.equal(northwest.label,'Ukośnie do brzegu');
});

test('rotation is continuous across north and is independent of the absolute orientation of the coast', () => {
  assert.deepEqual(D.relative(-1,361),D.relative(359,1));
  const nearNorth=D.relative(359,1);
  assert.equal(nearNorth.rotation,178);assert.equal(nearNorth.relation,'onshore');
  for (const normal of [0,30,65,335,720,-90]) {
    const motion=D.relative(normal+45,normal);
    assert.equal(motion.rotation,225);
    assert.ok(motion.dx<0&&motion.dy>0);assert.equal(motion.relation,'cross-on');
  }
});

test('direction descriptions agree with the existing five shore-relative classes at their boundaries', () => {
  for (const direction of [0,22.5,22.51,67.5,67.51,112.5,112.51,157.49,157.5,180,225,270,315,359]) {
    const wind={speed:4,direction},spot={normal:0};
    assert.equal(D.wind(wind,spot).relation,M.windRelative(wind,spot));
  }
});

test('calm and missing data never create a made-up arrow', () => {
  for (const speed of [0,.1,.49]) {
    const calm=D.wind({speed,direction:null},{normal:0});
    assert.equal(calm.state,'calm');assert.equal(calm.rotation,null);assert.equal(calm.label,'Cisza');
  }
  for (const height of [0,.001]) {
    const calm=D.wave({height,direction:180},{normal:0});
    assert.equal(calm.state,'calm');assert.equal(calm.rotation,null);assert.equal(calm.label,'Brak fal');
  }
  assert.equal(D.wind({speed:.5,direction:90},{normal:0}).state,'moving');
  assert.equal(D.wind({speed:1,direction:90},{normal:0}).weak,true);
  assert.equal(D.wave({height:.002,direction:90},{normal:0}).state,'moving');
  for (const value of [null,undefined,NaN,Infinity,'0']) {
    assert.equal(D.relative(value,0),null);assert.equal(D.relative(0,value),null);
    assert.equal(D.wind({speed:3,direction:value},{normal:0}),null);
    assert.equal(D.wave({height:1,direction:value},{normal:0}),null);
  }
  for (const value of [null,undefined,NaN,Infinity,-1,'0']) {
    assert.equal(D.wind({speed:value,direction:0},{normal:0}),null);
    assert.equal(D.wave({height:value,direction:0},{normal:0}),null);
  }
});

test('wave direction is independent of local wind and neither input is modified', () => {
  const spot=Object.freeze({normal:335}),wind=Object.freeze({speed:5,direction:155}),wave=Object.freeze({height:1,direction:335});
  assert.equal(D.wind(wind,spot).rotation,0);
  assert.equal(D.wave(wave,spot).rotation,180);
  assert.equal(wind.direction,155);assert.equal(wave.direction,335);
});
