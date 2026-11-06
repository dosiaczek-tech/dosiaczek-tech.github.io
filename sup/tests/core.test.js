import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { filterRoutes, geometryLength, validateGeometry, validateTrip, parseBackup, loadTrips, saveTrips, mergeTrips, STORAGE_KEY, routeColor, kilometerMarks, distanceKm, LEVELS, linesOfGeometry, WATER_GEOMETRY_KINDS, geometryEndpoints, reconcileCatalogTrips } from '../src/core.js';

const fixture = () => ({ id: 'trip-1', name: 'Moja wyprawa', date: '2026-07-12', waterType: 'river', notes: 'Dobra woda', distanceKm: 5, geometryKind: 'drawn', sourceRouteId: null, geometry: { type: 'LineString', coordinates: [[21, 53], [21.01, 53], [21.02, 53.01]] } });
const dataset = JSON.parse(await readFile(new URL('../data/routes.json', import.meta.url)));
const geojson = JSON.parse(await readFile(new URL('../data/route-map.geojson', import.meta.url)));

test('distance follows coordinates and does not bridge gaps in GPX segments', () => {
  assert.ok(Math.abs(geometryLength({ type: 'LineString', coordinates: [[0, 0], [1, 0]] }) - 111.195) < .01);
  const multi = { type: 'MultiLineString', coordinates: [[[21, 53], [21.01, 53]], [[23, 54], [23.01, 54]]] };
  assert.ok(geometryLength(multi) < 1.4);
  assert.ok(geometryLength(multi) > 1.3);
});

test('routes can be searched without Polish accents and filters combine', () => {
  const found = filterRoutes(dataset.routes, { search: 'mala kamienica tuchomie', difficulty: 'advanced', obstacles: 'many', type: 'river' });
  assert.deepEqual(found.map(r => r.id), ['kamienica-tuchomie-galaznia']);
  assert.equal(filterRoutes(dataset.routes, { search: 'lodzkie', difficulty: 'easy' })[0].river, 'Pilica');
  assert.equal(filterRoutes(dataset.routes, { search: 'Krutynia', obstacles: 'many' }).length, 0);
});

test('invalid, empty, repeated and non-finite route coordinates are rejected', () => {
  for (const coordinates of [[], [[21, 53]], [[21, 53], [21, 53]], [[21, 53], [NaN, 53]], [[21, 53], [181, 53]], [[21, 53], ['22', 53]], [[21, 53], [22, 91]]]) {
    assert.throws(() => validateGeometry({ type: 'LineString', coordinates }));
  }
  assert.throws(() => validateGeometry({ type: 'Polygon', coordinates: [] }));
});

test('backup validates dates, metadata and geometry before accepting any trip', () => {
  const trip = fixture();
  for (const patch of [{ name: '' }, { date: '2026-02-30' }, { waterType: 'unknown' }, { distanceKm: Infinity }, { notes: 'a'.repeat(3001) }, { sourceRouteId: {} }]) {
    assert.throws(() => validateTrip({ ...trip, ...patch }));
  }
  assert.throws(() => parseBackup(JSON.stringify({ version: 2, trips: [] })));
  assert.throws(() => parseBackup(JSON.stringify({ version: 1, trips: [trip, trip] })));
  assert.throws(() => parseBackup(JSON.stringify({ version: 1, trips: [trip, { ...trip, id: 'bad', geometry: null }] })));
  assert.throws(() => parseBackup('bad JSON'));
});

test('drawn distances are recomputed, catalogue distances remain sourced', () => {
  const trip = fixture();
  assert.equal(validateTrip(trip).distanceKm, geometryLength(trip.geometry));
  assert.equal(validateTrip({ ...trip, geometryKind: 'osm-waterway', distanceKm: 13.5 }).distanceKm, 13.5);
  assert.equal(validateTrip({ ...trip, geometryKind: 'schematic', distanceKm: 29 }).distanceKm, 29);
});

