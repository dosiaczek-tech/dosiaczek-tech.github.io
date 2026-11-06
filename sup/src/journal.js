import { $, icon, escapeHtml as esc, km, displayDate, localDate, toast, download } from './ui.js';
import { geometryLength, validateTrip, parseBackup, mergeTrips, routeColor, CATALOG_GEOMETRY_KINDS, reconcileCatalogTrips } from './core.js';
import { createMap, L, drawGeometry, drawLegacyLocations, fitLayer, POLAND } from './maps.js';
import { parseGpx } from './gpx.js';
import { createJournalStore } from './journal-store.js';
import { mergeJournals, SyncCancelled } from './sync-core.js';
import { createRiverPlanner } from './river-planner.js';

const WATER_NAMES = { river: 'Rzeka', lake: 'Jezioro / zbiornik', mixed: 'Rzeka + jezioro' };
const KIND_NAMES = { drawn: 'rysunek ręczny · proste odcinki', gpx: 'ślad GPX', 'river-route': 'własna trasa po rzece · dystans z linii', 'osm-waterway': 'koryto OSM · dystans ze źródła', 'water-route': 'przebieg po wodzie · dystans ze źródła', schematic: 'starszy wpis — brak aktualnego przebiegu · dystans ze źródła' };
const DEFAULT_GEOMETRY_NOTE = 'Zaznacz start i metę. Linia i kilometraż uwzględnią zakręty rzeki według danych mapy.';
const MANUAL_GEOMETRY_NOTE = 'Rysunek ręczny — odległość jest sumą prostych odcinków między punktami.';
const kindName = (kind, estimated, section) => section ? 'wybrany odcinek · dystans z linii po wodzie' : estimated ? KIND_NAMES[kind].replace('dystans ze źródła', 'dystans szacunkowy') : KIND_NAMES[kind];
const newId = () => globalThis.crypto?.randomUUID?.() ?? `trip-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function createJournal() {
  const store = createJournalStore(localStorage);
  const map = createMap('journal-map', 'journal-tile-error');
  const savedLayers = L.featureGroup().addTo(map), draftLayers = L.featureGroup().addTo(map);
  let trips = [], tripLayers = new Map(), editingId = null, editBaseline = null, activeId = null;
  let catalogFeatures = new Map();
  let geometry = { type: 'LineString', coordinates: [] }, geometryKind = 'drawn', sourceRouteId = null, sourceDistance = null, distanceEstimated = false;
  let drawing = false, dirty = false, draftLine = null, readonlyStorage = false;
  let sourceSection = null;
  let riverRoute = null, riverPlanner = null, suggestedName = '';
  const form = $('trip-form');
  $('trip-date').value = localDate(); $('trip-date').max = localDate();

  function showError(message, storage = false) {
    const target = $(storage ? 'storage-error' : 'form-error');
    target.textContent = message; target.hidden = false;
  }
  function storageFailure(error, reading = false) {
    showError(reading ? `Nie można odczytać dziennika: ${error.message} Istniejące dane pozostają zachowane; zapis jest wstrzymany. Przycisk „Eksportuj” pozwala pobrać surową kopię, jeśli pamięć jest dostępna.` : `Nie udało się zapisać: ${error.message} Szkic pozostaje w formularzu. Sprawdź dostępne miejsce i uprawnienia pamięci przeglądarki.`, true);
  }
  try { trips = store.read().trips; } catch (error) { readonlyStorage = true; storageFailure(error, true); }

  function notify(origin = 'local') { document.dispatchEvent(new CustomEvent('sup:journal-change', { detail: { origin } })); }
  function commit(change, { metadata, origin = 'local' } = {}) {
    if (readonlyStorage) { showError('Zapis jest wstrzymany — najpierw rozwiąż problem odczytu dziennika.'); return false; }
    try {
      const current = store.read().trips;
      trips = store.write(reconcileCatalogTrips(change(current), catalogFeatures).trips, metadata);
      $('storage-error').hidden = true;
      renderTrips();
      notify(origin);
      return true;
    } catch (error) { storageFailure(error); return false; }
  }
  function draftLength() {
    return sourceDistance ?? (geometry.coordinates.length ? geometryLength(geometry) : 0);
  }
  function updateDrawingControls() {
    $('draw-toggle').setAttribute('aria-pressed', String(drawing));
    $('draw-toggle').innerHTML = `${icon(drawing ? 'check' : 'pen')}${drawing ? 'Zakończ rysowanie ręczne' : 'Rysuj ręcznie'}`;
    $('journal-map').closest('.journal-workspace').classList.toggle('drawing', drawing);
    $('undo-point').disabled = geometryKind !== 'drawn' || !geometry.coordinates.length;
    $('clear-draft').disabled = !geometry.coordinates.length;
    $('fit-drawn-river').hidden = geometryKind !== 'drawn' || geometry.coordinates.length !== 2;
    const distanceKind = sourceDistance !== null ? distanceEstimated ? ' · szacunek' : ' · ze źródła' : geometryKind === 'river-route' ? ' · po rzece' : geometryKind === 'drawn' && geometry.coordinates.length ? ' · proste odcinki' : geometry.coordinates.length ? ' · z linii' : '';
    $('draft-distance').textContent = `${distanceEstimated ? 'ok. ' : ''}${km(draftLength())} km${distanceKind}`;
    $('draw-hint').innerHTML = `${icon(drawing ? 'pen' : 'info')}<span>${drawing ? 'Rysowanie ręczne: punkty łączą się prostymi. Możesz je przeciągać lub usuwać kliknięciem.' : riverPlanner?.hint ?? (geometry.coordinates.length ? geometryKind === 'drawn' ? 'Rysunek ręczny z prostych odcinków. Przy dwóch punktach możesz wybrać „Dopasuj tę prostą do rzeki” pod mapą.' : 'Przebieg gotowy. Uzupełnij nazwę i datę w formularzu, a następnie zapisz wyprawę.' : 'Naciśnij „Wskaż start na mapie”, zaznacz start, a potem metę. Trasa podąży po zakrętach rzeki.')}</span>`;
  }
  function setDrawing(value) {
    drawing = value;
    if (drawing) $('manual-drawing').open = true;
    if (drawing) map.doubleClickZoom.disable(); else map.doubleClickZoom.enable();
    updateDrawingControls();
  }
  function renderDraft({ fit = false } = {}) {
    draftLayers.clearLayers(); draftLine = null;
    if ((geometry.type === 'LineString' && geometry.coordinates.length >= 2) || (geometry.type === 'MultiLineString' && geometry.coordinates.length)) {
      const color = sourceRouteId || editingId ? routeColor(sourceRouteId ?? editingId) : '#185b4d';
      draftLine = (geometryKind === 'schematic' ? drawLegacyLocations(geometry, color) : drawGeometry(geometry, { color, weight: 5, opacity: 1 })).addTo(draftLayers);
    }
    if (geometryKind === 'drawn') {
      geometry.coordinates.forEach((point, index) => {
        const marker = L.marker([point[1], point[0]], {
          icon: L.divIcon({ className: 'vertex-marker', iconSize: [12, 12] }), draggable: true,
          title: `Punkt ${index + 1} — przeciągnij, aby poprawić; kliknij, aby usunąć`, keyboard: true
        }).addTo(draftLayers);
        marker.on('drag', () => {
          const latlng = marker.getLatLng(); geometry.coordinates[index] = [+latlng.lng.toFixed(6), +latlng.lat.toFixed(6)];
          dirty = true;
          if (draftLine) { draftLine.clearLayers(); draftLine.addData({ type: 'Feature', properties: {}, geometry }); }
          updateDrawingControls();
        });
        marker.on('click', () => {
          geometry.coordinates.splice(index, 1); dirty = true; renderDraft();
        });
      });
    }
    updateDrawingControls();
    if (fit) fitLayer(map, draftLayers);
  }
  function mayReplaceDraft() {
    return !dirty || window.confirm('Masz niezapisany szkic lub zmiany. Zastąpić je nową trasą?');
  }
  function resetDraft() {
    geometry = { type: 'LineString', coordinates: [] }; geometryKind = 'drawn'; sourceRouteId = null; sourceDistance = null; distanceEstimated = false;
    editingId = null; editBaseline = null; dirty = false; sourceSection = null;
    riverRoute = null; suggestedName = ''; riverPlanner?.reset();
    form.reset(); $('trip-date').value = localDate(); $('trip-date').max = localDate();
    $('form-heading').textContent = 'Nowa wyprawa';
    $('save-trip').innerHTML = `${icon('check')} Zapisz przebytą trasę`;
    $('cancel-edit').hidden = true; $('form-error').hidden = true;
    $('geometry-note').textContent = DEFAULT_GEOMETRY_NOTE;
    $('manual-drawing').open = false;
    setDrawing(false); renderDraft();
  }
  function selectTrip(id) {
    activeId = id;
    const layer = tripLayers.get(id);
    if (layer) { layer.bringToFront(); fitLayer(map, layer); }
    $('saved-trips').querySelectorAll('.trip-card').forEach(card => card.classList.toggle('active', card.dataset.id === id));
    for (const [layerId, saved] of tripLayers) saved.setStyle({ weight: layerId === id ? 6 : 4, opacity: layerId === id ? 1 : .6 });
  }
  function editTrip(id) {
    if (!mayReplaceDraft()) return;
    const trip = trips.find(t => t.id === id);
    if (!trip) return;
    resetDraft(); editingId = trip.id; editBaseline = JSON.stringify(trip);
    geometry = structuredClone(trip.geometry); geometryKind = trip.geometryKind; sourceRouteId = trip.sourceRouteId;
    sourceSection = trip.sourceSection ? structuredClone(trip.sourceSection) : null;
    riverRoute = trip.riverRoute ? structuredClone(trip.riverRoute) : null;
    riverPlanner.restore(trip);
    sourceDistance = !sourceSection && CATALOG_GEOMETRY_KINDS.includes(geometryKind) ? trip.distanceKm : null;
    distanceEstimated = sourceDistance !== null && Boolean(trip.distanceEstimated);
    $('trip-name').value = trip.name; $('trip-date').value = trip.date; $('trip-water').value = trip.waterType; $('trip-notes').value = trip.notes;
    $('form-heading').textContent = 'Edytuj wyprawę'; $('save-trip').innerHTML = `${icon('check')} Zapisz zmiany`; $('cancel-edit').hidden = false;
    $('geometry-note').textContent = `Przebieg: ${kindName(geometryKind, distanceEstimated, sourceSection)}. ${sourceSection ? `${sourceSection.fromName} → ${sourceSection.toName}. ` : ''}${riverRoute ? `${riverRoute.fromName} → ${riverRoute.toName}. Możesz zmienić końce trasy powyżej.` : geometryKind === 'drawn' ? 'Możesz przeciągać i usuwać punkty albo włączyć rysowanie, aby dodać kolejne.' : 'Możesz zmienić datę i notatki. Rysowanie nowej linii zastąpi ten przebieg.'}`;
    renderDraft({ fit: true }); selectTrip(id);
    $('moje-trasy').scrollIntoView({ behavior: 'smooth', block: 'start' });
    $('trip-name').focus({ preventScroll: true });
  }
  function renderTrips() {
    const sorted = [...trips].sort((a, b) => b.date.localeCompare(a.date));
    const totalKm = trips.reduce((sum, trip) => sum + trip.distanceKm, 0);
    const estimatedTotal = trips.some(trip => trip.distanceEstimated) ? 'ok. ' : '';
    $('trip-count').textContent = trips.length; $('nav-trip-count').textContent = trips.length;
    $('trip-km').textContent = estimatedTotal + km(totalKm); $('hero-km').innerHTML = `${estimatedTotal}${km(totalKm)} <small>km</small>`;
    $('saved-trips').innerHTML = sorted.length ? sorted.map(trip => `
      <article class="trip-card ${activeId === trip.id ? 'active' : ''}" data-id="${esc(trip.id)}" style="--route-color:${routeColor(trip.sourceRouteId ?? trip.id)}">
        <div class="trip-date">${icon('calendar')}${displayDate(trip.date)}</div><h4>${esc(trip.name)}</h4>
        <p class="trip-meta"><strong>${trip.distanceEstimated ? 'ok. ' : ''}${km(trip.distanceKm)} km</strong> · ${WATER_NAMES[trip.waterType]}<br>${kindName(trip.geometryKind, trip.distanceEstimated, trip.sourceSection)}${trip.sourceSection || trip.riverRoute ? `<br>${esc((trip.sourceSection ?? trip.riverRoute).fromName)} → ${esc((trip.sourceSection ?? trip.riverRoute).toName)}` : ''}</p>
        ${trip.notes ? `<p class="trip-notes">${esc(trip.notes)}</p>` : ''}
        <div class="trip-card-actions"><button type="button" class="text-button" data-action="show">${icon('pin')} Pokaż na mapie</button><button type="button" class="icon-button" data-action="edit" aria-label="Edytuj wyprawę: ${esc(trip.name)}" title="Edytuj wyprawę">${icon('pen')}</button><button type="button" class="icon-button" data-action="delete" aria-label="Usuń wyprawę: ${esc(trip.name)}" title="Usuń wyprawę">${icon('trash')}</button></div>
      </article>`).join('') : `<div class="journal-empty">${icon('route')}<div><h3>Pierwsza kreska, początek przygody.</h3><p>Narysuj swoją trasę lub wybierz „Już tędy płynęłam” w atlasie powyżej.</p></div></div>`;
    $('saved-trips').querySelectorAll('button[data-action]').forEach(button => button.addEventListener('click', () => {
      const id = button.closest('.trip-card').dataset.id;
      if (button.dataset.action === 'show') { selectTrip(id); $('journal-map').scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      if (button.dataset.action === 'edit') editTrip(id);
      if (button.dataset.action === 'delete') {
        const trip = trips.find(t => t.id === id);
        if (window.confirm(`Usunąć wyprawę „${trip.name}”?`)) {
          if (commit(current => current.filter(t => t.id !== id))) {
            if (editingId === id) resetDraft();
            toast('Wyprawa została usunięta.');
          }
        }
      }
    }));
    savedLayers.clearLayers(); tripLayers = new Map();
    for (const trip of trips) {
      const color = routeColor(trip.sourceRouteId ?? trip.id);
      const layer = (trip.geometryKind === 'schematic' ? drawLegacyLocations(trip.geometry, color) : drawGeometry(trip.geometry, { color, weight: 4, opacity: .9 })).addTo(savedLayers);
      layer.bindTooltip(`${esc(trip.name)} · ${trip.distanceEstimated ? 'ok. ' : ''}${km(trip.distanceKm)} km`);
      layer.on('click', () => selectTrip(trip.id)); tripLayers.set(trip.id, layer);
    }
    $('show-trips').disabled = !trips.length;
  }

  riverPlanner = createRiverPlanner(map, {
    begin({ converting = false } = {}) {
      if (!converting && geometry.coordinates.length && geometryKind !== 'river-route' && !window.confirm('Wyznaczyć trasę po rzece zamiast obecnego przebiegu? Nazwa, data i notatki zostaną zachowane.')) return false;
      setDrawing(false); $('manual-drawing').open = false; return true;
    },
    change(result) {
      geometry = result?.geometry ?? { type: 'LineString', coordinates: [] };
      geometryKind = result ? 'river-route' : 'drawn'; riverRoute = result?.riverRoute ?? null;
      sourceRouteId = null; sourceDistance = null; sourceSection = null; distanceEstimated = false;
      dirty = true; $('form-error').hidden = true;
      if (result) {
        if (!$('trip-name').value || $('trip-name').value === suggestedName) {
          suggestedName = `${riverRoute.river}: ${riverRoute.fromName} – ${riverRoute.toName}`.slice(0, 100);
          $('trip-name').value = suggestedName;
        }
        $('trip-water').value = 'river';
        $('geometry-note').textContent = `Własna trasa po rzece ${riverRoute.river}: ${riverRoute.fromName} → ${riverRoute.toName}. Dystans mierzony wzdłuż koryta z danych mapy, z uwzględnieniem zakrętów.`;
      } else $('geometry-note').textContent = 'Uzupełnij start i metę, aby wyznaczyć przebieg po rzece.';
      renderDraft({ fit: Boolean(result?.fit) });
    },
    pickingChanged: updateDrawingControls
  });

  map.on('click', event => {
    if (!drawing || geometryKind !== 'drawn') return;
    if (geometry.coordinates.length >= 20000) { toast('Osiągnięto limit 20 000 punktów.'); return; }
    geometry.coordinates.push([+event.latlng.lng.toFixed(6), +event.latlng.lat.toFixed(6)]);
    dirty = true; $('form-error').hidden = true; renderDraft();
  });
  $('draw-toggle').addEventListener('click', () => {
    if (!drawing && geometryKind !== 'drawn' && geometry.coordinates.length) {
      if (!window.confirm('Narysować nowy przebieg zamiast obecnej linii? Nazwa, data i notatki zostaną zachowane.')) return;
      geometry = { type: 'LineString', coordinates: [] }; geometryKind = 'drawn'; sourceRouteId = null; sourceDistance = null; distanceEstimated = false; dirty = true;
      sourceSection = null;
      renderDraft();
    }
    if (!drawing) { riverPlanner.reset(); riverRoute = null; $('geometry-note').textContent = MANUAL_GEOMETRY_NOTE; }
    setDrawing(!drawing);
  });
  $('manual-drawing').addEventListener('toggle', () => { if (!$('manual-drawing').open && drawing) setDrawing(false); });
  $('fit-drawn-river').addEventListener('click', () => {
    if (geometryKind === 'drawn' && geometry.coordinates.length === 2) riverPlanner.fitDrawn(...geometry.coordinates);
  });
  $('undo-point').addEventListener('click', () => { if (geometryKind === 'drawn') { geometry.coordinates.pop(); dirty = true; renderDraft(); } });
  $('clear-draft').addEventListener('click', () => {
    if (!window.confirm('Wyczyścić przebieg szkicu? Nazwa, data i notatki zostaną zachowane.')) return;
    geometry = { type: 'LineString', coordinates: [] }; geometryKind = 'drawn'; sourceRouteId = null; sourceDistance = null; distanceEstimated = false; dirty = true;
    sourceSection = null;
    riverRoute = null; riverPlanner.reset();
    $('geometry-note').textContent = drawing ? MANUAL_GEOMETRY_NOTE : DEFAULT_GEOMETRY_NOTE;
    renderDraft();
  });
  $('cancel-edit').addEventListener('click', () => { if (mayReplaceDraft()) resetDraft(); });
  $('show-trips').addEventListener('click', () => { if (trips.length) fitLayer(map, savedLayers); else map.fitBounds(POLAND); });
  form.addEventListener('input', () => { dirty = true; $('form-error').hidden = true; });
  form.addEventListener('submit', event => {
    event.preventDefault();
    let trip;
    try {
      if (riverPlanner.pending) { showError('Najpierw wyznacz przebieg po rzece: wybierz prawidłowy start i metę.'); return; }
      trip = validateTrip({ id: editingId ?? newId(), name: $('trip-name').value, date: $('trip-date').value, waterType: $('trip-water').value, notes: $('trip-notes').value, distanceKm: draftLength(), distanceEstimated, geometryKind, sourceRouteId, sourceSection, riverRoute, geometry });
      if (trip.date > localDate()) throw new Error('Wybierz datę przebytej wyprawy, najpóźniej dzisiaj.');
    } catch (error) { showError(!geometry.coordinates.length ? 'Najpierw wybierz rzekę, start i metę, narysuj trasę, wybierz odcinek z atlasu lub wczytaj GPX.' : error.message); return; }
    const wasEditing = Boolean(editingId);
    if (commit(current => {
      if (editingId) {
        const stored = current.find(t => t.id === editingId);
        if (!stored || JSON.stringify(stored) !== editBaseline) throw new Error('Ten wpis zmienił się w innej karcie lub na innym urządzeniu. Otwórz ponownie jego edycję przed zapisem.');
        return current.map(t => t.id === editingId ? trip : t);
      }
      return [...current, trip];
    })) {
      resetDraft(); selectTrip(trip.id);
      toast(wasEditing ? 'Zmiany zapisane. Dziennik jest aktualny.' : 'Wyprawa zapisana. Kolejne wspomnienie na Twojej mapie!');
    }
  });

  $('export-trips').addEventListener('click', () => {
    try {
      const raw = store.raw();
      const content = readonlyStorage && raw ? raw : JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), trips }, null, 2);
      download(content, `sup-wyprawy-${localDate()}${readonlyStorage ? '-surowa-kopia' : ''}.json`);
      toast(readonlyStorage ? 'Pobrano surową kopię zapisanych danych.' : 'Kopia dziennika została przygotowana do pobrania.');
    } catch (error) { storageFailure(error); }
  });
  $('import-backup').addEventListener('change', async event => {
    const file = event.target.files[0]; if (!file) return;
    try {
      if (file.size > 15_000_000) throw new Error('Kopia jest zbyt duża (limit 15 MB).');
      const imported = parseBackup(await file.text());
      let added = 0;
      if (commit(current => { const merged = mergeTrips(current, imported); added = merged.length - current.length; return merged; })) {
        fitLayer(map, savedLayers); toast(`Dodano wyprawy: ${added}. Istniejące wpisy zachowano.`);
      }
    } catch (error) { toast(`Nie udało się zaimportować kopii: ${error.message}`); }
    finally { event.target.value = ''; }
  });
  $('import-gpx').addEventListener('change', async event => {
    const file = event.target.files[0]; if (!file) return;
    try {
      if (file.size > 8_000_000) throw new Error('GPX jest zbyt duży (limit 8 MB).');
      const parsed = parseGpx(await file.text());
      if (!mayReplaceDraft()) return;
      resetDraft(); geometry = parsed.geometry; geometryKind = 'gpx';
      $('trip-name').value = parsed.name || file.name.replace(/\.gpx$/i, '').slice(0, 100);
      if (parsed.date && parsed.date <= localDate()) $('trip-date').value = parsed.date;
      $('geometry-note').textContent = 'Ślad z GPX. Dystans jest sumą odcinków śladu; przerwy między segmentami nie są doliczane.';
      dirty = true; renderDraft({ fit: true }); toast('Ślad GPX wczytany. Uzupełnij dane i zapisz wyprawę.');
    } catch (error) { toast(`Nie udało się wczytać GPX: ${error.message}`); }
    finally { event.target.value = ''; }
  });
  document.addEventListener('keydown', event => {
    if (!drawing || ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) return;
    if (event.key === 'Escape') setDrawing(false);
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') { event.preventDefault(); $('undo-point').click(); }
  });
  window.addEventListener('beforeunload', event => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });
  window.addEventListener('storage', event => {
    try {
      if (event.key !== store.key && event.key !== null) return;
      trips = store.read().trips; readonlyStorage = false; $('storage-error').hidden = true; renderTrips(); notify('storage');
    }
    catch (error) { readonlyStorage = true; storageFailure(error, true); }
  });
  renderTrips(); renderDraft();
  if (trips.length) fitLayer(map, savedLayers);
  return {
    get profile() { return store.profile; },
    get storageKey() { return store.key; },
    readSyncState: () => store.read(),
    localCandidates: () => store.localCandidates(),
    switchProfile(profile) {
      if (JSON.stringify(store.profile) === JSON.stringify(profile)) return true;
      if (!mayReplaceDraft()) return false;
      try {
        trips = store.switchProfile(profile); readonlyStorage = false; $('storage-error').hidden = true;
        resetDraft(); activeId = null; renderTrips(); notify('profile');
        if (trips.length) fitLayer(map, savedLayers);
        return true;
      } catch (error) { storageFailure(error, true); return false; }
    },
    applySync(next, metadata, scope) {
      if (store.key !== scope) throw new SyncCancelled();
      if (!commit(() => next, { metadata, origin: 'remote' })) throw new Error('Nie zapisano lokalnej kopii synchronizacji. Sprawdź pamięć przeglądarki.');
    },
    importLocal() {
      const candidates = store.localCandidates();
      if (!store.profile) throw new Error('Najpierw zaloguj się do dziennika.');
      let conflicts = 0;
      const metadata = { importedLocal: store.localFingerprints() };
      // The guest journal remains intact as a separate local copy.
      if (!commit(current => { const merged = mergeJournals(candidates, {}, current); conflicts = merged.conflicts; return merged.trips; }, { metadata })) throw new Error('Nie udało się przenieść lokalnych wpisów.');
      return { added: candidates.length, conflicts };
    },
    completedIds: () => new Set(trips.filter(t => !t.sourceSection).map(t => t.sourceRouteId).filter(Boolean)),
    partialIds: () => new Set(trips.filter(t => t.sourceSection).map(t => t.sourceRouteId).filter(Boolean)),
    refreshCatalogue(features) {
      catalogFeatures = features;
      const update = reconcileCatalogTrips(trips, features);
      if (!update.changed || readonlyStorage) return;
      const saved = commit(current => reconcileCatalogTrips(current, features).trips);
      if (!saved) { trips = update.trips; renderTrips(); }
      if (!dirty && !editingId) fitLayer(map, savedLayers);
      if (!sourceSection && sourceRouteId && CATALOG_GEOMETRY_KINDS.includes(geometryKind) && features.has(sourceRouteId)) {
        const feature = features.get(sourceRouteId);
        geometry = structuredClone(feature.geometry); geometryKind = feature.properties.kind;
        if (saved && editBaseline) editBaseline = JSON.stringify(reconcileCatalogTrips([JSON.parse(editBaseline)], features).trips[0]);
        $('geometry-note').textContent = feature.properties.note;
        renderDraft();
      }
    },
    useCatalog(route, feature, section = null) {
      if (!mayReplaceDraft()) return false;
      resetDraft(); geometry = structuredClone(section?.geometry ?? feature.geometry); geometryKind = feature.properties.kind;
      sourceSection = section ? structuredClone(section.selection) : null;
      sourceRouteId = route.id; sourceDistance = section ? null : route.lengthKm; distanceEstimated = !section && Boolean(route.lengthEstimated);
      $('trip-name').value = `${route.river}: ${section?.from ?? route.from} – ${section?.to ?? route.to}`.slice(0, 100);
      $('trip-water').value = route.type;
      $('geometry-note').textContent = `Trasa z atlasu: ${kindName(geometryKind, distanceEstimated, sourceSection)}. ${section ? `${section.from} → ${section.to}. Wybrany przebieg zostanie zachowany przy aktualizacji katalogu. ` : ''}${distanceEstimated ? route.lengthNote + ' ' : ''}${feature.properties.note}`;
      dirty = true; renderDraft({ fit: true });
      return true;
    }
  };
}
