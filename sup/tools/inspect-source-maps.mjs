import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { root } from './osm-data.mjs';

const catalogue = JSON.parse(await readFile(path.join(root, 'data/routes.json')));
const allOperators = process.argv.includes('--all-operators');
const explicit = process.argv.slice(2).filter(arg => /^https?:\/\//.test(arg));
const urls = explicit.length ? explicit : [...new Set(catalogue.routes.flatMap(route => [route.source, ...(route.additionalSources ?? [])]).map(source => source.url).filter(url => allOperators ? /kajaki\.pomorskie\.pl|kajakodajnia\.pl/.test(url) : url.includes('www.ekajaki.pl/')))];
const browser = await chromium.launch({ executablePath: process.env.SUP_CHROMIUM || '/run/current-system/sw/bin/chromium', args: ['--no-sandbox'] });
try {
  const page = await browser.newPage(), records = [];
  for (const url of urls) {
    const file = path.join(root, '.cache/launch-sources', `${explicit.length ? new URL(url).hostname : 'ekajaki'}-${new URL(url).pathname.replace(/\W/g, '-')}.html`);
    let html;
    try { html = await readFile(file, 'utf8'); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const response = await fetch(url, { signal: AbortSignal.timeout(40000), headers: { 'User-Agent': 'SUP-Atlas/1.0 (https://dosiaczek-tech.github.io/sup/)' } });
      if (!response.ok) { console.log(`${response.status}: ${url}`); continue; }
      html = await response.text(); await writeFile(file, html); await new Promise(resolve => setTimeout(resolve, 1000));
    }
    const links = await page.evaluate(html => [...new DOMParser().parseFromString(html, 'text/html').querySelectorAll('iframe, a')].map(el => el.getAttribute('src') ?? el.getAttribute('href')).filter(url => /maps|mapa|\.kml|\.gpx|traseo|mapy/.test(url ?? '')), html);
    records.push({ url, links }); console.log(JSON.stringify(records.at(-1)));
  }
  await writeFile(path.join(root, `.cache/launch-sources/${explicit.length ? 'research' : allOperators ? 'operator' : 'ekajaki'}-map-links.json`), JSON.stringify(records, null, 2) + '\n');
} finally { await browser.close(); }
