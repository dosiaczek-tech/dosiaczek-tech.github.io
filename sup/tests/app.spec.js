import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const { routes } = JSON.parse(await readFile(new URL('../data/routes.json', import.meta.url)));

async function open(page) {
  await page.goto('./');
  await expect(page.locator('.route-card')).toHaveCount(routes.length);
}
async function draw(page) {
  await page.locator('#manual-drawing > summary').click();
  await page.locator('#draw-toggle').click();
  const map = page.locator('#journal-map');
  await map.click({ position: { x: 170, y: 130 } });
  await map.click({ position: { x: 220, y: 180 } });
  await map.click({ position: { x: 270, y: 230 } });
}
async function downloadText(download) {
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

test('refresh has a full visible label on a green button on phones and desktop and reloads the app', async ({ page }) => {
  await open(page);
  const button = page.getByRole('button', { name: 'Odśwież aplikację', exact: true });
  for (const width of [320, 390, 600, 768, 900, 901, 1100, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await expect(button.getByText('Odśwież aplikację', { exact: true })).toBeVisible();
    const box = await button.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    expect(box.y + box.height).toBeLessThan(150);
    const appearance = await button.evaluate(element => {
      const style = getComputedStyle(element);
      return { background: style.backgroundColor, text: style.color };
    });
    expect(appearance).toEqual({ background: 'rgb(24, 91, 77)', text: 'rgb(255, 255, 255)' });
    expect(await page.locator('.site-header').evaluate(header => header.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#journal-title').scrollIntoViewIfNeeded();
  expect((await button.boundingBox()).y).toBeLessThan(150);
  await Promise.all([page.waitForEvent('load'), button.click()]);
  expect(await page.evaluate(() => performance.getEntriesByType('navigation')[0].type)).toBe('reload');
  await expect(button.getByText('Odśwież aplikację', { exact: true })).toBeVisible();
});

test('catalogue, combined filters, map selection and source details', async ({ page }, testInfo) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await open(page);
  await expect(page.locator('#atlas-map .leaflet-overlay-pane path')).not.toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('atlas-desktop.png'), fullPage: true });
  await page.locator('#difficulty').selectOption('easy');
  await expect(page.locator('.route-card')).toHaveCount(routes.filter(r => r.difficulty === 'easy').length);
  await page.locator('#difficulty').selectOption('advanced');
  await page.locator('#obstacles').selectOption('many');
  await expect(page.locator('.route-card')).toHaveCount(routes.filter(r => r.obstacles === 'many' && r.difficulty === 'advanced').length);
  await page.locator('#search').fill('Bukowina Skrzeszewo');
  await expect(page.locator('.route-card')).toHaveCount(1);
  await page.locator('.route-marker-wrap[title^="Bukowina:"]').click();
  await expect(page.locator('#route-detail')).toContainText('19');
  await expect(page.locator('#route-detail')).toContainText('Skrzeszewo');
  await expect(page.locator('#route-detail')).toContainText('Nasza interpretacja dla SUP');
  await expect(page.locator('#route-detail .detail-source > a')).toHaveAttribute('href', 'https://kajaki.pomorskie.eu/en/bukowina-hard/');
  await page.locator('#search').fill('nieistniejaca rzeka');
  await expect(page.locator('#route-detail')).toBeHidden();
  await expect(page.locator('.empty-search')).toBeVisible();
  await page.locator('#empty-reset').click();
  await expect(page.locator('.route-card')).toHaveCount(routes.length);
  expect(errors).toEqual([]);
});

test('draw, undo, save, reload, edit, export, delete and restore a personal trip', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('other-app:test', 'keep'));
  await open(page);
  await page.locator('#trip-name').fill('Mój pierwszy SUP');
  await page.locator('#save-trip').click();
  await expect(page.locator('#form-error')).toBeVisible();
  await draw(page);
  await page.locator('#undo-point').click();
  await expect(page.locator('.vertex-marker')).toHaveCount(2);
  await page.locator('#trip-notes').fill('<img src=x onerror="window.supInjected=true"> Piękny poranek.');
  await page.locator('#save-trip').click();
  await expect(page.locator('.trip-card')).toHaveCount(1);
  await expect(page.locator('#trip-count')).toHaveText('1');
  await page.reload();
  await expect(page.locator('.trip-card')).toContainText('Mój pierwszy SUP');
  expect(await page.evaluate(() => window.supInjected)).toBeUndefined();
  await expect(page.locator('.trip-notes img')).toHaveCount(0);
  await page.locator('[data-action="edit"]').click();
  await page.locator('#trip-notes').fill('Przy drugim zakręcie powalone drzewo.');
  await page.locator('#save-trip').click();
  await expect(page.locator('.trip-notes')).toHaveText('Przy drugim zakręcie powalone drzewo.');
  const pending = page.waitForEvent('download');
  await page.locator('#export-trips').click();
  const exported = await downloadText(await pending);
  const backup = JSON.parse(exported);
  expect(backup.trips).toHaveLength(1);
  expect(backup.trips[0].geometry.coordinates).toHaveLength(2);
  await page.locator('#import-backup').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(exported) });
  await expect(page.locator('.trip-card')).toHaveCount(1);
  page.once('dialog', dialog => dialog.accept());
  await page.locator('[data-action="delete"]').click();
  await expect(page.locator('.trip-card')).toHaveCount(0);
  await page.locator('#import-backup').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(exported) });
  await expect(page.locator('.trip-card')).toHaveCount(1);
  expect(await page.evaluate(() => localStorage.getItem('other-app:test'))).toBe('keep');
});

