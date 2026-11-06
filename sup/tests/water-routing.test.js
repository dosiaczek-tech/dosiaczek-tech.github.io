import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { WaterGraph, containsWater, segmentInWater, segmentInWaterUnion, sectionsFromSteps, combineSections } from '../tools/water-graph.mjs';
import { linesOfGeometry, distanceKm, geometryLength } from '../src/core.js';

const rectangle = (left, bottom, right, top) => [[left, bottom], [right, bottom], [right, top], [left, top], [left, bottom]];
test('lake routing goes around islands and never fills a dry gap with a straight edge', () => {
  const area = { properties: { id: 'test-lake' }, geometry: { type: 'Polygon', coordinates: [rectangle(18, 53, 18.02, 53.01), rectangle(18.008, 53.003, 18.012, 53.007)] } };
  const from = [18.002, 53.005], to = [18.018, 53.005];
  assert.equal(segmentInWater(from, to, area.geometry), false);
  const graph = new WaterGraph([], [area]); graph.addLake(area, [from, to]); graph.addGapLinks();
  const result = graph.path(from, to);
  assert.ok(result);
  assert.ok(result.steps.every(step => step.kind === 'lake'));
  const { sections, breaks } = sectionsFromSteps(result.steps, [area]);
  assert.equal(breaks.length, 0);
  const geometry = combineSections(sections);
  for (const line of linesOfGeometry(geometry)) for (let i = 1; i < line.length; i++) assert.ok(segmentInWater(line[i - 1], line[i], area.geometry));
  const disconnected = new WaterGraph([{ source: 'test-river', coordinates: [[18, 53], [18.01, 53]] }, { source: 'test-river', coordinates: [[18.012, 53], [18.02, 53]] }]);
  disconnected.addGapLinks();
  const split = sectionsFromSteps(disconnected.path([18, 53], [18.02, 53]).steps, []);
  const segments = combineSections(split.sections);
  assert.equal(segments.type, 'MultiLineString');
  assert.equal(split.breaks.length, 1);
  assert.ok(geometryLength(segments) < distanceKm([18, 53], [18.02, 53]));
});

test('lake unions allow water connections but reject a narrow land strip', () => {
  const area = (id, ring) => ({ properties: { id }, geometry: { type: 'Polygon', coordinates: [ring] } });
  const a = area('a', rectangle(18, 53, 18.01, 53.01));
  const touching = area('b', rectangle(18.01, 53, 18.02, 53.01));
  const separated = area('c', rectangle(18.0101, 53, 18.02, 53.01));
  assert.equal(segmentInWaterUnion([18.005, 53.005], [18.015, 53.005], [a, touching]), true);
  assert.equal(segmentInWaterUnion([18.005, 53.005], [18.015, 53.005], [a, separated]), false);
});

test('two landing projections on one sparse water edge connect directly without a land connector', () => {
  const graph = new WaterGraph([{ source: 'water-edge', coordinates: [[18, 54], [18.004, 54]] }]);
  const a = [18.0004, 54.0005], b = [18.0009, 54.0005];
  graph.attachTargets([a, b]);
  const start = graph.nearest(a), finish = graph.nearest(b);
  assert.ok(Math.abs(start.point[0] - a[0]) < 1e-9);
  assert.ok(Math.abs(finish.point[0] - b[0]) < 1e-9);
  const route = graph.path(a, b);
  assert.ok(route.steps.every(step => step.from[1] === 54 && step.to[1] === 54));
  const length = route.steps.reduce((sum, step) => sum + distanceKm(step.from, step.to), 0);
  assert.ok(Math.abs(length - distanceKm(start.point, finish.point)) < .00001);
});

test('a landing in a narrow inlet is connected through water rather than rejected by the coarse grid', () => {
  const area = { properties: { id: 'marina' }, geometry: { type: 'Polygon', coordinates: [[[18, 54.005], [18.004, 54.005], [18.004, 54], [18.012, 54], [18.012, 54.01], [18.004, 54.01], [18.004, 54.00512], [18, 54.00512], [18, 54.005]]] } };
  const from = [18.0001, 54.00506], to = [18.009, 54.006];
  const graph = new WaterGraph([], [area]); graph.addLake(area, [from, to]); graph.attachTargets([from, to]); graph.addGapLinks();
  const route = graph.path(from, to);
  assert.ok(route && route.snaps.every(distance => distance < .03));
  assert.ok(route.steps.every(step => step.kind === 'lake' && segmentInWater(step.from, step.to, area.geometry)));
});

const map = JSON.parse(await readFile(new URL('../data/route-map.geojson', import.meta.url)));
const areas = JSON.parse(await readFile(new URL('../data/water-areas.geojson', import.meta.url))).features;
const reference = JSON.parse(await readFile(new URL('../data/waterways-reference.json', import.meta.url)));
const personalRivers = JSON.parse(await readFile(new URL('../data/river-network.json', import.meta.url))).rivers;
const audit = JSON.parse(await readFile(new URL('../data/geometry-audit.json', import.meta.url)));

