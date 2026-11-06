import { test, expect } from '@playwright/test';
import { validateTrip } from '../src/core.js';

const origin = 'https://sup-journal-test.supabase.co';
const users = {
  'alice@example.com': '11111111-1111-4111-8111-111111111111',
  'bob@example.com': '22222222-2222-4222-8222-222222222222'
};
const fixture = () => validateTrip({ id: 'short-water-trip', name: 'Mój krótki odcinek', date: '2026-07-12', waterType: 'river', notes: 'Pierwszy zapis z komputera', geometryKind: 'water-route', sourceRouteId: 'wda-osowo-wdecki-mlyn', distanceKm: 1,
  sourceSection: { startSiteId: 'a', endSiteId: 'b', startOccurrenceId: 'a@0', endOccurrenceId: 'b@0', fromName: 'Start', toName: 'Meta' },
  geometry: { type: 'MultiLineString', coordinates: [[[18, 54], [18.01, 54]], [[18.03, 54], [18.04, 54]]] } });
function sessionFor(email) {
  const uid = users[email], issued = Math.floor(Date.now() / 1000);
  const user = { id: uid, email, aud: 'authenticated', role: 'authenticated', app_metadata: { provider: 'email', providers: ['email'] }, user_metadata: {}, created_at: new Date().toISOString() };
  const access_token = `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: uid, aud: 'authenticated', role: 'authenticated', iat: issued, exp: issued + 3600 })).toString('base64url')}.test`;
  return { access_token, refresh_token: `refresh-${uid}`, token_type: 'bearer', expires_in: 3600, expires_at: issued + 3600, user };
}
function server() {
  const journals = new Map(), offline = new Set(), authRequests = []; let writes = 0;
  return { journals, offline, authRequests, get writes() { return writes; }, async respond(route, context) {
    const request = route.request(), url = new URL(request.url());
    if (url.pathname.startsWith('/rest/') && offline.has(context)) return route.abort('internetdisconnected');
    const json = (body, status = 200) => route.fulfill({ json: body, status });
    if (url.pathname === '/auth/v1/token') {
      const input = request.postDataJSON(), uid = users[input.email];
      if (!uid || input.password !== 'test-password-123') return json({ code: 'invalid_credentials', message: 'Invalid login credentials' }, 400);
      return json(sessionFor(input.email));
    }
    if (url.pathname === '/auth/v1/logout') return json({});
    if (url.pathname === '/auth/v1/recover' || url.pathname === '/auth/v1/signup') {
      authRequests.push({ path: url.pathname, data: request.postDataJSON() });
      return json(url.pathname.endsWith('signup') ? { user: sessionFor(request.postDataJSON().email).user } : {});
    }
    const token = request.headers().authorization?.split(' ')[1];
    let uid;
    try { uid = JSON.parse(Buffer.from(token.split('.')[1], 'base64url')).sub; } catch { return json({ message: 'Unauthorized' }, 401); }
    if (url.pathname === '/auth/v1/user') {
      if (request.method() === 'PUT') authRequests.push({ path: url.pathname, data: request.postDataJSON() });
      return json(sessionFor(Object.keys(users).find(email => users[email] === uid)).user);
    }
    if (url.pathname === '/rest/v1/sup_journals') {
      if (url.searchParams.get('user_id') !== `eq.${uid}`) return json([]);
      const row = journals.get(uid);
      return json(row ? [{ user_id: uid, ...row }] : []);
    }
    if (url.pathname === '/rest/v1/rpc/sup_save_journal') {
      const body = request.postDataJSON(), current = journals.get(uid) ?? { revision: 0 };
      if (body.expected_revision !== current.revision) return json({ code: '40001', message: 'Concurrent change' }, 409);
      journals.set(uid, { revision: current.revision + 1, trips: body.new_trips }); writes++;
      return json(current.revision + 1);
    }
    return json({ message: `Unexpected endpoint ${url.pathname}` }, 400);
  } };
}
async function device(browser, baseURL, cloud, initial = [], mobile = false) {
  const context = await browser.newContext({ baseURL, viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 } });
  await context.route('**/cloud-config.json', route => route.fulfill({ json: { url: origin, publishableKey: 'sb_publishable_test_key' } }));
  await context.route(`${origin}/**`, route => cloud.respond(route, context));
  await context.addInitScript(trips => {
    if (!localStorage.getItem('sup:test:seeded')) {
      localStorage.setItem('sup:journal:v1', JSON.stringify({ version: 1, trips }));
      localStorage.setItem('sup:test:seeded', 'yes');
    }
  }, initial);
  const page = await context.newPage();
  await page.goto('./');
  await expect(page.locator('#cloud-auth-form')).toBeVisible();
  return { context, page };
}
async function login(page, email = 'alice@example.com') {
  await page.locator('#cloud-email').fill(email);
  await page.locator('#cloud-password').fill('test-password-123');
  await page.locator('#cloud-auth-form button[type=submit]').click();
  await expect(page.locator('#cloud-email-label')).toHaveText(email);
  await expect(page.locator('#cloud-status')).toContainText('Zsynchronizowano');
}
async function edit(page, notes) {
  await page.locator('[data-action=edit]').first().click();
  await page.locator('#trip-notes').fill(notes);
  await page.locator('#save-trip').click();
}

