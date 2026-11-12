const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const model = require('../surf-model.js');

function harness(storage = new Map()) {
  let now = Date.UTC(2026, 9, 20, 12), mode = 'ok', calls = 0;
  let swan = null;
  let publishedWind = null, coast = null;
  const requests = [];
  const context = {
    SurfModel: model, URLSearchParams, AbortController, setTimeout, clearTimeout,
    Date: class extends Date { static now() { return now; } },
    localStorage: { getItem: k => storage.get(k) || null, setItem: (k, v) => storage.set(k, v) },
    fetch: async url => {
      requests.push(url);
      if (url.startsWith('data/nearshore/') && swan) return {ok:true,json:async()=>structuredClone(swan)};
      if (url.startsWith('data/wind/') && publishedWind) return {ok:true,json:async()=>structuredClone(publishedWind)};
      if (url.startsWith('data/coast.json') && coast) return {ok:true,json:async()=>structuredClone(coast)};
      if (url.startsWith('data/wind/') && ['expired-published', 'local-published'].includes(mode)) return {
        ok: true, json: async () => ({schema:1,spotId:'test',fetchedAt:mode==='expired-published'?now-21600001:now,
          sourceType:mode==='local-published'?'local':'scheduled',data:{hourly:{time:[now/1000]}}})
      };
      if (url.startsWith('data/')) return {ok:false,status:404};
      calls++;
      if (mode === 'offline' || (mode === 'weather-down' && url.includes('api.open-meteo.com/v1/forecast'))) throw new Error('offline');
      if (mode === 'network') throw new TypeError('Failed to fetch');
      if (mode === 'timeout') throw Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' });
      if (mode === 'bad-json') return { ok: true, json: async () => { throw new SyntaxError('Unexpected token < in JSON at position 0'); } };
      if (mode === 'provider-error') return { ok: true, json: async () => ({ error: true, reason: 'Cannot initialize WeatherVariable from invalid String value' }) };
      if (mode === 'broken') return { ok: true, json: async () => null };
      if (mode === 'sea-down' && url.includes('sea_surface_temperature')) throw new Error('sea unavailable');
      if (mode === 'rate-limit') return { ok: false, status: 429 };
      if (url.includes('GetFeatureInfo')) return { ok: true, json: async () => ({ features: [{ properties: { Depth: mode === 'land' ? 2 : -10 } }] }) };
      if (url.includes('sea_surface_temperature')) return { ok: true, json: async () => ({
        hourly_units: { sea_surface_temperature: '°C' }, hourly: { time: [now / 1000], sea_surface_temperature: [13] }
      }) };
      if (url.includes('daily=')) return { ok: true, json: async () => ({
        hourly_units: { temperature_2m: '°C', cloud_cover: '%', weather_code: 'wmo code' },
        hourly: { time: [now / 1000], temperature_2m: [11.2], cloud_cover: [0], weather_code: [0] },
        utc_offset_seconds: 7200, daily_units: { sunrise: 'unixtime', sunset: 'unixtime' },
        daily: { time: [Date.UTC(2026, 9, 19, 22) / 1000], sunrise: [Date.UTC(2026, 9, 20, 5, 35) / 1000], sunset: [Date.UTC(2026, 9, 20, 15, 49) / 1000] }
      }) };
      return { ok: true, json: async () => ({ hourly: { time: [now / 1000] } }) };
    }
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../surf-api.js'), 'utf8'), context);
  return { api: context.SurfAPI, advance: seconds => { now += seconds * 1000; }, mode: v => { mode = v; }, calls: () => calls, requests, storage,
    now:()=>now,setSwan:value=>{swan=value;},setWind:value=>{publishedWind=value;},setCoast:value=>{coast=value;} };
}
const spot = { id: 'test', lat: 54.8, lon: 18.4, normal: 0 };

test('reopening offline retains a valid saved SWAN bundle with its original age, but never past expiry', async () => {
  const first = harness(), stamp = first.now() / 1000;
  first.setSwan({ schema: 2, version: model.SIMULATION_VERSION, status: 'ready', spot, generatedAt: stamp, windFetchedAt: stamp,
    boundaryFetchedAt: stamp, hourly: [{ time: stamp, height: .8 }] });
  await first.api.nearshore(spot);
  const reopened = harness(first.storage);
  reopened.mode('offline'); reopened.advance(3600);
  const saved = await reopened.api.nearshore(spot);
  assert.equal(saved.generatedAt, stamp);
  assert.equal(saved.stale, true);
  assert.equal(saved.refreshPending, false);
  assert.ok(saved.refreshError);
  reopened.advance(18 * 3600);
  assert.equal((await reopened.api.nearshore(spot)).status, 'unavailable');
});

test('the offline copy keeps five days of cross-sections while the app gets all of them', async () => {
  const first = harness(), stamp = first.now() / 1000, profile = [{ height: 1 }];
  first.setSwan({ schema: 2, version: model.SIMULATION_VERSION, status: 'ready', spot, generatedAt: stamp, windFetchedAt: stamp,
    boundaryFetchedAt: stamp, profileHours: 336, hourly: [0, 120, 121].map(hours => ({ time: stamp + hours * 3600, profile })) });
  assert.equal((await first.api.nearshore(spot)).hourly.map(row => row.profile.length).join(), '1,1,1');
  const reopened = harness(first.storage);
  reopened.mode('offline');
  const saved = await reopened.api.nearshore(spot);
  assert.equal(saved.profileHours, 120);
  assert.equal(saved.hourly.map(row => row.profile.length).join(), '1,1,0');
});

test('published wind survives reopening and an unavailable server within its six hour validity', async () => {
  const first = harness();
  const bundle = { schema: 1, spotId: spot.id, spot, fetchedAt: first.now(), data: { hourly: { time: [first.now() / 1000] } } };
  first.setWind(bundle);
  await first.api.forecasts(spot, false, { coastalOnly: true, publishedOnly: true });
  const reopened = harness(first.storage); reopened.advance(3600); reopened.mode('offline');
  const saved = await reopened.api.forecasts(spot, false, { coastalOnly: true, publishedOnly: true });
  assert.equal(saved.weather.fetchedAt, bundle.fetchedAt);
  assert.equal(saved.weather.stale, true);
  reopened.advance(6 * 3600);
  assert.equal((await reopened.api.forecasts(spot, true, { coastalOnly: true, publishedOnly: true })).weather, null);
});
test('older point-selection results cannot return through a response or saved forecast',async()=>{
  const h=harness(),stamp=h.now()/1000;
  const old={schema:2,version:'BS-SWAN-1.2-full-profile500',status:'ready',spot,
    generatedAt:stamp,windFetchedAt:stamp,boundaryFetchedAt:stamp,hourly:[{time:stamp,height:.244}]};
  h.setSwan(old);
  const savedKey=`nad-morzem:surf-v2:swan-${model.SIMULATION_VERSION}-${spot.id}:${spot.lat}:${spot.lon}:${spot.normal}-saved`;
  h.storage.set(savedKey,JSON.stringify(old));
  assert.equal((await h.api.nearshore(spot)).status,'unavailable');
  assert.match(h.requests[0],/model=BS-SWAN-1\.3-seaward2m/);
  const current={...old,version:model.SIMULATION_VERSION,hourly:[{time:stamp,height:1.188}]};
  h.setSwan(current);
  assert.equal((await h.api.nearshore(spot)).hourly[0].height,1.188);
  h.advance(901);h.setSwan(old);
  const retained=await h.api.nearshore(spot);
  assert.equal(retained.hourly[0].height,1.188);
  assert.equal(retained.stale,true);
});

test('an unavailable nearshore document preserves its real error and recovery state',async()=>{
  const h=harness();
  h.setSwan({schema:2,status:'unavailable',spot:{id:spot.id},error:'Oczekiwanie na obliczenia SWAN.',refreshPending:true,retryAfter:15});
  const result=await h.api.nearshore(spot);
  assert.equal(result.status,'unavailable');assert.equal(result.refreshPending,true);
  assert.equal(result.error,'Oczekiwanie na obliczenia SWAN.');assert.equal(result.retryAfter,15);
});

test('pending or expired SWAN responses cannot hide a completed calculation behind a fifteen-minute cache',async()=>{
  for(const pending of [false,true]){
    const h=harness(),stamp=h.now()/1000;
    const old={schema:2,version:model.SIMULATION_VERSION,status:'ready',spot,generatedAt:stamp-19*3600,windFetchedAt:stamp-19*3600,
      boundaryFetchedAt:stamp-19*3600,hourly:[{time:stamp,height:.8}],refreshPending:pending};
    h.setSwan(old);
    assert.equal((await h.api.nearshore(spot)).generatedAt,old.generatedAt);
    h.advance(6);
    const current={...old,generatedAt:h.now()/1000,windFetchedAt:h.now()/1000,boundaryFetchedAt:h.now()/1000,refreshPending:false};
    h.setSwan(current);
    assert.equal((await h.api.nearshore(spot)).generatedAt,current.generatedAt);
    assert.equal(h.requests.length,2);
    await h.api.nearshore(spot);assert.equal(h.requests.length,2);
  }
});

test('a cached forecast crossing eighteen hours is rechecked even when its cache entry is recent',async()=>{
  const h=harness(),stamp=h.now()/1000;
  h.setSwan({schema:2,version:model.SIMULATION_VERSION,status:'ready',spot,generatedAt:stamp-18*3600+1,windFetchedAt:stamp-18*3600+1,
    boundaryFetchedAt:stamp-18*3600+1,hourly:[{time:stamp,height:.8}]});
  await h.api.nearshore(spot);h.advance(6);await h.api.nearshore(spot);
  assert.equal(h.requests.length,2);
});

test('forecast requests are deduplicated and cached, including return to the same spot', async () => {
  const h = harness();
  const [a, b] = await Promise.all([h.api.forecasts(spot), h.api.forecasts(spot)]);
  assert.equal(h.calls(), 2);
  assert.equal(a.marine.fetchedAt, b.marine.fetchedAt);
  await h.api.forecasts(spot);
  assert.equal(h.calls(), 2);
  await h.api.forecasts({ ...spot, lat: 54.85 });
  assert.equal(h.calls(), 4, 'changed geometry cannot reuse an old location');
});

test('outage fallback preserves original timestamp and flags stale data; expires after six hours', async () => {
  const h = harness();
  const initial = await h.api.forecasts(spot);
  h.advance(1900); h.mode('offline');
  const fallback = await h.api.forecasts(spot);
  assert.equal(fallback.marine.stale, true);
  assert.equal(fallback.marine.fetchedAt, initial.marine.fetchedAt);
  assert.equal(fallback.weather.stale, true);
  h.advance(21600);
  const expired = await h.api.forecasts(spot);
  assert.equal(expired.marine, null);
  assert.equal(expired.weather, null);
  assert.equal(expired.errors.length, 2);
});

test('weather failure retains wave data without synthesizing wind', async () => {
  const h = harness(); h.mode('weather-down');
  const result = await h.api.forecasts(spot);
  assert.ok(result.marine);
  assert.equal(result.weather, null);
  assert.equal(result.errors.length, 1);
});

test('coastal page requests wind only, never an offshore wave forecast', async () => {
  const h = harness();
  const result = await h.api.forecasts(spot, false, { coastalOnly: true });
  assert.equal(result.marine, null);
  assert.ok(result.weather);
  assert.equal(h.calls(), 1);
});

test('automatic ranking uses only published files even when a bundle is missing', async () => {
  const h = harness();
  const result = await h.api.forecasts(spot, false, { coastalOnly: true, publishedOnly: true });
  assert.equal(result.weather, null);
  assert.equal(h.calls(), 0);
  assert.equal(result.errors.length, 1);
});

test('expired published wind explains why comparison ratings are unavailable', async () => {
  const h = harness(); h.mode('expired-published');
  const result = await h.api.forecasts(spot, false, {coastalOnly:true,publishedOnly:true});
  assert.equal(result.weather,null);
  assert.match(result.errors[0],/ponad 6 godzin/);
  assert.equal(h.calls(),0);
});

test('fresh local wind snapshots are available to the ranking without browser requests to the provider', async () => {
  const h = harness(); h.mode('local-published');
  const result = await h.api.forecasts(spot, false, {coastalOnly:true,publishedOnly:true});
  assert.equal(result.weather.sourceType,'local');
  assert.equal(result.weather.stale,false);
  assert.equal(h.calls(),0);
});

test('ranking rejects legacy wind at a moved spot until its coordinates are confirmed',async()=>{
  const h=harness(),moved={...spot,lat:54.34652508378602,lon:18.91065779954801,requireWindGeometry:true};
  const bundle={schema:1,spotId:spot.id,fetchedAt:h.now(),data:{hourly:{time:[h.now()/1000]}}};
  h.setWind(bundle);
  const missing=await h.api.forecasts(moved,false,{coastalOnly:true,publishedOnly:true});
  assert.equal(missing.weather,null);assert.match(missing.errors[0],/współrzędnych/);assert.equal(h.calls(),0);
  h.setWind({...bundle,spot:{id:moved.id,lat:moved.lat,lon:moved.lon}});
  const current=await h.api.forecasts(moved,false,{coastalOnly:true,publishedOnly:true});
  assert.equal(current.weather.spot.lat,moved.lat);assert.equal(current.weather.spot.lon,moved.lon);assert.equal(h.calls(),0);
});

test('a wind bundle for the previous coordinates falls back to a request at the new point',async()=>{
  const h=harness(),moved={...spot,lat:54.34652508378602,lon:18.91065779954801,requireWindGeometry:true};
  h.setWind({schema:1,spotId:spot.id,spot:{...spot},fetchedAt:h.now(),data:{hourly:{time:[h.now()/1000]}}});
  const current=await h.api.forecasts(moved,false,{coastalOnly:true});
  assert.equal(current.weather.sourceType,'direct');
  const request=new URL(h.requests.find(url=>url.startsWith('https://api.open-meteo.com/')));
  assert.equal(request.searchParams.get('latitude'),String(moved.lat));assert.equal(request.searchParams.get('longitude'),String(moved.lon));
  assert.equal(h.calls(),1);
});

test('rate limit produces a useful error and never invented values', async () => {
  const h = harness(); h.mode('rate-limit');
  const result = await h.api.forecasts(spot);
  assert.equal(result.marine, null);
  assert.match(result.errors[0], /Limit zapytań/);
});

test('land elevation is not converted into water depth; missing profile can be retried', async () => {
  const h = harness(); h.mode('land');
  const land = await h.api.bathymetry(spot);
  assert.equal(land.complete, false);
  assert.ok(land.samples.every(p => p.depth === null));
  h.advance(601); h.mode('ok');
  const water = await h.api.bathymetry(spot);
  assert.equal(water.complete, true);
  assert.ok(water.samples.every(p => p.depth === 10));
});

test('spot conditions request sea temperature, air, clouds and sun for the chosen coordinates without reusing wind-only data', async () => {
  const h = harness();
  await h.api.forecasts(spot, false, { coastalOnly: true });
  const result = await h.api.conditions(spot);
  assert.equal(h.calls(), 3);
  assert.equal(result.weather.data.hourly.temperature_2m[0], 11.2);
  assert.equal(result.weather.data.hourly.cloud_cover[0], 0);
  assert.equal(result.weather.data.hourly.weather_code[0], 0);
  assert.ok(result.weather.data.daily.sunrise[0]);
  assert.equal(result.sea.data.hourly.sea_surface_temperature[0], 13);
  const urls = h.requests.filter(url => url.includes('daily=') || url.includes('sea_surface_temperature')).map(url => new URL(url));
  assert.equal(urls.length, 2);
  for (const { searchParams: params } of urls) {
    assert.equal(params.get('latitude'), String(spot.lat));
    assert.equal(params.get('longitude'), String(spot.lon));
    assert.equal(params.get('timezone'), 'Europe/Warsaw');
    assert.equal(params.get('timeformat'), 'unixtime');
    assert.equal(params.get('forecast_days'), '16');
    assert.equal(params.get('past_days'), '1');
  }
  assert.equal(urls[0].searchParams.get('daily'), 'sunrise,sunset');
  assert.equal(urls[0].searchParams.get('hourly'), 'temperature_2m,cloud_cover,weather_code');
  assert.equal(urls[0].searchParams.get('temperature_unit'), 'celsius');
  assert.equal(urls[1].searchParams.get('hourly'), 'sea_surface_temperature');
  assert.equal(urls[1].searchParams.get('cell_selection'), 'sea');
  assert.equal(urls[1].searchParams.has('models'), false, 'wave-only models must not be selected for SST');
});

test('old temperature-only cache cannot suppress fetching the new weather-code field', async () => {
  const h = harness();
  h.storage.set(`nad-morzem:surf-v2:conditions-weather-v1-${spot.id}:${spot.lat}:${spot.lon}:${spot.normal}`,
    JSON.stringify({fetchedAt:Date.UTC(2026,9,20,12),data:{hourly:{time:[Date.UTC(2026,9,20,12)/1000],temperature_2m:[99]}}}));
  const result = await h.api.conditions(spot);
  assert.equal(h.calls(),2);
  assert.equal(result.weather.data.hourly.weather_code[0],0);
  assert.equal(result.weather.data.hourly.temperature_2m[0],11.2);
});

test('conditions are deduplicated, cached per spot geometry and respect the manual refresh minimum interval', async () => {
  const h = harness();
  await Promise.all([h.api.conditions(spot), h.api.conditions(spot)]);
  await h.api.conditions(spot, true);
  assert.equal(h.calls(), 2);
  h.advance(61);
  await h.api.conditions(spot, true);
  assert.equal(h.calls(), 4);
  await h.api.conditions({ ...spot, lon: spot.lon + .1 });
  assert.equal(h.calls(), 6);
  await h.api.conditions(spot);
  assert.equal(h.calls(), 6);
});

test('sea temperature and weather fail independently, leaving the other source usable', async () => {
  const weatherDown = harness(); weatherDown.mode('weather-down');
  const sea = await weatherDown.api.conditions(spot);
  assert.equal(sea.weather, null);
  assert.ok(sea.sea);
  assert.match(sea.errors[0], /Pogoda i słońce/);
  const seaDown = harness(); seaDown.mode('sea-down');
  const weather = await seaDown.api.conditions(spot);
  assert.equal(weather.sea, null);
  assert.ok(weather.weather.data.daily.sunrise.length);
  assert.match(weather.errors[0], /Temperatura wody/);
});

test('conditions preserve cache age on failure and stop serving stale temperatures after six hours', async () => {
  const h = harness();
  const original = await h.api.conditions(spot);
  h.advance(1900); h.mode('offline');
  const cached = await h.api.conditions(spot);
  for (const source of ['weather', 'sea']) {
    assert.equal(cached[source].stale, true);
    assert.equal(cached[source].fetchedAt, original[source].fetchedAt);
  }
  h.advance(21600);
  const expired = await h.api.conditions(spot);
  assert.equal(expired.weather, null);
  assert.equal(expired.sea, null);
  assert.equal(expired.errors.length, 2);
});

test('errors reach the page only in Polish, whatever the browser or the provider reports', async () => {
  for (const [mode, text] of [['network', /^Brak połączenia z serwerem/], ['offline', /^Brak połączenia z serwerem/],
    ['timeout', /^Serwer nie odpowiedział na czas/], ['bad-json', /^Nieprawidłowa odpowiedź dostawcy/],
    ['provider-error', /^Nieprawidłowa odpowiedź dostawcy/], ['broken', /^Nie udało się pobrać danych/]]) {
    const h = harness(); h.mode(mode);
    const conditions = await h.api.conditions(spot), forecast = await h.api.forecasts(spot);
    assert.equal(conditions.errors.length, 2, mode); assert.equal(forecast.errors.length, 2, mode);
    for (const error of forecast.errors) assert.match(error, text, mode);
    // After a label ("Pogoda i słońce: …") the same sentence continues in lower case.
    for (const error of conditions.errors) assert.match(error.split(': ')[1], new RegExp(text.source.toLowerCase()), mode);
    for (const error of [...conditions.errors, ...forecast.errors]) assert.doesNotMatch(error, /Failed|aborted|Unexpected|Cannot|offline|null/, mode);
  }
});

test('a failed wave load keeps its Polish reason for the collapsed details', async () => {
  const h = harness();
  const waves = await h.api.nearshore(spot);
  assert.equal(waves.status, 'unavailable'); assert.equal(waves.loadFailed, true);
  assert.equal(waves.error, 'Dostawca zwrócił HTTP 404.');
  assert.equal(h.api.errorText(new TypeError('Failed to fetch')), 'Nie udało się pobrać danych.');
  assert.equal(h.api.errorText(h.api.polishError('Brak połączenia z serwerem — sprawdź internet.')), 'Brak połączenia z serwerem — sprawdź internet.');
});

test('the ranking reads one coast file for every spot and keeps its slim waves away from the spot page', async () => {
  const h = harness(), other = { id: 'other', lat: 54.5, lon: 18.6, normal: 10 };
  const wind = id => ({ schema: 1, spotId: id, fetchedAt: h.now(), data: { hourly: { time: [h.now() / 1000] } } });
  const waves = id => ({ schema: 2, status: 'unavailable', spot: { id }, error: 'Oczekiwanie na obliczenia SWAN.' });
  h.setCoast({ schema: 1, spots: { test: { wind: wind('test'), nearshore: waves('test') }, other: { wind: wind('other'), nearshore: waves('other') } } });
  await h.api.coast();
  const [first, second] = await Promise.all([h.api.coastal(spot), h.api.coastal(other)]);
  assert.equal(first[0].weather.spotId, 'test'); assert.equal(second[0].weather.spotId, 'other');
  assert.equal(first[1].error, 'Oczekiwanie na obliczenia SWAN.');
  assert.equal(h.requests.filter(url => url.startsWith('data/')).length, 1, 'one request for the whole coast');
  assert.equal([...h.storage.keys()].some(key => key.includes('scheduled-wind')), false, 'no offline copies of the whole coast');
  await h.api.nearshore(spot);
  assert.ok(h.requests.some(url => url.startsWith('data/nearshore/test.json')), 'the spot page still asks for its full waves');
});

test('without the coast file each spot falls back to its own two files', async () => {
  const h = harness(); h.mode('local-published');
  const [forecast, waves] = await h.api.coastal(spot);
  assert.equal(forecast.weather.sourceType, 'local');
  assert.equal(waves.loadFailed, true);
  for (const file of ['data/coast.json', 'data/wind/test.json', 'data/nearshore/test.json'])
    assert.ok(h.requests.some(url => url.startsWith(file)), file);
});
