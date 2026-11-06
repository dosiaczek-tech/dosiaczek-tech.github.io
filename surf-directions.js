/* Beach-facing miniatures: sea at the top, land below. Source bearings become travel arrows. */
(function (root) {
  "use strict";
  const M = typeof module !== "undefined" ? require("./surf-model.js") : root.SurfModel;
  const normalize = degrees => ((degrees % 360) + 360) % 360;
  const labels = { onshore: "Do brzegu", "cross-on": "Ukośnie do brzegu", cross: "Wzdłuż brzegu",
    "cross-off": "Ukośnie od brzegu", offshore: "Od brzegu" };
  function relative(direction, normal) {
    if (!M.finite(direction) || !M.finite(normal)) return null;
    const from = normalize(direction), coast = normalize(normal), to = normalize(from + 180);
    const rotation = normalize(to - coast), radians = rotation * Math.PI / 180;
    // Screen x is right while facing the sea; screen y increases toward the land.
    const dx = Math.sin(radians), dy = -Math.cos(radians);
    const relation = M.windRelative({ speed: 2, direction: from }, { normal: coast });
    const side = Math.abs(dx) < 1e-8 ? "" : dx > 0 ? "w prawo" : "w lewo";
    return { from, to, normal: coast, rotation, dx, dy, relation, label: labels[relation],
      description: `${labels[relation]}${side ? `, ${side}` : ""} (patrząc z plaży na morze)` };
  }
  function wind(value, spot) {
    if (!M.finite(value?.speed) || value.speed < 0) return null;
    if (value.speed < .5) return { kind: "wind", state: "calm", rotation: null, label: "Cisza", description: "Cisza — brak wyraźnego kierunku wiatru" };
    const motion = relative(value.direction, spot?.normal);
    return motion ? { ...motion, kind: "wind", state: "moving", weak: value.speed < 1.5,
      description: `Wiatr${value.speed < 1.5 ? " słaby" : ""}: ${motion.description.toLowerCase()}` } : null;
  }
  function wave(value, spot) {
    if (!M.finite(value?.height) || value.height < 0) return null;
    if (value.height <= .001) return { kind: "wave", state: "calm", rotation: null, label: "Brak fal", description: "Praktycznie brak fal — bez strzałki kierunku" };
    const motion = relative(value.direction, spot?.normal);
    return motion ? { ...motion, kind: "wave", state: "moving", description: `Fale: ${motion.description.toLowerCase()}` } : null;
  }
  const api = { relative, wind, wave };
  if (typeof module !== "undefined") module.exports = api; else root.SurfDirections = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
