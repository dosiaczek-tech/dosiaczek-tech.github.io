(function (root) {
  "use strict";
  const dayKey = t => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(t * 1000));
  function parse(hash) {
    const [spotId, query = ""] = hash.slice(6).split("?");
    const params = new URLSearchParams(query), value = params.get("day");
    const validDay = /^\d{4}-\d{2}-\d{2}$/.test(value || "") && Number.isFinite(Date.parse(`${value}T12:00:00Z`)) && dayKey(Date.parse(`${value}T12:00:00Z`) / 1000) === value;
    const start = Number(params.get("start"));
    return { spotId, day: validDay ? value : null,
      start: validDay && params.has("start") && Number.isSafeInteger(start) && start > 0 && start < 8640000000000 && dayKey(start) === value ? start : null };
  }
  function resolve(rows, request, model, now = Date.now()) {
    if (!request?.day) return null;
    const dayRows = rows.filter(r => dayKey(r.time) === request.day && r.simulation).sort((a, b) => a.time - b.time);
    // An explicitly linked session must never silently become a different session.
    const candidates = request.start !== null ? dayRows.filter(r => r.time >= request.start && r.time < request.start + 10800) : dayRows.filter(r => r.time * 1000 >= now);
    const window = model.bestWindows(candidates, 1)[0];
    if (!window || (request.start !== null && window.start !== request.start)) return null;
    return { ...window, historical: window.start * 1000 < now, rows: dayRows.filter(r => r.time >= window.start && r.time < window.end) };
  }
  const api = { parse, resolve };
  if (typeof module !== "undefined") module.exports = api; else root.SurfSession = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
