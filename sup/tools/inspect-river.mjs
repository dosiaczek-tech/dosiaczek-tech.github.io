// Local geometry diagnostics: investigate why an OSM route is disconnected.
import { readFile } from 'node:fs/promises';
import { distanceKm, geometryLength } from '../src/core.js';
const name = process.argv[2] ?? 'Słupia rzeka, pomorskie';
const file = new URL(`../.cache/nominatim/${encodeURIComponent(encodeURIComponent(`river-${name}@16.2,53.25,19,54.9`))}.json`, import.meta.url);
const cached = JSON.parse(await readFile(file));
for (const result of cached.results ?? cached) {
  const geometry = result.geojson;
  if (!['LineString', 'MultiLineString'].includes(geometry?.type)) continue;
  const lines = geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates;
  console.log(result.display_name, `${result.osm_type}/${result.osm_id}`, lines.length, 'lines');
  for (const [index, line] of lines.entries()) {
    const nearestEnds = lines.flatMap((other, otherIndex) => otherIndex === index ? [] : [other[0], other.at(-1)].flatMap(p => [line[0], line.at(-1)].map(q => ({ otherIndex, meters: distanceKm(p, q) * 1000 })))).sort((a, b) => a.meters - b.meters).slice(0, 3);
    console.log(index, geometryLength({ type: 'LineString', coordinates: line }).toFixed(2), line[0], line.at(-1), nearestEnds);
  }
}
