"""SWAN 2D over six surfing areas for the first five days.

Harbour breakwaters, bars and the curve of the coast bend and shelter the waves in ways a 1D transect cannot. Each
area is one rectangle turned along the coast, with 100 m cells (about the resolution of the EMODnet sea bed), from
600 m inland to 5 km out (where the 1D runs take their waves) and 3 km past its outer spots. The waves enter at the
outer side and at the deep parts (from 6 m) of the two short sides: the same hourly spectrum as the 1D run of the
area's middle spot (one wave model per hour, swell and wind sea as two peaks). The wind is the mean of the area's
spots over the sea, the sea level DKSS's as in 1D. Breakwaters from OpenStreetMap stop the waves (no transmission,
no reflection); the sea bed is EMODnet's. Steps of 30 minutes and 6 hours of spin-up keep the six areas to about ten
minutes on four cores (one core per area, the areas side by side).

For the 24 hours of history and the first 120 hours the 2D result replaces the 1D one at each spot of the area, at
the same 11 points 0-500 m from the estimated shore; the point of the forecast follows the 1D rule on the sea bed as
SWAN reported it. Later hours stay 1D. A spot without a full 2D result keeps its 1D run.
"""
from __future__ import annotations

import hashlib
import io
import math
import os
from pathlib import Path
import statistics
import subprocess
import tempfile
import time

from PIL import Image
import requests

from nearshore import (COMPUTE_DX, HISTORY_HOURS, ICE, MAX_SHORE_DISTANCE, SEA_LEVEL, boundary_models, boundary_spectrum,
                       consensus, dump, finite, load, models_agree, offshore, offshore_heights, request, shoreline_reference,
                       summary_location, swan_time, swell_share, wave_members, write_spectra)

AREAS = [
    {"id": "kolobrzeg", "name": "Kołobrzeg", "spots": [
        "military-point", "kolobrzeg-port-mielizny", "kolobrzeg-latarnia-surf", "kolobrzeg", "kolobrzeg-mikado",
        "kolobrzeg-palikpoint", "kolobrzeg-flaga", "kolobrzeg-piekielko", "kolobrzeg-molo-surf", "kolobrzeg-molo-wschod",
        "kolobrzeg-rafa", "kolobrzeg-sanatorium", "kolobrzeg-ecopark"]},
    {"id": "mielno", "name": "Mielno", "spots": ["mielno", "mielno-channel"]},
    {"id": "jastrzebia", "name": "Jastrzębia Góra", "spots": ["jastrzebia"]},
    {"id": "wladyslawowo", "name": "Władysławowo–Chałupy", "spots": ["wladyslawowo", "rurociag", "chalupy"]},
    {"id": "sobieszewo", "name": "Sobieszewo", "spots": ["sobieszewo-hotel-orle", "sobieszewo"]},
    {"id": "stegna", "name": "Stegna–Sztutowo", "spots": ["stegna", "sztutowo"]},
]
FORECAST_HOURS = 120     # the first five days
CELL = 100               # metres
MARGIN = 3000            # metres of coast past the outer spots
LANDWARD = 600           # metres inland of the most landward shore
SEAWARD = 5000           # metres off the most seaward shore: where the 1D runs take their waves
DEEP = 6                 # metres: the short sides let the offshore waves in only from this depth on
SPREAD = 2000            # metres of coast between the outer shores from which their line sets the grid's direction
DRY_SHARE = .1           # a forecast point dry in more of the hours leaves the spot 1D
STEP_MINUTES = 30
SPINUP_HOURS = 6         # the waves cross an area within the hour
OBSTACLE_TOLERANCE = 5   # metres: breakwater outlines simplified to this
EXCEPTION = -99


class Frame:
    """Metres east (x) and north (y) of the area's centre: flat over a few tens of kilometres."""

    def __init__(self, lat, lon):
        self.lat, self.lon = lat, lon
        self.kx, self.ky = 111320 * math.cos(math.radians(lat)), 110570

    def xy(self, lat, lon):
        return (lon - self.lon) * self.kx, (lat - self.lat) * self.ky

    def latlon(self, x, y):
        return self.lat + y / self.ky, self.lon + x / self.kx


