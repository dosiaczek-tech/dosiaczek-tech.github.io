import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { root } from './osm-data.mjs';
import { distanceKm, normalize, geometryLength, linesOfGeometry, kilometerMarks } from '../src/core.js';
import { locateAccess, nearestAccessPosition, comparePositions, geometryKey } from '../src/access.js';
import { kajakodajniaRoutes, KAJAKODAJNIA_URL } from './kajakodajnia-catalogue.mjs';
import { operatorAccessNotes } from './operator-access-notes.mjs';
import { directoryLinks } from './access-directory-links.mjs';
import { mapPinNotes } from './map-pin-notes.mjs';
import { waterReferenceIndex } from './water-reference-index.mjs';
import { trackAccessNotes, trackSiteId } from './track-access-notes.mjs';
import { reviewedFacilities } from './reviewed-facilities.mjs';
import { reviewedLocations } from './reviewed-locations.mjs';
import { guideAccessNotes } from './guide-access-notes.mjs';

const read = async file => JSON.parse(await readFile(path.join(root, file), 'utf8'));
const catalogue = await read('data/routes.json'), map = await read('data/route-map.geojson');
const directory = new Map((await read('.cache/launch-sources/directory.json')).records.map(record => [record.id.replace('psk:', ''), record]));
const features = new Map(map.features.map(f => [f.properties.id, f]));
const waterReference = await read('data/waterways-reference.json');
const nearestWater = waterReferenceIndex(waterReference);
const sites = new Map();
const date = '2026-10-23';
const sourceLink = object => ({ name: 'OpenStreetMap · miejsce dostępu', url: `https://www.openstreetmap.org/${object}`, accessedAt: date });
const namedLaunch = tags => /przysta(?:ń|nek) (?:dla )?kajak|stanica (?:wodna|kajak)|miejsce wodowania|pomost.*kajak/i.test(tags.name ?? '') || /canoe|kayak/.test(tags.sport ?? '');
const landingTag = tags => /put_in|egress/.test(tags.canoe ?? '') || tags.waterway === 'access_point' || tags.leisure === 'slipway';
const qualifies = tags => landingTag(tags) || namedLaunch(tags) && !['parking', 'shelter', 'toilets'].includes(tags.amenity) || tags.canoe === 'yes' && (tags.leisure === 'marina' || tags.tourism === 'camp_site' || tags.man_made === 'pier');
const publicTags = tags => Object.fromEntries(Object.entries(tags).filter(([key]) => ['name', 'waterway', 'canoe', 'sport', 'leisure', 'man_made', 'tourism', 'amenity', 'access', 'fee', 'opening_hours', 'operator', 'description', 'website', 'wheelchair', 'surface', 'seasonal'].includes(key)));

