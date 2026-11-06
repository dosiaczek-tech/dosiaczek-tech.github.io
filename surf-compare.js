/* Explicit comparison actions; daily scores use the shared coastal session model. */
(function (root) {
  "use strict";
  const DEFAULT_SLOTS = 5, MAX_SLOTS = 15;
  const dayKey = time => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(time * 1000));
  const historyStart = now => Math.floor(now / 3600000) * 3600 - 12 * 3600;
  function calendarDays(now = Date.now()) {
    const today = dayKey(now / 1000), first = dayKey(historyStart(now));
    const noon = Date.parse(`${today}T12:00:00Z`) / 1000;
    const days = Array.from({ length: 6 }, (_, i) => dayKey(noon + i * 86400));
    if (first !== today) days.unshift(first);
    return days;
  }
  function choose(catalog, selection = []) {
    const valid = new Set(catalog.map(s => s.id)), used = new Set();
    const requested = Array.isArray(selection) ? selection : [];
    return Array.from({ length: Math.min(MAX_SLOTS, Math.max(DEFAULT_SLOTS, requested.length)) }, (_, i) => {
      const id = requested[i];
      if (!valid.has(id) || used.has(id)) return "";
      used.add(id); return id;
    });
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
  function bestSpots(entries, selectedDay, random = Math.random) {
    const ranked = entries.map(({ id, days }) => ({ id, window: days.get(selectedDay) }))
      .filter(entry => Number.isFinite(entry.window?.score));
    // Shuffle before the stable score sort: ties are random without dropping better spots.
    for (let i = ranked.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [ranked[i], ranked[j]] = [ranked[j], ranked[i]];
    }
    return ranked.sort((a, b) => Number(Boolean(a.window.historical)) - Number(Boolean(b.window.historical)) ||
      b.window.score - a.window.score).slice(0, 5).map(r => r.id);
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
  const api = { choose, daily, dayKey, retainHistory, bestSpots, calendarDays, chartHours, chartExtent, chartSegments };
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
    const bestByDay = new Map();
    let data = [], days = [], loading = false, snapshotTime = Date.now();
    let selectedDay, generation = 0, autoGeneration = 0, manual = true;
    let ids = [], choices = choose(catalog);
    const recentSpotKey = "nad-morzem:compare-last-spot-v1";
    let recentSpotId = "", activePicker = null;
    try {
      const saved = localStorage.getItem(recentSpotKey);
      if (catalog.some(spot => spot.id === saved)) recentSpotId = saved;
    } catch { /* The most recent choice still works in memory if storage is unavailable. */ }
    const el = (tag, text, cls) => {
      const item = document.createElement(tag);
      if (text !== undefined) item.textContent = text;
      if (cls) item.className = cls;
      return item;
    };
    const date = (t, options) => new Intl.DateTimeFormat("pl-PL", { timeZone: "Europe/Warsaw", ...options }).format(new Date(t * 1000));
    const hour = t => date(t, { hour: "2-digit", minute: "2-digit" });
    const label = spot => `${spot.town} — ${spot.name}`;
    const sortedSpots = [...catalog].sort((a, b) => label(a).localeCompare(label(b), "pl"));
    const searchText = text => text.toLocaleLowerCase("pl").normalize("NFD").replace(/\p{M}/gu, "").replace(/ł/g, "l");
    const tone = score => !M.finite(score) ? "unknown" : score >= 9 ? "excellent" : score >= 8 ? "great" : score >= 6.5 ? "good" : score >= 5 ? "fair" : score >= 3 ? "weak" : score >= 1.5 ? "poor" : "bad";
    function updateActions() {
      $("compareBest").disabled = loading;
      $("compareRefresh").disabled = loading || !choices.some(Boolean);
      $("compareAddSpot").disabled = loading || choices.length >= MAX_SLOTS;
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
      loading = false; manual = true; data = []; ids = []; bestByDay.clear();
      $("compareContent").setAttribute("aria-busy", "false"); $("compareContent").dataset.mode = "idle";
      for (const id of ["compareLegend", "compareDays", "compareRanking", "compareHourlyTable"]) $(id).replaceChildren();
      $("compareRankingTitle").hidden = true; $("compareExplanation").hidden = true;
      $("compareStatus").textContent = "";
      const count = choices.filter(Boolean).length;
      $("compareStorage").textContent = count ? `Wybrane spoty: ${count}/${MAX_SLOTS}. Kliknij „Porównaj wybrane”, aby je wyświetlić.`
        : "Wskaż własne spoty i kliknij „Porównaj wybrane” albo skorzystaj z „Pokaż najlepsze”.";
      chartState("idle", count ? "Wykres pojawi się po kliknięciu „Porównaj wybrane”." : "Wybierz spoty lub kliknij „Pokaż najlepsze”.");
      updateActions();
    }
    function closePicker() {
      if (!activePicker) return;
      activePicker.panel.hidden = true;
      activePicker.button.setAttribute("aria-expanded", "false");
      activePicker.button.removeAttribute("aria-activedescendant");
      activePicker = null;
    }
    function spotPicker(id, index) {
      const field = el("div", undefined, "compare-selector");
      field.style.setProperty("--spot-color", colors[index]);
      const caption = el("label", `Spot ${index + 1}`); caption.id = `compareSpotLabel${index}`;
      const button = el("button", undefined, "compare-picker-button");
      button.type = "button"; button.id = `compareSpotChoice${index}`; button.dataset.value = id;
      button.dataset.empty = String(!id); caption.htmlFor = button.id;
      const value = el("span", catalog.some(spot => spot.id === id) ? label(catalog.find(spot => spot.id === id)) : "Wybierz");
      value.id = `compareSpotValue${index}`; button.append(value);
      button.setAttribute("role", "combobox"); button.setAttribute("aria-haspopup", "listbox");
      button.setAttribute("aria-expanded", "false"); button.setAttribute("aria-labelledby", `${caption.id} ${value.id}`);
      const panel = el("div", undefined, "compare-picker-list");
      panel.id = `compareSpotOptions${index}`; panel.hidden = true;
      panel.setAttribute("role", "listbox"); panel.setAttribute("aria-labelledby", caption.id);
      button.setAttribute("aria-controls", panel.id);
      const recent = catalog.find(spot => spot.id === recentSpotId);
      const items = [
        ...(recent ? [{ value: recent.id, text: label(recent), recent: true }] : []),
        { value: "", text: id ? "Wyczyść wybór" : "Wybierz" },
        ...sortedSpots.filter(spot => spot.id !== recentSpotId).map(spot => ({ value: spot.id, text: label(spot) }))
      ].map((item, optionIndex) => {
        const option = el("div", undefined, `compare-picker-option${item.recent ? " is-recent" : ""}`);
        const disabled = Boolean(item.value && item.value !== id && choices.includes(item.value));
        option.id = `${panel.id}-${optionIndex}`; option.dataset.value = item.value;
        option.setAttribute("role", "option"); option.setAttribute("aria-selected", String(item.value === id));
        option.setAttribute("aria-disabled", String(disabled));
        if (item.recent) option.append(el("small", "Ostatnio wybrany spot", "compare-recent-caption"));
        option.append(el("span", item.text));
        if (item.recent && disabled) option.append(el("small", "Już w porównaniu", "compare-recent-note"));
        panel.append(option);
        return { ...item, node: option, disabled, search: searchText(item.text) };
      });
      let active = -1, typed = "", typedAt = 0;
      const activate = (next, scroll = true) => {
        if (!items[next] || items[next].disabled) return;
        if (items[active]) delete items[active].node.dataset.active;
        active = next; items[active].node.dataset.active = "true";
        button.setAttribute("aria-activedescendant", items[active].node.id);
        if (scroll) items[active].node.scrollIntoView({ block: "nearest" });
      };
      const open = () => {
        closePicker();
        panel.hidden = false; button.setAttribute("aria-expanded", "true");
        activePicker = { button, panel }; typed = "";
        const rect = button.getBoundingClientRect(), margin = 12;
        const width = Math.min(Math.max(rect.width, 300), window.innerWidth - margin * 2);
        const below = window.innerHeight - rect.bottom - margin, above = rect.top - margin;
        const upwards = below < 180 && above > below;
        panel.style.width = `${width}px`;
        panel.style.left = `${Math.max(margin, Math.min(rect.left, window.innerWidth - width - margin))}px`;
        panel.style.maxHeight = `${Math.max(60, Math.min(360, (upwards ? above : below) - 6))}px`;
        panel.style.top = upwards ? "auto" : `${rect.bottom + 6}px`;
        panel.style.bottom = upwards ? `${window.innerHeight - rect.top + 6}px` : "auto";
        panel.scrollTop = 0;
        const selected = id ? items.findIndex(item => item.value === id) : -1;
        activate(selected >= 0 ? selected : items.findIndex(item => !item.disabled));
      };
      const select = next => {
        const item = items[next];
        if (!item || item.disabled) return;
        if (item.value) {
          recentSpotId = item.value;
          try { localStorage.setItem(recentSpotKey, recentSpotId); } catch { /* In-memory choice remains available. */ }
        }
        if (choices[index] !== item.value) {
          choices[index] = item.value; choices = choose(catalog, choices);
          resetComparison();
        }
        selectors(index);
      };
      button.addEventListener("click", () => panel.hidden ? open() : closePicker());
      panel.addEventListener("click", event => {
        const next = items.findIndex(item => item.node === event.target.closest('[role="option"]'));
        select(next);
      });
      panel.addEventListener("pointermove", event => {
        const next = items.findIndex(item => item.node === event.target.closest('[role="option"]'));
        activate(next, false);
      });
      button.addEventListener("keydown", event => {
        if (event.key === "Tab") { closePicker(); return; }
        if (event.key === "Escape") { event.preventDefault(); closePicker(); return; }
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault(); if (panel.hidden) open(); else select(active); return;
        }
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
          event.preventDefault();
          const wasClosed = panel.hidden;
          if (wasClosed) open();
          const enabled = items.map((item, i) => item.disabled ? -1 : i).filter(i => i >= 0);
          const position = enabled.indexOf(active);
          if (event.key === "Home") activate(enabled[0]);
          else if (event.key === "End") activate(enabled.at(-1));
          else if (!wasClosed) activate(enabled[Math.max(0, Math.min(enabled.length - 1, position + (event.key === "ArrowDown" ? 1 : -1)))]);
          return;
        }
        if (event.key.length === 1) {
          event.preventDefault(); if (panel.hidden) open();
          const now = Date.now(); typed = now - typedAt < 800 ? typed + event.key : event.key; typedAt = now;
          const repeated = [...typed].every(char => char === typed[0]);
          const query = searchText(repeated ? event.key : typed);
          const start = repeated ? active + 1 : active;
          for (let offset = 0; offset < items.length; offset++) {
            const next = (Math.max(0, start) + offset) % items.length;
            if (!items[next].disabled && items[next].search.startsWith(query)) { activate(next); break; }
          }
        }
      });
      field.append(caption, button, panel);
      return field;
    }
    function selectors(focusIndex = null) {
      closePicker();
      $("compareSelectors").replaceChildren(...choices.map(spotPicker));
      if (focusIndex !== null) $(`compareSpotChoice${focusIndex}`)?.focus({ preventScroll: true });
    }
    document.addEventListener("pointerdown", event => {
      if (activePicker && !activePicker.button.contains(event.target) && !activePicker.panel.contains(event.target)) closePicker();
    });
    document.addEventListener("focusin", event => {
      if (activePicker && !activePicker.button.contains(event.target) && !activePicker.panel.contains(event.target)) closePicker();
    });
    document.addEventListener("scroll", event => {
      if (activePicker && event.target !== activePicker.panel && !activePicker.panel.contains(event.target)) closePicker();
    }, true);
    window.addEventListener("resize", closePicker);
    async function fetchSpot(id, force = false, publishedOnly = false) {
      if (!cache.has(id)) {
        const spot = catalog.find(s => s.id === id);
        const task = Promise.all([root.SurfAPI.forecasts(spot, force, { coastalOnly: true, publishedOnly }), root.SurfAPI.nearshore(spot, force)])
          .then(([forecast, simulation]) => {
            const rows = M.buildCoastalForecast(spot, forecast.weather?.data, simulation, Date.now(), { historyHours: 12 });
            const issues = [];
            if (!forecast.weather) issues.push(`Brak aktualnego wiatru. ${forecast.errors.join(" ")}`);
            if (!rows.some(row => row.simulation)) issues.push(M.simulationAge(simulation) > 18
              ? "Ostatnie wyniki SWAN lub ich dane wejściowe mają ponad 18 godzin." : "Brak poprawnej, aktualnej prognozy fal przy brzegu.");
            if (simulation.refreshPending) issues.push("Podczas pobierania trwało lokalne przeliczanie fal SWAN.");
            if (simulation.refreshError) issues.push(simulation.refreshError);
            if (simulation.refreshPending || simulation.refreshError) issues.push("Nowsze wyniki wczytasz przyciskiem „Pokaż najlepsze” lub „Porównaj wybrane”.");
            if (cache.get(id) === task) problems.set(id, issues.join(" "));
            return rows;
          })
          .catch(error => { if (cache.get(id) === task) problems.set(id, `Nie udało się pobrać prognozy: ${error.message}`); return []; })
          .then(rows => {
            const key = M.coastalHistoryKey(spot);
            let savedRows;
            try { savedRows = JSON.parse(localStorage.getItem(key)); } catch { /* Storage optional. */ }
            const retained = retainHistory(rows, savedRows);
            // Store only the fields needed to reconstruct session ratings, not full SWAN profiles.
            try { localStorage.setItem(key, JSON.stringify(retained.map(r => ({ time: r.time, score: r.score,
              height: r.height, daylight: r.daylight, simulation: r.simulation ? { height: r.height } : null,
              confidence: r.confidence, flags: r.flags, cleanup: r.cleanup })))); } catch { /* In-memory history still works. */ }
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
      loading = true; data = []; bestByDay.clear();
      $("compareStorage").textContent = manual ? `Porównuję wybrane spoty: ${ids.length}…` : "Wyszukuję najlepsze spoty na wybrany dzień…";
      $("compareStatus").textContent = message;
      $("compareContent").setAttribute("aria-busy", "true");
      $("compareContent").dataset.mode = manual ? "manual" : "auto";
      for (const id of ["compareLegend", "compareRanking", "compareHourlyTable"]) $(id).replaceChildren();
      $("compareRankingTitle").hidden = true; $("compareExplanation").hidden = true;
      chartState("loading", message); updateActions();
      // Include yesterday when the rolling twelve-hour history crosses midnight.
      const now = Date.now(), today = dayKey(now / 1000);
      days = calendarDays(now).map(key => {
        const t = Date.parse(`${key}T12:00:00Z`) / 1000;
        return { key, label: date(t, { weekday: "short", day: "numeric", month: "short" }) };
      });
      if (!days.some(d => d.key === selectedDay)) selectedDay = today;
      $("compareDays").replaceChildren(...days.map(d => {
        const button = el("button", d.label, "filter"); button.type = "button";
        button.addEventListener("click", () => {
          if (selectedDay === d.key) return;
          selectedDay = d.key; updateDaySelection();
          if (!loading) render();
        });
        button.dataset.day = d.key; return button;
      }));
      updateDaySelection();
    }
    function updateDaySelection() {
      $("compareContent").dataset.day = selectedDay;
      $("compareDays").querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.day === selectedDay)));
      $("compareRankingTitle").textContent = `Gdzie warto jechać · ${days.find(d => d.key === selectedDay).label}`;
    }
    function finishLoad(entries) {
      const now = Date.now();
      snapshotTime = now;
      data = entries.map(({ id, rows }) => ({ id, spot: catalog.find(s => s.id === id), hours: chartHours(rows, now), days: daily(rows, M, now) }));
      loading = false;
      $("compareContent").setAttribute("aria-busy", "false");
      $("compareRankingTitle").hidden = false; $("compareExplanation").hidden = false;
      render();
      updateActions();
    }
    function render() {
      const selectedLabel = days.find(d => d.key === selectedDay).label;
      if (!manual) {
        // Reuse tie choices when returning to a date; changing days needs no new requests.
        if (!bestByDay.has(selectedDay)) bestByDay.set(selectedDay, bestSpots(data, selectedDay));
        ids = [...bestByDay.get(selectedDay)];
        choices = choose(catalog, ids); selectors(); updateActions();
        $("compareStorage").textContent = ids.length
          ? `Najlepsze spoty na ${selectedLabel}. Zmiana dnia dobiera piątkę z całego katalogu. Możesz też zmienić listy i kliknąć „Porównaj wybrane”.`
          : `Brak aktualnych ocen na ${selectedLabel}. Wybierz inny dzień lub wskaż własne spoty do porównania.`;
      } else $("compareStorage").textContent = `Porównanie wskazanych spotów: ${ids.length}. „Pokaż najlepsze” wybierze najlepsze miejsca z całego katalogu.`;
      const selected = ids.map(id => {
        const slot = choices.indexOf(id);
        return { ...data.find(d => d.id === id), slot, color: colors[slot], linePattern: linePatterns[slot] };
      });
      const available = data.filter(d => d.days.get(selectedDay)).length;
      const upcoming = data.filter(d => d.days.get(selectedDay) && !d.days.get(selectedDay).historical).length;
      const issues = [...new Set((selected.length ? selected : data).map(d => problems.get(d.id)).filter(Boolean))];
      $("compareStatus").textContent = `${selectedLabel} · przyszłe okna: ${upcoming}/${data.length} spotów. Z uwzględnieniem historii: ${available}/${data.length}. Oceny wcześniejszych godzin są oznaczone jako historia prognozy. ${issues.join(" ")}`;
      chart(selected, days); ranking(selected); hourlyTable(selected);
    }
    function chart(data, days) {
      const ns = "http://www.w3.org/2000/svg";
      const create = (tag, attrs, text) => {
        const item = document.createElementNS(ns, tag);
        Object.entries(attrs).forEach(([k, v]) => item.setAttribute(k, v));
        if (text !== undefined) item.textContent = text;
        return item;
      };
      const lineStyle = series => ({ fill: "none", stroke: series.color, "stroke-width": 2.25,
        "stroke-dasharray": series.linePattern.dash, "stroke-linecap": "round", "stroke-linejoin": "round" });
      $("compareLegend").replaceChildren(...data.map(series => {
        const item = el("span", undefined, "compare-legend-item");
        item.setAttribute("role", "listitem"); item.dataset.spot = series.id;
        item.title = `Spot ${series.slot + 1}: linia ${series.linePattern.name}`;
        const sample = create("svg", { viewBox: "0 0 76 14", "aria-hidden": "true" });
        sample.append(create("line", { x1: 2, x2: 74, y1: 7, y2: 7, ...lineStyle(series) }));
        item.append(sample, el("span", `${series.slot + 1}. ${label(series.spot)}`));
        return item;
      }));
      const extent = chartExtent(data);
      if (!extent) {
        chartState("empty", "Brak ocen dla wybranych spotów. Wybierz inne miejsca lub odśwież prognozy.");
        return;
      }
      const { from, until } = extent, current = Math.floor(snapshotTime / 3600000) * 3600;
      const left = 45, right = 865;
      const x = time => from === until ? (left + right) / 2 : left + (time - from) * (right - left) / (until - from);
      const y = score => 260 - score * 23;
      const svg = document.createElementNS(ns, "svg");
      svg.setAttribute("viewBox", "0 0 900 310"); svg.setAttribute("role", "img");
      const stamp = time => date(time, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZoneName: "short" });
      svg.setAttribute("aria-label", `Godzinowe oceny 0–10 dla ${data.length} spotów, od ${stamp(from)} do ${stamp(until)}. Spoty rozróżnia kolor i wzór linii pokazany w legendzie. Zacienione tło oznacza historię modelową, pionowa linia — Teraz. Przerwy oznaczają brak danych.`);
      svg.dataset.from = from; svg.dataset.until = until;
      const add = (tag, attrs, text) => {
        const item = create(tag, attrs, text);
        svg.append(item); return item;
      };
      [[0, 3, "#fee2e2"], [3, 5, "#fff0dc"], [5, 6.5, "#fff6d5"], [6.5, 10, "#dcf3df"]].forEach(([lo, hi, fill]) =>
        add("rect", { x: left, y: y(hi), width: right - left, height: (hi - lo) * 23, fill, opacity: .65, class: "compare-score-band" }));
      for (let score = 0; score <= 10; score += 2) {
        add("line", { x1: left, x2: right, y1: y(score), y2: y(score), stroke: "#66756d", "stroke-opacity": .15 });
        add("text", { x: 30, y: y(score) + 4, "text-anchor": "end", "font-size": 12, fill: "#45534d" }, score);
      }
      if (from < current) {
        const historyWidth = from === until ? right - left : x(Math.min(until, current)) - left;
        add("rect", { x: left, y: 30, width: historyWidth, height: 230, fill: "#64748b", opacity: .16, "data-history": "true" });
        if (historyWidth >= 80) add("text", { x: left, y: 18, "font-size": 11, fill: "#45534d" }, "Historia");
      }
      if (current >= from && current <= until) {
        const nowX = x(current), anchor = nowX < left + 35 ? "start" : nowX > right - 35 ? "end" : "middle";
        add("line", { x1: nowX, x2: nowX, y1: 25, y2: 265, stroke: "#334155", "stroke-dasharray": "4 4", "data-now": current });
        add("text", { x: nowX, y: 18, "text-anchor": anchor, "font-size": 12, fill: "#334155" }, "Teraz");
      }
      const ticks = Array.from({ length: Math.floor((until - from) / 3600) + 1 }, (_, i) => from + i * 3600);
      days.forEach((d, i) => {
        const times = ticks.filter(time => dayKey(time) === d.key);
        if (!times.length) return;
        const dayLeft = x(times[0]), dayRight = x(Math.min(until, times.at(-1) + 3600));
        if (d.key === selectedDay) add("rect", { x: dayLeft, y: 265, width: dayRight - dayLeft, height: 3, fill: "#45534d" });
        const center = (dayLeft + dayRight) / 2;
        add("text", { x: center < left + 45 ? left : center > right - 45 ? right : center, y: i % 2 ? 305 : 285,
          "text-anchor": center < left + 45 ? "start" : center > right - 45 ? "end" : "middle", "font-size": 12, fill: "#45534d" }, d.label);
      });
      data.forEach(series => {
        const segments = chartSegments(series.hours);
        // One path per continuous run keeps the dash pattern flowing across hours.
        segments.forEach(segment => {
          const only = segment.length === 1, first = segment[0];
          const path = only
            ? `M${Math.max(left, x(first.time) - 3)} ${y(first.score)}H${Math.min(right, x(first.time) + 3)}`
            : segment.map((row, i) => `${i ? "L" : "M"}${x(row.time)} ${y(row.score)}`).join(" ");
          const line = add("path", { d: path, ...lineStyle(series), ...(only ? { "stroke-dasharray": "none" } : {}),
            class: only ? "compare-isolated-score" : "compare-series-line", "data-spot": series.id,
            "data-from": first.time, "data-until": segment.at(-1).time });
          line.append(create("title", {}, `${label(series.spot)} · linia ${series.linePattern.name}`));
        });
      });
      // Invisible hover targets preserve the hourly values without drawing point markers.
      data.forEach(series => series.hours.filter(row => Number.isFinite(row.score)).forEach(row => {
        const target = add("rect", { x: x(row.time) - 5, y: y(row.score) - 7, width: 10, height: 14, fill: "transparent",
          class: "compare-hour-target", "data-time": row.time, "data-score": row.score, "data-history": row.historical, "data-spot": series.id });
        target.append(create("title", {}, `${label(series.spot)}: ${row.score}/10 · ${stamp(row.time)}${row.historical ? " · historia modelowa" : ""}`));
      }));
      $("compareChart").replaceChildren(svg);
      $("compareChart").dataset.state = "ready";
    }
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
        const cell = el("th", label(series.spot)); cell.scope = "col";
        cell.style.color = series.color; cell.dataset.spot = series.id; header.append(cell);
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
    function ranking(data) {
      updateDaySelection();
      const sorted = data.map(d => ({ ...d, window: d.days.get(selectedDay) })).sort((a, b) =>
        Number(Boolean(b.window && !b.window.historical)) - Number(Boolean(a.window && !a.window.historical)) || (b.window?.score ?? -1) - (a.window?.score ?? -1));
      $("compareRanking").replaceChildren(...sorted.map((d, i) => {
        const card = el("a", undefined, "surf-window compare-card");
        const params = new URLSearchParams({ day: selectedDay });
        if (d.window) params.set("start", d.window.start);
        card.href = `#surf/${d.spot.id}?${params}`;
        card.addEventListener("click", event => {
          if (!event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && location.hash === card.hash) {
            event.preventDefault(); window.dispatchEvent(new Event("hashchange"));
          }
        });
        card.dataset.quality = tone(d.window?.score);
        const name = el("span", `${i + 1}. ${label(d.spot)}`, "compare-spot-link");
        name.style.setProperty("--spot-color", d.color);
        card.append(name);
        if (d.window) {
          card.append(el("strong", `${d.window.score.toLocaleString("pl-PL", { minimumFractionDigits: 1 })}/10`));
          if (!d.window.historical) card.append(el("span", M.scoreLabel(d.window.score)));
          card.append(el("small", d.window.kind === "history-average"
            ? `Średnia z dostępnych ocen historycznych · liczba godzin: ${d.window.hours} · ${hour(d.window.start)}–${hour(d.window.end)}`
            : `${hour(d.window.start)}–${hour(d.window.end)} · pewność: ${d.window.confidence}`));
          if (d.window.historical) card.append(el("small", d.window.archived ? "Zapisana wcześniejsza prognoza, nie pomiar ani rekomendacja na teraz." : "Wynik modelowy dla wcześniejszych godzin, nie pomiar ani rekomendacja na teraz."));
        } else card.append(el("strong", "Brak oceny"), el("small", problems.get(d.spot.id) || "Brak pełnego okna dziennego w dostępnych danych. Dalsze dni pojawią się wraz z kolejnymi obliczeniami SWAN."));
        card.append(el("small", "Zobacz szczegółową prognozę →")); return card;
      }));
      if (!sorted.length) $("compareRanking").append(el("p", "Brak ocen historycznych i pełnych trzygodzinnych okien dziennych dla tej daty. Wybierz inny dzień lub odśwież prognozy.", "surf-small"));
    }
    async function selectBest(force = false) {
      const token = ++autoGeneration;
      ++generation;
      manual = false;
      beginLoad("Sprawdzam prognozy wszystkich spotów…");
      let next = 0, completed = 0;
      const entries = [];
      // Only published files, four spots at a time; no mass requests to the weather provider.
      await Promise.all(Array.from({ length: 4 }, async () => {
        while (next < catalog.length && token === autoGeneration) {
          const spot = catalog[next++];
          if (force) cache.delete(spot.id);
          const rows = await fetchSpot(spot.id, force, true);
          entries.push({ id: spot.id, rows }); completed++;
          if (token === autoGeneration) {
            const message = `Sprawdzam prognozy dla dziennego rankingu: ${completed}/${catalog.length} spotów…`;
            $("compareStatus").textContent = message;
            if ($("compareLoadingDetail")) $("compareLoadingDetail").textContent = message;
          }
        }
      }));
      if (token !== autoGeneration) return;
      finishLoad(entries);
    }
    selectors(); resetComparison();
    $("compareAddSpot").addEventListener("click", () => {
      if (loading || choices.length >= MAX_SLOTS) return;
      choices = choose(catalog, [...choices, ""]);
      selectors(choices.length - 1); updateActions();
    });
    $("compareBest").addEventListener("click", () => selectBest(true));
    $("compareRefresh").addEventListener("click", () => {
      ++autoGeneration; manual = true; ids = choices.filter(Boolean); load(true);
    });
  });
})(typeof globalThis !== "undefined" ? globalThis : this);