test('a personal river curve and its endpoints synchronize to a second device without catalogue replacement', async ({ browser, baseURL }) => {
  const original = fixture();
  const trip = validateTrip({ ...original, sourceSection: undefined, sourceRouteId: null, geometryKind: 'river-route', riverRoute: { river: 'Wda', fromName: 'Mój start', toName: 'Moja meta' } });
  const cloud = server(); cloud.journals.set(users['alice@example.com'], { revision: 1, trips: [trip] });
  const pc = await device(browser, baseURL, cloud), phone = await device(browser, baseURL, cloud, [], true);
  try {
    await login(pc.page); await edit(pc.page, 'Własne końce zapisane po rzece');
    await expect(pc.page.locator('#cloud-status')).toContainText('Zsynchronizowano');
    await login(phone.page);
    await expect(phone.page.locator('.trip-card')).toContainText('Mój start → Moja meta');
    await expect(phone.page.locator('.trip-card')).toContainText('Własne końce zapisane po rzece');
    const saved = cloud.journals.get(users['alice@example.com']).trips[0];
    expect(saved.geometry).toEqual(trip.geometry);
    expect(saved.riverRoute).toEqual(trip.riverRoute);
    expect(saved.distanceKm).toBe(trip.distanceKm);
  } finally { await pc.context.close(); await phone.context.close(); }
});