test('storage round-trips trips in the SUP namespace without changing other apps', () => {
  const data = new Map([['other-app:settings', 'untouched']]);
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  assert.deepEqual(loadTrips(storage), []);
  const clean = saveTrips(storage, [fixture()]);
  assert.deepEqual(loadTrips(storage), clean);
  assert.equal(data.get('other-app:settings'), 'untouched');
  assert.equal(data.size, 2);
  assert.ok(data.has(STORAGE_KEY));
});

test('corrupted storage is not silently replaced and write failures propagate', () => {
  const storage = { getItem: () => 'broken', setItem: () => { throw new Error('quota'); } };
  assert.throws(() => loadTrips(storage));
  assert.throws(() => saveTrips(storage, [fixture()]), /quota/);
});

test('importing a backup keeps local edits and only adds new IDs', () => {
  const existing = [{ ...fixture(), notes: 'Newer local edit' }];
  const incoming = [fixture(), { ...fixture(), id: 'trip-2' }];
  const merged = mergeTrips(existing, incoming);
  assert.equal(merged.length, 2);
  assert.equal(merged[0].notes, 'Newer local edit');
  assert.equal(mergeTrips(merged, incoming).length, 2);
});

test('every catalogue entry has a real source and a uniquely matching map feature in Poland', () => {
  assert.equal(dataset.routes.length, 117);
  assert.equal(new Set(dataset.routes.map(r => r.id)).size, dataset.routes.length);
  assert.equal(new Set(geojson.features.map(f => f.properties.id)).size, dataset.routes.length);
  for (const route of dataset.routes) {
    assert.equal(new URL(route.source.url).protocol, 'https:');
    assert.ok(route.sourceDifficulty && route.supNote && route.portages && route.obstacleNote);
    assert.ok(LEVELS[route.difficulty], `Nieobsługiwana ocena: ${route.id}`);
    assert.ok(route.lengthKm > 0);
    const feature = geojson.features.find(f => f.properties.id === route.id);
    validateGeometry(feature.geometry);
    assert.ok(feature.properties.note.length > 50);
    for (const [lon, lat] of linesOfGeometry(feature.geometry).flat()) assert.ok(lon > 14 && lon < 24.5 && lat > 49 && lat < 55, `Poza Polską: ${route.id}`);
    assert.ok(WATER_GEOMETRY_KINDS.includes(feature.properties.kind));
    assert.ok(feature.properties.osmObjects.length || feature.properties.waterAreas.length);
    assert.ok(Math.abs(geometryLength(feature.geometry) - feature.properties.measuredKm) < .01);
    assert.ok(!route.map.schematic);
  }
  assert.ok(geojson.features.filter(f => f.properties.kind === 'osm-waterway').length >= 60);
});

test('the expanded collection cites all three requested sources and keeps variants distinct', () => {
  const domains = new Set(dataset.routes.flatMap(route => [route.source, ...(route.additionalSources ?? [])]).map(source => new URL(source.url).hostname));
  for (const domain of ['kaszubypolnocne.pl', 'www.ekajaki.pl', 'www.kajaki.hydrostacja.pl']) assert.ok(domains.has(domain));
  const tuples = dataset.routes.map(r => `${r.river}|${r.from}|${r.to}`);
  assert.equal(new Set(tuples).size, tuples.length);
  const regional = filterRoutes(dataset.routes, { area: 'pomorze' });
  assert.ok(regional.length >= 80);
  assert.ok(!regional.some(r => r.id === 'pilica-tomaszow-spala'));
  const multi = filterRoutes(dataset.routes, { area: 'pomorze', tripKind: 'multi' });
  assert.ok(multi.length >= 20);
  assert.ok(multi.every(r => r.sourceDuration && /dni/.test(r.sourceDuration)));
  assert.match(dataset.routes.find(r => r.id === 'radunia-stezyca-gdansk').accessNote, /Jaru? Raduni/);
  assert.equal(geojson.features.find(f => f.properties.id === 'radunia-stezyca-gdansk').geometry.type, 'MultiLineString');
});

