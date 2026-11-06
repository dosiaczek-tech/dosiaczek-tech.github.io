import 'leaflet/dist/leaflet.css';
import './style.css';
import { $, icon, decorateIcons, escapeHtml as esc, routeKm, toast, displayDate } from './ui.js';
import { LEVELS, OBSTACLES, filterRoutes, routeColor } from './core.js';
import { createMap } from './maps.js';
import { createAtlasLayers } from './atlas-map.js';
import { createJournal } from './journal.js';
import { createAccessPicker } from './access-picker.js';
import { geometryKey } from './access.js';
import { setupCloudSync } from './cloud-sync.js';

decorateIcons();
$('refresh-app').addEventListener('click', () => window.location.reload());
const journal = createJournal();
const map = createMap('atlas-map', 'atlas-tile-error');
const atlas = createAtlasLayers(map, selectRoute);
let routes = [], geometries = new Map(), visibleRoutes = [], selectedId = null;
let access = { sites: [], routes: {} }, sites = new Map(), accessPicker = null, selectedSection = null;

function closeDetail() {
  selectedId = null; $('route-detail').hidden = true;
  selectedSection = null; accessPicker = null;
  $('route-list').querySelectorAll('.route-card').forEach(card => { card.classList.remove('selected'); card.setAttribute('aria-pressed', 'false'); });
  atlas.highlight(null);
}
function selectRoute(id) {
  const route = routes.find(r => r.id === id), feature = geometries.get(id);
  if (!route || !feature) return;
  selectedId = id;
  selectedSection = null;
  $('route-list').querySelectorAll('.route-card').forEach(card => { const selected = card.dataset.id === id; card.classList.toggle('selected', selected); card.setAttribute('aria-pressed', String(selected)); });
  const level = LEVELS[route.difficulty];
  const panel = $('route-detail');
  panel.innerHTML = `
    <button class="icon-button close-detail" type="button" aria-label="Zamknij szczegóły">${icon('close')}</button>
    <p class="eyebrow"><i class="route-color-dot" style="background:${routeColor(route.id)}"></i>${esc(route.region)}</p><h3 tabindex="-1">${esc(route.river)}</h3>
    <p class="detail-endpoints">${esc(route.from)} ${icon('arrow')} ${esc(route.to)}</p>
    <div class="detail-tags"><span class="badge ${route.difficulty}"><i class="dot"></i>${level.label} na SUP</span><span class="badge neutral">${route.type === 'mixed' ? 'Rzeka + jezioro' : 'Rzeka'}</span></div>
    <div class="detail-metrics"><div><strong>${routeKm(route)} <small>km</small></strong><span>${route.lengthEstimated ? 'długość szacunkowa' : 'długość wg źródła'}</span></div><div>${icon(route.obstacles === 'many' ? 'tree' : 'waves')}<span>${OBSTACLES[route.obstacles]}</span></div></div>
    <section class="access-picker" aria-label="Miejsca dostępu i wybór odcinka"></section>
    <p>${esc(route.description)}</p>
    ${route.sourceDuration ? `<p class="source-duration">${icon('calendar')} Czas w źródle: ${esc(route.sourceDuration)}. Czas na SUP może być inny.</p>` : ''}
    ${route.accessNote ? `<div class="route-access"><strong>Przebieg i dostępność</strong><p>${esc(route.accessNote)}</p></div>` : ''}
    <dl class="route-facts"><dt>Nurt i charakter</dt><dd>${esc(route.current)}</dd><dt>Zwałki i przeszkody</dt><dd>${esc(route.obstacleNote)}</dd><dt>Przenoski</dt><dd>${esc(route.portages)}</dd></dl>
    <div class="sup-assessment"><strong>${icon('compass')} Nasza interpretacja dla SUP</strong><p>${esc(route.supNote)}</p><p class="source-grade">W źródle kajakowym: ${esc(route.sourceDifficulty)}.</p></div>
    <div class="detail-source"><strong>Przebieg: ${feature.properties.kind === 'water-route' ? 'koryto rzeki i przejścia po jeziorach' : 'koryto OpenStreetMap'}</strong><p>${esc(feature.properties.note)}</p>${feature.properties.breaks?.length ? `<ul class="route-break-list">${feature.properties.breaks.map((gap, index) => `<li><strong>${index + 1}.</strong> ${esc(gap.note)}</li>`).join('')}</ul>` : ''}<p>${esc(route.lengthNote)}</p>${[route.source, ...(route.additionalSources ?? [])].map(source => `<a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">${esc(source.name)} ${icon('external')}</a>`).join('')}<span>Opis odczytany ${displayDate(route.accessedAt ?? '2026-10-22')} · warunki mogą się zmieniać</span></div>
    <button class="button completed-button" type="button">${icon('check')} Już tędy płynęłam</button>`;
  panel.hidden = false;
  atlas.highlight(id);
  atlas.preview(null, false);
  accessPicker = createAccessPicker(panel.querySelector('.access-picker'), feature, access.routes[id], sites, (section, fit) => {
    selectedSection = section; atlas.preview(section, fit);
    panel.querySelector('.completed-button').innerHTML = `${icon('check')} ${section ? 'Zapisz wybrany odcinek' : 'Już tędy płynęłam'}`;
  }, occurrenceId => atlas.locate(occurrenceId));
  panel.querySelector('.close-detail').addEventListener('click', () => {
    closeDetail(); $('route-list').querySelector(`[data-id="${id}"]`)?.focus({ preventScroll: true });
  });
  panel.querySelector('.completed-button').addEventListener('click', () => {
    if (journal.useCatalog(route, feature, selectedSection)) { $('moje-trasy').scrollIntoView({ behavior: 'smooth', block: 'start' }); toast('Trasa jest w formularzu. Uzupełnij datę i zapisz wyprawę.'); }
  });
  panel.scrollTop = 0;
  if (window.innerWidth <= 900) panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  panel.querySelector('h3').focus({ preventScroll: true });
}

function renderRoutes() {
  const filters = { search: $('search').value, difficulty: $('difficulty').value, obstacles: $('obstacles').value, type: $('water-type').value, sort: $('sort').value, area: $('area').value, tripKind: $('trip-kind').value };
  visibleRoutes = filterRoutes(routes, filters);
  if (selectedId && !visibleRoutes.some(r => r.id === selectedId)) closeDetail();
  $('result-count').textContent = `${visibleRoutes.length} z ${routes.length} odcinków`;
  $('route-list').innerHTML = visibleRoutes.length ? visibleRoutes.map(route => `
    <button class="route-card ${selectedId === route.id ? 'selected' : ''}" type="button" data-id="${route.id}" aria-pressed="${selectedId === route.id}" style="--route-color:${routeColor(route.id)}">
      <span class="card-top"><span class="region-name">${esc(route.region)}</span><span class="badge ${route.difficulty}"><i class="dot"></i>${LEVELS[route.difficulty].label}</span></span>
      <span class="card-name"><span><i class="route-color-dot" style="background:${routeColor(route.id)}"></i>${esc(route.river)}</span><span class="card-distance">${routeKm(route)} <small>km</small></span></span>
      <span class="card-endpoints">${esc(route.from)} <span>→</span> ${esc(route.to)}</span>
      <span class="card-bottom"><span>${icon(route.obstacles === 'many' ? 'tree' : 'waves')}${esc(route.character)}</span>${journal.completedIds().has(route.id) ? `<span class="completed-label">${icon('check')} Przebyta</span>` : journal.partialIds().has(route.id) ? `<span class="completed-label">${icon('check')} Przebyty fragment</span>` : icon('arrow')}</span>
    </button>`).join('') : `<div class="empty-search">${icon('search')}<h3>Tu jeszcze cicho…</h3><p>Brak tras pasujących do filtrów.<br>Spróbuj innej rzeki lub poziomu.</p><button type="button" class="text-button" id="empty-reset">Wyczyść filtry</button></div>`;
  $('route-list').querySelectorAll('.route-card').forEach(card => card.addEventListener('click', () => selectRoute(card.dataset.id)));
  $('empty-reset')?.addEventListener('click', () => $('filters').reset());
  atlas.render(visibleRoutes, geometries);
  $('show-all').disabled = visibleRoutes.length === 0;
}
$('filters').addEventListener('submit', event => event.preventDefault());
$('filters').addEventListener('input', renderRoutes);
$('filters').addEventListener('reset', () => { setTimeout(() => { closeDetail(); renderRoutes(); atlas.fitAll(); }, 0); });
$('area').addEventListener('change', () => { closeDetail(); renderRoutes(); atlas.fitAll(); });
$('sort').addEventListener('change', renderRoutes);
document.addEventListener('sup:journal-change', () => { if (routes.length) renderRoutes(); });
$('show-all').addEventListener('click', () => { closeDetail(); atlas.fitAll(); });
$('example-route').addEventListener('click', () => {
  $('filters').reset();
  setTimeout(() => { $('search').value = 'Wda Osowo Wdecki'; renderRoutes(); selectRoute('wda-osowo-wdecki-mlyn'); }, 0);
});
document.addEventListener('keydown', event => { if (event.key === 'Escape' && !$('route-detail').hidden) closeDetail(); });
void setupCloudSync(journal);

let cataloguePending = false;
async function loadCatalogue() {
if (cataloguePending || routes.length) return;
cataloguePending = true;
try {
  const responses = await Promise.all(['routes.json', 'route-map.geojson'].map(file =>
    fetch(new URL(`../data/${file}`, import.meta.url), { signal: AbortSignal.timeout(15000) })));
  if (responses.some(r => !r.ok)) throw new Error('Nie udało się pobrać katalogu.');
  const [dataset, geojson] = await Promise.all(responses.map(r => r.json()));
  try {
    const response = await fetch(new URL('../data/access-points.json', import.meta.url), { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('Brak danych miejsc dostępu.');
    access = await response.json(); sites = new Map(access.sites.map(site => [site.id, site]));
    let mismatched = false;
    for (const feature of geojson.features) {
      const id = feature.properties.id;
      if (access.routes[id]?.geometryKey !== geometryKey(feature.geometry)) { delete access.routes[id]; mismatched = true; }
    }
    const summary = access.summary;
    $('access-data-status').textContent = mismatched ? 'Część danych wodowań wymaga odświeżenia po aktualizacji mapy; wybór tych odcinków jest chwilowo niedostępny.' : `${summary.sites} miejsc dostępu · ${summary.anchoredRoutes}/${summary.routes} tras z przypisanym startem i metą.${summary.approximateSites ? ` ${summary.approximateSites} lokalizacji przybliżonych oznaczono „≈”.` : ''}${summary.anchoredRoutes < summary.routes ? ' Nieustalone końce oznaczono „?”.' : ''}${summary.waterLegs ? ` Dostęp przy obu końcach części wodnych: ${summary.completeLegs}/${summary.waterLegs}.` : ''}`;
  } catch { $('access-data-status').textContent = 'Dane miejsc dostępu są chwilowo niedostępne. Odśwież stronę, aby spróbować ponownie.'; }
  atlas.setAccess(access, (id, role) => accessPicker?.choose(id, role));
  routes = dataset.routes;
  geometries = new Map(geojson.features.map(feature => [feature.properties.id, feature]));
  journal.refreshCatalogue(geometries);
  $('catalog-count').textContent = routes.length;
  $('about-catalog-count').textContent = routes.length;
  $('regional-count').textContent = routes.filter(route => route.areas?.includes('pomorze')).length;
  $('water-route-count').textContent = geojson.features.length;
  $('gapped-count').textContent = geojson.features.filter(feature => feature.properties.breaks?.length).length;
  renderRoutes(); atlas.fitAll();
  $('catalog-error').hidden = true;
} catch (error) {
  $('catalog-error').textContent = 'Nie udało się wczytać katalogu tras. Odśwież stronę, aby spróbować ponownie. Twój dziennik działa niezależnie.';
  $('catalog-error').hidden = false;
  $('result-count').textContent = 'Katalog niedostępny';
  $('route-list').textContent = error.message;
} finally { cataloguePending = false; }
}
void loadCatalogue();
window.addEventListener('online', loadCatalogue);
window.addEventListener('app:resume', loadCatalogue);
document.addEventListener('visibilitychange', () => { if (!document.hidden) void loadCatalogue(); });

if (location.protocol === 'https:' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register(new URL('../sw.js', import.meta.url), { scope: '/sup/' })
    .catch(() => { /* The online app works even if offline storage is unavailable. */ });
}
