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
  // Users see errors only in Polish: problems found here carry their own Polish text, failed requests
  // get a Polish description and anything unexpected a general one.
  const polishError = text => Object.assign(new Error(text), { polish: true });
  const errorText = error => error?.polish ? error.message : "Nie udało się pobrać danych.";
  // An error after a label ("Pogoda i słońce: …") continues the sentence.
  const lowerFirst = text => text ? text[0].toLowerCase() + text.slice(1) : text;
  async function json(url, { allowError = false } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 18000);
    const timedOut = error => error?.name === "AbortError";
    try {
      let r, data;
      try { r = await fetch(url, { signal: controller.signal }); }
      catch (error) { throw polishError(timedOut(error) ? "Serwer nie odpowiedział na czas." : "Brak połączenia z serwerem — sprawdź internet."); }
      if (!r.ok) throw polishError(r.status === 429 ? "Limit zapytań dostawcy — spróbuj za kilka minut." : `Dostawca zwrócił HTTP ${r.status}.`);
      try { data = await r.json(); }
      catch (error) { throw polishError(timedOut(error) ? "Serwer nie odpowiedział na czas." : "Nieprawidłowa odpowiedź dostawcy."); }
      // The provider's own reason is in English, so it is not passed on.
      if (data?.error && !allowError) throw polishError("Nieprawidłowa odpowiedź dostawcy.");
      return data;
    } finally { clearTimeout(timer); }
  }
  function endpoint(base, params) { return `${base}?${new URLSearchParams(params)}`; }
  // `published`: the spot's wind taken from the coast file, checked exactly like its own file.
  async function scheduledWeather(spot, fallbackURL, force, publishedOnly = false, published = null) {
    const key = `scheduled-wind-${spotKey(spot)}`, previous = memory.get(key);
    const saved = read(`${key}-saved`);
    if (previous && !force && Date.now() - previous.loadedAt < 1800000) return previous.value;
    try {
      const data = published || await json(`data/wind/${encodeURIComponent(spot.id)}.json?v=${Math.floor(Date.now() / 1800000)}`);
      const age = Date.now() - data.fetchedAt;
      if (data.schema !== 1 || data.spotId !== spot.id || !M.finite(data.fetchedAt) || age < -300000 || age > 21600000 ||
          !Array.isArray(data.data?.hourly?.time) || !data.data.hourly.time.length)
        throw polishError(age > 21600000 ? "Opublikowany wiatr ma ponad 6 godzin — potrzebne jest odświeżenie danych." : "Nieprawidłowy lub nieaktualny pakiet wiatru.");
      if (!M.windMatchesSpot(data, spot)) throw polishError("Pakiet wiatru nie potwierdza aktualnych współrzędnych spotu.");
      const value = { ...data, stale: Boolean(data.reusedInputs) };
      memory.set(key, { loadedAt: Date.now(), value });
      // Offline copies come only from spots opened one by one; copies of the whole coast would overflow the storage.
      if (!published) write(`${key}-saved`, value);
      return value;
    } catch (error) {
      let failure = error;
      if (!publishedOnly) {
        try {
          const result = await cached(`weather-${spotKey(spot)}`, fallbackURL, force);
          return { ...result, sourceType: "direct", source: "BS Wind 8 — bezpośrednie dane Open-Meteo" };
        } catch (directError) { failure = directError; }
      }
      const age = Date.now() - saved?.fetchedAt;
      if (saved?.schema === 1 && saved.spotId === spot.id && age >= 0 && age <= 21600000 &&
          M.windMatchesSpot(saved, spot) && saved.data?.hourly?.time?.length)
        return { ...saved, stale: true, error: errorText(failure) };
      throw failure;
    }
  }
  // localStorage fits only a few full files, so the offline copy keeps cross-sections for the first five days.
  function offlineCopy(value, hours = 120) {
    const until = value.hourly[0]?.time + hours * 3600;
    return { ...value, profileHours: hours, hourly: value.hourly.map(row => row.time > until ? { ...row, profile: [] } : row) };
  }
  // `slim`: the spot's waves from the coast file, without cross-sections. They are checked like the spot's own file,
  // but neither cached nor saved for the spot's page, which draws the cross-sections.
  async function nearshore(spot, force = false, slim = null) {
    const key = `swan-${M.SIMULATION_VERSION}-${spotKey(spot)}`, previous = memory.get(key);
    const age = M.simulationAge(previous?.value, Date.now());
    const ttl = previous?.value.refreshPending || previous?.value.refreshError || !M.finite(age) || age > 18 ? 5000 : 900000;
    if (!slim && previous && !force && Date.now() - previous.loadedAt < ttl) return previous.value;
    try {
      const value = slim || await json(`data/nearshore/${encodeURIComponent(spot.id)}.json?model=${M.SIMULATION_VERSION}&v=${Math.floor(Date.now() / 900000)}`, { allowError: true });
      if (value.schema !== 2 || value.spot?.id !== spot.id) throw polishError("Wynik wymaga przeliczenia dla strefy 0–500 m od brzegu");
      if (value.status === "ready" && value.version !== M.SIMULATION_VERSION) throw polishError("Prognoza wymaga przeliczenia dla nowego punktu od strony morza.");
      if (value.status === "ready" && (![value.generatedAt, value.windFetchedAt, value.boundaryFetchedAt].every(M.finite) || !Array.isArray(value.hourly) ||
          ["lat", "lon", "normal"].some(k => value.spot[k] !== spot[k]))) throw polishError("Niezgodna geometria SWAN");
      if (slim) return value;
      memory.set(key, { loadedAt: Date.now(), value });
      const valueAge = M.simulationAge(value, Date.now());
      if (value.status === "ready" && M.finite(valueAge) && valueAge <= 18) write(`${key}-saved`, offlineCopy(value));
      return value;
    } catch (error) {
      const saved = read(`${key}-saved`), savedAge = M.simulationAge(saved, Date.now());
      if (saved?.status === "ready" && saved.version === M.SIMULATION_VERSION && saved.schema === 2 && saved.spot?.id === spot.id &&
          ["lat", "lon", "normal"].every(k => saved.spot[k] === spot[k]) && M.finite(savedAge) && savedAge <= 18)
        return { ...saved, stale: true, refreshPending: false, refreshError: errorText(error), retryAfter: 60 };
      // No usable wave data: the page says "Brak danych o falach" and keeps the reason in its collapsed details.
      return { status: "unavailable", error: errorText(error), loadFailed: true };
    }
  }
  async function cached(key, url, force = false) {
    const old = read(key), age = Date.now() - old?.fetchedAt;
    if (old?.data?.hourly?.time && age >= 0 && age < (force ? 60000 : 1800000)) return { ...old, stale: false };
    if (pending.has(key)) return pending.get(key);
    const task = (async () => {
      try {
        const data = await json(url);
        if (!Array.isArray(data.hourly?.time) || !data.hourly.time.length || !data.hourly.time.every(M.finite)) throw polishError("Niepełna prognoza dostawcy.");
        const result = { data, fetchedAt: Date.now(), url };
        write(key, result);
        return { ...result, stale: false };
      } catch (error) {
        if (old?.data?.hourly?.time && age >= 0 && age <= 21600000) return { ...old, stale: true, error: errorText(error) };
        throw error;
      } finally { pending.delete(key); }
    })();
    pending.set(key, task);
    return task;
  }
  function forecasts(spot, force = false, { coastalOnly = false, publishedOnly = false, published = null } = {}) {
    const sea = M.offshore(spot);
    const common = { past_days: 2, forecast_days: 16, timeformat: "unixtime", timezone: "GMT" };
    const marineURL = endpoint("https://marine-api.open-meteo.com/v1/marine", { ...common,
      latitude: sea.lat.toFixed(5), longitude: sea.lon.toFixed(5), cell_selection: "sea",
      hourly: "wave_height,wave_direction,wave_period", models: Object.keys(M.WAVE_MODELS).join(",") });
    const weatherURL = endpoint("https://api.open-meteo.com/v1/forecast", { ...common,
      latitude: spot.lat, longitude: spot.lon, wind_speed_unit: "ms", cell_selection: "nearest",
      hourly: "wind_speed_10m,wind_direction_10m,wind_gusts_10m,is_day", models: Object.keys(M.WIND_MODELS).join(",") });
    // Nie odrzucamy fal, gdy brakuje wiatru; ocena wtedy pozostaje pusta.
    return Promise.allSettled([coastalOnly ? Promise.resolve(null) : cached(`marine-${spotKey(spot)}`, marineURL, force), scheduledWeather(spot, weatherURL, force, publishedOnly, published)])
      .then(([marine, weather]) => ({ marine: marine.status === "fulfilled" ? marine.value : null,
        weather: weather.status === "fulfilled" ? weather.value : null,
        errors: [marine, weather].filter(r => r.status === "rejected").map(r => errorText(r.reason)) }));
  }
  function conditions(spot, force = false) {
    // Only the open spot requests these extras; the coast-wide ranking uses published wind/SWAN.
    const common = { latitude: spot.lat, longitude: spot.lon, past_days: 1, forecast_days: 16,
      timeformat: "unixtime", timezone: "Europe/Warsaw" };
    const weatherURL = endpoint("https://api.open-meteo.com/v1/forecast", { ...common,
      hourly: "temperature_2m,cloud_cover,weather_code", daily: "sunrise,sunset", temperature_unit: "celsius", cell_selection: "nearest" });
    const seaURL = endpoint("https://marine-api.open-meteo.com/v1/marine", { ...common,
      hourly: "sea_surface_temperature", cell_selection: "sea" });
    return Promise.allSettled([cached(`conditions-weather-v2-${spotKey(spot)}`, weatherURL, force),
      cached(`conditions-sea-v1-${spotKey(spot)}`, seaURL, force)]).then(([weather, sea]) => ({
        weather: weather.status === "fulfilled" ? weather.value : null,
        sea: sea.status === "fulfilled" ? sea.value : null,
        errors: [weather, sea].flatMap((result, i) => result.status === "rejected"
          ? [`${i === 0 ? "Pogoda i słońce" : "Temperatura wody"}: ${lowerFirst(errorText(result.reason))}`] : [])
      }));
  }
  // "Pokaż najlepsze" and the heat map read one file for the whole coast (data/coast.json, without cross-sections)
  // instead of two files per spot. A missing or broken file is remembered for a minute; the spots then use their own files.
  function coast(force = false) {
    const previous = memory.get("coast");
    if (previous && !force && Date.now() - previous.loadedAt < (previous.value ? 900000 : 60000)) return Promise.resolve(previous.value);
    if (pending.has("coast")) return pending.get("coast");
    const task = json(`data/coast.json?model=${M.SIMULATION_VERSION}&v=${Math.floor(Date.now() / 900000)}`)
      .then(value => value?.schema === 1 && value.spots && typeof value.spots === "object" ? value : null, () => null)
      .then(value => { memory.set("coast", { loadedAt: Date.now(), value }); return value; })
      .finally(() => pending.delete("coast"));
    pending.set("coast", task);
    return task;
  }
  // One spot for the ranking or the heat map: [forecast, waves] as from forecasts() and nearshore().
  // Call coast(force) once before a whole round; each spot then reads the file already in memory.
  async function coastal(spot, force = false) {
    const entry = (await coast())?.spots?.[spot.id];
    return Promise.all([forecasts(spot, force, { coastalOnly: true, publishedOnly: true, published: entry?.wind }),
      nearshore(spot, force, entry?.nearshore)]);
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
  root.SurfAPI = { forecasts, conditions, bathymetry, nearshore, coast, coastal, polishError, errorText, lowerFirst };
})(globalThis);