test('Radunia has three water legs, two transfers and no line through the excluded stretches', () => {
  const radunia = map.features.find(f => f.properties.id === 'radunia-stezyca-gdansk');
  assert.equal(radunia.geometry.type, 'MultiLineString');
  assert.equal(radunia.geometry.coordinates.length, 3);
  assert.equal(radunia.properties.breaks.filter(gap => gap.kind === 'transport').length, 2);
  assert.ok(radunia.geometry.coordinates.flat().length > 1000);
  for (const point of radunia.geometry.coordinates.flat()) {
    const inJar = point[0] > 18.25 && point[0] < 18.32 && point[1] > 54.29 && point[1] < 54.33;
    const inStraszynReservoir = point[0] > 18.48 && point[0] < 18.57 && point[1] > 54.24 && point[1] < 54.28;
    assert.equal(inJar || inStraszynReservoir, false, `Niedostępny fragment: ${point}`);
  }
  assert.ok(radunia.geometry.coordinates.at(-1).at(-1)[0] > 18.65, 'Końcówka ma sięgać Motławy w Gdańsku.');
  assert.equal(audit.errors.length, 0);
  assert.equal(audit.routes.length, 117);
  assert.ok(audit.routes.every(route => route.snapKm.every(distance => distance <= 2.5)));
});

// Check all drawn edges against their geographic evidence, not merely point
// counts: densifying a false straight line between towns would fail this test.
test('every catalogue edge follows an OSM waterway or stays inside mapped lake water', () => {
  const grid = new Map(), cellSize = .005;
  const cell = p => [Math.floor(p[0] / cellSize), Math.floor(p[1] / cellSize)];
  for (const line of reference) for (let i = 1; i < line.coordinates.length; i++) {
    const a = line.coordinates[i - 1], b = line.coordinates[i];
    const [x1, y1] = cell([Math.min(a[0], b[0]), Math.min(a[1], b[1])]);
    const [x2, y2] = cell([Math.max(a[0], b[0]), Math.max(a[1], b[1])]);
    for (let x = x1; x <= x2; x++) for (let y = y1; y <= y2; y++) {
      const key = `${x}:${y}`; if (!grid.has(key)) grid.set(key, []); grid.get(key).push([a, b]);
    }
  }
  const distanceToSegment = (p, a, b) => {
    const scale = Math.cos(p[1] * Math.PI / 180);
    const dx = (b[0] - a[0]) * scale, dy = b[1] - a[1];
    const t = Math.max(0, Math.min(1, (((p[0] - a[0]) * scale) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
    return distanceKm(p, [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  };
  const checked = new Set(); let count = 0;
  for (const feature of map.features) {
    assert.notEqual(feature.properties.kind, 'schematic');
    const relevantAreas = areas.filter(area => feature.properties.waterAreas.includes(area.properties.id));
    for (const line of linesOfGeometry(feature.geometry)) for (let i = 1; i < line.length; i++) {
      const a = line[i - 1], b = line[i], key = `${a}|${b}`;
      if (checked.has(key)) continue;
      checked.add(key); count++;
      const midpoint = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], [x, y] = cell(midpoint);
      const candidates = [];
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) candidates.push(...(grid.get(`${x + dx}:${y + dy}`) ?? []));
      const onRiver = candidates.some(([first, last]) => distanceToSegment(a, first, last) < .002 && distanceToSegment(b, first, last) < .002 && distanceToSegment(midpoint, first, last) < .002);
      assert.ok(onRiver || segmentInWaterUnion(a, b, relevantAreas), `${feature.properties.id}: odcinek bez pokrycia wodą: ${a} → ${b}`);
    }
  }
  assert.ok(count > 15000);
});

test('atlas and personal river networks must not send a route across a mapped lake island', () => {
  const islands = areas.flatMap(area => {
    const polygons = area.geometry.type === 'Polygon' ? [area.geometry.coordinates] : area.geometry.coordinates;
    return polygons.flatMap(rings => rings.slice(1).map(ring => ({
      lake: area.properties.id, geometry: { type: 'Polygon', coordinates: [ring] },
      bounds: [Math.min(...ring.map(p => p[0])), Math.min(...ring.map(p => p[1])), Math.max(...ring.map(p => p[0])), Math.max(...ring.map(p => p[1]))]
    })));
  });
  const features = [...map.features, ...personalRivers.map(river => ({ properties: { id: river.name }, geometry: { type: 'MultiLineString', coordinates: river.lines } }))];
  for (const feature of features) for (const line of linesOfGeometry(feature.geometry)) for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i];
    for (const island of islands) {
      const [left, bottom, right, top] = island.bounds;
      if (Math.max(a[0], b[0]) < left || Math.min(a[0], b[0]) > right || Math.max(a[1], b[1]) < bottom || Math.min(a[1], b[1]) > top) continue;
      const steps = Math.max(1, Math.ceil(distanceKm(a, b) / .005));
      for (let n = 0; n <= steps; n++) {
        const p = [a[0] + (b[0] - a[0]) * n / steps, a[1] + (b[1] - a[1]) * n / steps];
        assert.equal(containsWater(p, island.geometry), false, `${feature.properties.id}: wyspa na ${island.lake}, ${p}`);
      }
    }
  }
});
