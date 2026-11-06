import { distanceKm, geometryLength } from '../src/core.js';

const keyOf = p => p.map(n => n.toFixed(7)).join(',');
export class MinHeap {
  items = [];
  push(value, score) {
    const item = { value, score }; let i = this.items.length; this.items.push(item);
    while (i) { const parent = (i - 1) >> 1; if (this.items[parent].score <= score) break; this.items[i] = this.items[parent]; i = parent; }
    this.items[i] = item;
  }
  pop() {
    const first = this.items[0], last = this.items.pop();
    if (this.items.length) {
      let i = 0;
      while (i * 2 + 1 < this.items.length) {
        let child = i * 2 + 1;
        if (child + 1 < this.items.length && this.items[child + 1].score < this.items[child].score) child++;
        if (this.items[child].score >= last.score) break;
        this.items[i] = this.items[child]; i = child;
      }
      this.items[i] = last;
    }
    return first;
  }
  get size() { return this.items.length; }
}
function pointOnSegment(p, a, b) {
  const cross = (p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0]);
  return Math.abs(cross) < 1e-12 && p[0] >= Math.min(a[0], b[0]) - 1e-10 && p[0] <= Math.max(a[0], b[0]) + 1e-10 && p[1] >= Math.min(a[1], b[1]) - 1e-10 && p[1] <= Math.max(a[1], b[1]) + 1e-10;
}
function ringContains(p, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j], b = ring[i];
    if (pointOnSegment(p, a, b)) return true;
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
export function containsWater(point, geometry) {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return polygons.some(rings => ringContains(point, rings[0]) && !rings.slice(1).some(ring => ringContains(point, ring)));
}
function crosses(a, b, c, d) {
  const orient = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  return orient(a, b, c) * orient(a, b, d) < -1e-22 && orient(c, d, a) * orient(c, d, b) < -1e-22;
}
export function segmentInWater(a, b, geometry) {
  if (!containsWater(a, geometry) || !containsWater(b, geometry)) return false;
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  for (const rings of polygons) for (const ring of rings) for (let i = 1; i < ring.length; i++) {
    if (crosses(a, b, ring[i - 1], ring[i])) return false;
  }
  return containsWater([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], geometry);
}
export function segmentInWaterUnion(a, b, areas) {
  const contains = p => areas.some(area => containsWater(p, area.geometry));
  if (!contains(a) || !contains(b)) return false;
  const ts = [0, 1], dx = b[0] - a[0], dy = b[1] - a[1];
  for (const area of areas) {
    const polygons = area.geometry.type === 'Polygon' ? [area.geometry.coordinates] : area.geometry.coordinates;
    for (const rings of polygons) for (const ring of rings) for (let i = 1; i < ring.length; i++) {
      const c = ring[i - 1], d = ring[i], ex = d[0] - c[0], ey = d[1] - c[1], denominator = dx * ey - dy * ex;
      if (Math.abs(denominator) < 1e-16) continue;
      const t = ((c[0] - a[0]) * ey - (c[1] - a[1]) * ex) / denominator;
      const u = ((c[0] - a[0]) * dy - (c[1] - a[1]) * dx) / denominator;
      if (t > 0 && t < 1 && u >= 0 && u <= 1) ts.push(t);
    }
  }
  ts.sort((x, y) => x - y);
  return ts.slice(1).every((t, i) => contains([a[0] + dx * (t + ts[i]) / 2, a[1] + dy * (t + ts[i]) / 2]));
}
export function densify(line, maxKm = .15) {
  const result = [line[0]];
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i], steps = Math.max(1, Math.ceil(distanceKm(a, b) / maxKm));
    for (let n = 1; n <= steps; n++) result.push([a[0] + (b[0] - a[0]) * n / steps, a[1] + (b[1] - a[1]) * n / steps]);
  }
  return result;
}

