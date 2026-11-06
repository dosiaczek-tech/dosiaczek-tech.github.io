import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { locateAccess, nearestAccessPosition, sliceWaterGeometry, sectionBetween, geometryKey } from '../src/access.js';
import { geometryLength, geometryEndpoints, validateTrip, parseBackup, reconcileCatalogTrips, linesOfGeometry, distanceKm } from '../src/core.js';
import { recoverPlusCode } from '../tools/plus-code.mjs';

test('published short location codes recover the facility cell near the named town', () => {
  assert.deepEqual(recoverPlusCode('JCPQ+QG', [18.439, 54.637]), [18.4388125, 54.6369375]);
  const podleś = recoverPlusCode('32FH+F6', [18.028, 54.074]);
  assert.ok(distanceKm(podleś, [18.0280799, 54.0736274]) < .015);
  assert.throws(() => recoverPlusCode('4WWF+83'), /odniesienia/);
  assert.throws(() => recoverPlusCode('not-a-code', [18, 54]), /Nieobsługiwany/);
});

test('a short section interpolates along water edges and never connects separate water legs', () => {
  const geometry = { type: 'MultiLineString', coordinates: [[[18, 54], [18.01, 54], [18.01, 54.01]], [[18.05, 54.01], [18.06, 54.01]]] };
  const from = locateAccess([18.005, 54], geometry, .01)[0], to = locateAccess([18.055, 54.01], geometry, .01)[0];
  const section = sliceWaterGeometry(geometry, from, to);
  assert.equal(section.type, 'MultiLineString');
  assert.deepEqual(geometryEndpoints(section), [[18.005, 54], [18.055, 54.01]]);
  assert.ok(geometryLength(section) < 2);
  assert.throws(() => sliceWaterGeometry(geometry, to, from), /Meta/);
});

test('outbound and return visits to the same launch stay separate, even on a short loop', () => {
  const geometry = { type: 'LineString', coordinates: [[18, 54], [18.002, 54], [18, 54]] };
  const visits = locateAccess([18, 54], geometry, .15);
  assert.equal(visits.length, 2);
  const section = sliceWaterGeometry(geometry, visits[0], visits[1]);
  assert.ok(geometryLength(section) > .25);
  assert.deepEqual(geometryEndpoints(section)[0], geometryEndpoints(section)[1]);
});

test('saved variants round-trip through a backup, measure their own line and survive catalogue migration', () => {
  const geometry = { type: 'LineString', coordinates: [[18, 54], [18.01, 54]] };
  const sourceSection = { startSiteId: 'a', endSiteId: 'b', startOccurrenceId: 'a@0', endOccurrenceId: 'b@0', fromName: 'Przystań A', toName: 'Przystań B' };
  const trip = validateTrip({ id: 'short-trip', name: 'Krótki poranek', date: '2026-07-12', notes: 'Moje notatki', waterType: 'river', sourceRouteId: 'full-route', geometryKind: 'water-route', distanceKm: 97, distanceEstimated: true, sourceSection, geometry });
  assert.equal(trip.distanceKm, geometryLength(geometry));
  assert.equal(trip.distanceEstimated, undefined);
  const backup = parseBackup(JSON.stringify({ version: 1, trips: [trip] }));
  assert.deepEqual(backup[0].sourceSection, sourceSection);
  const full = { properties: { kind: 'water-route' }, geometry: { type: 'LineString', coordinates: [[18, 54], [19, 54]] } };
  assert.deepEqual(reconcileCatalogTrips(backup, new Map([['full-route', full]])), { trips: backup, changed: false });
  assert.throws(() => validateTrip({ ...trip, sourceSection: { ...sourceSection, fromName: 42 } }), /wodowania/);
  assert.throws(() => validateTrip({ ...trip, geometryKind: 'drawn' }), /powiązanie/);
});

