"""Wind shelter of every spot from the Polish LiDAR surface model (GUGiK NMPT): writes surf-shelter.js.

Breakwaters, piers, dunes, forests, buildings and cliffs shield a spot from some wind directions. For each
direction the wind blows from we look upwind from the place where people surf:
- an obstacle of height H slows the wind for up to about 30 H downwind (windbreak studies);
- for wind from the sea side or along the coast, an obstacle that cuts the open water short leaves little room
  for chop to grow: behind a breakwater a westerly does not roughen the water, though the waves it built remain.
The app lowers the wind accordingly when it rates the conditions (surf-model.js). The SWAN runs keep the models'
wind. Run once after adding or moving spots: python model/shelter.py (about 50 minutes, GUGiK's service is slow;
--bathymetry-cache can point at a cache that already holds the EMODnet transects, e.g. .dev-preview/swan-cache).
"""
from __future__ import annotations

import argparse
import concurrent.futures
import hashlib
import json
import math
from pathlib import Path
import re
import subprocess
import time

import requests

ROOT = Path(__file__).resolve().parents[1]
NMPT = "https://mapy.geoportal.gov.pl/wss/service/PZGIK/NMPT/GRID1/WCS/DigitalSurfaceModel"
# Typical windbreak findings: a strong slow-down up to ~5 heights downwind, fading out by ~30 heights.
WINDBREAK = [(0, .7), (5, .7), (10, .45), (20, .2), (30, 0)]
STEP = 5                 # degrees between the directions of the profile
SPREAD = (-10, -5, 0, 5, 10)  # the wind wanders: rays around each direction are averaged
RAY_STEP = 5             # metres between samples along a ray
WATER = .5               # the surface model has the sea at about 0.2-0.4 m (EVRF2007)
LAND = 1.0               # this much above the water ends the open water a wind blows over
OBSTACLE = 1.5           # this much above the water slows the wind
FETCH = 2000             # metres of open water beyond which the chop is as at an exposed beach
CHOP_SECTOR = 112.5      # chop shelter for wind from the sea side or along the coast, not for offshore wind
MAXIMUM = .8             # never assume that a spot has no wind at all
SURF_ZONE = 75           # metres off the waterline at least: where the waves break, not the beach
NEAR, FAR = (600, 240), (2100, 420)   # half-width (m) and grid size: 5 m near the spot, 10 m up to the fetch


def windbreak(ratio):
    for (x0, s0), (x1, s1) in zip(WINDBREAK, WINDBREAK[1:]):
        if ratio <= x1:
            return s0 + (s1 - s0) * (ratio - x0) / (x1 - x0)
    return 0


def angle(a, b):
    return abs((a - b + 540) % 360 - 180)


def destination(lat, lon, bearing, distance):
    a = math.radians(bearing)
    return lat + distance * math.cos(a) / 110570, lon + distance * math.sin(a) / (111320 * math.cos(math.radians(lat)))


def parse_grid(text):
    body = text[text.index("ncols"):]
    lines = body.splitlines()
    header, i = {}, 0
    while re.match(r"^[a-zA-Z_]+\s", lines[i]):
        key, value = lines[i].split()[:2]
        header[key.lower()] = float(value)
        i += 1
    values = []
    for line in lines[i:]:
        if line.startswith("--"):
            break
        values.extend(float(v) for v in line.split())
    ncols, nrows = int(header["ncols"]), int(header["nrows"])
    if len(values) != ncols * nrows:
        raise ValueError("Incomplete surface model grid")
    nodata = header.get("nodata_value")
    return {"west": header["xllcorner"], "south": header["yllcorner"], "dx": header.get("dx", header.get("cellsize")),
            "dy": header.get("dy", header.get("cellsize")), "ncols": ncols, "nrows": nrows,
            "values": [None if nodata is not None and v == nodata else v for v in values]}