test('a catalogue route becomes a dated completed trip with its published distance', async ({ page }) => {
  await open(page);
  await page.locator('.route-card[data-id="krutynia-krutyn-ukta"]').click();
  await page.locator('.completed-button').click();
  await expect(page.locator('#trip-name')).toHaveValue('Krutynia: Krutyń – Ukta');
  await expect(page.locator('#draft-distance')).toContainText('13,5 km');
  await page.locator('#save-trip').click();
  await expect(page.locator('.trip-card')).toContainText('13,5 km');
  await expect(page.locator('.route-card[data-id="krutynia-krutyn-ukta"]')).toContainText('Przebyta');
  await page.reload();
  await expect(page.locator('.route-card[data-id="krutynia-krutyn-ukta"]')).toContainText('Przebyta');
});

test('GPX imports separate segments without connecting the gap and rejects invalid files', async ({ page }) => {
  await open(page);
  const gpx = '<?xml version="1.0"?><gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1"><trk><name>Dwa odcinki</name><trkseg><trkpt lat="53" lon="21"/><trkpt lat="53" lon="21.01"/></trkseg><trkseg><trkpt lat="54" lon="23"/><trkpt lat="54" lon="23.01"/></trkseg></trk></gpx>';
  await page.locator('#import-gpx').setInputFiles({ name: 'track.gpx', mimeType: 'application/gpx+xml', buffer: Buffer.from(gpx) });
  await expect(page.locator('#trip-name')).toHaveValue('Dwa odcinki');
  await expect(page.locator('#draft-distance')).toContainText('1,3 km');
  await page.locator('#import-gpx').setInputFiles({ name: 'bad.gpx', mimeType: 'application/gpx+xml', buffer: Buffer.from('<gpx><trk>') });
  await expect(page.locator('#toast')).toContainText('Nie udało się wczytać GPX');
  await expect(page.locator('#trip-name')).toHaveValue('Dwa odcinki');
  await page.locator('#save-trip').click();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('sup:journal:v1')));
  expect(stored.trips[0].geometry.type).toBe('MultiLineString');
  expect(stored.trips[0].distanceKm).toBeLessThan(1.4);
});

test('a storage quota failure leaves the draft intact and reports no successful save', async ({ page }) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key === 'sup:journal:v1') throw new DOMException('Brak miejsca', 'QuotaExceededError');
      return original.call(this, key, value);
    };
  });
  await open(page); await draw(page);
  await page.locator('#trip-name').fill('Niezapisany szkic');
  await page.locator('#save-trip').click();
  await expect(page.locator('#storage-error')).toContainText('Nie udało się zapisać');
  await expect(page.locator('#trip-name')).toHaveValue('Niezapisany szkic');
  await expect(page.locator('.vertex-marker')).toHaveCount(3);
  await expect(page.locator('.trip-card')).toHaveCount(0);
});

test('corrupted stored data is preserved and can be exported', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('sup:journal:v1', '{broken-data'));
  await open(page);
  await expect(page.locator('#storage-error')).toContainText('zapis jest wstrzymany');
  const pending = page.waitForEvent('download'); await page.locator('#export-trips').click();
  expect(await downloadText(await pending)).toBe('{broken-data');
  expect(await page.evaluate(() => localStorage.getItem('sup:journal:v1'))).toBe('{broken-data');
});