export class WaterGraph {
  nodes = new Map();
  riverEnds = new Set();
  constructor(lines, areas = []) {
    this.areas = areas;
    for (const line of lines) {
      const coordinates = line.coordinates;
      for (let i = 1; i < coordinates.length; i++) {
        const a = coordinates[i - 1], b = coordinates[i];
        // An abstract OSM lake axis occasionally crosses an island. The water
        // mesh supplies the route around it instead of painting across land.
        if (areas.some(area => containsWater(a, area.geometry) && containsWater(b, area.geometry) && !segmentInWater(a, b, area.geometry))) continue;
        const refined = densify([a, b]);
        for (let n = 1; n < refined.length; n++) this.connect(refined[n - 1], refined[n], { kind: 'river', source: line.source });
      }
      this.riverEnds.add(keyOf(coordinates[0])); this.riverEnds.add(keyOf(coordinates.at(-1)));
    }
  }
  node(point, lake = null) {
    const key = keyOf(point);
    if (!this.nodes.has(key)) this.nodes.set(key, { point, edges: new Map(), lake });
    return key;
  }
  connect(a, b, metadata, multiplier = 1) {
    const from = this.node(a, metadata.kind === 'lake' ? metadata.source : null), to = this.node(b, metadata.kind === 'lake' ? metadata.source : null);
    if (from === to) return;
    const weight = distanceKm(a, b) * multiplier + (metadata.kind === 'gap' ? 2 : 0);
    const old = this.nodes.get(from).edges.get(to);
    if (old && old.weight <= weight) return;
    this.nodes.get(from).edges.set(to, { ...metadata, weight });
    this.nodes.get(to).edges.set(from, { ...metadata, weight });
  }
  addLake(area, targets) {
    const coordinates = area.geometry.coordinates.flat(area.geometry.type === 'Polygon' ? 1 : 2);
    const minX = Math.min(...coordinates.map(p => p[0])), maxX = Math.max(...coordinates.map(p => p[0]));
    const minY = Math.min(...coordinates.map(p => p[1])), maxY = Math.max(...coordinates.map(p => p[1]));
    const stepY = .06 / 111.195, stepX = stepY / Math.cos((minY + maxY) / 2 * Math.PI / 180);
    const cells = new Map(), mesh = [];
    const inBounds = p => p[0] >= minX && p[0] <= maxX && p[1] >= minY && p[1] <= maxY;
    // Include flow vertices at entrances, endpoints of ways and the closest
    // flow vertex to each requested location. Do not join through dry banks.
    const existing = [...this.nodes].filter(([, n]) => !n.lake && inBounds(n.point) && containsWater(n.point, area.geometry));
    const attachments = existing.filter(([key, n]) => this.riverEnds.has(key) || n.edges.size === 1 || [...n.edges.keys()].some(k => !containsWater(this.nodes.get(k).point, area.geometry)));
    for (const target of targets) {
      if (!existing.length) continue;
      const nearest = existing.reduce((best, candidate) => distanceKm(candidate[1].point, target) < distanceKm(best[1].point, target) ? candidate : best);
      if (!attachments.some(([key]) => key === nearest[0])) attachments.push(nearest);
    }
    for (let row = 0, y = minY + stepY / 2; y < maxY; row++, y += stepY) {
      for (let col = 0, x = minX + stepX / 2; x < maxX; col++, x += stepX) {
        const point = [x, y];
        if (!containsWater(point, area.geometry)) continue;
        const key = this.node(point, area.properties.id); cells.set(`${col}:${row}`, key); mesh.push([key, point]);
        for (const [dx, dy] of [[-1, 0], [0, -1], [-1, -1], [1, -1]]) {
          const previous = cells.get(`${col + dx}:${row + dy}`);
          if (previous && segmentInWater(point, this.nodes.get(previous).point, area.geometry)) this.connect(point, this.nodes.get(previous).point, { kind: 'lake', source: area.properties.id });
        }
      }
    }
    // A 60 m grid can miss a narrow marina entrance even when its landing is
    // inside the mapped water polygon. Refine only the neighbourhoods of such
    // targets; every fine/fine and fine/coarse edge still has to be in water.
    const fineY = .01 / 111.195, fineX = fineY / Math.cos((minY + maxY) / 2 * Math.PI / 180);
    for (const target of targets) {
      if (!inBounds(target) || mesh.some(([key, point]) => this.nodes.get(key).edges.size >= 4 && distanceKm(point, target) < .06)) continue;
      const centreCol = Math.floor((target[0] - minX) / fineX), centreRow = Math.floor((target[1] - minY) / fineY), fine = new Map();
      for (let row = centreRow - 40; row <= centreRow + 40; row++) for (let col = centreCol - 40; col <= centreCol + 40; col++) {
        const point = [minX + (col + .5) * fineX, minY + (row + .5) * fineY];
        if (!inBounds(point) || !containsWater(point, area.geometry)) continue;
        const key = this.node(point, area.properties.id); fine.set(`${col}:${row}`, key); mesh.push([key, point]);
        for (const [dx, dy] of [[-1, 0], [0, -1], [-1, -1], [1, -1]]) {
          const previous = fine.get(`${col + dx}:${row + dy}`);
          if (previous && segmentInWater(point, this.nodes.get(previous).point, area.geometry)) this.connect(point, this.nodes.get(previous).point, { kind: 'lake', source: area.properties.id });
        }
        const coarseCol = Math.round((point[0] - minX) / stepX - .5), coarseRow = Math.round((point[1] - minY) / stepY - .5);
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
          const coarse = cells.get(`${coarseCol + dx}:${coarseRow + dy}`);
          if (coarse && segmentInWater(point, this.nodes.get(coarse).point, area.geometry)) this.connect(point, this.nodes.get(coarse).point, { kind: 'lake', source: area.properties.id });
        }
      }
    }
    for (const [, vertex] of attachments) {
      const nearby = mesh.map(([key, point]) => ({ key, point, distance: distanceKm(vertex.point, point) })).filter(p => p.distance < .2).sort((a, b) => a.distance - b.distance);
      for (const candidate of nearby.slice(0, 8)) {
        if (segmentInWater(vertex.point, candidate.point, area.geometry)) this.connect(vertex.point, candidate.point, { kind: 'lake', source: area.properties.id });
      }
    }
  }
  nearest(point) {
    let result = null;
    for (const [key, node] of this.nodes) {
      if (!node.edges.size) continue;
      const distance = distanceKm(point, node.point);
      if (!result || distance < result.distance) result = { key, distance, point: node.point };
    }
    return result;
  }
  attachTargets(targets) {
    // Subdivide an existing water edge at the exact closest projection. A
    // coarse river vertex (up to 150 m away along the line) must not be confused
    // with the actual distance of a landing from water. No land connector is
    // added: only the projected point becomes a graph vertex.
    const edges = [];
    for (const [from, node] of this.nodes) for (const [to, metadata] of node.edges) {
      if (from < to && metadata.kind !== 'gap') edges.push({ a: node.point, b: this.nodes.get(to).point, metadata });
    }
    const projections = new Map();
    for (const target of targets) {
      const scale = Math.cos(target[1] * Math.PI / 180); let best = null;
      for (const [index, edge] of edges.entries()) {
        const { a, b } = edge, dx = (b[0] - a[0]) * scale, dy = b[1] - a[1];
        const t = Math.max(0, Math.min(1, ((target[0] - a[0]) * scale * dx + (target[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
        const point = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], distance = distanceKm(target, point);
        if (!best || distance < best.distance) best = { ...edge, point, distance, index, t };
      }
      if (best) {
        if (!projections.has(best.index)) projections.set(best.index, []);
        projections.get(best.index).push(best);
      }
    }
    for (const [index, splits] of projections) {
      const edge = edges[index], points = [edge.a, ...splits.sort((a, b) => a.t - b.t).map(split => split.point), edge.b];
      for (let i = 1; i < points.length; i++) this.connect(points[i - 1], points[i], edge.metadata);
    }
  }
  components() {
    const seen = new Set(), components = [];
    for (const key of this.nodes.keys()) {
      if (seen.has(key) || !this.nodes.get(key).edges.size) continue;
      const queue = [key], endpoints = [], all = []; seen.add(key);
      while (queue.length) {
        const current = queue.pop(), node = this.nodes.get(current); all.push(current);
        if ((!node.lake && (node.edges.size === 1 || this.riverEnds.has(current))) || (node.lake && node.edges.size < 8)) endpoints.push(current);
        for (const [next, edge] of node.edges) if (edge.kind !== 'gap' && !seen.has(next)) { seen.add(next); queue.push(next); }
      }
      if (!endpoints.length) endpoints.push(all[0]);
      components.push({ all, endpoints });
    }
    return components;
  }
  addGapLinks(maxKm = 8) {
    const components = this.components();
    for (let i = 0; i < components.length; i++) for (let j = i + 1; j < components.length; j++) {
      let best = null; const waterCandidates = [];
      for (const a of components[i].endpoints) for (const b of components[j].endpoints) {
        const first = this.nodes.get(a).point, last = this.nodes.get(b).point;
        const length = distanceKm(first, last);
        if (length <= maxKm && (!best || length < best.length)) best = { first, last, length };
        if (length < .25 && (this.nodes.get(a).lake || this.nodes.get(b).lake)) waterCandidates.push({ first, last, length });
      }
      const bridge = waterCandidates.sort((a, b) => a.length - b.length).slice(0, 40).find(pair => segmentInWaterUnion(pair.first, pair.last, this.areas));
      if (bridge) {
        const source = this.areas.filter(area => containsWater(bridge.first, area.geometry) || containsWater(bridge.last, area.geometry)).map(area => area.properties.id).join('+');
        this.connect(bridge.first, bridge.last, { kind: 'lake', source });
      } else if (best) this.connect(best.first, best.last, { kind: 'gap', source: 'missing-data' }, 30);
    }
  }
  path(from, to) {
    const start = this.nearest(from), finish = this.nearest(to);
    if (!start || !finish) return null;
    const heap = new MinHeap(), distances = new Map([[start.key, 0]]), previous = new Map();
    heap.push(start.key, 0);
    while (heap.size) {
      const item = heap.pop();
      if (item.score !== distances.get(item.value)) continue;
      if (item.value === finish.key) break;
      for (const [next, edge] of this.nodes.get(item.value).edges) {
        const score = item.score + edge.weight;
        if (score < (distances.get(next) ?? Infinity)) { distances.set(next, score); previous.set(next, { key: item.value, edge }); heap.push(next, score); }
      }
    }
    if (!distances.has(finish.key)) return null;
    const steps = [];
    for (let key = finish.key; key !== start.key;) {
      const parent = previous.get(key);
      steps.push({ from: this.nodes.get(parent.key).point, to: this.nodes.get(key).point, ...parent.edge }); key = parent.key;
    }
    return { steps: steps.reverse(), snaps: [start.distance, finish.distance] };
  }
}

export function sectionsFromSteps(steps, areas) {
  const sections = [], breaks = [];
  let current = null;
  for (const step of steps) {
    if (step.kind === 'gap') {
      current = null; breaks.push({ from: step.from, to: step.to, kind: 'missing-data', note: 'Przerwa w geometrii wody; nie jest narysowana jako odcinek trasy.' }); continue;
    }
    if (!current || current.kind !== step.kind || (step.kind === 'lake' && current.source !== step.source) || keyOf(current.coordinates.at(-1)) !== keyOf(step.from)) {
      current = { kind: step.kind, source: step.source, sources: [], coordinates: [step.from] }; sections.push(current);
    }
    if (!current.sources.includes(step.source)) current.sources.push(step.source);
    current.coordinates.push(step.to);
  }
  for (const section of sections.filter(s => s.kind === 'lake')) {
    const relevant = areas.filter(a => section.source.split('+').includes(a.properties.id));
    const path = section.coordinates, smoothed = [path[0]];
    for (let i = 0; i < path.length - 1;) {
      let next = path.length - 1;
      while (next > i + 1 && !segmentInWaterUnion(path[i], path[next], relevant)) next--;
      smoothed.push(path[next]); i = next;
    }
    section.coordinates = densify(smoothed, .12);
  }
  return { sections, breaks };
}
export function combineSections(sections) {
  const lines = []; let forceNew = false;
  for (const section of sections) {
    if (section.kind === 'break') { forceNew = true; continue; }
    const last = lines.at(-1);
    if (!forceNew && last && keyOf(last.at(-1)) === keyOf(section.coordinates[0])) last.push(...section.coordinates.slice(1));
    else lines.push([...section.coordinates]);
    forceNew = false;
  }
  const coordinates = lines.filter(line => line.length > 1 && geometryLength({ type: 'LineString', coordinates: line }) > .002).map(line => line.map(p => p.map(n => +n.toFixed(7))));
  if (!coordinates.length) throw new Error('Brak geometrii wodnej — nie wolno zastąpić jej prostą między miejscowościami.');
  return coordinates.length === 1 ? { type: 'LineString', coordinates: coordinates[0] } : { type: 'MultiLineString', coordinates };
}
