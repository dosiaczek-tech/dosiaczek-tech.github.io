// Water-only routing plans. Transfers are separate legs, never drawn as lines.
const p = (name, query = name) => ({ name, query });
const regional = [16.2, 53.25, 19, 54.9];
const bylina = p('Bylina'), soszyca = p('Soszyca', 'Soszyca, gmina Bytów');
const glebokie = p('Jezioro Głębokie', 'Głębokie, gmina Dębnica Kaszubska');
const galaznia = p('Gałąźnia Mała');
const mlosina = { name: 'Ujście Młosiny do Zbrzycy', junction: ['Młosina', 'Zbrzyca'], near: [17.665, 53.946] };
const ksieze = p('Jezioro Księże', 'Jezioro Księże, gmina Lipnica');

export const WATER_AREAS = {
  mokre: { query: 'Jezioro Mokre, gmina Piecki', near: [21.405, 53.69] },
  krutynskie: { query: 'Jezioro Krutyńskie', near: [21.423, 53.709] },
  charzykowskie: { query: 'Jezioro Charzykowskie', near: [17.49, 53.78] },
  karsinskie: { query: 'Jezioro Karsińskie', near: [17.484, 53.844] },
  szczytno: { query: 'Jezioro Szczytno, pomorskie', near: [17.18, 53.76] },
  konskie: { query: 'Jezioro Końskie, gmina Przechlewo', near: [17.25, 53.79] },
  sominskie: { query: 'Jezioro Somińskie', near: [17.626, 54.012] },
  kruszynskie: { query: 'Jezioro Kruszyńskie', near: [17.62, 53.986] },
  sarbsko: { query: 'Sarbsko', near: [17.61, 54.758] },
  garczyn: { query: 'Jezioro Garczyn, gmina Kościerzyna', near: [17.895, 54.135] },
  graniczne: { query: 'Jezioro Graniczne, gmina Kościerzyna', near: [17.882, 54.104] },
  wieprznickie: { query: 'Jezioro Wieprznickie', near: [17.921, 54.149] },
  sudomie: { query: 'Sudomie', near: [17.895, 54.094] },
  mielnica: { query: 'Mielnica', near: [17.923, 54.09] },
  zolnowo: { query: 'Żołnowo', near: [17.934, 54.077] },
  ksieze: { query: 'Jezioro Księże, gmina Lipnica', near: [17.491, 53.935] },
  studzieniczno: { query: 'Jezioro Studzieniczno', near: [17.566, 54.08] },
  klaczno: { query: 'Jezioro Kłączno', near: [17.541, 54.065] },
  rynskie: { query: 'Jezioro Ryńskie, pomorskie', near: [17.526, 54.057] },
  kielskie: { query: 'Jezioro Kielskie', near: [17.524, 54.024] },
  radunskie: { query: 'Jezioro Raduńskie Górne', near: [17.974, 54.249] },
  gowidlinskie: { query: 'Jezioro Gowidlińskie', near: [17.792, 54.295] },
  jasien: { query: 'Jezioro Jasień, pomorskie', near: [17.604, 54.285] },
  wegorzyno: { query: 'Węgorzyno', near: [17.796, 54.235] },
  'glebokie-slupia': { query: 'Jezioro Głębokie, gmina Dębnica Kaszubska', near: [17.39, 54.271] },
  witoczno: { query: 'Witoczno', near: [17.508, 53.877] },
  koronowskie: { query: 'Zalew Koronowski', near: [17.933, 53.397] },
  'wisla-gniew': { name: 'Wisła — dojście wodne do przystani w Gniewie', osmWay: 4220368, near: [18.837, 53.832], bounds: [18.824, 53.827, 18.85, 53.838] },
  zagnanie: { query: 'Żagnanie', near: [18.024, 54.075] },
  sianowskie: { query: 'Jezioro Sianowskie', near: [18.09, 54.383] },
  laska: { query: 'Jezioro Laska', near: [17.521, 53.936] },
  tuchomskie: { name: 'Tuchomskie Jezioro', osmWay: 239427715, near: [17.344, 54.122], bounds: [17.33833, 54.11698, 17.35033, 54.12498] },
  lapino: { name: 'Jezioro Łapińskie Nowe — zbiornik Łapino', osmWay: 4349461, near: [18.448, 54.288], bounds: [18.43, 54.28, 18.46, 54.30] },
  ostrzyckie: { query: 'Jezioro Ostrzyckie', near: [18.094, 54.242] },
  patulskie: { query: 'Jezioro Patulskie', near: [18.068, 54.223] },
  dabrowskie: { query: 'Jezioro Dąbrowskie, gmina Stężyca', near: [18.0, 54.207] },
  wdzydze: { query: 'Jezioro Wdzydze', near: [17.935, 53.98] },
  radolne: { query: 'Jezioro Radolne', near: [17.909, 54.006] },
  jelenie: { query: 'Jelenie, gmina Kościerzyna', near: [17.918, 54.029] }
};
for (const [id, spec] of Object.entries(WATER_AREAS)) {
  spec.id = id;
  spec.bounds ??= [spec.near[0] - .18, spec.near[1] - .1, spec.near[0] + .18, spec.near[1] + .1];
}