def clip(lat, lon, half, size, cache):
    """A square of the surface model around a point, cached on disk; GUGiK sometimes drops a request."""
    dlat, dlon = half / 110570, half / (111320 * math.cos(math.radians(lat)))
    box = [round(v, 6) for v in (lat - dlat, lat + dlat, lon - dlon, lon + dlon)]
    path = cache / f"{hashlib.sha256(json.dumps([box, size]).encode()).hexdigest()[:20]}.json"
    if path.exists():
        return json.loads(path.read_text())
    south, north, west, east = box
    url = (f"{NMPT}?SERVICE=WCS&VERSION=2.0.1&REQUEST=GetCoverage&COVERAGEID=DSM_PL-EVRF2007-NH&FORMAT=image/x-aaigrid"
           f"&SUBSETTINGCRS=http://www.opengis.net/def/crs/EPSG/0/4326&SUBSET=x({west},{east})&SUBSET=y({south},{north})"
           f"&SCALESIZE=x({size}),y({size})")
    for attempt in range(4):
        try:
            response = requests.get(url, timeout=(20, 180), headers={"User-Agent": "BalticSurf/1.0 (github.com/dosiaczek-tech/dosiaczek-tech.github.io)"})
            response.raise_for_status()
            grid = parse_grid(response.text)
            break
        except (requests.RequestException, ValueError):
            if attempt == 3:
                raise
            time.sleep(10 * (attempt + 1))
    cache.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(grid))
    return grid


def sampler(*grids):
    """Height above the sea at a point: the first (finest) grid that covers it."""
    def height(lat, lon):
        for g in grids:
            north = g["south"] + g["nrows"] * g["dy"]
            c, r = int((lon - g["west"]) / g["dx"]), int((north - lat) / g["dy"])
            if 0 <= r < g["nrows"] and 0 <= c < g["ncols"]:
                value = g["values"][r * g["ncols"] + c]
                return None if value is None else value - WATER
        return None
    return height


def wet(height, lat, lon):
    h = height(lat, lon)
    return h is not None and h < LAND / 2


def open_water(height, start, end):
    """No land on the straight line between two points: both lie on the same sea."""
    distance = math.hypot((end[0] - start[0]) * 110570, (end[1] - start[1]) * 111320 * math.cos(math.radians(start[0])))
    steps = max(1, int(distance / RAY_STEP))
    for k in range(1, steps):
        h = height(start[0] + (end[0] - start[0]) * k / steps, start[1] + (end[1] - start[1]) * k / steps)
        if h is not None and h >= LAND:
            return False
    return True


def shore_distance(height, point, normal):
    """How far the point lies off the waterline, landwards along the beach normal."""
    for distance in range(RAY_STEP, 1000, RAY_STEP):
        if not wet(height, *destination(*point, normal + 180, distance)):
            return distance
    return 1000


def surf_point(height, spot, sea):
    """Where people surf, at least SURF_ZONE off the waterline. The spot's own point if it lies on the same sea as
    the model's point `sea` (SWAN's point off the beach), moved seawards if it is closer to the shore; otherwise -
    a point on land or on a lake behind the beach - on the line from `sea` to the shore."""
    if wet(height, spot["lat"], spot["lon"]) and open_water(height, (spot["lat"], spot["lon"]), sea):
        point = spot["lat"], spot["lon"]
        offshore = shore_distance(height, point, spot["normal"])
        return point if offshore >= SURF_ZONE else destination(*point, spot["normal"], SURF_ZONE - offshore)
    for distance in range(10, 1000, 10):
        if not wet(height, *destination(*sea, spot["normal"] + 180, distance)):
            return destination(*sea, spot["normal"] + 180, max(0, distance - SURF_ZONE))
    return sea


