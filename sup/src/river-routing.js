import { distanceKm, geometryLength, validateGeometry } from './core.js';

const keyOf = point => point.map(n => n.toFixed(7)).join(',');
export const RIVER_SNAP_KM = .15;

function project(point, a, b) {
  const scale = Math.cos(point[1] * Math.PI / 180);
  const dx = (b[0] - a[0]) * scale, dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((point[0] - a[0]) * scale * dx + (point[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  const coordinates = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  return { coordinates, t, distanceKm: distanceKm(point, coordinates) };
}

// Find a named waterway for the first map tap without building every graph.
// The caller resolves ambiguous crossings by asking for an explicit river.
export function riversAtPoint(rivers, point, maxKm = RIVER_SNAP_KM) {
  if (!Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite)) return [];
  const latMargin = maxKm / 110, lngMargin = latMargin / Math.cos(point[1] * Math.PI / 180);
  const matches = [];
  for (const river of rivers) {
    let nearest = null;
    for (const line of river.lines) for (let i = 1; i < line.length; i++) {
      const a = line[i - 1], b = line[i];
      if (point[0] < Math.min(a[0], b[0]) - lngMargin || point[0] > Math.max(a[0], b[0]) + lngMargin || point[1] < Math.min(a[1], b[1]) - latMargin || point[1] > Math.max(a[1], b[1]) + latMargin) continue;
      const snap = project(point, a, b);
      if (snap.distanceKm <= maxKm && (!nearest || snap.distanceKm < nearest.distanceKm)) nearest = snap;
    }
    if (nearest) matches.push({ river, ...nearest });
  }
  return matches.sort((a, b) => a.distanceKm - b.distanceKm);
}

// The graph contains water edges only. Close banks, meanders and disconnected
// parts are never joined by proximity. Travel is allowed in either direction.
export class RiverNetwork {
  constructor(lines) {
    this.nodes = new Map(); this.edges = [];
    const seen = new Set(), original = [];
    for (const line of lines) for (let i = 1; i < line.length; i++) {
      const a = this.node(line[i - 1]), b = this.node(line[i]);
      if (a === b) continue;
      const key = [a, b].sort().join(':');
      if (seen.has(key)) continue;
      seen.add(key);
      const edge = { a, b, coordinates: [this.nodes.get(a).point, this.nodes.get(b).point] };
      original.push(edge);
    }
    // Catalogue lines can end inside an OSM edge (or vice versa). Connect only
    // coincident projections, allowing 2 cm for the stored coordinate rounding.
    // This does not bridge gaps or join two nearby bends of a river.
    const endpoints = [...new Set(lines.flatMap(line => [keyOf(line[0]), keyOf(line.at(-1))]))];
    seen.clear();
    for (const edge of original) {
      const splits = [{ key: edge.a, t: 0 }, { key: edge.b, t: 1 }];
      for (const key of endpoints) {
        if (edge.a === key || edge.b === key) continue;
        const point = this.nodes.get(key).point;
        const [a, b] = edge.coordinates;
        if (point[0] < Math.min(a[0], b[0]) - .000001 || point[0] > Math.max(a[0], b[0]) + .000001 || point[1] < Math.min(a[1], b[1]) - .000001 || point[1] > Math.max(a[1], b[1]) + .000001) continue;
        const projection = project(point, a, b);
        if (projection.distanceKm <= .00002) splits.push({ key, t: projection.t });
      }
      splits.sort((a, b) => a.t - b.t);
      for (let i = 1; i < splits.length; i++) {
        const a = splits[i - 1].key, b = splits[i].key, key = [a, b].sort().join(':');
        if (a === b || seen.has(key)) continue;
        seen.add(key); this.connect(a, b);
        this.edges.push({ a, b, coordinates: [this.nodes.get(a).point, this.nodes.get(b).point] });
      }
    }
  }
  node(point) {
    const key = keyOf(point);
    if (!this.nodes.has(key)) this.nodes.set(key, { point, edges: new Map() });
    return key;
  }
  connect(a, b) {
    if (a === b) return;
    const weight = distanceKm(this.nodes.get(a).point, this.nodes.get(b).point);
    this.nodes.get(a).edges.set(b, weight); this.nodes.get(b).edges.set(a, weight);
  }
  snap(point, maxKm = RIVER_SNAP_KM) {
    if (!Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite)) return null;
    let best = null;
    for (const edge of this.edges) {
      const candidate = project(point, ...edge.coordinates);
      if (candidate.distanceKm <= maxKm && (!best || candidate.distanceKm < best.distanceKm)) best = { ...candidate, edge };
    }
    return best;
  }
  route(from, to) {
    const start = this.snap(from), finish = this.snap(to);
    if (!start || !finish) throw new Error('Start lub meta leży zbyt daleko od dostępnego przebiegu tej rzeki. Wskaż punkt na wyróżnionej linii (do 150 m od niej).');
    if (distanceKm(start.coordinates, finish.coordinates) < .005) throw new Error('Start i meta są w tym samym miejscu. Wybierz dwa różne punkty na rzece.');
    // Virtual endpoints split their edges without mutating the reusable graph.
    const extra = new Map(), points = new Map([['start', start.coordinates], ['finish', finish.coordinates]]);
    const position = key => points.get(key) ?? this.nodes.get(key).point;
    const link = (a, b) => {
      if (!extra.has(a)) extra.set(a, new Map());
      if (!extra.has(b)) extra.set(b, new Map());
      const length = distanceKm(position(a), position(b));
      extra.get(a).set(b, length); extra.get(b).set(a, length);
    };
    for (const [key, snap] of [['start', start], ['finish', finish]]) {
      link(key, snap.edge.a); link(key, snap.edge.b);
      // Also attach to a coincident subdivision of the same water edge.
      const vertex = this.nodes.get(keyOf(snap.coordinates));
      if (vertex) link(key, keyOf(vertex.point));
    }
    if (start.edge === finish.edge) link('start', 'finish');
    const distances = new Map([['start', 0]]), previous = new Map(), queue = new MinHeap();
    queue.push('start', 0);
    while (queue.size) {
      const { key, distance } = queue.pop();
      if (distance !== distances.get(key)) continue;
      if (key === 'finish') break;
      for (const [next, length] of [...(this.nodes.get(key)?.edges ?? []), ...(extra.get(key) ?? [])]) {
        const score = distance + length;
        if (score < (distances.get(next) ?? Infinity)) { distances.set(next, score); previous.set(next, key); queue.push(next, score); }
      }
    }
    if (!distances.has('finish')) throw new Error('Brakuje ciągłego połączenia po wodzie między tymi punktami. Wybierz krótszy odcinek lub wczytaj ślad GPX.');
    const coordinates = [];
    for (let key = 'finish'; key; key = previous.get(key)) coordinates.push(position(key));
    coordinates.reverse();
    const geometry = validateGeometry({ type: 'LineString', coordinates: coordinates.filter((p, i) => !i || distanceKm(p, coordinates[i - 1]) > .000001) });
    return { geometry, distanceKm: geometryLength(geometry), snaps: [start, finish] };
  }
}

class MinHeap {
  items = [];
  get size() { return this.items.length; }
  push(key, distance) {
    const item = { key, distance }; let i = this.items.length; this.items.push(item);
    while (i) { const parent = (i - 1) >> 1; if (this.items[parent].distance <= distance) break; this.items[i] = this.items[parent]; i = parent; }
    this.items[i] = item;
  }
  pop() {
    const first = this.items[0], last = this.items.pop();
    if (this.items.length) {
      let i = 0;
      while (i * 2 + 1 < this.items.length) {
        let child = i * 2 + 1;
        if (child + 1 < this.items.length && this.items[child + 1].distance < this.items[child].distance) child++;
        if (this.items[child].distance >= last.distance) break;
        this.items[i] = this.items[child]; i = child;
      }
      this.items[i] = last;
    }
    return first;
  }
}
