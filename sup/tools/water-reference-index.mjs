import { distanceKm } from '../src/core.js';

// Use the complete source waterway, not a route already clipped at a town. A
// campsite's southern corner can be closest to a clipped route while its real
// river frontage lies a few hundred metres further downstream.
export function waterReferenceIndex(lines) {
  const cells = new Map(), size = .01;
  const cell = point => point.map(value => Math.floor(value / size));
  for (const line of lines) for (let i = 1; i < line.coordinates.length; i++) {
    const a = line.coordinates[i - 1], b = line.coordinates[i];
    const min = cell([Math.min(a[0], b[0]), Math.min(a[1], b[1])]), max = cell([Math.max(a[0], b[0]), Math.max(a[1], b[1])]);
    const edge = { a, b, source: line.source };
    for (let x = min[0]; x <= max[0]; x++) for (let y = min[1]; y <= max[1]; y++) {
      const key = `${x}:${y}`; if (!cells.has(key)) cells.set(key, []); cells.get(key).push(edge);
    }
  }
  return point => {
    const [x, y] = cell(point), scale = Math.cos(point[1] * Math.PI / 180); let best = null;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const edge of cells.get(`${x + dx}:${y + dy}`) ?? []) {
      const vx = (edge.b[0] - edge.a[0]) * scale, vy = edge.b[1] - edge.a[1];
      const t = Math.max(0, Math.min(1, ((point[0] - edge.a[0]) * scale * vx + (point[1] - edge.a[1]) * vy) / (vx * vx + vy * vy || 1)));
      const coordinates = [edge.a[0] + (edge.b[0] - edge.a[0]) * t, edge.a[1] + (edge.b[1] - edge.a[1]) * t];
      const distance = distanceKm(point, coordinates);
      if (!best || distance < best.distance) best = { distance, coordinates, source: edge.source };
    }
    return best;
  };
}
