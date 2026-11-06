import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { createHash } from 'node:crypto';
import { root } from './osm-data.mjs';

const directory = path.join(root, '.cache/launch-sources');
const links = JSON.parse(await readFile(path.join(directory, 'operator-map-links.json')));
const browser = await chromium.launch({ executablePath: process.env.SUP_CHROMIUM || '/run/current-system/sw/bin/chromium', args: ['--no-sandbox'] });
try {
  const page = await browser.newPage(), points = new Map();
  for (const record of links) for (const link of record.links.filter(link => link.includes('maps/d/'))) {
    const id = new URL(link).searchParams.get('mid'); if (!id) continue;
    const url = `https://www.google.com/maps/d/kml?mid=${encodeURIComponent(id)}&forcekml=1`, file = path.join(directory, `operator-map-${id}.kml`);
    let xml;
    try { xml = await readFile(file, 'utf8'); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const response = await fetch(url, { signal: AbortSignal.timeout(40000), headers: { 'User-Agent': 'SUP-Atlas/1.0 (https://dosiaczek-tech.github.io/sup/)' } });
      if (!response.ok) { console.log(`${response.status}: ${url}`); continue; }
      xml = await response.text(); await writeFile(file, xml); await new Promise(resolve => setTimeout(resolve, 1000));
    }
    const pins = await page.evaluate(xml => {
      const doc = new DOMParser().parseFromString(xml, 'application/xml');
      return [...doc.querySelectorAll('Placemark')].filter(node => node.querySelector('Point')).map(node => ({ name: node.querySelector('name')?.textContent ?? '', description: new DOMParser().parseFromString(node.querySelector('description')?.textContent ?? '', 'text/html').body.textContent, coordinates: node.querySelector('Point coordinates').textContent.trim().split(',').slice(0, 2).map(Number) }));
    }, xml);
    console.log(`${record.url}: ${pins.length} pinezek`);
    for (const pin of pins) {
      if (!pin.coordinates.every(Number.isFinite)) throw new Error('Nieprawidłowe współrzędne pinezki operatora.');
      const key = `operator-pin:${createHash('sha256').update(JSON.stringify(pin.coordinates)).digest('hex').slice(0, 12)}`;
      const sources = [...(points.get(key)?.sources ?? []), { name: 'Kajaki.Pomorskie.PL · opis i mapa spływu', url: record.url, accessedAt: '2026-10-23' }];
      points.set(key, { ...pin, id: key, sources, mapUrl: link });
    }
  }
  await writeFile(path.join(directory, 'operator-pins.json'), JSON.stringify([...points.values()], null, 2) + '\n');
  for (const point of points.values()) console.log(JSON.stringify(point));
} finally { await browser.close(); }
