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
    let currentId = selectedId, currentRegion = region, revision = 0, mapClickId = null;
    let tileError = false;
    const map = L.map(container, { scrollWheelZoom: false, maxZoom: 19, minZoom: 6, zoomControl: false });
    L.control.zoom({ zoomInTitle: "Przybliż mapę", zoomOutTitle: "Oddal mapę" }).addTo(map);
    const tile = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>'
    }).addTo(map);
    const visibleSpots = () => spots.filter(s => currentRegion === "all" || s.region === currentRegion);
    function updateStatus() {
      status.textContent = tileError
        ? "Podkład mapy jest chwilowo niedostępny. Znaczniki i lista spotów nadal działają."
        : `${visibleSpots().length} spotów na mapie. Kliknij liczbę, aby rozwinąć grupę, a znacznik, aby wybrać prognozę. Przybliżaj przyciskami +/− lub gestem dwóch palców.`;
    }
    tile.on("tileerror", () => { tileError = true; updateStatus(); });
    tile.on("tileload", () => { if (tileError) { tileError = false; updateStatus(); } });
    const cluster = L.markerClusterGroup({
      maxClusterRadius: 42, showCoverageOnHover: false, spiderfyOnMaxZoom: true,
      animate: !root.matchMedia("(prefers-reduced-motion: reduce)").matches,
      iconCreateFunction(group) {
        const containsSelected = group.getAllChildMarkers().some(m => m.options.spotId === currentId);
        return L.divIcon({ className: `surf-map-cluster${containsSelected ? " is-selected" : ""}`,
          html: `<span aria-label="Grupa ${group.getChildCount()} spotów${containsSelected ? ", zawiera wybrany spot" : ""}">${group.getChildCount()}</span>`,
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
