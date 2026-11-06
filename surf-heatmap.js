/* Hourly coastal ratings, ordered west to east. No interpolation or synthetic scores. */
(function (root) {
  "use strict";
  const zone = "Europe/Warsaw";
  const dayFormat = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" });
  const clockFormat = new Intl.DateTimeFormat("pl-PL", { timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const zoneFormat = new Intl.DateTimeFormat("pl-PL", { timeZone: zone, timeZoneName: "short" });
  const dayKey = time => dayFormat.format(new Date(time * 1000));
  const clock = time => clockFormat.format(new Date(time * 1000));
  const validScore = score => Number.isFinite(score) && score >= 0 && score <= 10;
  const tone = score => !validScore(score) ? "unknown" : score >= 9 ? "excellent" : score >= 8 ? "great"
    : score >= 6.5 ? "good" : score >= 5 ? "fair" : score >= 3 ? "weak" : score >= 1.5 ? "poor" : "bad";
  const orderedSpots = spots => [...spots].sort((a, b) => a.lon - b.lon || a.id.localeCompare(b.id));
  function hoursForDay(day) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return [];
    const midnight = Date.parse(`${day}T00:00:00Z`) / 1000;
    if (!Number.isFinite(midnight)) return [];
    // Enumerate real UTC hours: 23/25 columns on clock-change days, no lost or averaged hour.
    const times = Array.from({ length: 30 }, (_, i) => midnight + (i - 3) * 3600).filter(time => dayKey(time) === day);
    const labels = times.map(clock);
    return times.map((time, i) => {
      const repeated = labels.indexOf(labels[i]) !== labels.lastIndexOf(labels[i]);
      const offset = repeated ? zoneFormat.formatToParts(new Date(time * 1000)).find(p => p.type === "timeZoneName").value : "";
      return { time, end: time + 3600, label: `${labels[i]}–${clock(time + 3600)}`, offset,
        nextDay: dayKey(time + 3600) !== day };
    });
  }
  function cellsForDay(rows, day, now = Date.now(), slots = hoursForDay(day)) {
    const byTime = new Map(rows.map(row => [row.time, row]));
    const current = Math.floor(now / 3600000) * 3600;
    return slots.map(slot => {
      const row = byTime.get(slot.time);
      const score = row?.simulation && validScore(row.score) ? row.score : null;
      return { ...slot, score, tone: tone(score), historical: slot.time < current };
    });
  }
  function mergeHistory(rows, saved, now = Date.now()) {
    const current = Math.floor(now / 3600000) * 3600;
    const first = hoursForDay(dayKey(current - 7 * 86400))[0].time;
    const byTime = new Map();
    const valid = r => r && Number.isSafeInteger(r.time) && r.time % 3600 === 0 && r.time >= first && r.simulation && validScore(r.score);
    // A saved forecast can fill a past hour only; never revive an outdated future rating.
    for (const row of Array.isArray(saved) ? saved : []) {
      if (valid(row) && row.time < current) byTime.set(row.time, { ...row, archived: true });
    }
    for (const row of rows) {
      if (valid(row) || (row && Number.isFinite(row.time) && row.time >= first && !byTime.has(row.time))) byTime.set(row.time, row);
    }
    return [...byTime.values()].sort((a, b) => a.time - b.time);
  }
  function calendarDays(entries, now = Date.now()) {
    const today = dayKey(now / 1000), noon = Date.parse(`${today}T12:00:00Z`) / 1000;
    const days = new Set(Array.from({ length: 6 }, (_, i) => dayKey(noon + i * 86400)));
    for (const rows of entries) for (const row of rows) {
      if (row.simulation && validScore(row.score) && row.time < now / 1000) days.add(dayKey(row.time));
    }
    return [...days].sort();
  }
  // Small score snapshots have their own store, separate from large raw-forecast caches.
  function historyStore(indexedDB) {
    const memory = new Map();
    const database = new Promise(resolve => {
      if (!indexedDB) { resolve(null); return; }
      try {
        const request = indexedDB.open("nad-morzem:heatmap-history", 1);
        request.onupgradeneeded = () => request.result.createObjectStore("spots");
        request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); };
        request.onerror = request.onblocked = () => resolve(null);
      } catch { resolve(null); }
    });
    async function access(key, value) {
      const db = await database;
      if (!db) return memory.get(key) || [];
      return new Promise(resolve => {
        try {
          const transaction = db.transaction("spots", value === undefined ? "readonly" : "readwrite");
          const store = transaction.objectStore("spots");
          const request = value === undefined ? store.get(key) : store.put(value, key);
          transaction.oncomplete = () => resolve(request.result || memory.get(key) || []);
          transaction.onerror = transaction.onabort = () => resolve(memory.get(key) || []);
        } catch { resolve(memory.get(key) || []); }
      });
    }
    return {
      read: async key => {
        const data = await access(key);
        return (Array.isArray(data) ? data : []).filter(r => Array.isArray(r) && r.length === 2)
          .map(([time, score]) => ({ time, score, simulation: true }));
      },
      write: async (key, rows) => {
        const data = rows.filter(r => r.simulation && validScore(r.score)).map(r => [r.time, r.score]);
        memory.set(key, data); await access(key, data);
      }
    };
  }
  const api = { dayKey, hoursForDay, cellsForDay, orderedSpots, tone, mergeHistory, calendarDays, historyStore };
  if (typeof module !== "undefined") module.exports = api;
  else root.SurfHeatmap = api;
  if (typeof document === "undefined") return;
  document.addEventListener("DOMContentLoaded", () => {
    const $ = id => document.getElementById(id);
    if (!$("heatmapPanel")) return;
    const M = root.SurfModel, catalog = orderedSpots(root.SurfSpots);
    const records = new Map(), rowNodes = new Map(), coverage = new Map();
    let storage;
    try { storage = root.indexedDB; } catch { /* Restricted browser: retain history in memory. */ }
    const history = historyStore(storage);
    let selectedDay = dayKey(Date.now() / 1000), generation = 0, loading = false, completed = 0, loadedAt = 0;
    let snapshotTime = Date.now(), selectedCell = null, focusCell = null;
    let slots = hoursForDay(selectedDay);
    const active = () => location.hash.startsWith("#heatmap");
    const name = spot => `${spot.town} — ${spot.name}`;
    const scoreText = score => score.toLocaleString("pl-PL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    const dateText = day => new Intl.DateTimeFormat("pl-PL", { timeZone: zone, weekday: "short", day: "numeric", month: "short" }).format(new Date(`${day}T12:00:00Z`));
    function el(tag, text, className) {
      const node = document.createElement(tag);
      if (text !== undefined) node.textContent = text;
      if (className) node.className = className;
      return node;
    }
    function days() {
      const available = [...new Set([...calendarDays([...records.values()].map(r => r.rows), snapshotTime), selectedDay])].sort();
      const signature = available.join(",");
      if ($("heatmapDays").dataset.days === signature) return;
      $("heatmapDays").dataset.days = signature;
      $("heatmapDays").replaceChildren(...available.map(day => {
        const button = el("button", `${day === dayKey(snapshotTime / 1000) ? "Dzisiaj · " : ""}${dateText(day)}${day < dayKey(snapshotTime / 1000) ? " · historia" : ""}`, "filter");
        button.type = "button"; button.dataset.day = day;
        button.setAttribute("aria-pressed", String(day === selectedDay));
        button.addEventListener("click", () => {
          selectedDay = day; selectedCell = null; focusCell = null;
          $("heatmapDays").querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.day === day)));
          render();
        });
        return button;
      }));
    }
    function cellDescription(spot, cell) {
      return `${name(spot)} · ${dateText(selectedDay)} · ${cell.label}${cell.offset ? ` ${cell.offset}` : ""}${cell.nextDay ? " (do północy następnego dnia)" : ""} · ${cell.score === null ? "Brak oceny" : `${scoreText(cell.score)}/10 · ${M.scoreLabel(cell.score)}`}${cell.historical ? " · historia prognozy" : ""}`;
    }
    function showDetail(spot, cell) {
      selectedCell = { id: spot.id, time: cell.time };
      const detail = $("heatmapDetail");
      detail.replaceChildren(el("strong", cellDescription(spot, cell)));
      const issue = records.get(spot.id)?.issue;
      if (issue) detail.append(el("span", issue));
      const link = el("a", "Otwórz prognozę spotu →");
      link.href = `#surf/${spot.id}?day=${selectedDay}`; detail.append(link);
      $("heatmapTable").querySelectorAll("button[aria-pressed=true]").forEach(b => b.setAttribute("aria-pressed", "false"));
      rowNodes.get(spot.id)?.querySelector(`button[data-time="${cell.time}"]`)?.setAttribute("aria-pressed", "true");
    }
    function renderRow(spot) {
      const row = rowNodes.get(spot.id), record = records.get(spot.id);
      const focusedTime = row.contains(document.activeElement) ? document.activeElement.dataset.time : null;
      const head = el("th"); head.scope = "row";
      const link = el("a", spot.town); link.href = `#surf/${spot.id}`;
      head.append(link, el("small", spot.name));
      const cells = cellsForDay(record?.rows || [], selectedDay, snapshotTime, slots);
      coverage.set(spot.id, cells.some(c => c.score !== null));
      row.replaceChildren(head, ...cells.map(cell => {
        const td = el("td"); td.dataset.quality = cell.tone;
        td.dataset.history = String(cell.historical);
        const button = el("button");
        button.type = "button"; button.dataset.time = cell.time;
        if (cell.score !== null) button.dataset.score = cell.score;
        button.title = cellDescription(spot, cell);
        button.setAttribute("aria-label", button.title);
        button.setAttribute("aria-pressed", String(selectedCell?.id === spot.id && selectedCell?.time === cell.time));
        button.tabIndex = (focusCell ? focusCell.id === spot.id && focusCell.time === cell.time : spot.id === catalog[0].id && cell.time === cells[0]?.time) ? 0 : -1;
        button.addEventListener("click", () => showDetail(spot, cell));
        td.append(button); return td;
      }));
      if (selectedCell?.id === spot.id) {
        const cell = cells.find(c => c.time === selectedCell.time);
        if (cell) showDetail(spot, cell);
      }
      if (focusedTime) row.querySelector(`button[data-time="${focusedTime}"]`)?.focus({ preventScroll: true });
    }
    function status() {
      const withScores = [...coverage.values()].filter(Boolean).length;
      const warnings = [...records.values()].filter(record => record.issue).length;
      $("heatmapStatus").textContent = `${loading ? `Pobieranie ${completed}/${catalog.length} spotów… ` : ""}${dateText(selectedDay)} · oceny dostępne dla ${withScores}/${catalog.length} spotów.${!loading && !withScores ? " Brak ocen na ten dzień — wybierz inną datę lub odśwież dane." : ""}${warnings ? ` Dla ${warnings} spotów są braki lub ostrzeżenia; dotknij pola, aby poznać szczegóły.` : ""}${!loading && loadedAt ? ` Sprawdzono o ${clock(loadedAt / 1000)}.` : ""}`;
      $("heatmapProgress").max = catalog.length; $("heatmapProgress").value = completed;
      $("heatmapProgress").hidden = !loading; $("heatmapRefresh").disabled = loading;
      $("heatmapLoading").hidden = !loading;
      $("heatmapResults").hidden = loading;
      $("heatmapTable").setAttribute("aria-busy", String(loading));
    }
    function render() {
      slots = hoursForDay(selectedDay); coverage.clear();
      const table = $("heatmapTable"), head = el("thead"), titles = el("tr");
      const spotHeading = el("th", "Spot"); spotHeading.scope = "col"; titles.append(spotHeading);
      for (const slot of slots) {
        const title = el("th"); title.scope = "col"; title.dataset.time = slot.time;
        const [from, to] = slot.label.split("–");
        title.append(document.createTextNode(`${from}–`), el("wbr"), document.createTextNode(to));
        if (slot.offset) title.append(el("small", slot.offset));
        if (slot.nextDay) title.title = "Koniec o północy następnego dnia; przedział obejmuje czas do 23:59.";
        title.dataset.history = String(slot.time < Math.floor(snapshotTime / 3600000) * 3600);
        titles.append(title);
      }
      head.append(titles);
      const body = el("tbody"); rowNodes.clear();
      for (const spot of catalog) { const row = el("tr"); row.dataset.spot = spot.id; row.dataset.longitude = spot.lon; rowNodes.set(spot.id, row); body.append(row); }
      table.replaceChildren(el("caption", `${dateText(selectedDay)} · ${catalog.length} spotów · ocena na początku każdej godziny`), head, body);
      for (const spot of catalog) renderRow(spot);
      if (!selectedCell) $("heatmapDetail").textContent = "Najedź na pole, aby zobaczyć ocenę. Dotknij lub kliknij, aby wyświetlić szczegóły i przejść do prognozy spotu. Klawiatura: użyj strzałek do poruszania się po polach.";
      status();
    }
    async function load(force = false) {
      const token = ++generation;
      loading = true; completed = 0; loadedAt = 0; snapshotTime = Date.now(); records.clear();
      days(); render();
      let index = 0;
      await Promise.all(Array.from({ length: 4 }, async () => {
        while (index < catalog.length && token === generation && active()) {
          const spot = catalog[index++];
          const key = M.coastalHistoryKey(spot);
          const saved = await history.read(key);
          // Import earlier ratings already retained by the comparison view, for the same geometry.
          try {
            const previous = JSON.parse(localStorage.getItem(key));
            if (Array.isArray(previous)) saved.push(...previous);
          } catch { /* Browser storage is optional. */ }
          if (token !== generation || !active()) return;
          let rows = [], issue = "";
          try {
            const [forecast, simulation] = await Promise.all([
              root.SurfAPI.forecasts(spot, force, { coastalOnly: true, publishedOnly: true }),
              root.SurfAPI.nearshore(spot, force)
            ]);
            rows = M.buildCoastalForecast(spot, forecast.weather?.data, simulation, snapshotTime, { historyHours: 48 });
            const issues = [];
            if (!forecast.weather) issues.push("Brak aktualnego wiatru.");
            if (!rows.some(row => row.simulation)) issues.push("Brak aktualnej prognozy fal dla tego punktu.");
            if (forecast.weather?.stale || simulation.stale) issues.push("Dane z pamięci; ostatnie pobranie nie powiodło się.");
            if (simulation.refreshPending) issues.push("Trwa przeliczanie fal. Spróbuj odświeżyć oceny za chwilę.");
            if (simulation.refreshError) issues.push(simulation.refreshError);
            issue = issues.join(" ");
          } catch { issue = "Nie udało się pobrać prognozy. Użyj przycisku Odśwież oceny."; }
          if (token !== generation || !active()) return;
          rows = mergeHistory(rows, saved, snapshotTime);
          await history.write(key, rows);
          if (token !== generation || !active()) return;
          records.set(spot.id, { rows, issue }); completed++;
          days(); renderRow(spot); status();
        }
      }));
      if (token !== generation || !active()) return;
      loading = false; loadedAt = Date.now(); status();
    }
    $("heatmapTable").addEventListener("focusin", event => {
      const button = event.target.closest("button[data-time]"); if (!button) return;
      $("heatmapTable").querySelectorAll("button[tabindex='0']").forEach(b => { b.tabIndex = -1; });
      button.tabIndex = 0; focusCell = { id: button.closest("tr").dataset.spot, time: Number(button.dataset.time) };
    });
    $("heatmapTable").addEventListener("keydown", event => {
      const button = event.target.closest("button[data-time]");
      if (!button || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const rows = [...$("heatmapTable").tBodies[0].rows], row = button.closest("tr");
      let r = rows.indexOf(row), c = button.closest("td").cellIndex - 1;
      if (event.key === "ArrowUp") r--; if (event.key === "ArrowDown") r++;
      if (event.key === "ArrowLeft") c--; if (event.key === "ArrowRight") c++;
      if (event.key === "Home") c = 0; if (event.key === "End") c = row.cells.length - 2;
      const target = rows[Math.max(0, Math.min(rows.length - 1, r))].cells[Math.max(0, Math.min(row.cells.length - 2, c)) + 1].querySelector("button");
      target.focus();
    });
    for (const [value, label] of [[0, "0–1,4"], [1.5, "1,5–2,9"], [3, "3–4,9"], [5, "5–6,4"], [6.5, "6,5–7,9"], [8, "8–8,9"], [9, "9–10"], [null, "Brak danych"]]) {
      const item = el("span", label); item.dataset.quality = tone(value); $("heatmapLegend").append(item);
    }
    $("heatmapRefresh").addEventListener("click", () => load(true));
    function route() {
      if (!active()) { ++generation; if (loading) loadedAt = 0; loading = false; return; }
      document.title = "Mapa cieplna spotów | Bałtyk Surf";
      if (!loading && (!loadedAt || Date.now() - loadedAt >= 15 * 60000)) load();
    }
    window.addEventListener("hashchange", route);
    window.addEventListener("online", () => { if (active() && !loading) load(true); });
    window.addEventListener("app:resume", route);
    route();
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