test('email sign-in moves existing local variants to the same private journal on a second device', async ({ browser, baseURL }, testInfo) => {
  const cloud = server(), pc = await device(browser, baseURL, cloud, [fixture()]), phone = await device(browser, baseURL, cloud, [], true);
  try {
    await login(pc.page);
    await expect(pc.page.locator('.trip-card')).toHaveCount(0);
    expect(cloud.journals.size).toBe(0); // Signing in alone does not claim guest data.
    await pc.page.locator('#cloud-import-local').click();
    await expect(pc.page.locator('#cloud-status')).toContainText('Zsynchronizowano');
    await expect(pc.page.locator('#cloud-import-local')).toBeHidden();
    await login(phone.page);
    await expect(phone.page.locator('.trip-card')).toContainText('Mój krótki odcinek');
    await edit(phone.page, 'Notatka dopisana na telefonie');
    await expect(phone.page.locator('#cloud-status')).toContainText('Zsynchronizowano');
    await pc.page.locator('#cloud-sync-now').click();
    await expect(pc.page.locator('.trip-card')).toContainText('Notatka dopisana na telefonie');
    const saved = cloud.journals.get(users['alice@example.com']).trips[0];
    expect(saved.sourceSection).toEqual(fixture().sourceSection);
    expect(saved.geometry).toEqual(fixture().geometry);
    await phone.page.locator('#cloud-panel').screenshot({ path: testInfo.outputPath('cloud-mobile.png') });
    expect(await phone.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    pc.page.once('dialog', dialog => dialog.accept()); await pc.page.locator('[data-action=delete]').click();
    await expect(pc.page.locator('#cloud-status')).toContainText('Zsynchronizowano');
    await phone.page.locator('#cloud-sync-now').click();
    await expect(phone.page.locator('.trip-card')).toHaveCount(0);
    await pc.page.reload();
    await expect(pc.page.locator('#cloud-email-label')).toHaveText('alice@example.com');
    await expect(pc.page.locator('#cloud-import-local')).toBeHidden();
    expect(await pc.page.evaluate(() => JSON.parse(localStorage.getItem('sup:journal:v1')).trips)).toHaveLength(1);
  } finally { await pc.context.close(); await phone.context.close(); }
});

test('offline edits survive a reload and concurrent edits keep both versions once reconnected', async ({ browser, baseURL }) => {
  const cloud = server(); cloud.journals.set(users['alice@example.com'], { revision: 1, trips: [fixture()] });
  const pc = await device(browser, baseURL, cloud), phone = await device(browser, baseURL, cloud);
  try {
    await login(pc.page); await login(phone.page);
    cloud.offline.add(pc.context);
    await edit(pc.page, 'Wersja komputera bez internetu');
    await expect(pc.page.locator('#cloud-status')).toContainText('Brak połączenia');
    await pc.page.reload();
    await expect(pc.page.locator('.trip-card')).toContainText('Wersja komputera bez internetu');
    await edit(phone.page, 'Wersja telefonu');
    await expect(phone.page.locator('#cloud-status')).toContainText('Zsynchronizowano');
    cloud.offline.delete(pc.context);
    await pc.page.locator('#cloud-sync-now').click();
    await expect(pc.page.locator('.trip-card')).toHaveCount(2);
    await expect(pc.page.locator('#cloud-status')).toContainText('Zsynchronizowano');
    await expect(pc.page.locator('#cloud-message')).toContainText('kopia konfliktu');
    await phone.page.locator('#cloud-sync-now').click();
    await expect(phone.page.locator('.trip-card')).toHaveCount(2);
    expect(cloud.journals.get(users['alice@example.com']).trips.map(t => t.notes).sort()).toEqual(['Wersja komputera bez internetu', 'Wersja telefonu']);
    await pc.page.reload();
    await expect(pc.page.locator('#cloud-status')).toContainText('Zsynchronizowano');
    await expect(pc.page.locator('.trip-card')).toHaveCount(2);
  } finally { await pc.context.close(); await phone.context.close(); }
});

test('switching accounts never uploads the previous account cache, and wrong passwords stay signed out', async ({ browser, baseURL }, testInfo) => {
  const cloud = server(); cloud.journals.set(users['alice@example.com'], { revision: 1, trips: [fixture()] });
  const pc = await device(browser, baseURL, cloud);
  try {
    await pc.page.locator('#cloud-email').fill('alice@example.com');
    await pc.page.locator('#cloud-password').fill('wrong-password');
    await pc.page.locator('#cloud-auth-form button[type=submit]').click();
    await expect(pc.page.locator('#cloud-message')).toContainText('Nieprawidłowy');
    await login(pc.page);
    await expect(pc.page.locator('.trip-card')).toHaveCount(1);
    await pc.page.locator('#cloud-signout').click();
    await expect(pc.page.locator('#cloud-auth-form')).toBeVisible();
    await login(pc.page, 'bob@example.com');
    await expect(pc.page.locator('.trip-card')).toHaveCount(0);
    expect(cloud.journals.has(users['bob@example.com'])).toBe(false);
    expect(cloud.writes).toBe(0);
    await pc.page.locator('#cloud-panel').screenshot({ path: testInfo.outputPath('cloud-desktop.png') });
  } finally { await pc.context.close(); }
});

test('email registration and a recovery link allow setting a new password without Google', async ({ browser, baseURL }) => {
  const cloud = server(), pc = await device(browser, baseURL, cloud);
  try {
    await pc.page.locator('#cloud-email').fill('alice@example.com');
    await pc.page.locator('#cloud-password').fill('test-password-123');
    await pc.page.locator('#cloud-signup').click();
    await expect(pc.page.locator('#cloud-message')).toContainText('potwierdź adres');
    await expect(pc.page.locator('#cloud-account')).toBeHidden();
    await pc.page.locator('#cloud-reset-password').click();
    await expect(pc.page.locator('#cloud-message')).toContainText('linkiem do ustawienia');
    const session = sessionFor('alice@example.com');
    const hash = new URLSearchParams({ access_token: session.access_token, refresh_token: session.refresh_token, expires_in: '3600', expires_at: String(session.expires_at), token_type: 'bearer', type: 'recovery' });
    // Opening the email link loads a new document, rather than only changing
    // the fragment of the already-running app.
    const recovery = await pc.context.newPage();
    await recovery.goto(`./#${hash}`);
    await expect(recovery.locator('#cloud-password-form')).toBeVisible();
    await recovery.locator('#cloud-new-password').fill('new-password-456');
    await recovery.locator('#cloud-password-form button').click();
    await expect(recovery.locator('#cloud-message')).toContainText('Nowe hasło zostało zapisane');
    await expect(recovery.locator('#cloud-password-form')).toBeHidden();
    expect(cloud.authRequests.map(r => r.path)).toEqual(['/auth/v1/signup', '/auth/v1/recover', '/auth/v1/user']);
    expect(cloud.authRequests.at(-1).data.password).toBe('new-password-456');
  } finally { await pc.context.close(); }
});
