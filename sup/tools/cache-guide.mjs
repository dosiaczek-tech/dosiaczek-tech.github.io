import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { root } from './osm-data.mjs';

for (const input of process.argv.slice(2)) {
  const url = new URL(input), name = path.basename(url.pathname).replace(/[^a-zA-Z0-9._-]/g, '-');
  const file = path.join(root, '.cache/launch-sources', name);
  try { const existing = await readFile(file); console.log(`${file}: ${existing.length} B, cache`); continue; }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const response = await fetch(url, { headers: { 'User-Agent': 'SUP-Atlas/1.0 (https://dosiaczek-tech.github.io/sup/)' }, signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`${response.status}: ${url}`);
  const data = Buffer.from(await response.arrayBuffer()); await writeFile(file, data);
  console.log(`${file}: ${data.length} B`);
}
