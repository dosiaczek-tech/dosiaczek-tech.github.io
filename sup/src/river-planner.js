import { $, escapeHtml as esc, km, toast } from './ui.js';
import { L, drawGeometry, fitLayer } from './maps.js';
import { geometryEndpoints, normalize } from './core.js';
import { RiverNetwork, riversAtPoint } from './river-routing.js';

const roles = ['start', 'finish'];
const label = role => role === 'start' ? 'Start' : 'Meta';
const coordinateName = point => `${point[1].toFixed(6)}, ${point[0].toFixed(6)}`;

export function createRiverPlanner(map, { begin, change, pickingChanged }) {
  const water = L.featureGroup().addTo(map), markers = L.featureGroup().addTo(map);
  let rivers = [], selected = null, network = null, picking = null, pendingRestore = null;
  let endpoints = { start: null, finish: null }, valid = false, loading = false;
  const status = (message, error = false) => {
    $('river-status').textContent = message; $('river-status').classList.toggle('error', error);
  };
  function setPicking(role) {
    picking = role;
    // Leaflet can interpret two quick endpoint taps as a double tap and zoom
    // into the finish after routing. Keep both endpoints in view in this mode;
    // pinch zoom, the wheel and +/- remain available.
    if (role || selected) map.doubleClickZoom.disable(); else map.doubleClickZoom.enable();
    for (const name of roles) $(`pick-river-${name}`).setAttribute('aria-pressed', String(role === name));
    $('journal-map').closest('.journal-workspace').classList.toggle('picking-river', Boolean(role));
    pickingChanged();
  }
  function controls() {
    for (const role of roles) { $(`river-${role}`).disabled = !selected; $(`pick-river-${role}`).disabled = !rivers.length; }
    $('route-river').disabled = !network;
    $('fit-drawn-river').disabled = !rivers.length;
  }
  function renderMarkers() {
    markers.clearLayers();
    for (const role of roles) {
      const endpoint = endpoints[role]; if (!endpoint) continue;
      const point = network?.snap(endpoint.coordinates)?.coordinates ?? endpoint.coordinates;
      const marker = L.marker([point[1], point[0]], {
        draggable: true, keyboard: true, title: `${label(role)}: ${endpoint.name} — przeciągnij, aby zmienić`,
        icon: L.divIcon({ className: 'river-draft-marker', iconSize: [25, 25], iconAnchor: [12.5, 12.5], html: `<span>${role === 'start' ? 'S' : 'M'}</span>` })
      }).addTo(markers);
      marker.bindTooltip(`${label(role)}: ${esc(endpoint.name)}`);
      marker.on('dragend', () => {
        const point = marker.getLatLng(); choosePoint(role, [point.lng, point.lat]);
      });
    }
  }
  function invalidate() { valid = false; change(null); }
  function resolveInput(role) {
    const value = $(`river-${role}`).value.trim();
    if (endpoints[role]?.name === value) return endpoints[role];
    const matches = selected?.sites.filter(site => [siteLabel(site), site.name, ...(site.aliases ?? [])].some(name => normalize(name) === normalize(value))) ?? [];
    const site = matches.length === 1 ? matches[0] : null;
    if (site) return { name: siteLabel(site), coordinates: site.coordinates };
    const pair = value.match(/^(-?\d+(?:\.\d+)?)\s*[,;]\s*(-?\d+(?:\.\d+)?)$/);
    if (pair && Math.abs(Number(pair[1])) <= 90 && Math.abs(Number(pair[2])) <= 180) return { name: value, coordinates: [Number(pair[2]), Number(pair[1])] };
    return null;
  }
  function acceptResult(result, fit) {
    valid = true;
    change({ ...result, riverRoute: { river: selected.name, fromName: endpoints.start.name, toName: endpoints.finish.name }, fit });
    const snapped = result.snaps.some(snap => snap.distanceKm > .01);
    status(`Gotowe: ${km(result.distanceKm)} km po wodzie.${snapped ? ' Końce dopasowano do koryta rzeki.' : ''} Dystans według mapy; dokładny ślad przebytej drogi możesz wczytać z GPX.`);
    setPicking(null);
  }
  function calculate({ fit = false, explicit = false } = {}) {
    if (!network) return;
    for (const role of roles) endpoints[role] = resolveInput(role);
    renderMarkers();
    if (!endpoints.start || !endpoints.finish) {
      status(explicit ? 'Wybierz start i metę z podpowiedzi, wpisz współrzędne lub wskaż oba punkty na mapie.' : 'Uzupełnij oba końce trasy. Wybierz podpowiedź miejsca albo wskaż punkt na mapie.', explicit);
      return;
    }
    try {
      const result = network.route(endpoints.start.coordinates, endpoints.finish.coordinates);
      acceptResult(result, fit);
    } catch (error) { valid = false; status(error.message, true); toast(error.message); }
  }
  function identifyRiver(from, to = null) {
    let matches = riversAtPoint(rivers, from);
    if (to) {
      const finishes = new Map(riversAtPoint(rivers, to).map(match => [match.river.name, match.distanceKm]));
      matches = matches.filter(match => finishes.has(match.river.name)).map(match => ({ ...match, distanceKm: match.distanceKm + finishes.get(match.river.name) })).sort((a, b) => a.distanceKm - b.distanceKm);
    }
    if (!matches.length) throw new Error(to ? 'Nie znaleziono jednej rzeki przy obu końcach. Wybierz rzekę i wskaż start oraz metę bliżej jej koryta.' : 'Nie znaleziono rzeki w tym miejscu (do 150 m). Przybliż mapę lub wybierz rzekę z listy.');
    if (matches[1] && matches[1].distanceKm - matches[0].distanceKm < .02) throw new Error(`W tym miejscu są różne szlaki: ${matches.slice(0, 3).map(match => match.river.name).join(', ')}. Wybierz rzekę z listy powyżej.`);
    return matches[0].river;
  }
  function choosePoint(role, coordinates) {
    if (!network) {
      try { selectRiver(identifyRiver(coordinates).name, { fit: false }); }
      catch (error) { status(error.message, true); toast(error.message); return; }
    }
    const snap = network.snap(coordinates);
    if (!snap) {
      // A rejected drag must not leave the marker away from its saved endpoint.
      renderMarkers();
      const message = 'Wskaż punkt bliżej wyróżnionej rzeki (do 150 m). Przybliż mapę, aby zaznaczyć dokładne miejsce.';
      status(message, true); toast(message);
      return;
    }
    invalidate();
    endpoints[role] = { name: coordinateName(snap.coordinates), coordinates: snap.coordinates };
    $(`river-${role}`).value = endpoints[role].name;
    if (!endpoints.finish) setPicking('finish');
    else if (!endpoints.start) setPicking('start');
    calculate();
  }
  const siteLabel = site => {
    const repeated = selected.sites.filter(candidate => normalize(candidate.name) === normalize(site.name)).length > 1;
    return `${site.approximate ? '≈ ' : ''}${site.name}${repeated ? ` · ${coordinateName(site.coordinates)}` : ''}`;
  };
  function selectRiver(name, { fit = true } = {}) {
    selected = rivers.find(river => river.name === name) ?? null;
    network = selected ? new RiverNetwork(selected.lines) : null;
    water.clearLayers(); markers.clearLayers(); endpoints = { start: null, finish: null }; valid = false;
    for (const role of roles) $(`river-${role}`).value = '';
    $('river-name').value = selected?.name ?? '';
    $('river-places').innerHTML = (selected?.sites ?? []).map(site => `<option value="${esc(siteLabel(site))}"></option>`).join('');
    if (selected) {
      drawGeometry({ type: 'MultiLineString', coordinates: selected.lines }, { color: '#538bb4', weight: 4, opacity: .6, interactive: false }).addTo(water);
      if (fit) fitLayer(map, water);
      status('Wskaż start i metę na wyróżnionej rzece albo wybierz miejsca z podpowiedzi.');
    } else status('Naciśnij „Wskaż start na mapie” albo wybierz rzekę i miejsca z podpowiedzi.');
    controls(); setPicking(selected ? 'start' : null);
  }
  function reset() {
    pendingRestore = null; selected = null; network = null; endpoints = { start: null, finish: null }; valid = false;
    water.clearLayers(); markers.clearLayers();
    $('river-name').value = ''; $('river-places').innerHTML = '';
    for (const role of roles) $(`river-${role}`).value = '';
    controls(); setPicking(null);
    status('Naciśnij „Wskaż start na mapie” albo wybierz rzekę i miejsca z podpowiedzi.');
  }
  function restore(trip) {
    reset();
    if (!trip.riverRoute) return;
    if (!rivers.length) { pendingRestore = trip; return; }
    selectRiver(trip.riverRoute.river, { fit: false });
    if (!selected) { status('Ta rzeka jest teraz niedostępna. Zachowano zapisany przebieg; możesz edytować dane wyprawy.'); return; }
    const [start, finish] = geometryEndpoints(trip.geometry);
    endpoints = { start: { name: trip.riverRoute.fromName, coordinates: start }, finish: { name: trip.riverRoute.toName, coordinates: finish } };
    for (const role of roles) $(`river-${role}`).value = endpoints[role].name;
    valid = true; renderMarkers(); setPicking(null);
    status('Wczytano zapisany przebieg. Zmiana startu lub mety wyznaczy trasę ponownie.');
  }
  async function load() {
    if (loading) return;
    loading = true; $('retry-rivers').hidden = true;
    try {
      const response = await fetch(new URL('../data/river-network.json', import.meta.url));
      if (!response.ok) throw new Error('Brak danych rzek.');
      const data = await response.json();
      if (data.version !== 1 || !Array.isArray(data.rivers) || !data.rivers.length) throw new Error('Nieprawidłowe dane rzek.');
      rivers = data.rivers;
      $('river-name').innerHTML = '<option value="">Rozpoznaj po wskazaniu startu na mapie</option>' + rivers.map(river => `<option value="${esc(river.name)}">${esc(river.name)}</option>`).join('');
      $('river-name').disabled = false;
      $('river-coverage').textContent = `Dostępne przebiegi: ${rivers.length} rzek i kanałów. Zasięg danych pokazuje wyróżniona linia; nie wszystkie odcinki mają ciągłe połączenie.`;
      if (pendingRestore) restore(pendingRestore);
    } catch {
      $('river-name').innerHTML = '<option value="">Rzeki chwilowo niedostępne</option>';
      status('Nie udało się wczytać przebiegów rzek. Ponów próbę. Rysowanie ręczne i GPX nadal działają.', true);
      $('retry-rivers').hidden = false;
    } finally { loading = false; controls(); }
  }
  $('river-name').addEventListener('change', () => {
    const name = $('river-name').value;
    if (!begin()) { $('river-name').value = selected?.name ?? ''; return; }
    pendingRestore = null; selectRiver(name); invalidate();
  });
  for (const role of roles) {
    $(`pick-river-${role}`).addEventListener('click', () => {
      if (!rivers.length || !begin()) return;
      // River selection already arms the start; pressing its action must not
      // turn picking off. The same applies to the automatically armed finish.
      setPicking(role);
      status(`Wskaż ${role === 'start' ? 'start' : 'metę'}, dotykając ${selected ? 'wyróżnionej rzeki' : 'rzeki'} na mapie. ${selected ? '' : 'Rzeka zostanie rozpoznana automatycznie.'}`);
      const container = map.getContainer();
      container.focus({ preventScroll: true });
      container.scrollIntoView({ behavior: 'instant', block: 'center' });
      map.invalidateSize({ pan: false });
    });
    $(`river-${role}`).addEventListener('input', () => { invalidate(); endpoints[role] = resolveInput(role); renderMarkers(); status('Wybierz podpowiedź lub wskaż punkt na mapie.'); });
    $(`river-${role}`).addEventListener('change', () => calculate({ fit: true }));
    $(`river-${role}`).addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); invalidate(); calculate({ fit: true, explicit: true }); }
    });
  }
  $('route-river').addEventListener('click', () => { invalidate(); calculate({ fit: true, explicit: true }); });
  $('retry-rivers').addEventListener('click', load);
  map.on('click', event => { if (picking) choosePoint(picking, [event.latlng.lng, event.latlng.lat]); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') setPicking(null); });
  void load();
  return {
    reset, restore,
    fitDrawn(from, to) {
      try {
        const river = identifyRiver(from, to), candidate = new RiverNetwork(river.lines);
        // Route before replacing the sketch: failures leave the original intact.
        const result = candidate.route(from, to);
        if (!begin({ converting: true })) return;
        selectRiver(river.name, { fit: false });
        for (const [index, role] of roles.entries()) {
          const coordinates = result.snaps[index].coordinates;
          endpoints[role] = { name: coordinateName(coordinates), coordinates };
          $(`river-${role}`).value = endpoints[role].name;
        }
        renderMarkers(); acceptResult(result, true);
        toast('Prosta została zastąpiona przebiegiem po zakrętach rzeki. Zapisz wyprawę.');
      } catch (error) { status(error.message, true); toast(error.message); }
    },
    get pending() { return (Boolean(selected) || Boolean(picking)) && !valid; },
    get hint() { return picking ? `Wskaż ${picking === 'start' ? 'start' : 'metę'} na ${selected ? 'wyróżnionej rzece' : 'rzece — rozpoznamy ją automatycznie'}. Linia zostanie wyznaczona po jej zakrętach.` : null; }
  };
}
