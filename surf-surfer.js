/* Profil surfera: poziom i deska, wspólne dla prognozy spotu, porównania i heat mapy.
 * Wybór zapamiętuje przeglądarka; każda zmiana wysyła zdarzenie "surfer-profile", po którym oceny liczą się na nowo.
 */
(function (root) {
  "use strict";
  const KEY = "nad-morzem:surfer-profile";
  const profiles = root.SurfModel.PROFILES;
  let current = "intermediate";
  try {
    const saved = root.localStorage.getItem(KEY);
    if (profiles[saved]) current = saved;
  } catch { /* Without storage the default profile stays. */ }
  const selects = () => root.document.querySelectorAll("select[data-surfer-profile]");
  function set(id) {
    if (!profiles[id] || id === current) return;
    current = id;
    try { root.localStorage.setItem(KEY, id); } catch { /* The choice still holds until the page closes. */ }
    for (const select of selects()) select.value = id;
    root.dispatchEvent(new CustomEvent("surfer-profile", { detail: id }));
  }
  function bind() {
    for (const select of selects()) {
      select.replaceChildren(...Object.entries(profiles).map(([id, profile]) => new Option(profile.label, id)));
      select.value = current;
      select.addEventListener("change", () => set(select.value));
    }
  }
  if (root.document.readyState === "loading") root.document.addEventListener("DOMContentLoaded", bind);
  else bind();
  root.SurfSurfer = { current: () => current, set };
})(window);