def circular_mean(angles):
    x = sum(math.sin(math.radians(a)) for a in angles)
    y = sum(math.cos(math.radians(a)) for a in angles)
    return math.degrees(math.atan2(x, y)) % 360


def profile_points(spot, coast):
    """The 11 points of the 1D profile: 0, 50, ..., 500 m from the estimated shore along the spot's normal."""
    return [(coast["distance"] + d, *offshore(spot, coast["distance"] + d)) for d in range(0, MAX_SHORE_DISTANCE + 1, COMPUTE_DX)]


def layout(spots, coasts):
    """The rectangle along the coast: origin (the inland corner on the left when facing the sea), turn, size. It
    follows the line through the spots' shores where they spread along the coast, else their mean normal."""
    centre = Frame(statistics.mean(c["lat"] for c in coasts.values()), statistics.mean(c["lon"] for c in coasts.values()))
    normal = circular_mean([s["normal"] for s in spots])
    sea = (math.sin(math.radians(normal)), math.cos(math.radians(normal)))   # towards the sea (x east, y north)
    shores = [centre.xy(c["lat"], c["lon"]) for c in coasts.values()]
    mean_x, mean_y = statistics.mean(x for x, _ in shores), statistics.mean(y for _, y in shores)
    sxx = sum((x - mean_x) ** 2 for x, _ in shores)
    syy = sum((y - mean_y) ** 2 for _, y in shores)
    sxy = sum((x - mean_x) * (y - mean_y) for x, y in shores)
    axis = .5 * math.atan2(2 * sxy, sxx - syy)
    coast = (math.cos(axis), math.sin(axis))
    if max(x * coast[0] + y * coast[1] for x, y in shores) - min(x * coast[0] + y * coast[1] for x, y in shores) >= SPREAD:
        fitted = (-coast[1], coast[0]) if -coast[1] * sea[0] + coast[0] * sea[1] >= 0 else (coast[1], -coast[0])
        sea = fitted
        normal = math.degrees(math.atan2(sea[0], sea[1])) % 360
    along = (sea[1], -sea[0])                                               # along the coast, sea on the left
    a = [x * along[0] + y * along[1] for x, y in shores]
    n = [x * sea[0] + y * sea[1] for x, y in shores]
    a0, a1 = min(a) - MARGIN, max(a) + MARGIN
    n0, n1 = min(n) - LANDWARD, max(n) + SEAWARD
    mx, my = math.ceil((a1 - a0) / CELL), math.ceil((n1 - n0) / CELL)
    origin = (a0 * along[0] + n0 * sea[0], a0 * along[1] + n0 * sea[1])
    # SWAN turns the grid by the angle of its x axis, counterclockwise from east.
    turn = math.degrees(math.atan2(along[1], along[0]))
    return {"frame": centre, "normal": normal, "sea": sea, "along": along, "origin": origin, "turn": turn, "mx": mx, "my": my}


def node(grid, i, j):
    """Problem coordinates of grid node (i along the coast, j towards the sea)."""
    (x0, y0), a, s = grid["origin"], grid["along"], grid["sea"]
    return x0 + i * CELL * a[0] + j * CELL * s[0], y0 + i * CELL * a[1] + j * CELL * s[1]


def corners(grid):
    points = [node(grid, i, j) for i in (0, grid["mx"]) for j in (0, grid["my"])]
    return min(p[0] for p in points), min(p[1] for p in points), max(p[0] for p in points), max(p[1] for p in points)


