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

module.exports = { slimNearshore, coastBundle };
