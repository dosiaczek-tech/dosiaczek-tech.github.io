import { L, drawGeometry, fitLayer } from './maps.js';
import { routeColor, kilometerMarks, geometryLength, geometryEndpoints, WATER_GEOMETRY_KINDS } from './core.js';
import { $, icon, escapeHtml as esc, km, routeKm } from './ui.js';
import { accessDescription, siteLabel } from './access-picker.js';

export function createAtlasLayers(map, onSelect) {
  const all = L.featureGroup().addTo(map), selection = L.featureGroup().addTo(map), mileage = L.layerGroup().addTo(map), accessLayer = L.layerGroup().addTo(map);
  let routes = [], features = new Map(), selectedId = null;
  let access = { routes: {} }, sites = new Map(), variant = null, chooseAccess = () => {};
  const accessMarkers = new Map();
  const lines = new Map();

  function candidatesAt(latlng) {
    const click = map.latLngToLayerPoint(latlng);
    return routes.filter(route => {
      const feature = features.get(route.id);
      if (!feature || !WATER_GEOMETRY_KINDS.includes(feature.properties.kind)) return false;
      const geometry = feature.geometry;
      const segments = geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates;
      return segments.some(points => {
        let a = map.latLngToLayerPoint([points[0][1], points[0][0]]);
        for (const p of points.slice(1)) {
          const b = map.latLngToLayerPoint([p[1], p[0]]);
          if (L.LineUtil.pointToSegmentDistance(click, a, b) <= 10) return true;
          a = b;
        }
        return false;
      });
    });
  }
  function chooseAt(latlng, clickedId) {
    const nearby = candidatesAt(latlng);
    if (clickedId && !nearby.some(r => r.id === clickedId)) nearby.push(routes.find(r => r.id === clickedId));
    if (nearby.length <= 1) { if (nearby[0]) onSelect(nearby[0].id); return; }
    const content = document.createElement('div'); content.className = 'route-choices';
    content.innerHTML = `<strong>Wybierz odcinek w tym miejscu</strong><p>${nearby.length} nakładających się tras</p><div>${nearby.map(route => `<button type="button" class="route-choice" data-id="${esc(route.id)}" style="--route-color:${routeColor(route.id)}"><i></i><span><b>${esc(route.river)} · ${routeKm(route)} km</b><small>${esc(route.from)} → ${esc(route.to)}</small></span>${icon('arrow')}</button>`).join('')}</div>`;
    const popup = L.popup({ maxWidth: 340, className: 'route-choice-popup' }).setLatLng(latlng).setContent(content).openOn(map);
    content.querySelectorAll('button').forEach(button => button.addEventListener('click', () => { map.closePopup(popup); onSelect(button.dataset.id); }));
    content.querySelector('button')?.focus({ preventScroll: true });
  }
  function renderMileage() {
    mileage.clearLayers();
    if (!selectedId || !$('show-kilometers').checked) return;
    const feature = variant ?? features.get(selectedId);
    if (!feature || !WATER_GEOMETRY_KINDS.includes(feature.properties.kind)) return;
    const total = geometryLength(feature.geometry), zoom = map.getZoom();
    const step = zoom >= 11 ? 1 : zoom >= 9 ? 5 : 10;
    const color = routeColor(selectedId), occupied = [];
    for (const mark of kilometerMarks(feature.geometry, step)) {
      if (total - mark.km < .15) continue;
      const position = [mark.coordinates[1], mark.coordinates[0]];
      const screen = map.latLngToLayerPoint(position);
      if (occupied.some(p => p.distanceTo(screen) < 35)) continue;
      occupied.push(screen);
      L.marker(position, { interactive: false, keyboard: false, icon: L.divIcon({
        className: 'kilometer-marker-wrap', iconSize: [9, 9], iconAnchor: [4.5, 4.5],
        html: `<span class="kilometer-marker" style="--route-color:${color}"></span><span class="kilometer-label">${km(mark.km)} km</span>`
      }) }).addTo(mileage);
    }
  }
  function highlight(id, fit = true) {
    if (id !== selectedId) variant = null;
    selectedId = id; selection.clearLayers(); mileage.clearLayers(); accessLayer.clearLayers(); accessMarkers.clear();
    map.closePopup();
    for (const [routeId, layer] of lines) layer.setStyle({ weight: id && routeId === id ? 5 : 3.5, opacity: id && routeId !== id ? .18 : .9 });
    $('map-selection').hidden = !id;
    if (!id) { $('show-kilometers').disabled = false; return; }
    const route = routes.find(r => r.id === id), feature = variant ?? features.get(id);
    if (!route || !feature) return;
    if (!WATER_GEOMETRY_KINDS.includes(feature.properties.kind)) return;
    const color = routeColor(id);
    drawGeometry(feature.geometry, { color: 'white', weight: 9, opacity: .95, interactive: false }).addTo(selection);
    const path = drawGeometry(feature.geometry, { color, weight: 5, opacity: 1, interactive: false }).addTo(selection);
    const endpoints = geometryEndpoints(feature.geometry);
    const endpointMarkers = new Map();
    for (const [point, label, type] of [[endpoints[0], 'START', 'start'], [endpoints[1], 'META', 'finish']]) {
      const site = sites.get(type === 'start' ? feature.properties.launchStart : feature.properties.launchFinish);
      const position = site?.coordinates ?? point;
      const name = site?.name ?? (type === 'start' ? route.from : route.to);
      if (site && endpointMarkers.has(site.id)) {
        const marker = endpointMarkers.get(site.id);
        const approximate = site.coordinateAccuracy === 'approximate';
        marker.setIcon(L.divIcon({ className: 'route-endpoint-wrap', iconSize: [30, 30], iconAnchor: [15, 15], html: `<span class="route-endpoint start finish${approximate ? ' approximate' : ''}" style="--route-color:${color}">↻</span><span class="endpoint-label">START / META${approximate ? ' · ≈' : ''}</span>` }));
        marker.getElement()?.setAttribute('title', `START / META: ${siteLabel(site)}`);
        continue;
      }
      const approximate = site?.coordinateAccuracy === 'approximate';
      const marker = L.marker([position[1], position[0]], { title: `${label}: ${name}${approximate ? ' — lokalizacja przybliżona' : ''}`, icon: L.divIcon({ className: 'route-endpoint-wrap', iconSize: [30, 30], iconAnchor: [15, 15], html: `<span class="route-endpoint ${type}${site ? approximate ? ' approximate' : '' : ' unconfirmed'}" style="--route-color:${color}">${type === 'start' ? '▶' : '■'}</span><span class="endpoint-label">${site ? `${label}${approximate ? ' · ≈' : ''}` : `${label} · ?`}</span>` }) }).addTo(selection);
      marker.bindPopup(site ? `<b>${label}</b>${accessDescription(site)}` : `<strong>${label}: ${esc(name)}</strong><p>Orientacyjny koniec przebiegu. Miejsce wodowania nie zostało jeszcze ustalone.</p>`, { maxHeight: 300 });
      if (site) endpointMarkers.set(site.id, marker);
    }
    const occurrences = access.routes[id]?.occurrences ?? [];
    for (const siteId of new Set(occurrences.map(item => item.siteId))) {
      const site = sites.get(siteId); if (!site) continue;
      const visits = occurrences.filter(item => item.siteId === siteId);
      const content = document.createElement('div'); content.className = 'access-popup';
      content.innerHTML = `${accessDescription(site)}${visits.map(item => `<div class="access-popup-actions"><span>${km(item.position.km)} km · część ${item.position.line + 1}<br>Od narysowanego przebiegu: ${Math.round(item.position.distanceKm * 1000)} m</span>${site.selectable ? `<button type="button" class="text-button" data-role="start" data-id="${esc(item.id)}">Start tutaj</button><button type="button" class="text-button" data-role="finish" data-id="${esc(item.id)}">Meta tutaj</button>` : ''}</div>`).join('')}`;
      const marker = endpointMarkers.get(siteId) ?? L.marker([site.coordinates[1], site.coordinates[0]], { title: `Dostęp do wody: ${siteLabel(site)}`, riseOnHover: true, icon: L.divIcon({ className: 'access-marker-wrap', iconSize: [25, 25], iconAnchor: [12.5, 12.5], html: `<span class="access-marker ${site.selectable ? '' : 'unavailable'}${site.coordinateAccuracy === 'approximate' ? ' approximate' : ''}" style="--route-color:${color}">${icon('pin')}</span>` }) }).addTo(accessLayer);
      marker.bindPopup(content, { maxWidth: 280, maxHeight: 310, autoPanPaddingBottomRight: [window.innerWidth > 900 ? $('route-detail').offsetWidth + 20 : 20, 40] });
      for (const item of visits) accessMarkers.set(item.id, marker);
      content.querySelectorAll('button').forEach(button => button.addEventListener('click', () => { map.closePopup(); chooseAccess(button.dataset.id, button.dataset.role); }));
    }
    for (const [index, gap] of (feature.properties.breaks ?? []).entries()) {
      for (const [point, side] of [[gap.from, 'początek'], [gap.to, 'koniec']]) {
        const label = gap.kind === 'transport' ? 'Przewózka' : gap.kind === 'portage' ? 'Przenoska' : 'Przerwa w danych';
        L.marker([point[1], point[0]], { title: `${label}: ${side}`, icon: L.divIcon({ className: 'route-break-wrap', iconSize: [23, 23], iconAnchor: [11.5, 11.5], html: `<span class="route-break" style="--route-color:${color}">${index + 1}</span>` }) })
          .bindPopup(`<strong>${label}</strong><p>${esc(gap.note)}</p><p>Punkty nie są połączone linią po lądzie.</p>`).addTo(selection);
      }
    }
    $('map-selection').style.setProperty('--route-color', color);
    $('map-selection').innerHTML = `<i></i><div><strong>${esc(route.river)} · ${variant ? `${km(geometryLength(feature.geometry))} km · wybrany odcinek` : `${routeKm(route)} km`}</strong><span>${esc(variant?.from ?? route.from)} → ${esc(variant?.to ?? route.to)}</span><small>Pomiar widocznych odcinków po wodzie: ${km(geometryLength(feature.geometry))} km${feature.properties.breaks?.length ? ' · przerwy oznaczone punktami' : ''}</small></div>`;
    $('show-kilometers').disabled = false;
    if (fit) {
      const right = window.innerWidth > 900 ? $('route-detail').offsetWidth + 45 : 35;
      fitLayer(map, path, { paddingTopLeft: [45, 165], paddingBottomRight: [right, 75], maxZoom: 14 });
    }
    renderMileage();
  }
  function render(nextRoutes, nextFeatures) {
    routes = nextRoutes; features = nextFeatures; all.clearLayers(); lines.clear();
    for (const route of routes) {
      const feature = features.get(route.id);
      if (!feature || !WATER_GEOMETRY_KINDS.includes(feature.properties.kind)) continue;
      const color = routeColor(route.id);
      const click = event => chooseAt(event.latlng, route.id);
      drawGeometry(feature.geometry, { weight: 18, opacity: 0 }).on('click', click).addTo(all);
      const line = drawGeometry(feature.geometry, { color, weight: 3.5, opacity: .9 }).on('click', click).addTo(all);
      line.eachLayer(layer => { const element = layer.getElement(); if (element) element.dataset.routeId = route.id; });
      line.bindTooltip(`${esc(route.river)} · ${esc(route.from)} → ${esc(route.to)} · ${routeKm(route)} km`, { sticky: true });
      lines.set(route.id, line);
      const [first] = geometryEndpoints(feature.geometry);
      L.marker([first[1], first[0]], {
        icon: L.divIcon({ className: 'route-marker-wrap', html: `<span class="atlas-start-dot" style="--route-color:${color}"></span>`, iconSize: [16, 16], iconAnchor: [8, 8] }),
        title: `${route.river}: ${route.from} – ${route.to}`, alt: `${route.river}, ${routeKm(route)} km`, keyboard: true, riseOnHover: true
      }).on('click', event => chooseAt(event.latlng, route.id)).addTo(all);
    }
    if (selectedId && !routes.some(r => r.id === selectedId)) selectedId = null;
    highlight(selectedId, false);
  }
  map.on('zoomend', renderMileage);
  $('show-kilometers').addEventListener('change', renderMileage);
  return {
    render, highlight, fitAll: () => { highlight(null); fitLayer(map, all); },
    setAccess(data, onChoose) { access = data; sites = new Map(data.sites.map(site => [site.id, site])); chooseAccess = onChoose; },
    preview(section, fit = true) { variant = section; highlight(selectedId, fit); },
    locate(id) { const marker = accessMarkers.get(id); if (marker) { map.setView(marker.getLatLng(), Math.max(map.getZoom(), 13), { animate: false }); marker.openPopup(); } }
  };
}
