import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { distanceKm, geometryEndpoints, geometryLength } from '../src/core.js';

const data = JSON.parse(await readFile(new URL('../data/river-network.json', import.meta.url)));
const river = data.rivers.find(r => r.name === 'Krutynia');
const start = river.sites.find(site => site.name === 'Stanica Wodna PTTK Krutyń');
const finish = river.sites.find(site => site.name === 'Stanica wodna PTTK Ukta');
const stored = page => page.evaluate(() => JSON.parse(localStorage.getItem('sup:journal:v1')).trips);
async function openRiver(page, name = 'Krutynia') {
  await page.goto('./');
  await expect(page.locator('#river-name')).toBeEnabled();
  await page.locator('#river-name').selectOption(name);
}
async function choosePlaces(page) {
  await page.locator('#river-start').fill(start.name);
  await page.locator('#river-finish').fill(finish.name);
  await page.locator('#route-river').click();
  await expect(page.locator('#river-status')).toContainText('Gotowe:');
}

test('named start and finish follow the river and survive save, reload, edit and export', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await openRiver(page); await choosePlaces(page);
  await expect(page.locator('#draft-distance')).toContainText('14');
  await expect(page.locator('#journal-map .river-draft-marker')).toHaveCount(2);
  await page.locator('#trip-name').fill('Własna Krutynia');
  await page.locator('#save-trip').click();
  await expect(page.locator('.trip-card')).toContainText('własna trasa po rzece');
  const [first] = await stored(page);
  expect(first.geometryKind).toBe('river-route');
  expect(first.geometry.coordinates.length).toBeGreaterThan(100);
  expect(first.distanceKm).toBeCloseTo(geometryLength(first.geometry), 6);
  expect(first.riverRoute).toEqual({ river: 'Krutynia', fromName: start.name, toName: finish.name });
  await page.reload();
  await expect(page.locator('.trip-card')).toContainText('Własna Krutynia');
  await page.locator('[data-action="edit"]').click();
  await expect(page.locator('#river-start')).toHaveValue(start.name);
  await page.locator('#trip-notes').fill('Moje własne końce trasy.');
  await page.locator('#save-trip').click();
  expect((await stored(page))[0].geometry).toEqual(first.geometry);
  const pending = page.waitForEvent('download'); await page.locator('#export-trips').click();
  const stream = await (await pending).createReadStream(), chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const backup = JSON.parse(Buffer.concat(chunks).toString());
  expect(backup.trips[0].riverRoute).toEqual(first.riverRoute);
  await page.locator('#import-backup').setInputFiles({ name: 'river.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
  await expect(page.locator('.trip-card')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('changing an endpoint clears stale geometry, rejects off-river points, and recalculates in reverse', async ({ page }) => {
  await openRiver(page); await choosePlaces(page);
  await page.locator('#river-finish').fill('Nieznana miejscowość');
  await page.locator('#save-trip').click();
  await expect(page.locator('#form-error')).toContainText('prawidłowy start i metę');
  await expect(page.locator('#draft-distance')).toContainText('0 km');
  await expect(page.locator('.trip-card')).toHaveCount(0);
  await page.locator('#river-finish').fill('54, 19');
  await page.locator('#route-river').click();
  await expect(page.locator('#river-status')).toContainText('zbyt daleko');
  await page.locator('#river-start').fill(finish.name);
  await page.locator('#river-finish').fill(start.name);
  await page.locator('#route-river').click();
  await expect(page.locator('#river-status')).toContainText('Gotowe:');
  await page.locator('#save-trip').click();
  const [trip] = await stored(page);
  expect(trip.riverRoute.fromName).toBe(finish.name);
  expect(trip.riverRoute.toName).toBe(start.name);
  expect(geometryEndpoints(trip.geometry)[0][1]).toBeCloseTo(finish.coordinates[1], 2);
});

async function clickWater(page, fraction, { touch = false, scroll = true } = {}) {
  if (scroll) await page.locator('#journal-map').scrollIntoViewIfNeeded();
  const point = await page.locator('#journal-map .leaflet-overlay-pane path').evaluateAll((paths, fraction) => {
    const path = [...paths].sort((a, b) => b.getTotalLength() - a.getTotalLength())[0];
    const p = path.getPointAtLength(path.getTotalLength() * fraction);
    const screen = new DOMPoint(p.x, p.y).matrixTransform(path.getScreenCTM());
    return { x: screen.x, y: screen.y };
  }, fraction);
  if (touch) await page.touchscreen.tap(point.x, point.y);
  else await page.mouse.click(point.x, point.y);
}

for (const touch of [false, true]) test.describe(touch ? 'touch picking' : 'mouse picking', () => {
  test.use({ hasTouch: touch, isMobile: touch, viewport: { width: 390, height: 844 } });
  test('start and finish buttons keep selection active and bring the map into view', async ({ page }) => {
    await openRiver(page);
    const startButton = page.getByRole('button', { name: 'Wskaż start na mapie', exact: true });
    const finishButton = page.getByRole('button', { name: 'Wskaż metę na mapie', exact: true });
    const press = button => touch ? button.tap() : button.click();
    const visibleMap = async () => {
      await expect.poll(async () => {
        const box = await page.locator('#journal-map').boundingBox();
        const header = await page.locator('.site-header').boundingBox();
        return box.y >= header.y + header.height && box.y + box.height <= page.viewportSize().height;
      }).toBe(true);
    };
    await press(startButton);
    await expect(startButton).toHaveAttribute('aria-pressed', 'true');
    await visibleMap();
    await press(startButton);
    await expect(startButton).toHaveAttribute('aria-pressed', 'true');
    await visibleMap();
    await clickWater(page, .3, { touch, scroll: false });
    await expect(page.locator('#river-start')).not.toHaveValue('');
    const firstStart = await page.locator('#river-start').inputValue();
    await expect(finishButton).toHaveAttribute('aria-pressed', 'true');
    await press(finishButton);
    await expect(finishButton).toHaveAttribute('aria-pressed', 'true');
    await visibleMap();
    await clickWater(page, .6, { touch, scroll: false });
    await expect(page.locator('#river-status')).toContainText('Gotowe:');
    await press(startButton);
    await visibleMap();
    await clickWater(page, .4, { touch, scroll: false });
    await expect(page.locator('#river-start')).not.toHaveValue(firstStart);
    await expect(page.locator('#river-status')).toContainText('Gotowe:');
    await page.locator('#save-trip').click();
    await expect(page.locator('.trip-card')).toHaveCount(1);
    expect((await stored(page))[0].geometry.coordinates.length).toBeGreaterThan(10);
  });
});

test('mobile map accepts two own endpoints and draws the bends without manual intermediate points', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openRiver(page);
  await clickWater(page, .3);
  await expect(page.locator('#river-start')).not.toHaveValue('');
  await expect(page.locator('#pick-river-finish')).toHaveAttribute('aria-pressed', 'true');
  await clickWater(page, .6);
  await expect(page.locator('#river-status')).toContainText('Gotowe:');
  await page.locator('#save-trip').click();
  await expect(page.locator('.trip-card')).toHaveCount(1);
  expect((await stored(page))[0].geometry.coordinates.length).toBeGreaterThan(10);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('a failed network download can be retried without breaking manual drawing', async ({ page }) => {
  await page.route('**/data/river-network.json', route => route.abort());
  await page.goto('./');
  await expect(page.locator('#river-status')).toContainText('Nie udało się');
  await page.locator('#manual-drawing > summary').click();
  await page.locator('#draw-toggle').click();
  await page.locator('#journal-map').click({ position: { x: 200, y: 130 } });
  await page.locator('#journal-map').click({ position: { x: 240, y: 170 } });
  await page.locator('#trip-name').fill('Ręczna trasa');
  await page.locator('#save-trip').click();
  await expect(page.locator('.trip-card')).toHaveCount(1);
  await page.unroute('**/data/river-network.json');
  await page.locator('#retry-rivers').click();
  await expect(page.locator('#river-name')).toBeEnabled();
});

test('editing river endpoints changes the saved curve while a disconnected pair cannot be saved', async ({ page }) => {
  await page.route('**/data/river-network.json', route => route.fulfill({ json: {
    version: 1, rivers: [{ name: 'Testowa', sites: [], lines: [
      [[18, 54], [18.01, 54.01], [18.02, 54]],
      [[18.021, 54], [18.03, 54.01]]
    ] }]
  } }));
  await openRiver(page, 'Testowa');
  await page.locator('#river-start').fill('54, 18');
  await page.locator('#river-finish').fill('54, 18.02');
  await page.locator('#route-river').click();
  await expect(page.locator('#river-status')).toContainText('Gotowe:');
  await page.locator('#trip-name').fill('Zachowaj moją nazwę');
  await page.locator('#save-trip').click();
  const [first] = await stored(page);
  await page.locator('[data-action="edit"]').click();
  await page.locator('#river-finish').fill('54.01, 18.03');
  await page.locator('#route-river').click();
  await expect(page.locator('#river-status')).toContainText('Brakuje ciągłego połączenia');
  await page.locator('#save-trip').click();
  expect(await stored(page)).toEqual([first]);
  await page.locator('#river-finish').fill('54.01, 18.01');
  await page.locator('#route-river').click();
  await expect(page.locator('#river-status')).toContainText('Gotowe:');
  await page.locator('#save-trip').click();
  const [edited] = await stored(page);
  expect(edited.id).toBe(first.id);
  expect(edited.name).toBe(first.name);
  expect(edited.distanceKm).toBeCloseTo(first.distanceKm / 2, 3);
  expect(edited.geometry.coordinates).toEqual([[18, 54], [18.01, 54.01]]);
});

const radunia = data.rivers.find(r => r.name === 'Radunia');
const ostrzyce = radunia.sites.find(site => site.id === 'osm:way:173524480');
const tratkownica = radunia.sites.find(site => site.id === 'osm:node:11100021655');
async function chooseRaduniaPlaces(page) {
  await page.locator('#river-start').fill('Ostrzyce');
  await page.locator('#river-finish').fill('Trątkownica');
  await page.locator('#route-river').click();
  await expect(page.locator('#river-status')).toContainText('Gotowe: 14,3 km');
}
function expectRadunia(trip) {
  expect(trip.geometryKind).toBe('river-route');
  expect(trip.riverRoute.river).toBe('Radunia');
  expect(trip.geometry.coordinates.length).toBeGreaterThan(500);
  expect(trip.distanceKm).toBeGreaterThan(14);
  expect(trip.distanceKm).toBeLessThan(14.6);
  expect(trip.distanceKm).toBeCloseTo(geometryLength(trip.geometry), 6);
}

test('Ostrzyce and Trątkownica place names save the full river curve to the right landing', async ({ page }) => {
  await openRiver(page, 'Radunia');
  await expect(page.locator('#draw-toggle')).not.toBeVisible();
  await chooseRaduniaPlaces(page);
  await expect(page.locator('#draft-distance')).toHaveText('14,3 km · po rzece');
  await page.locator('#save-trip').click();
  const [trip] = await stored(page);
  expectRadunia(trip);
  expect(trip.riverRoute.toName).toContain('Trątkownica');
  expect(distanceKm(geometryEndpoints(trip.geometry)[1], tratkownica.coordinates)).toBeLessThan(.02);
});

test.describe('Radunia on a phone', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  test('main map buttons detect the river and join two taps along its bends', async ({ page }, testInfo) => {
    // Set the viewport through normal controls, then start a completely empty
    // draft in the same area. Taps use only rendered map positions, no map API.
    await openRiver(page, 'Radunia'); await chooseRaduniaPlaces(page);
    const points = await page.locator('#journal-map path[stroke="#185b4d"]').evaluate(path => {
      const box = document.getElementById('journal-map').getBoundingClientRect();
      return [0, path.getTotalLength()].map(length => {
        const point = path.getPointAtLength(length);
        const screen = new DOMPoint(point.x, point.y).matrixTransform(path.getScreenCTM());
        return { x: screen.x - box.x, y: screen.y - box.y };
      });
    });
    page.once('dialog', dialog => dialog.accept());
    await page.locator('#clear-draft').tap();
    await expect(page.locator('#river-name')).toHaveValue('');
    await page.locator('#pick-river-start').tap();
    const tap = async point => {
      const box = await page.locator('#journal-map').boundingBox();
      await page.touchscreen.tap(box.x + point.x, box.y + point.y);
    };
    await tap(points[0]);
    await expect(page.locator('#river-name')).toHaveValue('Radunia');
    await expect(page.locator('#pick-river-finish')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#draft-distance')).toHaveText('0 km');
    await tap(points[1]);
    await expect(page.locator('#river-status')).toContainText('Gotowe:');
    await expect(page.locator('#draft-distance')).toContainText('po rzece');
    for (const marker of await page.locator('#journal-map .river-draft-marker').all()) {
      const box = await marker.boundingBox(), mapBox = await page.locator('#journal-map').boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(mapBox.x);
      expect(box.x + box.width).toBeLessThanOrEqual(mapBox.x + mapBox.width);
    }
    await page.screenshot({ path: testInfo.outputPath('radunia-mobile.png') });
    await page.locator('#save-trip').tap();
    expectRadunia((await stored(page))[0]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
});

const straightTrip = {
  id: 'ostrzyce-tratkownica', name: 'Moja przebyta Radunia', date: '2026-07-12', notes: 'Przerwa w Somoninie', waterType: 'river',
  geometryKind: 'drawn', sourceRouteId: null,
  geometry: { type: 'LineString', coordinates: [ostrzyce.coordinates, tratkownica.coordinates] },
  distanceKm: distanceKm(ostrzyce.coordinates, tratkownica.coordinates)
};
async function openStraightTrip(page) {
  await page.addInitScript(trip => localStorage.setItem('sup:journal:v1', JSON.stringify({ version: 1, trips: [trip] })), straightTrip);
  await page.goto('./');
  await expect(page.locator('#river-name')).toBeEnabled();
  await page.locator('[data-action="edit"]').click();
}

test('a saved two-point manual line can be fitted to Radunia without losing trip details', async ({ page }) => {
  await openStraightTrip(page);
  await expect(page.locator('#draft-distance')).toContainText('proste odcinki');
  await page.locator('#fit-drawn-river').click();
  await expect(page.locator('#river-status')).toContainText('Gotowe: 14,3 km');
  await expect(page.locator('#trip-name')).toHaveValue(straightTrip.name);
  await expect(page.locator('#trip-date')).toHaveValue(straightTrip.date);
  await expect(page.locator('#trip-notes')).toHaveValue(straightTrip.notes);
  await page.locator('#save-trip').click();
  const trips = await stored(page);
  expect(trips).toHaveLength(1);
  expectRadunia(trips[0]);
  expect(trips[0]).toMatchObject({ id: straightTrip.id, name: straightTrip.name, date: straightTrip.date, notes: straightTrip.notes });
});

test('a missing connection leaves the original two-point sketch intact when fitting fails', async ({ page }) => {
  await page.route('**/data/river-network.json', route => route.fulfill({ json: {
    version: 1, rivers: [{ name: 'Radunia', sites: [], lines: [
      [ostrzyce.coordinates, [18.112, 54.256]],
      [[18.253, 54.285], tratkownica.coordinates]
    ] }]
  } }));
  await openStraightTrip(page);
  await page.locator('#fit-drawn-river').click();
  await expect(page.locator('#river-status')).toContainText('Brakuje ciągłego połączenia');
  await expect(page.locator('#draft-distance')).toContainText('9,8 km · proste odcinki');
  await page.locator('#save-trip').click();
  const [trip] = await stored(page);
  expect(trip.geometry).toEqual(straightTrip.geometry);
  expect(trip.geometryKind).toBe('drawn');
  expect(trip.notes).toBe(straightTrip.notes);
});
