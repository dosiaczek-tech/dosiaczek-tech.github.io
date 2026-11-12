// Local frontend preview: published forecasts with real wind/SWAN refresh on source outages.
const http = require("node:http");
const { readFile, stat } = require("node:fs/promises");
const path = require("node:path");
const zlib = require("node:zlib");
const { parseArgs } = require("node:util");
const { createPreviewWind, usableWind } = require("./preview-wind.cjs");
const { createPreviewSwan, usableSwan } = require("./preview-swan.cjs");
const { coastBundle } = require("./coast-bundle.cjs");

const { values } = parseArgs({ options: {
  host: { type: "string", default: "0.0.0.0" },
  port: { type: "string", default: "8766" }
} });
const port = Number(values.port);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("Port musi być liczbą od 1 do 65535.");

const root = path.resolve(__dirname, "..");
const forecastOrigin = "https://dosiaczek-tech.github.io";
const cache = new Map();
const pending = new Map();
const spots = require("../surf-spots.js"), byId = new Map(spots.map(spot => [spot.id, spot]));
const windSource = createPreviewWind({ spots,
  onRefresh: count => { cache.delete("/data/coast.json"); console.log(`Wiatr: lokalnie odświeżono ${count} spotów z Open-Meteo.`); },
  onFailure: error => console.error(`Odświeżenie lokalnego wiatru: ${error.message}`) });
const swanSource = createPreviewSwan({ spots,
  onRefresh: status => {
    for (const key of cache.keys()) if (key.startsWith("/data/nearshore/")) cache.delete(key);
    cache.delete("/data/status.json"); cache.delete("/data/coast.json");
    console.log(`SWAN: lokalnie przeliczono prognozy; dostępne ${status?.available ?? "?"}/${spots.length} spotów.`);
  }, onFailure: error => console.error(error.message) });
const types = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".md": "text/plain; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon"
};

async function forecast(resource) {
  const key = resource.split("?")[0];
  const windId = /^\/data\/wind\/([a-z0-9-]+)\.json$/.exec(key)?.[1];
  const canRefreshWind = windId && windSource.has(windId);
  const swanId = /^\/data\/nearshore\/([a-z0-9-]+)\.json$/.exec(key)?.[1];
  const canRefreshSwan = swanId && swanSource.has(swanId);
  const swanStatus = key === "/data/status.json";
  const saved = cache.get(key);
  const cached = saved && Date.now() - saved.loadedAt < 60000;
  if (cached && (!canRefreshWind || usableWind(saved.wind, windId, Date.now(), byId.get(windId))) &&
      (!canRefreshSwan || (!saved.swan?.refreshPending && usableSwan(saved.swan, byId.get(swanId))))) return saved;
  if (pending.has(key)) return pending.get(key);
  const task = (async () => {
    let result = cached ? saved : null;
    if (!result) {
      try {
        const response = await fetch(forecastOrigin + resource, { signal: AbortSignal.timeout(canRefreshWind || canRefreshSwan || swanStatus ? 7000 : 20000) });
        result = { status: response.status, body: Buffer.from(await response.arrayBuffer()),
          type: response.headers.get("content-type") || "application/json", loadedAt: Date.now() };
      } catch (error) { if (!canRefreshWind && !canRefreshSwan && !swanStatus) throw error; }
    }
    if (canRefreshWind) {
      let published = null;
      try { if (result?.status === 200) published = JSON.parse(result.body.toString("utf8")); } catch { /* Refresh malformed bundles too. */ }
      if (result) result.wind = published;
      try {
        const wind = await windSource.get(windId, published);
        if (wind !== published) result = { status: 200, body: Buffer.from(JSON.stringify(wind)),
          type: "application/json; charset=utf-8", loadedAt: Date.now(), wind };
      } catch (error) { if (!result) throw error; }
    }
    if (canRefreshSwan) {
      let published = null;
      try { if (result?.status === 200) published = JSON.parse(result.body.toString("utf8")); } catch { /* Try the local solver too. */ }
      const swan = await swanSource.get(swanId, published);
      result = { status: 200, body: Buffer.from(JSON.stringify(swan)),
        type: "application/json; charset=utf-8", loadedAt: Date.now(), swan };
    }
    if (swanStatus) {
      let published = null;
      try { if (result?.status === 200) published = JSON.parse(result.body.toString("utf8")); } catch { /* Prefer a valid local status. */ }
      const status = await swanSource.status(published);
      if (status) result = { status: 200, body: Buffer.from(JSON.stringify(status)), type: "application/json; charset=utf-8", loadedAt: Date.now() };
    }
    if (!result) throw new Error("Nie udało się pobrać prognozy.");
    if (result.status >= 200 && result.status < 300) cache.set(key, result);
    return result;
  })();
  pending.set(key, task);
  try { return await task; } finally { pending.delete(key); }
}

