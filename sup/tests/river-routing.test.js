import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { RiverNetwork, riversAtPoint } from '../src/river-routing.js';
import { distanceKm, geometryEndpoints, geometryLength, parseBackup, reconcileCatalogTrips, validateTrip } from '../src/core.js';
import { mergeJournals } from '../src/sync-core.js';

test('personal route retains every bend, projects endpoints onto water and works in reverse', () => {
  const line = [[18, 54], [18.002, 54], [18.002, 54.002], [18.004, 54.002], [18.004, 54], [18.006, 54]];
  const network = new RiverNetwork([line]);
  const from = [18.001, 53.9999], to = [18.005, 53.9999];
  const result = network.route(from, to);
  assert.deepEqual(result.geometry.coordinates, [[18.001, 54], ...line.slice(1, -1), [18.005, 54]]);
  assert.ok(result.distanceKm > distanceKm(from, to) * 2);
  assert.deepEqual(network.route(to, from).geometry.coordinates, [...result.geometry.coordinates].reverse());
  assert.deepEqual(network.route(from, to).geometry, result.geometry, 'Routing must not accumulate endpoint nodes');
});

test('endpoints on one sparse edge use the clipped edge, without a trip to its original ends', () => {
  const network = new RiverNetwork([[[18, 54], [18.1, 54]]]);
  const a = [18.025, 54], b = [18.035, 54];
  assert.deepEqual(network.route(a, b).geometry.coordinates, [a, b]);
  assert.deepEqual(network.route(b, a).geometry.coordinates, [b, a]);
});

test('shuffled and reversed river pieces are connected at shared vertices', () => {
  const a = [18, 54], b = [18.01, 54.01], c = [18.02, 54], d = [18.03, 54.01];
  const network = new RiverNetwork([[d, c], [b, a], [c, b]]);
  assert.deepEqual(network.route(a, d).geometry.coordinates, [a, b, c, d]);
});

test('a clipped catalogue endpoint connects to the interior of an existing water edge', () => {
  const network = new RiverNetwork([[[18, 54], [18.01, 54]], [[18.005, 54], [18.005, 54.01]]]);
  const result = network.route([18.005, 54.01], [18.005, 54]);
  assert.equal(result.geometry.coordinates.length, 2);
  assert.ok(Math.abs(result.distanceKm - distanceKm([18.005, 54.01], [18.005, 54])) < .00001);
  const partial = network.route([18.003, 54], [18.005, 54.005]);
  assert.deepEqual(partial.geometry.coordinates, [[18.003, 54], [18.005, 54], [18.005, 54.005]], 'Clipped endpoints must not detour to the far end of an unsplit edge');
});

test('missing water, remote endpoints and identical endpoints never create a straight fallback', () => {
  const network = new RiverNetwork([[[18, 54], [18.01, 54]], [[18.0101, 54], [18.02, 54]]]);
  assert.throws(() => network.route([18, 54], [18.02, 54]), /ciągłego połączenia/);
  assert.throws(() => network.route([18, 55], [18.01, 54]), /zbyt daleko/);
  assert.throws(() => network.route([18, 54], [18, 54]), /tym samym miejscu/);
  assert.equal(network.snap([NaN, 54]), null);
});

test('nearby parallel river branches stay disconnected', () => {
  const network = new RiverNetwork([[[18, 54], [18.01, 54]], [[18, 54.0001], [18.01, 54.0001]]]);
  assert.throws(() => network.route([18.002, 54], [18.008, 54.0001]), /ciągłego połączenia/);
});

