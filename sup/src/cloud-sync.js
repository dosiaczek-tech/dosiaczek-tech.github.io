import { $, toast } from './ui.js';
import { validateCloudConfig, createCloudClient, timedFetch, cloudError } from './cloud-client.js';
import { synchronizeJournal, hasPendingChanges, SyncCancelled } from './sync-core.js';

export async function setupCloudSync(journal) {
  let config, client, session = null, generation = 0, running = false, timer, authBusy = false;
  const status = $('cloud-status'), message = $('cloud-message');
  const say = text => { message.textContent = text; message.hidden = !text; };
  const profileMatches = () => session && journal.profile?.uid === session.user.id && journal.profile?.project === config.project;
  function renderAccount() {
    const profile = journal.profile;
    $('cloud-account').hidden = !session;
    $('cloud-auth-form').hidden = !client || Boolean(session);
    $('cloud-email-label').textContent = session?.user.email ?? '';
    $('journal-storage-note').textContent = profile ? `Lokalna kopia konta ${profile.email}. Stan zapisu w chmurze jest pokazany poniżej.` : 'Wpisy zapisane na tym urządzeniu. Zaloguj się, aby używać wspólnego dziennika.';
    $('journal-form-note').textContent = profile ? 'Zapis lokalny z synchronizacją po zalogowaniu i połączeniu z internetem.' : 'Zapis lokalny. Logowanie do chmury jest opcjonalne.';
    let count = 0;
    if (profileMatches()) count = journal.localCandidates().length;
    $('cloud-import-local').hidden = !count;
    $('cloud-import-local').textContent = `Przenieś wcześniejsze wpisy z tego urządzenia (${count})`;
    $('cloud-local-mode').hidden = !profile || Boolean(session);
  }
  const schedule = (delay = 700) => { clearTimeout(timer); timer = setTimeout(() => void sync(), delay); };
  async function sync() {
    if (!profileMatches()) return;
    if (running) { schedule(1000); return; }
    if (!navigator.onLine) { status.textContent = 'Bez internetu — lokalne zmiany czekają na wysłanie.'; return; }
    const epoch = generation, scope = journal.storageKey;
    const isCurrent = () => generation === epoch && profileMatches() && journal.storageKey === scope;
    const run = async () => {
      if (!isCurrent()) return;
      status.textContent = 'Synchronizuję dziennik…';
      const result = await synchronizeJournal({
        remote: client.remoteFor(session), read: journal.readSyncState, isCurrent,
        apply: (trips, metadata) => journal.applySync(trips, metadata, scope)
      });
      if (!isCurrent()) return;
      status.textContent = result.pending ? 'Zapisano lokalnie — trwa wysyłanie kolejnych zmian.' : 'Zsynchronizowano — dziennik jest zapisany w chmurze.';
      if (result.conflicts) say(`Rozbieżne zmiany na urządzeniach: zachowano ${result.conflicts} dodatkowych kopii wypraw z dopiskiem „kopia konfliktu”. Możesz je przejrzeć i uporządkować.`);
      if (result.pending) schedule();
      renderAccount();
    };
    running = true; $('cloud-sync-now').disabled = true;
    try {
      if (navigator.locks) await navigator.locks.request(`sup:sync:${scope}`, run);
      else await run();
    } catch (error) {
      if (!(error instanceof SyncCancelled) && isCurrent()) status.textContent = cloudError(error);
    } finally { running = false; $('cloud-sync-now').disabled = false; }
  }
  function handleSession(event, next) {
    session = next; generation++;
    try {
      if (session) {
        const profile = { project: config.project, uid: session.user.id, email: session.user.email ?? '' };
        if (!journal.switchProfile(profile)) { status.textContent = 'Zapisz szkic lub zakończ jego edycję, a następnie zaloguj się ponownie, aby zmienić dziennik.'; renderAccount(); return; }
        if (event === 'PASSWORD_RECOVERY') { $('cloud-password-form').hidden = false; say('Ustaw nowe hasło do swojego dziennika.'); }
        status.textContent = 'Wczytuję dziennik konta…';
        schedule(0);
      } else {
        clearTimeout(timer);
        // A missing/expired session retains the account's offline cache. Only
        // an explicit sign-out switches back to the separate guest journal.
        if (event === 'SIGNED_OUT') journal.switchProfile(null);
        status.textContent = journal.profile ? `Lokalna kopia konta ${journal.profile.email}. Zaloguj się, aby synchronizować.` : 'Tryb lokalny — zaloguj się na obu urządzeniach do tego samego konta.';
      }
      renderAccount();
    } catch (error) { status.textContent = cloudError(error); }
  }
  async function authAction(action) {
    if (authBusy) return;
    authBusy = true; say('');
    const buttons = [...$('cloud-panel').querySelectorAll('[data-auth-action]')];
    buttons.forEach(button => { button.disabled = true; });
    try { await action(); }
    catch (error) { say(cloudError(error)); }
    finally { authBusy = false; buttons.forEach(button => { button.disabled = false; }); }
  }
  try {
    $('cloud-local-mode').addEventListener('click', () => { if (journal.switchProfile(null)) { renderAccount(); status.textContent = 'Tryb lokalny — kopia konta pozostaje zachowana osobno.'; } });
    renderAccount();
    const response = await timedFetch(new URL('../cloud-config.json', import.meta.url), { cache: 'no-store' });
    if (!response.ok) throw new Error('Nie udało się wczytać konfiguracji chmury.');
    config = validateCloudConfig(await response.json());
    if (!config) {
      $('cloud-auth-form').hidden = true;
      status.textContent = 'Synchronizacja jest przygotowana. Aby ją uruchomić, połącz aplikację ze swoim darmowym projektem Supabase.';
      return;
    }
    client = createCloudClient(config);
    $('cloud-setup-note').hidden = true;
    const redirectTo = new URL('./', window.location.href).href;
    client.auth.onAuthStateChange((event, next) => { setTimeout(() => handleSession(event, next), 0); });
    $('cloud-auth-form').addEventListener('submit', event => {
      event.preventDefault();
      void authAction(async () => {
        const { error } = await client.auth.signInWithPassword({ email: $('cloud-email').value.trim(), password: $('cloud-password').value });
        if (error) throw error;
        $('cloud-password').value = '';
      });
    });
    $('cloud-signup').addEventListener('click', () => {
      if (!$('cloud-auth-form').reportValidity()) return;
      void authAction(async () => {
        const { data, error } = await client.auth.signUp({ email: $('cloud-email').value.trim(), password: $('cloud-password').value, options: { emailRedirectTo: redirectTo } });
        if (error) throw error;
        $('cloud-password').value = '';
        say(data.session ? 'Konto jest gotowe.' : 'Sprawdź skrzynkę e-mail i potwierdź adres, a następnie zaloguj się do dziennika.');
      });
    });
    $('cloud-reset-password').addEventListener('click', () => {
      if (!$('cloud-email').reportValidity()) return;
      void authAction(async () => {
        const { error } = await client.auth.resetPasswordForEmail($('cloud-email').value.trim(), { redirectTo });
        if (error) throw error;
        say('Jeśli konto istnieje, otrzymasz e-mail z linkiem do ustawienia nowego hasła.');
      });
    });
    $('cloud-password-form').addEventListener('submit', event => {
      event.preventDefault();
      void authAction(async () => {
        const { error } = await client.auth.updateUser({ password: $('cloud-new-password').value });
        if (error) throw error;
        $('cloud-new-password').value = ''; $('cloud-password-form').hidden = true; say('Nowe hasło zostało zapisane.');
      });
    });
    $('cloud-signout').addEventListener('click', () => void authAction(async () => {
      if (!journal.switchProfile(null)) return;
      generation++;
      const { error } = await client.auth.signOut({ scope: 'local' });
      if (error) throw error;
      $('cloud-password-form').hidden = true;
    }));
    $('cloud-import-local').addEventListener('click', () => {
      if (!profileMatches()) return;
      try { const result = journal.importLocal(); toast(`Przeniesiono wpisy: ${result.added}. Kopia lokalna pozostała zachowana.`); renderAccount(); schedule(0); }
      catch (error) { say(cloudError(error)); }
    });
    $('cloud-sync-now').addEventListener('click', () => schedule(0));
    document.addEventListener('sup:journal-change', event => {
      if (event.detail?.origin === 'remote' || event.detail?.origin === 'profile') return;
      try {
        renderAccount();
        if (profileMatches() && hasPendingChanges(journal.readSyncState())) { status.textContent = 'Zapisano na urządzeniu — zmiany czekają na wysłanie.'; schedule(); }
      } catch (error) { status.textContent = cloudError(error); }
    });
    window.addEventListener('online', () => schedule(0));
    window.addEventListener('offline', () => { if (session) status.textContent = 'Bez internetu — lokalne zmiany czekają na wysłanie.'; });
    window.addEventListener('focus', () => { if (session) schedule(0); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden && session) schedule(0); });
    setInterval(() => { if (!document.hidden && session) schedule(0); }, 60000);
  } catch (error) {
    $('cloud-auth-form').hidden = true;
    status.textContent = cloudError(error);
  }
}