def ray(height, lat, lon, bearing, chop, beach=math.inf):
    """beach: the open water a straight shore alone would leave in this direction. Only what obstacles cut
    shorter counts: the wind's angle to the beach already rates the short water of a wind from the land."""
    slow, fetch = 0, None
    for step in range(1, FETCH // RAY_STEP + 1):
        distance = step * RAY_STEP
        h = height(*destination(lat, lon, bearing, distance))
        if h is None:
            continue
        if fetch is None and h >= LAND:
            fetch = distance
        if h >= OBSTACLE:
            slow = max(slow, windbreak(distance / h))
    reach = min(FETCH, beach)
    # The 10% margin keeps the grid steps of a straight shore from counting as shelter.
    sheltered_water = 1 - math.sqrt(fetch / reach) if chop and fetch is not None and fetch < .9 * reach else 0
    return max(slow, sheltered_water)


def profile(height, point, normal):
    """Shelter (0-MAXIMUM) for wind from 0, 5, ..., 355 degrees."""
    lat, lon = point
    offshore = shore_distance(height, point, normal)
    result = []
    for direction in range(0, 360, STEP):
        chop = angle(direction, normal) <= CHOP_SECTOR
        rays = []
        for delta in SPREAD:
            bearing = (direction + delta) % 360
            landward = angle(bearing, normal) - 90
            beach = offshore / math.sin(math.radians(landward)) if landward > 0 else math.inf
            rays.append(ray(height, lat, lon, bearing, chop, beach))
        result.append(min(MAXIMUM, sum(rays) / len(rays)))
    return result


def model_point(spot, bathymetry_cache):
    """SWAN's point off the beach (nearshore.py): always on the open sea side of the spot."""
    from nearshore import bathymetry, calculation_grid, offshore, summary_location
    coast, distances, depths = calculation_grid(spot, bathymetry(spot, bathymetry_cache))
    return offshore(spot, summary_location(coast, distances, depths))


def spot_shelter(spot, cache, bathymetry_cache):
    try:
        sea = model_point(spot, bathymetry_cache)
    except ValueError:
        return None  # No forecast for this spot, so no rating to shelter.
    near = clip(spot["lat"], spot["lon"], *NEAR, cache)
    far = clip(spot["lat"], spot["lon"], *FAR, cache)
    height = sampler(near, far)
    point = surf_point(height, spot, sea)
    return {"lat": spot["lat"], "lon": spot["lon"], "normal": spot["normal"], "point": [round(point[0], 6), round(point[1], 6)],
            "shelter": [round(100 * s) for s in profile(height, point, spot["normal"])]}


def write(entries, path):
    body = ",\n".join(f'    {json.dumps(id)}: {json.dumps(entry, separators=(",", ":"))}' for id, entry in sorted(entries.items()))
    path.write_text(f"""/* Wind shelter of the spots, generated by model/shelter.py from the GUGiK LiDAR surface model (NMPT).
 * shelter[i]: how much (percent) obstacles weaken the wind from i x 5 degrees where people surf ("point").
 * Valid only for the listed spot position; a moved spot needs the script again.
 */
(function (root) {{
  "use strict";
  const shelter = {{
{body}
  }};
  if (typeof module !== "undefined") module.exports = shelter;
  else root.SurfShelter = shelter;
}})(typeof globalThis !== "undefined" ? globalThis : this);
""", encoding="utf-8")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--cache", type=Path, default=ROOT / ".forecast-cache" / "shelter")
    parser.add_argument("--bathymetry-cache", type=Path, default=ROOT / ".forecast-cache",
                        help="nearshore.py cache with the EMODnet transects (downloaded when missing)")
    parser.add_argument("--output", type=Path, default=ROOT / "surf-shelter.js")
    parser.add_argument("--spots", help="Comma-separated IDs; omitted means all")
    parser.add_argument("--workers", type=int, default=4)
    args = parser.parse_args()
    spots = json.loads(subprocess.check_output(["node", "-e", "console.log(JSON.stringify(require('./surf-spots.js')))"], cwd=ROOT, text=True))
    if args.spots:
        spots = [s for s in spots if s["id"] in set(args.spots.split(","))]
    entries = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(spot_shelter, s, args.cache, args.bathymetry_cache): s for s in spots}
        for future in concurrent.futures.as_completed(futures):
            spot = futures[future]
            try:
                entry = future.result()
            except Exception as error:
                print(f'{spot["id"]}: FAILED {type(error).__name__}: {str(error)[:120]}', flush=True)
                continue
            if entry:
                entries[spot["id"]] = entry
                strongest = max(range(len(entry["shelter"])), key=lambda i: entry["shelter"][i])
                print(f'{spot["id"]}: OK, najsilniejsza osłona {entry["shelter"][strongest]}% od {strongest * STEP}°', flush=True)
            else:
                print(f'{spot["id"]}: no forecast point, skipped', flush=True)
    if args.spots and args.output.exists():
        # A partial run keeps the other spots of the existing file.
        existing = json.loads(subprocess.check_output(["node", "-e", f"console.log(JSON.stringify(require({json.dumps(str(args.output))})))"], text=True))
        entries = {**existing, **entries}
    write(entries, args.output)
    print(f"Saved {len(entries)} spots to {args.output}", flush=True)


if __name__ == "__main__":
    main()