const networkData = JSON.parse(await readFile(new URL('../data/river-network.json', import.meta.url)));
const atlas = JSON.parse(await readFile(new URL('../data/route-map.geojson', import.meta.url)));
test('Ostrzyce to Trątkownica follows the full Radunia to the bridge landing, including the meanders', () => {
  const river = networkData.rivers.find(r => r.name === 'Radunia');
  const from = river.sites.find(s => s.id === 'osm:way:173524480').coordinates;
  const to = river.sites.find(s => s.id === 'osm:node:11100021655').coordinates;
  const network = new RiverNetwork(river.lines), result = network.route(from, to);
  assert.ok(result.distanceKm > 14 && result.distanceKm < 14.6);
  assert.ok(result.geometry.coordinates.length > 500);
  assert.ok(result.distanceKm > distanceKm(from, to) * 1.4);
  for (let i = 1; i < result.geometry.coordinates.length; i++) {
    assert.ok(distanceKm(result.geometry.coordinates[i - 1], result.geometry.coordinates[i]) < .4, 'No long straight connector in place of the river');
  }
  assert.deepEqual(network.route(to, from).geometry.coordinates, [...result.geometry.coordinates].reverse());
  assert.equal(riversAtPoint(networkData.rivers, from)[0].river.name, 'Radunia');
  assert.equal(riversAtPoint(networkData.rivers, to)[0].river.name, 'Radunia');
});

test('automatic river lookup respects the snap radius and exposes ambiguous waterways', () => {
  const rivers = [
    { name: 'Pierwsza', lines: [[[18, 54], [18.01, 54]]] },
    { name: 'Druga', lines: [[[18, 54.0001], [18.01, 54.0001]]] }
  ];
  assert.deepEqual(riversAtPoint(rivers, [19, 53]), []);
  assert.deepEqual(riversAtPoint(rivers, [NaN, 54]), []);
  const matches = riversAtPoint(rivers, [18.005, 54]);
  assert.equal(matches.length, 2);
  assert.equal(matches[0].river.name, 'Pierwsza');
  assert.ok(matches[1].distanceKm < .02);
});

test('real Wda and Krutynia endpoints produce curved routes of the expected length', () => {
  for (const [river, id] of [['Wda', 'wda-osowo-wdecki-mlyn'], ['Krutynia', 'krutynia-krutyn-ukta']]) {
    const feature = atlas.features.find(f => f.properties.id === id);
    const network = new RiverNetwork(networkData.rivers.find(r => r.name === river).lines);
    const result = network.route(...geometryEndpoints(feature.geometry));
    assert.ok(result.geometry.coordinates.length > 100, river);
    assert.ok(Math.abs(result.distanceKm - geometryLength(feature.geometry)) < .2, river);
    assert.ok(result.distanceKm > distanceKm(...geometryEndpoints(feature.geometry)) * 1.2, river);
  }
});

test('personal river metadata and measured geometry survive backups, sync and catalogue refreshes', () => {
  const geometry = { type: 'LineString', coordinates: [[18, 54], [18.01, 54.01], [18.02, 54]] };
  const trip = validateTrip({ id: 'my-river', name: 'Moja Wda', date: '2026-07-12', notes: '', waterType: 'river', geometry, distanceKm: 99, distanceEstimated: true, geometryKind: 'river-route', sourceRouteId: null, riverRoute: { river: 'Wda', fromName: 'Mój start', toName: 'Moja meta' } });
  assert.equal(trip.distanceKm, geometryLength(geometry));
  assert.ok(!trip.distanceEstimated);
  assert.deepEqual(parseBackup(JSON.stringify({ version: 1, trips: [trip] })), [trip]);
  assert.deepEqual(mergeJournals([trip], {}, []).trips, [trip]);
  assert.deepEqual(reconcileCatalogTrips([trip], new Map(atlas.features.map(f => [f.properties.id, f]))).trips, [trip]);
  assert.throws(() => validateTrip({ ...trip, riverRoute: null }));
  assert.throws(() => validateTrip({ ...trip, riverRoute: { ...trip.riverRoute, fromName: '' } }));
  assert.throws(() => validateTrip({ ...trip, sourceRouteId: 'wda-osowo-wdecki-mlyn' }));
});