def raster(grid, cache):
    """EMODnet DTM (1/16 arc minute) over the rectangle, cached for 30 days."""
    xmin, ymin, xmax, ymax = corners(grid)
    lat0, lon0 = grid["frame"].latlon(xmin, ymin)
    lat1, lon1 = grid["frame"].latlon(xmax, ymax)
    box = [round(v, 4) for v in (lon0 - .01, lat0 - .01, lon1 + .01, lat1 + .01)]
    path = cache / "bathymetry2d" / f"{hashlib.sha256(str(box).encode()).hexdigest()[:20]}.json"
    old = load(path)
    if old and 0 <= time.time() - old["fetchedAt"] < 30 * 86400:
        return old
    response = request("https://ows.emodnet-bathymetry.eu/wcs", {
        "service": "WCS", "version": "1.0.0", "request": "GetCoverage", "coverage": "emodnet:mean", "crs": "EPSG:4326",
        "response_crs": "EPSG:4326", "bbox": ",".join(map(str, box)), "resx": 1 / 960, "resy": 1 / 960, "format": "GeoTIFF"})
    image = Image.open(io.BytesIO(response.content))
    if image.mode != "F":
        raise ValueError("Bathymetry is not a float depth raster")
    matrix = image.tag_v2.get(34264)
    if matrix:
        if matrix[1] or matrix[4] or matrix[0] <= 0 or matrix[5] >= 0:
            raise ValueError("Unsupported bathymetry transform")
        x0, y0, sx, sy = matrix[3], matrix[7], matrix[0], -matrix[5]
    else:
        scale, tie = image.tag_v2[33550], image.tag_v2[33922]
        sx, sy = scale[:2]
        x0, y0 = tie[3] - tie[0] * sx, tie[4] + tie[1] * sy
    values = [[image.getpixel((c, r)) for c in range(image.width)] for r in range(image.height)]
    result = {"fetchedAt": int(time.time()), "box": box, "west": x0, "north": y0, "dx": sx, "dy": sy,
              "values": [[round(v, 3) if finite(v) and abs(v) < 1000 else None for v in row] for row in values]}
    dump(path, result)
    return result


def elevation(bed, lat, lon):
    """Bilinear between the raster's cell centres; cells without data drop out. None: no data around."""
    col = (lon - bed["west"]) / bed["dx"] - .5
    row = (bed["north"] - lat) / bed["dy"] - .5
    c, r = math.floor(col), math.floor(row)
    fc, fr = col - c, row - r
    weighted, total = 0.0, 0.0
    for dr, dc, w in ((0, 0, (1 - fr) * (1 - fc)), (0, 1, (1 - fr) * fc), (1, 0, fr * (1 - fc)), (1, 1, fr * fc)):
        rr, cc = r + dr, c + dc
        if 0 <= rr < len(bed["values"]) and 0 <= cc < len(bed["values"][0]) and bed["values"][rr][cc] is not None and w > 0:
            weighted += w * bed["values"][rr][cc]
            total += w
    return weighted / total if total > 0 else None


def structures(grid, cache):
    """Breakwaters from OpenStreetMap as lines in problem coordinates, cached for 30 days; [] when unavailable."""
    xmin, ymin, xmax, ymax = corners(grid)
    lat0, lon0 = grid["frame"].latlon(xmin, ymin)
    lat1, lon1 = grid["frame"].latlon(xmax, ymax)
    box = f"{lat0:.5f},{lon0:.5f},{lat1:.5f},{lon1:.5f}"
    path = cache / "structures2d" / f"{hashlib.sha256(box.encode()).hexdigest()[:20]}.json"
    old = load(path)
    if old and 0 <= time.time() - old["fetchedAt"] < 30 * 86400:
        elements = old["elements"]
    else:
        query = f'[out:json][timeout:120];nwr["man_made"="breakwater"]({box});out geom;'
        try:
            response = requests.post("https://overpass-api.de/api/interpreter", data={"data": query}, timeout=(30, 180),
                                      headers={"User-Agent": "BalticSurf/1.0 (github.com/dosiaczek-tech/dosiaczek-tech.github.io)"})
            response.raise_for_status()
            elements = response.json()["elements"]
        except (requests.RequestException, ValueError, KeyError):
            return None
        dump(path, {"fetchedAt": int(time.time()), "elements": elements})
    lines = []
    for element in elements:
        parts = [element.get("geometry")] if element.get("type") == "way" else [m.get("geometry") for m in element.get("members") or []]
        for geometry in parts:
            points = [grid["frame"].xy(p["lat"], p["lon"]) for p in geometry or [] if p]
            if len(points) >= 2:
                lines.append(simplify(points, OBSTACLE_TOLERANCE))
    return lines


