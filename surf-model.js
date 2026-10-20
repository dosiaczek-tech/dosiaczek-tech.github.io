/* Bałtyk Surf v0.2: ocena plaży, historia onshore → offshore i transformacja fal.
 * Metoda, jednostki i ograniczenia: SURFING.md. Bez wytrenowanych współczynników.
 */
(function (root) {
  "use strict";
  const VERSION = "Bałtyk Surf 1.1 / strefa 0–500 m";
  const WAVE_MODELS = { dwd_ewam: "DWD EWAM", ecmwf_wam: "ECMWF WAM" };
  const WIND_MODELS = { icon_seamless: "DWD ICON", gfs_seamless: "NOAA GFS", ecmwf_ifs025: "ECMWF IFS" };
  const finite = value => typeof value === "number" && Number.isFinite(value);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const radians = value => value * Math.PI / 180;
  const angle = (a, b) => Math.abs(((a - b + 540) % 360) - 180);
  const median = values => {
    const sorted = values.filter(finite).sort((a, b) => a - b);
    const n = sorted.length;
    return n ? (sorted[Math.floor((n - 1) / 2)] + sorted[Math.floor(n / 2)]) / 2 : null;
  };

  function offshore(spot, distance = 5000) {
    const a = radians(spot.normal), lat = radians(spot.lat), lon = radians(spot.lon), d = distance / 6371000;
    const y = Math.asin(Math.sin(lat) * Math.cos(d) + Math.cos(lat) * Math.sin(d) * Math.cos(a));
    const x = lon + Math.atan2(Math.sin(a) * Math.sin(d) * Math.cos(lat), Math.cos(d) - Math.sin(lat) * Math.sin(y));
    return { lat: y * 180 / Math.PI, lon: x * 180 / Math.PI };
  }

  // Kierunki meteorologiczne: skąd wieje. Uśredniamy wektory, nie stopnie.
  function windConsensus(members) {
    const valid = members.filter(m => finite(m.speed) && m.speed >= 0 && finite(m.direction));
    if (!valid.length) return null;
    const x = valid.reduce((s, m) => s + m.speed * Math.sin(radians(m.direction)), 0) / valid.length;
    const y = valid.reduce((s, m) => s + m.speed * Math.cos(radians(m.direction)), 0) / valid.length;
    const speed = median(valid.map(m => m.speed));
    const resultant = Math.hypot(x, y);
    const agreement = speed < 0.5 ? 1 : clamp(resultant / (valid.reduce((s, m) => s + m.speed, 0) / valid.length), 0, 1);
    return { speed, direction: agreement < 0.3 ? null : (Math.atan2(x, y) * 180 / Math.PI + 360) % 360,
      gust: median(valid.map(m => m.gust)), count: valid.length, agreement,
      spread: Math.max(...valid.map(m => m.speed)) - Math.min(...valid.map(m => m.speed)), members: valid };
  }

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

  // Diagnostyka poprzednich 24 h; żadnego odczytu przyszłości ani tworzenia fali z wiatru.
  // To lokalny proxy fazy nawiania, nie obliczenie fetchu i propagacji przez cały Bałtyk.
  function detectCleanup(series, index, spot) {
    const row = series[index];
    const validWind = r => r?.wind && finite(r.wind.speed) && r.wind.speed >= 0 &&
      (r.wind.speed < 0.5 || finite(r.wind.direction));
    const isBuilding = r => validWind(r) && finite(r.wind.direction) && r.wind.speed >= 5 &&
      angle(r.wind.direction, spot.normal) <= 60 && r.wind.speed * Math.cos(radians(angle(r.wind.direction, spot.normal))) >= 4;
    const isClearing = r => validWind(r) && r.wind.speed <= 7 && (!finite(r.wind.gust) || r.wind.gust < 12) &&
      (r.wind.speed < 1.5 || angle(r.wind.direction, spot.normal) >= 135);
    const unknown = { state: "unknown", label: "Niepełna historia / dane", buildingHours: 0, clearingHours: 0, waveSupport: 0 };
    if (!row || !validWind(row)) return unknown;
    const start = Math.max(0, index - 24);
    let runStart = null, runEnd = null, runLength = 0, length = 0;
    for (let j = start; j < index; j++) {
      if (isBuilding(series[j]) && row.time - series[j].time <= 24 * 3600) {
        length = j > start && series[j].time === series[j - 1].time + 3600 ? length + 1 : 1;
        if (length >= 4) { runStart = j - length + 1; runEnd = j; runLength = length; }
      } else length = 0;
    }
    const fullHistory = index - start === 24 && series.slice(start, index + 1).every((r, n) =>
      validWind(r) && r.time === row.time - (index - start - n) * 3600);
    if (runEnd === null) return fullHistory
      ? { ...unknown, state: "none", label: "Brak lokalnej sekwencji nawiania" } : unknown;
    // Przerwa w danych po nawianiu nie jest ciszą ani potwierdzeniem zmiany wiatru.
    if (!series.slice(runStart, index + 1).every((r, n) => validWind(r) && r.time === series[runStart].time + n * 3600)) return unknown;
    const info = { buildingHours: runLength, buildingStart: series[runStart].time, buildingEnd: series[runEnd].time,
      clearingHours: 0, waveSupport: 0, checkedModels: 0, historySource: "Poprzednie godziny modelowe, nie obserwacje" };
    const relative = windRelative(row.wind, spot);
    if (["offshore", "cross-off"].includes(relative) && !isClearing(row)) return { ...info, state: "strong-offshore", label: "Offshore zbyt silny dla okna wywiewki" };
    if (!isClearing(row)) return { ...info, state: isBuilding(row) ? "building" : "changing",
      label: isBuilding(row) ? "Onshore nadal wzburza powierzchnię" : "Po nawianiu — brak słabego offshore / ciszy" };
    for (let j = index; j > runEnd && isClearing(series[j]); j--) info.clearingHours++;
    for (const member of row.members) {
      if (![member.height, member.period, member.direction].every(finite) || member.height < 0 || member.period <= 0) continue;
      const past = series.slice(runStart, runEnd + 1).map(r => r.members.find(m => m.model === member.model))
        .filter(m => m && finite(m.height) && finite(m.direction) && angle(m.direction, spot.normal) < 85);
      if (past.length < 3) continue;
      const peak = Math.max(...past.map(m => m.height));
      info.checkedModels++;
      if (peak >= 0.6 && member.height >= Math.max(0.4, 0.35 * peak) && member.period >= 4 && angle(member.direction, spot.normal) < 85) info.waveSupport++;
    }
    if (!info.checkedModels) return { ...info, state: "unknown", label: "Zmiana wiatru — brak potwierdzenia w falach" };
    if (!info.waveSupport) return { ...info, state: "faded", label: "Wywiewka, ale fala za mała, krótka lub spoza sektora" };
    if (info.waveSupport < row.members.length) return { ...info, state: "uncertain", label: "Modele nie potwierdzają zgodnie utrzymania fali" };
    if (row.wind.speed >= 12 || (finite(row.wind.gust) && row.wind.gust >= 17) || row.members.some(m => m.height >= 3))
      return { ...info, state: "rough", label: "Fala pozostaje wysoka — trudne warunki" };
    if (info.clearingHours < 2) return { ...info, state: "turning", label: "Świeża zmiana — chop może się utrzymywać" };
    return { ...info, state: "clean", label: ["offshore", "cross-off"].includes(relative) ? "Okno wywiewki po nawianiu" : "Ucichanie po nawianiu" };
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

  function rate(wave, wind, spot, bathymetry, localOverride = null) {
    if (!wind || ![wave.height, wave.period, wave.direction].every(finite) || wave.height < 0 || wave.period <= 0 ||
        (!finite(wind.direction) && wind.speed >= 0.5)) return null;
    const incidence = angle(wave.direction, spot.normal);
    const local = localOverride || transform(wave, spot, bathymetry);
    const height = local ? local.height : wave.height;
    const exposure = incidence >= 85 ? 0 : Math.sqrt(Math.max(0, Math.cos(radians(incidence))));
    const heightQuality = height < 0.4 ? height / 0.4 : height <= 1.6 ? 1 : clamp(1 - (height - 1.6) / 1.9, 0, 1);
    const periodQuality = clamp((wave.period - 2) / 5, 0, 1);
    const type = windRelative(wind, spot);
    const windQuality = wind.speed < 1.5 ? 1 : type === "offshore" ? clamp(1 - Math.max(0, wind.speed - 4) / 9, 0, 1)
      : type === "cross-off" ? clamp(1 - Math.max(0, wind.speed - 3) / 10, 0, 1)
      : type === "onshore" ? clamp(1 - wind.speed / 10, 0, 1) : type === "cross-on" ? clamp(1 - wind.speed / 11.5, 0, 1) : clamp(1 - wind.speed / 13, 0, 1);
    let score = 100 * exposure * heightQuality * (0.55 * periodQuality + 0.45 * windQuality);
    const strong = wind.speed >= 12 || (finite(wind.gust) && wind.gust >= 17) || wave.height >= 3;
    if (strong) score = Math.min(score, 25);
    const flags = [];
    if (strong) flags.push("Silny wiatr lub wysokie fale — trudne warunki");
    if (incidence >= 85) flags.push("Fala spoza sektora ekspozycji");
    if (wave.period < 4) flags.push("Krótka, wiatrowa fala");
    if (!local) flags.push("Ocena z wysokości fal na morzu — brak danych do szacunku przy brzegu");
    return { score: Math.round(score), height, local, windType: type, flags };
  }

  function buildForecast(spot, marine, weather, bathymetry, now = Date.now()) {
    const wh = weather?.hourly, mh = marine?.hourly;
    if (!Array.isArray(mh?.time)) return [];
    const windIndex = new Map((wh?.time || []).map((t, i) => [t, i]));
    const sampleDepth = bathymetry?.samples?.find(p => p.distance === 5000)?.depth;
    const powerDepth = finite(sampleDepth) && sampleDepth > 0 ? sampleDepth : null;
    const value = (data, variable, model, i) => {
      const v = data?.[`${variable}_${model}`]?.[i];
      return finite(v) ? v : null;
    };
    const series = mh.time.map((time, i) => {
      const wi = windIndex.get(time);
      const wind = windConsensus(Object.keys(WIND_MODELS).map(model => ({ model,
        speed: value(wh, "wind_speed_10m", model, wi), direction: value(wh, "wind_direction_10m", model, wi),
        gust: value(wh, "wind_gusts_10m", model, wi) })));
      const members = Object.keys(WAVE_MODELS).map(model => {
        const wave = { model, height: value(mh, "wave_height", model, i), period: value(mh, "wave_period", model, i), direction: value(mh, "wave_direction", model, i) };
        return { ...wave, rating: rate(wave, wind, spot, bathymetry), energetics: waveEnergy(wave, powerDepth) };
      });
      const scores = members.map(m => m.rating?.score).filter(finite);
      const heights = members.map(m => m.height).filter(finite);
      const spread = heights.length > 1 ? Math.max(...heights) - Math.min(...heights) : null;
      const age = (time * 1000 - now) / 3600000;
      const agreement = scores.length < 2 || !wind || wind.count < 2 ? "Ograniczona liczba modeli"
        : age > 72 || spread > 0.6 || wind.spread > 4 || wind.agreement < 0.7 || Math.max(...scores) - Math.min(...scores) > 25
          ? "Duża niepewność" : "Modele zbliżone";
      const daylight = Object.keys(WIND_MODELS).map(m => value(wh, "is_day", m, wi)).find(finite);
      return { time, members, wind, score: median(scores), height: median(heights),
        period: median(members.map(m => m.period)), nearHeight: median(members.map(m => m.rating?.local?.height)),
        energyKJm2: median(members.map(m => m.energetics.energyKJm2)),
        powerKWm: median(members.map(m => m.energetics.powerKWm)), powerDepth,
        energyModels: members.filter(m => finite(m.energetics.energyKJm2)).length,
        powerModels: members.filter(m => finite(m.energetics.powerKWm)).length,
        spread, agreement, daylight: daylight === 1, temperature: median(Object.keys(WIND_MODELS).map(m => value(wh, "temperature_2m", m, wi))),
        flags: [...new Set(members.flatMap(m => m.rating?.flags || []))] };
    });
    return series.map((row, index) => ({ ...row, cleanup: detectCleanup(series, index, spot) }))
      .filter(row => row.time * 1000 >= Math.floor(now / 3600000) * 3600000);
  }

  function bestWindows(rows, count = 3, { cleanupOnly = false } = {}) {
    const candidates = [];
    for (let i = 0; i + 2 < rows.length; i++) {
      const window = rows.slice(i, i + 3);
      const cleanupHours = window.filter(r => r.cleanup?.state === "clean").length;
      if (window.every((r, n) => r.daylight && finite(r.score) && r.time === window[0].time + n * 3600) && (!cleanupOnly || cleanupHours === 3)) {
        candidates.push({ start: window[0].time, end: window[2].time + 3600,
          score: Math.round(window.reduce((s, r) => s + r.score, 0) / 3), height: median(window.map(r => r.height)), cleanupHours,
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
  function applySimulation(rows, document, spot, now = Date.now()) {
    const coast = document?.shoreline;
    const valid = document?.status === "ready" && document.schema === 2 && document.maxShoreDistanceM === 500 && document.spot?.id === spot.id &&
      ["lat", "lon", "normal"].every(k => document.spot[k] === spot[k]) && finite(document.generatedAt) &&
      [coast?.landDistance, coast?.waterDistance, coast?.distance].every(finite) && coast.waterDistance > coast.landDistance &&
      coast.waterDistance - coast.landDistance <= 100 && coast.distance >= coast.landDistance && coast.distance <= coast.waterDistance &&
      now / 1000 >= document.generatedAt - 300 && now / 1000 - document.generatedAt <= 18 * 3600;
    const byTime = new Map((valid && Array.isArray(document.hourly) ? [...(Array.isArray(document.history) ? document.history : []), ...document.hourly] : []).map(r => [r.time, r]));
    const usedWind = new Map((valid && Array.isArray(document.windUsed) ? document.windUsed : []).map(r => [r.time, r]));
    const inZone = point => point && [point.distance, point.shoreDistance, point.shoreDistanceMin, point.shoreDistanceMax].every(finite) &&
      point.shoreDistanceMin >= 0 && point.shoreDistance >= point.shoreDistanceMin && point.shoreDistance <= point.shoreDistanceMax &&
      point.shoreDistanceMax <= 500 && Math.abs(point.shoreDistanceMin - (point.distance - coast.waterDistance)) < .1 &&
      Math.abs(point.shoreDistanceMax - (point.distance - coast.landDistance)) < .1;
    return rows.map(row => {
      const result = byTime.get(row.time);
      if (!result || !inZone(result) || ![result.height, result.depth, result.powerKWm, result.lat, result.lon].every(finite) || result.height < 0 || result.depth <= 0 ||
          result.powerKWm < 0 || (result.height > .001 && (!finite(result.period) || result.period <= 0 || !finite(result.direction))))
        return { ...row, simulation: null, scoreSource: "unavailable", score: null, height: null, period: null, direction: null,
          powerKWm: null, energyKJm2: null, nearHeight: null, flags: ["Brak potwierdzonej prognozy w strefie 0–500 m od brzegu"] };
      const local = { ...result, profile: (result.profile || []).filter(inZone), breaking: inZone(result.breaking) ? result.breaking : null };
      const rating = result.height <= .001 ? { score: 0, flags: ["SWAN: praktycznie brak fali przy brzegu"] } :
        rate({ height: result.height, period: result.period, direction: result.direction }, row.wind, spot, null,
          { ...result, basis: "SWAN", blocked: false });
      return { ...row, score: rating?.score ?? null, scoreSource: "swan", height: result.height, nearHeight: result.height,
        period: result.period, direction: result.direction, powerKWm: result.powerKWm,
        energyKJm2: waveEnergy({ height: result.height }).energyKJm2,
        simulation: local, simulationWind: usedWind.get(row.time) || null,
        flags: [...(rating?.flags || []), ...(usedWind.get(row.time)?.fallback ? ["Wiatr w symulacji: model zastępczy przy dużej rozbieżności"] : [])] };
    });
  }
  function buildCoastalForecast(spot, weather, simulation, now = Date.now()) {
    const times = [...new Set([...(weather?.hourly?.time || []), ...(Array.isArray(simulation?.history) ? simulation.history : []).map(r => r.time),
      ...(Array.isArray(simulation?.hourly) ? simulation.hourly : []).map(r => r.time)])].filter(finite).sort((a, b) => a - b);
    const base = buildForecast(spot, { hourly: { time: times } }, weather, null, now - 48 * 3600000);
    const series = applySimulation(base, simulation, spot, now).map(row => ({ ...row,
      members: [{ model: "bs-swan-coast500", height: row.height, period: row.period, direction: row.direction }] }));
    return series.map((row, index) => ({ ...row, cleanup: detectCleanup(series, index, spot) }))
      .filter(row => row.time * 1000 >= Math.floor(now / 3600000) * 3600000).slice(0, 120);
  }
  const api = { VERSION, WAVE_MODELS, WIND_MODELS, finite, angle, median, offshore, windConsensus, windRelative, windRelativeToWave, detectCleanup, dispersion, waveEnergy, transform, rate, buildForecast, bestWindows, applySimulation, buildCoastalForecast };
  if (typeof module !== "undefined") module.exports = api; else root.SurfModel = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