// "Pokaż najlepsze" and the heat map read one file for the whole coast, built from the same per-spot answers
// (local wind and SWAN refreshes included), so the preview matches what each spot's own files say.
async function coast() {
  const key = "/data/coast.json", saved = cache.get(key);
  if (saved && Date.now() - saved.loadedAt < 60000) return saved;
  if (pending.has(key)) return pending.get(key);
  const task = (async () => {
    const entries = [];
    let next = 0;
    await Promise.all(Array.from({ length: 8 }, async () => {
      while (next < spots.length) {
        const id = spots[next++].id, documents = {};
        for (const kind of ["wind", "nearshore"]) {
          try {
            const result = await forecast(`/data/${kind}/${id}.json`);
            if (result.status === 200) documents[kind] = JSON.parse(result.body.toString("utf8"));
          } catch { /* Without this file the spot falls back to its own requests. */ }
        }
        entries.push([id, documents]);
      }
    }));
    const result = { status: 200, body: Buffer.from(JSON.stringify(coastBundle(entries))), type: types[".json"], loadedAt: Date.now() };
    cache.set(key, result);
    return result;
  })();
  pending.set(key, task);
  try { return await task; } finally { pending.delete(key); }
}

const server = http.createServer(async (request, response) => {
  let url, pathname;
  function send(status, body, type = "text/plain; charset=utf-8") {
    // Keep the main application's camera workaround separate from SUP's normal browser policy.
    const referrerPolicy = pathname === "/sup" || pathname?.startsWith("/sup/")
      ? "strict-origin-when-cross-origin" : "same-origin";
    response.writeHead(status, { "Content-Type": type, "Content-Length": Buffer.byteLength(body),
      "Cache-Control": "no-store", "Referrer-Policy": referrerPolicy, "X-Content-Type-Options": "nosniff" });
    response.end(request.method === "HEAD" ? undefined : body);
  }
  if (!["GET", "HEAD"].includes(request.method)) {
    response.setHeader("Allow", "GET, HEAD");
    send(405, "Method not allowed");
    return;
  }
  try {
    url = new URL(request.url, "http://localhost");
    pathname = decodeURIComponent(url.pathname);
  } catch { send(400, "Invalid URL"); return; }

  if (pathname.startsWith("/data/")) {
    if (!/^\/data\/(?:status\.json|coast\.json|(?:nearshore|wind)\/[a-z0-9-]+\.json)$/.test(pathname)) {
      send(404, "Not found"); return;
    }
    try {
      const result = pathname === "/data/coast.json" ? await coast() : await forecast(pathname + url.search);
      // Like GitHub Pages, data travel compressed: the coast file shrinks from about 20 MB to 2–3 MB.
      if (result.status === 200 && /\bgzip\b/.test(request.headers["accept-encoding"] || "")) {
        result.gzip ??= zlib.gzipSync(result.body);
        response.setHeader("Content-Encoding", "gzip"); response.setHeader("Vary", "Accept-Encoding");
        send(result.status, result.gzip, result.type);
      } else send(result.status, result.body, result.type);
    } catch (error) {
      console.error(`Prognoza ${pathname}: ${error.message}`);
      send(502, JSON.stringify({ error: "Nie udało się pobrać opublikowanej prognozy." }), types[".json"]);
    }
    return;
  }

  let file = path.resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`);
  if (!file.startsWith(root + path.sep) || pathname.split("/").some(part => part.startsWith("."))) {
    send(404, "Not found"); return;
  }
  try {
    if ((await stat(file)).isDirectory()) {
      if (!url.pathname.endsWith("/")) {
        response.setHeader("Location", `${url.pathname}/${url.search}`);
        send(308, "Directory URLs end with a slash.");
        return;
      }
      file = path.join(file, "index.html");
    }
    const body = await readFile(file);
    send(200, body, types[path.extname(file)] || "application/octet-stream");
  } catch (error) {
    const missing = ["ENOENT", "ENOTDIR", "EISDIR"].includes(error.code);
    if (!missing) console.error(error);
    send(missing ? 404 : 500, missing ? "Not found" : "Cannot read file");
  }
});

server.on("error", error => {
  console.error(error.code === "EADDRINUSE" ? `Port ${port} jest zajęty. Wybierz inny przez --port NUMER.` : error);
  process.exitCode = 1;
});
server.listen(port, values.host, () => {
  // Keep real forecasts fresh even when nobody has the page open. The provider
  // throttles successful runs to six hours and retries failures after 15 minutes.
  const maintain = () => swanSource.maintain().catch(error => console.error(error));
  maintain();
  const refreshTimer = setInterval(maintain, 60000);
  refreshTimer.unref();
  server.once("close", () => clearInterval(refreshTimer));
  const hostname = values.host === "0.0.0.0" ? "zuffie.test" : values.host;
  console.log(`Podgląd: http://${hostname}:${port}/#kolobrzeg`);
  console.log(`Nasłuchiwanie: ${values.host}:${port}`);
  console.log(`Pliki: ${root}`);
  console.log(`Prognozy: ${forecastOrigin}/data/ (pamięć serwera: 60 s, oryginalne daty danych).`);
  console.log("Wygasły wiatr jest odświeżany zbiorczo z Open-Meteo i oznaczany jako lokalny; cache: 30 min.");
  console.log("Lokalny SWAN odświeża fale w tle co 6 godzin, także bez otwartej strony; wymagany Python z requests/Pillow (nix-shell). Log: .dev-preview/swan-refresh.log.");
  console.log("Zapisz plik i odśwież przeglądarkę, aby zobaczyć zmiany. Zatrzymanie: Ctrl+C.");
});
