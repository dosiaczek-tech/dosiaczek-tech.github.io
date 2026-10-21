const {test}=require('node:test');
const assert=require('node:assert/strict');
const S=require('../surf-search.js');
const spots=require('../surf-spots.js');

test('town groups keep every spot once, sorted west to east within and between groups',()=>{
  const original=spots.map(s=>s.id);
  const groups=S.groupWestToEast(spots);
  assert.deepEqual(spots.map(s=>s.id),original,'catalog is not mutated');
  assert.equal(new Set(groups.map(g=>g.town)).size,groups.length);
  assert.deepEqual(groups.flatMap(g=>g.spots.map(s=>s.id)).sort(),[...original].sort());
  assert.equal(groups[0].town,'Świnoujście');
  assert.equal(groups.at(-1).town,'Krynica Morska');
  assert.ok(groups.every((g,i)=>!i||groups[i-1].longitude<=g.longitude));
  for(const group of groups)assert.ok(group.spots.every((s,i)=>!i||group.spots[i-1].lon<=s.lon));
  assert.equal(groups.filter(g=>g.town==='Kołobrzeg').length,1);
  assert.equal(groups.find(g=>g.town==='Kołobrzeg').spots.length,spots.filter(s=>s.town==='Kołobrzeg').length);
});

test('search tolerates missing diacritics, omitted letters and transposed letters',()=>{
  for(const [query,id] of [['kolobrzeg','kolobrzeg'],['kołobżeg','kolobrzeg'],['kolobzreg','kolobrzeg'],
    ['sobjeszewo','sobieszewo'],['palik piont','kolobrzeg-palikpoint'],['wladek','wladyslawowo'],
    ['Jastrzebia Gora','jastrzebia'],['9ka','ustronie-centralna']]){
    const results=S.search(spots,query);
    assert.equal(results[0].spot.id,id,query);
    assert.equal(results[0].strong,true,query);
  }
  assert.equal(S.distance('palikpiont','palikpoint'),1);
});

test('compound names, city plus spot and partial words find an actual catalog spot',()=>{
  for(const query of ['PalikPoint','Palik Point','Kołobrzeg palik','palik'])assert.equal(S.search(spots,query)[0].spot.id,'kolobrzeg-palikpoint');
  assert.equal(S.search(spots,'Darłówko Zachodnie')[0].spot.id,'darlowko-zachod');
  assert.equal(S.search(spots,'Gdańsk Stogi')[0].spot.id,'stogi');
});

test('short, unknown and ambiguous input does not claim a confident location',()=>{
  assert.deepEqual(S.search(spots,''),[]);
  assert.deepEqual(S.search(spots,'k'),[]);
  for(const query of ['zzqxw','Górki Zachodnie','plaża']){
    const results=S.search(spots,query);
    assert.ok(results.length>0 && results.length<=6);
    assert.equal(results[0].strong,false,query);
    assert.ok(results.every(r=>spots.some(s=>s.id===r.spot.id)));
  }
});
