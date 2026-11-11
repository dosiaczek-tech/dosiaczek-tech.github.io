/* UI prognoz; API i obliczenia są oddzielone od odtwarzacza kamer. */
document.addEventListener("DOMContentLoaded", () => {
  "use strict";
  const $ = id => document.getElementById(id);
  const M = SurfModel, spots = SurfSpots;
  const byId = new Map(spots.map(s => [s.id, s]));
  const cameras = new Map(CAMERAS.map(c => [c.id, c]));
  const cameraSpot = new Map(spots.flatMap(s => s.cameras.map(id => [id, s])));
  // One number formatter per precision; toLocaleString would build a new one for every table cell.
  const numberFormats = new Map();
  const fmt = (v, digits = 1) => {
    if (!M.finite(v)) return "—";
    if (!numberFormats.has(digits)) numberFormats.set(digits, new Intl.NumberFormat("pl-PL", { maximumFractionDigits: digits, minimumFractionDigits: digits }));
    return numberFormats.get(digits).format(v);
  };
  const windKnots = speed => `${fmt(M.finite(speed) ? speed * 3600 / 1852 : null)} knts`;
  // Formatters are costly to build and the hourly table formats hundreds of columns: create each one once.
  const formats = new Map();
  const date = (t, options) => {
    const key = JSON.stringify(options);
    if (!formats.has(key)) formats.set(key, new Intl.DateTimeFormat("pl-PL", { timeZone: "Europe/Warsaw", ...options }));
    return formats.get(key).format(new Date(t * 1000));
  };
  const hour = t => date(t, { hour: "2-digit", minute: "2-digit" });
  const day = t => date(t, { day: "numeric", month: "short", weekday: "short" });
  const dayKeyFormat = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw", year: "numeric", month: "2-digit", day: "2-digit" });
  const dayKey = t => dayKeyFormat.format(new Date(t * 1000));
  const compass = d => M.finite(d) ? `${["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(d / 45) % 8]} ${Math.round(d)}°` : "—";
  function node(tag, text, className) {
    const el = document.createElement(tag);
    if (text !== undefined) el.textContent = text;
    if (className) el.className = className;
    return el;
  }
  function link(label, url) { const a = node("a", label); a.href = url; return a; }
  const quality = M.scoreLabel;
  const scoreTone = score => !M.finite(score) ? "unknown" : score >= 9 ? "excellent" : score >= 8 ? "great"
    : score >= 6.5 ? "good" : score >= 5 ? "fair" : score >= 3 ? "weak" : score >= 1.5 ? "poor" : "bad";
  const scoreNode = score => { const e = node("span", `${fmt(score, 1)}/10`, "surf-score"); e.title = quality(score); e.dataset.quality = scoreTone(score); return e; };
  let currentSpot = null, loaded = null, rows = [], generation = 0, active = false, loading = false;
  let visibleTab = null, scrollToTabTop = false;
  let lastAttempt = 0;
  let spotMap = null, windMap = null;
  let windyLayer = "waves";
  const windyTabs = Array.from($("windyTabs").querySelectorAll("[data-layer]"));
  let simulation = null, simulationTime = null, profileRow = null;
  let simulationRefreshTimer = null;
  let conditions = null;
  let sessionRequest = null, chosenSession = null, sessionScroll = false, hourScroll = false;
  let searchResults = [], searchIndex = -1, searchEditing = false, acceptedSearchId = null;
  const hoursViewport = $("surfHoursScroll"), hoursTable = $("surfHoursTable");
  let hoursViewKey = null, hoursSelectedTime = null, hoursDataKey = null;
  let hoursColumns = [], hoursVisibleDay = null, hoursDayPages = 1;
  let hoursVisibleTime = null, hoursVisiblePart = null;
  const hoursDayButtons = new Map();
  const hoursDayPartTargets = new Map(), hoursPartButtons = new Map();
  for (const part of SurfHourly.DAY_PARTS) {
    const button = node("button", part.label, "filter surf-day-part");
    button.type = "button"; button.dataset.part = part.key; button.disabled = true;
    button.setAttribute("aria-pressed", "false"); button.setAttribute("aria-controls", "surfHoursScroll");
    button.addEventListener("click", () => {
      const target = hoursDayPartTargets.get(hoursVisibleDay)?.find(item => item.key === part.key)?.time;
      if (M.finite(target)) {
        revealHoursTime(target, true);
        hoursVisiblePart = part.key; updateDayPartControls();
      }
    });
    hoursPartButtons.set(part.key, button); $("surfDayParts").append(button);
  }
  SurfTableDrag.attach(hoursViewport, hoursTable);
  SurfProfilePicker.attach($("surfProfileTime"));

  function populateSpots() {
    // Nothing is preselected. The empty option stays selectable, so an opened list can be left without choosing a spot.
    const prompt = node("option", "Wybierz spot…"); prompt.value = "";
    $("surfSpot").replaceChildren(prompt, ...SurfSearch.groupWestToEast(spots).map(group => {
      const el = document.createElement("optgroup"); el.label = group.town;
      el.append(...group.spots.map(s => { const option = node("option", `${s.town} — ${s.name}`); option.value = s.id; return option; }));
      return el;
    }));
    $("surfSpot").value = "";
  }
  function closeSuggestions() {
    $("surfSuggestions").hidden = true;
    $("surfSpotSearch").setAttribute("aria-expanded", "false");
    $("surfSpotSearch").removeAttribute("aria-activedescendant");
  }
  function clearSpotSearch() {
    $("surfSpotSearch").value = "";
    searchResults = []; searchIndex = -1; searchEditing = false; acceptedSearchId = null;
    $("surfSuggestions").replaceChildren(); closeSuggestions();
  }
  function highlightSuggestion() {
    $("surfSuggestions").querySelectorAll('[role="option"]').forEach((el, i) => el.setAttribute("aria-selected", String(i === searchIndex)));
    const el = $("surfSuggestions").children[searchIndex];
    if (el && !$("surfSuggestions").hidden) {
      $("surfSpotSearch").setAttribute("aria-activedescendant", el.id);
      el.scrollIntoView({ block: "nearest" });
    }
  }
  function acceptSuggestion(index, focus = true) {
    const result = searchResults[index];
    if (!result) return;
    const s = result.spot;
    $("surfSpot").value = s.id;
    $("surfSpotSearch").value = `${s.town} — ${s.name}`;
    searchEditing = false; acceptedSearchId = s.id;
    searchResults = []; searchIndex = -1;
    closeSuggestions(); updateChoice();
    if (focus) $("surfSpotSearch").focus({ preventScroll: true });
  }
  function updateSearch() {
    const query = $("surfSpotSearch").value;
    searchEditing = Boolean(query.trim()); acceptedSearchId = null;
    searchResults = SurfSearch.search(spots, query);
    searchIndex = searchResults.length ? 0 : -1;
    $("surfSuggestions").replaceChildren(...searchResults.map((result, i) => {
      const s = result.spot, option = node("button", `${s.town} — ${s.name}`, "surf-suggestion");
      option.type = "button"; option.id = `surfSuggestion-${i}`; option.dataset.spot = s.id;
      option.setAttribute("role", "option"); option.setAttribute("aria-selected", String(i === 0)); option.tabIndex = -1;
      option.addEventListener("click", () => acceptSuggestion(i));
      return option;
    }));
    $("surfSuggestions").hidden = !searchResults.length;
    $("surfSpotSearch").setAttribute("aria-expanded", String(searchResults.length > 0));
    if (searchResults.length) $("surfSpotSearch").setAttribute("aria-activedescendant", "surfSuggestion-0");
    else $("surfSpotSearch").removeAttribute("aria-activedescendant");
    if (searchResults[0]?.strong) $("surfSpot").value = searchResults[0].spot.id;
    if (!searchEditing && currentSpot) $("surfSpot").value = currentSpot.id;
    updateChoice();
  }
  function updateChoice() {
    const choice = byId.get($("surfSpot").value);
    const pending = choice && choice.id !== currentSpot?.id;
    const uncertain = searchEditing && !searchResults[0]?.strong;
    $("surfChoiceHint").hidden = !pending && !searchEditing;
    $("surfChoiceHint").textContent = uncertain
      ? searchResults.length ? "Brak pewnego dopasowania. Pokazuję najbardziej podobne nazwy — wybierz podpowiedź lub spot z listy." : "Wpisz co najmniej dwa znaki albo wybierz spot z listy."
      : searchEditing ? `Najlepsze dopasowanie: ${choice.town} — ${choice.name}. Możesz wybrać inną podpowiedź lub kliknąć „Pokaż prognozę”.`
      : pending ? `Wybrano: ${choice.town} — ${choice.name}. Kliknij „Pokaż prognozę”, aby otworzyć ten spot.` : "";
    $("surfShowForecast").disabled = !choice || uncertain || (loading && !pending);
  }
  populateSpots();

  function cameraForecastLink(id) {
    const spot = cameraSpot.get(id);
    $("cameraSurfLink").hidden = !spot;
    if (spot) $("cameraSurfLink").href = `#surf/${spot.id}`;
  }
  window.addEventListener("camera:selected", event => cameraForecastLink(event.detail.id));
  cameraForecastLink(location.hash.slice(1));

  function setMap() {
    const s = currentSpot;
    if (!s) return;
    const subject = windyLayer === "wind" ? "wiatru" : "fal";
    $("windyTitle").textContent = `Mapa ${subject} — Windy`;
    $("windyLink").href = `https://www.windy.com/?${windyLayer},${s.lat},${s.lon},9`;
    $("windyFrame").title = `Mapa ${subject} Windy: ${s.town} — ${s.name}`;
    for (const tab of windyTabs) {
      const selected = tab.dataset.layer === windyLayer;
      tab.setAttribute("aria-selected", String(selected)); tab.tabIndex = selected ? 0 : -1;
      if (selected) $("windyPanel").setAttribute("aria-labelledby", tab.id);
    }
    const params = new URLSearchParams({ type: "map", location: "coordinates", lat: s.lat, lon: s.lon,
      detailLat: s.lat, detailLon: s.lon, zoom: 8, level: "surface", overlay: windyLayer,
      product: windyLayer === "waves" ? "ecmwfWaves" : "ecmwf", marker: "true", metricWind: "kt", metricTemp: "°C", metricRain: "mm" });
    const url = `https://embed.windy.com/embed.html?${params}`;
    if ($("windyFrame").getAttribute("src") !== url) $("windyFrame").src = url;
  }
  for (const [index, tab] of windyTabs.entries()) {
    tab.addEventListener("click", () => {
      if (windyLayer === tab.dataset.layer) return;
      windyLayer = tab.dataset.layer; setMap();
    });
    tab.addEventListener("keydown", event => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const next = event.key === "Home" ? 0 : event.key === "End" ? windyTabs.length - 1
        : event.key === "ArrowRight" ? (index + 1) % windyTabs.length
        : event.key === "ArrowLeft" ? (index + windyTabs.length - 1) % windyTabs.length : null;
      if (next === null) return;
      event.preventDefault(); windyTabs[next].focus(); windyTabs[next].click();
    });
  }

  function renderSpotNotes() {
    const s = currentSpot, body = $("surfLocalBody");
    $("surfLocalTitle").textContent = s.community ? `${s.town} — ${s.name}` : `Orientacja plaży dla spotu ${s.town}`;
    body.replaceChildren();
    body.append(node("p", `Od lądu ku morzu: ${compass(s.normal)}. Onshore: wiatr z okolic ${compass(s.normal)} (±22,5°). Offshore: z okolic ${compass((s.normal + 180) % 360)} (±22,5°). Pomiędzy nimi rozróżniamy cross-on (boczny do brzegu), cross i cross-off (boczny od brzegu). Poniżej ok. 3 knts wiatr jest słaby. Pod komórkami fal pokazujemy dodatkowo wiatr względem kierunku samej fali.`, "surf-small"));
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
    if (row?.wind) el.append(node("p", `Aktualnie: wiatr z ${compass(row.wind.direction)}, ${windKnots(row.wind.speed)} — ${M.windRelative(row.wind, currentSpot) || "kierunek niepewny"} względem tej plaży.`, "surf-small"));
  }

  function renderConditionsStatus() {
    if (!active || !currentSpot) return;
    const sources = [["Pogoda i słońce", conditions?.weather], ["Woda", conditions?.sea]].filter(([, source]) => source);
    const stale = sources.some(([, source]) => source.stale);
    const status = $("surfWeatherStatus");
    status.dataset.state = !conditions ? "loading" : stale ? "stale" : conditions.errors.length ? "error" : "ready";
    status.textContent = !conditions ? "Pobieram pogodę dla wybranego spotu…" : [
      ...sources.map(([label, source]) => `${label}: ${source.stale ? "dane z pamięci — odświeżenie nie powiodło się; " : ""}pobrano ${day(source.fetchedAt / 1000)} ${hour(source.fetchedAt / 1000)}.`),
      ...conditions.errors
    ].join(" ");
  }

  function scrollToForecastDay(value) {
    const column = hoursColumns.find(cell => cell.dataset.day === value);
    if (column) revealHoursTime(Number(column.dataset.time), true);
  }

  function renderChart() {
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 1000 210"); svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "Wysokość fal przy spocie: ostatnie 24 godziny modelowe i prognoza na 14 dni, do 500 metrów od brzegu");
    const values = rows.map(r => r.simulation?.height).filter(M.finite);
    if (!values.length) { $("surfChart").replaceChildren(node("p", "Brak potwierdzonej prognozy dla strefy do 500 m od brzegu. Wykres pojawi się po poprawnym przeliczeniu tego spotu.", "surf-small")); return; }
    const max = Math.max(1, Math.ceil(Math.max(0, ...values) * 2) / 2);
    const add = (tag, attrs, text) => { const e = document.createElementNS(ns, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); if (text) e.textContent = text; svg.append(e); };
    for (let i = 0; i <= 4; i++) {
      const y = 170 - i * 38;
      add("line", { x1: 48, x2: 980, y1: y, y2: y, stroke: "#dce3db" });
      add("text", { x: 2, y: y + 4, fill: "#647776", "font-size": 12 }, `${fmt(max * i / 4)} m`);
    }
    let path = "", connected = false;
    rows.forEach((r, i) => {
      const h = r.simulation?.height;
      if (!M.finite(h)) { connected = false; return; }
      path += `${connected ? "L" : "M"}${48 + i / Math.max(1, rows.length - 1) * 932},${170 - h / max * 152} `;
      connected = true;
    });
    add("path", { d: path, stroke: "#0b7169", "stroke-width": 2.5, fill: "none" });
    rows.forEach((r, i) => { if (i % 24 === 0) add("text", { x: 48 + i / Math.max(1, rows.length - 1) * 932, y: 198, fill: "#647776", "font-size": 12 }, `${day(r.time)} ${hour(r.time)}`); });
    $("surfChart").replaceChildren(svg);
  }

  function updateDayPartControls() {
    const targets = hoursDayPartTargets.get(hoursVisibleDay) || [];
    $("surfDayParts").dataset.day = hoursVisibleDay || "";
    const dateLabel = hoursVisibleDay ? day(Date.parse(`${hoursVisibleDay}T12:00:00Z`) / 1000) : "wybranego dnia";
    $("surfDayParts").setAttribute("aria-label", `Przewiń do pory dnia: ${dateLabel}`);
    for (const [key, button] of hoursPartButtons) {
      const target = targets.find(item => item.key === key);
      button.disabled = !M.finite(target?.time);
      button.setAttribute("aria-pressed", String(!button.disabled && key === hoursVisiblePart));
      if (button.disabled) delete button.dataset.time; else button.dataset.time = target.time;
      button.title = button.disabled ? `${button.textContent}: brak prognozy dla tej pory dnia (${dateLabel})`
        : `${button.textContent}: od ${hour(target.time)} · ${dateLabel}`;
      button.setAttribute("aria-label", button.title);
    }
  }

  function updateHoursNavigation() {
    if (!hoursViewport.clientWidth || !hoursColumns.length) return;
    // Ignore a subpixel strip left behind by scroll rounding (e.g. browser zoom).
    const edge = hoursTable.querySelector(".surf-hourly-label").getBoundingClientRect().right + 1;
    // A day stays active while its last column is still visibly after the pinned labels.
    let left = 0, right = hoursColumns.length;
    while (left < right) {
      const middle = Math.floor((left + right) / 2);
      if (hoursColumns[middle].getBoundingClientRect().right <= edge) left = middle + 1;
      else right = middle;
    }
    const column = hoursColumns[left], visible = column?.dataset.day;
    hoursVisibleTime = column ? Number(column.dataset.time) : null;
    const part = SurfHourly.dayPart(hoursVisibleTime), dayChanged = visible && visible !== hoursVisibleDay;
    if (dayChanged) {
      hoursVisibleDay = visible;
      $("surfDays").dataset.visibleDay = visible;
      for (const [key, button] of hoursDayButtons) button.setAttribute("aria-pressed", String(key === visible));
      updateDayPages();
    }
    if (dayChanged || part !== hoursVisiblePart) {
      hoursVisiblePart = part; updateDayPartControls();
    }
  }

  // Day tiles are paged like those under the comparison chart; the day the table is scrolled to always keeps its tile,
  // without opening more pages, so scrolling the table never makes the tiles above it jump.
  function updateDayPages() {
    const cards = [...$("surfDays").children];
    const view = SurfProfilePicker.dayPage(cards.map(card => ({ day: card.dataset.day })), dayKey(Date.now() / 1000), hoursDayPages, null);
    hoursDayPages = view.pages;
    const shown = new Set(view.visible.map(group => group.day));
    for (const card of cards) {
      const hidden = !shown.has(card.dataset.day) && card.dataset.day !== hoursVisibleDay;
      if (card.hidden !== hidden) card.hidden = hidden;
    }
    SurfProfilePicker.updatePaging(view, $("surfDayPages"), $("surfDaysLess"), $("surfDaysMore"));
  }

  function updateHoursLayout() {
    if (hoursViewport.clientWidth && hoursColumns.length) {
      const last = hoursColumns[hoursColumns.length - 1];
      const labelWidth = hoursTable.querySelector(".surf-hourly-label").getBoundingClientRect().width;
      const columnWidth = last.getBoundingClientRect().width;
      // Even the final available hour can start immediately after the pinned labels.
      hoursTable.style.marginRight = `${Math.max(0, hoursViewport.clientWidth - labelWidth - columnWidth)}px`;
    } else hoursTable.style.marginRight = "0px";
    updateHoursNavigation();
  }

  function revealHoursTime(time, force = false) {
    const column = hoursColumns.find(cell => Number(cell.dataset.time) <= time && time < Number(cell.dataset.end));
    if (!column || !hoursViewport.clientWidth) return;
    const frame = hoursViewport.getBoundingClientRect(), rect = column.getBoundingClientRect();
    const edge = hoursTable.querySelector(".surf-hourly-label").getBoundingClientRect().right;
    if (force || rect.left < edge || rect.right > frame.right - 2)
      hoursViewport.scrollTo({ left: Math.max(0, hoursViewport.scrollLeft + rect.left - edge), behavior: "instant" });
    updateHoursNavigation();
  }

  // A link to one hour (from the heatmap) shows it in the hourly table once the waves and the content above it are in.
  function showRequestedHour(time) {
    if (!hourScroll || !hoursColumns.length || simulation === null || (loading && !loaded)) return;
    hourScroll = false;
    revealHoursTime(time, true);
    $("surfDays").scrollIntoView({ behavior: "instant", block: "start" });
  }

  function waveRefreshMessage() {
    const parts = [];
    if (simulation?.refreshPending) parts.push("Trwa lokalne przeliczanie fal SWAN. Prognoza odświeży się automatycznie.");
    const age = M.simulationAge(simulation);
    if (M.finite(age) && age > 18) parts.push(`Ostatnie obliczenia fal: ${day(simulation.generatedAt)}, ${hour(simulation.generatedAt)}. Wynik lub jego dane wejściowe mają ponad 18 godzin — oczekiwanie na aktualizację.`);
    if (simulation?.refreshError) parts.push(simulation.refreshError);
    return parts.join(" ");
  }

  function directionCell(motion, value, caption = motion?.label) {
    if (!motion) {
      if (!value || !caption) return value;
      const reading = node("span", value, "surf-direction-reading");
      reading.append(node("small", caption, "surf-direction-caption"));
      return reading;
    }
    const content = node("span", undefined, "surf-direction-cell");
    content.dataset.kind = motion.kind; content.dataset.state = motion.state;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 84 60"); svg.setAttribute("class", "surf-direction-mini");
    svg.setAttribute("role", "img"); svg.setAttribute("aria-label", motion.description); svg.setAttribute("focusable", "false");
    const add = (tag, attrs, text, parent = svg) => {
      const el = document.createElementNS(svg.namespaceURI, tag);
      for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
      if (text !== undefined) el.textContent = text;
      parent.append(el); return el;
    };
    add("title", {}, motion.description);
    add("path", { d: "M0 0H84V44H0Z", class: "surf-mini-sea" });
    add("path", { d: "M0 44H84V60H0Z", class: "surf-mini-land" });
    add("path", { d: "M0 44H84", class: "surf-mini-shore" });
    add("text", { x: 6, y: 11, class: "surf-mini-label" }, "morze");
    add("text", { x: 42, y: 55, "text-anchor": "middle", class: "surf-mini-label" }, "plaża / ląd");
    if (motion.state === "moving") {
      svg.dataset.from = motion.from; svg.dataset.to = motion.to; svg.dataset.normal = motion.normal;
      svg.dataset.rotation = motion.rotation;
      const arrow = add("g", { transform: `rotate(${motion.rotation} 42 25)`, class: "surf-mini-motion" });
      add("path", { d: "M42 38V16", class: "surf-mini-arrow" }, undefined, arrow);
      add("path", { d: "M36 19L42 11L48 19Z", class: "surf-mini-tip" }, undefined, arrow);
      add("circle", { cx: 42, cy: 38, r: 2.3, class: "surf-mini-tip" }, undefined, arrow);
    } else add("circle", { cx: 42, cy: 26, r: 5, class: "surf-mini-calm" });
    const reading = node("span", value || motion.label, "surf-direction-reading");
    if (caption && caption !== (value || motion.label)) reading.append(node("small", caption, "surf-direction-caption"));
    content.append(svg, reading);
    return content;
  }

  function renderHours() {
    if (!active || !currentSpot) return;
    const now = Date.now(), currentHour = Math.floor(now / 3600000) * 3600;
    const hadColumns = hoursColumns.length > 0;
    const viewKey = currentSpot.id;
    const previousScroll = hoursViewKey === viewKey ? hoursViewport.scrollLeft : 0;
    const combined = SurfHourly.combine(rows, conditions, { windWeather: loaded?.weather?.data, now });
    const focusTime = simulationTime ?? SurfWeather.selectTime(combined.map(r => r.time), sessionRequest?.start, sessionRequest?.day, now);
    const section = $("surfHourlySection");
    const awaitingWaves = simulation === null || Boolean(simulation?.refreshPending) || (loading && loaded === null);
    section.dataset.spot = currentSpot.id; section.dataset.time = String(focusTime);
    section.setAttribute("aria-busy", String(conditions === null || awaitingWaves));
    $("surfHourlyContext").textContent = `Wybrana godzina: ${day(focusTime)}, ${hour(focusTime)}`;
    // Summarize the forecast point across all displayed hours.
    const point = SurfHourly.pointSummary(combined), pointNote = $("surfForecastPoint");
    pointNote.hidden = !point;
    pointNote.textContent = "";
    if (point) {
      const range = (extent, digits) => {
        const min = fmt(extent.min, digits), max = fmt(extent.max, digits);
        return min === max ? min : `${min}–${max}`;
      };
      const varies = point.shoreDistance.min !== point.shoreDistance.max || point.depth.min !== point.depth.max;
      pointNote.textContent = `Fale liczone ok. ${range(point.shoreDistance, 0)} m od brzegu, przy głębokości ${range(point.depth, 1)} m.${varies ? " Punkt prognozy zmienia się zależnie od godziny." : ""}`;
    }
    renderConditionsStatus();
    // Choosing another hour changes only the selection; the hundreds of columns stay as they are.
    const dataKey = [loaded, simulation, conditions, currentSpot.id, currentHour, chosenSession?.start, chosenSession?.end, loading, awaitingWaves];
    if (hoursColumns.length && hoursDataKey?.every((value, i) => value === dataKey[i])) {
      for (const cell of hoursTable.querySelectorAll("[data-time][data-end]"))
        cell.dataset.selected = String(Number(cell.dataset.time) <= focusTime && focusTime < Number(cell.dataset.end));
      for (const button of hoursTable.querySelectorAll("button.surf-hour-interval"))
        button.setAttribute("aria-pressed", button.parentElement.dataset.selected);
      if ((simulationTime !== null || sessionRequest?.day) && hoursSelectedTime !== focusTime) revealHoursTime(focusTime);
      hoursSelectedTime = focusTime;
      updateHoursNavigation();
      showRequestedHour(focusTime);
      return;
    }
    hoursDataKey = dataKey;
    const windValue = (wind, withFrom = false) => [
      M.finite(wind?.direction) ? `${withFrom ? "z " : ""}${compass(wind.direction)}` : null,
      M.finite(wind?.speed) ? windKnots(wind.speed) : null
    ].filter(value => value !== null).join(" · ") || null;
    const allPeriods = SurfHourly.periods(combined, { session: chosenSession, selectedTime: focusTime })
      .map(period => {
        const wind = windValue(period.row.wind, true);
        const relative = M.windRelativeToWave(period.row.wind, period.row.simulation?.direction);
        return { ...period, windText: wind ? `BS Wind: ${wind}${relative ? ` · ${relative}` : ""}` : null };
      });
    const definitions = [
      ["score", "Ocena warunków", r => {
        if (M.finite(r.score) && r.disputedWind) {
          const value = node("span");
          value.append(scoreNode(r.score), node("small", "Modele wiatru wskazują różne kierunki — mediana ich ocen, niska pewność", "surf-cell-wind"));
          return value;
        }
        if (M.finite(r.score)) return scoreNode(r.score);
        if (r.simulation && r.wind?.count > 1 && M.finite(r.wind.agreement) && r.wind.agreement < 0.3 &&
            !M.finite(r.wind.direction) && r.wind.speed >= 0.5)
          return node("small", "Modele wskazują różne kierunki wiatru. Na podstawie tych danych nie można wyliczyć wiarygodnej oceny.", "surf-cell-wind");
        return null;
      }],
      ["height", "Wysokość fal przy spocie", r => M.finite(r.simulation?.height) ? `~${fmt(r.simulation.height)} m` : null, true],
      ["period", "Czas między falami", r => M.finite(r.period) ? `${fmt(r.period)} s` : null, true],
      ["energy", "Energia fal · kJ/m²", r => M.finite(r.energyKJm2) ? `~${fmt(r.energyKJm2, 2)} kJ/m²` : null, true],
      ["power", "Moc fal · kW/m", r => M.finite(r.powerKWm) ? `~${fmt(r.powerKWm, 2)} kW/m` : null, true],
      ["direction", "Fale nadchodzą z", r => {
        const motion = SurfDirections.wave(r.simulation, currentSpot);
        return directionCell(motion, motion?.state === "calm" ? null : M.finite(r.direction) ? compass(r.direction) : null);
      }],
      ["wind", "Wiatr przy brzegu", r => {
        const motion = SurfDirections.wind(r.wind, currentSpot), relative = M.windRelative(r.wind, currentSpot);
        const value = motion?.state === "calm" ? windKnots(r.wind.speed) : windValue(r.wind);
        const caption = motion?.state === "moving"
          ? motion.weak ? `${motion.label} · słaby wiatr` : `${motion.label} (${relative})`
          : motion?.label || (relative === "cisza / słaby" ? "Słaby wiatr" : relative);
        return directionCell(motion, value, caption);
      }],
      ["waterTemperature", "Temp. wody", r => M.finite(r.weather.waterTemperature) ? `${fmt(r.weather.waterTemperature)} °C` : null, false, "weather"],
      ["airTemperature", "Temp. powietrza", r => M.finite(r.weather.airTemperature) ? `${fmt(r.weather.airTemperature)} °C` : null, false, "weather"],
      ["cloudCover", "Zachmurzenie", r => {
        const symbol = SurfWeather.weatherSymbol(r.weather, r.daylight);
        const hasCover = M.finite(r.weather.cloudCover);
        if (!hasCover && !symbol) return null;
        const el = node("span"), reading = node("span", undefined, "surf-cloud-reading");
        if (symbol) {
          const icon = node("span", symbol.icon, "surf-weather-emoji");
          icon.setAttribute("aria-hidden", "true"); icon.title = symbol.label; reading.append(icon);
        }
        if (hasCover) reading.append(node("span", `${fmt(r.weather.cloudCover, 0)}%`, "surf-cloud-percent"));
        el.append(reading, node("small", symbol?.label || r.weather.cloudLabel, "surf-cell-weather"));
        return el;
      }, false, "weather"]
    ];
    const { periods, fields } = SurfHourly.compactTable(allPeriods,
      definitions.map(([key, label, value, withWind = false, group = "surf"]) => ({
        key, label, withWind, group, values: allPeriods.map(period => value(period.row))
      })));
    hoursColumns = []; hoursDayButtons.clear(); hoursDayPartTargets.clear();
    hoursVisibleDay = null; hoursVisibleTime = null; hoursVisiblePart = null;
    delete $("surfDays").dataset.visibleDay;
    const days = new Map();
    for (const period of periods) if (!days.has(period.day)) days.set(period.day, period.row.time);
    for (const key of days.keys()) hoursDayPartTargets.set(key, SurfHourly.dayPartTargets(periods, key));
    $("surfDays").replaceChildren(...[...days].map(([key, time]) => {
      const card = node("div", undefined, "surf-day-card"); card.dataset.day = key;
      const button = node("button", day(time), "filter surf-day-button"); button.type = "button"; button.dataset.day = key;
      button.setAttribute("aria-pressed", "false"); button.setAttribute("aria-label", `Przewiń prognozę do dnia: ${day(time)}`);
      button.addEventListener("click", () => scrollToForecastDay(key)); hoursDayButtons.set(key, button);
      card.append(button);
      const sun = SurfWeather.sunTimes(conditions, key);
      const times = node("div", undefined, "surf-day-sun-times");
      for (const [field, label, icon] of [["sunrise", "Wschód", "i-sunrise"], ["sunset", "Zachód", "i-sunset"]]) {
        if (!M.finite(sun[field])) continue;
        const line = node("span", undefined, "surf-day-sun"); line.dataset.sun = field;
        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("class", "icon"); svg.setAttribute("aria-hidden", "true");
        const use = document.createElementNS("http://www.w3.org/2000/svg", "use"); use.setAttribute("href", `#${icon}`); svg.append(use);
        const text = node("span", `${label} `); text.append(node("strong", hour(sun[field])));
        line.append(svg, text); times.append(line);
      }
      if (times.childElementCount) card.append(times);
      return card;
    }));
    updateDayPages();
    $("surfDayParts").hidden = !periods.length;
    updateDayPartControls();
    hoursTable.style.setProperty("--hourly-column-count", periods.length);
    hoursViewport.hidden = !periods.length;
    $("surfHoursEmpty").hidden = Boolean(periods.length);
    $("surfHoursEmpty").textContent = waveRefreshMessage() || (awaitingWaves ? "Pobieram prognozę fal…" : "Brak dostępnej prognozy wysokości fal dla tego spotu.");
    const decorate = (cell, period) => {
      cell.dataset.time = period.row.time; cell.dataset.end = period.end;
      cell.dataset.day = period.day;
      cell.dataset.light = period.row.daylight === true ? "day" : period.row.daylight === false ? "night" : "unknown";
      cell.dataset.session = String(period.inSession);
      cell.dataset.selected = String(period.selected);
      cell.dataset.history = String(period.row.time < currentHour);
      return cell;
    };
    const heading = node("tr"), corner = node("th", "Godzina", "surf-hourly-label"); corner.scope = "col";
    heading.append(corner);
    for (const period of periods) {
      const r = period.row, cell = decorate(node("th"), period); cell.scope = "col";
      const content = node("button", undefined, "surf-hour-interval");
      const timeState = r.time < currentHour ? "historia" : r.time === currentHour ? "teraz" : r.time - currentHour > 7 * 86400 ? "orientacyjnie" : "";
      // The time zone is named only where the clock changes within the column, e.g. 02:00–02:00 CEST → CET.
      const zone = period.zone.includes("→") ? period.zone : "";
      content.append(node("small", day(r.time), "surf-hour-date"), node("strong", period.label), node("small", [zone, timeState].filter(Boolean).join(" · "), "surf-hour-zone"));
      if (period.inSession) content.append(node("small", "Wybrana sesja", "surf-hour-session"));
      content.type = "button"; content.dataset.time = r.time;
      content.title = r.simulation ? "Wybierz godzinę i pokaż przekrój fal" : "Wybierz godzinę prognozy";
      content.setAttribute("aria-label", `${day(r.time)}, ${period.label}${zone ? `, ${zone}` : ""}${period.inSession ? ", wybrana sesja" : ""}. ${content.title}`);
      content.setAttribute("aria-pressed", String(period.selected));
      content.addEventListener("focus", () => { if (content.matches(":focus-visible")) revealHoursTime(r.time); });
      content.addEventListener("click", () => {
        simulationTime = r.time; render();
        if (r.simulation) $("surfSimulation").scrollIntoView({ behavior: "smooth", block: "start" });
      });
      cell.append(content); heading.append(cell); hoursColumns.push(cell);
    }
    $("surfHoursHead").replaceChildren(heading);
    let weatherGroupStarted = false;
    $("surfHours").replaceChildren(...fields.map(({ key, label, values, withWind, group }) => {
      const tr = node("tr"), title = node("th", label, "surf-hourly-label");
      title.scope = "row"; tr.dataset.field = key; tr.dataset.group = group;
      if (group === "weather" && !weatherGroupStarted) {
        weatherGroupStarted = true;
        tr.className = "surf-conditions-start";
        title.prepend(node("small", "Pogoda na spocie", "surf-row-group"));
      }
      tr.append(title);
      for (const [i, period] of periods.entries()) {
        const cell = decorate(node("td"), period);
        if (key === "score" && M.finite(period.row.score)) cell.dataset.quality = scoreTone(period.row.score);
        if (values[i] !== null && values[i] !== undefined && values[i] !== "") {
          const primary = node("div", undefined, "surf-hour-value");
          primary.append(values[i]); cell.append(primary);
          if (withWind && period.windText) cell.append(node("small", period.windText, "surf-cell-wind"));
        }
        tr.append(cell);
      }
      return tr;
    }));
    updateHoursLayout();
    hoursViewport.scrollLeft = previousScroll;
    if ((simulationTime !== null || sessionRequest?.day) && (!hadColumns || hoursViewKey !== viewKey || hoursSelectedTime !== focusTime)) revealHoursTime(focusTime);
    hoursViewKey = viewKey; hoursSelectedTime = focusTime;
    updateHoursNavigation();
    showRequestedHour(focusTime);
  }

  function renderSimulation(row) {
    profileRow = row;
    const info = $("surfSimulationInfo"), details = $("surfSimulationDetails"), plot = $("surfSimulationProfile");
    info.replaceChildren(); details.replaceChildren(); plot.replaceChildren();
    $("surfProfileTime").value = "";
    if (!simulation) { info.append(node("p", "Wczytywanie wyników SWAN…", "surf-small")); return; }
    const refreshMessage = waveRefreshMessage();
    if (refreshMessage) info.append(node("p", refreshMessage, "surf-small"));
    if (simulation.status !== "ready") {
      info.append(node("p", "Brak potwierdzonej prognozy w strefie do 500 m od brzegu. Nie zastępujemy jej wartościami z dalszego morza.", "surf-small"));
      if (simulation.error) info.append(node("p", `Powód: ${simulation.error}`, "surf-small"));
      return;
    }
    details.append(node("p", `Prognoza ${simulation.engine}${simulation.sourceType === "local" ? " · obliczenia lokalne" : ""} · obliczono ${day(simulation.generatedAt)} ${hour(simulation.generatedAt)} · wiatr do symulacji pobrano ${day(simulation.windFetchedAt)} ${hour(simulation.windFetchedAt)}.`, "surf-small"));
    if (simulation.reusedInputs) info.append(node("p", `Obliczono nowy profil na ostatnim poprawnie pobranym zestawie prognoz. Dane wejściowe fal pobrano ${day(simulation.boundaryFetchedAt)} ${hour(simulation.boundaryFetchedAt)}. Daty pozostają oryginalne; pobieranie nowszych danych było chwilowo niedostępne.`, "surf-small"));
    if (!row?.simulation) {
      info.append(node("p", "Brak aktualnego wyniku z potwierdzoną odległością do 500 m od brzegu na tę godzinę. Nie wystawiamy oceny sesji na podstawie dalszego morza.", "surf-small")); return;
    }
    const s = row.simulation;
    $("surfProfileTime").value = String(row.time);
    const summary = node("p");
    summary.append(node("strong", `${day(row.time)} ${hour(row.time)} · fala przy spocie ~${fmt(s.height)} m`), document.createTextNode(` · około ${Math.round(s.shoreDistance)} m od brzegu · głębokość ${fmt(s.depth)} m · czas między falami ${fmt(s.period)} s · moc ${fmt(s.powerKWm, 2)} kW/m.`));
    details.append(summary);
    details.append(node("p", "Punkt do oceny wybieramy od strony morza, przy pierwszym dojściu profilu dna do głębokości około 2 m, w strefie do 500 m od brzegu. Wysokość znacząca z modelu nie jest pomiarem ściany łamiącej się fali.", "surf-small"));
    details.append(node("p", s.breaking ? `Modelowa strefa załamania: fala ~${fmt(s.breaking.height)} m, głębokość ${fmt(s.breaking.depth)} m, około ${Math.round(s.breaking.shoreDistance)} m od brzegu. Kryterium: co najmniej 10% fal załamujących się.`
      : "Model nie wskazuje wyraźnej strefy załamania w rozpoznanych pierwszych 500 m.", "surf-small"));
    details.append(node("p", `Położenie brzegu szacujemy z mapy dna. Odległość punktu mieści się w przedziale ${Math.round(s.shoreDistanceMin)}–${Math.round(s.shoreDistanceMax)} m względem rozpoznanej granicy ląd–woda. Rozdzielczość danych wynosi około 100 m.`, "surf-small"));
    if (row.simulationWind) details.append(node("p", `Wiatr użyty w SWAN przy plaży: z ${compass(row.simulationWind.direction)}, ${windKnots(row.simulationWind.speed)}${row.simulationWind.fallback ? " — model zastępczy przy rozbieżności konsensusu" : ""}. Tabela może już zawierać nowszy przebieg wiatru BS Wind 8.`, "surf-small"));
    const points = s.profile || [];
    const profileUntil = simulation.hourly?.[0]?.time + simulation.profileHours * 3600;
    if (points.length !== 11 && M.finite(profileUntil) && row.time > profileUntil) {
      plot.append(node("p", `Pełny przekrój 0–500 m pokazujemy dla pierwszych ${Math.round(simulation.profileHours / 24)} dni prognozy. Dla tej godziny podajemy wartości w punkcie przy spocie — powyżej.`, "surf-small")); return;
    }
    if (points.length !== 11) { plot.append(node("p", "Pełny profil 0–500 m co 50 m wymaga przeliczenia. Nie przedłużamy krótszej krzywej wymyślonymi wartościami.", "surf-small")); return; }
    const ns = "http://www.w3.org/2000/svg", svg = document.createElementNS(ns, "svg");
    const width = Math.max(300, Math.min(900, plot.clientWidth || 900));
    svg.setAttribute("viewBox", `0 0 ${width} 210`); svg.setAttribute("role", "img"); svg.setAttribute("aria-label", "Pełny przekrój wysokości fal od 0 do 500 metrów od brzegu, co 50 metrów");
    const max = Math.max(.5, ...points.map(p => p.height));
    const x = distance => 45 + distance / 500 * (width - 60);
    const y = height => 170 - height / max * 150;
    const add = (tag, attrs, text) => { const e = document.createElementNS(ns, tag); for (const [k,v] of Object.entries(attrs)) e.setAttribute(k,v); if(text)e.textContent=text;svg.append(e); return e; };
    for(let i=0;i<4;i++){const yy=170-i*50;add("line",{x1:45,x2:width-15,y1:yy,y2:yy,stroke:"#dce3db"});add("text",{x:0,y:yy+4,fill:"#647776","font-size":12},`${fmt(max*i/3)} m`);}
    for(let i=1;i<points.length;i++){
      const a=points[i-1],b=points[i],dry=a.kind!=="swan-node"||b.kind!=="swan-node";
      add("line",{x1:x(a.shoreDistance),y1:y(a.height),x2:x(b.shoreDistance),y2:y(b.height),stroke:dry?"#647776":"#0b7169","stroke-width":dry?2:3,"stroke-dasharray":dry?"4 3":"none"});
    }
    for(let d=0;d<=500;d+=100)add("text",{x:x(d),y:198,"text-anchor":d===0?"start":d===500?"end":"middle",fill:"#647776","font-size":width<450?10:12},`${d} m`);
    const values = node("div", undefined, "surf-profile-values");
    points.forEach(p => {
      const marker = add("circle",{cx:x(p.shoreDistance),cy:y(p.height),r:p.shoreDistance===s.shoreDistance?5:3,
        fill:p.kind!=="swan-node"?"#647776":"#0b7169","data-distance":p.shoreDistance});
      const heightLabel=fmt(p.height,p.height>0&&p.height<.1?2:1);
      const title=document.createElementNS(ns,"title");title.textContent=p.shoreDistance===0?"0 m — granica lądu w modelu":p.kind==="dry-model-node"?`${p.shoreDistance} m: komórka uznana przez model za suchą / zbyt płytką`:`${p.shoreDistance} m: fala ~${heightLabel} m`;marker.append(title);
      const value=node("div",undefined,"surf-profile-value");value.dataset.distance=p.shoreDistance;
      value.append(node("small",`${p.shoreDistance} m od brzegu`),node("strong",p.shoreDistance===0?"brzeg":p.kind==="dry-model-node"?"płytko / sucho":`~${heightLabel} m`));
      values.append(value);
    });
    plot.append(svg, values);
    details.prepend(node("p", "Cały przekrój: 0, 50, 100, …, 500 m od brzegu przyjętego w modelu. Zielone punkty: wyniki SWAN. Szare: granica lądu albo komórki uznane za suche / zbyt płytkie (warunek modelu, nie pomiar napływu fali). Grubsza kropka zaznacza punkt podsumowania — nie początek wykresu. Położenie rzeczywistej linii wody jest przybliżone.", "surf-small"));
  }

  function renderBathymetry(now) {
    const el = $("surfBathymetry"); el.replaceChildren();
    if (!now?.simulation) { el.append(node("p", "Brak aktualnego profilu dla strefy do 500 m od brzegu.", "surf-small")); return; }
    const valid = now.simulation.profile.filter(p => M.finite(p.depth)).sort((a, b) => a.shoreDistance - b.shoreDistance);
    const profile = node("div", undefined, "bath-profile");
    const max = Math.max(1, ...valid.map(p => p.depth));
    valid.forEach(p => {
      const col = node("div", undefined, "bath-point"); col.append(node("span", `~${Math.round(p.shoreDistance)} m`));
      const bar = node("i"); bar.style.height = `${M.finite(p.depth) ? p.depth / max * 65 : 2}px`; col.append(bar, node("span", `${fmt(p.depth)} m`)); profile.append(col);
    });
    el.append(profile, node("p", "Odległość od oszacowanego brzegu → głębokość. Wyłącznie morska strefa do 500 m przy wybranym spocie.", "surf-small"));
    el.append(node("p", `Wybrany punkt prognozy: około ${Math.round(now.simulation.shoreDistance)} m od brzegu, głębokość ${fmt(now.simulation.depth)} m. Dno pochodzi z rastra EMODnet, nie z bieżącego pomiaru rew.`, "surf-small"));
  }

  function renderSession() {
    const box = $("surfSession"); box.hidden = !sessionRequest?.day; box.replaceChildren();
    if (box.hidden) return;
    box.dataset.quality = scoreTone(chosenSession?.score);
    const dateLabel = day(Date.parse(`${sessionRequest.day}T12:00:00Z`) / 1000);
    box.append(node("h3", `${currentSpot.town} — ${currentSpot.name} · ${dateLabel}`));
    if (!chosenSession) {
      box.append(node("strong", simulation === null ? "Wczytuję wybraną sesję…" : "Brak pełnych danych dla wybranej sesji"),
        node("p", sessionRequest.start !== null ? `Wybrane okno: ${hour(sessionRequest.start)}–${hour(sessionRequest.start + 10800)}. Nie zastępujemy go inną godziną.` : "Dla tego dnia nie ma pełnego przyszłego okna dziennego."));
    } else {
      const w = chosenSession, first = w.rows[0];
      box.append(node("strong", `${fmt(w.score)} / 10 · ${w.historical ? "Historia prognozy" : quality(w.score)}`),
        node("p", `${hour(w.start)}–${hour(w.end)} · pewność: ${w.confidence}`),
        node("p", `Fale ${fmt(w.minHeight)}–${fmt(w.maxHeight)} m · okres ${fmt(M.median(w.rows.map(r => r.period)))} s · wiatr ${windKnots(M.median(w.rows.map(r => r.wind?.speed)))}`),
        node("p", `Wiatr na początku sesji: ${M.windRelative(first.wind, currentSpot) || "brak kierunku"}. Mapa i parametry poniżej pokazują wybraną godzinę.`));
      for (const flag of w.flags.filter(f => f.startsWith("Na "))) box.append(node("p", flag));
      if (w.historical) box.append(node("p", "Wcześniejsze okno — wynik modelowy, nie pomiar ani rekomendacja wyjazdu teraz."));
      const button = node("button", "Zobacz trzy godziny sesji ↓", "filter"); button.type = "button";
      button.addEventListener("click", () => { simulationTime = w.start; render(); revealHoursTime(w.start, true); $("surfDays").scrollIntoView({ behavior: "smooth", block: "start" }); });
      box.append(button);
    }
    if (sessionScroll && simulation !== null) { sessionScroll = false; box.scrollIntoView({ behavior: "smooth", block: "start" }); box.focus({ preventScroll: true }); }
  }

  function render() {
    if (!active) return;
    if (!loaded) { renderHours(); return; }
    rows = M.buildCoastalForecast(currentSpot, loaded.weather?.data, simulation, Date.now());
    chosenSession = SurfSession.resolve(rows, sessionRequest, M);
    if (chosenSession && simulationTime === null) simulationTime = chosenSession.start;
    $("surfContent").hidden = false;
    $("surfSpotHeading").hidden = false;
    $("surfDetailContent").hidden = false;
    renderSession();
    const now = simulationTime !== null ? rows.find(r => r.time === simulationTime)
      : !sessionRequest?.day ? rows.find(r => r.time * 1000 <= Date.now() && r.time * 1000 > Date.now() - 3600000) : null;
    const stale = loaded.weather?.stale;
    const stamps = [loaded.weather].filter(Boolean).map(r => r.fetchedAt);
    const errors = [...loaded.errors, ...[loaded.weather].filter(r => r?.error).map(r => r.error)];
    $("surfStatus").dataset.state = stale ? "stale" : errors.length ? "error" : "ready";
    $("surfStatus").textContent = `${stale ? "UWAGA: dane z pamięci, odświeżenie nie powiodło się. " : ""}Wiatr pobrano: ${stamps.map(t => `${day(t / 1000)} ${hour(t / 1000)}`).join(" / ") || "brak danych"}. ${loaded.weather?.sourceType === "scheduled" ? "BS Wind 8, aktualizacja serwerowa co 3 h" : loaded.weather?.sourceType === "local" ? "BS Wind 8, lokalne odświeżenie Open-Meteo" : "BS Wind 8, pobranie bezpośrednie"}. ${rows.filter(r => r.simulation).length}/${rows.length} godzin z prognozą fal do 500 m od brzegu. ${errors.join(" ")}`;
    if (simulation?.sourceType === "local") $("surfStatus").textContent += " Fale: lokalne obliczenia SWAN.";
    const refreshMessage = waveRefreshMessage();
    if (refreshMessage) {
      $("surfStatus").textContent += ` ${refreshMessage}`;
      $("surfStatus").dataset.state = simulation.refreshPending ? "loading" : "stale";
    }
    $("surfSpotTitle").textContent = `${currentSpot.town} — ${currentSpot.name}`;
    const point = now?.simulation || rows.find(r => r.simulation)?.simulation;
    $("surfSpotMeta").textContent = point ? `Punkt prognozy: około ${Math.round(point.shoreDistance)} m od brzegu · głębokość ${fmt(point.depth)} m · strefa do 500 m · godziny polskie`
      : "Prognoza dotyczy wyłącznie strefy do 500 m od brzegu. Brak potwierdzonego wyniku dla tego miejsca.";
    const lat = point?.lat ?? currentSpot.lat, lon = point?.lon ?? currentSpot.lon;
    $("surfMapLink").href = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}`;
    $("surfMapLink").textContent = point ? "Punkt prognozy na mapie ↗" : "Położenie spotu ↗";
    const items = [
      [now ? `Wysokość fal przy spocie · ${hour(now.time)}` : "Wysokość fal przy spocie", now?.simulation ? `~${fmt(now.height)} m` : "—", now?.simulation ? `Około ${Math.round(now.simulation.shoreDistance)} m od brzegu · głębokość ${fmt(now.simulation.depth)} m` : "Brak danych dla strefy do 500 m"],
      ["Czas między falami przy spocie", now?.simulation ? `${fmt(now.period)} s` : "—", now?.simulation ? `Fale nadchodzą z ${compass(now.direction)}` : "Brak prognozy przy brzegu"],
      ["Wiatr przy plaży", windKnots(now?.wind?.speed), `Z ${compass(now?.wind?.direction)} · porywy ${windKnots(now?.wind?.gust)}`, SurfDirections.wind(now?.wind, currentSpot)],
      ["Moc fal przy spocie", M.finite(now?.powerKWm) ? `~${fmt(now.powerKWm, 2)} kW/m` : "—", "W tym samym punkcie, do 500 m od brzegu"],
      ["Energia fal przy spocie", M.finite(now?.energyKJm2) ? `~${fmt(now.energyKJm2, 2)} kJ/m²` : "—", "Na m² powierzchni wody w punkcie prognozy"],
        [now ? `Czy warto jechać? · ${hour(now.time)}` : "Teraz — brak danych", `${fmt(now?.score, 1)} / 10`, `${quality(now?.score)} · profil: średniozaawansowany, rekreacyjny surfing`]
    ];
    $("surfNow").replaceChildren(...items.map(([title, value, desc, motion]) => {
      const el = node("div", undefined, "surf-metric");
      el.append(node("small", title), node("strong", value), node("p", desc));
      if (motion) {
        const direction = directionCell(motion, motion.label, "Widok z plaży na morze");
        direction.classList.add("surf-metric-direction");
        el.append(direction);
      }
      return el;
    }));
    $("surfNow").lastElementChild.dataset.quality = scoreTone(now?.score);
    $("surfFlags").replaceChildren(...(now?.flags || []).map(f => node("span", f)));
    if (now?.confidence && M.finite(now.score)) $("surfFlags").append(node("span", `Pewność: ${now.confidence.level} — ${now.confidence.reasons.join("; ")}`));
    renderSequence(now);
    if (!windMap && window.SurfWindMap) windMap = SurfWindMap.create();
    windMap?.update(currentSpot, now?.wind, simulation?.shoreline, now?.simulation);
    const wave = now?.simulation;
    $("surfWaveDescription").textContent = wave && M.finite(wave.direction) && M.finite(wave.height)
      ? wave.height <= .001 ? "Fale: praktycznie brak fali — bez animacji."
        : `Fale z ${compass(wave.direction)} → ku ${compass((wave.direction + 180) % 360)} · ~${fmt(wave.height)} m · okres ${fmt(wave.period)} s.`
      : "Fale: brak kierunku z prognozy przy brzegu — bez animacji.";
    const wind = now?.wind;
    $("surfWindDescription").textContent = `${now ? `${day(now.time)} ${hour(now.time)} · ` : ""}${M.finite(wind?.direction) && M.finite(wind?.speed) && wind.speed >= .5 ? `Wiatr z ${compass(wind.direction)} → ku ${compass((wind.direction + 180) % 360)}, ${windKnots(wind.speed)} · ${M.windRelative(wind, currentSpot)}.` : M.finite(wind?.speed) && wind.speed < .5 ? "Cisza — bez strzałki kierunku." : "Brak pewnego kierunku wiatru — bez strzałki."}`;
    const profileRows = rows.filter(r => r.simulation?.profile.length === 11);
    $("surfProfileTime").replaceChildren(...profileRows.map(r => {
      const option = node("option", `${day(r.time)} · ${date(r.time, { hour: "2-digit", minute: "2-digit", timeZoneName: "short" })}`);
      option.value = r.time; return option;
    }));
    $("surfProfileTime").disabled = !profileRows.length;
    renderSimulation(simulationTime !== null || sessionRequest?.day ? now : now || profileRows[0] || rows[0]);
    const windows = M.bestWindows(rows.filter(r => r.time * 1000 >= Date.now() && r.simulation), 3, { cleanupOnly: $("surfCleanupOnly").checked });
    $("surfWindows").replaceChildren(...windows.map(w => {
      const button = node("button", undefined, "surf-window"); button.type = "button";
      button.dataset.quality = scoreTone(w.score);
      button.append(node("span", `${day(w.start)} · ${hour(w.start)}–${hour(w.end)}`), node("strong", `${fmt(w.score, 1)}/10 · ${quality(w.score)}`), node("small", `Fale przy spocie ~${fmt(w.minHeight)}–${fmt(w.maxHeight)} m · pewność: ${w.confidence} · pokaż dzień →`));
      button.append(node("small", w.flags.filter(f => f.startsWith("Na ")).join(" · ")));
      if (w.cleanupHours) button.append(node("small", `Wywiewka / ucichanie po nawianiu: ${w.cleanupHours}/3 h`));
      button.addEventListener("click", () => { simulationTime = w.start; render(); revealHoursTime(w.start, true); $("surfDays").scrollIntoView({ behavior: "smooth", block: "center" }); }); return button;
    }));
    if (!windows.length) $("surfWindows").append(node("p", $("surfCleanupOnly").checked ? "Brak pełnych trzygodzinnych okien wywiewki z utrzymującą się falą. Odznacz filtr, aby zobaczyć pozostałe okna surfingowe." : "Brak kompletnych dziennych okien z falami i wiatrem. Spróbuj odświeżyć prognozę.", "surf-small"));
    renderChart();
    renderHours();
    $("surfModels").replaceChildren();
    const modelRow = (name, text) => { const el = node("div", undefined, "surf-model-row"); el.append(node("b", name), node("span", text)); $("surfModels").append(el); };
    modelRow("Fale przy spocie", now?.simulation ? `SWAN · ~${fmt(now.height)} m · ~${Math.round(now.simulation.shoreDistance)} m od brzegu` : "Brak potwierdzonej prognozy do 500 m");
    for (const m of now?.wind?.members || []) modelRow(M.WIND_MODELS[m.model], `${windKnots(m.speed)} · z ${compass(m.direction)}`);
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

  async function loadSimulation(spot, token, force) {
    if (token !== generation || !active) return;
    const result = await SurfAPI.nearshore(spot, force);
    if (token !== generation || !active) return;
    simulation = result; render();
    if (result.refreshPending || result.refreshError || result.status !== "ready" || M.simulationAge(result) > 18) {
      const seconds = Math.max(5, Math.min(900, Number(result.retryAfter) || 60));
      simulationRefreshTimer = setTimeout(() => loadSimulation(spot, token, true), seconds * 1000);
    }
  }

  function showSpotMap(selectedId) {
    if (!spotMap && window.SurfSpotMap) {
      spotMap = SurfSpotMap.create({ spots, region: "all", selectedId,
        onSelect: id => { clearSpotSearch(); $("surfSpot").value = id; updateChoice(); location.hash = `surf/${id}`; } });
    } else if (spotMap) {
      spotMap.resize();
      spotMap.select(selectedId);
    }
  }

  // Without a chosen spot the tab offers only the ways to choose one; no spot is ever preselected.
  function showNoSpot() {
    ++generation;
    clearTimeout(simulationRefreshTimer);
    currentSpot = null; loaded = null; rows = []; simulation = null; simulationTime = null; chosenSession = null;
    conditions = null; loading = false;
    $("surfSpot").value = "";
    $("surfTab").href = "#surf";
    for (const id of ["surfSpotHeading", "surfLocalSection", "surfContent", "surfHourlySection", "surfDetailContent", "surfWindy"]) $(id).hidden = true;
    delete $("surfStatus").dataset.state;
    $("surfStatus").textContent = "Nie wybrano spotu. Wybierz plażę w wyszukiwarce, na liście albo na mapie, aby zobaczyć prognozę.";
    document.title = "Prognozy surfingu | Nad morzem";
    showSpotMap(null);
    updateChoice();
  }

  async function loadSpot(spot, force = false) {
    const token = ++generation;
    clearTimeout(simulationRefreshTimer);
    lastAttempt = Date.now();
    currentSpot = spot; loaded = null; rows = []; simulation = null; simulationTime = sessionRequest?.time ?? null; chosenSession = null;
    conditions = null;
    loading = true;
    if (acceptedSearchId !== spot.id) clearSpotSearch();
    else closeSuggestions();
    $("surfSpot").value = spot.id;
    $("surfTab").href = `#surf/${spot.id}`;
    $("surfContent").hidden = true;
    $("surfSpotHeading").hidden = true;
    $("surfDetailContent").hidden = true;
    for (const id of ["surfLocalSection", "surfHourlySection", "surfWindy"]) $(id).hidden = false;
    updateChoice();
    $("surfStatus").dataset.state = "loading";
    $("surfStatus").textContent = `Pobieram prognozę dla: ${spot.town}, ${spot.name}…`;
    document.title = `${spot.town} — prognoza surfingu | Nad morzem`;
    document.querySelectorAll(".surf-spot-label").forEach(label => { label.textContent = `Spot: ${spot.town} — ${spot.name}`; });
    showSpotMap(spot.id);
    renderSpotNotes();
    setMap();
    renderHours();
    SurfAPI.conditions(spot, force).then(result => {
      if (token === generation && active) { conditions = result; renderHours(); }
    });
    loadSimulation(spot, token, force);
    try {
      const result = await SurfAPI.forecasts(spot, force, { coastalOnly: true });
      if (token !== generation || !active) return;
      loaded = result;
      if (!result.weather && simulation?.status !== "ready") throw new Error(result.errors.join(" ") || "Prognoza jest chwilowo niedostępna.");
      render();
    } catch (error) {
      if (token !== generation || !active) return;
      $("surfStatus").dataset.state = "error";
      $("surfStatus").textContent = `Nie udało się pobrać prognozy. ${error.message} Możesz odświeżyć dane lub porównać mapę Windy poniżej.`;
    } finally { if (token === generation) { loading = false; updateChoice(); renderHours(); } }
  }

  for (const id of ["camerasTab", "surfTab", "heatmapTab"]) $(id).addEventListener("click", event => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const target = $(id).hash;
    if (location.hash === target) {
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    } else {
      scrollToTabTop = true;
      location.hash = target;
    }
  });
  function route() {
    const next = location.hash === "#surf" || location.hash.startsWith("#surf/");
    const heatmap = location.hash.startsWith("#heatmap");
    const tab = heatmap ? "heatmap" : next ? "surf" : "cameras";
    const changed = next !== active;
    active = next;
    $("cameraPanel").hidden = next || heatmap; $("forecastPanel").hidden = !next;
    $("heatmapPanel").hidden = !heatmap; $("surfComparisonPanel").hidden = !next;
    for (const [id, on] of [["camerasTab", tab === "cameras"], ["surfTab", next], ["heatmapTab", heatmap]]) {
      if (on) $(id).setAttribute("aria-current", "page"); else $(id).removeAttribute("aria-current");
    }
    if (tab !== visibleTab) {
      visibleTab = tab;
      window.dispatchEvent(new CustomEvent("surf:tab", { detail: { tab } }));
    }
    if (next) {
      sessionRequest = SurfSession.parse(location.hash);
      sessionScroll = Boolean(sessionRequest.day);
      hourScroll = sessionRequest.time !== null;
      const spot = byId.get(sessionRequest.spotId);
      // An unknown or missing spot leaves the tab without one, rather than opening a default spot.
      if (!spot && location.hash !== "#surf") { location.replace("#surf"); return; }
      if (!spot) showNoSpot();
      else if (spot.id !== currentSpot?.id || changed) loadSpot(spot);
      else { simulationTime = sessionRequest.time; render(); }
      // Go straight to the hourly forecast while it loads; showRequestedHour() aligns it once the data is in.
      if (hourScroll) $("surfHourlySection").scrollIntoView({ behavior: "instant", block: "start" });
    } else {
      ++generation;
      clearTimeout(simulationRefreshTimer);
      if (cameras.has(location.hash.slice(1))) cameraForecastLink(location.hash.slice(1));
    }
    if (scrollToTabTop) {
      scrollToTabTop = false;
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    }
  }
  $("surfSpot").addEventListener("change", () => { clearSpotSearch(); updateChoice(); });
  $("surfSpotSearch").addEventListener("input", updateSearch);
  $("surfSpotSearch").addEventListener("keydown", event => {
    if (event.key === "Escape") { event.preventDefault(); closeSuggestions(); return; }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!searchResults.length) { updateSearch(); return; }
      $("surfSuggestions").hidden = false; $("surfSpotSearch").setAttribute("aria-expanded", "true");
      searchIndex = (searchIndex + (event.key === "ArrowDown" ? 1 : -1) + searchResults.length) % searchResults.length;
      highlightSuggestion();
    } else if (event.key === "Enter" && !$("surfSuggestions").hidden && searchIndex >= 0) {
      event.preventDefault(); acceptSuggestion(searchIndex);
    }
  });
  $("surfSearchControl").addEventListener("focusout", event => {
    if (!$("surfSearchControl").contains(event.relatedTarget)) closeSuggestions();
  });
  $("surfChooser").addEventListener("submit", event => {
    event.preventDefault();
    if (searchEditing) {
      if (!searchResults[0]?.strong) { updateSearch(); $("surfSpotSearch").focus(); return; }
      acceptSuggestion(searchIndex >= 0 ? searchIndex : 0, false);
    }
    const choice = byId.get($("surfSpot").value);
    if (!choice) return;
    if (location.hash !== `#surf/${choice.id}`) location.hash = `surf/${choice.id}`;
    else loadSpot(choice, true);
    $("surfStatus").scrollIntoView({ behavior: "smooth", block: "start" });
  });
  hoursTable.addEventListener("click", event => {
    const cell = event.target.closest("td[data-time]");
    if (!cell || !hoursTable.contains(cell)) return;
    simulationTime = Number(cell.dataset.time); render();
  });
  hoursViewport.addEventListener("scroll", updateHoursNavigation, { passive: true });
  $("surfDaysLess").addEventListener("click", () => { hoursDayPages--; updateDayPages(); });
  $("surfDaysMore").addEventListener("click", () => { hoursDayPages++; updateDayPages(); });
  $("surfProfileTime").addEventListener("change", () => { simulationTime=Number($("surfProfileTime").value);render(); });
  $("surfCleanupOnly").addEventListener("change", render);
  window.addEventListener("hashchange", route);
  if (window.ResizeObserver) {
    new ResizeObserver(updateHoursLayout).observe(hoursViewport);
    let profileWidth = 0;
    new ResizeObserver(entries => {
      const width = Math.round(entries[0].contentRect.width);
      if (active && width > 0 && width !== profileWidth) {
        profileWidth = width;
        // A new width only redraws the hour already shown.
        renderSimulation(profileRow);
      }
    }).observe($("surfSimulationProfile"));
  }
  // Odświeżamy tylko otwartą, widoczną zakładkę. Awaria nie wywołuje pętli zapytań.
  function refreshVisible(maxAge = 1800000) {
    if (!active || !currentSpot || loading || searchEditing || $("surfSpot").value !== currentSpot.id || document.visibilityState !== "visible") return;
    const failed = !loaded?.weather || !rows.some(row => row.simulation);
    if (Date.now() - lastAttempt >= (failed ? 60000 : maxAge)) loadSpot(currentSpot, true);
  }
  setInterval(() => refreshVisible(), 60000);
  document.addEventListener("visibilitychange", () => refreshVisible(300000));
  window.addEventListener("pageshow", () => refreshVisible(300000));
  window.addEventListener("app:resume", () => refreshVisible(300000));
  window.addEventListener("online", () => refreshVisible(60000));

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
  // Refreshing starts the forecast tab without a spot, like a first visit; opening a link to a spot still shows it.
  if (performance.getEntriesByType?.("navigation")[0]?.type === "reload" && location.hash.startsWith("#surf/")) history.replaceState(history.state, "", "#surf");
  route();
});