test('regional geocoding distinguishes homonymous places and uses the river mouth on Piaśnica', () => {
  const feature = geojson.features.find(f => f.properties.id === 'kolko-radunskie-stezyca-golubie');
  const chmielno = feature.properties.places.find(p => p.name === 'Chmielno');
  assert.ok(distanceKm(chmielno.coordinates, [18.1015, 54.3285]) < 1);
  const piasnica = geojson.features.find(f => f.properties.id === 'piasnica-zarnowieckie-debki');
  assert.equal(piasnica.properties.kind, 'osm-waterway');
  assert.ok(geometryLength(piasnica.geometry) > 5.8);
  assert.ok(geometryLength(piasnica.geometry) < 7);
  for (const id of ['wda-osowo-wdecki-mlyn', 'wda-gorskie-mosty-hydrostacja']) {
    const mapped = geojson.features.find(f => f.properties.id === id);
    assert.equal(mapped.properties.kind, 'osm-waterway');
    assert.ok(mapped.geometry.coordinates.length > 100);
  }
});

test('each route has a distinct stable colour independent of sorting and filtering', () => {
  const original = new Map(dataset.routes.map(r => [r.id, routeColor(r.id)]));
  assert.equal(new Set(original.values()).size, dataset.routes.length);
  for (const r of filterRoutes(dataset.routes, { search: 'Wda', sort: 'longest' })) assert.equal(routeColor(r.id), original.get(r.id));
});

test('kilometre labels are interpolated along curves and exclude gaps between segments', () => {
  const origin = [21, 53];
  const line = { type: 'LineString', coordinates: [origin, [21.03, 53], [21.03, 53.03]] };
  const marks = kilometerMarks(line);
  assert.equal(marks.length, Math.floor(geometryLength(line)));
  assert.ok(Math.abs(distanceKm(origin, marks[0].coordinates) - 1) < .001);
  assert.equal(marks[3].coordinates[0], 21.03);
  const separate = { type: 'MultiLineString', coordinates: [[[21, 53], [21.01, 53]], [[23, 54], [23.01, 54]]] };
  assert.equal(kilometerMarks(separate).length, 1);
  assert.ok(kilometerMarks(separate)[0].coordinates[0] > 23);
  assert.throws(() => kilometerMarks(line, 0));
});

test('Kajakodajnia covers both route lists, all six descriptions and the extra named variant', () => {
  const collection = dataset.routes.filter(route => route.collection === 'kajakodajnia-wierzyca');
  assert.equal(collection.length, 23);
  assert.equal(filterRoutes(dataset.routes, { search: 'Kajakodajnia' }).length, 23);
  const expectedReferences = [
    ...Array.from({ length: 11 }, (_, i) => `obsługiwane-${i + 1}`),
    ...Array.from({ length: 14 }, (_, i) => `odcinki-${i + 1}`),
    'opis-maliki-czarnocin', 'opis-czarnocin-kregski', 'opis-kregski-owidz',
    'opis-owidz-kolincki', 'opis-klonowka-pelplin', 'opis-pelplin-gniew', 'wariant-stocki-brody'
  ];
  const references = collection.flatMap(route => route.sourceReferences);
  assert.deepEqual(references.toSorted(), expectedReferences.toSorted());
  for (const route of collection) {
    assert.equal(route.river, 'Wierzyca');
    assert.equal(route.source.url, 'https://www.kajakodajnia.pl/wierzyca-opis.html');
    assert.equal(route.accessedAt, '2026-10-23');
    assert.ok(geojson.features.some(feature => feature.properties.id === route.id));
  }
  assert.ok(filterRoutes(collection, { search: 'Krąg Starogard' }).some(r => r.id === 'wierzyca-kregski-mlyn-starogard'));
  assert.ok(filterRoutes(collection, { search: 'Kolincz Rajkowski' }).some(r => r.id === 'wierzyca-kolincki-rajkowski-mlyn'));
  assert.equal(collection.filter(r => r.difficulty === 'unknown').length, 3);
  assert.equal(collection.filter(r => r.lengthEstimated).length, 1);
  assert.match(collection.find(r => r.id === 'wierzyca-owidz-kolincki-mlyn').lengthNote, /14.*16/);
});