def simplify(points, tolerance):
    """Douglas-Peucker."""
    if len(points) < 3:
        return points
    (x0, y0), (x1, y1) = points[0], points[-1]
    length = math.hypot(x1 - x0, y1 - y0)
    def gap(p):
        if length == 0:
            return math.hypot(p[0] - x0, p[1] - y0)
        return abs((x1 - x0) * (y0 - p[1]) - (x0 - p[0]) * (y1 - y0)) / length
    index = max(range(1, len(points) - 1), key=lambda k: gap(points[k]))
    if gap(points[index]) <= tolerance:
        return [points[0], points[-1]]
    return simplify(points[:index + 1], tolerance)[:-1] + simplify(points[index:], tolerance)


def inside(grid, x, y):
    (x0, y0), a, s = grid["origin"], grid["along"], grid["sea"]
    u = (x - x0) * a[0] + (y - y0) * a[1]
    v = (x - x0) * s[0] + (y - y0) * s[1]
    return 0 <= u <= grid["mx"] * CELL and 0 <= v <= grid["my"] * CELL


def area_wind(winds, t):
    """Mean wind over the sea of the area's spots (their 5000 m and 2500 m points): mean speed, mean direction."""
    members = []
    for bundles in winds:
        for bundle in bundles[:2]:
            hourly = bundle["data"]["hourly"]
            index = {u: i for i, u in enumerate(hourly["time"])}.get(t)
            if index is None:
                continue
            try:
                members.append(consensus(hourly, index))
            except ValueError:
                continue
    if not members:
        raise ValueError("No wind for the 2D area")
    speed = statistics.mean(m["speed"] for m in members)
    x = sum(m["speed"] * math.sin(math.radians(m["direction"])) for m in members)
    y = sum(m["speed"] * math.cos(math.radians(m["direction"])) for m in members)
    direction = math.degrees(math.atan2(x, y)) % 360 if math.hypot(x, y) > 1e-6 else members[0]["direction"]
    return speed, direction


