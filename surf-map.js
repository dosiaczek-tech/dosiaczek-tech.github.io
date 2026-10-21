/* Wybór spotu na mapie; nie pobiera prognoz dla pozostałych znaczników. */
(function (root) {
  "use strict";
  function create({ spots, region, selectedId, onSelect }) {
    const container = document.getElementById("surfSpotMap");
    const status = document.getElementById("surfSpotMapStatus");
    const selected = document.getElementById("surfSpotMapSelected");
    const overview = document.getElementById("surfMapOverview");
    const locate = document.getElementById("surfMapLocate");
    if (!root.L || !root.L.markerClusterGroup) {
      status.textContent = "Mapa nie mogła się załadować. Możesz nadal wybrać spot z listy powyżej; odśwież stronę, aby spróbować ponownie.";
      container.hidden = true;
      overview.disabled = true;
      locate.disabled = true;
      return null;
    }
    const L = root.L;
    const byId = new Map(spots.map(s => [s.id, s]));
    const markers = new Map();
    const labelOrder = new Map([...spots].sort((a, b) => a.lon - b.lon || b.lat - a.lat).map((s, i) => [s.id, i]));
    let currentId = selectedId, currentRegion = region, revision = 0, mapClickId = null;
    let tileError = false;
    const map = L.map(container, { scrollWheelZoom: true, maxZoom: 19, minZoom: 6, zoomControl: false });
    L.control.zoom({ zoomInTitle: "Przybliż mapę", zoomOutTitle: "Oddal mapę" }).addTo(map);
    const tile = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>'
    }).addTo(map);
    const visibleSpots = () => spots.filter(s => currentRegion === "all" || s.region === currentRegion);
    function updateStatus() {
      status.textContent = tileError
        ? "Podkład mapy jest chwilowo niedostępny. Znaczniki i lista spotów nadal działają."
        : `${visibleSpots().length} spotów na mapie. Nazwy są widoczne przy znacznikach. Przybliż grupę z liczbą, aby zobaczyć poszczególne spoty. Kółko myszy nad mapą przybliża lub oddala, a poza mapą przewija stronę.`;
    }
    tile.on("tileerror", () => { tileError = true; updateStatus(); });
    tile.on("tileload", () => { if (tileError) { tileError = false; updateStatus(); } });
    const cluster = L.markerClusterGroup({
      maxClusterRadius: 55, showCoverageOnHover: false, spiderfyOnMaxZoom: true, spiderfyDistanceMultiplier: 1.5,
      animate: !root.matchMedia("(prefers-reduced-motion: reduce)").matches,
      iconCreateFunction(group) {
        const children = group.getAllChildMarkers();
        const containsSelected = children.some(m => m.options.spotId === currentId);
        const townStats = new Map();
        children.forEach(m => { const s = byId.get(m.options.spotId), stat = townStats.get(s.town) || { count: 0, lon: s.lon }; stat.count++; stat.lon = Math.min(stat.lon, s.lon); townStats.set(s.town, stat); });
        const towns = [...townStats.keys()].sort((a, b) => townStats.get(b).count - townStats.get(a).count || townStats.get(a).lon - townStats.get(b).lon);
        const town = containsSelected ? byId.get(currentId).town : towns[0];
        const content = document.createElement("div"); content.className = "surf-cluster-copy";
        const count = document.createElement("span"); count.textContent = group.getChildCount();
        count.setAttribute("aria-label", `Grupa ${group.getChildCount()} spotów: ${towns.join(", ")}`);
        const above = Math.floor(map.project(group.getLatLng(), map.getZoom()).x / 70) % 2 === 0;
        const label = document.createElement("span"); label.className = `surf-cluster-label${above ? " is-above" : ""}`;
        label.textContent = town + (towns.length > 1 ? ` +${towns.length - 1}` : ""); label.title = towns.join(", ");
        content.append(count, label);
        return L.divIcon({ className: `surf-map-cluster${containsSelected ? " is-selected" : ""}`,
          html: content,
          iconSize: [40, 40], iconAnchor: [20, 20] });
      }
    });
    function markerIcon(s) {
      return L.divIcon({ className: `surf-spot-marker${s.cameras.length ? " has-camera" : " no-camera"}${s.id === currentId ? " is-selected" : ""}`,
        html: '<span aria-hidden="true"></span>', iconSize: [30, 30], iconAnchor: [15, 15], popupAnchor: [0, -15] });
    }
    function paintMarker(s) {
      const marker = markers.get(s.id);
      marker.setIcon(markerIcon(s));
      marker.setZIndexOffset(s.id === currentId ? 1000 : 0);
      const element = marker.getElement();
      if (element) {
        element.dataset.spot = s.id;
        element.setAttribute("aria-label", `${s.town} — ${s.name}. Wybierz prognozę`);
        element.setAttribute("aria-pressed", String(s.id === currentId));
      }
    }
    for (const s of spots) {
      const content = document.createElement("div"); content.className = "surf-map-popup";
      const title = document.createElement("strong"); title.textContent = `${s.town} — ${s.name}`;
      const description = document.createElement("p"); description.textContent = s.cameras.length
        ? `${s.cameras.length} powiązanych kamer morskich` : "Spot bez bezpośredniej kamery";
      const action = document.createElement("a"); action.href = `#surf/${s.id}`; action.textContent = "Przejdź do prognozy ↓";
      action.addEventListener("click", () => {
        onSelect(s.id);
        document.getElementById("surfLocalTitle").scrollIntoView({ behavior: root.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
      });
      content.append(title, description, action);
      const marker = L.marker([s.lat, s.lon], { icon: markerIcon(s), title: `${s.town} — ${s.name}`, keyboard: true, spotId: s.id });
      const label = document.createElement("span"); label.textContent = `${s.town} · ${s.name}`; label.dataset.spotLabel = s.id;
      const above = labelOrder.get(s.id) % 2 === 0;
      marker.bindTooltip(label, { permanent: true, interactive: true, direction: above ? "top" : "bottom",
        offset: [0, above ? -10 : 10], opacity: 1, className: "surf-map-label" });
      marker.getTooltip().on("click", () => { mapClickId = s.id; marker.openPopup(); onSelect(s.id); });
      marker.bindPopup(content, { maxWidth: 280, autoPan: true });
      marker.on("click", () => { mapClickId = s.id; onSelect(s.id); });
      marker.on("add", () => {
        const el = marker.getElement();
        if (el) { el.dataset.spot = s.id; el.setAttribute("aria-label", `${s.town} — ${s.name}. Wybierz prognozę`); el.setAttribute("aria-pressed", String(s.id === currentId)); }
      });
      markers.set(s.id, marker);
    }
    map.addLayer(cluster);

    function fitRegion() {
      ++revision; // Nie pozwól, aby opóźnione otwarcie popupu cofnęło wybór regionu.
      map.closePopup();
      const visible = visibleSpots();
      if (visible.length) map.fitBounds(L.latLngBounds(visible.map(s => [s.lat, s.lon])), { padding: [30, 30], maxZoom: 12, animate: false });
    }
    function reveal() {
      const marker = markers.get(currentId);
      if (!marker || !cluster.hasLayer(marker)) return;
      const token = ++revision;
      cluster.zoomToShowLayer(marker, () => {
        if (token === revision && currentId === marker.options.spotId && !document.getElementById("forecastPanel").hidden) marker.openPopup();
      });
    }
    function setRegion(nextRegion) {
      if (nextRegion === currentRegion && cluster.getLayers().length) return;
      currentRegion = nextRegion;
      ++revision;
      cluster.clearLayers();
      cluster.addLayers(visibleSpots().map(s => markers.get(s.id)));
      overview.textContent = currentRegion === "all" ? "Całe wybrzeże" : "Pokaż cały region";
      updateStatus();
      fitRegion();
    }
    function select(id, { revealSelection = true } = {}) {
      if (!byId.has(id)) return;
      const changed = currentId !== id, previous = currentId;
      currentId = id;
      const s = byId.get(id);
      selected.textContent = `Wybrany spot: ${s.town} — ${s.name}`;
      if (byId.has(previous)) paintMarker(byId.get(previous));
      paintMarker(s);
      cluster.refreshClusters();
      if (changed && revealSelection && mapClickId !== id) reveal();
      mapClickId = null;
    }
    overview.addEventListener("click", fitRegion);
    locate.addEventListener("click", reveal);
    setRegion(region);
    select(selectedId, { revealSelection: false });
    const resize = () => { if (container.clientWidth && container.clientHeight) map.invalidateSize({ pan: false }); };
    if (root.ResizeObserver) new ResizeObserver(resize).observe(container);
    return { select, setRegion, resize };
  }
  root.SurfSpotMap = { create };
})(globalThis);
