// Explicit offline preparation. Every drawn edge is a waterway or a path
// contained by a lake polygon. Missing data is a gap, never a straight fallback.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { geometryLength, distanceKm } from '../src/core.js';
import { root, resolvePlace, riverLines, mapWays, waterArea } from './osm-data.mjs';
import { WaterGraph, sectionsFromSteps, combineSections } from './water-graph.mjs';
import { waterPlan, WATER_AREAS, EXTRACTS } from './water-plans.mjs';
import { accessAnchor } from './access-anchors.mjs';
import { reviewedAccessTarget } from './access-targets.mjs';

const catalog = JSON.parse(await readFile(path.join(root, 'data/routes.json'), 'utf8'));
let accessSites = [];
try { accessSites = JSON.parse(await readFile(path.join(root, 'data/access-points.json'), 'utf8')).sites; }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const features = [], audits = [], errors = [], usedAreas = new Map(), reference = new Map();
const only = process.argv.find(arg => arg.startsWith('--only='))?.slice(7).split(',');
const quiet = process.argv.includes('--quiet');
const coordKey = p => p.map(n => n.toFixed(7)).join(',');
async function point(entry, bounds) {
  if (!entry.junction) return resolvePlace(entry, bounds);
  const a = await riverLines(entry.junction[0], bounds);
  const b = await riverLines(entry.junction[1], bounds);
  const first = a.lines.flatMap(line => line.coordinates), keys = new Set(first.map(coordKey));
  const shared = b.lines.flatMap(line => line.coordinates).filter(p => keys.has(coordKey(p)));
  shared.sort((x, y) => distanceKm(x, entry.near) - distanceKm(y, entry.near));
  if (!shared.length) throw new Error(`Brak węzła połączenia: ${entry.name}`);
  return { name: entry.name, coordinates: shared[0], source: `https://www.openstreetmap.org/${a.lines[0].source}` };
}