def prepare(directory, grid, bed, lines, outputs, marine, winds, start, end, history_start):
    """outputs: per spot the 11 profile points (distance, lat, lon). Writes the SWAN input; returns the hour's
    boundary model, sea level and ice like the 1D run."""
    mh = marine["data"]["hourly"]
    indices = {t: i for i, t in enumerate(mh["time"])}
    times = list(range(start, end + 1, 3600))
    hours = [wave_members(mh, indices[t]) if t in indices else [] for t in times]
    if not all(hours):
        raise ValueError("Incomplete offshore boundary for the 2D horizon")
    levels_series, ice_series = mh.get(SEA_LEVEL) or [], mh.get(ICE) or []
    spectra, choices, levels, ice = [], {}, {}, {}
    for t, members, chosen in zip(times, hours, boundary_models(hours)):
        i = indices[t]
        shares = [swell_share(m) for m in ([chosen] if chosen.get("swell") else members) if m.get("swell")]
        swell = statistics.median(shares) if shares else None
        choices[t] = {"model": chosen["model"], "models": len(members), "agree": models_agree(members),
                      **({"swell": round(swell, 2)} if swell is not None else {}), "heights": offshore_heights(members)}
        level = levels_series[i] if i < len(levels_series) and finite(levels_series[i]) else None
        levels[t] = None if level is None else round(level, 3)
        ice[t] = round(ice_series[i], 2) if i < len(ice_series) and finite(ice_series[i]) else None
        # Normal 270 leaves the directions as they are: nautical, from where the waves come.
        spectra.append(boundary_spectrum(chosen, 270))
    write_spectra(directory / "boundary.sp2", times, spectra)
    mx, my = grid["mx"], grid["my"]
    depth = [[None] * (mx + 1) for _ in range(my + 1)]
    for j in range(my + 1):
        for i in range(mx + 1):
            z = elevation(bed, *grid["frame"].latlon(*node(grid, i, j)))
            depth[j][i] = None if z is None else -z
    (directory / "bottom.dat").write_text("\n".join(" ".join(f"{EXCEPTION}" if d is None else f"{d:.2f}" for d in row) for row in depth) + "\n")
    def deep_from(i):
        """The first node from which the short side stays at least DEEP deep up to the outer corner."""
        j = my
        while j >= 0 and depth[j][i] is not None and depth[j][i] >= DEEP:
            j -= 1
        return j + 1 if j + 1 < my else None
    left, right = deep_from(0), deep_from(mx)
    xmin, ymin, xmax, ymax = corners(grid)
    x0, y0 = grid["origin"]
    with_level = any(level is not None for level in levels.values())
    header = ["PROJECT 'BalticSurf2D' '0001'", "SET depmin=0.05 inrhog=1 NAUTICAL", "MODE NONSTATIONARY TWODIMENSIONAL",
              "COORDINATES CARTESIAN",
              f"CGRID REGULAR {x0:.2f} {y0:.2f} {grid['turn']:.4f} {mx * CELL} {my * CELL} {mx} {my} CIRCLE 36 0.05 1.0 31",
              f"INPGRID BOTTOM REGULAR {x0:.2f} {y0:.2f} {grid['turn']:.4f} {mx} {my} {CELL} {CELL} EXCEPTION {EXCEPTION}",
              "READINP BOTTOM 1. 'bottom.dat' 3 0 FREE",
              # Wind and sea level on a plain east-north grid: SWAN reads vectors of a turned grid along its lines.
              f"INPGRID WIND REGULAR {xmin - CELL:.2f} {ymin - CELL:.2f} 0. 1 1 {xmax - xmin + 2 * CELL:.2f} {ymax - ymin + 2 * CELL:.2f}",
              *([f"INPGRID WLEVEL REGULAR {xmin - CELL:.2f} {ymin - CELL:.2f} 0. 1 1 {xmax - xmin + 2 * CELL:.2f} {ymax - ymin + 2 * CELL:.2f}"]
                if with_level else []),
              # One line through the deep part of the left side, the outer side and the deep part of the right side:
              # SWAN opens a boundary file only once.
              "BOUNDSPEC SEGMENT IJ " + " ".join(f"{i} {j}" for i, j in [*([(0, left)] if left is not None else []), (0, my), (mx, my),
                                                                        *([(mx, right)] if right is not None else [])])
              + " CONSTANT FILE 'boundary.sp2' 1",
              "GEN3 KOMEN", "BREAKING CONSTANT 1.0 0.73", "FRICTION JONSWAP 0.038", "TRIAD", "PROP BSBT"]
    for line in lines:
        kept = [p for p in line if inside(grid, *p)]
        if len(kept) < 2:
            continue
        coordinates = [f"{x:.1f} {y:.1f}" for x, y in kept]
        rows = [" ".join(coordinates[k:k + 6]) for k in range(0, len(coordinates), 6)]
        header.append("OBSTACLE TRANSM 0. REFL 0. LINE " + " &\n    ".join(rows))
    for k, points in enumerate(outputs):
        (directory / f"p{k:02d}.loc").write_text("".join("{:.2f} {:.2f}\n".format(*grid["frame"].xy(lat, lon)) for _, lat, lon in points))
        header += [f"POINTS 'P{k:02d}' FILE 'p{k:02d}.loc'",
                   f"TABLE 'P{k:02d}' NOHEADER 'p{k:02d}.tbl' TIME XP YP DEPTH HSIGN TM01 TMM10 DIR QB TRANSP TPS OUTPUT {swan_time(history_start)} 1 HR"]
    steps = []
    for index, t in enumerate(times[:-1]):
        speed, direction = area_wind(winds, t)
        u, v = -speed * math.sin(math.radians(direction)), -speed * math.cos(math.radians(direction))
        (directory / f"wind{index:03d}.dat").write_text(f"{u:.4f} {u:.4f}\n{u:.4f} {u:.4f}\n{v:.4f} {v:.4f}\n{v:.4f} {v:.4f}\n")
        steps.append(f"READINP WIND 1. 'wind{index:03d}.dat' 3 0 FREE")
        if with_level:
            level = levels[t + 3600] or 0   # the level of the hour the step ends with, as in 1D
            (directory / f"level{index:03d}.dat").write_text(f"{level:.3f} {level:.3f}\n{level:.3f} {level:.3f}\n")
            steps.append(f"READINP WLEVEL 1. 'level{index:03d}.dat' 3 0 FREE")
        steps.append(f"COMPUTE NONSTAT {swan_time(t)} {STEP_MINUTES} MIN {swan_time(t + 3600)}")
    (directory / "INPUT").write_text("\n".join(header + steps + ["STOP"]) + "\n")
    return {"choices": choices, "levels": levels, "ice": ice, "sides": [left, right]}


