/* Explicit comparison actions; daily scores use the shared coastal session model. */
(function (root) {
  "use strict";
  const DEFAULT_SLOTS = 5, MAX_SLOTS = 15;
  // Formatters are costly to build and charts format thousands of hours: create each one once.
  const dayKeyFormat = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw", year: "numeric", month: "2-digit", day: "2-digit" });
  const dayKey = time => dayKeyFormat.format(new Date(time * 1000));
  const historyStart = now => Math.floor(now / 3600000) * 3600 - 24 * 3600;
  const Search = typeof module !== "undefined" ? require("./surf-search.js") : root.SurfSearch;
  const spotLabel = spot => `${spot.town} — ${spot.name}`;
  // The spot list always holds every spot, so its window keeps its size while the user types (since 20.11.2026).
  // The same typo-tolerant search as the forecast spot field puts the matching names first, best first, then the
  // similar ones; the other spots follow in alphabetical order ("other"). One letter puts the towns starting with it
  // first. Without text the favourite spots come first ("favorite"), also in alphabetical order (since 20.11.2026).
  function pickerOrder(spots, query, favorites = []) {
    const alphabetical = [...spots].sort((a, b) => spotLabel(a).localeCompare(spotLabel(b), "pl"));
    const text = Search.normalize(query);
    if (!text) {
      const liked = new Set(favorites);
      return [...alphabetical.filter(spot => liked.has(spot.id)).map(spot => ({ spot, kind: "favorite" })),
        ...alphabetical.filter(spot => !liked.has(spot.id)).map(spot => ({ spot, kind: "all" }))];
    }
    const fit = new Map();
    if (text.length < 2) {
      for (const spot of alphabetical) if (Search.normalize(spot.town).split(" ").some(word => word.startsWith(text))) fit.set(spot.id, "match");
    } else {
      const ranked = Search.search(spots, query, spots.length);
      for (const r of ranked.filter(r => r.strong || r.score <= .25)) fit.set(r.spot.id, "match");
      for (const r of ranked.filter(r => r.score <= .65)) if (!fit.has(r.spot.id)) fit.set(r.spot.id, "similar");
    }
    const byId = new Map(spots.map(spot => [spot.id, spot]));
    return [...[...fit].map(([id, kind]) => ({ spot: byId.get(id), kind })),
      ...alphabetical.filter(spot => !fit.has(spot.id)).map(spot => ({ spot, kind: "other" }))];
  }
  function calendarDays(now = Date.now()) {
    const today = dayKey(now / 1000), first = dayKey(historyStart(now));
    const noon = Date.parse(`${today}T12:00:00Z`) / 1000;
    const days = Array.from({ length: 14 }, (_, i) => dayKey(noon + i * 86400));
    if (first !== today) days.unshift(first);
    return days;
  }
  // 00:00 in Warsaw on a YYYY-MM-DD day. Warsaw is one or two hours ahead of UTC,
  // so its midnight is one of the hours from 21:00 UTC on the previous day.
  function dayStart(key) {
    const from = Date.parse(`${key}T00:00:00Z`) / 1000 - 3 * 3600;
    return Array.from({ length: 6 }, (_, i) => from + i * 3600).find(time => dayKey(time) === key);
  }
  // The compared spots in the order of their lists: spots of the catalogue, each once, at most fifteen. Since
  // 20.11.2026 the lists have no gaps: × removes a list and an empty one at the end adds the next spot.
  function choose(catalog, selection = []) {
    const valid = new Set(catalog.map(s => s.id));
    return [...new Set((Array.isArray(selection) ? selection : []).filter(id => valid.has(id)))].slice(0, MAX_SLOTS);
  }
  // Each spot keeps its colour and line pattern while it stays compared; a new spot takes the first free pair.
  function assignColors(previous, list) {
    const next = new Map(list.filter(id => previous.has(id)).map(id => [id, previous.get(id)]));
    const used = new Set(next.values());
    for (const id of list) if (!next.has(id)) {
      let free = 0;
      while (used.has(free)) free++;
      next.set(id, free); used.add(free);
    }
    return next;
  }
  function retainHistory(rows, saved, now = Date.now()) {
    const byTime = new Map();
    const from = historyStart(now);
    const recent = r => r && Number.isFinite(r.time) && r.time >= from;
    for (const r of Array.isArray(saved) ? saved : []) {
      if (recent(r) && r.time * 1000 < now && Number.isFinite(r.score) && r.score >= 0 && r.score <= 10 && r.simulation && typeof r.daylight === "boolean")
        byTime.set(r.time, { ...r, archived: true });
    }
    for (const r of rows) if (recent(r) && (Number.isFinite(r.score) || !byTime.has(r.time))) byTime.set(r.time, r);
    return [...byTime.values()].sort((a, b) => a.time - b.time);
  }
  // The copy kept in the browser storage only needs the hours that can become history before a later load:
  // the last 24 hours and the next 24. The rest of the forecast arrives fresh with every load; saving it for all
  // spots used to fill the whole storage, which the camera favourites and the SUP app share.
  function savedHistory(rows, now = Date.now()) {
    return rows.filter(r => r.time * 1000 < now + 24 * 3600000).map(r => ({ time: r.time, score: r.score,
      height: r.height, daylight: r.daylight, simulation: r.simulation ? { height: r.height } : null,
      confidence: r.confidence, flags: r.flags, cleanup: r.cleanup, windowScore: r.windowScore }));
  }
  function daily(rows, model, now = Date.now()) {
    const groups = new Map();
    const from = historyStart(now);
    for (const row of rows) {
      if (row.time < from || !row.simulation) continue;
      const key = dayKey(row.time);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }
    return new Map([...groups].map(([key, values]) => {
      values.sort((a, b) => a.time - b.time);
      const upcoming = model.bestWindows(values.filter(r => r.time * 1000 >= now), 1)[0];
      const window = upcoming || model.bestWindows(values, 1)[0];
      if (window) return [key, { ...window, historical: !upcoming, archived: values.some(r => r.time >= window.start && r.time < window.end && r.archived) }];
      // Historical hourly ratings remain meaningful even at night or when fewer
      // than three hours survive the rolling cutoff. This is a summary, not a session.
      const past = chartHours(values, now).filter(r => r.historical && Number.isFinite(r.score));
      return [key, past.length ? { score: Math.round(past.reduce((sum, r) => sum + r.score, 0) / past.length * 10) / 10,
        start: past[0].time, end: past.at(-1).time + 3600, historical: true,
        kind: "history-average", hours: past.length, archived: values.some(r => r.archived && past.some(p => p.time === r.time)) } : null];
    }));
  }
  // "Where to go": each spot's best three-hour daylight window on one day (or over several days from today), best first.
  // A window stays listed through the minute it ends, also once it has started; each day stops at midnight.
  function topWindows(entries, model, now = Date.now(), { day = null, days = 5 } = {}) {
    const minute = Math.floor(now / 60000) * 60, noon = Date.parse(`${dayKey(now / 1000)}T12:00:00Z`) / 1000;
    const allowed = new Set(day ? [day] : Array.from({ length: days }, (_, i) => dayKey(noon + i * 86400)));
    return entries.flatMap(({ id, rows }) => {
      const open = rows.filter(row => row.time + 3 * 3600 >= minute && row.simulation && allowed.has(dayKey(row.time)))
        .sort((a, b) => a.time - b.time);
      return model.bestWindows(open, 1).map(window => ({ id, ...window }));
    }).sort((a, b) => b.score - a.score || a.start - b.start);
  }
  // Every spot with a rating on the day, best first. The page ranks each day once, so the random order of ties
  // stays the same when a spot is hidden or restored.
  function rankSpots(entries, selectedDay, random = Math.random) {
    const ranked = entries.map(({ id, days }) => ({ id, window: days.get(selectedDay) }))
      .filter(entry => Number.isFinite(entry.window?.score));
    // Shuffle before the stable score sort: ties are random without dropping better spots.
    for (let i = ranked.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [ranked[i], ranked[j]] = [ranked[j], ranked[i]];
    }
    return ranked.sort((a, b) => Number(Boolean(a.window.historical)) - Number(Boolean(b.window.historical)) ||
      b.window.score - a.window.score).map(r => r.id);
  }
  // The day's five best without the spots hidden on that day. Since 20.11.2026 nothing takes a hidden spot's place.
  function topSpots(order, hidden = []) {
    const skip = new Set(hidden);
    return order.slice(0, DEFAULT_SLOTS).filter(id => !skip.has(id));
  }
  function bestSpots(entries, selectedDay, random = Math.random, hidden = []) {
    return topSpots(rankSpots(entries, selectedDay, random), hidden);
  }
  function chartHours(rows, now = Date.now()) {
    const current = Math.floor(now / 3600000) * 3600;
    return rows.filter(row => Number.isFinite(row.time) && row.time >= historyStart(now))
      .slice().sort((a, b) => a.time - b.time).map(row => ({ time: row.time,
        score: row.simulation && Number.isFinite(row.score) && row.score >= 0 && row.score <= 10 ? row.score : null,
        historical: row.time < current }));
  }
  function chartExtent(series) {
    const times = series.flatMap(s => s.hours.filter(row => Number.isFinite(row.time) && Number.isFinite(row.score)).map(row => row.time));
    return times.length ? { from: Math.min(...times), until: Math.max(...times) } : null;
  }
  function chartSegments(hours) {
    const segments = [];
    let segment = null;
    for (const row of hours) {
      if (!Number.isFinite(row.time) || !Number.isFinite(row.score)) { segment = null; continue; }
      if (!segment || row.time - segment.at(-1).time !== 3600) {
        segment = []; segments.push(segment);
      }
      segment.push(row);
    }
    return segments;
  }
  // The midnights that bound one day on the chart; a day cut off by the start or end of the data has no edge there.
  function dayEdges(times, extent) {
    return [times[0], times.at(-1) + 3600].filter((edge, i) => i ? edge <= extent.until : edge > extent.from);
  }
  // Charts never zoom closer than six hours and never pan past the available data.
  const MIN_CHART_VIEW = 6 * 3600;
  function clampView(extent, from, until, maxSpan = Infinity) {
    const full = extent.until - extent.from;
    const span = Math.min(full, maxSpan, Math.max(Math.min(MIN_CHART_VIEW, full), until - from));
    const start = Math.max(extent.from, Math.min(from, extent.until - span));
    return { from: start, until: start + span };
  }
  const api = { choose, assignColors, pickerOrder, clampView, topWindows, daily, dayKey, dayStart, retainHistory, savedHistory, rankSpots, topSpots, bestSpots, calendarDays, chartHours, chartExtent, chartSegments, dayEdges };
  if (typeof module !== "undefined") module.exports = api;
  else root.SurfCompare = api;
  if (typeof document === "undefined") return;
  document.addEventListener("DOMContentLoaded", () => {
    const M = root.SurfModel, catalog = root.SurfSpots;
    const $ = id => document.getElementById(id);
    const colors = ["#126a96", "#903ca3", "#a44b12", "#087a6a", "#4d50b0",
      "#b02e58", "#617c16", "#1a7482", "#744226", "#bc6717",
      "#3c5f93", "#a43687", "#426d3e", "#725e9c", "#3e5962"];
    const linePatterns = [
      { dash: "none", name: "ciągła" },
      { dash: "8 4", name: "kreskowana" },
      { dash: "1 5", name: "kropkowana" },
      { dash: "12 4 1 4", name: "kreska–kropka" },
      { dash: "12 4 1 4 1 4", name: "kreska–dwie kropki" },
      { dash: "20 6", name: "długie kreski" },
      { dash: "4 4", name: "krótkie kreski" },
      { dash: "18 4 6 4", name: "długa–krótka kreska" },
      { dash: "1 4 1 8", name: "pary kropek" },
      { dash: "8 3 8 9", name: "pary kresek" },
      { dash: "20 4 1 4", name: "długa kreska–kropka" },
      { dash: "20 4 1 4 1 4", name: "długa kreska–dwie kropki" },
      { dash: "14 4 4 4 4 4", name: "długa kreska–dwie krótkie" },
      { dash: "1 4 1 4 1 9", name: "trójki kropek" },
      { dash: "18 4 6 4 1 4", name: "długa kreska–krótka kreska–kropka" }
    ];
    const cache = new Map();
    const problems = new Map();
    // "Pokaż najlepsze": each day's ranking of the whole catalogue, from which the five shown spots are taken.
    const orderByDay = new Map();
    let data = [], days = [], loading = false, snapshotTime = Date.now();
    // The chart and the day tiles start with five days from today; each button adds or removes five more.
    let selectedDay, generation = 0, autoGeneration = 0, manual = true, dayPages = 1, dayFirst = 0, loadedEntries = [];
    const PAGE_DAYS = 5;
    const pageCount = () => Math.max(1, Math.ceil((days.length - dayFirst) / PAGE_DAYS));
    const pageOf = key => Math.floor((days.findIndex(d => d.key === key) - dayFirst) / PAGE_DAYS);
    const shownUntil = () => dayFirst + dayPages * PAGE_DAYS;
    function showPages(pages) {
      dayPages = Math.max(1, Math.min(pageCount(), pages));
      // Only the day tiles change; the chart keeps its five-day scale.
      // Removing days never leaves the ranking on a day that is no longer shown.
      const index = days.findIndex(d => d.key === selectedDay);
      const changed = index >= shownUntil();
      if (changed) selectedDay = days[dayFirst].key;
      updateDaySelection();
      if (changed) { chartView = null; if (!loading) render(); }
    }
    // choices: the compared spots in the order of their lists; palette: each one's colour and line (an index).
    let ids = [], choices = choose(catalog), palette = new Map(), settleUntil = 0;
    // "Porównaj ulubione" shows the favourite spots until the list is changed (since 20.11.2026).
    let favoriteMode = false;
    // Each list remembers its own last manual choice, so "Pokaż najlepsze" never loses it.
    const recentSpotsKey = "nad-morzem:compare-recent-spots-v2";
    let recentSpots = Array(MAX_SLOTS).fill(""), activePicker = null;
    try {
      const saved = JSON.parse(localStorage.getItem(recentSpotsKey));
      if (Array.isArray(saved)) recentSpots = recentSpots.map((_, i) => catalog.some(spot => spot.id === saved[i]) ? saved[i] : "");
    } catch { /* Recent choices still work in memory if storage is unavailable. */ }
    // Spots hidden with × in "Pokaż najlepsze" (since 20.11.2026, the user's choice): only on the chosen day, and only
    // until the page is loaded again, so a new visit starts with every rated spot. The list the browser kept before
    // (every day, for good) is cleared.
    const hiddenByDay = new Map();
    const hiddenOn = day => hiddenByDay.get(day) || new Set();
    try { localStorage.removeItem("nad-morzem:compare-hidden-spots-v1"); } catch { /* Nothing was kept. */ }
    const el = (tag, text, cls) => {
      const item = document.createElement(tag);
      if (text !== undefined) item.textContent = text;
      if (cls) item.className = cls;
      return item;
    };
    const formats = new Map();
    const date = (t, options) => {
      const key = JSON.stringify(options);
      if (!formats.has(key)) formats.set(key, new Intl.DateTimeFormat("pl-PL", { timeZone: "Europe/Warsaw", ...options }));
      return formats.get(key).format(new Date(t * 1000));
    };
    const hour = t => date(t, { hour: "2-digit", minute: "2-digit" });
    const label = spot => `${spot.town} — ${spot.name}`;
    const sortedSpots = [...catalog].sort((a, b) => label(a).localeCompare(label(b), "pl"));
    const tone = score => !M.finite(score) ? "unknown" : score >= 9 ? "excellent" : score >= 8 ? "great" : score >= 6.5 ? "good" : score >= 5 ? "fair" : score >= 3 ? "weak" : score >= 1.5 ? "poor" : "bad";
    function updateActions() {
      $("compareBest").disabled = loading;
      $("compareRefresh").disabled = loading || !choices.length;
      const favorites = SurfFavorites.list().length;
      $("compareFavorites").disabled = loading || !favorites;
      // Since 21.11.2026 (the user's request) the button is green while the comparison shows the favourites.
      $("compareFavorites").setAttribute("aria-pressed", String(favoriteMode));
      $("compareFavoritesCount").textContent = favorites;
      $("compareFavorites").title = favorites ? `Porównaj ulubione spoty: ${favorites}` : "Dodaj spot do ulubionych sercem ♡ przy jego prognozie albo na kafelku.";
      $("compareSpotLimit").textContent = choices.length >= MAX_SLOTS
        ? `Osiągnięto limit ${MAX_SLOTS} spotów.` : `Maksymalnie ${MAX_SLOTS} spotów.`;
    }
    function chartState(state, message) {
      const box = el("div", undefined, `compare-chart-state is-${state}`);
      if (state === "loading") {
        box.setAttribute("role", "status");
        box.classList.add("heatmap-loading");
        const title = el("strong", "Loading");
        const dots = el("span", undefined, "heatmap-loading-dots");
        dots.setAttribute("aria-hidden", "true");
        dots.append(el("span", "."), el("span", "."), el("span", "."));
        title.append(dots); box.append(title);
      } else box.append(el("strong", "Tu pojawi się porównanie"));
      const detail = el("p", message);
      if (state === "loading") detail.id = "compareLoadingDetail";
      box.append(detail); $("compareChart").dataset.state = state; $("compareChart").replaceChildren(box);
    }
    function resetComparison() {
      ++generation; ++autoGeneration;
      loading = false; manual = true; favoriteMode = false; data = []; ids = []; orderByDay.clear();
      $("compareContent").setAttribute("aria-busy", "false"); $("compareContent").dataset.mode = "idle";
      closeHints();
      for (const id of ["compareLegend", "compareDays", "compareRanking", "compareHourlyTable"]) $(id).replaceChildren();
      $("compareRankingTitle").hidden = true; renderHidden();
      $("compareStatus").textContent = ""; $("compareStatus").hidden = true; $("compareErrors").hidden = true;
      const count = choices.length;
      $("compareStorage").textContent = (count ? `Wybrane spoty: ${count}/${MAX_SLOTS}. Kliknij „Porównaj wybrane”, aby je wyświetlić.`
        : `Wskaż własne spoty i kliknij „Porównaj wybrane” albo skorzystaj z „Pokaż najlepsze”${SurfFavorites.list().length ? " lub „Porównaj ulubione”" : ""}.`) +
        (SurfFavorites.list().length ? "" : " Serce ♡ przy prognozie spotu albo na kafelku dodaje spot do „Porównaj ulubione”.");
      chartState("idle", count ? "Wykres pojawi się po kliknięciu „Porównaj wybrane”." : "Wybierz spoty lub kliknij „Pokaż najlepsze”.");
      updateActions();
    }
    function closePicker() {
      if (!activePicker) return;
      activePicker.panel.hidden = true;
      activePicker.button.setAttribute("aria-expanded", "false");
      activePicker = null;
    }
    // Touch keyboards resize and scroll the page while the user types; keep the open list in place.
    const typing = () => activePicker && document.activeElement === activePicker.input;
    // The tabs stay at the top of the screen; an open spot list goes under them.
    const tabs = () => document.querySelector(".section-nav-bar");
    const freeColor = () => {
      const used = new Set(palette.values());
      let free = 0;
      while (used.has(free)) free++;
      return free;
    };
    // × in the corner of a spot's list or tile: with "Pokaż najlepsze" it hides the spot on the chosen day, in the
    // user's own lists it takes the spot out (removeSpot).
    function removeButton(spot) {
      const close = el("button", undefined, "compare-hide");
      close.type = "button"; close.title = manual ? "Usuń spot" : "Ukryj w tym dniu";
      close.setAttribute("aria-label", `${close.title}: ${label(spot)}`);
      close.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-close"/></svg>';
      close.addEventListener("click", () => removeSpot(spot.id, close));
      return close;
    }
    // A heart that adds the spot to the favourites or takes it out; the spot stays in the comparison. It is on each
    // tile and, since 21.11.2026 (the user's request), beside "Spot N" of each list with a spot.
    function heartButton(spot, className) {
      const heart = el("button", undefined, className);
      heart.type = "button"; heart.dataset.spot = spot.id;
      heart.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-heart"/></svg>';
      SurfFavorites.sync(heart, spot);
      heart.addEventListener("click", () => SurfFavorites.toggle(spot));
      return heart;
    }
    // A list per compared spot, with × in its corner, and after them an empty list that adds the next spot (since
    // 20.11.2026). The window of a list keeps its size while the user types: five rows of spots, the best matches first.
    // The empty list always reads "+ Dodaj spot": since 21.11.2026 (the user's request) no longer "+ Dodaj kolejny
    // spot", which a phone cut short.
    function spotPicker(id, index) {
      const spot = catalog.find(s => s.id === id);
      const field = el("div", undefined, "compare-selector");
      field.style.setProperty("--spot-color", colors[spot ? palette.get(id) ?? index : freeColor()]);
      const head = el("div", undefined, "compare-selector-head");
      const caption = el("label", `Spot ${index + 1}`); caption.id = `compareSpotLabel${index}`;
      const button = el("button", undefined, "compare-picker-button");
      button.type = "button"; button.id = `compareSpotChoice${index}`; button.dataset.value = id;
      button.dataset.empty = String(!spot); caption.htmlFor = button.id;
      const value = el("span", spot ? label(spot) : "Dodaj spot");
      value.id = `compareSpotValue${index}`; button.append(value);
      button.setAttribute("aria-haspopup", "listbox");
      button.setAttribute("aria-expanded", "false"); button.setAttribute("aria-labelledby", `${caption.id} ${value.id}`);
      if (!spot) button.setAttribute("aria-describedby", "compareSpotLimit");
      head.append(caption);
      if (spot) head.append(heartButton(spot, "compare-list-favorite"), removeButton(spot));
      const panel = el("div", undefined, "compare-picker-list");
      panel.id = `compareSpotPanel${index}`; panel.hidden = true;
      button.setAttribute("aria-controls", panel.id);
      const input = el("input", undefined, "compare-picker-search");
      input.type = "search"; input.id = `compareSpotSearch${index}`; input.placeholder = "Szukaj spotu, np. Stegna, Władek";
      input.autocomplete = "off"; input.spellcheck = false; input.enterKeyHint = "go";
      input.setAttribute("role", "combobox"); input.setAttribute("aria-autocomplete", "list");
      input.setAttribute("aria-expanded", "true"); input.setAttribute("aria-label", `Szukaj spotu ${index + 1}`);
      const list = el("div", undefined, "compare-picker-options");
      list.id = `compareSpotOptions${index}`; list.setAttribute("role", "listbox"); list.setAttribute("aria-labelledby", caption.id);
      input.setAttribute("aria-controls", list.id);
      panel.append(input, list);
      const recent = catalog.find(s => s.id === recentSpots[index]);
      let items = [], active = -1;
      // Every row has the same height: the name on one line, with at most one small note.
      const option = (item, optionIndex) => {
        const disabled = item.value !== id && choices.includes(item.value);
        const node = el("div", undefined, ["compare-picker-option", item.recent && "is-recent", item.pinned && "is-pinned",
          item.divider && "is-other", SurfFavorites.has(item.value) && "is-favorite"].filter(Boolean).join(" "));
        node.id = `${list.id}-${optionIndex}`; node.dataset.value = item.value;
        node.setAttribute("role", "option"); node.setAttribute("aria-selected", String(item.value === id));
        node.setAttribute("aria-disabled", String(disabled));
        if (item.recent && !disabled) node.append(el("small", "Ostatnio wybrany tutaj", "compare-recent-caption"));
        node.append(el("span", item.text));
        if (disabled) node.append(el("small", "Już w porównaniu", "compare-recent-note"));
        return { ...item, node, disabled };
      };
      const activate = (next, scroll = true) => {
        if (!items[next] || items[next].disabled) return;
        if (items[active]) delete items[active].node.dataset.active;
        active = next; items[active].node.dataset.active = "true";
        input.setAttribute("aria-activedescendant", items[active].node.id);
        if (scroll) items[active].node.scrollIntoView({ block: "nearest" });
      };
      // The list never shrinks while the user types: the spots that match the text come first, then the rest
      // (pickerOrder). Without text the spot last chosen in this list stays pinned at the top.
      const fill = () => {
        const order = pickerOrder(catalog, input.value, SurfFavorites.list());
        const pinned = ["all", "favorite"].includes(order[0]?.kind) && recent;
        const entries = pinned ? [{ spot: recent, kind: "recent" }, ...order.filter(entry => entry.spot.id !== recent.id)] : order;
        // A dashed line under the favourites, and between the spots that match the text and the others.
        const divider = (entry, before) => Boolean(before) && entry.kind !== before.kind && (entry.kind === "other" || before.kind === "favorite");
        items = entries.map((entry, i) => option({ value: entry.spot.id, text: label(entry.spot), recent: entry.spot.id === recent?.id,
          kind: entry.kind, pinned: pinned && !i, divider: divider(entry, entries[i - 1]) }, i));
        active = -1;
        list.replaceChildren(...items.map(item => item.node));
        input.removeAttribute("aria-activedescendant");
        // Always start at the top: the pinned recent spot first, otherwise the first available option. With text only
        // a spot that matches it is preselected, so Enter never picks an unrelated one.
        list.scrollTop = 0;
        activate(items.findIndex(item => !item.disabled && item.kind !== "other"), false);
      };
      // The window keeps its size: below the list when it fits above the keyboard, otherwise above the list,
      // otherwise as low as it fits under the tabs.
      const place = () => {
        const rect = button.getBoundingClientRect(), margin = 12, view = window.visualViewport;
        const width = Math.min(Math.max(rect.width, 300), window.innerWidth - margin * 2);
        panel.style.width = `${width}px`;
        panel.style.left = `${Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin))}px`;
        const top = Math.max(view ? view.offsetTop : 0, tabs()?.getBoundingClientRect().bottom || 0) + 6;
        const bottom = (view ? view.offsetTop + view.height : window.innerHeight) - margin, height = panel.offsetHeight;
        const below = rect.bottom + 6, above = rect.top - 6 - height;
        panel.style.top = `${below + height <= bottom ? below : above >= top ? above : Math.max(top, bottom - height)}px`;
      };
      const open = (text = "") => {
        closePicker();
        const touch = matchMedia("(pointer: coarse)").matches;
        if (touch) {
          // On a phone the list first moves up under the tabs, so its window and the keyboard fit below it. That
          // scroll, like the keyboard's, keeps the window open.
          window.scrollBy({ top: field.getBoundingClientRect().top - (tabs()?.offsetHeight || 0) - 8, behavior: "instant" });
          settleUntil = performance.now() + 400;
        }
        panel.hidden = false; button.setAttribute("aria-expanded", "true");
        activePicker = { button, panel, input, place };
        input.value = text; fill(); place();
        // Focus the search field directly with a keyboard or mouse; on touch it opens only when tapped.
        if (text || !touch) input.focus({ preventScroll: true });
      };
      const select = next => {
        const item = items[next];
        if (!item || item.disabled) return;
        recentSpots[index] = item.value;
        try { localStorage.setItem(recentSpotsKey, JSON.stringify(recentSpots)); } catch { /* In-memory choice remains available. */ }
        if (item.value !== id) {
          // The empty list adds the spot at the end; a filled one swaps its spot, which keeps the colour.
          const chosen = [...choices];
          if (spot) { chosen[index] = item.value; palette.set(item.value, palette.get(id)); } else chosen.push(item.value);
          choices = choose(catalog, chosen); palette = assignColors(palette, choices);
          dismissUndo();
          // In the favourites view the empty list adds a favourite (since 21.11.2026, the user's request): the spot gets
          // its heart, and the view goes on with it at the end, as "Porównaj ulubione" would show it.
          if (favoriteMode && !spot) {
            const added = catalog.find(s => s.id === item.value);
            if (!SurfFavorites.has(added.id)) SurfFavorites.toggle(added);
            selectors(index); ids = [...choices]; load();
            return;
          }
          resetComparison();
        }
        selectors(index);
      };
      const move = key => {
        const enabled = items.map((item, i) => item.disabled ? -1 : i).filter(i => i >= 0);
        if (!enabled.length) return;
        const position = enabled.indexOf(active);
        activate(key === "Home" ? enabled[0] : key === "End" ? enabled.at(-1)
          : enabled[Math.max(0, Math.min(enabled.length - 1, position + (key === "ArrowDown" ? 1 : -1)))]);
      };
      button.addEventListener("click", () => panel.hidden ? open() : closePicker());
      list.addEventListener("click", event => {
        select(items.findIndex(item => item.node === event.target.closest('[role="option"]')));
      });
      list.addEventListener("pointermove", event => {
        activate(items.findIndex(item => item.node === event.target.closest('[role="option"]')), false);
      });
      input.addEventListener("input", fill);
      input.addEventListener("keydown", event => {
        if (event.key === "Tab") { closePicker(); return; }
        if (event.key === "Escape") { event.preventDefault(); closePicker(); button.focus(); return; }
        if (event.key === "Enter") { event.preventDefault(); select(active); return; }
        if (["ArrowDown", "ArrowUp"].includes(event.key)) { event.preventDefault(); move(event.key); }
      });
      button.addEventListener("keydown", event => {
        if (event.key === "Tab") { closePicker(); return; }
        if (event.key === "Escape") { event.preventDefault(); closePicker(); return; }
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(event.key)) { event.preventDefault(); open(); return; }
        // Typing on the closed list starts a search with that letter.
        if (event.key.length === 1) { event.preventDefault(); open(event.key); }
      });
      field.append(head, button, panel);
      return field;
    }
    function selectors(focusIndex = null) {
      closePicker();
      $("compareSelectors").replaceChildren(...choices.map(spotPicker), ...(choices.length < MAX_SLOTS ? [spotPicker("", choices.length)] : []));
      if (focusIndex !== null) $(`compareSpotChoice${focusIndex}`)?.focus({ preventScroll: true });
    }
    document.addEventListener("pointerdown", event => {
      if (activePicker && !activePicker.button.contains(event.target) && !activePicker.panel.contains(event.target)) closePicker();
    });
    document.addEventListener("focusin", event => {
      if (activePicker && !activePicker.button.contains(event.target) && !activePicker.panel.contains(event.target)) closePicker();
    });
    // The window follows its list while the user types and right after it opens; otherwise scrolling closes it.
    const settling = () => typing() || performance.now() < settleUntil;
    document.addEventListener("scroll", event => {
      if (!activePicker || event.target === activePicker.panel || activePicker.panel.contains(event.target)) return;
      if (settling()) activePicker.place(); else closePicker();
    }, true);
    window.addEventListener("resize", () => { if (settling()) activePicker.place(); else closePicker(); });
    // A browser keyboard often shrinks only the visible part of the page (the visual viewport).
    window.visualViewport?.addEventListener("resize", () => { if (activePicker) activePicker.place(); });
    window.visualViewport?.addEventListener("scroll", () => { if (activePicker) activePicker.place(); });
    // Heat map ratings from the same rows: after "Pokaż najlepsze" the heat map needs no computing of its own.
    const ratings = new Map();
    const profileId = () => root.SurfSurfer?.current() || "intermediate";
    async function fetchSpot(id, force = false, fromCoast = false) {
      if (!cache.has(id)) {
        const spot = catalog.find(s => s.id === id);
        // "Pokaż najlepsze" reads the whole coast from one file; chosen spots read their own files.
        const task = (fromCoast ? root.SurfAPI.coastal(spot, force)
          : Promise.all([root.SurfAPI.forecasts(spot, force, { coastalOnly: true }), root.SurfAPI.nearshore(spot, force)]))
          .then(([forecast, simulation]) => {
            const now = Date.now(), rows = M.buildCoastalForecast(spot, forecast.weather, simulation, now, { historyHours: 24, profile: profileId() });
            if (root.SurfHeatmap) ratings.set(id, root.SurfHeatmap.record(rows, forecast, simulation, now));
            // Notes stay in the status line; the Polish reasons of errors are collapsed below it.
            const issues = [], reasons = [];
            if (!forecast.weather) { issues.push("Brak aktualnego wiatru."); reasons.push(...forecast.errors); }
            if (!rows.some(row => row.simulation)) issues.push(M.simulationAge(simulation) > 18
              ? "Ostatnie wyniki SWAN lub ich dane wejściowe mają ponad 18 godzin." : "Brak poprawnej, aktualnej prognozy fal przy brzegu.");
            if (simulation.refreshPending) issues.push("Podczas pobierania trwało lokalne przeliczanie fal SWAN.");
            if (simulation.refreshError) reasons.push(`Fale: ${root.SurfAPI.lowerFirst(simulation.refreshError)}`);
            if (simulation.refreshPending || simulation.refreshError) issues.push("Nowsze wyniki wczytasz przyciskiem „Pokaż najlepsze” lub „Porównaj wybrane”.");
            if (cache.get(id) === task) problems.set(id, { issue: issues.join(" "), reason: reasons.join(" ") });
            return rows;
          })
          .catch(error => {
            if (cache.get(id) === task) problems.set(id, { issue: "Nie udało się pobrać prognozy.", reason: root.SurfAPI.errorText(error) });
            if (root.SurfHeatmap) ratings.set(id, { scores: new Map(), disputed: new Set(), issue: root.SurfHeatmap.FAILED });
            return [];
          })
          .then(rows => {
            const key = M.coastalHistoryKey(spot, profileId());
            let savedRows;
            try { savedRows = JSON.parse(localStorage.getItem(key)); } catch { /* Storage optional. */ }
            const retained = retainHistory(rows, savedRows);
            // Only the fields needed to reconstruct session ratings, for the hours that can become history.
            try { localStorage.setItem(key, JSON.stringify(savedHistory(retained))); } catch { /* In-memory history still works. */ }
            return retained;
          });
        cache.set(id, task);
      }
      return cache.get(id);
    }
    async function load(force = false) {
      const token = ++generation, selection = [...ids];
      if (!selection.length) { resetComparison(); return; }
      if (force) selection.forEach(id => cache.delete(id));
      beginLoad("Pobieram prognozy wybranych spotów…");
      const all = await Promise.all(selection.map(id => fetchSpot(id, force)));
      if (token !== generation) return;
      finishLoad(all.map((rows, i) => ({ id: selection[i], rows })));
    }
    function beginLoad(message) {
      loading = true; data = []; orderByDay.clear(); dismissUndo();
      $("compareStorage").textContent = favoriteMode ? `Porównuję ulubione spoty: ${ids.length}…` : manual ? `Porównuję wybrane spoty: ${ids.length}…` : "Wyszukuję najlepsze spoty na wybrany dzień…";
      // The progress shows in the chart's place; the line under the lists stays for notes about missing data.
      $("compareStatus").textContent = ""; $("compareStatus").hidden = true; $("compareErrors").hidden = true;
      $("compareContent").setAttribute("aria-busy", "true");
      $("compareContent").dataset.mode = manual ? "manual" : "auto";
      closeHints();
      for (const id of ["compareLegend", "compareRanking", "compareHourlyTable"]) $(id).replaceChildren();
      $("compareRankingTitle").hidden = true; renderHidden();
      chartState("loading", message); updateActions();
      // Yesterday comes from the rolling 24-hour history; the tiles start collapsed at today + 4 days.
      const now = Date.now(), today = dayKey(now / 1000);
      days = calendarDays(now).map(key => {
        const t = Date.parse(`${key}T12:00:00Z`) / 1000;
        return { key, label: date(t, { weekday: "short", day: "numeric", month: "short" }),
          weekday: date(t, { weekday: "short" }), short: date(t, { day: "numeric", month: "short" }) };
      });
      if (!days.some(d => d.key === selectedDay)) selectedDay = today;
      // Pages start today; yesterday's history stays reachable by panning the chart.
      dayFirst = Math.max(0, days.findIndex(d => d.key === today));
      dayPages = Math.max(dayPages, Math.min(pageCount(), pageOf(selectedDay) + 1));
      dayPages = Math.min(dayPages, pageCount());
      const less = el("button", "Pokaż mniej", "filter compare-page-days page-less"); less.type = "button"; less.dataset.page = "previous";
      const more = el("button", undefined, "filter compare-page-days page-more"); more.type = "button"; more.dataset.page = "next";
      for (const button of [less, more]) button.setAttribute("aria-controls", "compareDays compareChart");
      less.addEventListener("click", () => showPages(dayPages - 1));
      more.addEventListener("click", () => showPages(dayPages + 1));
      $("compareDays").replaceChildren(...days.map(d => {
        const button = el("button", d.label, "filter"); button.type = "button";
        button.addEventListener("click", () => {
          if (selectedDay === d.key) return;
          if (!dayInView(d.key)) chartView = null;
          selectedDay = d.key; updateDaySelection();
          if (!loading) render();
        });
        button.dataset.day = d.key; return button;
      }), less, more);
      updateDaySelection();
    }
    function updateDaySelection() {
      $("compareContent").dataset.day = selectedDay;
      const page = new Set(days.slice(dayFirst, shownUntil()).map(d => d.key));
      $("compareDays").querySelectorAll("button[data-day]").forEach(b => {
        b.setAttribute("aria-pressed", String(b.dataset.day === selectedDay));
        b.hidden = !page.has(b.dataset.day) && b.dataset.day !== selectedDay;
      });
      const less = $("compareDays").querySelector('[data-page="previous"]'), more = $("compareDays").querySelector('[data-page="next"]');
      if (less && more) {
        const remaining = days.length - shownUntil();
        less.disabled = dayPages === 1;
        more.disabled = remaining <= 0;
        const next = Math.min(PAGE_DAYS, remaining);
        more.textContent = next <= 0 ? "Pokaż kolejne dni" : next === 1 ? "Pokaż kolejny dzień" : `Pokaż kolejne ${next} dni`;
        less.hidden = more.hidden = pageCount() < 2;
      }
      $("compareRankingTitle").textContent = `Gdzie warto jechać · ${days.find(d => d.key === selectedDay).label}`;
    }
    function finishLoad(entries) {
      const now = Date.now();
      snapshotTime = now;
      data = entries.map(({ id, rows }) => ({ id, spot: catalog.find(s => s.id === id), hours: chartHours(rows, now), days: daily(rows, M, now) }));
      loadedEntries = entries;
      loading = false;
      $("compareContent").setAttribute("aria-busy", "false");
      $("compareRankingTitle").hidden = false;
      render();
      updateActions();
    }
    function render() {
      const selectedLabel = days.find(d => d.key === selectedDay).label;
      if (!manual) {
        // Reuse tie choices when returning to a date; changing days needs no new requests.
        if (!orderByDay.has(selectedDay)) orderByDay.set(selectedDay, rankSpots(data, selectedDay));
        const order = orderByDay.get(selectedDay), hiddenToday = hiddenOn(selectedDay);
        ids = topSpots(order, [...hiddenToday]);
        // A hidden spot leaves its colour unused, so the others keep theirs.
        choices = [...ids]; palette = new Map(order.slice(0, DEFAULT_SLOTS).map((id, i) => [id, i]));
        selectors(); updateActions();
        const skipped = hiddenToday.size ? ` Ukryte w tym dniu: ${hiddenToday.size}.` : "";
        $("compareStorage").textContent = ids.length
          ? `Najlepsze spoty na ${selectedLabel}. Zmiana dnia dobiera piątkę z całego katalogu.${skipped} Możesz też zmienić listy i kliknąć „Porównaj wybrane”.`
          : order.length ? `Najlepsze spoty na ${selectedLabel} są ukryte. Przywróć je pod kafelkami albo wybierz inny dzień.`
          : `Brak aktualnych ocen na ${selectedLabel}. Wybierz inny dzień lub wskaż własne spoty do porównania.`;
      } else {
        const favorites = SurfFavorites.list().length;
        $("compareStorage").textContent = (favoriteMode ? `Porównanie ulubionych spotów: ${ids.length}${favorites > MAX_SLOTS ? ` (pierwsze ${MAX_SLOTS} z ${favorites})` : ""}.`
          : `Porównanie wskazanych spotów: ${ids.length}.`) + ` Zmiana dnia pokazuje te same spoty. „Pokaż najlepsze” wybierze najlepsze miejsca z całego katalogu.`;
      }
      const selected = ids.map(id => {
        const slot = choices.indexOf(id), colour = palette.get(id) ?? slot;
        return { ...data.find(d => d.id === id), slot, color: colors[colour], linePattern: linePatterns[colour] };
      });
      const shown = (selected.length ? selected : data).map(d => problems.get(d.id)).filter(Boolean);
      const issues = [...new Set(shown.map(p => p.issue).filter(Boolean))], reasons = [...new Set(shown.map(p => p.reason).filter(Boolean))];
      $("compareErrorText").textContent = reasons.join(" ");
      $("compareErrors").hidden = !reasons.length;
      // Since 20.11.2026 no line with the day's counts (the user's request): only a note about missing data, when there is one.
      $("compareStatus").textContent = issues.join(" "); $("compareStatus").hidden = !issues.length;
      chart(selected, days); ranking(selected); hourlyTable(selected);
    }
    // Zoomed time window; null shows the whole extent. Reset when the compared spots change.
    let chartArgs = null, chartView = null, chartKey = "", chartFrame = 0, measureContext = null;
    function chart(data, days) {
      const ns = "http://www.w3.org/2000/svg";
      const create = (tag, attrs, text) => {
        const item = document.createElementNS(ns, tag);
        Object.entries(attrs).forEach(([k, v]) => item.setAttribute(k, v));
        if (text !== undefined) item.textContent = text;
        return item;
      };
      // Each spot links to its hourly forecast from 00:00 of the day chosen below the chart.
      const from = dayStart(selectedDay), dayLabel = days.find(d => d.key === selectedDay)?.label;
      closeHints();
      $("compareLegend").replaceChildren(...data.map(series => {
        const item = el("span", undefined, "compare-legend-item");
        item.setAttribute("role", "listitem"); item.dataset.spot = series.id;
        item.title = `Spot ${series.slot + 1}: linia ${series.linePattern.name}`;
        const sample = create("svg", { viewBox: "0 0 76 14", "aria-hidden": "true" });
        sample.append(create("line", { x1: 2, x2: 74, y1: 7, y2: 7, ...chartLine(series) }),
          ...[10, 38, 66].map(cx => create("circle", { cx, cy: 7, ...chartDot(series, 3.4) })));
        const name = `${series.slot + 1}. ${label(series.spot)}`;
        const link = forecastLink(el("a", undefined, "compare-legend-link"), series.id, { time: from });
        link.setAttribute("aria-label", `${name} — prognoza godzinowa od 00:00, ${dayLabel}`);
        link.append(sample, el("span", name));
        item.append(link);
        return item;
      }));
      const extent = chartExtent(data);
      $("compareZoom").hidden = !extent;
      if (!extent) {
        chartArgs = null;
        chartState("empty", "Brak ocen dla wybranych spotów. Wybierz inne miejsca lub odśwież prognozy.");
        return;
      }
      const key = `${data.map(series => series.id).join(",")}|${extent.from}|${extent.until}`;
      if (key !== chartKey) { chartKey = key; chartView = null; }
      // Group the hours by Warsaw date once per comparison; every redraw reuses it.
      const hoursByDay = new Map();
      for (let time = extent.from; time <= extent.until; time += 3600) {
        const day = dayKey(time);
        if (!hoursByDay.has(day)) hoursByDay.set(day, []);
        hoursByDay.get(day).push(time);
      }
      chartArgs = { data, days, extent, hoursByDay };
      drawChart();
    }
    // Hourly dots carry the values; a thin translucent line in the spot's pattern links them.
    const chartLine = series => ({ fill: "none", stroke: series.color, "stroke-width": 1.5, "stroke-opacity": .45,
      "stroke-dasharray": series.linePattern.dash, "stroke-linecap": "round", "stroke-linejoin": "round" });
    const chartDot = (series, r) => ({ r, fill: series.color, stroke: "white", "stroke-width": r > 4 ? 1 : .6 });
    function chartGeometry() {
      const box = $("compareChart"), width = Math.max(300, Math.round(box.clientWidth || 900));
      const phone = width < 600, height = phone ? 360 : 460;
      // One SVG unit equals one CSS pixel, so text keeps its real size on every screen.
      return { width, height, phone, left: phone ? 30 : 40, right: width - (phone ? 10 : 16), top: 34, bottom: height - (phone ? 70 : 76) };
    }
    function drawChart() {
      chartFrame = 0;
      if (!chartArgs) return;
      const { data, days, extent, hoursByDay } = chartArgs, ns = "http://www.w3.org/2000/svg";
      // A single text size for every label in the chart, matching the controls around it.
      const g = chartGeometry(), { left, right, top, bottom } = g, font = g.phone ? 13 : 14;
      const view = currentView(), span = Math.max(3600, view.until - view.from);
      const current = Math.floor(snapshotTime / 3600000) * 3600;
      const x = time => extent.from === extent.until ? (left + right) / 2 : left + (time - view.from) * (right - left) / span;
      const y = score => bottom - score * (bottom - top) / 10;
      const perDay = 86400 * (right - left) / span;
      // Dot size follows the screen space per hour: small when hours are dense, larger as you zoom in.
      const radius = Math.min(6, Math.max(2.2, .45 * perDay / 24));
      const create = (tag, attrs, text) => {
        const item = document.createElementNS(ns, tag);
        Object.entries(attrs).forEach(([k, v]) => item.setAttribute(k, v));
        if (text !== undefined) item.textContent = text;
        return item;
      };
      const svg = create("svg", { viewBox: `0 0 ${g.width} ${g.height}`, width: g.width, height: g.height, role: "img" });
      const stamp = time => date(time, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZoneName: "short" });
      svg.setAttribute("aria-label", `Godzinowe oceny 0–10 dla ${data.length} spotów, widoczne od ${stamp(view.from)} do ${stamp(view.until)}. Spoty rozróżnia kolor i wzór linii pokazany w legendzie. Zacienione tło oznacza historię modelową, pionowa linia — Teraz, czarne przerywane linie — granice wybranego dnia. Przerwy oznaczają brak danych. Wykres można przybliżać dwoma palcami, kółkiem myszy z Ctrl albo dwuklikiem.`);
      svg.dataset.from = extent.from; svg.dataset.until = extent.until;
      svg.dataset.viewFrom = view.from; svg.dataset.viewUntil = view.until;
      const add = (tag, attrs, text, parent = svg) => { const item = create(tag, attrs, text); parent.append(item); return item; };
      const clip = add("clipPath", { id: "compareClip" });
      add("rect", { x: left, y: top - 8, width: right - left, height: bottom - top + 16 }, undefined, clip);
      const dayClip = add("clipPath", { id: "compareDayClip" });
      add("rect", { x: left, y: bottom, width: right - left, height: g.height - bottom }, undefined, dayClip);
      // Series go on top of the score bands, grid and labels; appended last.
      const plot = create("g", { "clip-path": "url(#compareClip)" });
      [[0, 3, "#fee2e2"], [3, 5, "#fff0dc"], [5, 6.5, "#fff6d5"], [6.5, 10, "#dcf3df"]].forEach(([lo, hi, fill]) =>
        add("rect", { x: left, y: y(hi), width: right - left, height: y(lo) - y(hi), fill, opacity: .65, class: "compare-score-band" }));
      for (let score = 0; score <= 10; score += 2) {
        add("line", { x1: left, x2: right, y1: y(score), y2: y(score), stroke: "#66756d", "stroke-opacity": .15 });
        add("text", { x: left - 8, y: y(score) + 5, "text-anchor": "end", "font-size": font, fill: "#45534d" }, score);
      }
      if (view.from < current) {
        const historyRight = Math.min(right, x(current));
        add("rect", { x: left, y: top, width: Math.max(0, historyRight - left), height: bottom - top, fill: "#64748b", opacity: .16, "data-history": "true" });
        if (historyRight - left >= 80) add("text", { x: left + 4, y: top - 12, "font-size": font, fill: "#45534d" }, "Historia");
      }
      if (current >= view.from && current <= view.until) {
        const nowX = x(current), anchor = nowX < left + 35 ? "start" : nowX > right - 35 ? "end" : "middle";
        add("line", { x1: nowX, x2: nowX, y1: top - 6, y2: bottom, stroke: "#334155", "stroke-dasharray": "4 4", "data-now": current });
        add("text", { x: nowX, y: top - 12, "text-anchor": anchor, "font-size": font, fill: "#334155" }, "Teraz");
      }
      // Hour marks appear once a day is wide enough to read them.
      const hourStep = perDay >= 420 ? 3 : perDay >= 150 ? 6 : 0;
      const firstHour = Math.ceil(view.from / 3600) * 3600, rowHour = bottom + 18, rowDay = bottom + (hourStep ? 38 : 22), rowDate = rowDay + 17;
      if (hourStep) for (let t = firstHour; t <= view.until; t += 3600) {
        const h = Number(date(t, { hour: "2-digit", hourCycle: "h23" }));
        if (h % hourStep || !h) continue;
        add("line", { x1: x(t), x2: x(t), y1: top, y2: bottom, stroke: "#66756d", "stroke-opacity": .08 });
        add("text", { x: x(t), y: rowHour, "text-anchor": "middle", "font-size": font, fill: "#66756d" }, `${String(h).padStart(2, "0")}:00`);
      }
      // Each day keeps its own column; when columns get narrow the labels shorten instead of overlapping.
      const every = perDay >= 34 ? 1 : Math.ceil(34 / Math.max(1, perDay));
      // Label widths are measured in the chart's own font.
      const family = getComputedStyle($("compareChart")).fontFamily;
      const labelWidth = (text, bold) => {
        measureContext ||= document.createElement("canvas").getContext("2d");
        if (!measureContext) return text.length * font * .62;
        measureContext.font = `${bold["font-weight"] || 400} ${font}px ${family}`;
        return measureContext.measureText(text).width;
      };
      // Day labels stay centred on their whole day and move with the chart; at the edges they slide out under the clip.
      const dayLabels = add("g", { "clip-path": "url(#compareDayClip)" });
      days.forEach((d, i) => {
        const times = hoursByDay.get(d.key);
        if (!times) return;
        const start = x(times[0]), end = x(Math.min(extent.until, times.at(-1) + 3600));
        if (end <= left || start >= right) return;
        const dayLeft = Math.max(left, start), dayRight = Math.min(right, end);
        if (d.key === selectedDay) add("rect", { x: dayLeft, y: bottom, width: dayRight - dayLeft, height: 4, fill: "#45534d" });
        if (start > left) add("line", { x1: start, x2: start, y1: top, y2: g.height - 4, stroke: "#66756d", "stroke-opacity": .2 });
        if (i % every) return;
        const bold = d.key === selectedDay ? { "font-weight": 700 } : {};
        const center = (start + end) / 2;
        // A day cut short by the edge of the data keeps the full label only if it fits; never a lone day number.
        if (Math.max(labelWidth(d.weekday, bold), labelWidth(d.short, bold)) + 6 <= end - start) {
          add("text", { x: center, y: rowDay, "text-anchor": "middle", "font-size": font, fill: "#45534d", ...bold }, d.weekday, dayLabels).append(create("title", {}, d.label));
          add("text", { x: center, y: rowDate, "text-anchor": "middle", "font-size": font, fill: "#45534d", ...bold }, d.short, dayLabels);
        } else if (every > 1) {
          add("text", { x: center, y: rowDay, "text-anchor": "middle", "font-size": font, fill: "#45534d", ...bold },
            date(Date.parse(`${d.key}T12:00:00Z`) / 1000, { day: "numeric" }), dayLabels).append(create("title", {}, d.label));
        }
      });
      // Black dashed lines frame the selected day so it stands out on the chart.
      const chosen = hoursByDay.get(selectedDay);
      if (chosen) for (const edge of dayEdges(chosen, extent)) if (x(edge) >= left && x(edge) <= right)
        add("line", { x1: x(edge), x2: x(edge), y1: top, y2: g.height - 4, stroke: "#000", "stroke-width": 1.5, "stroke-dasharray": "6 4", "data-day-edge": edge });
      const near = row => row.time >= view.from - 3600 && row.time <= view.until + 3600;
      data.forEach(series => chartSegments(series.hours.filter(near)).forEach(segment => {
        // One path per continuous run keeps the dash pattern flowing across hours.
        if (segment.length < 2) return;
        const line = add("path", { d: segment.map((row, i) => `${i ? "L" : "M"}${x(row.time).toFixed(1)} ${y(row.score).toFixed(1)}`).join(" "),
          ...chartLine(series), class: "compare-series-line", "data-spot": series.id, "data-from": segment[0].time, "data-until": segment.at(-1).time }, undefined, plot);
        line.append(create("title", {}, `${label(series.spot)} · linia ${series.linePattern.name}`));
      }));
      data.forEach(series => series.hours.filter(row => Number.isFinite(row.score) && near(row)).forEach(row => {
        const dot = add("circle", { cx: x(row.time).toFixed(1), cy: y(row.score).toFixed(1), ...chartDot(series, radius), class: "compare-series-dot",
          "data-spot": series.id, "data-time": row.time, "data-score": row.score, "data-history": row.historical }, undefined, plot);
        dot.append(create("title", {}, `${label(series.spot)}: ${row.score}/10 · ${stamp(row.time)}${row.historical ? " · historia modelowa" : ""}`));
      }));
      svg.append(plot);
      $("compareChart").replaceChildren(svg);
      $("compareChart").dataset.state = "ready";
    }
    const redrawChart = () => { if (!chartFrame) chartFrame = requestAnimationFrame(drawChart); };
    // The chart always uses a five-day scale, so labels and dots look the same however many day tiles are shown.
    // Without a manual zoom it shows the block of five days (from today) that contains the selected day.
    const CHART_SPAN = PAGE_DAYS * 86400;
    function currentView() {
      if (chartView) return chartView;
      const { extent, hoursByDay } = chartArgs;
      const block = Math.max(0, pageOf(selectedDay));
      const start = hoursByDay.get(days[dayFirst + block * PAGE_DAYS]?.key)?.[0] ?? hoursByDay.get(days[dayFirst]?.key)?.[0];
      return Number.isFinite(start) ? clampView(extent, start, start + CHART_SPAN, CHART_SPAN) : clampView(extent, extent.from, extent.until, CHART_SPAN);
    }
    const dayInView = key => {
      const hours = chartArgs?.hoursByDay.get(key), view = chartArgs && currentView();
      return Boolean(hours && view && hours[0] < view.until && hours.at(-1) >= view.from);
    };
    function setChartView(view) {
      if (!chartArgs) return;
      const { extent } = chartArgs;
      chartView = view ? clampView(extent, view.from, view.until, CHART_SPAN) : null;
      redrawChart();
    }
    function zoomChart(factor, clientX = null) {
      if (!chartArgs) return;
      const g = chartGeometry(), view = currentView(), rect = $("compareChart").getBoundingClientRect();
      const ratio = clientX === null ? .5 : Math.min(1, Math.max(0, (clientX - rect.left - g.left) / (g.right - g.left)));
      const anchor = view.from + ratio * (view.until - view.from), span = (view.until - view.from) / factor;
      setChartView({ from: anchor - ratio * span, until: anchor - ratio * span + span });
    }
    // Two fingers zoom around their midpoint; one finger or the mouse pans sideways. Vertical page scrolling stays native.
    const pointers = new Map();
    let gesture = null;
    function startGesture() {
      if (!chartArgs) return;
      const g = chartGeometry(), rect = $("compareChart").getBoundingClientRect(), view = currentView();
      const points = [...pointers.values()], midX = points.reduce((sum, p) => sum + p.x, 0) / points.length;
      const ratio = (midX - rect.left - g.left) / (g.right - g.left);
      gesture = { view, rect, g, ratio, anchor: view.from + ratio * (view.until - view.from),
        distance: points.length > 1 ? Math.max(20, Math.abs(points[0].x - points[1].x)) : null };
    }
    $("compareChart").addEventListener("pointerdown", event => {
      if (!chartArgs || (event.pointerType === "mouse" && event.button !== 0)) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      $("compareChart").setPointerCapture?.(event.pointerId);
      startGesture();
    });
    $("compareChart").addEventListener("pointermove", event => {
      if (!pointers.has(event.pointerId) || !gesture) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const points = [...pointers.values()], { g, rect, view } = gesture, width = g.right - g.left;
      const midX = points.reduce((sum, p) => sum + p.x, 0) / points.length;
      const ratio = (midX - rect.left - g.left) / width, oldSpan = view.until - view.from;
      if (points.length > 1 && gesture.distance) {
        const span = oldSpan * gesture.distance / Math.max(20, Math.abs(points[0].x - points[1].x));
        setChartView({ from: gesture.anchor - ratio * span, until: gesture.anchor - ratio * span + span });
      } else if (oldSpan < chartArgs.extent.until - chartArgs.extent.from - 1) {
        const shift = (ratio - gesture.ratio) * oldSpan;
        setChartView({ from: view.from - shift, until: view.until - shift });
      }
    });
    const endPointer = event => {
      if (!pointers.delete(event.pointerId)) return;
      if (pointers.size) startGesture(); else gesture = null;
    };
    ["pointerup", "pointercancel", "lostpointercapture"].forEach(type => $("compareChart").addEventListener(type, endPointer));
    $("compareChart").addEventListener("wheel", event => {
      if (!chartArgs) return;
      if (event.ctrlKey || event.metaKey) { event.preventDefault(); zoomChart(Math.exp(-event.deltaY / 300), event.clientX); }
      else if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) {
        const view = currentView();
        if (view.until - view.from >= chartArgs.extent.until - chartArgs.extent.from - 1) return;
        event.preventDefault();
        const g = chartGeometry(), shift = event.deltaX / (g.right - g.left) * (view.until - view.from);
        setChartView({ from: view.from + shift, until: view.until + shift });
      }
    }, { passive: false });
    $("compareChart").addEventListener("dblclick", event => zoomChart(2, event.clientX));
    if (typeof ResizeObserver !== "undefined") {
      let lastWidth = 0;
      new ResizeObserver(entries => {
        const width = Math.round(entries[0].contentRect.width);
        if (width && width !== lastWidth) { lastWidth = width; redrawChart(); }
      }).observe($("compareChart"));
    }
    function forecastLink(link, spotId, params) {
      link.href = `#surf/${spotId}?${new URLSearchParams(params)}`;
      link.addEventListener("click", event => {
        if (!event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && location.hash === link.hash) {
          event.preventDefault(); window.dispatchEvent(new Event("hashchange"));
        }
      });
      return link;
    }
    // Each "i" explains the links next to it: the legend's and the ranking tiles'. A hint opens on a tap
    // and closes on another tap of its "i", a tap anywhere else or Escape; only one is open at a time.
    function infoHints() {
      return [["compareLegendInfo", "compareLegendHint"], ["compareRankingInfo", "compareRankingHint"]]
        .map(([button, hint]) => ({ button: $(button), hint: $(hint) }));
    }
    function showHint({ button, hint }, open) {
      if (!open && hint.hidden) return;
      button.setAttribute("aria-expanded", String(open)); hint.hidden = !open;
      if (!open) return;
      // Below the "i" and within its box; the arrow points at the "i" and stays clear of the rounded corners.
      const box = button.parentElement.getBoundingClientRect(), mark = button.getBoundingClientRect();
      const centre = mark.left + mark.width / 2 - box.left, width = hint.offsetWidth;
      const left = Math.max(0, Math.min(box.width - width, centre - width / 2));
      hint.style.left = `${left}px`; hint.style.top = `${mark.bottom - box.top + 10}px`;
      hint.style.setProperty("--arrow", `${Math.max(14, Math.min(width - 14, centre - left))}px`);
    }
    function closeHints(except = null) {
      for (const info of infoHints()) if (info.button !== except) showHint(info, false);
    }
    for (const info of infoHints()) info.button.addEventListener("click", () => { closeHints(info.button); showHint(info, info.hint.hidden); });
    document.addEventListener("pointerdown", event => closeHints(infoHints().find(info => info.button.contains(event.target))?.button), true);
    document.addEventListener("keydown", event => {
      const open = infoHints().find(info => !info.hint.hidden);
      if (event.key !== "Escape" || !open) return;
      showHint(open, false); open.button.focus();
    });
    window.addEventListener("resize", () => { for (const info of infoHints()) if (!info.hint.hidden) showHint(info, true); });
    function hourlyTable(data) {
      const box = $("compareHourlyTable");
      box.replaceChildren();
      if (!data.length) return;
      const times = [...new Set(data.flatMap(series => series.hours.filter(row => dayKey(row.time) === selectedDay && Number.isFinite(row.score)).map(row => row.time)))].sort((a, b) => a - b);
      if (!times.length) return;
      const table = el("table", undefined, "compare-hourly-table");
      table.append(el("caption", `Oceny godzinowe z wykresu · ${days.find(d => d.key === selectedDay).label}`));
      const head = el("thead"), header = el("tr");
      const hourHeading = el("th", "Godzina"); hourHeading.scope = "col"; header.append(hourHeading);
      for (const series of data) {
        const cell = el("th"); cell.scope = "col";
        cell.style.color = series.color; cell.dataset.spot = series.id;
        cell.append(forecastLink(el("a", label(series.spot)), series.id, { day: selectedDay }));
        header.append(cell);
      }
      head.append(header); table.append(head);
      const body = el("tbody");
      for (const time of times) {
        const tr = el("tr"), historical = time < Math.floor(snapshotTime / 3600000) * 3600;
        tr.dataset.time = time; tr.dataset.history = historical;
        const title = el("th", `${hour(time)}${historical ? " · historia" : ""}`);
        title.scope = "row"; tr.append(title);
        for (const series of data) {
          const score = series.hours.find(row => row.time === time)?.score;
          const cell = el("td", Number.isFinite(score) ? `${score.toLocaleString("pl-PL", { minimumFractionDigits: 1 })}/10` : "—");
          cell.dataset.spot = series.id;
          if (Number.isFinite(score)) { cell.dataset.score = score; cell.dataset.quality = tone(score); }
          tr.append(cell);
        }
        body.append(tr);
      }
      table.append(body); box.append(table);
    }
    // Each spot's tile has × in its top right corner, like its list.
    function tile(card, spot) {
      const box = el("div", undefined, "compare-tile");
      box.dataset.spot = spot.id;
      // The × takes the ink of the tile's rating.
      if (card.dataset.quality) box.dataset.quality = card.dataset.quality;
      // The heart of the cameras' tiles.
      box.append(card, heartButton(spot, "icon-button compare-favorite"), removeButton(spot));
      return box;
    }
    // A heart changed here or beside a forecast: every heart, and the number on "Porównaj ulubione", follow it.
    window.addEventListener("surf:favorites", () => {
      document.querySelectorAll("#compareRanking .compare-favorite, #compareSelectors .compare-list-favorite")
        .forEach(button => SurfFavorites.sync(button, catalog.find(s => s.id === button.dataset.spot)));
      updateActions();
    });
    const tileButton = id => [...$("compareRanking").querySelectorAll(".compare-tile")].find(box => box.dataset.spot === id)?.querySelector(".compare-hide");
    // × on a tile or a list (since 20.11.2026). With "Pokaż najlepsze" it hides the spot on the chosen day only, until
    // the page is loaded again: nothing takes its place, and other days keep their own five best. In the user's own
    // lists ("Porównaj wybrane", "Porównaj ulubione") it takes the spot out. "Cofnij" undoes either for a while.
    function removeSpot(id, from) {
      if (loading) return;
      const spot = catalog.find(s => s.id === id), shown = data.length > 0, day = selectedDay;
      const box = from.closest("#compareRanking") ? $("compareRanking") : $("compareSelectors");
      const place = [...box.querySelectorAll(".compare-hide")].indexOf(from);
      if (shown && !manual) {
        hiddenByDay.set(day, new Set([...hiddenOn(day), id]));
        render();
        offerUndo(`Ukryto na ${days.find(d => d.key === day)?.label}: ${label(spot)}`, () => restoreSpots([id], day), id);
      } else {
        const before = { choices: [...choices], ids: [...ids], palette: new Map(palette), favorites: favoriteMode, shown };
        choices = choices.filter(other => other !== id); palette = assignColors(palette, choices); favoriteMode = false;
        if (shown && choices.length) {
          ids = ids.filter(other => other !== id);
          selectors(); updateActions(); render();
        } else { selectors(); resetComparison(); }
        const token = generation;
        offerUndo(`Usunięto: ${label(spot)}`, () => {
          // Only the same comparison: a new one or another choice of spots ends the offer.
          if (loading || token !== generation) return;
          choices = before.choices; ids = before.ids; palette = before.palette; favoriteMode = before.favorites;
          selectors(); updateActions();
          if (!before.shown) resetComparison(); else if (data.length) render(); else load();
        }, id);
      }
      // The keyboard goes on to the × now in the same place, or to the list that adds a spot.
      const buttons = [...box.querySelectorAll(".compare-hide")];
      (buttons[place] || buttons.at(-1) || $(`compareSpotChoice${choices.length}`))?.focus({ preventScroll: true });
    }
    function restoreSpots(list, day = selectedDay) {
      const fromList = $("compareHidden").contains(document.activeElement);
      const left = [...hiddenOn(day)].filter(id => !list.includes(id));
      if (left.length) hiddenByDay.set(day, new Set(left)); else hiddenByDay.delete(day);
      if (!loading && data.length) render(); else renderHidden();
      if (fromList) $("compareHidden").querySelector("summary")?.focus({ preventScroll: true });
    }
    // Under the tiles of "Pokaż najlepsze": the spots hidden on the chosen day, each with "Przywróć".
    let hiddenOpen = false;
    function renderHidden() {
      const box = $("compareHidden"), today = hiddenOn(selectedDay), spots = sortedSpots.filter(spot => today.has(spot.id));
      // Once every spot is back, the next list starts folded again.
      if (!spots.length) hiddenOpen = false;
      box.hidden = loading || manual || !data.length || !spots.length;
      if (box.hidden) { box.replaceChildren(); return; }
      const details = el("details"), list = el("ul");
      details.open = hiddenOpen;
      details.addEventListener("toggle", () => { hiddenOpen = details.open; });
      list.append(...spots.map(spot => {
        const item = el("li"), restore = el("button", "Przywróć", "filter");
        restore.type = "button"; restore.setAttribute("aria-label", `Przywróć: ${label(spot)}`);
        restore.addEventListener("click", () => restoreSpots([spot.id]));
        item.append(el("span", label(spot)), restore);
        return item;
      }));
      details.append(el("summary", `Ukryte spoty: ${spots.length}`),
        el("p", `„Pokaż najlepsze” pomija je tylko w dniu ${days.find(d => d.key === selectedDay)?.label}. Po odświeżeniu strony wszystkie spoty wracają.`, "surf-small"), list);
      if (spots.length > 1) {
        const all = el("button", "Przywróć wszystkie", "filter"); all.type = "button";
        all.addEventListener("click", () => restoreSpots(spots.map(spot => spot.id)));
        details.append(all);
      }
      box.replaceChildren(details);
    }
    let undoTimer = 0, undoAction = null, undoSpot = "";
    function offerUndo(message, action, id) {
      clearTimeout(undoTimer); undoAction = action; undoSpot = id;
      $("compareUndo").hidden = false; $("compareUndoText").textContent = message;
      undoTimer = setTimeout(expireUndo, 8000);
    }
    // The offer waits while the keyboard is on "Cofnij".
    function expireUndo() {
      if ($("compareUndo").contains(document.activeElement)) undoTimer = setTimeout(expireUndo, 2000); else dismissUndo();
    }
    function dismissUndo() {
      clearTimeout(undoTimer); undoAction = null;
      $("compareUndo").hidden = true;
    }
    $("compareUndoButton").addEventListener("click", () => {
      const action = undoAction, id = undoSpot, focused = $("compareUndo").contains(document.activeElement);
      dismissUndo(); action?.();
      if (focused) tileButton(id)?.focus({ preventScroll: true });
    });
    // One tile per compared spot on the selected day: its best window, leaving out those that have already ended.
    function ranking(selected) {
      updateDaySelection();
      const compared = selected.map(series => series.id);
      const now = Date.now(), bestTimes = topWindows(loadedEntries.filter(entry => compared.includes(entry.id)), M, now, { day: selectedDay });
      const past = selectedDay < dayKey(now / 1000);
      // With "Pokaż najlepsze" every spot rated on the day can be hidden.
      const allHidden = !manual && !compared.length && Boolean(orderByDay.get(selectedDay)?.length);
      const colorOf = new Map(selected.map(series => [series.id, series.color]));
      $("compareRanking").replaceChildren(...bestTimes.map((w, i) => {
        const spot = catalog.find(s => s.id === w.id), day = dayKey(w.start);
        const card = forecastLink(el("a", undefined, "surf-window compare-card"), spot.id, { day, start: w.start });
        card.dataset.quality = tone(w.score);
        const name = el("span", `${i + 1}. ${label(spot)}`, "compare-spot-link");
        if (colorOf.has(spot.id)) name.style.setProperty("--spot-color", colorOf.get(spot.id));
        const metres = value => Number.isFinite(value) ? value.toLocaleString("pl-PL", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : null;
        const low = metres(w.minHeight ?? w.height), high = metres(w.maxHeight ?? w.height);
        const waves = low && high ? `Fale przy spocie ~${low === high ? low : `${low}–${high}`} m · ` : "";
        card.append(name,
          el("strong", `${w.score.toLocaleString("pl-PL", { minimumFractionDigits: 1 })}/10`),
          el("span", `${date(w.start, { weekday: "short", day: "numeric", month: "short" })} · ${hour(w.start)}–${hour(w.end)} · ${M.scoreLabel(w.score)}`),
          el("small", `${waves}pewność: ${w.confidence}`),
          el("small", "Zobacz szczegółową prognozę →"));
        return tile(card, spot);
      }));
      if (!bestTimes.length) {
        // The message sits in a tile like the forecasts, so it is not overlooked.
        const empty = el("div", undefined, "surf-window compare-card compare-empty-card");
        empty.setAttribute("role", "status");
        empty.append(el("strong", past ? "Dzień minął" : allHidden ? "Wszystkie spoty są ukryte" : "Wybierz kolejny dzień"), el("small", past
          ? "Ten dzień już minął — wybierz dzisiejszy lub kolejny dzień, aby zobaczyć propozycje."
          : allHidden ? "Wszystkie spoty z oceną w tym dniu są ukryte. Przywróć je poniżej albo wybierz inny dzień."
          : selectedDay === dayKey(now / 1000) ? "Na dziś nie ma już przyszłych trzygodzinnych okien z oceną do surfowania w dzień."
          : "Brak trzygodzinnych okien dziennych z oceną w tym dniu. Wybierz inny dzień lub inne spoty."));
        $("compareRanking").append(empty);
      } else {
        // A spot without a window still gets its tile, so it never looks ignored; like the tile shown when
        // no spot has a window, it points to the next day.
        const today = selectedDay === dayKey(now / 1000);
        $("compareRanking").append(...compared.filter(id => !bestTimes.some(w => w.id === id)).map(id => {
          const spot = catalog.find(s => s.id === id), card = el("div", undefined, "surf-window compare-card compare-empty-card");
          card.setAttribute("role", "status");
          card.append(el("span", label(spot)), el("strong", "Wybierz kolejny dzień"),
            el("small", today ? "Na dziś ten spot nie ma już przyszłego trzygodzinnego okna dziennego z oceną."
              : "Ten spot nie ma w tym dniu trzygodzinnego okna dziennego z oceną."));
          return tile(card, spot);
        }));
      }
      renderHidden();
    }
    async function selectBest(force = false) {
      const token = ++autoGeneration;
      ++generation;
      manual = false; favoriteMode = false;
      beginLoad("Sprawdzam prognozy wszystkich spotów…");
      let next = 0, completed = 0;
      const entries = [], snapshot = Date.now();
      // Only published files, no requests to the weather provider: the whole coast in parts, west to east, so the spots
      // go in the same order and each waits only for its part.
      root.SurfAPI.coast(force);
      const westToEast = [...catalog].sort((a, b) => a.lon - b.lon || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
      await Promise.all(Array.from({ length: 4 }, async () => {
        while (next < westToEast.length && token === autoGeneration) {
          const spot = westToEast[next++];
          if (force) cache.delete(spot.id);
          const rows = await fetchSpot(spot.id, force, true);
          entries.push({ id: spot.id, rows }); completed++;
          if (token === autoGeneration) {
            const message = `Sprawdzam prognozy dla dziennego rankingu: ${completed}/${catalog.length} spotów…`;
            if ($("compareLoadingDetail")) $("compareLoadingDetail").textContent = message;
          }
        }
      }));
      if (token !== autoGeneration) return;
      // The heat map reuses these ratings for 15 minutes instead of computing them again.
      if (root.SurfHeatmap && catalog.every(spot => ratings.has(spot.id)))
        root.SurfHeatmap.remember(new Map(catalog.map(spot => [spot.id, ratings.get(spot.id)])), snapshot, M, profileId());
      finishLoad(entries);
    }
    selectors(); resetComparison();
    $("compareBest").addEventListener("click", () => selectBest(true));
    // Another surfer profile: rate the same forecasts again, the shown comparison included.
    window.addEventListener("surfer-profile", () => {
      cache.clear(); ratings.clear();
      if (!loading && !data.length) return;
      if (manual) load(); else selectBest();
    });
    $("compareRefresh").addEventListener("click", () => {
      ++autoGeneration; manual = true; favoriteMode = false; ids = [...choices]; load(true);
    });
    // "Porównaj ulubione": the spots with a heart, in the order they got it, at most fifteen. They are the user's own,
    // so × only takes one out of this comparison; the heart takes it out of the favourites, and the empty list adds one.
    $("compareFavorites").addEventListener("click", () => {
      const favorites = choose(catalog, SurfFavorites.list());
      if (loading || !favorites.length) return;
      ++autoGeneration; manual = true; favoriteMode = true;
      choices = [...favorites]; palette = assignColors(new Map(), choices);
      dismissUndo(); selectors(); ids = [...choices]; load(true);
    });
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
