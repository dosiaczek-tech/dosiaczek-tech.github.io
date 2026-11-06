// Local evidence for manual review. A pier/campsite is NOT published as a
// launch merely because it appears in this report.
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { root, mapData } from './osm-data.mjs';
import { distanceKm, normalize } from '../src/core.js';

const read = async file => JSON.parse(await readFile(path.join(root, file), 'utf8'));
const fetchBounds = process.argv.find(arg => arg.startsWith('--fetch='))?.slice(8).split(',').map(Number);
if (fetchBounds) await mapData(fetchBounds);
const directoryQuery = process.argv.find(arg => arg.startsWith('--directory='))?.slice(12);
if (directoryQuery) {
  const directory = await read('.cache/launch-sources/directory.json');
  for (const record of directory.records.filter(record => normalize(record.id + ' ' + record.title + ' ' + record.address).includes(normalize(directoryQuery)))) console.log(JSON.stringify(record));
  process.exit(0);
}
const near = process.argv.find(arg => arg.startsWith('--near='))?.slice(7).split(',').map(Number);
const gaps = near ? [{ name: 'Wskazana lokalizacja', coordinates: near, nearby: [], routes: [] }] : await read('.cache/launch-sources/access-gaps.json');
const access = await read('data/access-points.json');
const nodes = new Map(), elements = new Map(), versions = new Map();
for (const file of (await readdir(path.join(root, '.cache/nominatim'))).filter(file => file.startsWith('water-map-') && file.endsWith('.json'))) {
  const data = await read(`.cache/nominatim/${file}`);
  for (const element of data.elements ?? []) {
    const key = `${element.type}/${element.id}`;
    if ((versions.get(key) ?? -1) >= (element.version ?? 0)) continue;
    versions.set(key, element.version ?? 0);
    if (element.type === 'node') nodes.set(element.id, [element.lon, element.lat]);
    const t = element.tags ?? {};
    if (process.argv.includes('--hydro') ? t.waterway || t.natural === 'water' || t.power === 'plant' : process.argv.includes('--bridges') ? t.bridge && t.highway : t.man_made === 'pier' || ['marina', 'slipway', 'beach_resort'].includes(t.leisure) || ['camp_site', 'picnic_site'].includes(t.tourism) || t.amenity === 'boat_rental' || t.natural === 'beach' || t.waterway === 'access_point' || /put_in|egress/.test(t.canoe ?? '')) elements.set(key, element);
    else elements.delete(key);
  }
}
const candidates = [...elements].map(([object, element]) => {
  const vertices = element.type === 'node' ? [{ id: element.id, coordinates: nodes.get(element.id) }] : (element.nodes ?? []).filter(id => nodes.has(id)).map(id => ({ id, coordinates: nodes.get(id) }));
  return { object, tags: element.tags, vertices };
}).filter(item => item.vertices.length);
const reports = gaps.map(gap => {
  const probes = [gap.coordinates, ...gap.nearby.map(near => access.sites.find(site => site.id === near.id)?.coordinates).filter(Boolean)];
  const near = candidates.map(candidate => {
    const vertices = candidate.vertices.map(vertex => ({ ...vertex, distance: Math.min(...probes.map(point => distanceKm(point, vertex.coordinates))) })).sort((a, b) => a.distance - b.distance);
    return { object: candidate.object, tags: candidate.tags, distance: +vertices[0].distance.toFixed(3), vertices: vertices.slice(0, 12).map(({ id, coordinates }) => ({ id, coordinates })) };
  }).filter(candidate => candidate.distance < 1.5).sort((a, b) => a.distance - b.distance);
  return { ...gap, candidates: near };
});
await writeFile(path.join(root, `.cache/launch-sources/access-review${process.argv.includes('--hydro') ? '-hydro' : process.argv.includes('--bridges') ? '-bridges' : ''}.json`), JSON.stringify(reports, null, 2) + '\n');
const filter = process.argv.find(arg => arg.startsWith('--place='))?.slice(8);
const limit = Number(process.argv.find(arg => arg.startsWith('--limit='))?.slice(8)) || (filter || near ? 20 : 4);
for (const report of reports.filter(report => !filter || report.name.toLocaleLowerCase('pl').includes(filter.toLocaleLowerCase('pl')))) {
  console.log(`\n${report.name} (${report.routes.join(', ')})`);
  for (const candidate of report.candidates.slice(0, limit)) console.log(JSON.stringify(candidate));
}
