import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateTrip, STORAGE_KEY } from '../src/core.js';
import { fingerprints, mergeJournals, sameTrips, synchronizeJournal, hasPendingChanges, SyncCancelled } from '../src/sync-core.js';
import { createJournalStore, accountKey, projectId, ACTIVE_PROFILE_KEY } from '../src/journal-store.js';
import { validateCloudConfig, createCloudClient } from '../src/cloud-client.js';

const trip = (id = 'trip-a', notes = 'Spokojna woda') => validateTrip({ id, name: 'Krótka wyprawa', date: '2026-07-12', notes, waterType: 'river', distanceKm: 1, geometryKind: 'gpx', sourceRouteId: null, geometry: { type: 'MultiLineString', coordinates: [[[18, 54], [18.01, 54]], [[18.03, 54], [18.04, 54]]] } });
const storage = () => {
  const data = new Map();
  return { data, getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
};
const profile = { project: projectId('https://test.supabase.co'), uid: '11111111-1111-4111-8111-111111111111', email: 'test@example.com' };

test('three-way sync combines independent additions/edits and propagates deletions both ways', () => {
  const a = trip(), b = trip('trip-b'), base = fingerprints([a, b]);
  assert.deepEqual(mergeJournals([a], base, [a, b]).trips, [a]);
  assert.deepEqual(mergeJournals([a, b], base, [a]).trips, [a]);
  const local = [trip('trip-a', 'komputer'), b, trip('trip-c')], remote = [a, trip('trip-b', 'telefon'), trip('trip-d')];
  const result = mergeJournals(local, base, remote);
  assert.equal(result.conflicts, 0);
  assert.deepEqual(result.trips.map(t => t.id).sort(), ['trip-a', 'trip-b', 'trip-c', 'trip-d']);
  assert.equal(result.trips.find(t => t.id === 'trip-a').notes, 'komputer');
  assert.equal(result.trips.find(t => t.id === 'trip-b').notes, 'telefon');
});

test('simultaneous edits and edit/delete conflicts preserve the changed trip without repeated copies', () => {
  const a = trip(), edited = trip('trip-a', 'notatka z komputera'), remote = trip('trip-a', 'notatka z telefonu');
  for (const right of [[remote], []]) {
    const result = mergeJournals([edited], fingerprints([a]), right);
    assert.equal(result.conflicts, 1);
    assert.ok(result.trips.some(t => t.notes === edited.notes && t.id.startsWith('conflict-')));
    assert.ok(sameTrips(mergeJournals([edited], fingerprints([a]), result.trips).trips, result.trips));
    assert.deepEqual(result.trips.find(t => t.id.startsWith('conflict-')).geometry, edited.geometry);
  }
  const deletedLocally = mergeJournals([], fingerprints([a]), [remote]);
  assert.equal(deletedLocally.trips.length, 1);
  assert.ok(deletedLocally.trips[0].id.startsWith('conflict-'));
});

test('server JSON key ordering and reserved property names cannot fabricate a change', () => {
  const a = trip('__proto__'), reversed = Object.fromEntries(Object.entries(a).reverse());
  assert.deepEqual(fingerprints([a]), fingerprints([reversed]));
  assert.equal(mergeJournals([a], {}, [reversed]).conflicts, 0);
  assert.deepEqual(mergeJournals([a], fingerprints([a]), []).trips, []);
});

test('account caches are separate from the original journal and from other accounts', () => {
  const memory = storage(), store = createJournalStore(memory);
  store.write([trip()]); const original = memory.getItem(STORAGE_KEY);
  store.switchProfile(profile);
  assert.deepEqual(store.read().trips, []);
  assert.equal(store.localCandidates().length, 1);
  store.write([trip('account-only')], { base: fingerprints([trip('account-only')]), revision: 1 });
  assert.equal(hasPendingChanges(store.read()), false);
  assert.equal(createJournalStore(memory).profile.uid, profile.uid);
  store.switchProfile({ ...profile, uid: '22222222-2222-4222-8222-222222222222' });
  assert.deepEqual(store.read().trips, []);
  store.switchProfile(null);
  assert.equal(memory.getItem(STORAGE_KEY), original);
  assert.ok(memory.getItem(accountKey(profile)));
  assert.equal(memory.getItem(ACTIVE_PROFILE_KEY), null);
});

test('a quota failure cannot advance the sync baseline or lose the locally edited trip', () => {
  const memory = storage(), store = createJournalStore(memory);
  store.switchProfile(profile); store.write([trip()], { base: fingerprints([trip()]), revision: 1 });
  store.write([trip('trip-a', 'unsent')]);
  const before = memory.getItem(accountKey(profile));
  memory.setItem = () => { throw new Error('quota'); };
  assert.throws(() => store.write([trip('trip-a', 'server')], { base: fingerprints([trip('trip-a', 'server')]), revision: 2 }), /quota/);
  assert.equal(memory.getItem(accountKey(profile)), before);
  assert.equal(hasPendingChanges(store.read()), true);
});

function harness(local = [], base = []) {
  let state = { trips: local, base: fingerprints(base), revision: base.length ? 1 : 0 }, current = true;
  return { read: () => structuredClone(state), apply: (trips, metadata) => { state = { ...state, ...metadata, trips }; }, isCurrent: () => current,
    edit: trips => { state.trips = trips; }, cancel: () => { current = false; } };
}
test('sync retries a concurrent server revision and retains edits made during an in-flight write', async () => {
  const h = harness([trip()]); let calls = 0, server = { revision: 0, trips: [] };
  const remote = {
    read: async () => structuredClone(server),
    write: async (revision, trips) => {
      calls++;
      if (calls === 1) { server = { revision: 1, trips: [trip('phone')] }; throw { code: '40001' }; }
      assert.equal(revision, server.revision);
      server = { revision: revision + 1, trips };
      if (calls === 2) h.edit([...trips, trip('while-saving')]);
      return server.revision;
    }
  };
  assert.equal((await synchronizeJournal({ ...h, remote })).pending, false);
  assert.deepEqual(server.trips.map(t => t.id).sort(), ['phone', 'trip-a', 'while-saving']);
  assert.equal(hasPendingChanges(h.read()), false);
});

test('offline failures and an account switch during a response never discard local work', async () => {
  const h = harness([trip()]);
  await assert.rejects(synchronizeJournal({ ...h, remote: { read: async () => ({ revision: 0, trips: [] }), write: async () => { throw new TypeError('offline'); } } }), /offline/);
  assert.deepEqual(h.read().trips, [trip()]);
  assert.equal(hasPendingChanges(h.read()), true);
  await assert.rejects(synchronizeJournal({ ...h, remote: { read: async () => { h.cancel(); return { revision: 5, trips: [trip('another-account')] }; } } }), SyncCancelled);
  assert.deepEqual(h.read().trips, [trip()]);
});

test('a missing or restored server row cannot erase a previously synchronized local journal', async () => {
  const h = harness([trip()], [trip()]);
  await assert.rejects(synchronizeJournal({ ...h, remote: { read: async () => ({ revision: 0, trips: [] }) } }), /starszą lub brakującą/);
  assert.deepEqual(h.read().trips, [trip()]);
  // An intentional deletion is represented by an empty row with a newer revision.
  await synchronizeJournal({ ...h, remote: { read: async () => ({ revision: 2, trips: [] }) } });
  assert.deepEqual(h.read().trips, []);
});

test('invalid remote data cannot replace a working local journal and secret keys are rejected', async () => {
  const h = harness([trip()]);
  await assert.rejects(synchronizeJournal({ ...h, remote: { read: async () => ({ revision: 2, trips: [{ id: 'broken' }] }) } }));
  assert.deepEqual(h.read().trips, [trip()]);
  assert.equal(validateCloudConfig({ url: '', publishableKey: '' }), null);
  assert.throws(() => validateCloudConfig({ url: 'https://test.supabase.co', publishableKey: 'sb_secret_do_not_publish' }), /publicznego/);
  assert.throws(() => validateCloudConfig({ url: 'http://test.supabase.co', publishableKey: 'sb_publishable_test' }), /HTTPS/);
});

test('database requests retain the original account token if the login changes in flight', async () => {
  const originalFetch = globalThis.fetch, requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, authorization: options.headers.Authorization });
    return new Response(JSON.stringify(options.method === 'GET' ? [] : 1), { status: 200 });
  };
  const client = createCloudClient(validateCloudConfig({ url: 'https://test.supabase.co', publishableKey: 'sb_publishable_test' }));
  try {
    const session = { user: { id: profile.uid }, access_token: 'token-account-A' };
    const remote = client.remoteFor(session);
    session.access_token = 'token-account-B'; session.user.id = '22222222-2222-4222-8222-222222222222';
    await remote.read(); await remote.write(0, [trip()]);
    assert.ok(requests.every(r => r.authorization === 'Bearer token-account-A'));
    assert.ok(requests[0].url.includes(profile.uid));
  } finally { client.auth.stopAutoRefresh(); globalThis.fetch = originalFetch; }
});
