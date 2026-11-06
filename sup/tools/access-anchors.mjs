import { distanceKm } from '../src/core.js';

// Candidates must be real mapped/documented facilities and on this water
// network. Moving an endpoint may follow water only, never a graph gap.
export function accessAnchor(place, graph, sites, route, role) {
  if (place.accessBinding === 'reviewed') {
    const match = graph.nearest(place.coordinates);
    if (!match || match.distance > .12) throw new Error(`Wskazane wodowanie ${place.name}: ${match ? Math.round(match.distance * 1000) : '?'} m od sieci wodnej. Wymaga geometrii akwenu lub dokładniejszej lokalizacji zejścia.`);
    return place;
  }
  const original = graph.nearest(place.coordinates);
  if (!original) return null;
  const candidates = sites.filter(site => site.selectable && distanceKm(site.coordinates, original.point) < 1.8 && distanceKm(site.coordinates, place.coordinates) < 3);
  candidates.sort((a, b) => Number(Boolean(b.preferredFor?.[role]?.includes(route.id))) - Number(Boolean(a.preferredFor?.[role]?.includes(route.id))) || distanceKm(a.coordinates, place.coordinates) - distanceKm(b.coordinates, place.coordinates));
  for (const site of candidates) {
    if (/Radunia|Raduńskich/.test(route.river)) {
      const [x, y] = site.coordinates;
      if (x > 18.25 && x < 18.32 && y > 54.29 && y < 54.33 || x > 18.48 && x < 18.57 && y > 54.24 && y < 54.28) continue;
    }
    const match = graph.nearest(site.coordinates);
    if (!match || match.distance > .12) continue;
    const connection = graph.path(original.point, site.coordinates);
    if (!connection || connection.steps.some(step => step.kind === 'gap')) continue;
    const changeKm = connection.steps.reduce((sum, step) => sum + distanceKm(step.from, step.to), 0);
    if (changeKm > Math.min(3, route.lengthKm * .3)) continue;
    return { ...place, name: site.name, coordinates: site.coordinates, source: site.sources[0].url, accessSiteId: site.id, originalName: place.name };
  }
  return null;
}
