// Small, cached OSM extracts around the existing route ends, transfers and
// regular intermediate locations. Never substitutes a town for a launch site.
import { readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { root, mapData } from './osm-data.mjs';
import { linesOfGeometry, kilometerMarks, distanceKm } from '../src/core.js';

if (process.argv.includes('--background')) {
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), ...process.argv.slice(2).filter(arg => arg !== '--background'), '--worker'], { cwd: root, detached: true, stdio: 'ignore' });
  child.unref(); console.log(`Pobieranie lokalizacji OSM uruchomione: ${child.pid}. Postęp: .cache/launch-sources/${process.argv.includes('--missing') ? 'missing-osm-progress' : 'osm-progress'}.json`);
} else {
  const data = JSON.parse(await readFile(path.join(root, 'data/route-map.geojson')));
  const missingOnly = process.argv.includes('--missing');
  const progressFile = path.join(root, `.cache/launch-sources/${missingOnly ? 'missing-osm-progress' : 'osm-progress'}.json`);
  const points = [];
  const add = coordinates => { if (!points.some(p => distanceKm(p, coordinates) < (missingOnly ? .3 : .8))) points.push(coordinates); };
  if (missingOnly) {
    const access = JSON.parse(await readFile(path.join(root, 'data/access-points.json')));
    for (const feature of data.features) {
      const record = access.routes[feature.properties.id], lines = linesOfGeometry(feature.geometry);
      for (const [index, line] of lines.entries()) {
        if (!record?.legs[index]?.start) add(line[0]);
        if (!record?.legs[index]?.finish) add(line.at(-1));
      }
    }
    // Also inspect the bank of an already documented facility when its pin is
    // near an unresolved end but too far from the mapped course to be selected.
    const ends = [...points];
    for (const end of ends) for (const site of access.sites.filter(site => site.selectable && distanceKm(site.coordinates, end) < 1.8).sort((a, b) => distanceKm(a.coordinates, end) - distanceKm(b.coordinates, end)).slice(0, 2)) add(site.coordinates);
  } else {
    for (const feature of data.features) for (const line of linesOfGeometry(feature.geometry)) { add(line[0]); add(line.at(-1)); }
    for (const feature of data.features) for (const mark of kilometerMarks(feature.geometry, 8)) add(mark.coordinates);
  }
  if (process.argv.includes('--retry')) {
    const previous = JSON.parse(await readFile(path.join(root, '.cache/launch-sources/osm-progress.json')));
    points.length = 0;
    for (const { point, message } of previous.errors.filter(error => error.message.startsWith('400:'))) for (const dx of [-.009, .009]) for (const dy of [-.0055, .0055]) points.push([point[0] + dx, point[1] + dy]);
  }
  const progress = { total: points.length, processed: 0, status: 'running', mode: missingOnly ? 'missing-endpoints' : 'full', startedAt: new Date().toISOString(), errors: [] };
  const checkpoint = () => writeFile(progressFile, JSON.stringify(progress, null, 2) + '\n');
  await checkpoint();
  console.log(`${points.length} wycinków OSM; tryb ${progress.mode}.`);
  for (const point of points) {
    const dx = missingOnly ? .006 : process.argv.includes('--retry') ? .009 : .018, dy = missingOnly ? .004 : process.argv.includes('--retry') ? .0055 : .011;
    const bounds = [point[0] - dx, point[1] - dy, point[0] + dx, point[1] + dy].map(n => +n.toFixed(5));
    try { await mapData(bounds); }
    catch (error) {
      progress.errors.push({ point, message: error.message });
      if (/^(429|509):/.test(error.message)) { progress.status = 'rate-limited'; await checkpoint(); throw error; }
    }
    progress.processed++; await checkpoint();
    await new Promise(resolve => setTimeout(resolve, missingOnly ? 2500 : 1100));
    if (!process.argv.includes('--worker') && progress.processed % 20 === 0) console.log(`${progress.processed}/${progress.total}`);
  }
  progress.status = 'completed'; progress.completedAt = new Date().toISOString(); await checkpoint();
  console.log(`${progress.processed}/${progress.total}, błędów: ${progress.errors.length}.`);
}