// Small, targeted OSM extracts supplement unnamed reaches/culverts omitted by
// name-based search. No routing against roads and no links through dry land.
export const EXTRACTS = {
  'slupia-rynna': [17.743, 54.225, 17.764, 54.24],
  'slupia-konradowo': [17.214, 54.319, 17.235, 54.334],
  'skotawa-debnica': [17.145, 54.366, 17.173, 54.385],
  'chelst-east': [17.70, 54.765, 17.765, 54.787],
  'chelst-west': [17.53, 54.748, 17.58, 54.768],
  'graniczna-trzebiocha': [17.85, 54.04, 17.945, 54.16],
  'klonecznica-upper': [17.49, 54.015, 17.60, 54.105],
  'kolko-south': [17.985, 54.19, 18.105, 54.252],
  'wieprza-port': [16.371, 54.414, 16.423, 54.448],
  'krutynia-weir': [21.404, 53.704, 21.411, 53.709],
  'skotawa-skarszow': [17.117, 54.36, 17.145, 54.376],
  'wierzyca-gniew': [18.824, 53.827, 18.85, 53.838]
};
export function waterPlan(route) {
  const first = route.map.places[0], last = route.map.places.at(-1);
  const result = { rivers: [...route.map.rivers], areas: [], extracts: [], legs: [{ points: route.map.followWaypoints ? route.map.places : [first, last] }], bounds: route.map.bounds };
  if (/Słupia/.test(route.river)) result.extracts.push('slupia-rynna', 'slupia-konradowo');
  if (route.id.startsWith('kamienica-tuchomie-')) result.areas.push('tuchomskie');
  if (/Łupawa/.test(route.river) && route.from === 'Łupawsko') result.areas.push('jasien');
  if (route.id.startsWith('slupia-wegorzyno-')) result.areas.push('wegorzyno');
  if (/Słupia|Bytowa/.test(route.river) && /glebokie|ustka/.test(route.id)) result.areas.push('glebokie-slupia');
  if (route.id === 'zbrzyca-ksieze-witoczno') { result.areas.push('witoczno'); result.rivers.push('Brda'); }
  if (route.id === 'brda-nowa-brda-gostycyn') result.areas.push('koronowskie');
  if (route.id === 'wietcisa-wolny-dwor-czarnocin') result.rivers.push('Wierzyca rzeka, pomorskie');
  if (route.id === 'kanal-wdy-borsk-cegielnia') result.rivers.push('Wda rzeka, pomorskie');
  if (route.id === 'radunia-straszyn-krepiec') result.rivers.push('Motława');
  if (route.id === 'radunia-ostrzyce-kielpino') result.areas.push('ostrzyckie');
  if (/Wielki Podleś/.test(route.from + route.to)) result.areas.push('zagnanie');
  if (route.id === 'leba-sianowo-gac') result.areas.push('sianowskie');
  if (route.id === 'lipczynka-lipczynek-sapolno') { result.rivers.push('Brda'); result.endpointNote = 'Meta z mapy operatora leży nad Brdą w Sąpolnie; końcówka obejmuje krótki fragment Brdy.'; }
  if (route.id === 'mlosina-lesno-kaszuba') result.rivers.push('Zbrzyca');
  if (/Wierzyca/.test(route.river) && route.to === 'Gniew') {
    result.extracts.push('wierzyca-gniew'); result.areas.push('wisla-gniew');
    result.endpointNote = 'Meta przy przystani w Gniewie, ul. Rybacka. Końcowy fragment do przystani prowadzi po Wiśle; uwzględnij warunki na dużej rzece.';
  }
  if (/Skotawa/.test(route.river)) result.extracts.push('skotawa-debnica', 'skotawa-skarszow');
  if (/Wieprza/.test(route.river)) { result.rivers.push('Wieprza'); result.extracts.push('wieprza-port'); }
  if (/Graniczna|Trzebiocha|Pilica kaszubska/.test(route.river)) result.extracts.push('graniczna-trzebiocha');
  if (/Trzebiocha/.test(route.river)) result.areas.push('sudomie', 'mielnica', 'zolnowo');
  if (route.id === 'graniczna-wieprznica-rybaki') result.areas.push('wieprznickie', 'garczyn', 'graniczne', 'sudomie', 'mielnica');
  if (route.id.startsWith('slupia-gowidlino-')) result.areas.push('gowidlinskie');
  if (route.id === 'klonecznica-studzienice-laska') {
    result.extracts.push('klonecznica-upper');
    result.areas.push('studzieniczno', 'klaczno', 'rynskie', 'kielskie', 'ksieze', 'laska'); result.rivers.push('Zbrzyca');
    result.legs = [{ points: [first, p('Laska', 'Laska, gmina Brusy')] }];
  }
  if (route.id === 'chelst-stilo-leba') {
    result.rivers.push('Chełst', 'Kanał Chełst'); result.areas.push('sarbsko'); result.extracts.push('chelst-east', 'chelst-west');
  }
  if (route.id === 'krutynia-zgon-krutyn') { result.areas.push('mokre', 'krutynskie'); result.extracts.push('krutynia-weir'); }
  if (route.id === 'chocina-zielona-swornegacie') result.areas.push('karsinskie');
  if (route.id === 'brda-charzykowy-swornegacie') result.areas.push('charzykowskie', 'karsinskie');
  if (route.id === 'brda-dolinka-przechlewo') result.areas.push('szczytno', 'konskie');
  if (['wda-lipusz-wdzydze', 'trzebiocha-rybaki-wdzydze', 'wda-lipusz-tlen'].includes(route.id)) result.areas.push('wdzydze', 'radolne', 'jelenie');
  if (['wda-lipusz-wdzydze', 'trzebiocha-rybaki-wdzydze'].includes(route.id)) result.legs = [{ points: [first, p('Wdzydze — stanica PTTK', 'Stanica Wodna PTTK Wdzydze')] }];
  if (route.id === 'zbrzyca-mlosina-ksieze') result.legs = [{ points: [mlosina, ksieze] }];
  if (['zbrzyca-mlosina-ksieze', 'zbrzyca-sominy-mlosina', 'zbrzyca-ksieze-witoczno'].includes(route.id)) result.endpointNote = 'Do planowania przyjęto opisane miejsca dostępu: Kaszuba dla okolic ujścia Młosiny i Laska dla końca opisywanego ogólnie przy Jeziorze Księżym. Dokładne końce i pomiar mapy różnią się od ogólnych granic odcinka w źródle.';
  if (route.id === 'zbrzyca-sominy-mlosina') {
    result.areas.push('sominskie', 'kruszynskie'); result.legs = [{ points: [first, mlosina] }];
  }
  if (route.id === 'kolko-radunskie-stezyca-golubie') {
    result.areas.push('radunskie', 'ostrzyckie', 'patulskie', 'dabrowskie'); result.extracts.push('kolko-south');
    result.legs = [{ points: [first, p('Chmielno', 'Chmielno, powiat kartuski'), p('Ostrzyce'), p('Gołubie')] }];
  }
  if (route.id === 'radunia-stezyca-gdansk') {
    result.rivers.push('Motława'); result.areas.push('radunskie', 'lapino');
    result.legs = [
      { points: [first, p('Trątkownica / Kiełpino', 'Kiełpino, gmina Kartuzy')], after: 'Przewózka Trątkownica–Rutki. Jar Raduni jest wyłączony ze spływów.' },
      { points: [p('Rutki', 'Rutki, gmina Żukowo'), p('Kolbudy')], after: 'Przewózka Łapino (rejon Kolbud)–Straszyn. Wyjście przy parkingu przed elektrownią w Łapinie. Ominięcie zbiornika ujęcia wody.' },
      { points: [p('Straszyn'), last] }
    ];
  }
  if (route.id === 'slupia-wegorzyno-golebia' || route.id === 'slupia-kajlandia-glebokie') {
    result.legs = [{ points: [first, bylina], after: 'Przewózka Bylina–Soszyca; kanał elektrowni poza trasą wodną.' }, { points: [soszyca, last] }];
  }
  if (route.id === 'slupia-gowidlino-ustka') {
    result.legs = [{ points: [first, bylina], after: 'Przewózka Bylina–Soszyca.' }, { points: [soszyca, glebokie], after: 'Przewózka Jezioro Głębokie–Gałąźnia Mała.' }, { points: [galaznia, last] }];
  }
  if (route.id === 'bytowa-bytow-ustka') result.legs = [{ points: [first, glebokie], after: 'Przewózka Jezioro Głębokie–Gałąźnia Mała.' }, { points: [galaznia, last] }];
  result.rivers = [...new Set(result.rivers)]; result.areas = [...new Set(result.areas)];
  return result;
}
export const REGIONAL_BOUNDS = regional;
