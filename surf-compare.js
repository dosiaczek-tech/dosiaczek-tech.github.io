/* Five saved spots; daily scores use the same coastal session model as details. */
(function (root) {
  "use strict";
  const dayKey = time => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(time * 1000));
  function choose(catalog, saved, random = Math.random) {
    const valid = new Set(catalog.map(s => s.id));
    const ids = [...new Set(Array.isArray(saved) ? saved.filter(id => valid.has(id)) : [])].slice(0, 5);
    const pool = catalog.map(s => s.id).filter(id => !ids.includes(id));
    while (ids.length < 5 && pool.length) ids.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
    return ids;
  }
  function retainHistory(rows, saved, now = Date.now()) {
    const byTime = new Map();
    const recent = r => r && Number.isFinite(r.time) && r.time * 1000 >= now - 12 * 3600000;
    for (const r of Array.isArray(saved) ? saved : []) {
      if (recent(r) && r.time * 1000 < now && Number.isFinite(r.score) && r.score >= 0 && r.score <= 10 && r.simulation && typeof r.daylight === "boolean")
        byTime.set(r.time, { ...r, archived: true });
    }
    for (const r of rows) if (recent(r) && (Number.isFinite(r.score) || !byTime.has(r.time))) byTime.set(r.time, r);
    return [...byTime.values()].sort((a, b) => a.time - b.time);
  }
  function daily(rows, model, now = Date.now()) {
    const groups = new Map();
    for (const row of rows) {
      if (row.time * 1000 < now - 12 * 3600000 || !row.simulation) continue;
      const key = dayKey(row.time);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(row);
    }
    return new Map([...groups].map(([key, values]) => {
      values.sort((a, b) => a.time - b.time);
      const upcoming = model.bestWindows(values.filter(r => r.time * 1000 >= now), 1)[0];
      const window = upcoming || model.bestWindows(values, 1)[0];
      return [key, window ? { ...window, historical: !upcoming, archived: values.some(r => r.time >= window.start && r.time < window.end && r.archived) } : null];
    }));
  }
  function bestSpots(entries, model, now = Date.now(), random = Math.random) {
    const today = dayKey(now / 1000);
    const lastDay = dayKey(Date.parse(`${today}T12:00:00Z`) / 1000 + 5 * 86400);
    const ranked = entries.map(({ id, rows }) => {
      const scores = [...daily(rows, model, now)].filter(([day, w]) => day > today && day <= lastDay && w && !w.historical).map(([, w]) => w.score);
      return { id, score: scores.length ? Math.max(...scores) : null };
    }).filter(r => Number.isFinite(r.score));
    // Shuffle before the stable score sort: ties are random without dropping better spots.
    for (let i = ranked.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [ranked[i], ranked[j]] = [ranked[j], ranked[i]];
    }
    return ranked.sort((a, b) => b.score - a.score).slice(0, 5).map(r => r.id);
  }
  const api = { choose, daily, dayKey, retainHistory, bestSpots };
  if (typeof module !== "undefined") module.exports = api;
  else root.SurfCompare = api;
  if (typeof document === "undefined") return;
  document.addEventListener("DOMContentLoaded", () => {
    const M = root.SurfModel, catalog = root.SurfSpots;
    const $ = id => document.getElementById(id);
    const storageKey = "nad-morzem:compare-spots-v1";
    const colors = ["#126a96", "#903ca3", "#a44b12", "#087a6a", "#4d50b0"];
    const cache = new Map();
    let saved, selectedDay, generation = 0, autoGeneration = 0, manual = false;
    try { saved = JSON.parse(localStorage.getItem(storageKey)); manual = localStorage.getItem(`${storageKey}:manual`) === "true"; } catch { /* First visit or storage unavailable. */ }
    let ids = choose(catalog, saved);
    const el = (tag, text, cls) => {
      const item = document.createElement(tag);
      if (text !== undefined) item.textContent = text;
      if (cls) item.className = cls;
      return item;
    };
    const date = (t, options) => new Intl.DateTimeFormat("pl-PL", { timeZone: "Europe/Warsaw", ...options }).format(new Date(t * 1000));
    const hour = t => date(t, { hour: "2-digit", minute: "2-digit" });
    const label = spot => `${spot.town} — ${spot.name}`;
    const tone = score => !M.finite(score) ? "unknown" : score >= 9 ? "excellent" : score >= 8 ? "great" : score >= 6.5 ? "good" : score >= 5 ? "fair" : score >= 3 ? "weak" : score >= 1.5 ? "poor" : "bad";
    function save() {
      try { localStorage.setItem(storageKey, JSON.stringify(ids)); localStorage.setItem(`${storageKey}:manual`, String(manual)); }
      catch { $("compareStorage").textContent = "Przeglądarka nie pozwala zapisać wyboru — pozostanie dostępny tylko na tej stronie."; }
    }
    function selectors() {
      $("compareSelectors").replaceChildren(...ids.map((id, index) => {
        const field = el("label", `Spot ${index + 1}`, "compare-selector");
        field.style.setProperty("--spot-color", colors[index]);
        const select = el("select");
        for (const spot of [...catalog].sort((a, b) => label(a).localeCompare(label(b), "pl"))) {
          const option = el("option", label(spot)); option.value = spot.id;
          option.selected = spot.id === id; option.disabled = spot.id !== id && ids.includes(spot.id);
          select.append(option);
        }
        select.addEventListener("change", () => {
          manual = true; ++autoGeneration; ids[index] = select.value; save(); selectors();
          $("compareBest").disabled = false;
          $("compareStorage").textContent = "Twój zapisany zestaw. Kliknij „Wybierz najlepsze”, aby wrócić do automatycznego wyboru.";
          load();
        });
        field.append(select); return field;
      }));
    }
    async function fetchSpot(id, force = false, publishedOnly = false) {
      if (!cache.has(id)) {
        const spot = catalog.find(s => s.id === id);
        cache.set(id, Promise.all([root.SurfAPI.forecasts(spot, force, { coastalOnly: true, publishedOnly }), root.SurfAPI.nearshore(spot, force)])
          .then(([forecast, simulation]) => M.buildCoastalForecast(spot, forecast.weather?.data, simulation, Date.now(), { historyHours: 12 }))
          .catch(() => [])
          .then(rows => {
            const key = `nad-morzem:compare-history-v1:${spot.id}:${spot.lat}:${spot.lon}:${spot.normal}`;
            let savedRows;
            try { savedRows = JSON.parse(localStorage.getItem(key)); } catch { /* Storage optional. */ }
            const retained = retainHistory(rows, savedRows);
            // Store only the fields needed to reconstruct session ratings, not full SWAN profiles.
            try { localStorage.setItem(key, JSON.stringify(retained.map(r => ({ time: r.time, score: r.score,
              height: r.height, daylight: r.daylight, simulation: r.simulation ? { height: r.height } : null,
              confidence: r.confidence, flags: r.flags, cleanup: r.cleanup })))); } catch { /* In-memory history still works. */ }
            return retained;
          }));
      }
      return cache.get(id);
    }
    async function load(force = false) {
      const token = ++generation, selection = [...ids];
      if (force) selection.forEach(id => cache.delete(id));
      $("compareStatus").textContent = "Pobieram prognozy pięciu spotów…";
      $("compareContent").setAttribute("aria-busy", "true");
      for (const id of ["compareChart", "compareLegend", "compareDays", "compareRanking"]) $(id).replaceChildren();
      $("compareRefresh").disabled = true;
      const all = await Promise.all(selection.map(id => fetchSpot(id, force)));
      if (token !== generation) return;
      const now = Date.now();
      const data = all.map((rows, i) => ({ spot: catalog.find(s => s.id === selection[i]), color: colors[i], days: daily(rows, M, now) }));
      // Six calendar days; individual spots may have a shorter SWAN horizon.
      const today = dayKey(now / 1000);
      const days = Array.from({ length: 6 }, (_, i) => {
        const t = Date.parse(`${today}T12:00:00Z`) / 1000 + i * 86400;
        return { key: dayKey(t), label: date(t, { weekday: "short", day: "numeric", month: "short" }) };
      });
      if (!days.some(d => d.key === selectedDay)) selectedDay = days[0].key;
      const available = data.filter(d => days.some(day => d.days.get(day.key))).length;
      $("compareStatus").textContent = `Dane z pełnymi oknami: ${available}/${ids.length} spotów. Najpierw pokazujemy przyszłe sesje. Jeśli dziś ich już nie ma, pokazujemy wcześniejsze okno z dostępnych ostatnich 12 godzin, oznaczone jako historia prognozy.`;
      $("compareContent").setAttribute("aria-busy", "false");
      $("compareRefresh").disabled = false;
      const render = () => { chart(data, days); ranking(data, days); };
      $("compareDays").replaceChildren(...days.map(d => {
        const button = el("button", d.label, "filter"); button.type = "button";
        button.addEventListener("click", () => { selectedDay = d.key; render(); });
        button.dataset.day = d.key; return button;
      }));
      render();
    }
    function chart(data, days) {
      const ns = "http://www.w3.org/2000/svg";
      const svg = document.createElementNS(ns, "svg");
      svg.setAttribute("viewBox", "0 0 900 310"); svg.setAttribute("role", "img");
      svg.setAttribute("aria-label", "Porównanie ocen 0–10 pięciu spotów na sześć dni. Puste kółka oznaczają wcześniejsze okna; szczegóły w rankingu poniżej.");
      const add = (tag, attrs, text) => {
        const item = document.createElementNS(ns, tag);
        Object.entries(attrs).forEach(([k, v]) => item.setAttribute(k, v));
        if (text !== undefined) item.textContent = text;
        svg.append(item); return item;
      };
      const x = i => 65 + i * 780 / (days.length - 1), y = score => 260 - score * 23;
      [[0, 3, "#fee2e2"], [3, 5, "#fff0dc"], [5, 6.5, "#fff6d5"], [6.5, 10, "#dcf3df"]].forEach(([lo, hi, fill]) =>
        add("rect", { x: 45, y: y(hi), width: 820, height: (hi - lo) * 23, fill, opacity: .65 }));
      for (let score = 0; score <= 10; score += 2) {
        add("line", { x1: 45, x2: 865, y1: y(score), y2: y(score), stroke: "#66756d", "stroke-opacity": .15 });
        add("text", { x: 30, y: y(score) + 4, "text-anchor": "end", "font-size": 12, fill: "#45534d" }, score);
      }
      days.forEach((d, i) => {
        if (d.key === selectedDay) add("line", { x1: x(i), x2: x(i), y1: 30, y2: 265, stroke: "#45534d", "stroke-dasharray": "4 5" });
        add("text", { x: x(i), y: 290, "text-anchor": "middle", "font-size": 12, fill: "#45534d" }, d.label);
      });
      data.forEach((series, index) => {
        let previous = null;
        days.forEach((d, i) => {
          const w = series.days.get(d.key);
          if (!w) { previous = null; return; }
          if (previous) add("line", { x1: previous.x, y1: previous.y, x2: x(i), y2: y(w.score), stroke: series.color, "stroke-width": 2.5, "stroke-dasharray": ["none", "8 3", "3 3", "10 3 2 3", "2 2"][index] });
          const point = add("circle", { cx: x(i), cy: y(w.score), r: 5, fill: w.historical ? "white" : series.color, stroke: series.color, "stroke-width": 2 });
          const title = document.createElementNS(ns, "title"); title.textContent = `${label(series.spot)}: ${w.score}/10 · ${d.label}`; point.append(title);
          previous = { x: x(i), y: y(w.score) };
        });
      });
      $("compareChart").replaceChildren(svg);
      $("compareLegend").replaceChildren(...data.map(series => { const item = el("span", label(series.spot)); item.style.setProperty("--spot-color", series.color); return item; }));
    }
    function ranking(data, days) {
      $("compareDays").querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.day === selectedDay)));
      $("compareRankingTitle").textContent = `Gdzie warto jechać · ${days.find(d => d.key === selectedDay).label}`;
      const sorted = data.map(d => ({ ...d, window: d.days.get(selectedDay) })).sort((a, b) =>
        Number(Boolean(b.window && !b.window.historical)) - Number(Boolean(a.window && !a.window.historical)) || (b.window?.score ?? -1) - (a.window?.score ?? -1));
      $("compareRanking").replaceChildren(...sorted.map((d, i) => {
        const card = el("a", undefined, "surf-window compare-card"); card.href = `#surf/${d.spot.id}`;
        card.addEventListener("click", () => setTimeout(() => $("forecastPanel").scrollIntoView({ behavior: "smooth", block: "start" }), 0));
        card.dataset.quality = tone(d.window?.score);
        const name = el("span", `${i + 1}. ${label(d.spot)}`, "compare-spot-link");
        name.style.setProperty("--spot-color", d.color);
        card.append(name);
        if (d.window) {
          card.append(el("strong", `${d.window.score.toLocaleString("pl-PL", { minimumFractionDigits: 1 })}/10`), el("span", d.window.historical ? "Wcześniejsze okno — historia prognozy" : M.scoreLabel(d.window.score)),
            el("small", `${hour(d.window.start)}–${hour(d.window.end)} · pewność: ${d.window.confidence}`));
          if (d.window.historical) card.append(el("small", d.window.archived ? "Zapisana wcześniejsza prognoza, nie pomiar ani rekomendacja na teraz." : "Wynik modelowy dla wcześniejszych godzin, nie pomiar ani rekomendacja na teraz."));
        } else card.append(el("strong", "Brak oceny"), el("small", "Brak pełnego okna dziennego w dostępnych danych. Dalsze dni pojawią się wraz z kolejnymi obliczeniami SWAN."));
        card.append(el("small", "Zobacz szczegółową prognozę →")); return card;
      }));
    }
    async function selectBest(force = false) {
      const token = ++autoGeneration;
      ++generation;
      manual = false; save();
      $("compareBest").disabled = true;
      $("compareRefresh").disabled = true;
      $("compareContent").setAttribute("aria-busy", "true");
      for (const id of ["compareChart", "compareLegend", "compareDays", "compareRanking"]) $(id).replaceChildren();
      let next = 0, completed = 0;
      const entries = [];
      // Only published files, four spots at a time; no mass requests to the weather provider.
      await Promise.all(Array.from({ length: 4 }, async () => {
        while (next < catalog.length && token === autoGeneration) {
          const spot = catalog[next++];
          if (force) cache.delete(spot.id);
          const rows = await fetchSpot(spot.id, force, true);
          entries.push({ id: spot.id, rows }); completed++;
          if (token === autoGeneration) $("compareStatus").textContent = `Szukam najlepszych sesji od jutra: ${completed}/${catalog.length} spotów…`;
        }
      }));
      if (token !== autoGeneration) return;
      $("compareBest").disabled = false;
      ids = bestSpots(entries, M);
      save(); selectors();
      $("compareStorage").textContent = ids.length
        ? `Wybór automatyczny: ${ids.length} najlepszych spotów według najwyższej oceny okna od jutra do końca wykresu. Remisy losujemy. Ręczna zmiana zapamięta Twój zestaw.`
        : "Brak aktualnych ocen na następne dni — nie wybieramy losowych spotów jako najlepszych. Spróbuj odświeżyć lub wybierz własny zestaw.";
      if (!ids.length) { ids = choose(catalog, saved); selectors(); }
      await load();
    }
    selectors();
    if (manual) { $("compareStorage").textContent = "Twój zapisany zestaw. Kliknij „Wybierz najlepsze”, aby wrócić do automatycznego wyboru."; load(); }
    else selectBest();
    $("compareBest").addEventListener("click", () => selectBest(true));
    $("compareRefresh").addEventListener("click", () => manual ? load(true) : selectBest(true));
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
