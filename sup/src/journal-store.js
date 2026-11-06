import { STORAGE_KEY, parseBackup, loadTrips } from './core.js';
import { cleanTrips, fingerprint, fingerprints } from './sync-core.js';

export const ACTIVE_PROFILE_KEY = 'sup:journal:active:v1';
export const projectId = url => fingerprint(new URL(url).origin).slice(0, 16);
export const accountKey = profile => `sup:journal:account:${profile.project}:${profile.uid}:v1`;
function validateProfile(profile) {
  if (profile === null) return null;
  if (!profile || !/^[a-f0-9]{16}$/.test(profile.project) || !/^[a-f0-9-]{36}$/i.test(profile.uid) || typeof profile.email !== 'string' || profile.email.length > 254) throw new Error('Nieprawidłowy zapis profilu dziennika.');
  return { project: profile.project, uid: profile.uid, email: profile.email };
}
function validateHashes(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length > 500 || Object.entries(value).some(([id, hash]) => !id || id.length > 200 || !/^[a-f0-9]{64}$/.test(hash))) throw new Error('Nieprawidłowa historia synchronizacji. Zachowano lokalną kopię.');
  return value;
}

export function createJournalStore(storage) {
  let profile;
  function currentProfile() {
    if (profile === undefined) profile = validateProfile(JSON.parse(storage.getItem(ACTIVE_PROFILE_KEY) ?? 'null'));
    return profile;
  }
  const key = () => currentProfile() ? accountKey(profile) : STORAGE_KEY;
  function readAt(storageKey) {
    const raw = storage.getItem(storageKey), data = raw === null ? { trips: [] } : JSON.parse(raw);
    const trips = raw === null ? [] : parseBackup(raw), sync = data.sync ?? {};
    if (sync.revision !== undefined && (!Number.isSafeInteger(sync.revision) || sync.revision < 0)) throw new Error('Nieprawidłowa wersja synchronizacji.');
    return { scope: storageKey, trips, base: validateHashes(sync.base ?? {}), revision: sync.revision ?? 0, importedLocal: validateHashes(sync.importedLocal ?? {}), lastSyncedAt: typeof sync.lastSyncedAt === 'string' ? sync.lastSyncedAt : null };
  }
  return {
    get key() { return key(); },
    get profile() { return currentProfile(); },
    read: () => readAt(key()),
    raw: () => storage.getItem(key()),
    write(trips, metadata = {}) {
      const state = readAt(key()), clean = cleanTrips(trips);
      const next = { ...state, ...metadata };
      validateHashes(next.base); validateHashes(next.importedLocal);
      const sync = { base: next.base, revision: next.revision, importedLocal: next.importedLocal, lastSyncedAt: next.lastSyncedAt };
      const text = JSON.stringify({ version: 1, trips: clean, ...(currentProfile() ? { sync } : {}) });
      if (text.length > 15_000_000) throw new Error('Dziennik z historią synchronizacji przekracza 15 MB. Wyeksportuj starsze wpisy.');
      storage.setItem(key(), text);
      return clean;
    },
    switchProfile(next) {
      const checked = validateProfile(next), state = readAt(checked ? accountKey(checked) : STORAGE_KEY);
      if (checked) storage.setItem(ACTIVE_PROFILE_KEY, JSON.stringify(checked));
      else storage.removeItem(ACTIVE_PROFILE_KEY);
      profile = checked;
      return state.trips;
    },
    localFingerprints: () => fingerprints(loadTrips(storage)),
    localCandidates() {
      const imported = readAt(key()).importedLocal;
      return loadTrips(storage).filter(trip => !Object.hasOwn(imported, trip.id) || imported[trip.id] !== fingerprint(trip));
    }
  };
}