const data = JSON.parse(await readFile(new URL('../data/access-points.json', import.meta.url)));
const map = JSON.parse(await readFile(new URL('../data/route-map.geojson', import.meta.url)));
const sites = new Map(data.sites.map(site => [site.id, site]));

test('published access points have evidence and every occurrence lies on its water segment', () => {
  assert.equal(sites.size, data.sites.length);
  assert.ok(sites.size > 50);
  for (const site of sites.values()) {
    assert.equal(site.coordinates.length, 2);
    assert.ok(site.coordinates.every(Number.isFinite));
    assert.ok(site.sources.length > 0);
    assert.ok(site.sources.every(source => /^https?:\/\//.test(source.url) && /^\d{4}-\d{2}-\d{2}$/.test(source.accessedAt)));
    assert.ok(site.conditions && site.landAccess);
    if (['restricted', 'planned'].includes(site.status)) assert.equal(site.selectable, false);
    if (site.coordinateAccuracy === 'approximate') assert.ok(site.coordinateMethod, `${site.id}: approximate location needs its method`);
  }
  assert.equal(Object.keys(data.routes).length, map.features.length);
  for (const feature of map.features) {
    const record = data.routes[feature.properties.id];
    assert.equal(record.geometryKey, geometryKey(feature.geometry));
    assert.equal(new Set(record.occurrences.map(item => item.id)).size, record.occurrences.length);
    for (const occurrence of record.occurrences) {
      const { position } = occurrence, site = sites.get(occurrence.siteId);
      assert.ok(site, occurrence.siteId);
      const line = linesOfGeometry(feature.geometry)[position.line], a = line[position.edge], b = line[position.edge + 1];
      const expected = [a[0] + (b[0] - a[0]) * position.t, a[1] + (b[1] - a[1]) * position.t];
      assert.ok(distanceKm(expected, position.coordinates) < .000001);
      assert.ok(distanceKm(site.coordinates, position.coordinates) <= .150001);
    }
    const endpoints = geometryEndpoints(feature.geometry);
    for (const [index, key] of ['launchStart', 'launchFinish'].entries()) {
      const id = feature.properties[key]; if (!id) continue;
      assert.ok(sites.get(id)?.selectable, `${feature.properties.id}: ${key}`);
      assert.ok(distanceKm(sites.get(id).coordinates, endpoints[index]) <= .15, `${feature.properties.id}: endpoint too far from its launch`);
    }
  }
});

test('all catalogue endpoints and transfer sides have access, while data gaps remain explicitly unresolved', () => {
  assert.equal(map.features.length, 117);
  for (const feature of map.features) {
    const record = data.routes[feature.properties.id];
    assert.ok(record.anchored && record.start && record.finish, feature.properties.id);
    for (const leg of record.legs) for (const role of ['start', 'finish']) {
      if (leg[role]) assert.ok(record.occurrences.some(item => item.id === leg[role] && item.position.line === leg.index && sites.get(item.siteId).selectable));
      else assert.equal(leg[`${role}Break`], 'missing-data', `${feature.properties.id}: missing ${role} at an actual transfer`);
    }
  }
  const radunia = map.features.find(feature => feature.properties.id === 'radunia-stezyca-gdansk');
  assert.equal(radunia.properties.accessLegs[1].finish, 'operator-track:394606:finish');
  const slupia = data.routes['slupia-galaznia-krzynia'];
  assert.ok(slupia.legs[0].finish.startsWith('guide:konradowo-before@'));
  assert.ok(slupia.legs[1].start.startsWith('guide:konradowo-after@'));
});

test('Męcikał uses the documented upstream Brda landing rather than the campsite on a different lake', () => {
  const site = sites.get('psk:mecikal-lesna');
  assert.equal(site.coordinateAccuracy, 'approximate');
  assert.equal(site.coordinateReference.targetRiverKm, 142.4);
  assert.equal(site.coordinateReference.riverKm, 141.9);
  const brda = map.features.find(feature => feature.properties.id === 'brda-nowa-brda-gostycyn');
  const bridge = nearestAccessPosition(site.coordinateReference.coordinates, brda.geometry);
  const landing = nearestAccessPosition(site.coordinates, brda.geometry);
  assert.equal(landing.line, bridge.line);
  assert.ok(Math.abs(bridge.km - landing.km - .5) < .005, 'the landing is 500 m upstream of DW235');
  assert.ok(distanceKm(site.coordinates, [17.6843865, 53.8189712]) > .8, 'do not reuse the Trzemeszno campsite');
  for (const id of ['brda-swornegacie-mecikal', 'brda-mecikal-woziwoda']) assert.equal(map.features.find(feature => feature.properties.id === id).properties.breaks.length, 0);
});

test('water access fixes Osowo and distinguishes upstream and downstream Kolincz landings', () => {
  const osowo = map.features.find(feature => feature.properties.id === 'wda-osowo-wdecki-mlyn');
  assert.equal(osowo.properties.launchStart, 'traseo:1116224');
  assert.ok(distanceKm(geometryEndpoints(osowo.geometry)[0], [18.3196767, 53.8751943]) < .12);
  const finish = map.features.find(feature => feature.properties.id === 'wierzyca-owidz-kolincki-mlyn');
  const start = map.features.find(feature => feature.properties.id === 'wierzyca-kolincki-rajkowski-mlyn');
  assert.equal(finish.properties.launchFinish, 'operator-pin:42fd46e30c5b');
  assert.equal(start.properties.launchStart, 'operator-pin:c68a3e2f420a');
});

test('reviewed river and lake landings replace town endpoints without increasing the water-distance limit', () => {
  for (const id of ['reda-zamostne-reda', 'lupawa-lupawsko-kozin', 'slupia-wegorzyno-parchowo', 'slupia-soszyca-glebokie', 'krutynia-ukta-nowy-most']) {
    const feature = map.features.find(feature => feature.properties.id === id);
    assert.ok(feature.properties.launchStart && feature.properties.launchFinish, id);
    for (const [i, key] of ['launchStart', 'launchFinish'].entries()) assert.ok(distanceKm(geometryEndpoints(feature.geometry)[i], sites.get(feature.properties[key]).coordinates) <= .12, id);
  }
  assert.ok(map.features.find(feature => feature.properties.id === 'lupawa-lupawsko-kozin').properties.waterAreas.includes('jasien'));
  assert.ok(map.features.find(feature => feature.properties.id === 'slupia-wegorzyno-parchowo').properties.waterAreas.includes('wegorzyno'));
  assert.equal(map.features.find(feature => feature.properties.id === 'reda-zamostne-reda').properties.launchFinish, 'osm:node:14101451575');
});

test('selection retains only the transfers crossed and rejects unavailable launches', () => {
  const feature = { properties: { kind: 'water-route', breaks: [{ from: [18.01, 54], to: [18.02, 54], kind: 'transport', note: 'Przewózka' }] }, geometry: { type: 'MultiLineString', coordinates: [[[18, 54], [18.01, 54]], [[18.02, 54], [18.03, 54]]] } };
  const from = { id: 'a@0', siteId: 'a', position: locateAccess([18.001, 54], feature.geometry, .01)[0] };
  const middle = { id: 'b@0', siteId: 'b', position: locateAccess([18.009, 54], feature.geometry, .01)[0] };
  const to = { id: 'c@0', siteId: 'c', position: locateAccess([18.029, 54], feature.geometry, .01)[0] };
  const points = new Map(['a', 'b', 'c'].map(id => [id, { id, name: id, selectable: true }]));
  assert.equal(sectionBetween(feature, from, middle, points).properties.breaks.length, 0);
  const across = sectionBetween(feature, from, to, points);
  assert.equal(across.properties.breaks.length, 1);
  assert.equal(across.geometry.type, 'MultiLineString');
  points.get('c').selectable = false;
  assert.throws(() => sectionBetween(feature, from, to, points), /miejsce dostępu/);
});
