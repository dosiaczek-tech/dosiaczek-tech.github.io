import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function worker() {
  const handlers = {}, data = new Map(), deleted = [];
  let fail = false, requests = 0;
  const cache = {
    addAll: async urls => { for (const url of urls) data.set(url, new Response('saved:' + url)); },
    match: async url => data.get(url)?.clone()
  };
  const scope = 'https://example.test/sup/';
  vm.runInNewContext(fs.readFileSync(new URL('../sw.js', import.meta.url), 'utf8'), {
    URL, Set, AbortController, setTimeout, clearTimeout,
    self: { registration: { scope }, location: { origin: 'https://example.test' },
      clients: { claim: async () => {} }, addEventListener: (name, fn) => { handlers[name] = fn; } },
    caches: { open: async () => cache, keys: async () => ['sup:offline:old', 'nad-morzem:other', 'sup:journal:private'], delete: async key => { deleted.push(key); } },
    fetch: async () => { requests++; if (fail) throw Error('offline'); return new Response('live'); }
  });
  async function event(type) { let pending; handlers[type]({waitUntil: p => {pending = p;}}); await pending; }
  function get(path, mode = 'cors') {
    let promise;
    handlers.fetch({ request: { url: new URL(path, scope).href, method: 'GET', mode }, respondWith: p => {promise = p;} });
    return promise;
  }
  return { event, get, data, deleted, offline: () => {fail = true;}, requests: () => requests };
}

test('SUP reopens its installed catalogue offline and prefers fresh online responses', async () => {
  const w = worker(); await w.event('install');
  assert.equal(await (await w.get('data/routes.json')).text(), 'live');
  w.offline();
  assert.match(await (await w.get('./', 'navigate')).text(), /saved:.*sup\/index.html/);
  assert.match(await (await w.get('data/river-network.json')).text(), /saved:/);
});

test('SUP offline storage never intercepts cloud/account data, other apps or external maps', async () => {
  const w = worker(); await w.event('install');
  for (const url of ['cloud-config.json', 'cloud-setup.html', '/data/status.json', 'https://cloud.example.test/auth', 'https://tile.openstreetmap.org/0/0/0.png'])
    assert.equal(w.get(url), undefined);
  await w.event('activate');
  assert.deepEqual(w.deleted, ['sup:offline:old']);
});