test('mobile layout fits the viewport and supports route selection and drawing', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('#search').fill('Pilica Tomaszow');
  await page.locator('.route-card').click();
  await expect(page.locator('#route-detail')).toBeVisible();
  await page.locator('.close-detail').click();
  await draw(page);
  await page.locator('#trip-name').fill('Mobilna wyprawa');
  await page.locator('#save-trip').click();
  await expect(page.locator('.trip-card')).toContainText('Mobilna wyprawa');
  await page.screenshot({ path: testInfo.outputPath('atlas-mobile.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

async function clickLine(page, id, fraction = .5) {
  await page.locator('#atlas-map').scrollIntoViewIfNeeded();
  const path = page.locator(`#atlas-map path[data-route-id="${id}"]`).first();
  const point = await path.evaluate((element, fraction) => {
    const p = element.getPointAtLength(element.getTotalLength() * fraction);
    const screen = new DOMPoint(p.x, p.y).matrixTransform(element.getScreenCTM());
    return { x: screen.x, y: screen.y };
  }, fraction);
  await page.mouse.click(point.x, point.y);
}

test('coloured river line opens details with start, finish and measured kilometre labels', async ({ page }, testInfo) => {
  await open(page);
  await page.locator('#search').fill('Wda Osowo Wdecki');
  await page.locator('#show-all').click();
  await page.waitForTimeout(350);
  await clickLine(page, 'wda-osowo-wdecki-mlyn');
  await expect(page.locator('#route-detail')).toContainText('21,6');
  await expect(page.locator('.route-endpoint.start')).toBeVisible();
  await expect(page.locator('.route-endpoint.finish')).toBeVisible();
  await expect.poll(() => page.locator('.kilometer-marker-wrap').count()).toBeGreaterThan(2);
  await expect(page.locator('#map-selection')).toContainText('Pomiar widocznych odcinków po wodzie');
  await page.locator('#atlas-map').scrollIntoViewIfNeeded();
  await page.locator('.atlas-map-shell').screenshot({ path: testInfo.outputPath('wda-kilometres.png') });
  await page.locator('#show-kilometers').uncheck();
  await expect(page.locator('.kilometer-marker-wrap')).toHaveCount(0);
  await page.locator('#show-kilometers').check();
  await expect.poll(() => page.locator('.kilometer-marker-wrap').count()).toBeGreaterThan(2);
  for (const id of ['atlas-map', 'journal-map']) {
    const map = page.locator(`#${id}`), scale = map.locator('.leaflet-control-scale-line');
    await map.hover({ position: { x: 250, y: 240 } });
    const before = await scale.textContent();
    await page.mouse.wheel(0, -400);
    await expect.poll(() => scale.textContent()).not.toBe(before);
    await page.waitForTimeout(300);
    const zoomed = await scale.textContent();
    await page.mouse.wheel(0, 400);
    await expect.poll(() => scale.textContent()).not.toBe(zoomed);
  }
});

test('overlapping river variants can be selected from the map', async ({ page }) => {
  await open(page);
  await page.locator('#search').fill('Hydrostacja');
  await page.locator('.route-card[data-id="wda-hydrostacja-czarne"]').click();
  await page.waitForTimeout(350);
  await clickLine(page, 'wda-hydrostacja-czarne');
  await expect(page.locator('.route-choices')).toBeVisible();
  await page.locator('.route-choice[data-id="wda-hydrostacja-mlynsk"]').click();
  await expect(page.locator('#route-detail')).toContainText('Młyńsk');
  await expect(page.locator('#map-selection')).toContainText('15 km');
});

test('regional filters and separated Radunia legs show the water course and transfers', async ({ page }, testInfo) => {
  await open(page);
  await page.locator('#area').selectOption('pomorze');
  await expect(page.locator('.route-card')).toHaveCount(routes.filter(r => r.areas?.includes('pomorze')).length);
  await page.locator('#trip-kind').selectOption('multi');
  await expect(page.locator('.route-card')).toHaveCount(routes.filter(r => r.areas?.includes('pomorze') && r.tripKind === 'multi').length);
  await page.locator('#search').fill('Radunia Gdansk');
  await page.locator('.route-card').click();
  await expect(page.locator('#route-detail')).toContainText('Trątkownica–Rutki');
  await expect(page.locator('#route-detail')).toContainText('Kolbudy–Straszyn');
  await expect(page.locator('#route-detail .access-endpoints')).toContainText('Żabi Kruk');
  await page.locator('.access-legs > summary').click();
  await expect(page.locator('.access-legs')).toContainText('Łapino — wyjście przy parkingu przed elektrownią');
  await expect(page.locator('.access-legs')).not.toContainText('nieustalone');
  await expect(page.locator('.route-endpoint.finish.unconfirmed')).toHaveCount(0);
  await expect(page.locator('#map-selection')).toContainText('przerwy oznaczone punktami');
  await expect(page.locator('.route-break-wrap')).toHaveCount(4);
  await expect(page.locator('#show-kilometers')).toBeEnabled();
  await page.waitForTimeout(350);
  const moves = await page.locator('path[data-route-id="radunia-stezyca-gdansk"]').evaluate(element => element.getAttribute('d').match(/M/g)?.length ?? 0);
  expect(moves).toBeGreaterThanOrEqual(3);
  const panel = await page.locator('#route-detail').boundingBox();
  for (const endpoint of ['start', 'finish']) {
    const box = await page.locator(`.route-endpoint.${endpoint}`).boundingBox();
    expect(box.x + box.width).toBeLessThan(panel.x);
  }
  await page.locator('.atlas-map-shell').screenshot({ path: testInfo.outputPath('radunia-water-course.png') });
});

test('catalogue and tile network failures leave the personal journal usable', async ({ page }) => {
  await page.route('**/data/routes.json', route => route.abort());
  await page.route('https://tile.openstreetmap.org/**', route => route.abort());
  await page.goto('./');
  await expect(page.locator('#catalog-error')).toBeVisible();
  await expect(page.locator('#atlas-tile-error')).toBeVisible();
  await draw(page);
  await page.locator('#trip-name').fill('Wyprawa bez katalogu');
  await page.locator('#save-trip').click();
  await expect(page.locator('.trip-card')).toContainText('Wyprawa bez katalogu');
});

test('all Kajakodajnia routes open sourced details and Wierzyca can be selected by its line', async ({ page }, testInfo) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await open(page);
  await page.locator('#search').fill('Kajakodajnia');
  await expect(page.locator('.route-card')).toHaveCount(23);
  await expect(page.locator('#atlas-map path[data-route-id]')).toHaveCount(23);
  for (const route of routes.filter(r => r.collection === 'kajakodajnia-wierzyca')) {
    await page.locator(`.route-card[data-id="${route.id}"]`).click();
    await expect(page.locator('#route-detail')).toContainText(route.from);
    await expect(page.locator('#route-detail')).toContainText(route.to);
    await expect(page.locator('#route-detail .detail-source > a[href="https://www.kajakodajnia.pl/wierzyca-opis.html"]')).toBeVisible();
  }
  await page.locator('#search').fill('Pogodki Czarnocin');
  await page.locator('#show-all').click();
  await page.waitForTimeout(350);
  await clickLine(page, 'wierzyca-pogodki-czarnocin');
  await expect(page.locator('#route-detail')).toContainText('11');
  await expect(page.locator('#route-detail')).toContainText('Pogódki');
  await page.locator('.atlas-map-shell').screenshot({ path: testInfo.outputPath('wierzyca-pogodki.png') });
  expect(errors).toEqual([]);
});

test('missing SUP grades and estimated Wierzyca distance remain explicit after saving and exporting', async ({ page }) => {
  await open(page);
  await page.locator('#search').fill('Kajakodajnia');
  await page.locator('#difficulty').selectOption('unknown');
  await expect(page.locator('.route-card')).toHaveCount(3);
  await page.locator('.route-card[data-id="wierzyca-wielki-klincz-wielki-podles"]').click();
  await expect(page.locator('#route-detail .badge.unknown')).toHaveText('Brak oceny na SUP');
  await page.locator('#difficulty').selectOption('');
  await page.locator('.route-card[data-id="wierzyca-stocki-mlyn-brody"]').click();
  await expect(page.locator('#route-detail')).toContainText('długość szacunkowa');
  await expect(page.locator('#map-selection')).toContainText('ok. 9 km');
  await page.locator('.completed-button').click();
  await expect(page.locator('#draft-distance')).toContainText('szacunek');
  await page.locator('#save-trip').click();
  await page.reload();
  await expect(page.locator('.trip-card')).toContainText('ok. 9 km');
  await expect(page.locator('.trip-card')).toContainText('dystans szacunkowy');
  const pending = page.waitForEvent('download'); await page.locator('#export-trips').click();
  const backup = JSON.parse(await downloadText(await pending));
  expect(backup.trips[0].distanceEstimated).toBe(true);
  await page.locator('[data-action="edit"]').click();
  page.once('dialog', dialog => dialog.accept());
  await draw(page);
  await page.locator('#save-trip').click();
  await expect(page.locator('.trip-card')).toContainText('rysunek ręczny');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('sup:journal:v1')));
  expect(stored.trips[0].distanceEstimated).toBeUndefined();
});

test('old straight catalogue drawings are upgraded in the diary without losing trip details', async ({ page }) => {
  await page.addInitScript(() => {
    if (localStorage.getItem('sup:journal:v1')) return;
    localStorage.setItem('sup:journal:v1', JSON.stringify({ version: 1, trips: [{ id: 'legacy-radunia', name: 'Moja Radunia', date: '2026-07-12', waterType: 'mixed', notes: 'Pamiętam tę wyprawę', distanceKm: 97, geometryKind: 'schematic', sourceRouteId: 'radunia-stezyca-gdansk', geometry: { type: 'LineString', coordinates: [[17.955, 54.206], [18.657, 54.35]] } }] }));
  });
  await open(page);
  await expect(page.locator('.trip-card')).toContainText('Pamiętam tę wyprawę');
  const data = await page.evaluate(() => JSON.parse(localStorage.getItem('sup:journal:v1')));
  expect(data.trips[0].geometry.type).toBe('MultiLineString');
  expect(data.trips[0].geometry.coordinates).toHaveLength(3);
  expect(data.trips[0].distanceKm).toBe(97);
  expect(data.trips[0].date).toBe('2026-07-12');
  await page.locator('[data-action="show"]').click();
  await expect(page.locator('#journal-map .leaflet-overlay-pane path')).not.toHaveCount(0);
  const pending = page.waitForEvent('download'); await page.locator('#export-trips').click();
  const backup = JSON.parse(await downloadText(await pending));
  expect(backup.trips[0].geometry.type).toBe('MultiLineString');
});

test('choose a shorter water section, save, edit, reload and export without reverting to the full route', async ({ page }, testInfo) => {
  await open(page);
  await page.locator('.route-card[data-id="krutynia-krutyn-ukta"]').click();
  const start = page.locator('#section-start'), finish = page.locator('#section-finish');
  const options = await start.locator('option').evaluateAll(items => items.map(item => item.value).filter(Boolean));
  expect(options.length).toBeGreaterThan(2);
  await start.selectOption(options[1]); await finish.selectOption(options.at(-1));
  await page.locator('#preview-section').click();
  await expect(page.locator('#map-selection')).toContainText('wybrany odcinek');
  await expect(page.locator('#section-result')).toContainText('Wybrany odcinek:');
  await page.locator('.completed-button').click();
  await expect(page.locator('#draft-distance')).toContainText('z linii');
  await page.locator('#trip-notes').fill('Wybrana część, nie cała oferta.');
  await page.locator('#save-trip').click();
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('sup:journal:v1')).trips[0]);
  expect(saved.sourceSection.startOccurrenceId).toBe(options[1]);
  expect(saved.distanceKm).toBeLessThan(13.5);
  await expect(page.locator('.route-card[data-id="krutynia-krutyn-ukta"]')).toContainText('Przebyty fragment');
  await page.reload();
  await expect(page.locator('.trip-card')).toContainText('wybrany odcinek');
  await page.locator('[data-action="edit"]').click();
  await page.locator('#trip-name').fill('Krótsza Krutynia'); await page.locator('#save-trip').click();
  const pending = page.waitForEvent('download'); await page.locator('#export-trips').click();
  const backupText = await downloadText(await pending), exported = JSON.parse(backupText).trips[0];
  expect(exported.geometry).toEqual(saved.geometry); expect(exported.sourceSection).toEqual(saved.sourceSection); expect(exported.distanceKm).toBe(saved.distanceKm);
  page.once('dialog', dialog => dialog.accept()); await page.locator('[data-action="delete"]').click();
  await page.locator('#import-backup').setInputFiles({ name: 'section.json', mimeType: 'application/json', buffer: Buffer.from(backupText) });
  await expect(page.locator('.trip-card')).toContainText('Krótsza Krutynia');
  const restored = await page.evaluate(() => JSON.parse(localStorage.getItem('sup:journal:v1')).trips[0]);
  expect(restored.geometry).toEqual(saved.geometry);
  await page.screenshot({ path: testInfo.outputPath('saved-short-section.png'), fullPage: true });
});

