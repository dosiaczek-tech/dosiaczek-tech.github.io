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
  const quality = M.scoreLabel;
  const scoreNode = score => { const e = node("span", `${fmt(score, 0)}/10`, "surf-score"); e.dataset.quality = !M.finite(score) ? "unknown" : score >= 6 ? "good" : score < 4 ? "poor" : "fair"; return e; };
  let currentSpot = null, loaded = null, rows = [], selectedDay = null, generation = 0, active = false, loading = false;
  let lastAttempt = 0;
  let spotMap = null, windMap = null;
  let simulation = null, simulationTime = null;
  let searchResults = [], searchIndex = -1, searchEditing = false, acceptedSearchId = null;

  function populateSpots() {
    $("surfSpot").replaceChildren(...SurfSearch.groupWestToEast(spots).map(group => {
      const el = document.createElement("optgroup"); el.label = group.town;
      el.append(...group.spots.map(s => { const option = node("option", `${s.town} — ${s.name}`); option.value = s.id; return option; }));
      return el;
    }));
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
    $("windyLink").href = `https://www.windy.com/?waves,${s.lat},${s.lon},9`;
    const params = new URLSearchParams({ lat: s.lat, lon: s.lon, detailLat: s.lat, detailLon: s.lon, width: 1000, height: 420,
      zoom: 8, level: "surface", overlay: "waves", product: "ecmwf", menu: "", message: "", marker: "true", calendar: "now", pressure: "", type: "map", location: "coordinates", detail: "", metricWind: "m/s", metricTemp: "°C" });
    const url = `https://embed.windy.com/embed2.html?${params}`;
    if ($("windyFrame").getAttribute("src") !== url) $("windyFrame").src = url;
  }

  function renderSpotNotes() {
    const s = currentSpot, body = $("surfLocalBody");
    $("surfLocalTitle").textContent = `${s.town} — ${s.community ? s.name : "orientacja plaży"}`;
    body.replaceChildren();
    body.append(node("p", `Od lądu ku morzu: ${compass(s.normal)}. Onshore: wiatr z okolic ${compass(s.normal)} (±22,5°). Offshore: z okolic ${compass((s.normal + 180) % 360)} (±22,5°). Pomiędzy nimi rozróżniamy cross-on (boczny do brzegu), cross i cross-off (boczny od brzegu). Poniżej 1,5 m/s wiatr jest słaby. Pod komórkami fal pokazujemy dodatkowo wiatr względem kierunku samej fali.`, "surf-small"));
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
    svg.setAttribute("aria-label", "Prognozowana wysokość fal przy spocie, do 500 metrów od brzegu, na pięć dni");
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

  function renderHours() {
    const everyHour = $("surfHourly").checked;
    const localHour = time => Number(date(time, { hour: "2-digit", hourCycle: "h23" }));
    $("surfHours").replaceChildren(...rows.filter(r => dayKey(r.time) === selectedDay)
      .filter((r, i) => everyHour || i === 0 || localHour(r.time) % 3 === 0).map(r => {
        const tr = node("tr"); tr.dataset.night = String(!r.daylight);
        const waveDirection = r.simulation?.direction;
        const windText = r.wind ? `BS Wind: z ${compass(r.wind.direction)} · ${fmt(r.wind.speed)} m/s · ${M.windRelativeToWave(r.wind, waveDirection) || "kierunek niepewny"}` : "BS Wind: brak danych";
        const cell = (content, withWind = false) => {
          const td = node("td"); td.append(typeof content === "string" ? document.createTextNode(content) : content);
          if (withWind) td.append(node("small", windText, "surf-cell-wind"));
          tr.append(td);
        };
        let end = r.time + 3600;
        // Granice 00/03/06… w czasie polskim, także przy zmianie czasu letniego.
        if (!everyHour) while (localHour(end) % 3 !== 0) end += 3600;
        end = Math.min(end, rows[rows.length - 1].time + 3600);
        const repeatedHour = dayKey(end) === dayKey(r.time) && hour(end) === hour(r.time);
        const withZone = time => date(time, { hour: "2-digit", minute: "2-digit", timeZoneName: "short" });
        const interval = repeatedHour ? `${withZone(r.time)}–${withZone(end)}` : `${hour(r.time)}–${dayKey(end) !== dayKey(r.time) ? "24:00" : hour(end)}`;
        if (r.simulation) {
          const button = node("button", interval, "text-button"); button.type = "button";
          button.title = "Pokaż przekrój symulacji SWAN dla tej godziny";
          button.addEventListener("click", () => { simulationTime = r.time; render(); $("surfSimulation").scrollIntoView({ behavior: "smooth", block: "start" }); });
          cell(button);
        } else cell(interval);
        cell(scoreNode(r.score));
        cell(r.simulation ? `~${fmt(r.simulation.height)} m` : "Brak danych przy brzegu", true);
        cell(`${fmt(r.period)} s`, true);
        cell(M.finite(r.energyKJm2) ? `~${fmt(r.energyKJm2, 2)} kJ/m²` : "—", true);
        cell(compass(r.direction));
        cell(r.wind ? `${compass(r.wind.direction)} · ${fmt(r.wind.speed)} m/s` : "Brak wiatru");
        cell(M.windRelative(r.wind, currentSpot) || "—");
        cell(r.simulation ? `~${Math.round(r.simulation.shoreDistance)} m od brzegu · ${fmt(r.simulation.depth)} m głębokości` : "—");
        return tr;
      }));
    $("surfDays").querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.day === selectedDay)));
  }

  function renderSimulation(row) {
    const info = $("surfSimulationInfo"), plot = $("surfSimulationProfile");
    info.replaceChildren(); plot.replaceChildren();
    if (!simulation) { info.append(node("p", "Wczytywanie wyników SWAN…", "surf-small")); return; }
    if (simulation.status !== "ready") {
      info.append(node("p", "Brak potwierdzonej prognozy w strefie do 500 m od brzegu. Nie zastępujemy jej wartościami z dalszego morza.", "surf-small"));
      if (simulation.error) info.append(node("p", `Powód: ${simulation.error}`, "surf-small"));
      return;
    }
    info.append(node("p", `Prognoza ${simulation.engine} · obliczono ${day(simulation.generatedAt)} ${hour(simulation.generatedAt)} · wiatr do symulacji pobrano ${day(simulation.windFetchedAt)} ${hour(simulation.windFetchedAt)}.`, "surf-small"));
    if (simulation.reusedInputs) info.append(node("p", `Obliczono nowy profil na ostatnim poprawnie pobranym zestawie prognoz. Dane wejściowe fal pobrano ${day(simulation.boundaryFetchedAt)} ${hour(simulation.boundaryFetchedAt)}. Daty pozostają oryginalne; pobieranie nowszych danych było chwilowo niedostępne.`, "surf-small"));
    if (!row?.simulation) {
      info.append(node("p", "Brak aktualnego wyniku z potwierdzoną odległością do 500 m od brzegu na tę godzinę. Nie wystawiamy oceny sesji na podstawie dalszego morza.", "surf-small")); return;
    }
    const s = row.simulation;
    $("surfProfileTime").value = String(row.time);
    const summary = node("p");
    summary.append(node("strong", `${day(row.time)} ${hour(row.time)} · fala przy spocie ~${fmt(s.height)} m`), document.createTextNode(` · około ${Math.round(s.shoreDistance)} m od brzegu · głębokość ${fmt(s.depth)} m · czas między falami ${fmt(s.period)} s · moc ${fmt(s.powerKWm, 2)} kW/m.`));
    info.append(summary);
    info.append(node("p", s.breaking ? `Modelowa strefa załamania: fala ~${fmt(s.breaking.height)} m, głębokość ${fmt(s.breaking.depth)} m, około ${Math.round(s.breaking.shoreDistance)} m od brzegu. Kryterium: co najmniej 10% fal załamujących się.`
      : "Model nie wskazuje wyraźnej strefy załamania w rozpoznanych pierwszych 500 m. Wysokość dotyczy wybranego płytkiego punktu, możliwie bliskiego głębokości 2 m — nie jest pomiarem ściany łamiącej się fali.", "surf-small"));
    info.append(node("p", `Położenie brzegu szacujemy z mapy dna. Odległość punktu mieści się w przedziale ${Math.round(s.shoreDistanceMin)}–${Math.round(s.shoreDistanceMax)} m względem rozpoznanej granicy ląd–woda. Rozdzielczość danych wynosi około 100 m.`, "surf-small"));
    if (row.simulationWind) info.append(node("p", `Wiatr użyty w SWAN przy plaży: z ${compass(row.simulationWind.direction)}, ${fmt(row.simulationWind.speed)} m/s${row.simulationWind.fallback ? " — model zastępczy przy rozbieżności konsensusu" : ""}. Tabela może już zawierać nowszy przebieg wiatru BS Wind 3.`, "surf-small"));
    const points = s.profile || [];
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
    plot.append(svg, values, node("p", "Cały przekrój: 0, 50, 100, …, 500 m od brzegu przyjętego w modelu. Zielone punkty: wyniki SWAN. Szare: granica lądu albo komórki uznane za suche / zbyt płytkie (warunek modelu, nie pomiar napływu fali). Grubsza kropka zaznacza punkt podsumowania — nie początek wykresu. Położenie rzeczywistej linii wody jest przybliżone.", "surf-small"));
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

  function render() {
    if (!loaded || !active) return;
    rows = M.buildCoastalForecast(currentSpot, loaded.weather?.data, simulation);
    $("surfContent").hidden = false;
    const now = rows.find(r => r.time === simulationTime && r.simulation) || rows.find(r => r.time * 1000 <= Date.now() && r.time * 1000 > Date.now() - 3600000);
    const stale = loaded.weather?.stale;
    const stamps = [loaded.weather].filter(Boolean).map(r => r.fetchedAt);
    const errors = [...loaded.errors, ...[loaded.weather].filter(r => r?.error).map(r => r.error)];
    $("surfStatus").dataset.state = stale ? "stale" : errors.length ? "error" : "ready";
    $("surfStatus").textContent = `${stale ? "UWAGA: dane z pamięci, odświeżenie nie powiodło się. " : ""}Wiatr pobrano: ${stamps.map(t => `${day(t / 1000)} ${hour(t / 1000)}`).join(" / ") || "brak danych"}. ${loaded.weather?.sourceType === "scheduled" ? "BS Wind 3, aktualizacja serwerowa co 3 h" : "BS Wind 3, pobranie bezpośrednie"}. ${rows.filter(r => r.simulation).length}/${rows.length} godzin z prognozą fal do 500 m od brzegu. ${errors.join(" ")}`;
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
      ["Wiatr przy plaży", `${fmt(now?.wind?.speed)} m/s`, `Z ${compass(now?.wind?.direction)} · porywy ${fmt(now?.wind?.gust)} m/s`],
      ["Moc fal przy spocie", M.finite(now?.powerKWm) ? `~${fmt(now.powerKWm, 2)} kW/m` : "—", "W tym samym punkcie, do 500 m od brzegu"],
      ["Energia fal przy spocie", M.finite(now?.energyKJm2) ? `~${fmt(now.energyKJm2, 2)} kJ/m²` : "—", "Na m² powierzchni wody w punkcie prognozy"],
       [now ? `Pomocnicza ocena · ${hour(now.time)}` : "Teraz — brak danych", `${fmt(now?.score, 0)} / 10`, `${quality(now?.score, now?.height)} · ${now?.simulation ? "fale przy spocie + wiatr" : "brak prognozy przy brzegu"}`]
    ];
    $("surfNow").replaceChildren(...items.map(([title, value, desc]) => { const el = node("div", undefined, "surf-metric"); el.append(node("small", title), node("strong", value), node("p", desc)); return el; }));
    $("surfFlags").replaceChildren(...(now?.flags || []).map(f => node("span", f)));
    renderSequence(now);
    if (!windMap && window.SurfWindMap) windMap = SurfWindMap.create();
    windMap?.update(currentSpot, now?.wind, simulation?.shoreline, now?.simulation);
    const wind = now?.wind;
    $("surfWindDescription").textContent = `${now ? `${day(now.time)} ${hour(now.time)} · ` : ""}${M.finite(wind?.direction) && M.finite(wind?.speed) && wind.speed >= .5 ? `Wiatr z ${compass(wind.direction)} → ku ${compass((wind.direction + 180) % 360)}, ${fmt(wind.speed)} m/s · ${M.windRelative(wind, currentSpot)}.` : M.finite(wind?.speed) && wind.speed < .5 ? "Cisza — bez strzałki kierunku." : "Brak pewnego kierunku wiatru — bez strzałki."}`;
    const profileRows = rows.filter(r => r.simulation?.profile.length === 11);
    $("surfProfileTime").replaceChildren(...profileRows.map(r => { const option=node("option",`${day(r.time)} · ${hour(r.time)}`);option.value=r.time;return option; }));
    $("surfProfileTime").disabled = !profileRows.length;
    renderSimulation(rows.find(r => r.time === simulationTime) || now || profileRows[0] || rows[0]);
    const windows = M.bestWindows(rows.filter(r => r.time * 1000 >= Date.now() && r.simulation), 3, { cleanupOnly: $("surfCleanupOnly").checked });
    $("surfWindows").replaceChildren(...windows.map(w => {
      const button = node("button", undefined, "surf-window"); button.type = "button";
      button.append(node("span", `${day(w.start)} · ${hour(w.start)}–${hour(w.end)}`), node("strong", `${w.score}/10 · ${quality(w.score, w.minHeight)}`), node("small", `Fale przy spocie ~${fmt(w.minHeight)}–${fmt(w.maxHeight)} m · strefa do 500 m · pokaż dzień →`));
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
    modelRow("Fale przy spocie", now?.simulation ? `SWAN · ~${fmt(now.height)} m · ~${Math.round(now.simulation.shoreDistance)} m od brzegu` : "Brak potwierdzonej prognozy do 500 m");
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
    currentSpot = spot; loaded = null; rows = []; selectedDay = null; simulation = null; simulationTime = null;
    loading = true;
    if (acceptedSearchId !== spot.id) clearSpotSearch();
    else closeSuggestions();
    $("surfSpot").value = spot.id;
    $("surfTab").href = `#surf/${spot.id}`;
    $("surfContent").hidden = true;
    updateChoice();
    $("surfStatus").dataset.state = "loading";
    $("surfStatus").textContent = `Pobieram prognozę dla: ${spot.town}, ${spot.name}…`;
    document.title = `${spot.town} — prognoza surfingu | Nad morzem`;
    if (!spotMap && window.SurfSpotMap) {
      spotMap = SurfSpotMap.create({ spots, region: "all", selectedId: spot.id,
        onSelect: id => { clearSpotSearch(); $("surfSpot").value = id; updateChoice(); location.hash = `surf/${id}`; } });
    } else if (spotMap) {
      spotMap.resize();
      spotMap.select(spot.id);
    }
    renderSpotNotes();
    setMap();
    SurfAPI.nearshore(spot, force).then(result => { if (token === generation && active) { simulation = result; render(); } });
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
    } finally { if (token === generation) { loading = false; updateChoice(); } }
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
      if (cameras.has(location.hash.slice(1))) cameraForecastLink(location.hash.slice(1));
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
  $("surfHourly").addEventListener("change", renderHours);
  $("surfProfileTime").addEventListener("change", () => { simulationTime=Number($("surfProfileTime").value);selectedDay=dayKey(simulationTime);render(); });
  $("surfCleanupOnly").addEventListener("change", render);
  window.addEventListener("hashchange", route);
  if (window.ResizeObserver) {
    let profileWidth = 0;
    new ResizeObserver(entries => {
      const width = Math.round(entries[0].contentRect.width);
      if (active && width > 0 && width !== profileWidth) {
        profileWidth = width;
        renderSimulation(rows.find(r => r.time === simulationTime) || rows.find(r => r.simulation));
      }
    }).observe($("surfSimulationProfile"));
  }
  // Odświeżamy tylko otwartą, widoczną zakładkę. Awaria nie wywołuje pętli zapytań.
  setInterval(() => {
    if (active && currentSpot && !searchEditing && $("surfSpot").value === currentSpot.id && document.visibilityState === "visible" && Date.now() - lastAttempt >= 1800000) loadSpot(currentSpot);
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
