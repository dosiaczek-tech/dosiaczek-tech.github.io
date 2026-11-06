import { readFile, writeFile } from 'node:fs/promises';
import { kaszubyRoutes } from './kaszuby-catalogue.mjs';
import { kajakodajniaRoutes } from './kajakodajnia-catalogue.mjs';

const file = new URL('../data/routes.json', import.meta.url);
const dataset = JSON.parse(await readFile(file, 'utf8'));
const extensions = [...kaszubyRoutes, ...kajakodajniaRoutes];
const ids = new Set(extensions.map(route => route.id));
if (ids.size !== extensions.length) throw new Error('Duplicate regional route IDs');
const base = dataset.routes.filter(route => !ids.has(route.id));
for (const route of base) {
  route.accessedAt ??= dataset.accessedAt;
  route.areas ??= /Kaszuby|Bory Tucholskie/.test(route.region) ? ['pomorze', ...(route.region === 'Bory Tucholskie' ? ['bory-tucholskie'] : [])] : [];
}
dataset.routes = [...base, ...extensions];
for (const route of dataset.routes) {
  // Old presentation hints must never reinstate straight schematic lines.
  delete route.map.schematic;
  delete route.map.note;
  if (route.accessNote) route.accessNote = route.accessNote.replace('Schemat nie oznacza ciągłej żeglugi.', 'Wariant obejmuje oddzielne odcinki wodne.');
  if (route.id === 'radunia-stezyca-gdansk') {
    route.accessNote = 'Dwie przewózki: Trątkownica–Rutki (ominięcie Jaru Raduni) oraz Kolbudy–Straszyn (ominięcie zbiornika ujęcia wody). Mapa przedstawia trzy oddzielne odcinki wodne, z końcówką Motławą do Gdańska.';
    const url = 'https://kajaki.pomorskie.eu/rzeka/radunia/';
    route.additionalSources = [...(route.additionalSources ?? []).filter(source => source.url !== url), { name: 'Pomorskie Szlaki Kajakowe · Radunia i przewózki', url }];
  }
}
const readDates = [...new Set(dataset.routes.map(route => route.accessedAt))].sort();
dataset.accessedAt = readDates.at(-1);
dataset.description = 'Autorskie opracowanie publicznych opisów odcinków i wypraw kajakowych, z rozbudowaną kolekcją Kaszub, Borów Tucholskich i sąsiednich szlaków Pomorza. Ocena SUP jest interpretacją; czasy podane przez źródła dotyczą kajaków. Rozbieżności kilometrażu i przerwy wymagające transportu są opisane przy trasach.';
await writeFile(file, JSON.stringify(dataset, null, 2) + '\n');
const md = value => String(value).replace(/\|/g, '\\|').replace(/\n/g, ' ');
const rows = dataset.routes.map(route => `| ${md(route.river)} | ${md(route.from)} → ${md(route.to)} | ${route.lengthEstimated ? 'szacunek: ~' : ''}${route.lengthKm.toLocaleString('pl-PL')} | ${[route.source, ...(route.additionalSources ?? [])].map(source => `[${md(source.name)}](${source.url})`).join('; ')} |`);
await writeFile(new URL('../SOURCES.md', import.meta.url), `# Źródła katalogu SUP\n\nOdczyty opisów: ${readDates.join(', ')}. ${dataset.routes.length} tras i wariantów; długości dotyczą ofert lub odcinków, nie całych rzek. Warianty mogą się pokrywać. Rozbieżności, szacunki oraz przenoski opisano w kartach aplikacji i w data/routes.json.\n\nPlik generowany przez npm run data:catalogue.\n\n| Rzeka / szlak | Odcinek | km wg źródła lub oznaczony szacunek | Źródła |\n| --- | --- | ---: | --- |\n${rows.join('\n')}\n`);
console.log(`Katalog: ${dataset.routes.length} tras; ${kaszubyRoutes.length} w rozszerzeniu kaszubskim, ${kajakodajniaRoutes.length} z Kajakodajni.`);
