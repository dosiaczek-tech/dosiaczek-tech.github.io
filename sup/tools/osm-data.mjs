import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { distanceKm } from '../src/core.js';

export const root = fileURLToPath(new URL('../', import.meta.url));
const directory = path.join(root, '.cache', 'nominatim');
const headers = { 'User-Agent': 'SUP-Atlas/1.0 (https://dosiaczek-tech.github.io/sup/)', 'Accept-Language': 'pl' };
let lastRequest = 0;
const memory = new Map();
async function cached(key, fetchData) {
  if (memory.has(key)) return memory.get(key);
  await mkdir(directory, { recursive: true });
  const file = path.join(directory, `${key}.json`);
  let result;
  try {
    result = JSON.parse(await readFile(file, 'utf8'));
    if (Array.isArray(result)) result = { results: result, fetchedAt: (await stat(file)).mtime.toISOString().slice(0, 10) };
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    result = { fetchedAt: new Date().toISOString().slice(0, 10), ...(await fetchData()) };
    await writeFile(file, JSON.stringify(result));
  }
  memory.set(key, result); return result;
}
async function json(url, nominatim = false) {
  if (nominatim) {
    await new Promise(resolve => setTimeout(resolve, Math.max(0, 1250 - (Date.now() - lastRequest))));
    lastRequest = Date.now();
  }
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`${response.status}: ${url}`);
  return response.json();
}
export function search(query, mode = 'place', bounds) {
  const prefix = mode === 'river' ? 'river-' : mode === 'area' ? 'area-' : mode === 'access' ? 'access-' : '';
  const key = encodeURIComponent(`${prefix}${query}${bounds ? `@${bounds.join(',')}` : ''}`);
  return cached(key, async () => {
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.search = new URLSearchParams({ q: query, format: 'jsonv2', countrycodes: 'pl', limit: mode === 'river' ? '40' : '10', ...(mode !== 'place' ? { polygon_geojson: '1', dedupe: '0' } : {}), ...(mode === 'access' ? { extratags: '1', addressdetails: '1' } : {}), ...(bounds ? { viewbox: `${bounds[0]},${bounds[3]},${bounds[2]},${bounds[1]}`, bounded: '1' } : {}) });
    return { results: await json(url, true) };
  });
}
export async function resolvePlace(entry, bounds) {
  const place = typeof entry === 'string' ? { name: entry, query: entry } : entry;
  if (place.coordinates) {
    if (!place.source) throw new Error(`Brak źródła punktu: ${place.name}`);
    return place;
  }
  const response = await search(`${place.query}, Polska`, 'place', bounds);
  const result = response.results.find(r => r.category === 'place' || r.type === 'administrative') ?? response.results[0];
  if (!result) throw new Error(`Nie znaleziono punktu: ${place.query}`);
  return { name: place.name, coordinates: [+result.lon, +result.lat], osm: `${result.osm_type}/${result.osm_id}`, resolvedName: result.display_name, fetchedAt: response.fetchedAt };
}
export const geometryLines = geometry => geometry?.type === 'LineString' ? [geometry.coordinates] : geometry?.type === 'MultiLineString' ? geometry.coordinates : [];
export function extractWays(data) {
  const nodes = new Map(data.elements.filter(e => e.type === 'node').map(e => [e.id, [e.lon, e.lat]]));
  return data.elements.filter(e => e.type === 'way' && ['river', 'stream', 'canal', 'tidal_channel'].includes(e.tags?.waterway)).map(way => ({
    source: `way/${way.id}`, name: way.tags.name ?? '', coordinates: way.nodes.map(id => nodes.get(id))
  })).filter(line => line.coordinates.length > 1 && line.coordinates.every(Boolean));
}
async function relation(id) {
  return cached(`osm-relation-${id}`, () => json(`https://api.openstreetmap.org/api/0.6/relation/${id}/full.json`));
}
export async function riverLines(query, bounds) {
  const data = await search(query, 'river', bounds);
  const lines = [];
  for (const item of data.results.filter(r => r.category === 'waterway' && geometryLines(r.geojson).length)) {
    if (item.osm_type === 'relation') {
      const full = await relation(item.osm_id);
      lines.push(...extractWays(full));
    }
    // Keep the indexed centreline as well: it can include cartographic lake
    // axes that are absent from the current relation membership.
    for (const coordinates of geometryLines(item.geojson)) lines.push({ source: `${item.osm_type}/${item.osm_id}`, name: item.name, coordinates });
  }
  return { lines, fetchedAt: data.fetchedAt };
}
export function mapData(bounds) {
  return cached(`water-map-${bounds.join(',')}`, () => json(`https://api.openstreetmap.org/api/0.6/map.json?bbox=${bounds.join(',')}`));
}
export async function mapWays(bounds) {
  const data = await mapData(bounds);
  return { lines: extractWays(data), fetchedAt: data.fetchedAt };
}
export async function waterArea(spec) {
  if (spec.osmWay) {
    const data = await mapData(spec.bounds);
    const way = data.elements.find(element => element.type === 'way' && element.id === spec.osmWay);
    const nodes = new Map(data.elements.filter(element => element.type === 'node').map(node => [node.id, [node.lon, node.lat]]));
    if (!way || way.tags?.natural !== 'water' || way.nodes[0] !== way.nodes.at(-1)) throw new Error(`Brak zamkniętego obrysu wody: ${spec.id}`);
    if (data.elements.some(element => element.type === 'relation' && element.tags?.type === 'multipolygon' && element.members.some(member => member.type === 'way' && member.ref === spec.osmWay))) throw new Error(`Obrys ${spec.id} wymaga pełnej relacji z wyspami; nie wolno pominąć jej pierścieni.`);
    const coordinates = way.nodes.map(id => nodes.get(id));
    if (coordinates.some(point => !point)) throw new Error(`Niepełny obrys wody: ${spec.id}`);
    return { type: 'Feature', properties: { id: spec.id, name: spec.name, source: `way/${spec.osmWay}`, fetchedAt: data.fetchedAt, kind: 'river-area' }, geometry: { type: 'Polygon', coordinates: [coordinates] } };
  }
  const data = await search(spec.query, 'area', spec.bounds);
  const polygons = data.results.filter(r => ['Polygon', 'MultiPolygon'].includes(r.geojson?.type) && (r.category === 'water' || r.category === 'natural' || r.type === 'reservoir'));
  polygons.sort((a, b) => distanceKm([+a.lon, +a.lat], spec.near) - distanceKm([+b.lon, +b.lat], spec.near));
  const selected = polygons[0];
  if (!selected || distanceKm([+selected.lon, +selected.lat], spec.near) > 8) throw new Error(`Nie znaleziono granic akwenu: ${spec.id} (${spec.query})`);
  return { type: 'Feature', properties: { id: spec.id, name: selected.name, source: `${selected.osm_type}/${selected.osm_id}`, fetchedAt: data.fetchedAt }, geometry: selected.geojson };
}
