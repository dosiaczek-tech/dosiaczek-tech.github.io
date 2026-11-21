/* Bałtyk Surf: wspólne funkcje prognozy i odczyt opublikowanych ocen warunków.
 * Ocenę liczy podczas publikacji danych osobny moduł spoza strony; strona tylko ją odczytuje (pole `rating`
 * w pliku wiatru spotu). Tu zostają fizyka fal, geometria, kontrola danych SWAN i części zależne od chwili oglądania.
 */
(function (root) {
  "use strict";
  const VERSION = "Bałtyk Surf 1.4 / osłona od wiatru";
  const SIMULATION_VERSION = "BS-SWAN-1.4-waves-sealevel";
  // The published ratings (the `rating` member of data/wind/<id>.json) in this format.
  const RATING_SCHEMA = 1;
  // Coastal SWAN runs cover 14 days (336 h); the current hour is the first forecast row.
  const FORECAST_HOURS = 336;
  // Each surfer profile keeps its own history; the original (intermediate) one keeps its old key.
  const coastalHistoryKey = (spot, profile = "intermediate") => `nad-morzem:compare-history:${SIMULATION_VERSION}:${
    profile !== "intermediate" && PROFILES[profile] ? `${profile}:` : ""}${spot.id}:${spot.lat}:${spot.lon}:${spot.normal}`;
  // The surfer profiles offered on the page; the published ratings hold every one of them.
  const PROFILES = {
    intermediate: { label: "Średniozaawansowany" },
    beginner: { label: "Początkujący" },
    advanced: { label: "Zaawansowany" },
    longboard: { label: "Longboard" }
  };
  const profileOf = id => PROFILES[id] || PROFILES.intermediate;
  const WAVE_MODELS = { dwd_ewam: "DWD EWAM", ecmwf_wam: "ECMWF WAM" };
  // BS Wind 8: seven global models and the regional DMI HARMONIE (about 2 km) for the first ~2 days near the coast.
  // ICON and UKMO end after about a week, GEM and JMA after 10-11 days; GFS, ECMWF IFS and the
  // ECMWF AIFS (machine learning) model cover the whole two weeks.
  const WIND_MODELS = { icon_seamless: "DWD ICON", gfs_seamless: "NOAA GFS", ecmwf_ifs025: "ECMWF IFS",
    ecmwf_aifs025_single: "ECMWF AIFS", ukmo_seamless: "UK Met Office", jma_seamless: "JMA", gem_seamless: "ECCC GEM",
    dmi_harmonie_arome_europe: "DMI HARMONIE" };
  // From this slope (rise over run, surf-beach.js) the spot's description notes a steep beach.
  const STEEP_BEACH = 1 / 15;
  const finite = value => typeof value === "number" && Number.isFinite(value);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const radians = value => value * Math.PI / 180;
  const angle = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
  const median = values => {
    const sorted = values.filter(finite).sort((a, b) => a - b);
    const n = sorted.length;
    return n ? (sorted[Math.floor((n - 1) / 2)] + sorted[Math.floor(n / 2)]) / 2 : null;
  };

  function windMatchesSpot(bundle, spot) {
    if (!bundle?.spot) return !spot.requireWindGeometry;
    return bundle.spot.id === spot.id && ["lat", "lon"].every(key => finite(bundle.spot[key]) && bundle.spot[key] === spot[key]);
  }

  function offshore(spot, distance = 5000) {
    const a = radians(spot.normal), lat = radians(spot.lat), lon = radians(spot.lon), d = distance / 6371000;
    const y = Math.asin(Math.sin(lat) * Math.cos(d) + Math.cos(lat) * Math.sin(d) * Math.cos(a));
    const x = lon + Math.atan2(Math.sin(a) * Math.sin(d) * Math.cos(lat), Math.cos(d) - Math.sin(lat) * Math.sin(y));
    return { lat: y * 180 / Math.PI, lon: x * 180 / Math.PI };
  }

  // The wind relative to the beach, as the page names it.
  function windRelative(wind, spot) {
    if (!wind || !finite(wind.speed) || wind.speed < 0 || !finite(spot.normal)) return null;
    if (wind.speed < 1.5) return "cisza / słaby";
    if (!finite(wind.direction)) return null;
    const difference = angle(wind.direction, spot.normal);
    return difference <= 22.5 ? "onshore" : difference <= 67.5 ? "cross-on" : difference <= 112.5 ? "cross"
      : difference < 157.5 ? "cross-off" : "offshore";
  }

  function windRelativeToWave(wind, direction) {
    return finite(direction) ? windRelative(wind, { normal: direction }) : null;
  }

  // Dyspersja liniowa omega² = g k tanh(k h); bisekcja unika przepełnienia Newtona.
  function dispersion(period, depth) {
    if (!finite(period) || period <= 0 || !finite(depth) || depth <= 0) return null;
    const omega = 2 * Math.PI / period;
    let lo = 0, hi = Math.max(omega * omega / 9.81, omega / Math.sqrt(9.81 * depth)) * 4;
    for (let i = 0; i < 60; i++) {
      const k = (lo + hi) / 2;
      if (9.81 * k * Math.tanh(k * depth) > omega * omega) hi = k; else lo = k;
    }
    const k = (lo + hi) / 2, c = omega / k, kh = k * depth;
    const n = 0.5 * (1 + (kh > 50 ? 0 : 2 * kh / Math.sinh(2 * kh)));
    return { c, cg: n * c, wavelength: 2 * Math.PI / k };
  }

  // Morze nieregularne: E = rho*g*Hs²/16, a strumień energii P ≈ E*Cg.
  // Średni okres zastępuje okres energetyczny / całkę widmową: moc jest przybliżeniem.
  // rho=1025 kg/m³ to stała referencyjna, nie pomiar zasolenia Bałtyku.
  function waveEnergy(wave, depth = null) {
    const missing = { energyKJm2: null, powerKWm: null, method: null };
    if (!finite(wave?.height) || wave.height < 0) return missing;
    const energyKJm2 = 1025 * 9.81 * wave.height ** 2 / 16000;
    if (wave.height === 0) return { energyKJm2: 0, powerKWm: 0, method: "calm" };
    if (!finite(wave.period) || wave.period <= 0) return { ...missing, energyKJm2 };
    if (depth !== null && (!finite(depth) || depth <= 0)) return { ...missing, energyKJm2 };
    const groupSpeed = depth === null ? 9.81 * wave.period / (4 * Math.PI) : dispersion(wave.period, depth).cg;
    return { energyKJm2, powerKWm: energyKJm2 * groupSpeed, method: depth === null ? "deep-water" : "finite-depth" };
  }

  // Linear shoaling and refraction of an offshore wave along the EMODnet samples, up to depth-limited breaking.
  function transform(wave, spot, bathymetry) {
    if (![wave.height, wave.period, wave.direction].every(finite) || wave.height < 0 || wave.period <= 0) return null;
    const incidence = angle(wave.direction, spot.normal);
    if (incidence >= 85) return { height: 0, blocked: true, basis: "Kierunek poza ekspozycją plaży", depth: null };
    const samples = bathymetry?.samples;
    // Pełna morska trasa od punktu prognozy; ląd lub brak próbek wyklucza transformację.
    if (!samples || samples.length < 4 || samples.some(p => !finite(p.depth) || p.depth <= 0) ||
        Math.max(...samples.map(p => p.distance)) !== 5000) return null;
    const points = [...samples].sort((a, b) => b.distance - a.distance);
    const initial = dispersion(wave.period, points[0].depth);
    const theta = radians(incidence);
    let result = null;
    for (let i = 1; i < points.length; i++) {
      const previous = points[i - 1], point = points[i];
      for (let step = 1; step <= 20; step++) {
        const depth = previous.depth + (point.depth - previous.depth) * step / 20;
        const local = dispersion(wave.period, depth);
        const sin = local.c / initial.c * Math.sin(theta);
        if (Math.abs(sin) >= 1) return null;
        const cos = Math.sqrt(1 - sin * sin);
        const height = wave.height * Math.sqrt(initial.cg * Math.cos(theta) / (local.cg * cos));
        const distance = previous.distance + (point.distance - previous.distance) * step / 20;
        result = { height: Math.min(height, 0.78 * depth), depth, distance, breaking: height >= 0.78 * depth,
          basis: "Profil EMODnet + shoaling i refrakcja 1D", blocked: false };
        if (result.breaking) return result;
      }
    }
    return result;
  }

  // The page shows the score together with its label.
  function scoreLabel(score, height = null) {
    if (!finite(score)) return "Brak oceny";
    return score >= 9 ? "Wyjątkowe warunki" : score >= 8 ? "Bardzo dobre warunki" : score >= 6.5 ? "Warto jechać"
      : score >= 5 ? "Warto rozważyć sesję" : score >= 3 ? "Tylko jeśli jesteś blisko" : "Odpuść wyjazd specjalnie na surfing";
  }

  function simulationAge(document, now = Date.now()) {
    const stamps = [document?.generatedAt, document?.windFetchedAt, document?.boundaryFetchedAt];
    if (!stamps.every(t => finite(t) && t <= now / 1000 + 300)) return null;
    return Math.max(0, (now / 1000 - Math.min(...stamps)) / 3600);
  }

  // The hours of a SWAN document that may be shown: the whole document must be current (at most 18 hours old at `now`,
  // unless `ignoreAge`, as when the ratings are prepared for later viewing), for this spot's geometry and with a
  // confirmed shoreline; each hour needs its point within 500 m of the shore and complete values. `records` maps the
  // time to the hour as the page uses it (cross-section and breaking point checked), `usedWind` to the wind SWAN used.
  function simulationRecords(document, spot, now = Date.now(), { ignoreAge = false } = {}) {
    const coast = document?.shoreline;
    const age = simulationAge(document, now);
    const current = ignoreAge ? [document?.generatedAt, document?.windFetchedAt, document?.boundaryFetchedAt].every(finite) : finite(age) && age <= 18;
    const valid = document?.status === "ready" && document.version === SIMULATION_VERSION && document.schema === 2 && document.maxShoreDistanceM === 500 && document.spot?.id === spot.id &&
      ["lat", "lon", "normal"].every(k => document.spot[k] === spot[k]) && finite(document.generatedAt) &&
      [coast?.landDistance, coast?.waterDistance, coast?.distance].every(finite) && coast.waterDistance > coast.landDistance &&
      coast.waterDistance - coast.landDistance <= 100 && coast.distance >= coast.landDistance && coast.distance <= coast.waterDistance &&
      current;
    const records = new Map(), usedWind = new Map((valid && Array.isArray(document.windUsed) ? document.windUsed : []).map(r => [r.time, r]));
    if (!valid || !Array.isArray(document.hourly)) return { valid: Boolean(valid), records, usedWind };
    const inZone = point => point && [point.distance, point.shoreDistance, point.shoreDistanceMin, point.shoreDistanceMax].every(finite) &&
      point.shoreDistanceMin >= 0 && point.shoreDistance >= point.shoreDistanceMin && point.shoreDistance <= point.shoreDistanceMax &&
      point.shoreDistanceMax <= 500 && Math.abs(point.shoreDistanceMin - (point.distance - coast.waterDistance)) < .1 &&
      Math.abs(point.shoreDistanceMax - (point.distance - coast.landDistance)) < .1;
    const nominalWetPoint = p => p && [p.height, p.depth, p.distance, p.shoreDistance, p.shoreDistanceMin, p.shoreDistanceMax].every(finite) &&
      p.height >= 0 && p.depth > 0 && p.shoreDistance > 0 && p.shoreDistance <= 500 &&
      Math.abs(p.distance - coast.distance - p.shoreDistance) < .1 &&
      Math.abs(p.shoreDistanceMin - (p.distance - coast.waterDistance)) < .1 &&
      Math.abs(p.shoreDistanceMax - (p.distance - coast.landDistance)) < .1;
    const fullProfile = (profile, target) => {
      if (document?.profileGridM !== 50 || document.profileReference !== "estimated-shoreline" || !Array.isArray(profile) || profile.length !== 11 || profile.some(p => !p || typeof p !== "object")) return [];
      const sorted = [...profile].sort((a, b) => a.shoreDistance - b.shoreDistance);
      const correct = sorted.every((p, i) => p && [p.height, p.depth, p.distance, p.shoreDistance, p.shoreDistanceMin, p.shoreDistanceMax].every(finite) &&
        p.shoreDistance === i * 50 && p.height >= 0 && p.depth >= 0 &&
        Math.abs(p.distance - coast.distance - p.shoreDistance) < .1 &&
        Math.abs(p.shoreDistanceMin - (p.distance - coast.waterDistance)) < .1 &&
        Math.abs(p.shoreDistanceMax - (p.distance - coast.landDistance)) < .1 &&
        (i === 0 ? p.kind === "land-boundary" && p.height === 0 && p.depth === 0 :
          (p.kind === "swan-node" && p.depth > 0) || (p.kind === "dry-model-node" && p.height === 0 && p.depth <= .05)));
      const atTarget = sorted.find(p => p.shoreDistance === target.shoreDistance);
      return correct && atTarget && Math.abs(atTarget.height - target.height) < .001 && Math.abs(atTarget.depth - target.depth) < .001 ? sorted : [];
    };
    for (const result of [...(Array.isArray(document.history) ? document.history : []), ...document.hourly]) {
      if (!result || !inZone(result) || ![result.height, result.depth, result.powerKWm, result.lat, result.lon].every(finite) || result.height < 0 || result.depth <= 0 ||
          result.powerKWm < 0 || (result.height > .001 && (!finite(result.period) || result.period <= 0 || !finite(result.direction)))) {
        records.delete(result?.time);
        continue;
      }
      records.set(result.time, { ...result, profile: fullProfile(result.profile, result), breaking: nominalWetPoint(result.breaking) ? result.breaking : null });
    }
    return { valid: true, records, usedWind };
  }

  // The published ratings of one wind document: what the rating module computed for every hour and surfer profile.
  // Lists run hour by hour from `from`; texts and sets of texts are stored once. Null for anything else. The copy in the
  // coast parts has no waves and scores by every wave model (only the spot's page shows them).
  function readRating(wind) {
    const r = wind?.rating;
    if (r?.schema !== RATING_SCHEMA || !finite(r.from) || !Array.isArray(r.texts) || !Array.isArray(r.sets) || !Array.isArray(r.phases) ||
        !Array.isArray(r.wind) || !Array.isArray(r.cleanup) || !r.profiles || typeof r.profiles !== "object") return null;
    const index = time => (time - r.from) / 3600;
    const at = (list, time) => { const i = index(time); return Number.isInteger(i) && i >= 0 && Array.isArray(list) ? list[i] ?? null : null; };
    const texts = set => Array.isArray(r.sets[set]) ? r.sets[set].map(i => r.texts[i]) : null;
    const historySource = "Poprzednie godziny modelowe, nie obserwacje";
    // A clean-up phase: its index, or [phase, onshore hours, their first and last hour (relative), clearing hours,
    // checked models, models confirming the waves].
    const phase = (code, time) => {
      if (code === null || code === undefined) return null;
      const [p, buildingHours, start, end, clearingHours, checkedModels, waveSupport] = Array.isArray(code) ? code : [code];
      const [state, label] = r.phases[p] || [];
      if (!state) return null;
      if (!Array.isArray(code)) return { state, label: r.texts[label], buildingHours: 0, clearingHours: 0, waveSupport: 0 };
      return { buildingHours, buildingStart: time + start * 3600, buildingEnd: time + end * 3600, clearingHours, waveSupport,
        checkedModels, historySource, state, label: r.texts[label] };
    };
    const withoutWaves = new Map((Array.isArray(r.cleanupWithoutWaves) ? r.cleanupWithoutWaves : []).map(([i, code]) => [r.from + i * 3600, code]));
    const disputed = new Set((Array.isArray(r.disputed) ? r.disputed : []).map(i => r.from + i * 3600));
    const profile = id => r.profiles[id] || {};
    return {
      fetchedAt: r.windFetchedAt,
      wind: time => { const value = at(r.wind, time); return Array.isArray(value) ? { speed: value[0], direction: value[1], gust: value[2], count: value[3] } : null; },
      cleanup: (time, waves = true) => phase(!waves && withoutWaves.has(time) ? withoutWaves.get(time) : at(r.cleanup, time), time),
      confidence: time => { const value = at(r.confidence, time); return Array.isArray(value) ? { before: texts(value[0]) || [], after: texts(value[1]) || [] } : null; },
      disputed: time => disputed.has(time),
      score: (id, time) => { const value = at(profile(id).score, time); return finite(value) ? value : null; },
      flags: (id, time) => { const value = at(profile(id).flags, time); return value === null ? null : texts(value); },
      window: (id, time) => { const value = at(profile(id).window, time); return finite(value) ? value : null; },
      models: (id, time) => {
        const heights = at(r.modelHeights, time), scores = at(profile(id).models, time);
        return Array.isArray(heights) && Array.isArray(scores) ? { low: heights[0], high: heights[1], minScore: scores[0], maxScore: scores[1] } : null;
      },
      modelWindow: (id, time) => {
        const info = at(r.modelWindows, time), scores = at(profile(id).modelWindow, time);
        return Array.isArray(info) && Array.isArray(scores) ? { models: info[0], low: info[1], high: info[2], minScore: scores[0], maxScore: scores[1] } : null;
      }
    };
  }

  const NO_FORECAST = "Brak potwierdzonej prognozy w strefie 0–500 m od brzegu";
  const NO_HISTORY = { state: "unknown", label: "Niepełna historia / dane", buildingHours: 0, clearingHours: 0, waveSupport: 0 };
  // The coastal forecast rows of one spot: the waves from the SWAN document, the wind of every model from the wind
  // document and, from the published ratings in it, the score, the notes and the rest for the chosen surfer profile.
  // What depends on the moment of viewing is decided here: which hours are past, whether the SWAN result is still
  // current (at most 18 hours) and the confidence notes about the forecast lead and the data age.
  // byModel: also the range of the waves and scores by every offshore wave model (row.modelRange), as the spot's page shows it.
  function buildCoastalForecast(spot, wind, simulation, now = Date.now(), { historyHours = 24, profile = "intermediate", byModel = false } = {}) {
    const level = PROFILES[profile] ? profile : "intermediate";
    const lookback = finite(historyHours) ? clamp(historyHours, 0, 48) : 0;
    const wh = wind?.data?.hourly, rating = readRating(wind);
    const times = [...new Set([...(wh?.time || []), ...(Array.isArray(simulation?.history) ? simulation.history : []).map(r => r.time),
      ...(Array.isArray(simulation?.hourly) ? simulation.hourly : []).map(r => r.time)])].filter(finite).sort((a, b) => a - b);
    const windIndex = new Map((wh?.time || []).map((t, i) => [t, i]));
    const value = (variable, model, i) => {
      const v = wh?.[`${variable}_${model}`]?.[i];
      return finite(v) ? v : null;
    };
    const { valid, records, usedWind } = simulationRecords(simulation, spot, now);
    const generated = Math.min(simulation?.generatedAt, simulation?.windFetchedAt, simulation?.boundaryFetchedAt);
    const from = Math.floor(now / 3600000) * 3600 - lookback * 3600;
    return times.filter(time => time >= from).slice(0, FORECAST_HOURS + 1 + lookback).map(time => {
      const wi = windIndex.get(time);
      const members = Object.keys(WIND_MODELS).map(model => ({ model, speed: value("wind_speed_10m", model, wi),
        direction: value("wind_direction_10m", model, wi), gust: value("wind_gusts_10m", model, wi) }))
        .filter(m => finite(m.speed) && m.speed >= 0 && finite(m.direction));
      // The models' common wind as published; their own winds only where the file has them (not in the coast parts).
      const consensus = rating?.wind(time);
      const row = { time, wind: consensus ? { ...consensus, members } : null,
        daylight: Object.keys(WIND_MODELS).map(m => value("is_day", m, wi)).find(finite) === 1 };
      const local = records.get(time);
      const waves = local ? { scoreSource: "swan", height: local.height, nearHeight: local.height, period: local.period, direction: local.direction,
        powerKWm: local.powerKWm, energyKJm2: waveEnergy({ height: local.height }).energyKJm2, simulation: local, simulationWind: usedWind.get(time) || null }
        : { scoreSource: "unavailable", height: null, nearHeight: null, period: null, direction: null, powerKWm: null, energyKJm2: null, simulation: null };
      // The notes on the forecast lead and the data age depend on when the page is looked at.
      const lead = time * 1000 - now, models = row.wind?.count || 0, timed = [];
      if (lead > 7 * 86400000) timed.push(`Prognoza ponad 7 dni naprzód — orientacyjna; wiatr z ${models === 1 ? "1 modelu" : `${models} modeli`}, fale z jednego`);
      else if (lead > 72 * 3600000) timed.push("Prognoza ponad 72 godziny naprzód");
      if (now / 1000 - generated > 12 * 3600) timed.push("Dane starsze niż 12 godzin");
      // Without current waves no score is shown, and neither is its confidence.
      const parts = valid ? rating?.confidence(time) : null;
      const reasons = parts ? [...parts.before, ...timed, ...parts.after] : [...timed, "Brak prognozy przybrzeżnej"];
      const confidence = { level: reasons.length ? "niska" : "średnia", reasons: reasons.length ? reasons : ["Zgodny wiatr; pojedyncza symulacja fal i przybliżone dno"] };
      // An hour with waves but nothing published for it (no usable wind) keeps only what needs no rating.
      const published = local ? rating?.flags(level, time) : null, flat = Boolean(local) && local.height <= .001;
      const score = published ? rating.score(level, time) : flat ? 0 : null;
      const flags = published || (local ? [...(flat ? ["SWAN: praktycznie brak fali przy brzegu"] : []),
        ...(waves.simulationWind?.fallback ? ["Wiatr w symulacji: model zastępczy przy dużej rozbieżności"] : [])] : [NO_FORECAST]);
      const modelRange = byModel && published ? rating.models(level, time) : null;
      return { ...row, members: [{ model: "bs-swan-coast500", height: waves.height, period: waves.period, direction: waves.direction }], ...waves,
        // Without current waves the published phase is the one computed without them; without wind nothing is known.
        cleanup: row.wind ? rating?.cleanup(time, valid) ?? null : { ...NO_HISTORY }, confidence,
        disputedWind: Boolean(published && rating.disputed(time)), ...(modelRange ? { modelRange } : {}), score, flags,
        windowScore: published ? rating.window(level, time) : null, modelWindow: published ? rating.modelWindow(level, time) : null };
    });
  }

  // The best three-hour daylight windows that do not overlap, from the windows' published scores (row.windowScore:
  // the window that starts at that hour). Everything shown with a window comes from its three hours.
  function bestWindows(rows, count = 3, { cleanupOnly = false } = {}) {
    const candidates = [];
    for (let i = 0; i + 2 < rows.length; i++) {
      const window = rows.slice(i, i + 3);
      const cleanupHours = window.filter(r => r.cleanup?.state === "clean").length;
      if (window.every((r, n) => r.daylight && finite(r.score) && r.time === window[0].time + n * 3600) && finite(window[0].windowScore) &&
          (!cleanupOnly || cleanupHours === 3)) {
        const heights = window.map(r => r.height).filter(finite);
        const minHeight = heights.length ? Math.min(...heights) : null;
        const maxHeight = heights.length ? Math.max(...heights) : null;
        candidates.push({ start: window[0].time, end: window[2].time + 3600, score: window[0].windowScore,
          confidence: window.some(r => r.confidence?.level === "niska") ? "niska" : "średnia",
          flags: [...new Set(window.flatMap(r => r.flags || []))], height: median(heights), minHeight, maxHeight, cleanupHours,
          nearHeight: median(window.map(r => r.simulation?.height)), simulationHours: window.filter(r => r.simulation).length });
      }
    }
    const selected = [];
    for (const w of candidates.sort((a, b) => b.score - a.score || b.cleanupHours - a.cleanupHours || a.start - b.start)) {
      if (selected.every(s => w.end <= s.start || w.start >= s.end)) selected.push(w);
      if (selected.length === count) break;
    }
    return selected;
  }

  // The three-hour window by every offshore wave model, as published for the window that starts at the first row:
  // how many models, the range of their waves and of their window scores.
  function modelWindow(rows) {
    return rows?.[0]?.modelWindow ?? null;
  }

  const api = { VERSION, SIMULATION_VERSION, RATING_SCHEMA, FORECAST_HOURS, coastalHistoryKey, PROFILES, profileOf, WAVE_MODELS, WIND_MODELS,
    STEEP_BEACH, finite, angle, median, windMatchesSpot, offshore, windRelative, windRelativeToWave, dispersion, waveEnergy, transform,
    scoreLabel, simulationAge, simulationRecords, readRating, buildCoastalForecast, bestWindows, modelWindow };
  if (typeof module !== "undefined") module.exports = api; else root.SurfModel = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
