import L from 'leaflet';
import { $ } from './ui.js';
import { geometryEndpoints } from './core.js';

export { L };
export const POLAND = [[49, 14.1], [54.9, 24.1]];
export function createMap(id, errorId) {
  const map = L.map(id, { scrollWheelZoom: true, zoomControl: true, zoomAnimation: false, minZoom: 5, maxZoom: 19 }).fitBounds(POLAND);
  map.zoomControl.setPosition('bottomright');
  const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
    crossOrigin: true, keepBuffer: 2
  }).addTo(map);
  const error = $(errorId);
  tiles.on('tileerror', () => { error.hidden = false; });
  error.querySelector('button').addEventListener('click', () => { error.hidden = true; tiles.redraw(); });
  L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);
  const observer = new ResizeObserver(() => map.invalidateSize({ pan: false }));
  observer.observe($(id));
  return map;
}
export function drawGeometry(geometry, options = {}) {
  return L.geoJSON({ type: 'Feature', properties: {}, geometry }, { interactive: options.interactive !== false, style: { color: '#185b4d', weight: 4, opacity: 0.9, lineCap: 'round', ...options } });
}
export function drawLegacyLocations(geometry, color = '#718078') {
  // Old backups can still contain obsolete schematic lines. Only their
  // locations are shown until the current catalogue supplies water geometry.
  return L.featureGroup(geometryEndpoints(geometry).map(point => L.circleMarker([point[1], point[0]], { radius: 6, color, fillOpacity: .5 })));
}
export function fitLayer(map, layer, options = {}) {
  const bounds = layer.getBounds();
  if (bounds.isValid()) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 13, animate: false, ...options });
}
