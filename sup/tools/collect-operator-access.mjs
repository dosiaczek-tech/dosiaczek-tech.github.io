// Read the operator's public map waypoints, including descriptions of banks and
// access conditions. HTML is parsed offline; remote scripts never run.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { root } from './osm-data.mjs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { trackAccessNotes } from './track-access-notes.mjs';

if (process.argv.includes('--background')) {
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), ...process.argv.slice(2).filter(arg => arg !== '--background')], { cwd: root, detached: true, stdio: 'ignore', env: { ...process.env, TMPDIR: '/tmp/opencode' } });
  child.unref(); console.log(`Odczyt map operatorów: PID ${child.pid}, postęp .cache/launch-sources/operators-progress.json`); process.exit(0);
}

const directory = path.join(root, '.cache/launch-sources');
const progress = { status: 'running', profiles: 0, processed: 0, total: 0, errors: [] };
const checkpoint = () => writeFile(path.join(directory, 'operators-progress.json'), JSON.stringify(progress, null, 2) + '\n');
await checkpoint();
async function source(url, name) {
  const file = path.join(directory, name);
  try { return await readFile(file, 'utf8'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const response = await fetch(url, { headers: { 'User-Agent': 'SUP-Atlas/1.0 (https://dosiaczek-tech.github.io/sup/)' }, signal: AbortSignal.timeout(40000) });
  if (!response.ok) throw new Error(`${response.status}: ${url}`);
  const text = await response.text(); await writeFile(file, text); await new Promise(resolve => setTimeout(resolve, 1000)); return text;
}
let browser;
try {
  browser = await chromium.launch({ executablePath: process.env.SUP_CHROMIUM || '/run/current-system/sw/bin/chromium', args: ['--no-sandbox'] });
  const page = await browser.newPage(), routes = new Map(), records = [];
  for (const number of [1, 2]) {
    const html = await source(`https://dawne.traseo.pl/profil/KAJAKI_HYDROSTACJA/page/${number}/limit/10/tab/routes`, `hydrostacja-traseo-${number}.html`);
    const links = await page.evaluate(html => [...new DOMParser().parseFromString(html, 'text/html').querySelectorAll('h3 a[href^="/trasa/"]')].map(a => a.getAttribute('href')), html);
    for (const link of links.filter(url => !/biebrza|rospuda|spacer|lupawy/.test(url))) routes.set(link, { publisher: 'Hydrostacja' });
  }
  const ekajaki = JSON.parse(await readFile(path.join(directory, 'ekajaki-map-links.json')));
  for (const source of ekajaki) for (const link of source.links) {
    const pathname = new URL(link).pathname;
    if (pathname.startsWith('/trasa/')) routes.set(pathname, { publisher: 'eKajaki.pl', article: source.url });
    else if (/^\/mapa\/ekajaki-/.test(pathname)) routes.set(`/trasa/${pathname.split('/')[2]}`, { publisher: 'eKajaki.pl', article: source.url });
  }
  for (const record of trackAccessNotes) routes.set(new URL(record.mapUrl).pathname, { publisher: record.publisher ?? 'eKajaki.pl', article: record.url });
  if (process.argv.includes('--expand-profile')) {
    const extra = new Set();
    for (let number = 1; number <= 12; number++) {
      const html = await source(`https://dawne.traseo.pl/profil/ekajaki/page/${number}/limit/10/tab/routes`, `ekajaki-profile-${number}.html`);
      const links = await page.evaluate(html => {
        const doc = new DOMParser().parseFromString(html, 'text/html'), found = [];
        for (const link of doc.querySelectorAll('h3 a[href^="/trasa/"]')) {
          for (let parent = link.parentElement; parent; parent = parent.parentElement) {
            if (parent.querySelectorAll('h3').length > 1) break;
            if (parent.querySelector('a[href="/trasy/kategoria/kajak"]')) { found.push(link.getAttribute('href')); break; }
          }
        }
        return found;
      }, html);
      for (const link of links.filter(url => /brda|zbrzyc|mlosin|klonecznic|lipczyn|leba|chocin|raduni|wierzyc|studnic|wda|piasnic|reda|wietcis/.test(url))) extra.add(link);
      progress.profiles = number; await checkpoint();
    }
    await writeFile(path.join(directory, 'ekajaki-profile-routes.json'), JSON.stringify([...extra], null, 2) + '\n');
  }
  try {
    for (const link of JSON.parse(await readFile(path.join(directory, 'ekajaki-profile-routes.json')))) if (!routes.has(link)) routes.set(link, { publisher: 'eKajaki.pl' });
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  progress.total = routes.size; await checkpoint();
  for (const [route, provenance] of routes) {
    const slug = route.split('/').at(-1);
    const html = await source(`https://dawne.traseo.pl${route}`, `hydrostacja-${slug}.html`);
    const metadata = await page.evaluate(html => {
      const doc = new DOMParser().parseFromString(html, 'text/html'), route = doc.querySelector('#route-data');
      return { id: route.dataset.id, hash: route.dataset.hash, code: doc.querySelector('#route-public-code')?.textContent.trim(), descriptions: Object.fromEntries([...doc.querySelectorAll('.waypoint')].map(point => [point.id.replace('waypoint-', ''), { name: point.querySelector('.name')?.textContent.trim() ?? '', description: point.querySelector('.description')?.textContent.trim() ?? '' }])) };
    }, html);
    const url = `https://dawne.traseo.pl/trasa-dane/${metadata.id}?h=${metadata.hash}${metadata.code ? `&code=${metadata.code}` : ''}`;
    const data = JSON.parse(await source(url, `traseo-map-${metadata.id}.json`));
    const descriptions = await page.evaluate(points => Object.fromEntries(points.map(point => [point.id, {
      name: new DOMParser().parseFromString(point.name ?? '', 'text/html').body.textContent,
      description: new DOMParser().parseFromString(point.description ?? '', 'text/html').body.textContent
    }])), Object.values(data.waypoints ?? {}));
    console.log(`${slug}: ${Object.keys(data.waypoints ?? {}).length} opisanych punktów`);
    for (const point of Object.values(data.waypoints ?? {})) {
      const coordinates = [+point.longitude, +point.latitude];
      if (!coordinates.every(Number.isFinite)) throw new Error(`Nieznany format współrzędnych: ${JSON.stringify(point)}`);
      const trackDate = data.track?.[0]?.time?.slice(0, 10);
      records.push({ id: `traseo:${point.id}`, coordinates, name: metadata.descriptions[point.id]?.name || descriptions[point.id].name, description: metadata.descriptions[point.id]?.description || descriptions[point.id].description, source: { name: `${provenance.publisher} · opisany punkt na mapie spływu`, url: `https://www.traseo.pl${route}`, accessedAt: '2026-10-23', ...(trackDate && /^\d{4}-\d{2}-\d{2}$/.test(trackDate) && Number.isFinite(Date.parse(trackDate)) ? { trackDate } : {}) }, ...(provenance.article ? { article: provenance.article } : {}), dataSource: url });
    }
    progress.processed++; await checkpoint();
  }
  await writeFile(path.join(directory, 'operator-waypoints.json'), JSON.stringify(records, null, 2) + '\n');
  console.log(`Zapisano ${records.length} punktów operatora.`);
  progress.status = 'completed'; progress.points = records.length; await checkpoint();
} catch (error) {
  progress.status = 'failed'; progress.errors.push(error.message); await checkpoint(); throw error;
} finally { await browser?.close(); }