for (const route of catalog.routes.filter(route => !only || only.includes(route.id))) {
  try {
    const plan = waterPlan(route), lines = [], dates = [], areas = [], legs = [];
    for (const name of plan.rivers) {
      const river = await riverLines(name, plan.bounds);
      lines.push(...river.lines); dates.push(river.fetchedAt);
    }
    for (const id of plan.extracts) {
      const extract = await mapWays(EXTRACTS[id]); lines.push(...extract.lines); dates.push(extract.fetchedAt);
    }
    for (const id of plan.areas) {
      if (!usedAreas.has(id)) usedAreas.set(id, await waterArea(WATER_AREAS[id]));
      const area = usedAreas.get(id); areas.push(area); dates.push(area.properties.fetchedAt);
    }
    for (const leg of plan.legs) {
      const places = [];
      for (const [index, entry] of leg.points.entries()) {
        const resolved = await point(typeof entry === 'string' ? { name: entry, query: entry } : entry, plan.bounds);
        places.push(index === 0 || index === leg.points.length - 1 ? reviewedAccessTarget(resolved, accessSites) : resolved);
      }
      legs.push({ ...leg, places });
    }
    if (!lines.length && !areas.length) throw new Error('Nie pobrano żadnej geometrii wodnej.');
    const graph = new WaterGraph(lines, areas);
    const targets = legs.flatMap(leg => leg.places.map(p => p.coordinates));
    for (const area of areas) graph.addLake(area, targets);
    graph.attachTargets(targets);
    graph.addGapLinks();
    for (const leg of legs) {
      for (const index of [0, leg.places.length - 1]) {
        const anchor = accessAnchor(leg.places[index], graph, accessSites, route, index === 0 ? 'start' : 'finish');
        if (anchor) leg.places[index] = anchor;
      }
    }
    const sections = [], breaks = [], snapDistances = [];
    for (let legIndex = 0; legIndex < legs.length; legIndex++) {
      const leg = legs[legIndex];
      for (let i = 1; i < leg.places.length; i++) {
        const result = graph.path(leg.places[i - 1].coordinates, leg.places[i].coordinates);
        if (!result) throw new Error(`Brak przebiegu wodnego: ${leg.places[i - 1].name} → ${leg.places[i].name}`);
        if ((leg.places[i - 1].accessBinding === 'reviewed' || leg.places[i].accessBinding === 'reviewed') && result.steps.some(step => step.kind === 'gap' && distanceKm(step.from, step.to) > .3)) throw new Error(`Wskazane wodowanie wymaga nieudokumentowanego połączenia przez lukę: ${leg.places[i - 1].name} → ${leg.places[i].name}`);
        if (Math.max(...result.snaps) > 2.5) throw new Error(`Punkt trasy zbyt daleko od wody: ${leg.places[i - 1].name} → ${leg.places[i].name} (${result.snaps.map(n => n.toFixed(2)).join(' / ')} km).`);
        const split = sectionsFromSteps(result.steps, areas);
        sections.push(...split.sections); breaks.push(...split.breaks); snapDistances.push(...result.snaps);
      }
      if (leg.after && legs[legIndex + 1]) {
        breaks.push({ kind: 'transport', from: graph.nearest(leg.places.at(-1).coordinates).point, to: graph.nearest(legs[legIndex + 1].places[0].coordinates).point, note: leg.after });
        // Never merge two explicitly separated water legs, even if their endpoints coincide.
        sections.push({ kind: 'break', coordinates: [] });
      }
    }
    const waterSections = sections.filter(s => s.coordinates.length > 1);
    for (const gap of breaks) {
      const midpoint = [(gap.from[0] + gap.to[0]) / 2, (gap.from[1] + gap.to[1]) / 2];
      if (gap.kind === 'missing-data' && /Słupia/.test(route.river) && distanceKm(midpoint, [17.2237, 54.32535]) < .3) {
        gap.kind = 'portage';
        gap.note = 'Przerwa przy elektrowni Konradowo — przenoska opisana w źródle. Mapa nie wyznacza przejścia lądem.';
      }
    }
    const geometry = combineSections(sections);
    const measuredKm = geometryLength(geometry), partial = breaks.some(b => b.kind === 'missing-data');
    const hasLake = waterSections.some(s => s.kind === 'lake');
    const properties = {
      id: route.id, kind: hasLake ? 'water-route' : 'osm-waterway', coverage: partial ? 'partial' : 'complete',
      revision: 3, fetchedAt: dates.filter(Boolean).sort()[0], measuredKm: +measuredKm.toFixed(3),
      osmObjects: [...new Set(waterSections.filter(s => s.kind === 'river').flatMap(s => s.sources))],
      waterAreas: [...new Set(waterSections.filter(s => s.kind === 'lake').flatMap(s => s.source.split('+')))],
      places: legs.flatMap(leg => leg.places), breaks,
      accessLegs: legs.map(leg => ({ start: leg.places[0].accessSiteId ?? null, finish: leg.places.at(-1).accessSiteId ?? null })),
      launchStart: legs[0].places[0].accessSiteId ?? null, launchFinish: legs.at(-1).places.at(-1).accessSiteId ?? null,
      note: `Przebieg po korycie wody z OpenStreetMap.${hasLake ? ' Przejścia przez szersze akweny wyznaczono wewnątrz granic wody, z ominięciem wysp; są orientacyjne.' : ''}${breaks.length ? ' Przerwy nie są łączone linią: oznaczają przewózkę, przenoskę lub brak geometrii.' : ''}${plan.endpointNote ? ` ${plan.endpointNote}` : ''} Opisane miejsca dostępu mają osobne pinezki i źródła. Końce bez przypisanego wodowania są orientacyjne. Kilometraż mapy mierzy widoczne odcinki, bez przerw, i może różnić się od długości oferty.`
    };
    features.push({ type: 'Feature', properties, geometry });
    for (const line of lines) reference.set(`${line.source}:${coordKey(line.coordinates[0])}:${line.coordinates.length}`, line);
    const audit = { id: route.id, kind: properties.kind, coverage: properties.coverage, segments: geometry.type === 'MultiLineString' ? geometry.coordinates.length : 1, points: waterSections.reduce((sum, s) => sum + s.coordinates.length, 0), mappedKm: +measuredKm.toFixed(2), publishedKm: route.lengthKm, snapKm: snapDistances.map(n => +n.toFixed(3)), gaps: breaks.map(b => ({ kind: b.kind, km: +distanceKm(b.from, b.to).toFixed(3), from: b.from, to: b.to })), lakes: properties.waterAreas };
    audits.push(audit);
    if (!quiet || partial || Math.max(...snapDistances) > 1) console.log(JSON.stringify(audit));
  } catch (error) { errors.push(`${route.id}: ${error.message}`); console.error(errors.at(-1)); }
}
const outputRoot = only ? path.join(root, '.cache') : path.join(root, 'data');
await writeFile(path.join(outputRoot, 'geometry-audit.json'), JSON.stringify({ generatedAt: new Date().toISOString(), routes: audits, errors }, null, 2) + '\n');
if (errors.length) throw new Error(`Nie zapisano mapy: ${errors.length} tras wymaga uzupełnienia danych.\n${errors.join('\n')}`);
const collection = { type: 'FeatureCollection', revision: 3, attribution: '© OpenStreetMap contributors, ODbL 1.0', licence: 'https://www.openstreetmap.org/copyright', features };
await writeFile(path.join(outputRoot, 'route-map.geojson'), JSON.stringify(collection) + '\n');
await writeFile(path.join(outputRoot, 'water-areas.geojson'), JSON.stringify({ type: 'FeatureCollection', features: [...usedAreas.values()] }) + '\n');
await writeFile(path.join(outputRoot, 'waterways-reference.json'), JSON.stringify([...reference.values()]) + '\n');
console.log(`Przebieg wodny: ${features.length} tras, ${features.filter(f => f.geometry.type === 'MultiLineString').length} z oddzielnymi fragmentami. Bez prostych zastępujących rzeki.`);
