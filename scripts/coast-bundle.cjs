// The file for "Pokaż najlepsze" and the heat map: every spot's wind and waves in one document, without the
// 0–500 m cross-sections, which only the spot's own page draws. model/build_site.py builds the published copy.
function slimNearshore(document) {
  const slim = { ...document };
  for (const key of ["hourly", "history"]) {
    if (Array.isArray(slim[key])) slim[key] = slim[key].map(row => {
      if (!row || typeof row !== "object") return row;
      const { profile, ...rest } = row;
      return rest;
    });
  }
  return slim;
}

// entries: [spot id, { wind, nearshore }] with the documents as served for that spot.
function coastBundle(entries) {
  const spots = {};
  for (const [id, { wind, nearshore }] of entries) {
    const entry = {};
    if (wind) entry.wind = wind;
    if (nearshore) entry.nearshore = slimNearshore(nearshore);
    if (wind || nearshore) spots[id] = entry;
  }
  return { schema: 1, spots };
}

// The coast in a few parts, west to east, which the app fetches one after another: it computes the spots of one part
// while the next part downloads. Every part says how many there are; model/build_site.py splits the published copy alike.
const COAST_PARTS = 4;
function coastParts(entries, count = COAST_PARTS) {
  const longitude = entry => [entry.nearshore?.spot?.lon, entry.wind?.spot?.lon].find(Number.isFinite) ?? Infinity;
  const ordered = Object.entries(coastBundle(entries).spots)
    .sort((a, b) => longitude(a[1]) - longitude(b[1]) || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const parts = Math.max(1, Math.min(count, ordered.length));
  return Array.from({ length: parts }, (_, i) => ({ schema: 1, part: i + 1, parts,
    spots: Object.fromEntries(ordered.slice(Math.floor(i * ordered.length / parts), Math.floor((i + 1) * ordered.length / parts))) }));
}

module.exports = { slimNearshore, coastBundle, coastParts, COAST_PARTS };
