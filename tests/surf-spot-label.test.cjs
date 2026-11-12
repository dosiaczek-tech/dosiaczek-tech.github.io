const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const html = fs.readFileSync(require.resolve('../index.html'), 'utf8');

test('every widget with data of one spot names that spot above its heading', () => {
  for (const title of ['Fale od brzegu do 500 m', 'Wiatr i fale przy brzegu',
    'Najlepsze trzygodzinne okna', 'Prognoza godzinowa', 'Dno przy spocie — do 500 m od brzegu',
    'Sprawdź obraz przed wyjazdem', 'Mapa fal — Windy']) {
    const heading = html.indexOf(`${title}</h3>`);
    assert.ok(heading > 0, title);
    assert.ok(html.slice(html.lastIndexOf('<section', heading), heading).includes('surf-spot-label'), title);
  }
  assert.match(html, /surf-spot-label"><\/span>\s*<div id="surfNow"/, 'the current metrics have no heading of their own');
  assert.match(html, /<summary>Zmiany w kolejnych dniach[^<]*<span class="surf-spot-label">/, 'a collapsed chart names its spot too');
  assert.match(html, /<summary>Źródła prognozy przy spocie<span class="surf-spot-label">/, 'the collapsed sources name their spot too');
});

test('the weather fetch times and sources sit collapsed right under the hourly table, with problems shown above them', () => {
  assert.match(html, /id="surfHoursScroll"[^\n]*\n\s*<p id="surfWeatherAlert"[^\n]* hidden><\/p>\n\s*<details class="surf-info">\n\s*<summary>Dodatkowe informacje<\/summary>\n\s*<p id="surfWeatherStatus"[^\n]*\n\s*<p class="surf-small surf-weather-source">[^\n]*\n\s*<\/details>\n\s*<\/section>/);
});

test('the spot forecast sources sit collapsed at the very bottom of the forecast tab', () => {
  assert.match(html, /<details id="surfSources" class="surf-box" hidden><summary>Źródła prognozy przy spocie[^\n]*<\/details>\n\s*<\/section>/);
});

test('the spot name and forecast point sit right above the orientation card', () => {
  assert.match(html, /id="surfSpotHeading"[^\n]*id="surfSpotMeta"[^\n]*\n\s*<section id="surfLocalSection" class="surf-box" aria-labelledby="surfLocalTitle">/);
});
