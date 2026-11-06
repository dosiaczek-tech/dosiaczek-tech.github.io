// Research only: coordinates, if present in publicly published photographs of
// a facility, corroborate its location. No image or EXIF value is auto-published.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { root } from './osm-data.mjs';

function exifGps(buffer) {
  for (let p = 2; p + 4 < buffer.length && buffer[p] === 255;) {
    const marker = buffer[p + 1]; if (marker === 0xda || marker === 0xd9) break;
    const length = buffer.readUInt16BE(p + 2), start = p + 4;
    if (length < 2 || p + length + 2 > buffer.length) return null;
    if (marker === 0xe1 && buffer.toString('ascii', start, start + 6) === 'Exif\0\0') {
      const t = start + 6, little = buffer.toString('ascii', t, t + 2) === 'II';
      const u16 = at => little ? buffer.readUInt16LE(at) : buffer.readUInt16BE(at);
      const u32 = at => little ? buffer.readUInt32LE(at) : buffer.readUInt32BE(at);
      const entries = offset => {
        const count = u16(offset); if (count > 500 || offset + 2 + count * 12 > p + length + 2) return [];
        return Array.from({ length: count }, (_, i) => offset + 2 + i * 12);
      };
      const gps = entries(t + u32(t + 4)).find(at => u16(at) === 0x8825);
      if (!gps) return null;
      const tags = new Map(entries(t + u32(gps + 8)).map(at => [u16(at), at]));
      const angle = tag => {
        const at = tags.get(tag); if (!at || u16(at + 2) !== 5 || u32(at + 4) !== 3) return NaN;
        const base = t + u32(at + 8), value = i => u32(base + i * 8) / u32(base + i * 8 + 4);
        return value(0) + value(1) / 60 + value(2) / 3600;
      };
      let lat = angle(2), lon = angle(4);
      if (tags.has(1) && buffer.toString('ascii', tags.get(1) + 8, tags.get(1) + 9) === 'S') lat = -lat;
      if (tags.has(3) && buffer.toString('ascii', tags.get(3) + 8, tags.get(3) + 9) === 'W') lon = -lon;
      return Number.isFinite(lat) && Number.isFinite(lon) ? [lon, lat] : null;
    }
    p += length + 2;
  }
  return null;
}
const directory = path.join(root, '.cache/launch-sources');
for (const slug of process.argv.slice(2)) {
  const html = await readFile(path.join(directory, `${slug}.html`), 'utf8');
  const urls = [...new Set([...html.matchAll(/(?:href|src)=["'](https:\/\/kajaki\.pomorskie\.eu\/wp-content\/uploads\/[^"']+\.(?:jpg|jpeg))["']/gi)].map(match => match[1].replace(/-\d+x\d+(?=\.jpe?g$)/i, '')))];
  for (const url of urls.slice(0, 4)) {
    const file = path.join(directory, `photo-${createHash('sha256').update(url).digest('hex').slice(0, 16)}.jpg`);
    let buffer;
    try { buffer = await readFile(file); }
    catch (error) {
      if (error.code !== 'ENOENT') throw error;
      const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
      if (!response.ok) { console.log(`${response.status}: ${url}`); continue; }
      buffer = Buffer.from(await response.arrayBuffer()); await writeFile(file, buffer);
    }
    try { console.log(JSON.stringify({ slug, url, coordinates: exifGps(buffer), bytes: buffer.length })); }
    catch { console.log(JSON.stringify({ slug, url, coordinates: null, error: 'EXIF nieczytelny' })); }
  }
}
