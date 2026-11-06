// One-time extraction of factual marina metadata from the regional directory.
// Source HTML is cached inside SUP; embedded scripts are never executed.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const directory = new URL('../.cache/launch-sources/', import.meta.url);
await mkdir(directory, { recursive: true });
const listing = 'https://kajaki.pomorskie.eu/stanice-i-przystanie-kajakowe/wyszukaj-przystan-lub-stanice/';
const agent = 'SUP-Atlas/1.0 (https://dosiaczek-tech.github.io/sup/)';
async function html(url, key) {
  const file = new URL(`${key}.html`, directory);
  try { return await readFile(file, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const response = await fetch(url, { headers: { 'User-Agent': agent }, signal: AbortSignal.timeout(40000) });
  if (!response.ok) throw new Error(`${response.status}: ${url}`);
  const content = await response.text(); await writeFile(file, content);
  await new Promise(resolve => setTimeout(resolve, 350));
  return content;
}
const browser = await chromium.launch({ executablePath: '/run/current-system/sw/bin/chromium', args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  const index = await html(listing, 'index');
  const links = await page.evaluate(content => [...new Set([...new DOMParser().parseFromString(content, 'text/html').querySelectorAll('a[href]')].map(a => a.href).filter(url => /^https:\/\/kajaki\.pomorskie\.eu\/stanica\//.test(url)))], index);
  const results = [], errors = [];
  for (const [i, url] of links.entries()) {
    const slug = new URL(url).pathname.split('/').filter(Boolean).at(-1);
    try {
      const content = await html(url, slug);
      const record = await page.evaluate(content => {
        const doc = new DOMParser().parseFromString(content, 'text/html');
        doc.querySelectorAll('script,style,header,footer,nav,form,noscript').forEach(el => el.remove());
        const title = [...doc.querySelectorAll('h1')].map(el => el.textContent.trim()).filter(Boolean).at(-1);
        const rivers = [...new Map([...doc.querySelectorAll('a[href*="/rzeka/"]')].map(a => [a.href, a.textContent.trim()])).entries()].map(([url, name]) => ({ name, url }));
        doc.querySelectorAll('p,div,li,h1,h2,h3,h4,h5,br,strong').forEach(el => { el.prepend('\n'); el.append('\n'); });
        let text = doc.body.textContent.replace(/[\t\r ]+/g, ' ').replace(/\n\s*\n/g, '\n').trim();
        if (title) text = text.slice(text.indexOf(title) + title.length);
        text = text.split('Deklaracja dostępności')[0].trim();
        const fields = {};
        const labels = /(?:^|\n)\s*(Adres|Telefon|E-mail|WWW|Okres działania|Obsługiwane rzeki|Dostępne usługi):?\s*\n/g;
        const matches = [...text.matchAll(labels)];
        for (let n = 0; n < matches.length; n++) {
          const match = matches[n], value = text.slice(match.index + match[0].length, matches[n + 1]?.index ?? text.length).trim();
          fields[match[1]] = fields[match[1]] ? fields[match[1]] + '; ' + value : value;
        }
        return { title, rivers, address: fields.Adres ?? '', phone: fields.Telefon ?? '', website: fields.WWW ?? '', season: fields['Okres działania'] ?? '', services: (fields['Dostępne usługi'] ?? '').split('\n').map(s => s.trim()).filter(Boolean), text };
      }, content);
      if (!record.title) throw new Error('Brak tytułu obiektu.');
      results.push({ id: `psk:${slug}`, source: { name: 'Pomorskie Szlaki Kajakowe · katalog przystani', url, accessedAt: '2026-10-23' }, ...record });
      if ((i + 1) % 25 === 0) console.log(`Przystanie: ${i + 1}/${links.length}`);
    } catch (error) { errors.push({ url, message: error.message }); console.error(error.message); }
  }
  await writeFile(new URL('directory.json', directory), JSON.stringify({ listing, records: results, errors }, null, 2) + '\n');
  console.log(`Odczytano ${results.length} opisów przystani; błędy: ${errors.length}.`);
  console.log(results.slice(0, 3));
} finally { await browser.close(); }