function nearRoutes(coordinates, maxKm = 3) {
  return catalogue.routes.map(route => ({ id: route.id, position: nearestAccessPosition(coordinates, features.get(route.id).geometry, maxKm) })).filter(r => r.position);
}
function add(site) {
  const existing = sites.get(site.id);
  site.sources = [...new Map([...(existing?.sources ?? []), ...site.sources].map(source => [source.url, source])).values()];
  sites.set(site.id, { ...existing, ...site });
}
const elements = new Map(), nodes = new Map(), versions = new Map();
for (const file of (await readdir(path.join(root, '.cache/nominatim'))).filter(name => name.startsWith('water-map-') && name.endsWith('.json')).sort()) {
  const data = await read(`.cache/nominatim/${file}`);
  for (const element of data.elements ?? []) {
    const object = `${element.type}/${element.id}`;
    // Overlapping cached extracts may have different versions of an object.
    // A newly fetched correction/removal of launch tags must win over an older
    // file regardless of alphabetical bounding-box order.
    if ((versions.get(object) ?? -1) >= (element.version ?? 0)) continue;
    versions.set(object, element.version ?? 0);
    if (element.type === 'node') nodes.set(element.id, [element.lon, element.lat]);
    if (element.tags && (qualifies(element.tags) || directoryLinks[object] || reviewedFacilities[object] || process.argv.includes('--candidates') && (['camp_site', 'picnic_site'].includes(element.tags.tourism) || element.tags.leisure === 'marina' || element.tags.amenity === 'boat_rental'))) elements.set(object, element);
    else elements.delete(object);
  }
}
for (const [object, element] of elements) {
  const tags = element.tags;
  const points = element.type === 'node' ? [nodes.get(element.id)] : element.type === 'way' ? element.nodes.map(id => nodes.get(id)).filter(Boolean) : [];
  if (!points.length) continue;
  // A polygon's centroid can be a field. Keep an actual mapped boundary vertex
  // closest to the water course; the popup identifies this as a facility point.
  const candidates = points.map(coordinates => ({ coordinates, matches: nearRoutes(coordinates), water: nearestWater(coordinates) })).filter(item => item.matches.length);
  const waterDistance = candidate => candidate.water?.distance ?? Math.min(...candidate.matches.map(match => match.position.distanceKm));
  candidates.sort((a, b) => waterDistance(a) - waterDistance(b));
  const candidate = candidates[0]; if (!candidate) continue;
  if (!qualifies(tags) && !directoryLinks[object] && !reviewedFacilities[object]) { console.log(JSON.stringify({ object, coordinates: candidate.coordinates, tags, nearest: candidate.matches.sort((a, b) => a.position.distanceKm - b.position.distanceKm).slice(0, 2).map(m => ({ id: m.id, km: m.position.km, away: m.position.distanceKm })) })); continue; }
  const restricted = tags.access === 'no' || tags.canoe === 'no';
  const conditional = ['private', 'customers'].includes(tags.access);
  add({
    id: `osm:${object.replace('/', ':')}`, name: tags.name ?? (tags.leisure === 'slipway' ? 'Slip / zejście do wody' : 'Miejsce wodowania'), coordinates: candidate.coordinates,
    kind: tags.man_made === 'pier' ? 'pier' : tags.leisure === 'slipway' ? 'slipway' : 'launch', status: restricted ? 'restricted' : conditional ? 'conditional' : 'mapped', selectable: !restricted,
    coordinateAccuracy: landingTag(tags) && element.type === 'node' ? 'landing' : 'facility',
    conditions: restricted ? 'OSM wskazuje zakaz dostępu lub pływania kajakiem. Punkt nie jest dostępny do wyboru.' : conditional ? 'Teren prywatny / dla klientów. Wodowanie własnej deski wymaga uzgodnienia z operatorem.' : 'Miejsce oznaczone na mapie OSM; zasady korzystania sprawdź u zarządcy.',
    landAccess: 'Dojazd i dojście sprawdź na podkładzie mapy oraz w opisie źródła.', season: tags.opening_hours ?? '', services: [],
    ...(tags.fee ? { fee: tags.fee === 'yes' ? 'OSM wskazuje opłatę.' : tags.fee === 'no' ? 'OSM: bez opłaty.' : tags.fee } : {}),
    sources: [sourceLink(object)], osmTags: publicTags(tags)
  });
  const record = directory.get(directoryLinks[object]);
  if (record) {
    const current = sites.get(`osm:${object.replace('/', ':')}`);
    const planned = /w przygotowaniu|w budowie/i.test(record.title);
    add({ ...current, name: `${record.title}${tags.leisure === 'slipway' ? ' · slip' : ''}`, address: record.address, season: record.season, services: record.services, sources: [record.source, ...current.sources],
      status: planned ? 'planned' : ['restricted', 'conditional'].includes(current.status) ? current.status : 'documented', selectable: current.selectable && !planned,
      landAccess: record.services.some(service => /parking/i.test(service)) ? 'Katalog przystani wymienia parking przy obiekcie.' : current.landAccess
    });
  }
  const reviewed = reviewedFacilities[object];
  if (reviewed) {
    const current = sites.get(`osm:${object.replace('/', ':')}`);
    add({ ...current, name: reviewed.name, landAccess: reviewed.landAccess, conditions: restricted ? current.conditions : reviewed.conditions,
      status: restricted ? 'restricted' : conditional ? 'conditional' : 'documented', sources: [...current.sources, { ...reviewed.source, accessedAt: date }] });
  }
}

