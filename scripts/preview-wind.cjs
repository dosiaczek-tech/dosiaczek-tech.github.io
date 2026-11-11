// Refresh wind for local previews when the published bundle expires. SWAN stays independent.
const { WIND_MODELS, windMatchesSpot } = require("../surf-model.js");
const MODELS = Object.keys(WIND_MODELS);
const MAX_AGE = 6 * 3600000;
const CACHE_TTL = 30 * 60000;

function validWeather(data) {
  const hourly = data?.hourly, times = hourly?.time;
  if (!Array.isArray(times) || !times.length || !times.every(Number.isFinite)) return false;
  const series = key => Array.isArray(hourly[key]) && hourly[key].length === times.length && hourly[key].some(Number.isFinite);
  return MODELS.filter(model => series(`wind_speed_10m_${model}`) && series(`wind_direction_10m_${model}`)).length >= 2
    && MODELS.some(model => series(`is_day_${model}`));
}

function usableWind(bundle, id, now = Date.now(), spot = null) {
  const age = now - bundle?.fetchedAt;
  return bundle?.schema === 1 && bundle.spotId === id && Number.isFinite(bundle.fetchedAt)
    && age >= -300000 && age <= MAX_AGE && validWeather(bundle.data) && (!spot || windMatchesSpot(bundle, spot));
}

function createPreviewWind({ spots, fetch = globalThis.fetch, now = Date.now, batchSize = 20,
  onRefresh = () => {}, onFailure = () => {} }) {
  const batches = [], batchFor = new Map(), cache = new Map(), pending = new Map(), failures = new Map();
  const byId = new Map(spots.map(spot => [spot.id, spot]));
  let rateLimit = null;
  for (let i = 0; i < spots.length; i += batchSize) {
    const index = batches.length, batch = spots.slice(i, i + batchSize);
    batches.push(batch); batch.forEach(spot => batchFor.set(spot.id, index));
  }
  async function refresh(index) {
    if (pending.has(index)) return pending.get(index);
    if (rateLimit && now() < rateLimit.until) throw rateLimit.error;
    const failure = failures.get(index);
    if (failure && now() < failure.until) throw failure.error;
    const batch = batches[index];
    const task = (async () => {
      try {
        const params = new URLSearchParams({ latitude: batch.map(s => s.lat).join(","), longitude: batch.map(s => s.lon).join(","),
          hourly: "wind_speed_10m,wind_direction_10m,wind_gusts_10m,temperature_2m,is_day", models: MODELS.join(","),
          wind_speed_unit: "ms", cell_selection: "nearest", past_days: 2, forecast_days: 16, timeformat: "unixtime", timezone: "GMT" });
        const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { signal: AbortSignal.timeout(10000) });
        if (!response.ok) {
          const error = new Error(`Open-Meteo: HTTP ${response.status}`);
          if (response.status === 429) {
            const header = response.headers?.get("retry-after");
            const until = header && Number.isFinite(Number(header)) ? now() + Number(header) * 1000 : Date.parse(header || "");
            rateLimit = { until: Math.max(now() + 60000, Number.isFinite(until) ? until : 0), error };
          }
          throw error;
        }
        const payload = await response.json(), results = Array.isArray(payload) ? payload : [payload];
        if (results.length !== batch.length || !results.every(validWeather)) throw new Error("Niepełna odpowiedź prognozy wiatru");
        const fetchedAt = now();
        // Publish the whole batch only after validation. Cached timestamps always remain original.
        batch.forEach((spot, i) => cache.set(spot.id, { schema: 1, spotId: spot.id, fetchedAt, data: results[i],
          spot: { id: spot.id, lat: spot.lat, lon: spot.lon },
          source: "BS Wind 3 — lokalne odświeżenie Open-Meteo (ICON / GFS / ECMWF)", sourceType: "local", reusedInputs: false }));
        failures.delete(index);
        onRefresh(batch.length);
      } catch (error) {
        failures.set(index, { until: Math.max(now() + 60000, rateLimit?.until || 0), error });
        onFailure(error);
        throw error;
      } finally { pending.delete(index); }
    })();
    pending.set(index, task);
    return task;
  }
  async function get(id, published = null) {
    if (!batchFor.has(id)) throw new Error("Nieznany spot prognozy wiatru");
    const spot = byId.get(id);
    if (usableWind(published, id, now(), spot)) return published;
    const old = cache.get(id), age = now() - old?.fetchedAt;
    if (usableWind(old, id, now(), spot) && age < CACHE_TTL) return old;
    try {
      await refresh(batchFor.get(id));
      return cache.get(id);
    } catch (error) {
      if (usableWind(old, id, now(), spot)) return { ...old, reusedInputs: true, lastRefreshError: error.message };
      throw error;
    }
  }
  return { get, has: id => batchFor.has(id) };
}

module.exports = { createPreviewWind, usableWind };