test('Żabno preserves its river course and return leg despite the different published length', () => {
  const route = dataset.routes.find(r => r.id === 'wierzyca-kregski-mlyn-zabno');
  assert.equal(route.map.followWaypoints, true);
  const feature = geojson.features.find(f => f.properties.id === route.id);
  assert.equal(feature.properties.kind, 'osm-waterway');
  const points = feature.geometry.coordinates;
  const endpoint = JSON.stringify(points.at(-1));
  const firstArrival = points.findIndex(point => JSON.stringify(point) === endpoint);
  assert.ok(firstArrival >= 0 && firstArrival < points.length - 1, 'Powrót musi ponownie osiągać wcześniej miniętą przystań.');
  const directLength = geometryLength({ type: 'LineString', coordinates: points.slice(0, firstArrival + 1) });
  assert.ok(geometryLength(feature.geometry) - directLength > .3, 'Powrót nie może zniknąć z pomiaru.');
  const turnaround = route.map.places.find(place => place.name.includes('punkt zwrotu'));
  assert.ok(points.some(point => distanceKm(point, turnaround.coordinates) < .15));
});

test('estimated catalogue distance survives backup and legacy trips retain their schema', () => {
  const sourceTrip = { ...fixture(), geometryKind: 'osm-waterway', sourceRouteId: 'wierzyca-stocki-mlyn-brody', distanceKm: 9, distanceEstimated: true };
  const [restored] = parseBackup(JSON.stringify({ version: 1, trips: [sourceTrip] }));
  assert.equal(restored.distanceEstimated, true);
  assert.equal(restored.distanceKm, 9);
  const legacy = { ...sourceTrip }; delete legacy.distanceEstimated;
  assert.ok(!Object.hasOwn(validateTrip(legacy), 'distanceEstimated'));
  assert.ok(!Object.hasOwn(validateTrip({ ...sourceTrip, geometryKind: 'drawn' }), 'distanceEstimated'));
  assert.throws(() => validateTrip({ ...sourceTrip, distanceEstimated: 'yes' }));
});

test('catalogue geometry upgrades retain diary facts and never replace personal GPX or drawings', () => {
  const features = new Map(geojson.features.map(f => [f.properties.id, f]));
  const old = { ...fixture(), id: 'old-radunia', sourceRouteId: 'radunia-stezyca-gdansk', geometryKind: 'schematic', distanceKm: 97, notes: 'Moje wspomnienie' };
  const personal = { ...old, id: 'personal', geometryKind: 'drawn' };
  const gpx = { ...old, id: 'gpx', geometryKind: 'gpx' };
  const update = reconcileCatalogTrips([old, personal, gpx], features);
  assert.equal(update.changed, true);
  assert.equal(update.trips[0].geometry.type, 'MultiLineString');
  assert.equal(update.trips[0].distanceKm, 97);
  assert.equal(update.trips[0].notes, old.notes);
  assert.equal(update.trips[0].date, old.date);
  assert.equal(old.geometry.type, 'LineString');
  assert.deepEqual(update.trips[1], personal);
  assert.deepEqual(update.trips[2], gpx);
  assert.equal(reconcileCatalogTrips(update.trips, features).changed, false);
  const endpoints = geometryEndpoints(update.trips[0].geometry);
  assert.equal(endpoints.length, 2);
  assert.ok(endpoints.every(point => point.length === 2 && point.every(Number.isFinite)));
});
