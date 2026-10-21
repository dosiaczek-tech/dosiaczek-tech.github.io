/* North-up terrain inset. Meteorological wind direction is FROM, arrows go TO. */
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
    const topo = L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", { maxZoom: 17,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>, SRTM | &copy; <a href="https://opentopomap.org" target="_blank" rel="noopener noreferrer">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/" target="_blank" rel="noopener noreferrer">CC-BY-SA</a>)' }).addTo(map);
    L.control.layers({ "Topografia": topo, "Mapa standardowa": osm }, null, { position: "topright" }).addTo(map);
    const compass = L.control({ position: "bottomleft" });
    compass.onAdd = () => { const el = L.DomUtil.create("div", "surf-wind-north"); el.textContent = "↑ N · północ"; return el; };
    compass.addTo(map);
    const overlay = L.layerGroup().addTo(map);
    let currentKey = null, currentGeometry = null, switched = false;
    const latlng = p => [p.lat, p.lon];
    const fit = () => { if (currentGeometry) map.fitBounds(L.latLngBounds(currentGeometry.bounds.map(latlng)), { padding: [20, 20], maxZoom: 16, animate: false }); };
    topo.on("tileerror", () => {
      if (!switched && map.hasLayer(topo)) {
        switched = true; map.removeLayer(topo); osm.addTo(map);
        status.textContent = "Podkład topograficzny jest chwilowo niedostępny — pokazuję mapę standardową.";
      }
    });
    osm.on("tileerror", () => { status.textContent = "Nie udało się pobrać podkładu. Strzałka i orientacja brzegu pozostają widoczne."; });
    document.getElementById("surfWindCenter").addEventListener("click", fit);
    function update(spot, wind, shoreline, wavePoint) {
      const g = geometry(spot, wind, shoreline);
      const key = `${spot.id}:${g.coast.lat}:${g.coast.lon}`;
      currentGeometry = g;
      overlay.clearLayers();
      L.polyline([latlng(g.land), latlng(g.sea)], { color: "#677c74", weight: 2, dashArray: "5 5", interactive: false }).addTo(overlay);
      function point(position, text, color, direction = "right") {
        const label = document.createElement("span"); label.textContent = text;
        return L.circleMarker(latlng(position), { radius: 5, color, fillColor: "white", fillOpacity: 1, weight: 2 })
          .bindTooltip(label, { permanent: true, direction, className: "surf-wind-label" }).addTo(overlay);
      }
      point(g.land, "W stronę lądu", "#677c74", "left");
      point(g.sea, "W stronę morza", "#677c74");
      if (g.arrow) {
        L.polyline([latlng(g.arrow.from), latlng(g.arrow.tip)], { color: "#315db3", weight: 5, interactive: false, className: "surf-wind-arrow" }).addTo(overlay);
        L.polygon(g.arrow.head.map(latlng), { color: "#315db3", fillColor: "#315db3", fillOpacity: 1, weight: 1, interactive: false, className: "surf-wind-arrowhead" }).addTo(overlay);
      }
      point(g.coast, shoreline && [shoreline.lat, shoreline.lon].every(M.finite) ? "Brzeg wg modelu" : "Punkt spotu", "#18383e", "left");
      if (wavePoint && [wavePoint.lat, wavePoint.lon].every(M.finite)) point(wavePoint, "Punkt prognozy fal", "#0b7169");
      container.dataset.windFrom = g.arrow ? String(g.arrow.fromDirection) : "";
      container.dataset.windTo = g.arrow ? String(g.arrow.toDirection) : "";
      if (key !== currentKey) { currentKey = key; map.invalidateSize({ pan: false }); fit(); }
    }
    if (root.ResizeObserver) new ResizeObserver(() => { if (container.clientWidth) map.invalidateSize({ pan: false }); }).observe(container);
    return { update };
  }
  const api = { geometry, create };
  if (typeof module !== "undefined") module.exports = api; else root.SurfWindMap = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
