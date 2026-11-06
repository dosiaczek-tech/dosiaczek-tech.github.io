// Distinguish missing evidence from a documented facility that has not yet
// been connected to the water geometry. Research output only.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { root } from './osm-data.mjs';
import { distanceKm, geometryEndpoints, linesOfGeometry } from '../src/core.js';
import { nearestAccessPosition } from '../src/access.js';

const map = JSON.parse(await readFile(path.join(root, 'data/route-map.geojson')));
const access = JSON.parse(await readFile(path.join(root, 'data/access-points.json')));
if (process.argv.includes('--legs')) {
  for (const feature of map.features) {
    const record = access.routes[feature.properties.id], lines = linesOfGeometry(feature.geometry);
    for (const leg of record.legs) for (const role of ['start', 'finish']) {
      if (leg[role]) continue;
      const point = role === 'start' ? lines[leg.index][0] : lines[leg.index].at(-1);
      const nearby = access.sites.filter(site => site.selectable).map(site => ({ id: site.id, name: site.name, km: distanceKm(point, site.coordinates) })).filter(site => site.km < 1).sort((a, b) => a.km - b.km).slice(0, 2);
      const breaks = feature.properties.breaks.filter(gap => Math.min(distanceKm(point, gap.from), distanceKm(point, gap.to)) < .01);
      console.log(JSON.stringify({ route: feature.properties.id, leg: leg.index + 1, role, coordinates: point, nearby, breaks }));
    }
  }
  process.exit(0);
}
if (process.argv.includes('--snapshot')) {
  const audit = JSON.parse(await readFile(path.join(root, 'data/access-audit.json')));
  await writeFile(path.join(root, '.cache/launch-sources/access-before-api-recheck.json'), JSON.stringify({ capturedAt: new Date().toISOString(), summary: access.summary, sites: access.sites.map(({ id, name, coordinates }) => ({ id, name, coordinates })), routes: audit.routes }, null, 2) + '\n');
}
if (process.argv.includes('--compare')) {
  const before = JSON.parse(await readFile(path.join(root, '.cache/launch-sources/access-before-api-recheck.json')));
  const now = JSON.parse(await readFile(path.join(root, 'data/access-audit.json')));
  const previousIds = new Set(before.sites.map(site => site.id));
  const comparison = { before: before.summary, after: access.summary, addedSites: access.sites.filter(site => !previousIds.has(site.id)), improvedRoutes: now.routes.filter(route => route.full && !before.routes.find(old => old.id === route.id)?.full) };
  await writeFile(path.join(root, '.cache/launch-sources/api-recheck-result.json'), JSON.stringify(comparison, null, 2) + '\n');
  console.log(JSON.stringify(comparison, null, 2));
  process.exit(0);
}
const targets = new Map();
for (const feature of map.features) {
  const ends = geometryEndpoints(feature.geometry);
  for (const [index, role] of ['start', 'finish'].entries()) {
    if (feature.properties[index ? 'launchFinish' : 'launchStart']) continue;
    const point = ends[index], place = index ? feature.properties.places.at(-1) : feature.properties.places[0];
    const key = point.join(',');
    const existing = targets.get(key);
    if (existing) { existing.routes.push(feature.properties.id); continue; }
    const sites = access.sites.filter(site => site.selectable).map(site => ({ site, km: distanceKm(site.coordinates, point) })).sort((a, b) => a.km - b.km).slice(0, 3).filter(match => match.km < 3);
    targets.set(key, { name: place.name, role, coordinates: point, routes: [feature.properties.id], nearby: sites.map(({ site, km }) => ({ id: site.id, name: site.name, fromEndpointKm: +km.toFixed(3), fromCourseKm: +nearestAccessPosition(site.coordinates, feature.geometry).distanceKm.toFixed(3) })) });
  }
}
await writeFile(path.join(root, '.cache/launch-sources/access-gaps.json'), JSON.stringify([...targets.values()], null, 2) + '\n');
if (process.argv.includes('--snapshot')) console.log(`Zachowano punkt odniesienia: ${access.summary.anchoredRoutes}/${access.summary.routes}, ${access.summary.sites} miejsc dostępu.`);
else for (const target of targets.values()) console.log(`${target.name} (${target.role}, ${target.routes.length} tras) | ${target.nearby.map(site => `${site.id} ${site.name}: ${site.fromEndpointKm} km od końca, ${site.fromCourseKm} km od linii`).join(' | ') || 'brak punktu w promieniu 3 km'}`);
