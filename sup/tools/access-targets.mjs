// Reviewed destinations override a town centroid BEFORE water routing. These
// bindings do not relax the maximum distance from a landing to mapped water.
import { trackAccessNotes, trackSiteId } from './track-access-notes.mjs';
import { reviewedFacilities } from './reviewed-facilities.mjs';
import { reviewedLocations } from './reviewed-locations.mjs';
import { guideAccessNotes } from './guide-access-notes.mjs';
const byPlace = {
  'Reda': 'osm:node:14101451575',
  'Nowy Most, gmina Piecki': 'osm:way:195278769',
  'Łupawsko': 'osm:node:14051972383',
  'Jezioro Węgorzyno': 'traseo:220890',
  'Jezioro Głębokie': 'traseo:220887',
  'Jezioro Głębokie (Słupia)': 'traseo:220887',
  'Jezioro Witoczno': 'osm:way:368365202',
  'Gostycyn-Nogawica': 'osm:way:368417661',
  'Czarnocin': 'kajakodajnia:czarnocin',
  'Górskie Mosty': 'traseo:848723',
  'Gniew': 'osm:way:1423088720',
  'Stocki Młyn': 'osm:way:1322337812',
  'Krępiec': 'osm:way:1239149904',
  'Gołubie': 'osm:way:75088106',
  'Leśno': 'osm:way:370724969',
  'Mylof': 'osm:way:368369979',
  'Ostrzyce': 'osm:way:173524480',
  'Wielki Podleś': 'osm:way:1212365628',
  'Sianowo': 'traseo:220882',
  'Miastko': 'traseo:220840'
};
for (const record of trackAccessNotes) for (const name of record.places) byPlace[name] = trackSiteId(record);
for (const [object, record] of Object.entries(reviewedFacilities)) for (const name of record.places ?? []) byPlace[name] = `osm:${object.replace('/', ':')}`;
for (const record of reviewedLocations) for (const name of record.places) byPlace[name] = record.id;
for (const record of guideAccessNotes) for (const name of record.places) byPlace[name] = record.id;

export function reviewedAccessTarget(place, sites) {
  const id = byPlace[place.name];
  if (!id) return place;
  const site = sites.find(site => site.id === id);
  if (!site?.selectable) throw new Error(`Brak dostępnego, wskazanego miejsca wodowania: ${place.name} (${id}).`);
  return { ...place, originalName: place.name, name: site.name, coordinates: site.coordinates, source: site.sources[0].url, accessSiteId: id, accessBinding: 'reviewed' };
}
