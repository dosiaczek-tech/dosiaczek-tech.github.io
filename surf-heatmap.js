/* Hourly coastal ratings of every spot in one grid: rows west to east, columns hour by hour. No interpolation or synthetic scores. */
(function (root) {
  "use strict";
  const zone = "Europe/Warsaw";
  const clockFormat = new Intl.DateTimeFormat("pl-PL", { timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const zoneFormat = new Intl.DateTimeFormat("pl-PL", { timeZone: zone, timeZoneName: "short" });
  const clock = time => clockFormat.format(new Date(time * 1000));
  const validScore = score => Number.isFinite(score) && score >= 0 && score <= 10;
  const tone = score => !validScore(score) ? "unknown" : score >= 9 ? "excellent" : score >= 8 ? "great"
    : score >= 6.5 ? "good" : score >= 5 ? "fair" : score >= 3 ? "weak" : score >= 1.5 ? "poor" : "bad";
  const orderedSpots = spots => [...spots].sort((a, b) => a.lon - b.lon || a.id.localeCompare(b.id));
  // Columns run from the current hour to the last hour any spot has a rating for; every real UTC hour gets one.
  function timeline(entries, now = Date.now()) {
    const first = Math.floor(now / 3600000) * 3600;
    let last = first - 3600;
    for (const scores of entries) for (const [time, score] of scores)
      if (time > last && time % 3600 === 0 && validScore(score)) last = time;
    return Array.from({ length: (last - first) / 3600 + 1 }, (_, i) => first + i * 3600);
  }
  // A view is the visible part of the grid on each axis, as fractions of the whole (0–1).
  const FULL = { x: { from: 0, to: 1 }, y: { from: 0, to: 1 } };
  // The cell under a point of the grid in the given view; points on the outer edge belong to the outer cells.
  function cellAt(x, y, width, height, columns, rows, view = FULL) {
    const index = (value, size, count, axis) => Math.max(0, Math.min(count - 1, Math.floor((axis.from + value / size * (axis.to - axis.from)) * count)));
    return { row: index(y, height, rows, view.y), column: index(x, width, columns, view.x) };
  }
  // One axis of a zoom or drag: the grid point that was under `startAt` (0–1 of the box) moves to `at`,
  // and the visible span shrinks by `factor`, never past `maxZoom` or the edges of the grid.
  function viewAxis(axis, startAt, at, factor, maxZoom) {
    const span = Math.min(1, Math.max(1 / maxZoom, (axis.to - axis.from) / factor));
    const from = Math.min(1 - span, Math.max(0, axis.from + startAt * (axis.to - axis.from) - at * span));
    return { from, to: from + span };
  }
  // The smallest move of one axis that brings tile `index` fully into view.
  function followAxis(axis, index, count) {
    const span = axis.to - axis.from, from = Math.min(index / count, Math.max(axis.from, (index + 1) / count - span));
    return from === axis.from ? axis : { from, to: from + span };
  }
  // The first and last tiles with their centre in view label the axis.
  function visibleEnds(axis, count) {
    const first = Math.min(count - 1, Math.max(0, Math.round(axis.from * count)));
    return [first, Math.max(first, Math.min(count - 1, Math.round(axis.to * count) - 1))];
  }
  // A selected cell keeps its colour, only in a darker shade.
  function shade(color, factor = .75) {
    const hex = /^#([\da-f]{6})$/i.exec(String(color).trim());
    if (!hex) return color;
    const value = parseInt(hex[1], 16);
    return `#${[16, 8, 0].map(shift => Math.round((value >> shift & 255) * factor).toString(16).padStart(2, "0")).join("")}`;
  }
  // The zone is named only where the clock repeats an hour, e.g. 02:00–02:00 CEST at the autumn change.
  function hourLabel(time) {
    const from = clock(time), repeated = from === clock(time - 3600) || from === clock(time + 3600);
    const name = repeated ? ` ${zoneFormat.formatToParts(new Date(time * 1000)).find(part => part.type === "timeZoneName").value}` : "";
    return `${from}–${clock(time + 3600)}${name}`;
  }
  // One spot's row of the grid from its coastal forecast rows: scores from the current hour on, the hours whose
  // wind models disagree, and what is missing. "Pokaż najlepsze" builds the same rows, so it can fill the grid too.
  function record(rows, forecast, simulation, now = Date.now()) {
    const ahead = rows.filter(row => row.time >= Math.floor(now / 3600000) * 3600);
    const issues = [];
    if (!forecast.weather) issues.push("Brak aktualnego wiatru.");
    if (!ahead.some(row => row.simulation)) issues.push("Brak aktualnej prognozy fal dla tego punktu.");
    if (forecast.weather?.stale || simulation.stale) issues.push("Dane z pamięci; ostatnie pobranie nie powiodło się.");
    if (simulation.refreshPending) issues.push("Trwa przeliczanie fal. Przeładuj stronę za chwilę, aby zobaczyć nowsze oceny.");
    if (simulation.refreshError) issues.push(simulation.refreshError);
    return { scores: new Map(ahead.filter(row => row.simulation && validScore(row.score)).map(row => [row.time, row.score])),
      disputed: new Set(ahead.filter(row => row.disputedWind).map(row => row.time)), issue: issues.join(" ") };
  }
  const FAILED = "Nie udało się pobrać prognozy. Przeładuj stronę, aby spróbować ponownie.";
  // Ratings of the whole coast, computed here or by "Pokaż najlepsze", are reused for 15 minutes, also after a reload.
  // Scores are kept hour by hour from the first rated hour, so the stored copy stays small. The session storage keeps
  // them across reloads with its own limit, which the forecast history in the local storage cannot fill.
  const STORE = "nad-morzem:heatmap-ratings-v1", STORE_TTL = 15 * 60000;
  let stored = null;
  function remember(records, snapshotTime, model) {
    const spots = {};
    for (const [id, { scores, disputed, issue }] of records) {
      const times = [...scores.keys()].sort((a, b) => a - b), from = times[0] ?? null;
      spots[id] = { from, scores: from === null ? [] : Array.from({ length: (times.at(-1) - from) / 3600 + 1 }, (_, i) => scores.get(from + i * 3600) ?? null),
        disputed: [...disputed], issue };
    }
    stored = { version: `${model.VERSION}|${model.SIMULATION_VERSION}`, snapshotTime, spots };
    try { sessionStorage.setItem(STORE, JSON.stringify(stored)); } catch { /* The copy in memory still works. */ }
  }
  function recall(model, now = Date.now()) {
    let value = stored;
    if (!value) try { value = JSON.parse(sessionStorage.getItem(STORE)); } catch { value = null; }
    const age = now - value?.snapshotTime;
    if (!value?.spots || value.version !== `${model.VERSION}|${model.SIMULATION_VERSION}` || !(age >= 0 && age < STORE_TTL)) return null;
    stored = value;
    return { snapshotTime: value.snapshotTime, records: new Map(Object.entries(value.spots).map(([id, spot]) => [id, {
      scores: new Map(spot.scores.map((score, i) => [spot.from + i * 3600, score]).filter(([, score]) => validScore(score))),
      disputed: new Set(spot.disputed), issue: spot.issue || "" }])) };
  }
  const api = { tone, orderedSpots, timeline, cellAt, viewAxis, followAxis, visibleEnds, shade, hourLabel, record, remember, recall, FAILED };
  if (typeof module !== "undefined") module.exports = api;
  else root.SurfHeatmap = api;
  if (typeof document === "undefined") return;
  document.addEventListener("DOMContentLoaded", () => {
    const $ = id => document.getElementById(id);
    if (!$("heatmapPanel")) return;
    const M = root.SurfModel, catalog = orderedSpots(root.SurfSpots), canvas = $("heatmapCanvas");
    const records = new Map(), colors = {};
    let generation = 0, loading = false, completed = 0, loadedAt = 0, snapshotTime = Date.now();
    let times = [], selected = null, view = FULL, drawnWidth = 0, pixelRatio = 1, frame = 0, fittedAxis = "";
    const active = () => location.hash.startsWith("#heatmap");
    const scoreText = score => score.toLocaleString("pl-PL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    const dateFormat = new Intl.DateTimeFormat("pl-PL", { timeZone: zone, weekday: "short", day: "numeric", month: "short" });
    const date = time => dateFormat.format(new Date(time * 1000));
    const moment = time => `${date(time)} · ${clock(time)}`;
    const position = cell => ({ row: catalog.findIndex(spot => spot.id === cell.id), column: times.indexOf(cell.time) });
    // Rows stay a few pixels tall, so the whole coast fits on a phone screen; the hours share the full width.
    const rowHeight = width => Math.max(4, Math.min(6, Math.floor(width / catalog.length)));
    // Zooming stops once a tile is 44 px, a comfortable size for a finger.
    const limits = () => ({ x: Math.max(1, 44 * times.length / canvas.clientWidth), y: Math.max(1, 44 * catalog.length / canvas.clientHeight) });
    const edge = (index, count, axis, size) => Math.round((index / count - axis.from) / (axis.to - axis.from) * size);
    function el(tag, text, className) {
      const node = document.createElement(tag);
      if (text !== undefined) node.textContent = text;
      if (className) node.className = className;
      return node;
    }
    function paint(row, column, context = canvas.getContext("2d")) {
      const spot = catalog[row], time = times[column];
      const color = colors[tone(records.get(spot.id)?.scores.get(time))];
      const x = edge(column, times.length, view.x, canvas.width), y = edge(row, catalog.length, view.y, canvas.height);
      const width = edge(column + 1, times.length, view.x, canvas.width) - x, height = edge(row + 1, catalog.length, view.y, canvas.height) - y;
      // Tiles enlarged by zooming are separated by a thin gap, so each one can be told apart.
      const gap = Math.round(pixelRatio);
      context.fillStyle = selected?.id === spot.id && selected.time === time ? shade(color) : color;
      context.fillRect(x, y, width >= 8 * pixelRatio ? width - gap : width, height >= 8 * pixelRatio ? height - gap : height);
    }
    function draw() {
      frame = 0;
      if (!canvas.clientWidth || !times.length) return;
      if (canvas.clientWidth !== drawnWidth) {
        const width = canvas.clientWidth, height = rowHeight(width) * catalog.length;
        drawnWidth = width; pixelRatio = root.devicePixelRatio || 1;
        canvas.style.height = `${height}px`;
        canvas.width = Math.round(width * pixelRatio); canvas.height = Math.round(height * pixelRatio);
      }
      // The legend carries the colour of every score band.
      for (const item of $("heatmapLegend").children) colors[item.dataset.quality] ||= getComputedStyle(item).getPropertyValue("--rating-bg").trim();
      const context = canvas.getContext("2d");
      context.clearRect(0, 0, canvas.width, canvas.height);
      const rows = [Math.floor(view.y.from * catalog.length), Math.min(catalog.length, Math.ceil(view.y.to * catalog.length))];
      const columns = [Math.floor(view.x.from * times.length), Math.min(times.length, Math.ceil(view.x.to * times.length))];
      for (let row = rows[0]; row < rows[1]; row++) for (let column = columns[0]; column < columns[1]; column++) paint(row, column, context);
      // The axes name the first and last spot and hour in view.
      const [top, bottom] = visibleEnds(view.y, catalog.length), [first, last] = visibleEnds(view.x, times.length);
      for (const [id, spot] of [["heatmapWest", catalog[top]], ["heatmapEast", catalog[bottom]]]) {
        const label = $(id);
        label.title = `${spot.town} — ${spot.name}`;
        // Each word is its own box: in a vertical name a space would leave a whole letter's height empty.
        if (label.dataset.town !== spot.town) { label.dataset.town = spot.town; label.replaceChildren(...spot.town.split(" ").map(word => el("span", word))); }
      }
      $("heatmapStart").textContent = moment(times[first]); $("heatmapEnd").textContent = moment(times[last]);
      fitSpotAxis();
    }
    // Names too long for the grid share one smaller font instead of being cut; a gap keeps the two apart.
    // Measured on the device, so a larger system font or text size is taken into account.
    function fitSpotAxis() {
      const west = $("heatmapWest"), east = $("heatmapEast"), axis = west.parentElement, free = canvas.clientHeight - 16;
      const key = `${west.dataset.town}|${east.dataset.town}|${free}`;
      if (key === fittedAxis || free <= 0) return;
      fittedAxis = key;
      axis.style.fontSize = "";
      const used = () => west.getBoundingClientRect().height + east.getBoundingClientRect().height;
      let size = parseFloat(getComputedStyle(axis).fontSize);
      for (let step = 0; step < 4 && used() > free; step++) {
        size = Math.floor(size * free / used() * 10) / 10;
        axis.style.fontSize = `${size}px`;
      }
    }
    const redraw = () => { frame ||= requestAnimationFrame(draw); };
    function setView(next) {
      view = next.x.from <= 0 && next.x.to >= 1 && next.y.from <= 0 && next.y.to >= 1 ? FULL : next;
      // The button keeps its place in the legend bar, so the grid below never jumps when it appears.
      $("heatmapZoomReset").disabled = view === FULL;
      redraw();
    }
    function showDetail() {
      const detail = $("heatmapDetail"), spot = selected && catalog.find(item => item.id === selected.id);
      if (!spot) { detail.replaceChildren(el("p", "Dotknij pola na mapie, aby zobaczyć ocenę, dzień i godzinę. Rozsuń na mapie dwa palce, aby ją przybliżyć.", "surf-small")); return; }
      const record = records.get(spot.id), score = record?.scores.get(selected.time) ?? null;
      const link = el("a", undefined, "surf-window heatmap-pick");
      link.href = `#surf/${spot.id}?time=${selected.time}`;
      link.dataset.quality = tone(score);
      link.append(el("span", `${date(selected.time)} · ${hourLabel(selected.time)}`),
        el("strong", score === null ? "Brak oceny" : `${scoreText(score)}/10 · ${M.scoreLabel(score)}`),
        el("small", `${spot.town} — ${spot.name}`));
      if (record?.disputed?.has(selected.time)) link.append(el("small", "Niska pewność: modele wiatru wskazują różne kierunki, więc to mediana ocen dla wiatru z każdego modelu."));
      if (record?.issue) link.append(el("small", record.issue));
      link.append(el("small", "Otwórz w prognozie godzinowej →", "heatmap-pick-action"));
      detail.replaceChildren(link);
    }
    function select(row, column, follow = false) {
      const previous = selected && position(selected);
      selected = { id: catalog[row].id, time: times[column] };
      // Keys may leave the zoomed part of the grid; the view then follows the selected tile.
      const next = follow ? { x: followAxis(view.x, column, times.length), y: followAxis(view.y, row, catalog.length) } : view;
      if (next.x !== view.x || next.y !== view.y) setView(next);
      else {
        if (previous && previous.row >= 0 && previous.column >= 0) paint(previous.row, previous.column);
        paint(row, column);
      }
      showDetail();
    }
    function render() {
      if (selected && position(selected).column < 0) selected = null;
      $("heatmapChart").hidden = !times.length;
      if (times.length) {
        const [west, east] = [catalog[0], catalog.at(-1)];
        canvas.setAttribute("aria-label", `Mapa cieplna ocen. Wiersze: ${catalog.length} spotów od zachodu (${west.town}) do wschodu (${east.town}). Kolumny: godziny od ${moment(times[0])} do ${moment(times.at(-1))}. Strzałki wybierają pole, Enter otwiera prognozę godzinową.`);
      }
      draw();
      showDetail();
    }
    function status() {
      const withScores = [...records.values()].filter(record => record.scores.size).length;
      const warnings = [...records.values()].filter(record => record.issue).length;
      $("heatmapStatus").textContent = `${loading ? `Pobieranie ${completed}/${catalog.length} spotów… ` : ""}Oceny dostępne dla ${withScores}/${catalog.length} spotów.${!loading && !withScores ? " Brak ocen — przeładuj stronę za chwilę." : ""}${warnings ? ` Dla ${warnings} spotów są braki lub ostrzeżenia; dotknij pola, aby poznać szczegóły.` : ""}${!loading && loadedAt ? ` Sprawdzono o ${clock(loadedAt / 1000)}.` : ""}`;
      $("heatmapProgress").max = catalog.length; $("heatmapProgress").value = completed;
      $("heatmapProgress").hidden = !loading;
      $("heatmapLoading").hidden = !loading;
      $("heatmapResults").hidden = loading;
    }
    async function load(force = false) {
      const token = ++generation;
      // Ratings of the whole coast from the last 15 minutes (here or from "Pokaż najlepsze") show at once.
      const saved = !force && recall(M);
      if (saved && catalog.every(spot => saved.records.has(spot.id))) {
        loading = false; completed = catalog.length; loadedAt = saved.snapshotTime; snapshotTime = Date.now();
        records.clear(); for (const spot of catalog) records.set(spot.id, saved.records.get(spot.id));
        setView(FULL);
        times = timeline([...records.values()].map(record => record.scores), snapshotTime);
        status(); render();
        return;
      }
      loading = true; completed = 0; loadedAt = 0; snapshotTime = Date.now(); records.clear(); setView(FULL);
      status();
      // The whole coast in parts, west to east like the rows; each spot waits only for its part.
      root.SurfAPI.coast(force);
      let index = 0;
      await Promise.all(Array.from({ length: 4 }, async () => {
        while (index < catalog.length && token === generation && active()) {
          const spot = catalog[index++];
          let entry = { scores: new Map(), disputed: new Set(), issue: FAILED };
          try {
            const [forecast, simulation] = await root.SurfAPI.coastal(spot, force);
            entry = record(M.buildCoastalForecast(spot, forecast.weather?.data, simulation, snapshotTime, { historyHours: 0 }), forecast, simulation, snapshotTime);
          } catch { /* The spot keeps the failure note. */ }
          if (token !== generation || !active()) return;
          records.set(spot.id, entry); completed++;
          status();
        }
      }));
      if (token !== generation || !active()) return;
      loading = false; loadedAt = Date.now();
      times = timeline([...records.values()].map(record => record.scores), snapshotTime);
      remember(records, snapshotTime, M);
      status();
      render();
    }
    // Two fingers zoom and move the grid, the mouse drags it. One finger taps a tile or scrolls the page;
    // sideways it moves a zoomed grid through the hours.
    const pointers = new Map();
    let gesture = null, dragged = false;
    function startGesture() {
      const points = [...pointers.values()], box = canvas.getBoundingClientRect();
      const x = points.reduce((sum, p) => sum + p.x, 0) / points.length, y = points.reduce((sum, p) => sum + p.y, 0) / points.length;
      gesture = { view, box, x, y, at: { x: (x - box.left) / box.width, y: (y - box.top) / box.height },
        distance: points.length > 1 ? Math.max(20, Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y)) : null };
    }
    canvas.addEventListener("pointerdown", event => {
      if (!times.length || (event.pointerType === "mouse" && event.button !== 0)) return;
      if (!pointers.size) dragged = false;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      canvas.setPointerCapture?.(event.pointerId);
      startGesture();
    });
    canvas.addEventListener("pointermove", event => {
      if (!gesture || !pointers.has(event.pointerId)) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const points = [...pointers.values()], { box } = gesture;
      const x = points.reduce((sum, p) => sum + p.x, 0) / points.length, y = points.reduce((sum, p) => sum + p.y, 0) / points.length;
      // A tap may wobble a little; only a real move drags the grid.
      if (!dragged && points.length < 2 && Math.hypot(x - gesture.x, y - gesture.y) < 8) return;
      dragged = true;
      const factor = gesture.distance && points.length > 1 ? Math.max(20, Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y)) / gesture.distance : 1;
      const limit = limits(), vertical = points.length > 1 || event.pointerType === "mouse";
      setView({ x: viewAxis(gesture.view.x, gesture.at.x, (x - box.left) / box.width, factor, limit.x),
        y: vertical ? viewAxis(gesture.view.y, gesture.at.y, (y - box.top) / box.height, factor, limit.y) : gesture.view.y });
    });
    const endPointer = event => {
      if (!pointers.delete(event.pointerId)) return;
      if (pointers.size) startGesture(); else gesture = null;
    };
    ["pointerup", "pointercancel", "lostpointercapture"].forEach(type => canvas.addEventListener(type, endPointer));
    // Two fingers belong to the grid: the page must not scroll or zoom under them.
    for (const type of ["touchstart", "touchmove"]) canvas.addEventListener(type, event => { if (event.touches.length > 1) event.preventDefault(); }, { passive: false });
    // The wheel zooms around the pointer, with or without Ctrl (a touchpad pinch is Ctrl + wheel); a sideways
    // swipe moves a zoomed grid through the hours. Scrolling down over the whole grid still scrolls the page past it.
    canvas.addEventListener("wheel", event => {
      if (!times.length) return;
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? innerHeight : 1;
      const dx = event.deltaX * unit, dy = event.deltaY * unit;
      const box = canvas.getBoundingClientRect(), limit = limits();
      if (Math.abs(dx) > Math.abs(dy)) {
        if (view === FULL) return;
        event.preventDefault();
        setView({ x: viewAxis(view.x, dx / box.width, 0, 1, limit.x), y: view.y });
        return;
      }
      if (dy > 0 && view === FULL) return;
      event.preventDefault();
      const x = (event.clientX - box.left) / box.width, y = (event.clientY - box.top) / box.height, factor = Math.exp(-dy / 300);
      setView({ x: viewAxis(view.x, x, x, factor, limit.x), y: viewAxis(view.y, y, y, factor, limit.y) });
    }, { passive: false });
    canvas.addEventListener("click", event => {
      if (!times.length || dragged) return;
      const box = canvas.getBoundingClientRect();
      const cell = cellAt(event.clientX - box.left, event.clientY - box.top, box.width, box.height, times.length, catalog.length, view);
      select(cell.row, cell.column);
    });
    $("heatmapZoomReset").addEventListener("click", () => { setView(FULL); canvas.focus({ preventScroll: true }); });
    canvas.addEventListener("keydown", event => {
      if (!times.length) return;
      if (event.key === "Enter" && selected) { event.preventDefault(); $("heatmapDetail").querySelector("a").click(); return; }
      // Page keys move by a day; without a selection the first key picks the top-left cell.
      const steps = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1], PageUp: [0, -24], PageDown: [0, 24], Home: [0, -Infinity], End: [0, Infinity] };
      const step = steps[event.key];
      if (!step) return;
      event.preventDefault();
      const at = selected ? position(selected) : { row: 0, column: 0 }, move = selected ? step : [0, 0];
      const clamp = (value, count) => Math.max(0, Math.min(count - 1, value));
      select(clamp(at.row + move[0], catalog.length), clamp(at.column + move[1], times.length), true);
    });
    if (root.ResizeObserver) new ResizeObserver(() => { if (canvas.clientWidth && canvas.clientWidth !== drawnWidth) redraw(); }).observe(canvas);
    for (const [value, label] of [[0, "0–1,4"], [1.5, "1,5–2,9"], [3, "3–4,9"], [5, "5–6,4"], [6.5, "6,5–7,9"], [8, "8–8,9"], [9, "9–10"], [null, "Brak danych"]]) {
      const item = el("span", label); item.dataset.quality = tone(value); $("heatmapLegend").append(item);
    }
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