const operatorPoints = await read('.cache/launch-sources/operator-waypoints.json');
for (const id of Object.keys(operatorAccessNotes)) if (!operatorPoints.some(point => point.id === id)) throw new Error(`Niekompletne źródła operatorów: brak ${id}. Uruchom collect-operator-access.mjs przed publikacją.`);
for (const point of operatorPoints) {
  const note = operatorAccessNotes[point.id]; if (!note) continue;
  const [name, landAccess, conditions] = note;
  add({ id: point.id, name, coordinates: point.coordinates, kind: 'launch', status: 'documented', selectable: true, coordinateAccuracy: 'facility',
    landAccess, conditions: conditions ?? 'Miejsce opisane na mapie operatora. Aktualne warunki korzystania sprawdź przed wyjazdem.', services: [], season: '', sources: [point.source, ...(point.article ? [{ name: 'eKajaki.pl · opis odcinka', url: point.article, accessedAt: date }] : [])],
    ...(name.startsWith('Wdecki') ? { sources: [point.source, { name: 'Hydrostacja · aktualny opis Wdy', url: 'https://www.kajaki.hydrostacja.pl/mapa-opis-szlaku-rzeka-wda/', accessedAt: date }] } : {})
  });
}

const operatorPins = await read('.cache/launch-sources/operator-pins.json');
for (const id of Object.keys(mapPinNotes)) if (!operatorPins.some(point => point.id === id)) throw new Error(`Niekompletne mapy operatorów: brak ${id}. Uruchom collect-map-pins.mjs przed publikacją.`);
for (const pin of operatorPins) {
  const note = mapPinNotes[pin.id]; if (!note) continue;
  const [name, landAccess, role] = note;
  const routeIds = catalogue.routes.filter(route => [route.source, ...(route.additionalSources ?? [])].some(source => pin.sources.some(s => s.url === source.url))).map(route => route.id);
  add({ id: pin.id, name, coordinates: pin.coordinates, kind: 'launch', status: 'documented', selectable: true, coordinateAccuracy: 'facility', riverKeys: ['wierzyca'],
    landAccess, conditions: 'Punkt opisany przez operatora spływów. Uzgodnij dostęp z własną deską i sprawdź bieżące warunki.', services: [], season: '',
    sources: [...pin.sources, { name: 'Mapa operatora · pinezka', url: pin.mapUrl, accessedAt: date }], ...(role ? { preferredFor: { [role]: routeIds } } : {})
  });
}

// Exact pins linked by the operator, not the similarly named village centroids.
for (const route of kajakodajniaRoutes) for (const point of route.map.places) {
  if (!point.coordinates || !/przystań|stanica ZHP|Kręgski Młyn — most/.test(point.name)) continue;
  const object = point.source.match(/openstreetmap\.org\/(node|way)\/(\d+)/);
  const id = object ? `osm:${object[1]}:${object[2]}` : `kajakodajnia:${normalize(point.name.split(' — ')[0]).replace(/\W+/g, '-')}`;
  add({ id, name: point.name, coordinates: point.coordinates, kind: 'marina', status: 'documented', selectable: true, coordinateAccuracy: 'facility',
    riverKeys: ['wierzyca'], services: [], season: '',
    conditions: 'Miejsce startu / zakończenia opisane przez operatora. Warunki wodowania własnej deski uzgodnij z zarządcą.',
    landAccess: 'Dokładny dojazd wskazuje pinezka podlinkowana przez operatora.',
    sources: [{ name: 'Kajakodajnia · miejsce startu / zakończenia', url: KAJAKODAJNIA_URL, accessedAt: date }, { name: 'Lokalizacja przystani', url: point.source, accessedAt: date }]
  });
}

