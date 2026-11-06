// Public place search in an isolated browser profile. Report actual place URLs
// only; a camera centre (@lat,lon) is deliberately not treated as a location.
import { chromium } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { root } from './osm-data.mjs';
import { normalize } from '../src/core.js';

const browser = await chromium.launch({ executablePath: process.env.SUP_CHROMIUM || '/run/current-system/sw/bin/chromium', args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ locale: 'pl-PL' });
  const near = process.argv.find(arg => arg.startsWith('--near='))?.slice(7).split(',').map(Number);
  const pick = process.argv.find(arg => arg.startsWith('--pick='))?.slice(7);
  for (const query of process.argv.slice(2).filter(arg => !arg.startsWith('--'))) {
    await page.goto(`https://www.google.com/maps/search/${encodeURIComponent(query)}${near ? `/@${near[1]},${near[0]},14z` : ''}?hl=pl`, { waitUntil: 'domcontentloaded', timeout: 40000 });
    await page.waitForTimeout(2500);
    const reject = page.getByRole('button', { name: /Odrzuć wszystko|Reject all/i });
    if (await reject.count()) { await reject.first().click(); await page.waitForTimeout(2500); }
    const results = await page.locator('a[href*="/maps/place/"]').evaluateAll(links => links.slice(0, 12).map(link => ({ name: link.getAttribute('aria-label'), url: link.href })));
    const selected = pick && results.find(result => normalize(result.name ?? '').includes(normalize(pick)));
    if (selected) { await page.goto(selected.url, { waitUntil: 'domcontentloaded', timeout: 40000 }); await page.waitForTimeout(2000); }
    const record = { query, url: page.url(), selected, headings: await page.locator('h1').allTextContents(), results,
      links: await page.locator('a[href^="http"]').evaluateAll(links => [...new Set(links.map(link => link.href).filter(url => !/google\.|gstatic\.|googleusercontent\./.test(url)))].slice(0, 12)), text: (await page.locator('body').innerText()).slice(0, 2200) };
    await writeFile(path.join(root, '.cache/launch-sources', `place-${createHash('sha256').update(query).digest('hex').slice(0, 12)}.json`), JSON.stringify(record, null, 2) + '\n');
    console.log(JSON.stringify(record));
  }
} finally { await browser.close(); }
