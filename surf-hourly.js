/* One chronological forecast strip across Warsaw dates, including DST transitions. */
(function (root) {
  "use strict";
  const W = typeof module !== "undefined" ? require("./surf-weather.js") : root.SurfWeather;
  const hourFormat = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Warsaw", hour: "2-digit", hourCycle: "h23" });
  const localHour = time => Number(hourFormat.format(new Date(time * 1000)));
  const DAY_PARTS = [
    { key: "morning", label: "Rano", from: 6, until: 12 },
    { key: "afternoon", label: "Po południu", from: 12, until: 18 },
    { key: "evening", label: "Wieczór", from: 18, until: 24 }
  ];
  function dayPart(time) {
    if (!Number.isFinite(time)) return null;
    const hour = localHour(time);
    return DAY_PARTS.find(part => hour >= part.from && hour < part.until)?.key || null;
  }
  function dayPartTargets(periods, day) {
    const candidates = periods.filter(period => period?.day === day && Number.isFinite(period.row?.time))
      .map(period => ({ time: period.row.time, hour: localHour(period.row.time) }));
    return DAY_PARTS.map(part => {
      const times = candidates.filter(row => row.hour >= part.from && row.hour < part.until).map(row => row.time);
      return { ...part, time: times.length ? Math.min(...times) : null };
    });
  }
  function combine(rows, conditions, { windWeather = null, now = Date.now(), historyHours = 24 } = {}) {
    const lookback = Number.isFinite(historyHours) ? Math.max(0, Math.min(24, historyHours)) : 0;
    const from = Math.floor(now / 3600000) * 3600 - lookback * 3600;
    // Waves define the table's hours and horizon; extra weather never adds its own columns.
    const byTime = new Map(rows.filter(row => Number.isFinite(row?.time) &&
      Number.isFinite(row.simulation?.height) && row.simulation.height >= 0).map(row => [row.time, row]));
    const times = [...byTime.keys()].filter(time => time >= from).sort((a, b) => a - b);
    const windHours = windWeather?.hourly;
    const windIndex = new Map((windHours?.time || []).map((time, i) => [time, i]));
    const dayFields = Object.keys(windHours || {}).filter(key => /^is_day(?:_|$)/.test(key));
    return times.map(time => {
      const weather = W.atTime(conditions, time);
      const flag = dayFields.map(key => windHours[key]?.[windIndex.get(time)]).find(value => value === 0 || value === 1);
      const daylight = weather.daylight ?? (flag === 0 ? false : flag === 1 ? true : null);
      // Presentation only: preserve the original wave/score rows used by the ranking and session model.
      return { ...byTime.get(time), weather, daylight };
    });
  }
  function periods(rows, { session = null, selectedTime = null } = {}) {
    const ordered = rows.filter(row => Number.isFinite(row?.time)).slice().sort((a, b) => a.time - b.time);
    return ordered.map(row => {
      const end = row.time + 3600;
      return { row, day: W.dayKey(row.time), ...W.interval(row.time, end),
        inSession: Boolean(session && row.time >= session.start && row.time < session.end),
        selected: Number.isFinite(selectedTime) && row.time <= selectedTime && selectedTime < end };
    });
  }
  function compactTable(periods, fields) {
    const present = value => value !== null && value !== undefined && value !== "";
    const indices = periods.map((_, i) => i).filter(i => fields.some(field => present(field.values[i])));
    return { periods: indices.map(i => periods[i]),
      fields: fields.map(field => ({ ...field, values: indices.map(i => field.values[i]) }))
        .filter(field => field.values.some(present)) };
  }
  function pointSummary(rows) {
    const points = rows.map(row => row?.simulation).filter(point =>
      Number.isFinite(point?.shoreDistance) && point.shoreDistance > 0 && point.shoreDistance <= 500 &&
      Number.isFinite(point.depth) && point.depth > 0);
    if (!points.length) return null;
    const extent = key => ({ min: Math.min(...points.map(point => point[key])), max: Math.max(...points.map(point => point[key])) });
    return { shoreDistance: extent("shoreDistance"), depth: extent("depth") };
  }
  const api = { periods, combine, compactTable, pointSummary, DAY_PARTS, dayPart, dayPartTargets };
  if (typeof module !== "undefined") module.exports = api; else root.SurfHourly = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
