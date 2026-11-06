export const STORAGE_KEY = 'sup:journal:v1';
export const LEVELS = {
  easy: { label: 'Spokojna', color: '#26775c' },
  moderate: { label: 'Średnia', color: '#b27b27' },
  advanced: { label: 'Zaawansowana', color: '#b45247' },
  unknown: { label: 'Brak oceny', color: '#718078' }
};
export const OBSTACLES = { low: 'Mniej przeszkód', some: 'Miejscowe przeszkody', many: 'Zwałkowa', unknown: 'Zwałki: brak danych' };
export const CATALOG_GEOMETRY_KINDS = ['osm-waterway', 'water-route', 'schematic'];
export const WATER_GEOMETRY_KINDS = ['osm-waterway', 'water-route'];
export const linesOfGeometry = geometry => geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates;
export function geometryEndpoints(geometry) {
  const lines = linesOfGeometry(geometry);
  return [lines[0][0], lines.at(-1).at(-1)];
}
export function reconcileCatalogTrips(trips, features) {
  let changed = false;
  const updated = trips.map(trip => {
    const feature = features.get(trip.sourceRouteId);
    if (trip.sourceSection || !CATALOG_GEOMETRY_KINDS.includes(trip.geometryKind) || !feature || !WATER_GEOMETRY_KINDS.includes(feature.properties.kind)) return trip;
    if (trip.geometryKind === feature.properties.kind && JSON.stringify(trip.geometry) === JSON.stringify(feature.geometry)) return trip;
    changed = true;
    return { ...trip, geometryKind: feature.properties.kind, geometry: structuredClone(feature.geometry) };
  });
  return { trips: updated, changed };
}
export function normalize(value) { return value.toLocaleLowerCase('pl').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l'); }
export function filterRoutes(routes, filters) {
  const words = normalize(filters.search ?? '').trim().split(/\s+/).filter(Boolean);
  const result = routes.filter(route => {
    const haystack = normalize([route.river, route.from, route.to, route.region, route.province, route.character, route.source?.name, ...(route.aliases ?? [])].join(' '));
    return words.every(word => haystack.includes(word)) && (!filters.difficulty || route.difficulty === filters.difficulty) && (!filters.obstacles || route.obstacles === filters.obstacles) && (!filters.type || route.type === filters.type) && (!filters.area || route.areas?.includes(filters.area)) && (!filters.tripKind || route.tripKind === filters.tripKind);
  });
  if (filters.sort === 'shortest') result.sort((a, b) => a.lengthKm - b.lengthKm);
  if (filters.sort === 'longest') result.sort((a, b) => b.lengthKm - a.lengthKm);
  if (filters.sort === 'name') result.sort((a, b) => a.river.localeCompare(b.river, 'pl'));
  return result;
}
export function distanceKm(a, b) {
  const rad = Math.PI / 180;
  const h = Math.sin((b[1] - a[1]) * rad / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin((b[0] - a[0]) * rad / 2) ** 2;
  return 6371.0088 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}
export function geometryLength(geometry) {
  const lines = geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates;
  return lines.reduce((sum, line) => sum + line.slice(1).reduce((part, point, index) => part + distanceKm(line[index], point), 0), 0);
}
// A route keeps its colour when the list is filtered, sorted or extended.
export function routeColor(id) {
  let hash = 2166136261;
  for (const char of id) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  return `hsl(${(hash % 36000) / 100}, ${62 + ((hash >>> 8) % 18)}%, ${34 + ((hash >>> 16) % 10)}%)`;
}
// Distances are measured along the geometry, never scaled to a published offer.
// Disconnected GPX segments do not gain artificial kilometres between them.
export function kilometerMarks(geometry, step = 1) {
  if (!Number.isFinite(step) || step <= 0) throw new Error('Nieprawidłowy odstęp znaczników.');
  const lines = geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates;
  const marks = [];
  let distance = 0, next = step;
  for (const line of lines) {
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1], b = line[i], length = distanceKm(a, b);
      while (length > 0 && next <= distance + length && marks.length < 1000) {
        const fraction = (next - distance) / length;
        marks.push({ km: next, coordinates: [a[0] + (b[0] - a[0]) * fraction, a[1] + (b[1] - a[1]) * fraction] });
        next += step;
      }
      distance += length;
    }
  }
  return marks;
}
export function validateGeometry(geometry) {
  if (!geometry || !['LineString', 'MultiLineString'].includes(geometry.type) || !Array.isArray(geometry.coordinates)) throw new Error('Nieprawidłowy przebieg trasy.');
  const lines = geometry.type === 'LineString' ? [geometry.coordinates] : geometry.coordinates;
  if (!lines.length || lines.length > 1000) throw new Error('Nieprawidłowa liczba segmentów.');
  let total = 0;
  for (const line of lines) {
    if (!Array.isArray(line) || line.length < 2) throw new Error('Trasa musi mieć co najmniej dwa punkty w każdym segmencie.');
    total += line.length;
    if (total > 20000) throw new Error('Trasa może mieć maksymalnie 20 000 punktów.');
    for (const point of line) if (!Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite) || Math.abs(point[0]) > 180 || Math.abs(point[1]) > 90) throw new Error('Trasa zawiera nieprawidłowe współrzędne.');
  }
  if (geometryLength(geometry) < 0.005) throw new Error('Zaznacz trasę dłuższą niż 5 metrów.');
  return geometry;
}
export function validateTrip(trip) {
  if (!trip || typeof trip !== 'object') throw new Error('Nieprawidłowy wpis wyprawy.');
  for (const [key, limit] of [['id', 200], ['name', 100], ['notes', 3000]]) {
    if (typeof trip[key] !== 'string' || trip[key].length > limit || (key !== 'notes' && !trip[key].trim())) throw new Error('Nieprawidłowa nazwa, identyfikator lub notatka wyprawy.');
  }
  if (typeof trip.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(trip.date) || !Number.isFinite(Date.parse(trip.date)) || new Date(trip.date).toISOString().slice(0, 10) !== trip.date) throw new Error('Nieprawidłowa data wyprawy.');
  if (!['river', 'lake', 'mixed'].includes(trip.waterType)) throw new Error('Nieprawidłowy rodzaj akwenu.');
  if (!['drawn', 'gpx', 'river-route', ...CATALOG_GEOMETRY_KINDS].includes(trip.geometryKind)) throw new Error('Nieprawidłowy rodzaj przebiegu trasy.');
  if (trip.sourceRouteId !== null && (typeof trip.sourceRouteId !== 'string' || trip.sourceRouteId.length > 200)) throw new Error('Nieprawidłowe powiązanie z katalogiem.');
  if (!Number.isFinite(trip.distanceKm) || trip.distanceKm <= 0 || trip.distanceKm > 20000) throw new Error('Nieprawidłowy dystans wyprawy.');
  if (trip.distanceEstimated !== undefined && typeof trip.distanceEstimated !== 'boolean') throw new Error('Nieprawidłowe oznaczenie szacowanego dystansu.');
  let sourceSection;
  if (trip.sourceSection !== undefined && trip.sourceSection !== null) {
    if (!WATER_GEOMETRY_KINDS.includes(trip.geometryKind) || !trip.sourceRouteId || typeof trip.sourceSection !== 'object' || Array.isArray(trip.sourceSection)) throw new Error('Nieprawidłowe powiązanie wybranego odcinka.');
    sourceSection = {};
    for (const key of ['startSiteId', 'endSiteId', 'startOccurrenceId', 'endOccurrenceId', 'fromName', 'toName']) {
      const value = trip.sourceSection[key];
      if (typeof value !== 'string' || !value.trim() || value.length > 240) throw new Error('Nieprawidłowy opis miejsc wodowania wybranego odcinka.');
      sourceSection[key] = value.trim();
    }
    if (sourceSection.startOccurrenceId === sourceSection.endOccurrenceId) throw new Error('Start i meta odcinka nie mogą być tym samym wystąpieniem punktu.');
  }
  let riverRoute;
  if (trip.geometryKind === 'river-route') {
    if (trip.sourceRouteId !== null || !trip.riverRoute || typeof trip.riverRoute !== 'object' || Array.isArray(trip.riverRoute)) throw new Error('Brak opisu własnej trasy po rzece.');
    riverRoute = {};
    for (const key of ['river', 'fromName', 'toName']) {
      const value = trip.riverRoute[key];
      if (typeof value !== 'string' || !value.trim() || value.length > 240) throw new Error('Nieprawidłowy opis rzeki, startu lub mety.');
      riverRoute[key] = value.trim();
    }
  }
  const geometry = validateGeometry(trip.geometry);
  const measured = ['drawn', 'gpx', 'river-route'].includes(trip.geometryKind) || Boolean(sourceSection);
  return { id: trip.id, name: trip.name.trim(), date: trip.date, waterType: trip.waterType, notes: trip.notes, distanceKm: measured ? geometryLength(geometry) : trip.distanceKm, geometryKind: trip.geometryKind, sourceRouteId: trip.sourceRouteId, geometry: structuredClone(geometry), ...(sourceSection ? { sourceSection } : {}), ...(riverRoute ? { riverRoute } : {}), ...(!measured && trip.distanceEstimated ? { distanceEstimated: true } : {}) };
}
export function parseBackup(text) {
  if (text.length > 15_000_000) throw new Error('Kopia jest zbyt duża (limit 15 MB).');
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('Nie udało się odczytać pliku JSON.'); }
  if (data?.version !== 1 || !Array.isArray(data.trips) || data.trips.length > 500) throw new Error('To nie jest obsługiwana kopia dziennika SUP (wersja 1, do 500 wypraw).');
  const trips = data.trips.map(validateTrip);
  if (new Set(trips.map(trip => trip.id)).size !== trips.length) throw new Error('Kopia zawiera powtarzające się identyfikatory.');
  return trips;
}
export function loadTrips(storage) {
  const raw = storage.getItem(STORAGE_KEY);
  return raw === null ? [] : parseBackup(raw);
}
export function saveTrips(storage, trips) {
  if (trips.length > 500) throw new Error('Dziennik mieści do 500 wypraw. Wyeksportuj starsze wpisy.');
  const clean = trips.map(validateTrip);
  storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, trips: clean }));
  return clean;
}
export function mergeTrips(existing, incoming) {
  const ids = new Set(existing.map(trip => trip.id));
  // A backup never overwrites a newer local edit of the same trip.
  return [...existing, ...incoming.filter(trip => !ids.has(trip.id))];
}
