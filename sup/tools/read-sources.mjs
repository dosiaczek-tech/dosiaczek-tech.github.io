// Research helper: keep downloaded source pages in the ignored SUP cache.
// Parsing is offline: source-page scripts and embedded resources are not executed.
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { chromium } from '@playwright/test';

const directory = new URL('../.cache/source-pages/', import.meta.url);
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.SUP_CHROMIUM || '/run/current-system/sw/bin/chromium', args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  for (const url of process.argv.slice(2)) {
    const address = new URL(url);
    const key = `${address.hostname}-${(address.pathname.split('/').filter(Boolean).at(-1) ?? 'index').replace(/\.html$/, '')}-${createHash('sha256').update(url).digest('hex').slice(0, 8)}`;
    const file = new URL(`${key}.txt`, directory);
    let text;
    try { text = await readFile(file, 'utf8'); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const response = await fetch(url, { headers: { 'User-Agent': 'SUP-Atlas/1.0 (https://dosiaczek-tech.github.io/sup/)' }, signal: AbortSignal.timeout(40000) });
      if (!response.ok) { console.error(`${url}: ${response.status}`); continue; }
      const html = await response.text();
      const extracted = await page.evaluate(html => {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        doc.querySelectorAll('script, style, noscript, header, footer, nav, form, select, button, .cookie-notice, #cookie-notice').forEach(el => el.remove());
        const root = doc.querySelector('article') || doc.querySelector('main') || doc.body;
        root.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6, br, div').forEach(el => { el.prepend('\n'); el.append('\n'); });
        return root.textContent.replace(/[\t\r ]+/g, ' ').replace(/\n\s*\n/g, '\n').trim();
      }, html);
      text = `Źródło: ${url}\nOdczyt: ${new Date().toISOString()}\nSHA256 HTML: ${createHash('sha256').update(html).digest('hex')}\n\n${extracted}\n`;
      await writeFile(file, text);
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    // Print the useful route description, without repeated navigation and sales footer.
    const lines = text.split('\n');
    const start = lines.findIndex(line => /Trudność szlaku:|Długość odcinka|Długość szlaku|Odcinek rzeki|Dystans:/.test(line));
    const end = lines.findIndex((line, index) => index > start && /^(Galeria zdjęć|Jak wygląda proces rezerwacji|Spływy (wielodniowe|jednodniowe|weekendowe) na Pomorzu)/.test(line));
    console.log(`\n${file.pathname}\n${start >= 0 ? lines.slice(Math.max(0, start - 2), end > start ? end : start + 75).join('\n') : text.slice(0, 11000)}`);
  }
} finally { await browser.close(); }
