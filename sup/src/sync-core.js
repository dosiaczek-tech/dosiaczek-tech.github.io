import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { parseBackup } from './core.js';

const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
export const fingerprint = value => value === undefined ? null : bytesToHex(sha256(utf8ToBytes(JSON.stringify(canonical(value)))));
export const fingerprints = trips => Object.fromEntries(trips.map(trip => [trip.id, fingerprint(trip)]));
export const cleanTrips = trips => parseBackup(JSON.stringify({ version: 1, trips }));
const byId = (a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
export const sameTrips = (a, b) => fingerprint([...a].sort(byId)) === fingerprint([...b].sort(byId));
export const hasPendingChanges = state => fingerprint(fingerprints(state.trips)) !== fingerprint(state.base);

// Three-way merge against the last server snapshot. Absence after a known
// revision is a deletion, not a new record to resurrect on an older device.
export function mergeJournals(local, base, remote) {
  const left = new Map(cleanTrips(local).map(trip => [trip.id, trip]));
  const right = new Map(cleanTrips(remote).map(trip => [trip.id, trip]));
  const result = new Map(), copies = [];
  for (const id of new Set([...Object.keys(base), ...left.keys(), ...right.keys()])) {
    const a = left.get(id), b = right.get(id), old = Object.hasOwn(base, id) ? base[id] : null;
    const ah = fingerprint(a), bh = fingerprint(b);
    if (ah === bh || bh === old) { if (a) result.set(id, a); }
    else if (ah === old) { if (b) result.set(id, b); }
    else {
      // Keep both edits; an edit concurrent with deletion becomes a new copy.
      if (a && b) result.set(id, b);
      const value = a ?? b;
      copies.push({ ...value, id: `conflict-${fingerprint(value)}`, name: `${value.name.slice(0, 82)} (kopia konfliktu)` });
    }
  }
  let conflicts = 0;
  for (const copy of copies) {
    // Deterministic IDs make retries (including a lost write response) idempotent.
    // Preserve a previously edited conflict copy too, rather than overwriting it.
    while (result.has(copy.id) && fingerprint(result.get(copy.id)) !== fingerprint(copy)) copy.id = `conflict-${fingerprint(copy)}`;
    if (!result.has(copy.id)) { result.set(copy.id, copy); conflicts++; }
  }
  return { trips: cleanTrips([...result.values()]), conflicts };
}

export class SyncCancelled extends Error {}

// Dependencies are injected so concurrency, offline writes and account switches
// can be tested without a remote account. All local persistence is atomic.
export async function synchronizeJournal({ remote, read, apply, isCurrent }) {
  let conflicts = 0;
  const check = () => { if (!isCurrent()) throw new SyncCancelled(); };
  for (let attempt = 0; attempt < 4; attempt++) {
    check();
    const server = await remote.read();
    check();
    const state = read();
    // Clearing all trips keeps a versioned row on the server. A missing or
    // rolled-back row is not an instruction to erase a previously synced cache.
    if (server.revision < state.revision) throw new Error('Chmura zwróciła starszą lub brakującą wersję dziennika. Lokalna kopia pozostaje zachowana; ponów synchronizację lub sprawdź projekt Supabase.');
    const merged = mergeJournals(state.trips, state.base, server.trips);
    conflicts += merged.conflicts;
    apply(merged.trips, { base: fingerprints(server.trips), revision: server.revision });
    const sent = read().trips;
    if (sameTrips(sent, server.trips)) {
      apply(sent, { lastSyncedAt: new Date().toISOString() });
      return { conflicts, pending: false };
    }
    let revision;
    try { revision = await remote.write(server.revision, sent); }
    catch (error) { if (error.code === '40001') continue; throw error; }
    check();
    // An edit made while the request was in flight stays in the local journal.
    // Only the acknowledged server snapshot becomes the new baseline.
    const latest = read();
    if (latest.revision > revision) continue; // Another tab has already acknowledged a newer server revision.
    apply(latest.trips, { base: fingerprints(sent), revision, lastSyncedAt: new Date().toISOString() });
    if (sameTrips(latest.trips, sent)) return { conflicts, pending: false };
  }
  return { conflicts, pending: true };
}
