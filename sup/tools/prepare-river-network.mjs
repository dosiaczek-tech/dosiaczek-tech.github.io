// Offline derivation from the existing OSM snapshot and audited atlas lines.
// No geocoding or network requests are made here or when drawing a user route.
import { readFile, writeFile } from 'node:fs/promises';
import { linesOfGeometry } from '../src/core.js';
import { containsWater, segmentInWater } from './water-graph.mjs';
import { RiverNetwork } from '../src/river-routing.js';

const read = async name => JSON.parse(await readFile(new URL(`../data/${name}`, import.meta.url), 'utf8'));
const [reference, areas, catalogue, map, access] = await Promise.all(['waterways-reference.json', 'water-areas.geojson', 'routes.json', 'route-map.geojson', 'access-points.json'].map(read));
const riverName = name => name.replace(/ rzeka.*$/, '');
const names = [...new Set(catalogue.routes.flatMap(route => route.map.rivers.map(riverName)))].sort((a, b) => a.localeCompare(b, 'pl'));
const features = new Map(map.features.map(feature => [feature.properties.id, feature]));
// Add settlement names to existing, mapped landings; never geocode a village
// centre as a river endpoint. Trątkownica is the landing AFTER the road bridge,
// not one of the earlier Kiełpino operators. Reviewed 2026-11-04:
// https://kaszubskiekajaki.pl/3-Kontakt and /1-Splywy
// https://kajaki.pomorskie.eu/stanica/pomost-w-ostrzycach/
const placeNames = new Map([
  ['osm:way:173524480', { name: 'Ostrzyce — pomost nad jeziorem', aliases: ['Ostrzyce', 'Pomost w Ostrzycach'] }],
  ['osm:node:11100021655', { name: 'Trątkownica — przystań za mostem (Kaszubskie Kajaki)', aliases: ['Trątkownica', 'Kajaki Kaszubskie', 'Kaszubskie Kajaki'] }]
]);
const rivers = [];
for (const name of names) {
  const lines = [];
  for (const source of reference.filter(line => line.name === name)) {
    let part = [source.coordinates[0]];
    for (let i = 1; i < source.coordinates.length; i++) {
      const a = source.coordinates[i - 1], b = source.coordinates[i];
      // OSM's abstract lake axis can cross an island; use the atlas crossing
      // around that island, never the invalid axis.
      const dry = areas.features.some(area => containsWater(a, area.geometry) && containsWater(b, area.geometry) && !segmentInWater(a, b, area.geometry));
      if (dry) { if (part.length > 1) lines.push(part); part = [b]; }
      else part.push(b);
    }
    if (part.length > 1) lines.push(part);
  }
  for (const route of catalogue.routes.filter(route => route.map.rivers.length === 1 && riverName(route.map.rivers[0]) === name)) {
    const feature = features.get(route.id);
    if (feature) lines.push(...linesOfGeometry(feature.geometry));
  }
  if (!lines.length) continue;
  const network = new RiverNetwork(lines);
  const sites = access.sites.filter(site => site.selectable && network.snap(site.coordinates)).map(site => ({
    id: site.id, name: site.name, coordinates: site.coordinates,
    approximate: site.coordinateAccuracy === 'approximate',
    ...placeNames.get(site.id)
  }));
  rivers.push({ name, lines, sites });
}
await writeFile(new URL('../data/river-network.json', import.meta.url), JSON.stringify({ version: 1, attribution: '© OpenStreetMap contributors · ODbL; miejsca dostępu: access-points.json', rivers }));
console.log(`Sieć do własnych tras: ${rivers.length} rzek i kanałów.`);