test('mobile launch popups choose endpoints, reversed selection clears preview, full route resets', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 }); await open(page);
  await page.locator('.route-card[data-id="wierzyca-kregski-mlyn-zabno"]').click();
  await page.locator('.access-list > summary').click();
  const locators = page.locator('.access-locate');
  await locators.first().click();
  await expect(page.locator('.access-popup')).toContainText('Odczyt:');
  await page.locator('.access-popup button[data-role="start"]').first().click();
  await locators.last().click();
  await page.locator('.access-popup button[data-role="finish"]').last().click();
  await expect(page.locator('#map-selection')).toContainText('wybrany odcinek');
  const first = await page.locator('#section-start').inputValue();
  const last = await page.locator('#section-finish').inputValue();
  await page.locator('#section-start').selectOption(last);
  await expect(page.locator('#preview-section')).toBeDisabled();
  await expect(page.locator('#map-selection')).not.toContainText('wybrany odcinek');
  await page.locator('#section-start').selectOption(first);
  await page.locator('#reset-section').click();
  await expect(page.locator('#section-start')).toHaveValue('');
  await expect(page.locator('.completed-button')).toHaveText('Już tędy płynęłam');
  const visits = await page.locator('#section-start option').evaluateAll(options => options.map(option => option.value).filter(value => value.startsWith('osm:way:1135631607@')));
  expect(visits.length).toBeGreaterThan(1);
  await page.locator('#section-start').selectOption(visits[0]);
  await page.locator('#section-finish').selectOption(visits.at(-1));
  await page.locator('#preview-section').click();
  await expect(page.locator('.route-endpoint.start.finish')).toHaveCount(1);
  await expect(page.locator('.endpoint-label')).toHaveText('START / META');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('.atlas-map-shell').screenshot({ path: testInfo.outputPath('launches-mobile.png') });
});

