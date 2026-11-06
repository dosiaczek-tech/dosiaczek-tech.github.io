import { createClient } from '@supabase/supabase-js';
import { cleanTrips } from './sync-core.js';
import { projectId } from './journal-store.js';

export function validateCloudConfig(config) {
  if (!config?.url && !config?.publishableKey) return null;
  const url = new URL(config.url);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !['', '/'].includes(url.pathname)) throw new Error('Podaj adres HTTPS projektu Supabase bez dodatkowej ścieżki.');
  const key = config.publishableKey;
  let publicKey = typeof key === 'string' && /^sb_publishable_[A-Za-z0-9_-]+$/.test(key);
  if (!publicKey && typeof key === 'string' && key.split('.').length === 3) {
    try { publicKey = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role === 'anon'; } catch { /* Invalid legacy key. */ }
  }
  if (!publicKey) throw new Error('Konfiguracja wymaga publicznego klucza publishable / anon, nie klucza secret / service_role.');
  return { url: url.origin, publishableKey: key, project: projectId(url.origin) };
}

export async function timedFetch(url, options = {}) {
  const controller = new AbortController(), cancel = () => controller.abort();
  const timeout = setTimeout(cancel, 20000);
  if (options.signal?.aborted) cancel();
  options.signal?.addEventListener('abort', cancel, { once: true });
  try { return await fetch(url, { ...options, signal: controller.signal }); }
  finally { clearTimeout(timeout); options.signal?.removeEventListener('abort', cancel); }
}

export function createCloudClient(config) {
  const client = createClient(config.url, config.publishableKey, {
    auth: { storageKey: `sup:auth:${config.project}:v1`, persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' },
    global: { fetch: timedFetch }
  });
  return {
    auth: client.auth,
    remoteFor(session) {
      // Capture credentials for this account/cycle. A login in another tab must
      // never turn an in-flight write of A's journal into a write to B's account.
      const uid = session.user.id, token = session.access_token;
      async function request(path, body) {
        const response = await timedFetch(`${config.url}/rest/v1/${path}`, {
          method: body ? 'POST' : 'GET', cache: 'no-store',
          headers: { apikey: config.publishableKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          ...(body ? { body: JSON.stringify(body) } : {})
        });
        let data;
        try { data = await response.json(); } catch { throw new Error('Serwer chmury nie odpowiada poprawnie. Projekt może wymagać wznowienia w panelu Supabase.'); }
        if (!response.ok) throw Object.assign(new Error(data.message ?? 'Błąd zapisu w chmurze.'), { code: data.code, status: response.status });
        return data;
      }
      return {
        async read() {
          const rows = await request(`sup_journals?select=user_id,revision,trips&user_id=eq.${encodeURIComponent(uid)}`);
          if (!Array.isArray(rows) || rows.length > 1) throw new Error('Nieprawidłowa odpowiedź dziennika.');
          if (!rows.length) return { revision: 0, trips: [] };
          const row = rows[0];
          if (row.user_id !== uid || !Number.isSafeInteger(row.revision) || row.revision < 1) throw new Error('Nieprawidłowy właściciel lub wersja dziennika.');
          return { revision: row.revision, trips: cleanTrips(row.trips) };
        },
        async write(revision, trips) {
          const next = await request('rpc/sup_save_journal', { expected_revision: revision, new_trips: cleanTrips(trips) });
          if (!Number.isSafeInteger(next) || next <= revision) throw new Error('Serwer nie potwierdził nowej wersji dziennika.');
          return next;
        }
      };
    }
  };
}

export function cloudError(error) {
  if (error?.code === 'invalid_credentials' || /invalid login credentials/i.test(error?.message ?? '')) return 'Nieprawidłowy e-mail lub hasło.';
  if (error?.code === 'email_not_confirmed' || /email not confirmed/i.test(error?.message ?? '')) return 'Potwierdź adres e-mail, klikając link w wiadomości od dziennika.';
  if (error?.code === 'email_address_not_authorized') return 'Projekt nie ma jeszcze skonfigurowanej wysyłki na ten adres. Sprawdź instrukcję konfiguracji poczty.';
  if (error?.code === 'over_email_send_rate_limit' || error?.status === 429) return 'Osiągnięto limit prób lub wiadomości. Spróbuj ponownie później.';
  if (['PGRST205', 'PGRST202', '42P01', '42883'].includes(error?.code)) return 'Najpierw uruchom plik supabase/journal.sql w panelu swojego projektu.';
  if (error?.status === 401 || error?.code === 'PGRST301') return 'Sesja wygasła. Zaloguj się ponownie, aby wysłać lokalne zmiany.';
  if (error?.name === 'AbortError' || error instanceof TypeError || /fetch|network/i.test(error?.message ?? '')) return 'Brak połączenia z chmurą. Wpisy pozostają na tym urządzeniu; ponowimy synchronizację po odzyskaniu połączenia.';
  return error?.message ?? 'Nie udało się połączyć z chmurą. Lokalna kopia pozostaje zachowana.';
}
