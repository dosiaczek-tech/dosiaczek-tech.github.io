import { readFile } from 'node:fs/promises';
import { distanceKm, geometryLength } from '../src/core.js';

const catalog = JSON.parse(await readFile(new URL('../data/routes.json', import.meta.url)));
const map = JSON.parse(await readFile(new URL('../data/route-map.geojson', import.meta.url)));
for (const feature of map.features) {
  const route = catalog.routes.find(r => r.id === feature.properties.id);
  const lines = feature.geometry.type === 'LineString' ? [feature.geometry.coordinates] : feature.geometry.coordinates;
  const longestEdge = Math.max(...lines.flatMap(line => line.slice(1).map((point, i) => distanceKm(line[i], point))));
  const startDistance = distanceKm(feature.properties.places[0].coordinates, lines[0][0]);
  const endDistance = distanceKm(feature.properties.places.at(-1).coordinates, lines.at(-1).at(-1));
  if (feature.properties.kind === 'schematic' || longestEdge > .7 || Math.max(startDistance, endDistance) > .8) {
    console.log(JSON.stringify({ id: route.id, river: route.river, kind: feature.properties.kind, reason: feature.properties.schematicReason, km: +geometryLength(feature.geometry).toFixed(1), published: route.lengthKm, longestEdge: +longestEdge.toFixed(2), snapKm: [startDistance, endDistance].map(n => +n.toFixed(2)), queries: route.map.rivers, places: feature.properties.places.map(p => [p.name, p.coordinates]), access: route.accessNote }, null, 2));
  }
}
