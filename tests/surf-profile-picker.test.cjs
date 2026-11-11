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

const days=keys=>keys.map(day=>({day,options:[]}));
const week=['2026-11-08','2026-11-09','2026-11-10','2026-11-11','2026-11-12','2026-11-13','2026-11-14'];
const today='2026-11-09',shown=page=>page.visible.map(g=>g.day);

test('days are paged like the comparison tiles: five from today, then five more at a time',()=>{
  const first=P.dayPage(days(week),today,1,today),second=P.dayPage(days(week),today,2,today);
  assert.deepEqual(shown(first),week.slice(1,6));assert.equal(first.remaining,1);assert.equal(first.count,2);
  assert.deepEqual(shown(second),week.slice(1));assert.equal(second.remaining,0);
  assert.equal(P.dayPage(days(week),today,9,null).pages,2);assert.equal(P.dayPage(days(week),today,0,null).pages,1);
  const long=days(Array.from({length:13},(_,i)=>`2026-11-${String(i+9).padStart(2,'0')}`));
  assert.deepEqual([1,2,3].map(p=>P.dayPage(long,today,p,null).visible.length),[5,10,13]);
  assert.deepEqual([1,2,3].map(p=>P.dayPage(long,today,p,null).remaining),[8,3,0]);
  assert.equal(P.dayPage(days(week.slice(1,6)),today,1,null).count,1,'five days need no buttons');
  assert.deepEqual(shown(P.dayPage(days(week.slice(2)),today,1,null)),week.slice(2),'without today the list starts at its first day');
  assert.deepEqual(shown(P.dayPage([],today,1,null)),[]);
});

test('an hour chosen outside the list keeps its day visible',()=>{
  const later=P.dayPage(days(week),today,1,'2026-11-14'),past=P.dayPage(days(week),today,1,'2026-11-08');
  assert.equal(later.pages,2);assert.deepEqual(shown(later),week.slice(1));
  assert.equal(past.pages,1);assert.deepEqual(shown(past),week.slice(0,6));assert.equal(past.remaining,1);
});

test('the list ends after the same fourteen days as the comparison tiles',()=>{
  const month=days(Array.from({length:15},(_,i)=>`2026-11-${String(i+9).padStart(2,'0')}`));
  assert.equal(P.dayPage(month,today,2,today).remaining,4);
  const last=P.dayPage(month,today,3,today);
  assert.equal(last.count,3);assert.equal(last.visible.length,14);assert.equal(last.visible.at(-1).day,'2026-11-22');assert.equal(last.remaining,0);
  assert.equal(P.dayPage(month,today,1,'2026-11-23').visible.at(-1).day,'2026-11-23','an hour chosen elsewhere keeps its day');
});

test('paging buttons say how many days come next and hide when one page holds every day',()=>{
  const ui=view=>{const paging={},less={},more={};P.updatePaging(view,paging,less,more);return [paging.hidden,less.disabled,more.disabled,more.textContent];};
  assert.deepEqual(ui({count:3,pages:1,remaining:9}),[false,true,false,'Pokaż kolejne 5 dni']);
  assert.deepEqual(ui({count:3,pages:2,remaining:4}),[false,false,false,'Pokaż kolejne 4 dni']);
  assert.deepEqual(ui({count:2,pages:1,remaining:1}),[false,true,false,'Pokaż kolejny dzień']);
  assert.deepEqual(ui({count:3,pages:3,remaining:0}),[false,false,true,'Pokaż kolejne dni']);
  assert.equal(ui({count:1,pages:1,remaining:0})[0],true);
});
