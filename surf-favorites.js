/* Favourite surf spots (since 20.11.2026): a heart beside a spot's forecast, and on its tiles and beside its lists in
   "Gdzie warto jechać?"; "Porównaj ulubione" compares them. The browser remembers them apart from the favourite
   cameras. */
(function (root) {
  "use strict";
  const KEY = "nad-morzem:favorite-spots-v1";
  // Spots of the catalogue, each once, in the order they were added.
  function clean(saved, catalog) {
    const known = new Set(catalog.map(spot => spot.id));
    return Array.isArray(saved) ? [...new Set(saved.filter(id => known.has(id)))] : [];
  }
  // A heart adds a spot at the end of the list, or takes it out.
  const toggled = (list, id) => list.includes(id) ? list.filter(other => other !== id) : [...list, id];
  const label = (spot, favorite) => `${favorite ? "Usuń z ulubionych" : "Dodaj do ulubionych"}: ${spot.town} — ${spot.name}`;
  const api = { KEY, clean, toggled, label };
  if (typeof module !== "undefined") { module.exports = api; return; }

  // In the page: one list for the forecasts and the comparison. Every change is announced as "surf:favorites".
  let list = null, toastTimer = 0;
  const load = () => {
    if (!list) {
      try { list = clean(JSON.parse(localStorage.getItem(KEY)), root.SurfSpots || []); } catch { list = []; }
    }
    return list;
  };
  // The same short message at the bottom as the hearts of the cameras.
  function announce(text) {
    const toast = document.getElementById("toast");
    if (!toast) return;
    clearTimeout(toastTimer);
    toast.textContent = text; toast.classList.add("visible");
    toastTimer = setTimeout(() => toast.classList.remove("visible"), 3500);
  }
  root.SurfFavorites = {
    ...api,
    list: () => [...load()],
    has: id => load().includes(id),
    toggle(spot) {
      list = toggled(load(), spot.id);
      try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* The list still works in memory. */ }
      const favorite = list.includes(spot.id);
      announce(`${spot.town} — ${spot.name}: ${favorite ? "dodano do ulubionych" : "usunięto z ulubionych"}.`);
      root.dispatchEvent(new CustomEvent("surf:favorites", { detail: { id: spot.id, favorite } }));
      return favorite;
    },
    // A heart button with the look of the cameras' hearts, kept in step with the list.
    sync(button, spot) {
      const favorite = load().includes(spot.id);
      button.setAttribute("aria-pressed", String(favorite));
      button.setAttribute("aria-label", label(spot, favorite)); button.title = label(spot, favorite);
    }
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
