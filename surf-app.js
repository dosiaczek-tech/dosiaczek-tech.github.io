/* UI prognoz; API i obliczenia są oddzielone od odtwarzacza kamer. */
document.addEventListener("DOMContentLoaded", () => {
  "use strict";
  const $ = id => document.getElementById(id);
  const M = SurfModel, spots = SurfSpots;
  const byId = new Map(spots.map(s => [s.id, s]));
  const cameras = new Map(CAMERAS.map(c => [c.id, c]));
  const cameraSpot = new Map(spots.flatMap(s => s.cameras.map(id => [id, s])));
  const fmt = (v, digits = 1) => M.finite(v) ? v.toLocaleString("pl-PL", { maximumFractionDigits: digits, minimumFractionDigits: digits }) : "—";
  const date = (t, options) => new Intl.DateTimeFormat("pl-PL", { timeZone: "Europe/Warsaw", ...options }).format(new Date(t * 1000));
  const hour = t => date(t, { hour: "2-digit", minute: "2-digit" });
  const day = t => date(t, { day: "numeric", month: "short", weekday: "short" });
  const dayKey = t => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(t * 1000));
  const compass = d => M.finite(d) ? `${["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(d / 45) % 8]} ${Math.round(d)}°` : "—";
  function node(tag, text, className) {
    const el = document.createElement(tag);
    if (text !== undefined) el.textContent = text;
    if (className) el.className = className;
    return el;
  }
  function link(label, url) { const a = node("a", label); a.href = url; return a; }
  const quality = score => !M.finite(score) ? "Brak oceny" : score >= 70 ? "Obiecujące" : score >= 45 ? "Umiarkowane" : score >= 20 ? "Słabe" : "Bardzo słabe";
  const scoreNode = score => { const e = node("span", fmt(score, 0), "surf-score"); e.dataset.quality = score >= 70 ? "good" : score < 45 ? "poor" : "fair"; return e; };
  let currentSpot = null, loaded = null, bath = null, rows = [], selectedDay = null, generation = 0, active = false, mapLayer = null;
  let lastAttempt = 0;
  let spotMap = null;

  function populateSpots() {
    const region = $("surfRegion").value;
    const options = spots.filter(s => region === "all" || region === s.region);
    $("surfSpot").replaceChildren(...options.map(s => { const o = node("option", `${s.town} — ${s.name}`); o.value = s.id; return o; }));
    if (options.some(s => s.id === currentSpot?.id)) $("surfSpot").value = currentSpot.id;
    if (spotMap) spotMap.setRegion(region);
  }
  populateSpots();

  function cameraForecastLink(id) {
    const spot = cameraSpot.get(id);
    $("cameraSurfLink").hidden = !spot;
    if (spot) $("cameraSurfLink").href = `#surf/${spot.id}`;
  }
  window.addEventListener("camera:selected", event => cameraForecastLink(event.detail.id));
  cameraForecastLink(location.hash.slice(1));

  function setMap(layer = mapLayer) {
    const s = currentSpot;
    if (!s) return;
    $("windyLink").href = `https://www.windy.com/?waves,${s.lat},${s.lon},9`;
    $("windyWaves").setAttribute("aria-pressed", String(layer === "waves"));
    $("windyWind").setAttribute("aria-pressed", String(layer === "wind"));
    if (!layer) return;
    mapLayer = layer;
    const params = new URLSearchParams({ lat: s.lat, lon: s.lon, detailLat: s.lat, detailLon: s.lon, width: 1000, height: 420,
      zoom: 8, level: "surface", overlay: layer, product: "ecmwf", menu: "", message: "", marker: "true", calendar: "now", pressure: "", type: "map", location: "coordinates", detail: "", metricWind: "m/s", metricTemp: "°C" });
    $("windyFrame").src = `https://embed.windy.com/embed2.html?${params}`;
    $("windyFrame").hidden = false;
  }
  $("windyWaves").addEventListener("click", () => setMap("waves"));
  $("windyWind").addEventListener("click", () => setMap("wind"));

  function renderSpotNotes() {
    const s = currentSpot, body = $("surfLocalBody");
    $("surfLocalTitle").textContent = `${s.town} — ${s.community ? s.name : "orientacja plaży"}`;
    body.replaceChildren();
    body.append(node("p", `Od lądu ku morzu: ${compass(s.normal)}. Onshore: wiatr z okolic ${compass(s.normal)} (±45°). Offshore: z okolic ${compass((s.normal + 180) % 360)} (±45°). Pozostałe kierunki są boczne; poniżej 1,5 m/s traktujemy wiatr jako słaby.`, "surf-small"));
    const c = s.community;
    if (c) {
      const facts = node("div", undefined, "surf-spot-facts");
      for (const [label, text] of [["Punkt społecznościowy", c.originalName], ["Fale — opis autora", c.waveHints], ["Wiatr — opis autora", c.windHints], ["Charakter", c.character], ["Poziom surfingu", c.skill]]) {
        const p = node("p"); p.append(node("strong", `${label}: `), document.createTextNode(text)); facts.append(p);
      }
      body.append(facts, node("p", c.notes, "surf-small"));
      const citation = node("p", undefined, "surf-small");
      const a = link(c.source.title, c.source.url); a.target = "_blank"; a.rel = "noopener noreferrer";
      citation.append(document.createTextNode("Źródło: "), a, document.createTextNode(` · ${c.source.attribution}. Odczyt: ${c.source.checked}. ${c.source.status}`));
      body.append(citation, node("p", "Lokalne kierunki z opisu mogą dotyczyć fal po refrakcji i osłony przez konstrukcje. Nie nadpisują kierunku brzegu ani siły wiatru w modelu. Pobliski model regionalny może dawać podobną prognozę dla różnych peaków.", "surf-small"));
    } else body.append(node("p", "Poziom surfingu: nieokreślony. Sama łagodna prognoza nie jest klasyfikacją spotu dla początkujących. Orientacja brzegu jest przybliżona.", "surf-small"));
    if (!s.cameras.length) body.append(node("p", "Ten spot nie ma przypisanej kamery pokazującej dokładnie wskazany peak. Prognoza jest dostępna niezależnie od kamery.", "surf-small"));
  }

  function renderSequence(row) {
    const el = $("surfSequence"); el.replaceChildren();
    const sequence = row?.cleanup;
    const label = node("strong", sequence?.label || "Brak bieżących danych", "surf-sequence-label");
    label.dataset.state = sequence?.state || "unknown";
    el.append(label);
    if (sequence?.buildingHours) {
      const waveInfo = sequence.checkedModels ? `Utrzymanie odpowiedniej fali: ${sequence.waveSupport}/${row.members.length} modeli.` : "Utrzymanie fali nieocenione w tej fazie.";
      el.append(node("p", `Wcześniejszy onshore: ${sequence.buildingHours} h (${day(sequence.buildingStart)}, ${hour(sequence.buildingStart)} → ${day(sequence.buildingEnd)}, ${hour(sequence.buildingEnd)}). Kolejne godziny słabego offshore / ciszy: ${sequence.clearingHours}. ${waveInfo}`, "surf-small"));
    } else el.append(node("p", sequence?.state === "none" ? "W poprzednich 24 h nie wykryto co najmniej czterech kolejnych godzin mocniejszego onshore. Fala może jednak przyjść z dalszej części akwenu — brak tej sekwencji nie oznacza braku surfingu." : "Brak ciągłej historii lub kompletnych parametrów. Nie traktujemy luk w danych jak ciszy.", "surf-small"));
    if (row?.wind) el.append(node("p", `Aktualnie: wiatr z ${compass(row.wind.direction)}, ${fmt(row.wind.speed)} m/s — ${M.windRelative(row.wind, currentSpot) || "kierunek niepewny"} względem tej plaży.`, "surf-small"));
  }

  function renderChart() {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 1000 210"); svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "Porównanie wysokości znaczącej fal DWD i ECMWF na pięć dni. Wartości godzinowe poniżej.");
    const values = rows.flatMap(r => r.members.map(m => m.height)).filter(M.finite);
    const max = Math.max(1, Math.ceil(Math.max(0, ...values) * 2) / 2);
    const add = (tag, attrs, text) => { const e = document.createElementNS(ns, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); if (text) e.textContent = text; svg.append(e); };
    for (let i = 0; i <= 4; i++) {
      const y = 170 - i * 38;
      add("line", { x1: 48, x2: 980, y1: y, y2: y, stroke: "#dce3db" });
      add("text", { x: 2, y: y + 4, fill: "#647776", "font-size": 12 }, `${fmt(max * i / 4)} m`);
    }
    Object.keys(M.WAVE_MODELS).forEach((model, m) => {
      let path = "", connected = false;
      rows.forEach((r, i) => {
        const h = r.members.find(w => w.model === model)?.height;
        if (!M.finite(h)) { connected = false; return; }
        path += `${connected ? "L" : "M"}${48 + i / Math.max(1, rows.length - 1) * 932},${170 - h / max * 152} `;
        connected = true;
      });
      add("path", { d: path, stroke: m ? "#b57b42" : "#0b7169", "stroke-width": 2.5, fill: "none" });
    });
    rows.forEach((r, i) => { if (i % 24 === 0) add("text", { x: 48 + i / Math.max(1, rows.length - 1) * 932, y: 198, fill: "#647776", "font-size": 12 }, `${day(r.time)} ${hour(r.time)}`); });
    $("surfChart").replaceChildren(svg);
  }

  function renderHours() {
    const everyHour = $("surfHourly").checked;
    const localHour = time => Number(date(time, { hour: "2-digit", hourCycle: "h23" }));
    $("surfHours").replaceChildren(...rows.filter(r => dayKey(r.time) === selectedDay)
      .filter((r, i) => everyHour || i === 0 || localHour(r.time) % 3 === 0).map(r => {
        const tr = node("tr"); tr.dataset.night = String(!r.daylight);
        const cell = content => { const td = node("td"); td.append(typeof content === "string" ? document.createTextNode(content) : content); tr.append(td); };
        let end = r.time + 3600;
        // Granice 00/03/06… w czasie polskim, także przy zmianie czasu letniego.
        if (!everyHour) while (localHour(end) % 3 !== 0) end += 3600;
        end = Math.min(end, rows[rows.length - 1].time + 3600);
        const repeatedHour = dayKey(end) === dayKey(r.time) && hour(end) === hour(r.time);
        const withZone = time => date(time, { hour: "2-digit", minute: "2-digit", timeZoneName: "short" });
        cell(repeatedHour ? `${withZone(r.time)}–${withZone(end)}` : `${hour(r.time)}–${dayKey(end) !== dayKey(r.time) ? "24:00" : hour(end)}`);
        cell(scoreNode(r.score));
        const hs = r.members.map(m => m.height).filter(M.finite);
        cell(hs.length ? `${fmt(Math.min(...hs))}–${fmt(Math.max(...hs))} m` : "—");
        cell(`${fmt(r.period)} s`);
        cell(M.finite(r.powerKWm) ? `~${fmt(r.powerKWm, 2)} kW/m` : "—");
        cell(M.finite(r.energyKJm2) ? `~${fmt(r.energyKJm2, 2)} kJ/m²` : "—");
        cell(r.members.filter(m => M.finite(m.direction)).map(m => compass(m.direction)).join(" / ") || "—");
        cell(r.wind ? `${compass(r.wind.direction)} · ${fmt(r.wind.speed)} m/s` : "Brak wiatru");
        cell(r.members.find(m => m.rating)?.rating.windType || "—");
        const sequence = node("span", r.cleanup?.label || "—", "surf-sequence-cell"); sequence.dataset.state = r.cleanup?.state || "unknown";
        cell(sequence); cell(r.agreement);
        return tr;
      }));
    $("surfDays").querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.day === selectedDay)));
  }

  function renderBathymetry(now) {
    const el = $("surfBathymetry"); el.replaceChildren();
    if (!bath) { el.append(node("p", "Pobieranie sześciu próbek profilu dna z EMODnet…", "surf-small")); return; }
    const valid = bath.samples.filter(s => M.finite(s.depth));
    const profile = node("div", undefined, "bath-profile");
    const max = Math.max(1, ...valid.map(p => p.depth));
    bath.samples.forEach(p => {
      const col = node("div", undefined, "bath-point"); col.append(node("span", `${p.distance} m`));
      const bar = node("i"); bar.style.height = `${M.finite(p.depth) ? p.depth / max * 65 : 2}px`; col.append(bar, node("span", `${fmt(p.depth)} m`)); profile.append(col);
    });
    el.append(profile, node("p", "Odległość od punktu spotu → głębokość. Profil biegnie w kierunku normalnym do brzegu; punkt z mapy może leżeć już na wodzie.", "surf-small"));
    const local = now?.members.find(m => m.rating?.local && !m.rating.local.blocked)?.rating.local;
    if (local) el.append(node("p", `Szacowana wysokość fal przy brzegu: ${fmt(now.nearHeight)} m. ${local.breaking ? "Modelowe załamanie" : "Ostatni punkt profilu"}: około ${Math.round(local.distance)} m od punktu spotu, głębokość ${fmt(local.depth)} m. To nie jest dokładna wysokość fali, na której będziesz surfować.`, "surf-small"));
    else el.append(node("p", `${valid.length}/6 poprawnych próbek. ${bath.complete ? "Transformacja niedostępna dla bieżącego kierunku lub danych fal." : "Niepełny profil albo punkt na lądzie: nie stosujemy korekty dna do oceny."}`, "surf-small"));
    el.append(node("p", `${currentSpot.geometry} Dane pobrano ${day(bath.fetchedAt / 1000)}.`, "surf-small"));
  }

  function render() {
    if (!loaded?.marine || !active) return;
    rows = M.buildForecast(currentSpot, loaded.marine.data, loaded.weather?.data, bath).slice(0, 120);
    $("surfContent").hidden = false;
    const now = rows.find(r => r.time * 1000 <= Date.now() && r.time * 1000 > Date.now() - 3600000);
    const stale = loaded.marine.stale || loaded.weather?.stale;
    const stamps = [loaded.marine, loaded.weather].filter(Boolean).map(r => r.fetchedAt);
    const errors = [...loaded.errors, ...[loaded.marine, loaded.weather].filter(r => r?.error).map(r => r.error)];
    $("surfStatus").dataset.state = stale ? "stale" : errors.length ? "error" : "ready";
    $("surfStatus").textContent = `${stale ? "UWAGA: dane z pamięci, odświeżenie nie powiodło się. " : ""}Pobrano: ${stamps.map(t => `${day(t / 1000)} ${hour(t / 1000)}`).join(" / ")}. ${rows.length} godzin dostępnych. ${errors.join(" ")}`;
    $("surfSpotTitle").textContent = `${currentSpot.town} — ${currentSpot.name}`;
    $("surfSpotMeta").textContent = `${currentSpot.lat.toFixed(3)}°N, ${currentSpot.lon.toFixed(3)}°E · ekspozycja ${compass(currentSpot.normal)} · punkt fal 5 km w morze od punktu spotu · godziny polskie`;
    $("surfMapLink").href = `https://www.openstreetmap.org/?mlat=${currentSpot.lat}&mlon=${currentSpot.lon}#map=14/${currentSpot.lat}/${currentSpot.lon}`;
    const items = [
      [now ? `Potencjał · ${hour(now.time)}` : "Teraz — brak danych", `${fmt(now?.score, 0)} / 100`, `${quality(now?.score)} · ${now?.agreement || ""}`],
      ["Wysokość fal na morzu", `${fmt(now?.height)} m`, `Czas między falami: średnio ${fmt(now?.period)} s`],
      ["Wiatr przy plaży", `${fmt(now?.wind?.speed)} m/s`, `Z ${compass(now?.wind?.direction)} · porywy ${fmt(now?.wind?.gust)} m/s`],
      ["Wysokość fal przy brzegu — szacunek", `${fmt(now?.nearHeight)} m`, M.finite(now?.nearHeight) ? "Obliczenie uwzględniające dno i kierunek fal, nie pomiar" : "Brak danych do szacunku przy brzegu — oceniamy fale na morzu"],
      ["Moc fal na morzu — szacunek", M.finite(now?.powerKWm) ? `~${fmt(now.powerKWm, 2)} kW/m` : "—", M.finite(now?.powerKWm)
        ? `${now.powerModels}/2 modeli · ${M.finite(now.powerDepth) ? `uwzględniona głębokość ${fmt(now.powerDepth)} m` : "przybliżenie głębokiej wody"}` : "Potrzebna wysokość fal i czas między nimi"],
      ["Energia fal na morzu", M.finite(now?.energyKJm2) ? `~${fmt(now.energyKJm2, 2)} kJ/m²` : "—", M.finite(now?.energyKJm2)
        ? `Na m² powierzchni morza · ${now.energyModels}/2 modeli` : "Brak prognozy wysokości fal"]
    ];
    $("surfNow").replaceChildren(...items.map(([title, value, desc]) => { const el = node("div", undefined, "surf-metric"); el.append(node("small", title), node("strong", value), node("p", desc)); return el; }));
    $("surfFlags").replaceChildren(...(now?.flags || []).map(f => node("span", f)));
    renderSequence(now);
    const windows = M.bestWindows(rows.filter(r => r.time * 1000 >= Date.now()), 3, { cleanupOnly: $("surfCleanupOnly").checked });
    $("surfWindows").replaceChildren(...windows.map(w => {
      const button = node("button", undefined, "surf-window"); button.type = "button";
      button.append(node("span", `${day(w.start)} · ${hour(w.start)}–${hour(w.end)}`), node("strong", `${w.score}/100 · ${quality(w.score)}`), node("small", `Wysokość fal na morzu ~${fmt(w.height)} m · pokaż dzień →`));
      if (w.cleanupHours) button.append(node("small", `Wywiewka / ucichanie po nawianiu: ${w.cleanupHours}/3 h`));
      button.addEventListener("click", () => { selectedDay = dayKey(w.start); renderHours(); $("surfDays").scrollIntoView({ behavior: "smooth", block: "center" }); }); return button;
    }));
    if (!windows.length) $("surfWindows").append(node("p", $("surfCleanupOnly").checked ? "Brak pełnych trzygodzinnych okien wywiewki z utrzymującą się falą. Odznacz filtr, aby zobaczyć pozostałe okna surfingowe." : "Brak kompletnych dziennych okien z falami i wiatrem. Spróbuj odświeżyć prognozę.", "surf-small"));
    renderChart();
    const days = [...new Set(rows.map(r => dayKey(r.time)))];
    if (!days.includes(selectedDay)) selectedDay = days[0];
    $("surfDays").replaceChildren(...days.map(d => { const b = node("button", day(rows.find(r => dayKey(r.time) === d).time), "filter"); b.type = "button"; b.dataset.day = d; b.addEventListener("click", () => { selectedDay = d; renderHours(); }); return b; }));
    renderHours();
    $("surfModels").replaceChildren();
    const modelRow = (name, text) => { const el = node("div", undefined, "surf-model-row"); el.append(node("b", name), node("span", text)); $("surfModels").append(el); };
    for (const m of now?.members || []) modelRow(M.WAVE_MODELS[m.model], `${fmt(m.height)} m · ${fmt(m.period)} s · z ${compass(m.direction)} · moc ~${fmt(m.energetics.powerKWm, 2)} kW/m · energia ~${fmt(m.energetics.energyKJm2, 2)} kJ/m² · ${fmt(m.rating?.score, 0)}/100`);
    for (const m of now?.wind?.members || []) modelRow(M.WIND_MODELS[m.model], `${fmt(m.speed)} m/s · z ${compass(m.direction)}`);
    if (!now) modelRow("Bieżąca godzina", "Brak danych");
    renderBathymetry(now);
    $("surfCameras").replaceChildren(...currentSpot.cameras.filter(id => cameras.has(id)).map(id => link(`${cameras.get(id).name} · ${cameras.get(id).view} ↗`, `#${id}`)));
    if (!currentSpot.cameras.length) {
      $("surfCameras").append(node("p", "Brak kamery dla tego peaku.", "surf-small"));
      const nearby = byId.get(currentSpot.nearbySpot);
      if (nearby) {
        $("surfCameras").append(node("p", "Poniższe kamery pokazują sąsiedni odcinek wybrzeża, a nie dokładnie ten spot:", "surf-small"));
        $("surfCameras").append(...nearby.cameras.filter(id => cameras.has(id)).map(id => link(`W okolicy: ${cameras.get(id).name} · ${cameras.get(id).view} ↗`, `#${id}`)));
      }
    }
  }

  async function loadSpot(spot, force = false) {
    const token = ++generation;
    lastAttempt = Date.now();
    currentSpot = spot; loaded = null; bath = null; rows = []; selectedDay = null;
    if ($("surfRegion").value !== "all" && $("surfRegion").value !== spot.region) { $("surfRegion").value = "all"; populateSpots(); }
    $("surfSpot").value = spot.id;
    $("surfTab").href = `#surf/${spot.id}`;
    $("surfContent").hidden = true;
    $("surfRefresh").disabled = true;
    $("surfStatus").dataset.state = "loading";
    $("surfStatus").textContent = `Pobieram prognozę dla: ${spot.town}, ${spot.name}…`;
    document.title = `${spot.town} — prognoza surfingu | Nad morzem`;
    if (!spotMap && window.SurfSpotMap) {
      spotMap = SurfSpotMap.create({ spots, region: $("surfRegion").value, selectedId: spot.id,
        onSelect: id => { location.hash = `surf/${id}`; } });
    } else if (spotMap) {
      spotMap.resize();
      spotMap.select(spot.id);
    }
    renderSpotNotes();
    setMap();
    SurfAPI.bathymetry(spot).then(result => { if (token === generation && active) { bath = result; render(); } }).catch(() => { /* Forecast remains usable without the profile. */ });
    try {
      const result = await SurfAPI.forecasts(spot, force);
      if (token !== generation || !active) return;
      loaded = result;
      if (!result.marine) throw new Error(result.errors.join(" ") || "Prognoza fal jest chwilowo niedostępna.");
      render();
    } catch (error) {
      if (token !== generation || !active) return;
      $("surfStatus").dataset.state = "error";
      $("surfStatus").textContent = `Nie udało się pobrać prognozy. ${error.message} Możesz odświeżyć dane lub porównać mapę Windy poniżej.`;
    } finally { if (token === generation) $("surfRefresh").disabled = false; }
  }

  function route() {
    const next = location.hash.startsWith("#surf/");
    const changed = next !== active;
    active = next;
    $("cameraPanel").hidden = next; $("forecastPanel").hidden = !next;
    for (const [id, on] of [["camerasTab", !next], ["surfTab", next]]) {
      if (on) $(id).setAttribute("aria-current", "page"); else $(id).removeAttribute("aria-current");
    }
    if (changed) window.dispatchEvent(new CustomEvent("surf:tab", { detail: { tab: next ? "surf" : "cameras" } }));
    if (next) {
      const spot = byId.get(location.hash.slice(6));
      if (!spot) { location.replace("#surf/wladyslawowo"); return; }
      if (spot.id !== currentSpot?.id || changed) loadSpot(spot);
    } else {
      ++generation;
      $("windyFrame").removeAttribute("src"); $("windyFrame").hidden = true;
      if (cameras.has(location.hash.slice(1))) cameraForecastLink(location.hash.slice(1));
    }
  }
  $("surfSpot").addEventListener("change", () => { location.hash = `surf/${$("surfSpot").value}`; });
  $("surfRegion").addEventListener("change", () => { populateSpots(); if ($("surfSpot").value) location.hash = `surf/${$("surfSpot").value}`; });
  $("surfRefresh").addEventListener("click", () => { if (currentSpot) loadSpot(currentSpot, true); });
  $("surfHourly").addEventListener("change", renderHours);
  $("surfCleanupOnly").addEventListener("change", render);
  window.addEventListener("hashchange", route);
  // Odświeżamy tylko otwartą, widoczną zakładkę. Awaria nie wywołuje pętli zapytań.
  setInterval(() => {
    if (active && currentSpot && document.visibilityState === "visible" && Date.now() - lastAttempt >= 1800000) loadSpot(currentSpot);
  }, 60000);

  const covered = CAMERAS.filter(c => cameraSpot.has(c.id));
  $("surfCoverageTitle").textContent = `Zakres: ${spots.length} spotów / odcinków · ${covered.length} powiązanych kamer · ${spots.filter(s => s.community).length} opisów WestCoast`;
  const towns = [...new Set(CAMERAS.map(c => c.name))];
  $("surfCoverage").replaceChildren(...towns.sort((a, b) => a.localeCompare(b, "pl")).map(town => {
    const all = CAMERAS.filter(c => c.name === town), marine = all.filter(c => cameraSpot.has(c.id));
    const p = node("p"); p.append(node("strong", `${town}: `));
    p.append(document.createTextNode(marine.length ? `${marine.length}/${all.length} kamer z prognozą. ` : spots.some(s => s.town === town)
      ? "Prognoza dla osobnego spotu, bez bezpośrednio powiązanej kamery. " : "Bez prognozy — brak potwierdzonej kamery morskiej plaży. "));
    const omitted = all.filter(c => !cameraSpot.has(c.id));
    if (omitted.length) p.append(document.createTextNode(`Pozostałe (zatoka, port, miasto, jezioro lub kierunek niepotwierdzony): ${omitted.map(c => c.view).join("; ")}.`));
    return p;
  }));
  $("surfCoverage").append(node("h4", "Spoty dodatkowe bez bezpośredniej kamery"), ...spots.filter(s => !s.cameras.length).map(s => {
    const p = node("p"); p.append(link(`${s.town} — ${s.name}`, `#surf/${s.id}`)); return p;
  }));
  route();
});
