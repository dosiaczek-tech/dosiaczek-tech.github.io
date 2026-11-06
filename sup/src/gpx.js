import { validateGeometry } from './core.js';

export function parseGpx(text, Parser = DOMParser) {
  if (text.length > 8_000_000) throw new Error('Plik GPX jest zbyt duży (limit 8 MB).');
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('GPX nie może zawierać deklaracji DTD ani encji.');
  const doc = new Parser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagNameNS('*', 'parsererror').length || doc.documentElement.localName !== 'gpx') throw new Error('To nie jest poprawny plik GPX.');
  const elements = name => [...doc.getElementsByTagNameNS('*', name)];
  const segments = elements('trkseg');
  const routes = elements('rte');
  const groups = segments.length ? segments : routes;
  const pointName = segments.length ? 'trkpt' : 'rtept';
  let count = 0;
  const lines = groups.map(group => [...group.getElementsByTagNameNS('*', pointName)].map(point => {
    if (++count > 20000) throw new Error('GPX może mieć maksymalnie 20 000 punktów.');
    const lon = point.getAttribute('lon'), lat = point.getAttribute('lat');
    if (!lon?.trim() || !lat?.trim()) throw new Error('Punkt GPX nie ma współrzędnych.');
    return [Number(lon), Number(lat)];
  })).filter(line => line.length >= 2);
  if (!lines.length) throw new Error('GPX nie zawiera śladu ani trasy z co najmniej dwoma punktami.');
  const geometry = validateGeometry(lines.length === 1 ? { type: 'LineString', coordinates: lines[0] } : { type: 'MultiLineString', coordinates: lines });
  const firstTrack = elements('trk')[0] ?? routes[0];
  const name = firstTrack ? [...firstTrack.children].find(child => child.localName === 'name')?.textContent?.trim().slice(0, 100) : '';
  const time = elements('time')[0]?.textContent;
  const date = time && Number.isFinite(Date.parse(time)) ? new Date(time).toISOString().slice(0, 10) : null;
  return { geometry, name, date };
}
