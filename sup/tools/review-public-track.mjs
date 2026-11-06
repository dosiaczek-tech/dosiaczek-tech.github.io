// Inspect a public map explicitly linked by a source. Nothing is automatically
// promoted to a launch; track endpoints still need the accompanying description.
import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';
import path from 'node:path';
import { root } from './osm-data.mjs';
import { distanceKm } from '../src/core.js';

const browser = await chromium.launch({ executablePath: process.env.SUP_CHROMIUM || '/run/current-system/sw/bin/chromium', args: ['--no-sandbox'] });
const near = process.argv.find(arg => arg.startsWith('--near='))?.slice(7).split(',').map(Number);
const cached = async (url, name) => {
  const file = path.join(root, '.cache/launch-sources', name);
  try { return await readFile(file, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const response = await fetch(url, { signal: AbortSignal.timeout(40000), headers: { 'User-Agent': 'SUP-Atlas/1.0 (https://dosiaczek-tech.github.io/sup/)' } });
  if (!response.ok) throw new Error(`${response.status}: ${url}`);
  const text = await response.text(); await writeFile(file, text); return text;
};
try {
  const page = await browser.newPage();
  for (const url of process.argv.slice(2).filter(arg => arg.startsWith('https://www.traseo.pl/trasa/'))) {
    const slug = new URL(url).pathname.split('/').at(-1);
    const html = await cached(url.replace('www.', 'dawne.'), `hydrostacja-${slug}.html`);
    const metadata = await page.evaluate(html => {
      const doc = new DOMParser().parseFromString(html, 'text/html'), node = doc.querySelector('#route-data');
      return { id: node.dataset.id, hash: node.dataset.hash, code: doc.querySelector('#route-public-code')?.textContent.trim() };
    }, html);
    const data = JSON.parse(await cached(`https://dawne.traseo.pl/trasa-dane/${metadata.id}?h=${metadata.hash}${metadata.code ? `&code=${metadata.code}` : ''}`, `traseo-map-${metadata.id}.json`));
    const point = item => ({ coordinates: [+item.longitude, +item.latitude], time: item.time, ...(item.name ? { name: item.name } : {}), ...(item.description ? { description: item.description } : {}) });
    console.log(JSON.stringify({ id: metadata.id, url, start: point(data.track[0]), finish: point(data.track.at(-1)), waypoints: Object.values(data.waypoints ?? {}).map(point).filter(item => !near || distanceKm(item.coordinates, near) < 1), ...(near ? { near: data.track.map(point).filter(item => distanceKm(item.coordinates, near) < .25) } : {}) }));
  }
} finally { await browser.close(); }
