import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { root } from './osm-data.mjs';
import { waterReferenceIndex } from './water-reference-index.mjs';
import { normalize } from '../src/core.js';

const nearestWater = waterReferenceIndex(JSON.parse(await readFile(path.join(root, 'data/waterways-reference.json'))));
const directory = path.join(root, '.cache/launch-sources');
const only = process.argv.find(arg => arg.startsWith('--id='))?.slice(5).split(',');
const waypoints = JSON.parse(await readFile(path.join(directory, 'operator-waypoints.json')));
const match = process.argv.find(arg => arg.startsWith('--match='))?.slice(8).split(',').map(normalize);
const sourceFilter = process.argv.find(arg => arg.startsWith('--source='))?.slice(9);
if (match || sourceFilter) {
  for (const point of waypoints.filter(point => (!sourceFilter || point.source.url.includes(sourceFilter)) && (!match || match.some(word => normalize(point.name + ' ' + point.description).includes(word))))) console.log(JSON.stringify({ id: point.id, name: point.name, coordinates: point.coordinates, description: point.description, source: point.source.url }));
  process.exit(0);
}
for (const file of (await readdir(directory)).filter(file => /^traseo-map-\d+\.json$/.test(file))) {
  const id = file.match(/\d+/)[0]; if (only && !only.includes(id)) continue;
  const data = JSON.parse(await readFile(path.join(directory, file)));
  const source = waypoints.find(point => point.dataSource.includes(`/trasa-dane/${id}?`));
  if (!data.track?.length) continue;
  const endpoints = [data.track[0], data.track.at(-1)].map(point => {
    const coordinates = [+point.longitude, +point.latitude], match = nearestWater(coordinates);
    return { coordinates, time: point.time, distanceToRiverM: match ? Math.round(match.distance * 1000) : null, waterObject: match?.source };
  });
  console.log(JSON.stringify({ id, source: source?.source, article: source?.article, endpoints }));
}