let geocoded = { sites: [], unresolved: [] };
try { geocoded = await read('.cache/launch-sources/geocoded.json'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
// A geocoder result is only a suggestion. Only explicitly reviewed source/OSM
// pairs can be published, even when another launch exists in the same town.
for (const candidate of geocoded.sites) {
  const existing = sites.get(candidate.id);
  const object = candidate.id.replace('osm:', '').replace(':', '/');
  if (!candidate.osmAddress || directoryLinks[object] !== candidate.sourceId?.replace('psk:', '')) continue;
  if (existing) add({ ...candidate, coordinates: existing.coordinates, osmTags: existing.osmTags, selectable: existing.selectable, status: ['restricted', 'conditional', 'planned'].includes(existing.status) ? existing.status : 'documented', conditions: existing.conditions });
  else add(candidate);
}
if (process.argv.includes('--geocode-report')) for (const site of geocoded.sites) console.log(`${site.sourceId} | ${site.id} | ${site.osmName}`);

for (const record of trackAccessNotes) {
  const data = await read(`.cache/launch-sources/traseo-map-${record.track}.json`);
  const endpoint = record.end === 'start' ? data.track[0] : data.track.at(-1);
  const coordinates = [+endpoint.longitude, +endpoint.latitude];
  if (!coordinates.every(Number.isFinite) || coordinates[0] < 14 || coordinates[0] > 25 || coordinates[1] < 49 || coordinates[1] > 55) throw new Error(`Nieprawidłowy punkt mapy operatora: ${record.name}`);
  const observed = endpoint.time?.slice(0, 10), trackDate = observed && Number.isFinite(Date.parse(observed)) ? observed : null;
  add({ id: trackSiteId(record), name: record.name, coordinates, kind: 'launch', status: 'documented', selectable: true, coordinateAccuracy: 'facility',
    conditions: 'Miejsce wskazane na mapie operatora. Warunki wodowania własnej deski i odbioru z lądu uzgodnij z organizatorem lub zarządcą.',
    landAccess: record.description, services: [], season: '', sources: [{ name: `${record.publisher ?? 'eKajaki.pl'} · opis odcinka`, url: record.url, accessedAt: date }, { name: `${record.publisher ?? 'eKajaki.pl'} · mapa startu / zakończenia`, url: record.mapUrl, accessedAt: date, ...(trackDate ? { trackDate } : {}) }]
  });
}

for (const location of reviewedLocations) {
  const record = location.directoryId ? directory.get(location.directoryId) : null;
  if (location.directoryId && !record) throw new Error(`Brak opisu źródłowego: ${location.directoryId}`);
  // The historical URL may still contain "w-przygotowaniu" after opening
  // (e.g. Bartoszylas). Use the current directory title, not its slug.
  const planned = /w przygotowaniu|w budowie/i.test(record?.title ?? '');
  let coordinates = location.coordinates, projection = null;
  if (location.projectToRiver) {
    projection = waterReferenceIndex(waterReference.filter(line => normalize(line.name ?? '') === normalize(location.projectToRiver)))(location.coordinates);
    if (!projection || projection.distance > location.maxProjectionKm) throw new Error(`Nie udało się powiązać potwierdzonej bazy z jej rzeką: ${location.name}`);
    coordinates = projection.coordinates;
  }
  add({ id: location.id, name: location.name, coordinates, kind: location.kind ?? 'launch', status: planned ? 'planned' : location.status ?? 'documented', selectable: !planned, coordinateAccuracy: projection ? 'approximate' : location.coordinateAccuracy ?? 'facility',
    ...(location.coordinateMethod ? { coordinateMethod: location.coordinateMethod } : {}),
    ...(projection ? { facilityCoordinates: location.coordinates, coordinateOffsetKm: projection.distance, coordinateMethod: 'documented-facility-nearest-river' } : {}),
    address: location.address ?? record?.address ?? '', season: record?.season ?? '', services: record?.services ?? [], landAccess: `${location.landAccess}${location.coordinateNote ? ` ${location.coordinateNote}` : ''}`,
    conditions: planned ? 'Źródło określa miejsce jako przygotowywane; wymaga potwierdzenia uruchomienia.' : location.conditions ?? 'Obiekt wskazany w źródłach. Aktualne zasady wodowania własnej deski i postoju sprawdź u zarządcy.',
    sources: [...(record ? [record.source] : []), ...(location.source ? [{ ...location.source, accessedAt: date }] : []), { name: 'Mapa lokalizacji obiektu', url: location.locationUrl, accessedAt: date }, ...(projection ? [sourceLink(projection.source)] : [])]
  });
}

for (const record of guideAccessNotes) {
  const reference = features.get(record.referenceRouteId), nodePoints = record.referenceNodes.map(id => nodes.get(id));
  if (!reference || nodePoints.some(point => !point)) throw new Error(`Brak geometrii odniesienia: ${record.name}`);
  const referencePoint = nodePoints.reduce((sum, point) => [sum[0] + point[0] / nodePoints.length, sum[1] + point[1] / nodePoints.length], [0, 0]);
  const position = nearestAccessPosition(referencePoint, reference.geometry, .08);
  const targetKm = position && position.km + record.referenceRiverKm - record.riverKm;
  if (!position || targetKm <= 0) throw new Error(`Nieprawidłowe odniesienie kilometrażowe: ${record.name}`);
  const point = kilometerMarks(reference.geometry, targetKm)[0]?.coordinates;
  const target = point && nearestAccessPosition(point, reference.geometry, .005);
  if (!target || target.line !== position.line) throw new Error(`Kilometraż ${record.name} przekracza przerwę w geometrii.`);
  const description = directory.get(record.directoryId);
  add({ id: record.id, name: record.name, coordinates: point, kind: 'launch', status: 'documented', selectable: true, coordinateAccuracy: 'approximate', coordinateMethod: 'guide-river-kilometre',
    coordinateReference: { coordinates: referencePoint, riverKm: record.referenceRiverKm, targetRiverKm: record.riverKm, object: record.referenceObject },
    address: description.address, season: description.season, services: description.services, landAccess: record.landAccess,
    conditions: 'Przystań opisana przez regionalny portal. Lokalizację pomostu rozpoznaj według oznaczeń w terenie; pinezka jest orientacyjna.',
    sources: [description.source, { ...record.source, accessedAt: date }, sourceLink(record.referenceObject)]
  });
}

// A newer, explicitly mapped put-in in the same park replaces the older
// operator pin, which was over 140 m from the present river channel.
for (const [oldId, newId] of [['traseo:1122468', 'osm:node:14101451575'], ['traseo:220849', 'operator-track:6143:start']]) {
  if (!sites.has(oldId) || !sites.has(newId)) continue;
  const updated = sites.get(newId), old = sites.get(oldId);
  add({ ...updated, sources: [...updated.sources, ...old.sources] }); sites.delete(oldId);
}

const routeAccess = {}, audits = [];
for (const route of catalogue.routes) {
  const feature = features.get(route.id), occurrences = [];
  for (const site of sites.values()) {
    for (const [index, position] of locateAccess(site.coordinates, feature.geometry, .15).entries()) {
      occurrences.push({ id: `${site.id}@${index}`, siteId: site.id, position });
    }
  }
  occurrences.sort((a, b) => comparePositions(a.position, b.position));
  const total = geometryLength(feature.geometry), tolerance = Math.min(2.5, total * .3);
  const allowed = occurrences.filter(item => sites.get(item.siteId).selectable);
  const starts = allowed.filter(item => item.position.line === 0 && item.position.km <= tolerance);
  const ends = allowed.filter(item => item.position.line === linesOfGeometry(feature.geometry).length - 1 && total - item.position.km <= tolerance);
  const start = allowed.find(item => item.siteId === feature.properties.launchStart) ?? starts[0] ?? null;
  const finish = allowed.findLast(item => item.siteId === feature.properties.launchFinish) ?? ends.at(-1) ?? null;
  const complete = start && finish && finish.position.km - start.position.km > .05;
  const legs = linesOfGeometry(feature.geometry).map((line, index) => {
    const length = geometryLength({ type: 'LineString', coordinates: line });
    const before = linesOfGeometry(feature.geometry).slice(0, index).reduce((sum, part) => sum + geometryLength({ type: 'LineString', coordinates: part }), 0);
    const points = allowed.filter(item => item.position.line === index);
      const startBreak = feature.properties.breaks.find(gap => distanceKm(line[0], gap.to) < .01)?.kind;
      const finishBreak = feature.properties.breaks.find(gap => distanceKm(line.at(-1), gap.from) < .01)?.kind;
      return { index, start: points.find(item => item.position.km - before < .15)?.id ?? null, finish: points.findLast(item => before + length - item.position.km < .15)?.id ?? null,
        ...(startBreak ? { startBreak } : {}), ...(finishBreak ? { finishBreak } : {}) };
  });
  const anchored = Boolean(feature.properties.launchStart && feature.properties.launchFinish);
  const selectableSection = allowed.length > 1 && allowed.at(-1).position.km - allowed[0].position.km >= .05;
  routeAccess[route.id] = { geometryKey: geometryKey(feature.geometry), occurrences, start: complete ? start.id : null, finish: complete ? finish.id : null, anchored, legs };
  const approximateEndpoints = [feature.properties.launchStart, feature.properties.launchFinish].filter(id => sites.get(id)?.coordinateAccuracy === 'approximate').length;
  audits.push({ id: route.id, points: allowed.length, start: start ? sites.get(start.siteId).name : null, finish: finish ? sites.get(finish.siteId).name : null, full: Boolean(complete && anchored), approximateEndpoints, endpointPair: Boolean(complete), selectableSection, legs: legs.map(leg => ({ ...leg, start: Boolean(leg.start), finish: Boolean(leg.finish) })) });
}
const summary = { sites: sites.size, approximateSites: [...sites.values()].filter(site => site.coordinateAccuracy === 'approximate').length, routes: audits.length, anchoredRoutes: audits.filter(a => a.full).length,
  approximateEndpointRoutes: audits.filter(a => a.approximateEndpoints > 0).length, selectableRoutes: audits.filter(a => a.selectableSection).length,
  waterLegs: audits.flatMap(a => a.legs).length, completeLegs: audits.flatMap(a => a.legs).filter(leg => leg.start && leg.finish).length };
const data = { version: 1, generatedAt: new Date().toISOString(), attribution: '© OpenStreetMap contributors, ODbL 1.0; opisy: źródła przy punktach', summary, sites: [...sites.values()], routes: routeAccess };
await writeFile(path.join(root, 'data/access-points.json'), JSON.stringify(data) + '\n');
await writeFile(path.join(root, 'data/access-audit.json'), JSON.stringify({ generatedAt: data.generatedAt, summary, routes: audits, unresolvedSources: geocoded.unresolved, geocodingStatus: geocoded.status }, null, 2) + '\n');
console.log(`${sites.size} miejsc dostępu; ${summary.anchoredRoutes}/${audits.length} tras z obydwoma końcami; ${summary.selectableRoutes} tras z wyborem odcinka.`);
if (process.argv.includes('--report')) {
  for (const site of sites.values()) console.log(JSON.stringify({ id: site.id, name: site.name, coordinates: site.coordinates, status: site.status, tags: site.osmTags }));
  console.log(JSON.stringify(audits.filter(a => !a.full), null, 2));
}
