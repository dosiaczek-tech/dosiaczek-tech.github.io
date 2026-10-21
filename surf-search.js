/* Local spot search: Polish folding, word matches and adjacent-letter typos. */
(function (root) {
  "use strict";
  function normalize(value) {
    return String(value || "").replace(/([a-ząćęłńóśźż])([A-ZĄĆĘŁŃÓŚŹŻ])/g, "$1 $2")
      .toLocaleLowerCase("pl").normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/ł/g, "l")
      .replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
  }
  function distance(a, b) {
    let previous = Array.from({ length: b.length + 1 }, (_, i) => i), before = null;
    for (let i = 1; i <= a.length; i++) {
      const row = [i];
      for (let j = 1; j <= b.length; j++) {
        row[j] = Math.min(row[j - 1] + 1, previous[j] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (before && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) row[j] = Math.min(row[j], before[j - 2] + 1);
      }
      before = previous; previous = row;
    }
    return previous[b.length];
  }
  function groupWestToEast(spots) {
    const groups = new Map();
    for (const spot of spots) {
      const key = normalize(spot.town);
      if (!groups.has(key)) groups.set(key, { town: spot.town, longitude: spot.lon, spots: [] });
      const group = groups.get(key);
      group.longitude = Math.min(group.longitude, spot.lon);
      group.spots.push(spot);
    }
    return [...groups.values()].map(group => ({ ...group, spots: group.spots.sort((a, b) => a.lon - b.lon || b.lat - a.lat || a.name.localeCompare(b.name, "pl")) }))
      .sort((a, b) => a.longitude - b.longitude || a.town.localeCompare(b.town, "pl"));
  }
  function search(spots, value, limit = 6) {
    const query = normalize(value).slice(0, 80);
    if (query.length < 2) return [];
    const filler = new Set(["w", "we", "na", "nad", "przy", "do", "spot"]);
    const tokens = [...new Set(query.split(" ").filter(t => !filler.has(t)))].slice(0, 8);
    if (!tokens.length) return [];
    const generic = new Set(["plaza", "molo", "port", "morze", "baltyk"]);
    const compact = query.replace(/ /g, "");
    return spots.map(spot => {
      const aliases = spot.id === "wladyslawowo" ? ["Władek"] : [];
      const fields = [spot.town, spot.name, spot.id, `${spot.town} ${spot.name}`, spot.community?.originalName, ...(spot.aliases || []), ...aliases].filter(Boolean).map(normalize);
      const words = [...new Set(fields.flatMap(f => f.split(" ")))];
      const costs = tokens.map(token => Math.min(...words.map(word => {
        if (word === token) return 0;
        if (word.startsWith(token)) return .1 + .05 * (word.length - token.length) / word.length;
        if (token.length >= 3 && word.includes(token)) return .22;
        return .12 + distance(token, word) / Math.max(token.length, word.length);
      })));
      const worst = Math.max(...costs);
      let score = costs.reduce((a, b) => a + b, 0) / costs.length + .15 * worst;
      const exact = fields.includes(query) || fields.some(f => f.replace(/ /g, "") === compact);
      const prefix = fields.some(f => f.startsWith(query));
      const compactMatch = compact.length >= 3 && fields.some(f => f.replace(/ /g, "").includes(compact));
      if (exact) score = 0;
      else if (prefix) score = Math.min(score, .12);
      else if (compactMatch) score = Math.min(score, .18);
      else score = Math.min(score, ...fields.map(f => .12 + distance(compact, f.replace(/ /g, "")) / Math.max(compact.length, f.replace(/ /g, "").length)));
      const strong = !generic.has(query) && (exact || prefix || compactMatch || (query.length >= 3 && worst <= .45 && score <= .45));
      const general = normalize(spot.id) === normalize(spot.town) ? 0 : spot.community ? 2 : 1;
      return { spot, score, strong, general };
    }).sort((a, b) => a.score - b.score || a.general - b.general || a.spot.lon - b.spot.lon || a.spot.name.localeCompare(b.spot.name, "pl"))
      .slice(0, limit);
  }
  const api = { normalize, distance, groupWestToEast, search };
  if (typeof module !== "undefined") module.exports = api; else root.SurfSearch = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
