(function (root) {
  "use strict";
  const M = root.SurfModel;
  const memory = new Map();
  const pending = new Map();
  const PREFIX = "nad-morzem:surf-v2:";
  const spotKey = spot => `${spot.id}:${spot.lat}:${spot.lon}:${spot.normal}`;
  function read(key) {
    if (memory.has(key)) return memory.get(key);
    try { return JSON.parse(localStorage.getItem(PREFIX + key)); } catch { return null; }
  }
  function write(key, value) {
    memory.set(key, value);
    try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch { /* RAM cache still works. */ }
  }
  async function json(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 18000);
    try {
      const r = await fetch(url, { signal: controller.signal });
      if (!r.ok) throw new Error(r.status === 429 ? "Limit zapytań dostawcy — spróbuj za kilka minut." : `Dostawca zwrócił HTTP ${r.status}.`);
      const data = await r.json();
      if (data.error) throw new Error(data.reason || "Nieprawidłowa odpowiedź dostawcy.");
      return data;
    } finally { clearTimeout(timer); }
  }
  function endpoint(base, params) { return `${base}?${new URLSearchParams(params)}`; }
  async function scheduledWeather(spot, fallbackURL, force) {
    const key = `scheduled-wind-${spotKey(spot)}`, previous = memory.get(key);
    if (previous && !force && Date.now() - previous.loadedAt < 1800000) return previous.value;
    try {
      const data = await json(`data/wind/${encodeURIComponent(spot.id)}.json?v=${Math.floor(Date.now() / 1800000)}`);
      const age = Date.now() - data.fetchedAt;
      if (data.schema !== 1 || data.spotId !== spot.id || !M.finite(data.fetchedAt) || age < -300000 || age > 21600000 ||
          !Array.isArray(data.data?.hourly?.time) || !data.data.hourly.time.length) throw new Error("Nieaktualny pakiet wiatru");
      const value = { ...data, stale: false };
      memory.set(key, { loadedAt: Date.now(), value });
      return value;
    } catch {
      const result = await cached(`weather-${spotKey(spot)}`, fallbackURL, force);
      return { ...result, sourceType: "direct", source: "BS Wind 3 — bezpośrednie dane Open-Meteo" };
    }
  }
  async function nearshore(spot, force = false) {
    const key = `swan-${spotKey(spot)}`, previous = memory.get(key);
    if (previous && !force && Date.now() - previous.loadedAt < 900000) return previous.value;
    try {
      const value = await json(`data/nearshore/${encodeURIComponent(spot.id)}.json?v=${Math.floor(Date.now() / 900000)}`);
      if (value.schema !== 1 || value.spot?.id !== spot.id) throw new Error("Niezgodny wynik SWAN");
      if (value.status === "ready" && (!M.finite(value.generatedAt) || !Array.isArray(value.hourly) ||
          ["lat", "lon", "normal"].some(k => value.spot[k] !== spot[k]))) throw new Error("Niezgodna geometria SWAN");
      memory.set(key, { loadedAt: Date.now(), value });
      return value;
    } catch (error) { return { status: "unavailable", error: error.message }; }
  }
  async function cached(key, url, force = false) {
    const old = read(key), age = Date.now() - old?.fetchedAt;
    if (old?.data?.hourly?.time && age >= 0 && age < (force ? 60000 : 1800000)) return { ...old, stale: false };
    if (pending.has(key)) return pending.get(key);
    const task = (async () => {
      try {
        const data = await json(url);
        if (!Array.isArray(data.hourly?.time) || !data.hourly.time.length || !data.hourly.time.every(M.finite)) throw new Error("Niepełna prognoza dostawcy.");
        const result = { data, fetchedAt: Date.now(), url };
        write(key, result);
        return { ...result, stale: false };
      } catch (error) {
        if (old?.data?.hourly?.time && age >= 0 && age <= 21600000) return { ...old, stale: true, error: error.message };
        throw error;
      } finally { pending.delete(key); }
    })();
    pending.set(key, task);
    return task;
  }
  function forecasts(spot, force = false) {
    const sea = M.offshore(spot);
    const common = { past_days: 2, forecast_days: 6, timeformat: "unixtime", timezone: "GMT" };
    const marineURL = endpoint("https://marine-api.open-meteo.com/v1/marine", { ...common,
      latitude: sea.lat.toFixed(5), longitude: sea.lon.toFixed(5), cell_selection: "sea",
      hourly: "wave_height,wave_direction,wave_period", models: Object.keys(M.WAVE_MODELS).join(",") });
    const weatherURL = endpoint("https://api.open-meteo.com/v1/forecast", { ...common,
      latitude: spot.lat, longitude: spot.lon, wind_speed_unit: "ms", cell_selection: "nearest",
      hourly: "wind_speed_10m,wind_direction_10m,wind_gusts_10m,temperature_2m,is_day", models: Object.keys(M.WIND_MODELS).join(",") });
    // Nie odrzucamy fal, gdy brakuje wiatru; ocena wtedy pozostaje pusta.
    return Promise.allSettled([cached(`marine-${spotKey(spot)}`, marineURL, force), scheduledWeather(spot, weatherURL, force)])
      .then(([marine, weather]) => ({ marine: marine.status === "fulfilled" ? marine.value : null,
        weather: weather.status === "fulfilled" ? weather.value : null,
        errors: [marine, weather].filter(r => r.status === "rejected").map(r => r.reason.message) }));
  }
  async function bathymetry(spot) {
    const key = `bath-${spotKey(spot)}`, old = read(key);
    const age = Date.now() - old?.fetchedAt;
    if (old && age >= 0 && age < (old.complete ? 2592000000 : 600000)) return old;
    if (pending.has(key)) return pending.get(key);
    const task = (async () => {
      const distances = [100, 250, 500, 1000, 2000, 5000];
      const samples = [];
      // Małe grupy, żeby nie wysyłać kilkudziesięciu zapytań przy szybkim przełączaniu.
      for (let i = 0; i < distances.length; i += 2) {
        samples.push(...await Promise.all(distances.slice(i, i + 2).map(async distance => {
          const p = M.offshore(spot, distance);
          const url = endpoint("https://ows.emodnet-bathymetry.eu/wms", { service: "WMS", version: "1.1.1", request: "GetFeatureInfo",
            layers: "emodnet:mean", query_layers: "emodnet:mean", srs: "EPSG:4326",
            bbox: `${p.lon - 0.001},${p.lat - 0.001},${p.lon + 0.001},${p.lat + 0.001}`,
            width: 3, height: 3, x: 1, y: 1, info_format: "application/json" });
          try {
            const data = await json(url);
            const depth = data.features?.[0]?.properties?.Depth;
            // WMS podaje rzędną: wartości ujemne leżą pod powierzchnią.
            return { distance, ...p, depth: M.finite(depth) && depth < 0 && depth > -1000 ? -depth : null };
          } catch { return { distance, ...p, depth: null }; }
        })));
      }
      const result = { samples, complete: samples.every(s => M.finite(s.depth)), fetchedAt: Date.now(), source: "EMODnet mean / LAT" };
      write(key, result);
      return result;
    })().finally(() => pending.delete(key));
    pending.set(key, task);
    return task;
  }
  root.SurfAPI = { forecasts, bathymetry, nearshore };
})(globalThis);
