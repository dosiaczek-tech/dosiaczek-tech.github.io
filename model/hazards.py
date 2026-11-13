"""Hazards near every spot from OpenStreetMap: writes surf-hazards.js.

A harbour entrance or a river mouth brings currents and boats, a breakwater or a pier is hard to hit, and the
wooden groynes of the Polish beaches stand in the water. Run after adding or moving spots: python model/hazards.py
(one Overpass request for the whole coast, data © OpenStreetMap contributors, ODbL).
"""
from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
import subprocess
import time

import requests

ROOT = Path(__file__).resolve().parents[1]
OVERPASS = "https://overpass-api.de/api/interpreter"
# Distance (m) from the spot at which each kind of object counts, and its note.
HARBOUR = (1500, "Wejście do portu w pobliżu — prąd i ruch statków; trzymaj się z dala od toru wodnego.")
MOUTH = (800, "Ujście rzeki lub kanału w pobliżu — prąd odpływowy, zwłaszcza przy dużej wodzie i silnej fali.")
STRUCTURE = (300, "Falochron lub molo blisko spotu — nie surfuj przy konstrukcji, przy niej płynie prąd.")
GROYNES = (200, "Ostrogi brzegowe (drewniane pale) w wodzie — uważaj przy brzegu i na płyciźnie.")


def query(spots):
    parts = []
    for s in spots:
        at = f'{s["lat"]},{s["lon"]}'
        parts += [f'nwr["harbour"="yes"](around:{HARBOUR[0]},{at});', f'nwr["landuse"="harbour"](around:{HARBOUR[0]},{at});',
                  f'nwr["industrial"="port"](around:{HARBOUR[0]},{at});', f'nwr["seamark:type"="harbour"](around:{HARBOUR[0]},{at});',
                  f'way["man_made"~"^(breakwater|pier)$"](around:{HARBOUR[0]},{at});',
                  f'way["waterway"~"^(river|canal)$"](around:{MOUTH[0]},{at});', f'way["man_made"="groyne"](around:{GROYNES[0]},{at});']
    return "[out:json][timeout:300];(" + "".join(parts) + ");out tags geom;"


def metres(lat, lon, point):
    return math.hypot((point[0] - lat) * 110570, (point[1] - lon) * 111320 * math.cos(math.radians(lat)))


def distance(lat, lon, element):
    """Shortest distance from the spot to the object: its outline for a way, its position for a node, its members
    for a relation (a harbour is often mapped as one)."""
    if element.get("type") == "relation":
        members = [member for member in element.get("members") or [] if member.get("geometry") or "lat" in member]
        if members:
            return min(distance(lat, lon, member) for member in members)
        # Without members ("out tags") the service gives the relation's bounding box.
        box = element.get("bounds")
        if not box:
            return math.inf
        return metres(lat, lon, (min(max(lat, box["minlat"]), box["maxlat"]), min(max(lon, box["minlon"]), box["maxlon"])))
    geometry = [(g["lat"], g["lon"]) for g in element.get("geometry") or [] if g]
    if not geometry:
        center = element.get("center") or element
        return metres(lat, lon, (center["lat"], center["lon"])) if "lat" in center else math.inf
    best = metres(lat, lon, geometry[0])
    for a, b in zip(geometry, geometry[1:]):
        # Project onto the segment in a local flat frame around the spot.
        ax, ay = (a[1] - lon) * 111320 * math.cos(math.radians(lat)), (a[0] - lat) * 110570
        bx, by = (b[1] - lon) * 111320 * math.cos(math.radians(lat)), (b[0] - lat) * 110570
        dx, dy = bx - ax, by - ay
        t = max(0, min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy))) if dx or dy else 0
        best = min(best, math.hypot(ax + t * dx, ay + t * dy))
    return best


def notes(spot, elements):
    """The notes for one spot; a harbour counts only with a breakwater, i.e. an entrance from the sea."""
    lat, lon = spot["lat"], spot["lon"]
    within = lambda test, limit: any(test(e.get("tags") or {}) and distance(lat, lon, e) <= limit for e in elements)
    result = []
    port = lambda t: t.get("harbour") == "yes" or t.get("landuse") == "harbour" or t.get("industrial") == "port" or t.get("seamark:type") == "harbour"
    if within(port, HARBOUR[0]) and within(lambda t: t.get("man_made") == "breakwater", HARBOUR[0]):
        result.append(HARBOUR[1])
    if within(lambda t: t.get("waterway") in ("river", "canal"), MOUTH[0]):
        result.append(MOUTH[1])
    if within(lambda t: t.get("man_made") in ("breakwater", "pier"), STRUCTURE[0]):
        result.append(STRUCTURE[1])
    if within(lambda t: t.get("man_made") == "groyne", GROYNES[0]):
        result.append(GROYNES[1])
    return result


def fetch(spots):
    for attempt in range(4):
        try:
            response = requests.post(OVERPASS, data={"data": query(spots)}, timeout=(30, 400),
                                     headers={"User-Agent": "BalticSurf/1.0 (github.com/dosiaczek-tech/dosiaczek-tech.github.io)", "Accept": "application/json"})
            response.raise_for_status()
            return response.json()["elements"]
        except (requests.RequestException, ValueError, KeyError):
            if attempt == 3:
                raise
            time.sleep(30 * (attempt + 1))


def write(entries, path):
    body = ",\n".join(f'    {json.dumps(id)}: {json.dumps(entry, ensure_ascii=False, separators=(",", ":"))}' for id, entry in sorted(entries.items()))
    path.write_text(f"""/* Hazards near the spots, generated by model/hazards.py from OpenStreetMap (© OpenStreetMap contributors, ODbL).
 * Valid only for the listed spot position; a moved spot needs the script again.
 */
(function (root) {{
  "use strict";
  const hazards = {{
{body}
  }};
  if (typeof module !== "undefined") module.exports = hazards;
  else root.SurfHazards = hazards;
}})(typeof globalThis !== "undefined" ? globalThis : this);
""", encoding="utf-8")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=ROOT / "surf-hazards.js")
    args = parser.parse_args()
    spots = json.loads(subprocess.check_output(["node", "-e", "console.log(JSON.stringify(require('./surf-spots.js')))"], cwd=ROOT, text=True))
    elements = fetch(spots)
    entries = {s["id"]: {"lat": s["lat"], "lon": s["lon"], "notes": notes(s, elements)} for s in spots}
    for id, entry in entries.items():
        print(f'{id}: {len(entry["notes"])} uwag', flush=True)
    write(entries, args.output)
    print(f"Saved {len(entries)} spots from {len(elements)} map objects to {args.output}", flush=True)


if __name__ == "__main__":
    main()