def run(directory, executable, threads=1):
    result = subprocess.run([str(executable)], cwd=directory, env={**os.environ, "OMP_NUM_THREADS": str(threads)},
                            stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, timeout=3600, text=True)
    log = (directory / "PRINT").read_text() if (directory / "PRINT").exists() else ""
    if result.returncode or "** Error" in log or "Severe error" in log or not (directory / "p00.tbl").exists():
        raise ValueError("SWAN 2D failed: " + (result.stderr or log[-1800:]))


def read_table(path):
    """{time: [the point rows in order]}: XP YP DEPTH HSIGN TM01 TMM10 DIR QB TRANSPx TRANSPy TPS."""
    from datetime import datetime, timezone
    rows = {}
    for line in path.read_text().splitlines():
        parts = line.split()
        if not parts or parts[0].startswith("%"):
            continue
        if len(parts) != 12:
            raise ValueError("Unexpected SWAN 2D table columns")
        t = int(datetime.strptime(parts[0], "%Y%m%d.%H%M%S").replace(tzinfo=timezone.utc).timestamp())
        values = list(map(float, parts[1:]))
        if not all(finite(v) for v in values):
            raise ValueError("Nonfinite SWAN 2D output")
        rows.setdefault(t, []).append(values)
    return rows


def reported_bed(table, levels, count):
    """The sea bed under each of the points as SWAN reported it: the median water depth less the sea level over
    the hours the point was wet, 0 where it was dry in more than DRY_SHARE of them. SWAN leaves out points in a cell
    that touches land even where the bed under them is wet, so its own output decides."""
    result = []
    for index in range(count):
        wet = [values[index][2] - (levels.get(t) or 0) for t, values in table.items() if len(values) == count and values[index][2] > .05]
        result.append(statistics.median(wet) if wet and len(wet) >= (1 - DRY_SHARE) * len(table) else 0)
    return result


def spot_rows(table, points, depths, coast, start, end, boundary):
    """The 1D-shaped records of one spot from its 11 points, or None when the 2D result is not complete."""
    distances = [d for d, _, _ in points]
    try:
        target_distance = summary_location(coast, distances, depths)
    except ValueError:
        return None
    k = distances.index(target_distance)
    result = []
    for t in range(start, end + 1, 3600):
        values = table.get(t)
        if not values or len(values) != len(points):
            return None
        def wet(p):
            return 0.05 < p[2] < 1000 and 0 <= p[3] < 20 and ((p[4] > 0 and p[5] > 0) or p[3] < .001)
        def record(index, p):
            distance = distances[index]
            return {"height": round(p[3], 3), "period": round(p[4], 3) if p[4] > 0 else None,
                    "energyPeriod": round(p[5], 3) if p[5] > 0 else None,
                    "direction": round(p[6] % 360, 1) if p[6] >= 0 else None, "depth": round(p[2], 3),
                    "distance": round(distance), "shoreDistance": round(distance - coast["distance"], 1),
                    "shoreDistanceMin": round(distance - coast["waterDistance"], 1),
                    "shoreDistanceMax": round(distance - coast["landDistance"], 1),
                    "lat": points[index][1], "lon": points[index][2], "breakingFraction": round(p[7], 4),
                    "energyKJm2": round(1025 * 9.81 * p[3] ** 2 / 16000, 4), "powerKWm": round(math.hypot(p[8], p[9]) / 1000, 4),
                    "peakPeriod": round(p[10], 3) if p[10] > 0 else None}
        profile = [{"distance": coast["distance"], "shoreDistance": 0, "shoreDistanceMin": coast["distance"] - coast["waterDistance"],
                    "shoreDistanceMax": coast["distance"] - coast["landDistance"], "depth": 0, "height": 0, "qb": 0, "kind": "land-boundary"}]
        for index in range(1, len(points)):
            p, distance = values[index], distances[index]
            common = {"distance": distance, "shoreDistance": round(distance - coast["distance"], 1),
                      "shoreDistanceMin": round(distance - coast["waterDistance"], 1), "shoreDistanceMax": round(distance - coast["landDistance"], 1)}
            if wet(p):
                profile.append({**common, "depth": round(p[2], 3), "height": round(p[3], 3), "qb": round(p[7], 4), "kind": "swan-node"})
            elif p[2] <= .05:
                profile.append({**common, "depth": round(max(0, p[2]), 4), "height": 0, "qb": 0, "kind": "dry-model-node"})
            else:
                return None
        breaking = next((record(index, values[index]) for index in range(len(points) - 1, 0, -1)
                         if wet(values[index]) and .3 <= values[index][2] <= 4 and values[index][7] >= .1), None)
        extra = {"seaLevel": boundary["levels"].get(t), "boundary": boundary["choices"].get(t)}
        target = values[k]
        if wet(target):
            result.append({"time": t, **record(k, target), **extra, "breaking": breaking, "profile": profile})
        elif target[2] <= .05:
            # A low sea level has left the point dry: no wave this hour, as in 1D.
            result.append({"time": t, **record(k, [0, 0, 0, 0, -9, -9, -9, 0, 0, 0, -9]), **extra, "dry": True,
                           "breaking": breaking, "profile": profile})
        else:
            return None
    # A point the 2D sea bed leaves dry for long is no place for the forecast: the spot keeps its 1D run.
    if sum(1 for r in result if r.get("dry")) > DRY_SHARE * len(result):
        return None
    return result


