const {test}=require('node:test');
const assert=require('node:assert/strict');
const P=require('../surf-profile-picker.js');
const option=iso=>({value:String(Date.parse(iso)/1000),label:iso});

test('profile days and their hours remain chronological even when the previously selected hour was first',()=>{
  const input=[option('2026-10-25T20:00:00Z'),option('2026-10-23T19:00:00Z'),option('2026-10-24T10:00:00Z'),option('2026-10-25T10:00:00Z')];
  const before=structuredClone(input),groups=P.groupOptions(input);
  assert.deepEqual(groups.map(g=>g.day),['2026-10-23','2026-10-24','2026-10-25']);
  assert.deepEqual(groups[2].options.map(o=>o.value),[input[3].value,input[0].value]);
  assert.deepEqual(input,before);
});

test('the repeated autumn hour stays distinct within one day and identifies CEST versus CET',()=>{
  const a=option('2026-10-25T00:00:00Z'),b=option('2026-10-25T01:00:00Z');
  const groups=P.groupOptions([b,a]);
  assert.equal(groups.length,1);assert.equal(groups[0].day,'2026-10-25');
  assert.deepEqual(groups[0].options.map(o=>o.value),[a.value,b.value]);
  assert.equal(groups[0].options[0].hour,'02:00 CEST');assert.equal(groups[0].options[1].hour,'02:00 CET');
});

test('only available unique timestamps form day groups, without placeholders or fabricated hours',()=>{
  const valid=option('2026-10-24T04:00:00Z');
  const groups=P.groupOptions([null,{value:''},{value:null},{value:'bad'},{value:Infinity},{...valid,disabled:true},valid,{...valid}]);
  assert.equal(groups.length,1);assert.equal(groups[0].options.length,1);assert.equal(groups[0].options[0].value,valid.value);
  assert.deepEqual(P.groupOptions([]),[]);
});
