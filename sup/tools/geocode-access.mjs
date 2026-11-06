import { readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { search, root } from './osm-data.mjs';
import { normalize, linesOfGeometry } from '../src/core.js';
import { nearestAccessPosition } from '../src/access.js';

if (process.argv.includes('--background')) {
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '--worker'], { cwd: root, detached: true, stdio: 'ignore' });
  child.unref(); console.log(`Geokodowanie przystani SUP uruchomione, PID ${child.pid}. Postęp: .cache/launch-sources/geocoded.json`);
} else {
  const output = path.join(root, '.cache/launch-sources/geocoded.json');
  const catalog = JSON.parse(await readFile(path.join(root, 'data/routes.json')));
  const geometry = JSON.parse(await readFile(path.join(root, 'data/route-map.geojson')));
  const directory = JSON.parse(await readFile(path.join(root, '.cache/launch-sources/directory.json')));
  const canon = value => normalize(value).replace(/rzeka|szlak|\(.*?\)/g, '').replace(/\s+/g, ' ').trim();
  const keys = route => [...new Set([route.river.split(' · ')[0], ...route.map.rivers.map(r => r.split(' rzeka')[0])].flatMap(r => r.split(' + ')).map(canon))];
  const profiles = catalog.routes.map(route => ({ route, keys: keys(route), feature: geometry.features.find(f => f.properties.id === route.id) }));
  const sourceKeys = record => record.rivers.flatMap(river => {
    if (/Pilica, Graniczna/.test(river.name)) return ['pilica kaszubska', 'graniczna', 'trzebiocha'];
    if (/Kółko/.test(river.name)) return ['radunia', 'kolko jezior radunskich'];
    if (/Czarna Woda/.test(river.name)) return ['czarna wda', 'czarna woda'];
    return [canon(river.name)];
  });
  const relevant = record => profiles.filter(profile => sourceKeys(record).some(key => profile.keys.includes(key)));
  const eligible = record => /przystań|stanica|pomost|wodowan|slip/i.test(record.title + ' ' + record.services.join(' ')) && !/^Przenoska/i.test(record.title) && !/w przygotowaniu|w budowie|planowan/i.test(record.title);
  const records = directory.records.filter(record => eligible(record) && relevant(record).length);
  const result = { status: 'running', total: records.length, processed: 0, sites: [], unresolved: [], updatedAt: '' };
  const checkpoint = async () => { result.updatedAt = new Date().toISOString(); await writeFile(output, JSON.stringify(result, null, 2) + '\n'); };
  const types = new Set(['marina', 'slipway', 'access_point', 'pier', 'boat_rental', 'camp_site', 'caravan_site', 'picnic_site', 'beach', 'beach_resort', 'swimming_area', 'guest_house', 'hotel', 'chalet', 'sports_centre']);
  const sourceToken = text => normalize(text).split(/\W+/).filter(token => token.length > 3 && !['przystan', 'kajakowa', 'kajakowy', 'kajakowe', 'rzeka', 'miejscowosci', 'jeziorem', 'przenoska', 'mlyn', 'przy', 'wodna', 'pole', 'biwakowe'].includes(token)).map(token => token.slice(0, 5));
  function queries(record) {
    const address = record.address.replace(/\b\d{2}-\d{3}\b/g, '').replace(/\b(?:ul\.|gm\.|dz\.).*$/i, '').trim().replace(/[,;]+$/, '');
    const title = record.title.replace(/Przystań kajakowa(?: nad rzeką .*?)? w miejscowości /i, 'Przystań kajakowa ').replace(/ w ramach Pomorskich Szlaków Kajakowych/i, '');
    return [...new Set([address ? `przystań kajakowa ${address}` : title, title, address ? `stanica ${address}` : null].filter(Boolean))];
  }
  await checkpoint();
  for (const record of records) {
    try {
      const nearby = relevant(record);
      const all = nearby.flatMap(profile => linesOfGeometry(profile.feature.geometry).flat());
      const bounds = all.reduce((b, p) => [Math.min(b[0], p[0] - .03), Math.min(b[1], p[1] - .03), Math.max(b[2], p[0] + .03), Math.max(b[3], p[1] + .03)], [Infinity, Infinity, -Infinity, -Infinity]);
      let match = null;
      for (const query of queries(record)) {
        const response = await search(query, 'access', bounds);
        const candidates = [];
        for (const point of response.results) {
          if (!types.has(point.type) || ['place', 'boundary', 'highway'].includes(point.category)) continue;
          const locality = point.address?.hamlet ?? point.address?.village ?? point.address?.town ?? point.address?.city;
          const address = normalize(record.address).replace(/[^a-z0-9]+/g, ' ');
          if (!locality || !(` ${address} `).includes(` ${normalize(locality).replace(/[^a-z0-9]+/g, ' ')} `)) continue;
          const coordinates = [+point.lon, +point.lat];
          const matches = nearby.map(profile => ({ id: profile.route.id, position: nearestAccessPosition(coordinates, profile.feature.geometry, .35) })).filter(item => item.position);
          if (!matches.length) continue;
          const tokens = sourceToken(record.title + ' ' + record.address), haystack = normalize(point.display_name);
          const similarity = tokens.filter(token => haystack.includes(token)).length;
          if (!similarity) continue;
          candidates.push({ point, coordinates, distance: Math.min(...matches.map(m => m.position.distanceKm)), matches, score: similarity });
        }
        candidates.sort((a, b) => b.score - a.score || a.distance - b.distance);
        if (candidates.length) { match = candidates[0]; break; }
      }
      if (match) {
        const tags = match.point.extratags ?? {};
        const restricted = ['no', 'private'].includes(tags.access) || tags.canoe === 'no';
        const privateOperator = ['hotel', 'guest_house', 'chalet', 'boat_rental', 'camp_site'].includes(match.point.type) || tags.access === 'customers';
        result.sites.push({
          id: `osm:${match.point.osm_type}:${match.point.osm_id}`, name: record.title, coordinates: match.coordinates,
          kind: /pomost/i.test(record.title) ? 'pier' : 'marina', status: restricted ? 'restricted' : 'documented', selectable: !restricted,
          riverKeys: sourceKeys(record), address: record.address, season: record.season,
          conditions: restricted ? 'Mapa OSM wskazuje dostęp ograniczony. Miejsce wymaga potwierdzenia u zarządcy.' : privateOperator ? 'Obiekt operatora / kempingu. Uzgodnij korzystanie z własną deską i ewentualną opłatę.' : 'Warunki korzystania i ewentualne opłaty sprawdź u zarządcy.',
          landAccess: record.services.some(s => /parking/i.test(s)) ? 'Źródło wymienia parking przy obiekcie.' : 'Źródło nie określa szczegółów dojazdu; sprawdź opis obiektu.',
          services: record.services, phone: record.phone, coordinateAccuracy: 'facility',
          sources: [record.source, { name: 'OpenStreetMap · lokalizacja obiektu', url: `https://www.openstreetmap.org/${match.point.osm_type}/${match.point.osm_id}`, accessedAt: '2026-10-23' }],
          osmTags: tags, sourceId: record.id, osmName: match.point.display_name, osmAddress: match.point.address, distanceToWaterKm: match.distance
        });
      } else result.unresolved.push({ id: record.id, name: record.title, address: record.address, rivers: sourceKeys(record), reason: 'Brak jednoznacznie dopasowanego obiektu przy trasie.' });
    } catch (error) {
      result.unresolved.push({ id: record.id, name: record.title, reason: error.message });
      if (/^(429|509):/.test(error.message)) { result.status = 'rate-limited'; await checkpoint(); throw error; }
    }
    result.processed++; await checkpoint();
    if (!process.argv.includes('--worker') && result.processed % 10 === 0) console.log(`${result.processed}/${result.total}: ${result.sites.length} lokalizacji`);
  }
  result.status = 'completed'; await checkpoint();
  console.log(`Przystanie: ${result.sites.length} dopasowanych, ${result.unresolved.length} do uzupełnienia.`);
}