def simulate_area(area, spots, baths, marine, winds, executable, cache, now, threads=1):
    """One area: the 2D run and, per spot with a full result, its records for the history and first 120 hours."""
    coasts = {}
    for s in spots:
        if s["id"] not in baths:
            continue
        try:
            coasts[s["id"]] = shoreline_reference(s, baths[s["id"]])
        except ValueError:
            continue
    members = [s for s in spots if s["id"] in coasts]
    if not members:
        raise ValueError("No spot of the area has a recognised shore")
    grid = layout(members, coasts)
    bed = raster(grid, cache)
    lines = structures(grid, cache)
    outputs = [profile_points(s, coasts[s["id"]]) for s in members]
    forecast_start = int(now // 3600) * 3600
    history_start = forecast_start - HISTORY_HOURS * 3600
    start = history_start - SPINUP_HOURS * 3600
    end = forecast_start + FORECAST_HOURS * 3600
    with tempfile.TemporaryDirectory(prefix=f"swan2d-{area['id']}-", dir=cache) as temporary:
        directory = Path(temporary)
        boundary = prepare(directory, grid, bed, lines or [], outputs, marine, winds, start, end, history_start)
        began = time.time()
        run(directory, executable, threads)
        seconds = round(time.time() - began)
        rows = {}
        for k, s in enumerate(members):
            # The point of the forecast by the 1D rule, on the sea bed as SWAN reported it.
            table = read_table(directory / f"p{k:02d}.tbl")
            depths = reported_bed(table, boundary["levels"], len(outputs[k]))
            records = spot_rows(table, outputs[k], depths, coasts[s["id"]], history_start, end, boundary)
            if records:
                rows[s["id"]] = records
    return {"id": area["id"], "name": area["name"], "generatedAt": int(time.time()), "from": history_start, "to": end,
            "forecastStart": forecast_start, "cellM": CELL, "timeStepMinutes": STEP_MINUTES, "normal": round(grid["normal"], 1),
            "sizeM": [grid["mx"] * CELL, grid["my"] * CELL], "obstacles": len(lines) if lines is not None else None,
            "boundarySides": boundary["sides"], "seconds": seconds, "spots": rows}


def merge(document, area):
    """The spot's published document with the 2D records in place of the 1D ones for the 2D hours."""
    records = (area or {}).get("spots", {}).get(document.get("spot", {}).get("id"))
    if not records:
        return document
    by_time = {r["time"]: r for r in records}
    def replace(rows):
        out = []
        for row in rows or []:
            two = by_time.get(row["time"])
            out.append({**two, "ice": row.get("ice")} if two else row)
        return out
    meta = {k: area[k] for k in ("id", "name", "from", "to", "cellM", "timeStepMinutes", "obstacles")}
    return {**document, "history": replace(document.get("history")), "hourly": replace(document.get("hourly")), "area2d": meta,
            "assumptions": [*document.get("assumptions", []),
                            f"2D SWAN ({area['cellM']} m) over the area {area['name']} for the history and the first {FORECAST_HOURS} h; later hours 1D"]}