test('missing launch data leaves the catalogue and journal usable', async ({ page }) => {
  await page.route('**/data/access-points.json', route => route.abort());
  await open(page);
  await expect(page.locator('#access-data-status')).toContainText('chwilowo niedostępne');
  await page.locator('.route-card[data-id="krutynia-krutyn-ukta"]').click();
  await expect(page.locator('.access-picker')).toContainText('Brakuje dwóch');
  await page.locator('.completed-button').click(); await page.locator('#save-trip').click();
  await expect(page.locator('.trip-card')).toHaveCount(1);
});

test('approximate landings are labelled before selection and a data gap is not advertised as an exit', async ({ page }, testInfo) => {
  await open(page);
  await expect(page.locator('#access-data-status')).toContainText('117/117');
  await page.locator('.route-card[data-id="brda-swornegacie-mecikal"]').click();
  await expect(page.locator('.access-endpoints')).toContainText('lokalizacja przybliżona');
  await expect(page.locator('#section-finish option:checked')).toContainText('lokalizacja przybliżona');
  await expect(page.locator('.route-endpoint.finish.approximate')).toHaveCount(1);
  await page.locator('.access-list > summary').click();
  await page.locator('.access-locate[data-id^="psk:mecikal-lesna@"]').click();
  await expect(page.locator('.access-popup .access-accuracy')).toContainText('Lokalizacja przybliżona');
  await expect(page.locator('.access-popup')).toContainText('142,4');
  await page.locator('.atlas-map-shell').screenshot({ path: testInfo.outputPath('mecikal-approximate-landing.png') });
  await page.locator('.route-card[data-id="graniczna-wieprznica-rybaki"]').click();
  await page.locator('.access-legs > summary').click();
  await expect(page.locator('.access-legs')).toContainText('granica luki w danych — nie wskazuje miejsca dostępu');
  await page.locator('#preview-section').click();
  await expect(page.locator('#section-result')).toContainText('Przerwy / przewózki: 3');
});

test('a mixed static-data release cannot use launch indexes from a different water geometry', async ({ page }) => {
  const access = JSON.parse(await readFile(new URL('../data/access-points.json', import.meta.url)));
  access.routes['krutynia-krutyn-ukta'].geometryKey = 'older-release';
  await page.route('**/data/access-points.json', route => route.fulfill({ json: access }));
  await open(page);
  await page.locator('.route-card[data-id="krutynia-krutyn-ukta"]').click();
  await expect(page.locator('#access-data-status')).toContainText('wymaga odświeżenia');
  await expect(page.locator('#section-start')).toHaveCount(0);
  await expect(page.locator('#preview-section')).toHaveCount(0);
});
