import { distanceKm, geometryLength, linesOfGeometry } from './core.js';

const indexes = new WeakMap();
const signatures = new WeakMap();
// Detect mixed static-data releases before using edge indexes from another
// geometry. This is a cache/version key, not a security hash.
export function geometryKey(geometry) {
  if (signatures.has(geometry)) return signatures.get(geometry);
  const text = JSON.stringify(geometry); let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619) >>> 0;
  const key = `${text.length}:${hash.toString(16)}`; signatures.set(geometry, key); return key;
}
function indexed(geometry) {
  if (indexes.has(geometry)) return indexes.get(geometry);
  let total = 0;
  const lines = linesOfGeometry(geometry).map((points, line) => {
    const edges = points.slice(1).map((b, edge) => {
      const a = points[edge], length = distanceKm(a, b), km = total; total += length;
      return { a, b, line, edge, length, km };
    });
    return edges;
  });
  const result = { lines, length: total }; indexes.set(geometry, result); return result;
}
export function comparePositions(a, b) { return a.line - b.line || a.edge - b.edge || a.t - b.t; }
export function locateAccess(coordinates, geometry, maxKm = .25) {
  const scale = Math.cos(coordinates[1] * Math.PI / 180), occurrences = [];
  for (const edges of indexed(geometry).lines) {
    const nearby = [];
    for (const edge of edges) {
      const { a, b } = edge;
      const dx = (b[0] - a[0]) * scale, dy = b[1] - a[1];
      const t = Math.max(0, Math.min(1, (((coordinates[0] - a[0]) * scale) * dx + (coordinates[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
      const point = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      const distance = distanceKm(coordinates, point);
      if (distance > maxKm) { nearby.push(null); continue; }
      const position = { line: edge.line, edge: edge.edge, t, coordinates: point, km: edge.km + edge.length * t, distanceKm: distance };
      nearby.push(position);
    }
    for (let i = 0; i < nearby.length; i++) {
      const point = nearby[i]; if (!point) continue;
      if (point.distanceKm > (nearby[i - 1]?.distanceKm ?? Infinity) + 1e-8 || point.distanceKm > (nearby[i + 1]?.distanceKm ?? Infinity) + 1e-8) continue;
      const previous = occurrences.at(-1);
      if (previous?.line === point.line && Math.abs(previous.km - point.km) < .05) {
        if (point.distanceKm < previous.distanceKm) occurrences[occurrences.length - 1] = point;
      } else occurrences.push(point);
    }
  }
  return occurrences.sort(comparePositions);
}
export function nearestAccessPosition(coordinates, geometry, maxKm = Infinity) {
  return locateAccess(coordinates, geometry, maxKm).sort((a, b) => a.distanceKm - b.distanceKm)[0] ?? null;
}
export function sliceWaterGeometry(geometry, from, to) {
  if (comparePositions(from, to) >= 0) throw new Error('Meta musi znajdować się dalej na trasie niż start.');
  const original = linesOfGeometry(geometry), result = [];
  for (let i = from.line; i <= to.line; i++) {
    const points = original[i], firstEdge = i === from.line ? from.edge : 0, lastEdge = i === to.line ? to.edge : points.length - 2;
    const line = [i === from.line ? from.coordinates : points[0]];
    for (let edge = firstEdge; edge <= lastEdge; edge++) line.push(i === to.line && edge === lastEdge ? to.coordinates : points[edge + 1]);
    const clean = line.filter((p, index) => !index || distanceKm(p, line[index - 1]) > .00001);
    if (clean.length > 1 && geometryLength({ type: 'LineString', coordinates: clean }) > .005) result.push(clean);
  }
  if (!result.length) throw new Error('Pomiędzy tymi punktami nie ma odcinka wodnego.');
  const output = result.length === 1 ? { type: 'LineString', coordinates: result[0] } : { type: 'MultiLineString', coordinates: result };
  if (geometryLength(output) < .05) throw new Error('Wybierz odcinek dłuższy niż 50 metrów.');
  return output;
}
export function sectionBetween(feature, from, to, sites) {
  const geometry = sliceWaterGeometry(feature.geometry, from.position, to.position);
  const start = sites.get(from.siteId), finish = sites.get(to.siteId);
  if (!start?.selectable || !finish?.selectable) throw new Error('Wybierz opisane miejsce dostępu do wody.');
  const breaks = (feature.properties.breaks ?? []).filter(gap => {
    const a = locateAccess(gap.from, feature.geometry, .015), b = locateAccess(gap.to, feature.geometry, .015);
    return a.some(p => comparePositions(from.position, p) <= 0 && comparePositions(p, to.position) < 0) && b.some(p => comparePositions(from.position, p) < 0 && comparePositions(p, to.position) <= 0);
  });
  return {
    geometry, lengthKm: geometryLength(geometry), from: start.name, to: finish.name,
    selection: { startSiteId: start.id, endSiteId: finish.id, startOccurrenceId: from.id, endOccurrenceId: to.id, fromName: start.name, toName: finish.name },
    properties: { ...feature.properties, breaks, measuredKm: geometryLength(geometry), launchStart: start.id, launchFinish: finish.id }
  };
}
export const ACCESS_LABELS = { documented: 'Opisane w źródle turystycznym', mapped: 'Oznaczone w OpenStreetMap', conditional: 'Dostęp po uzgodnieniu', planned: 'W przygotowaniu', restricted: 'Dostęp zabroniony wg OSM', review: 'Lokalizacja do potwierdzenia' };
