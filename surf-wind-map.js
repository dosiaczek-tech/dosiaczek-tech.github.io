/* North-up satellite inset. Meteorological wind direction is FROM, arrows go TO. */
(function (root) {
  "use strict";
  const M = typeof module !== "undefined" ? require("./surf-model.js") : root.SurfModel;
  function geometry(spot, wind, shoreline = null) {
    const center = shoreline && [shoreline.lat, shoreline.lon].every(M.finite) ? shoreline : spot;
    const project = (point, bearing, distance) => M.offshore({ lat: point.lat, lon: point.lon, normal: bearing }, distance);
    const coast = { lat: center.lat, lon: center.lon };
    const land = project(coast, (spot.normal + 180) % 360, 200);
    const sea = project(coast, spot.normal, 500);
    const bounds = [0, 90, 180, 270].map(d => project(coast, d, 450)).concat(sea);
    if (!wind || !M.finite(wind.speed) || wind.speed < .5 || !M.finite(wind.direction)) return { coast, land, sea, bounds, arrow: null };
    const fromDirection = (wind.direction + 360) % 360, toDirection = (fromDirection + 180) % 360;
    const from = project(coast, fromDirection, 300), tip = project(coast, toDirection, 350);
    const head = [tip, project(tip, fromDirection - 30, 90), project(tip, fromDirection + 30, 90)];
    return { coast, land, sea, bounds, arrow: { from, tip, head, fromDirection, toDirection } };
  }
  function create() {
    const container = document.getElementById("surfWindMap");
    const status = document.getElementById("surfWindMapStatus");
    if (!root.L) { status.textContent = "Mapa nie mogła się załadować. Kierunek i prędkość wiatru są nadal podane liczbowo."; return null; }
    const L = root.L, map = L.map(container, { scrollWheelZoom: true, minZoom: 10, maxZoom: 17 });
    const osm = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 17,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>' });
    const satellite = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 17,
      attribution: 'Tiles &copy; <a href="https://www.esri.com/" target="_blank" rel="noopener noreferrer">Esri</a> — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community' }).addTo(map);
    L.control.layers({ "Satelita": satellite, "Mapa standardowa": osm }, null, { position: "topright" }).addTo(map);
    const overlay = L.layerGroup().addTo(map);
    let currentKey = null, currentGeometry = null, switched = false;
    const latlng = p => [p.lat, p.lon];
    const fit = () => { if (currentGeometry) map.setView(latlng(currentGeometry.coast), 16, { animate: false }); };
    satellite.on("tileerror", () => {
      if (!switched && map.hasLayer(satellite)) {
        switched = true; map.removeLayer(satellite); osm.addTo(map);
        status.textContent = "Zdjęcia satelitarne są chwilowo niedostępne — pokazuję mapę standardową.";
      }
    });
    osm.on("tileerror", () => { status.textContent = "Nie udało się pobrać podkładu. Strzałka i orientacja brzegu pozostają widoczne."; });
    document.getElementById("surfWindCenter").addEventListener("click", fit);
    function update(spot, wind, shoreline, wave) {
      const g = geometry(spot, wind, shoreline);
      const key = `${spot.id}:${g.coast.lat}:${g.coast.lon}`;
      currentGeometry = g;
      overlay.clearLayers();
      const labels = Array.from({ length: 8 }, (_, i) => {
        const radians = i * Math.PI / 4;
        return `<text x="${140 + Math.sin(radians) * 122}" y="${140 - Math.cos(radians) * 122}" class="surf-wind-degree">${i * 45}°</text>`;
      }).join("");
      const spokes = Array.from({ length: 16 }, (_, i) => `<path d="M140 140V45" transform="rotate(${i * 22.5} 140 140)"/>`).join("");
      const rings = [30, 50, 70, 85].map(r => `<circle cx="140" cy="140" r="${r}"/>`).join("");
      const indicator = g.arrow ? `<g transform="rotate(${g.arrow.fromDirection} 140 140)">
        <path class="surf-wind-sector" d="M140 140L131 108A33 33 0 0 1 149 108Z"/>
        <path class="surf-wind-arrowhead" d="M136 32H144V46H151L140 59L129 46H136Z"/>
      </g>` : "";
      const hasWaves = wave && M.finite(wave.direction) && M.finite(wave.height) && wave.height > .001;
      const waveDirection = hasWaves ? (wave.direction + 360) % 360 : null;
      // Crests are perpendicular to propagation. With north as the source,
      // they move down (south); rotating by FROM preserves this convention.
      const crests = Array.from({ length: 12 }, (_, i) => {
        const y = -16 + i * 24;
        return `<path d="M65 ${y}Q83 ${y - 5} 102 ${y}T140 ${y}T178 ${y}T215 ${y}"/>`;
      }).join("");
      const waves = hasWaves ? `<g class="surf-wave-bearing" transform="rotate(${waveDirection} 140 140)">
        <g clip-path="url(#surfWaveClip)"><g class="surf-wave-crests">${crests}</g></g>
      </g>` : "";
      const html = `<svg viewBox="0 0 280 280" aria-hidden="true" class="surf-wind-dial">
        <defs><clipPath id="surfWaveClip"><circle cx="140" cy="140" r="86"/></clipPath></defs>
        <circle cx="140" cy="140" r="95" class="surf-wind-disc"/>
        <g class="surf-wind-grid">${rings}${spokes}</g>${waves}${labels}${indicator}
        <circle cx="140" cy="140" r="4" class="surf-wind-origin"/>
      </svg>`;
      L.marker(latlng(g.coast), { interactive: false, keyboard: false,
        icon: L.divIcon({ className: "surf-wind-compass", html, iconSize: [280, 280], iconAnchor: [140, 140] }) }).addTo(overlay);
      container.dataset.windFrom = g.arrow ? String(g.arrow.fromDirection) : "";
      container.dataset.windTo = g.arrow ? String(g.arrow.toDirection) : "";
      container.dataset.waveFrom = hasWaves ? String(waveDirection) : "";
      container.dataset.waveTo = hasWaves ? String((waveDirection + 180) % 360) : "";
      if (key !== currentKey) { currentKey = key; map.invalidateSize({ pan: false }); fit(); }
    }
    if (root.ResizeObserver) new ResizeObserver(() => { if (container.clientWidth) map.invalidateSize({ pan: false }); }).observe(container);
    return { update };
  }
  const api = { geometry, create };
  if (typeof module !== "undefined") module.exports = api; else root.SurfWindMap = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
