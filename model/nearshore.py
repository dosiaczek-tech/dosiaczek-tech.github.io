"""Bałtyk Surf: reproducible, nonstationary SWAN transects. See MODEL.md.

The offshore forecast is a boundary condition, not a claim that we model the
whole Baltic. Actual SWAN transport/source terms evolve spectra over the last
5 km using spatial wind forcing and measured-grid bathymetry.
"""
from __future__ import annotations

import argparse
import concurrent.futures
import hashlib
import io
import json
import math
import os
from pathlib import Path
import statistics
import subprocess
import socket
import tarfile
import tempfile
import time
from datetime import datetime, timezone

from PIL import Image
import requests
import urllib3.util.connection

# Hosted runners can advertise IPv6 even when the provider route is unusable.
# Keep TLS verification and hostname checks; only select the IPv4 transport.
urllib3.util.connection.allowed_gai_family = lambda: socket.AF_INET

ROOT = Path(__file__).resolve().parents[1]
VERSION = "BS-SWAN-1.1-coast500"
ENGINE_URL = "https://swanmodel.sourceforge.io/download/zip/SWAN-41.51-Linux.tar.gz"
ENGINE_SHA256 = "11ec02bd4106cee1e9267a648a525ec009a5c0e18c5fe57a3a1f685b90b4f894"
WAVE_MODELS = ["dwd_ewam", "ecmwf_wam"]
WIND_MODELS = ["icon_seamless", "gfs_seamless", "ecmwf_ifs025"]
LENGTH = 5000
DX = 100
DT_MINUTES = 10
SPINUP_HOURS = 12
HORIZON_HOURS = 120
MAX_SHORE_DISTANCE = 500


def finite(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def dump(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False), encoding="utf-8")
    temporary.replace(path)


def load(path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def request(url, params=None):
    for attempt in range(4):
        try:
            response = requests.get(url, params=params, timeout=(15, 90), headers={"User-Agent": "BalticSurf/1.0 (github.com/dosiaczek-tech/dosiaczek-tech.github.io)"})
            if response.status_code in (429, 500, 502, 503, 504) and attempt < 3:
                time.sleep(5 * (attempt + 1))
                continue
            response.raise_for_status()
            return response
        except requests.RequestException as error:
            print(f"Network retry {attempt + 1}/4 for {url}: {type(error).__name__}", flush=True)
            if attempt == 3:
                raise
            time.sleep(3 * (attempt + 1))


def install_engine(cache):
    executable = cache / "engine" / "SWAN-41.51-Linux" / "bin" / "swan.exe"
    if executable.exists():
        return executable.resolve()
    data = request(ENGINE_URL).content
    if hashlib.sha256(data).hexdigest() != ENGINE_SHA256:
        raise ValueError("SWAN archive checksum changed; review upstream before upgrading")
    target = cache / "engine"
    target.mkdir(parents=True, exist_ok=True)
    with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as archive:
        for member in archive.getmembers():
            if member.issym() or member.islnk() or not (member.isfile() or member.isdir()):
                raise ValueError("Unexpected archive entry")
            resolved = (target / member.name).resolve()
            if not resolved.is_relative_to(target.resolve()):
                raise ValueError("Unsafe archive path")
        archive.extractall(target)
    executable.chmod(0o755)
    return executable.resolve()


def offshore(spot, distance):
    angle, lat, lon = map(math.radians, [spot["normal"], spot["lat"], spot["lon"]])
    d = distance / 6371000
    y = math.asin(math.sin(lat) * math.cos(d) + math.cos(lat) * math.sin(d) * math.cos(angle))
    x = lon + math.atan2(math.sin(angle) * math.sin(d) * math.cos(lat), math.cos(d) - math.sin(lat) * math.sin(y))
    return math.degrees(y), math.degrees(x)


def geometry_key(spot):
    text = f'{spot["id"]}:{spot["lat"]}:{spot["lon"]}:{spot["normal"]}'
    return hashlib.sha256(text.encode()).hexdigest()[:16]


def bathymetry(spot, cache):
    path = cache / "bathymetry" / (geometry_key(spot) + "-shore-v2.json")
    old = load(path)
    if old and 0 <= time.time() - old["fetchedAt"] < 30 * 86400:
        old["shoreline"] = shoreline_reference(spot, old)
        return old
    # Raster native spacing ~1/16 arc minute. No invented fine-resolution reefs.
    distances = list(range(-1000, LENGTH + 1, DX))
    points = [offshore(spot, d) for d in distances]
    lats, lons = zip(*points)
    bbox = [min(lons) - .002, min(lats) - .002, max(lons) + .002, max(lats) + .002]
    response = request("https://ows.emodnet-bathymetry.eu/wcs", {
        "service": "WCS", "version": "1.0.0", "request": "GetCoverage", "coverage": "emodnet:mean",
        "crs": "EPSG:4326", "response_crs": "EPSG:4326", "bbox": ",".join(map(str, bbox)),
        "resx": 1 / 960, "resy": 1 / 960, "format": "GeoTIFF",
    })
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
    depth, elevation = [], []
    for lat, lon in points:
        col, row = math.floor((lon - x0) / sx), math.floor((y0 - lat) / sy)
        if not (0 <= col < image.width and 0 <= row < image.height):
            raise ValueError("Transect outside raster")
        z = image.getpixel((col, row))
        elevation.append(round(z, 4) if finite(z) and abs(z) < 1000 else None)
        depth.append(round(-z, 4) if finite(z) and -1000 < z < 0 else None)
    if depth[-1] is None:
        raise ValueError("Offshore boundary has no valid marine depth")
    # Work only on the contiguous wet branch connected to the sea. Unknown
    # inner cells are not extrapolated into a fictional beach or reef.
    wet_start = len(depth) - 1
    while wet_start > 0 and depth[wet_start - 1] is not None:
        wet_start -= 1
    wet = depth[wet_start:]
    if min(wet) > 4 or len(wet) < 10:
        if any(d is not None for d in depth[:wet_start]):
            raise ValueError("Przekrój przecina ląd, falochron lub lukę batymetrii; SWAN 1D nie rozwiązuje fali za tą przeszkodą")
        raise ValueError("No resolved nearshore zone shallower than 4 m")
    result = {"fetchedAt": int(time.time()), "source": "EMODnet DTM mean WCS", "datum": "LAT",
              "sha256": hashlib.sha256(response.content).hexdigest(), "rasterDegrees": [sx, sy],
              "distances": distances, "depth": depth, "elevation": elevation, "wetStart": wet_start,
              "quality": "regional raster; dry/unknown inner cells excluded"}
    result["shoreline"] = shoreline_reference(spot, result)
    dump(path, result)
    return result


def shoreline_reference(spot, bath):
    """Bracket the coast between a known nonnegative cell and the wet sea branch.

    All published points obey the 500 m limit even relative to the landward
    edge of this bracket. The DTM's real-world coastal uncertainty is retained.
    """
    start = bath["wetStart"]
    distances, elevation = bath.get("distances", []), bath.get("elevation", [])
    if start < 1 or len(distances) != len(bath["depth"]) or len(elevation) != len(distances):
        raise ValueError("Brak rozpoznanej linii brzegu; nie można potwierdzić strefy 0–500 m")
    if not finite(elevation[start - 1]) or elevation[start - 1] < 0:
        raise ValueError("Luka danych przy brzegu; nie można potwierdzić odległości 500 m")
    land, water = distances[start - 1], distances[start]
    if not 0 < water - land <= DX:
        raise ValueError("Nieprawidłowy przedział położenia brzegu")
    if 0 in distances and finite(bath["depth"][distances.index(0)]) and land >= 0:
        raise ValueError("Punkt spotu jest na wodzie za przeszkodą lub luką DTM; nie utożsamiamy brzegu przeszkody z plażą")
    center = (land + water) / 2
    lat, lon = offshore(spot, center)
    return {"method": "EMODnet land-water bracket", "landDistance": land, "waterDistance": water,
            "distance": center, "uncertaintyM": (water - land) / 2, "lat": lat, "lon": lon,
            "note": "Brzeg szacowany z DTM względem LAT, nie bieżący pomiar geodezyjny"}


def bulk_forecast(points, marine=False):
    result = []
    # 18 is divisible by three: each wind transect stays in one API request.
    for offset in range(0, len(points), 18):
        batch = points[offset:offset + 18]
        params = {"latitude": ",".join(str(p[0]) for p in batch), "longitude": ",".join(str(p[1]) for p in batch),
                  "past_days": 2, "forecast_days": 6, "timeformat": "unixtime", "timezone": "GMT"}
        if marine:
            params.update(hourly="wave_height,wave_direction,wave_period", models=",".join(WAVE_MODELS), cell_selection="sea")
            url = "https://marine-api.open-meteo.com/v1/marine"
        else:
            params.update(hourly="wind_speed_10m,wind_direction_10m,wind_gusts_10m,temperature_2m,is_day",
                          models=",".join(WIND_MODELS), wind_speed_unit="ms", cell_selection="nearest")
            url = "https://api.open-meteo.com/v1/forecast"
        fetched = int(time.time())
        data = request(url, params).json()
        data = data if isinstance(data, list) else [data]
        if len(data) != len(batch) or any(not d.get("hourly", {}).get("time") for d in data):
            raise ValueError("Forecast response count/shape mismatch")
        result.extend({"fetchedAt": fetched, "data": d} for d in data)
        time.sleep(.3)
    return result


def consensus(hourly, index):
    members = []
    for model in WIND_MODELS:
        def value(variable):
            data = hourly.get(f"{variable}_{model}", [])
            return data[index] if index < len(data) else None
        speed, direction, gust = value("wind_speed_10m"), value("wind_direction_10m"), value("wind_gusts_10m")
        if finite(speed) and speed >= 0 and finite(direction):
            members.append({"model": model, "speed": speed, "direction": direction, "gust": gust})
    if len(members) < 2:
        raise ValueError("At least two wind models are required for SWAN forcing")
    speed = statistics.median(m["speed"] for m in members)
    u = sum(m["speed"] * math.sin(math.radians(m["direction"])) for m in members) / len(members)
    v = sum(m["speed"] * math.cos(math.radians(m["direction"])) for m in members) / len(members)
    mean = sum(m["speed"] for m in members) / len(members)
    agreement = 1 if speed < .5 else min(1, math.hypot(u, v) / mean)
    # Same consensus as the browser; ambiguous direction is not fake calm.
    # A marked ICON-first member is used solely to make the physical run defined.
    fallback = agreement < .3
    direction = members[0]["direction"] if fallback else math.degrees(math.atan2(u, v)) % 360
    if fallback:
        speed = members[0]["speed"]
    gusts = [m["gust"] for m in members if finite(m["gust"])]
    return {"speed": round(speed, 4), "direction": round(direction, 4), "gust": statistics.median(gusts) if gusts else None,
            "agreement": round(agreement, 4), "count": len(members), "fallback": members[0]["model"] if fallback else None}


def local_direction(direction, normal):
    # Local x points toward land; local meteorological W (270°) is onshore.
    return (direction - normal + 270) % 360


def wind_components(wind, normal):
    angle = math.radians(wind["direction"] - normal)
    return wind["speed"] * math.cos(angle), -wind["speed"] * math.sin(angle)


def swan_time(timestamp):
    return datetime.fromtimestamp(timestamp, timezone.utc).strftime("%Y%m%d.%H%M%S")


def prepare_run(directory, spot, bath, marine, winds, start, end, calm_test=False):
    mh = marine["data"]["hourly"]
    indices = {t: i for i, t in enumerate(mh["time"])}
    times = list(range(start, end + 1, 3600))
    # A single consistent boundary model per run, not per-variable cherry picking.
    boundary_model = next((model for model in WAVE_MODELS if all(
        t in indices and all(finite(mh.get(f"{v}_{model}", [None] * len(mh["time"]))[indices[t]])
                            for v in ["wave_height", "wave_period", "wave_direction"])
        for t in times)), None)
    if not boundary_model:
        raise ValueError("Incomplete offshore boundary for requested horizon")
    boundary = ["TPAR"]
    for t in times:
        i = indices[t]
        height, period, direction = [mh[f"{v}_{boundary_model}"][i] for v in ["wave_height", "wave_period", "wave_direction"]]
        if height < 0 or (height > 0 and period <= 0):
            raise ValueError("Invalid boundary height/period")
        boundary.append(f"{swan_time(t)} {height:.5f} {max(period, 1):.5f} {local_direction(direction, spot['normal']):.5f} 30")
    (directory / "boundary.tpar").write_text("\n".join(boundary) + "\n")
    depths = [d if i >= bath["wetStart"] and d is not None else -1 for i, d in enumerate(bath["depth"])]
    cells = len(depths) - 1
    domain_length = cells * DX
    (directory / "bottom.dat").write_text(" ".join(map(str, reversed(depths))) + "\n")
    commands = ["PROJECT 'BalticSurf' '0001'", "MODE NONSTATIONARY ONEDIMENSIONAL",
                "SET depmin=0.05 inrhog=1 NAUTICAL", f"CGRID REGULAR 0 0 0 {domain_length} 0 {cells} 0 CIRCLE 36 0.05 1.0 31",
                f"INPGRID BOTTOM REGULAR 0 0 0 {cells} 0 {DX} 1", "READINP BOTTOM 1 'bottom.dat' 3 0 FREE",
                "BOUND SHAPESPEC JONSWAP 3.3 MEAN DSPR DEGREES", "BOUNDSPEC SIDE W CONSTANT FILE 'boundary.tpar' 1",
                "INPGRID WIND REGULAR 0 0 0 3 0 2500 1", "GEN3 KOMEN", "BREAKING CONSTANT 1.0 0.73",
                "FRICTION JONSWAP 0.038", "TRIAD", "PROP BSBT", f"CURVE 'PROFILE' 0 0 {cells} {domain_length} 0",
                f"TABLE 'PROFILE' NOHEADER 'profile.tbl' TIME XP DEPTH HSIGN TM01 TMM10 DIR QB TRANSP OUTPUT {swan_time(start)} 1 HR"]
    wind_lookup = [{t: consensus(w["data"]["hourly"], i) for i, t in enumerate(w["data"]["hourly"]["time"]) if start <= t <= end} for w in winds]
    used = []
    # Piecewise hourly forcing; incoming spectra evolve continuously between runs.
    for index, t in enumerate(times[:-1]):
        values = [lookup[t] for lookup in wind_lookup]
        components = [(0, 0) if calm_test else wind_components(w, spot["normal"]) for w in values]
        components.append(components[-1])  # Hold shoreline wind over the optional inland extension.
        name = f"wind{index:03d}.dat"
        (directory / name).write_text("\n".join(" ".join(f"{pair[axis]:.6f}" for pair in components) for axis in [0, 1]) + "\n")
        commands.extend([f"READINP WIND 1 '{name}' 3 0 FREE", f"COMPUTE NONSTAT {swan_time(t)} {DT_MINUTES} MIN {swan_time(t + 3600)}"])
        used.append({"time": t, **values[-1]})
    commands.append("STOP")
    (directory / "INPUT").write_text("\n".join(commands) + "\n")
    return boundary_model, used


def parse_output(path, spot, bath, start, end):
    by_time = {}
    for line in path.read_text().splitlines():
        if not line.strip() or line.lstrip().startswith("%"):
            continue
        parts = line.split()
        if len(parts) != 10:
            raise ValueError("Unexpected SWAN table columns")
        timestamp = int(datetime.strptime(parts[0], "%Y%m%d.%H%M%S").replace(tzinfo=timezone.utc).timestamp())
        values = list(map(float, parts[1:]))
        if not all(finite(v) for v in values):
            raise ValueError("Nonfinite SWAN output")
        by_time.setdefault(timestamp, {})[int(round(values[0]))] = values
    result = []
    coast = shoreline_reference(spot, bath)
    for timestamp in range(start, end + 1, 3600):
        if timestamp not in by_time or len(by_time[timestamp]) != len(bath["depth"]):
            raise ValueError("SWAN did not finish the full requested horizon")
        points = sorted(by_time[timestamp].values())
        valid = [p for p in points if 0 < p[1] < 1000 and 0 <= p[2] < 20 and ((p[3] > 0 and p[4] > 0) or p[2] < .001)]
        near = [p for p in valid if .3 <= p[1] <= 4 and
                0 <= LENGTH - p[0] - coast["waterDistance"] and LENGTH - p[0] - coast["landDistance"] <= MAX_SHORE_DISTANCE]
        if not near:
            raise ValueError("Brak poprawnego wyniku w strefie do 500 m od rozpoznanego brzegu")
        target = min(near, key=lambda p: (abs(p[1] - 2), -p[0]))
        breaking = next((p for p in near if p[6] >= .1), None)
        def record(p):
            distance = LENGTH - p[0]
            lat, lon = offshore(spot, distance)
            return {"height": round(p[2], 3), "period": round(p[3], 3) if p[3] > 0 else None, "energyPeriod": round(p[4], 3) if p[4] > 0 else None,
                    "direction": round((p[5] - 270 + spot["normal"]) % 360, 1) if p[5] >= 0 else None, "depth": round(p[1], 3),
                    "distance": round(distance), "shoreDistance": round(distance - coast["distance"], 1),
                    "shoreDistanceMin": round(distance - coast["waterDistance"], 1),
                    "shoreDistanceMax": round(distance - coast["landDistance"], 1), "lat": lat, "lon": lon,
                    "breakingFraction": round(p[6], 4), "energyKJm2": round(1025 * 9.81 * p[2] ** 2 / 16000, 4),
                    "powerKWm": round(math.hypot(p[7], p[8]) / 1000, 4)}
        profile = [{"distance": LENGTH - int(p[0]), "shoreDistance": round(LENGTH - p[0] - coast["distance"], 1),
                    "shoreDistanceMin": round(LENGTH - p[0] - coast["waterDistance"], 1),
                    "shoreDistanceMax": round(LENGTH - p[0] - coast["landDistance"], 1),
                    "depth": round(p[1], 3), "height": round(p[2], 3), "qb": round(p[6], 4)}
                   for p in valid if 0 <= LENGTH - p[0] - coast["waterDistance"] and LENGTH - p[0] - coast["landDistance"] <= MAX_SHORE_DISTANCE]
        result.append({"time": timestamp, **record(target), "breaking": record(breaking) if breaking else None, "profile": profile})
    return result


def simulate(spot, bath, marine, winds, executable, cache, now, hours=HORIZON_HOURS, calm_test=False):
    forecast_start = int(now // 3600) * 3600
    start = forecast_start - SPINUP_HOURS * 3600
    end = forecast_start + hours * 3600
    with tempfile.TemporaryDirectory(prefix=f"swan-{spot['id']}-", dir=cache) as temporary:
        directory = Path(temporary)
        boundary, used = prepare_run(directory, spot, bath, marine, winds, start, end, calm_test)
        run = subprocess.run([str(executable)], cwd=directory, env={**os.environ, "OMP_NUM_THREADS": "1"},
                             stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, timeout=300, text=True)
        log = (directory / "PRINT").read_text() if (directory / "PRINT").exists() else ""
        if run.returncode or "** Error" in log or "No continuation" in log or not (directory / "profile.tbl").exists():
            raise ValueError("SWAN failed: " + (run.stderr or log[-1800:]))
        hourly = parse_output(directory / "profile.tbl", spot, bath, forecast_start, end)
        history = parse_output(directory / "profile.tbl", spot, bath, start + 6 * 3600, forecast_start - 3600)
        input_hash = hashlib.sha256((directory / "INPUT").read_bytes() + (directory / "boundary.tpar").read_bytes() +
                                   (directory / "bottom.dat").read_bytes() + b"".join(p.read_bytes() for p in sorted(directory.glob("wind*.dat")))).hexdigest()
        archive_dir = cache / "reproducibility"
        archive_dir.mkdir(parents=True, exist_ok=True)
        dump(directory / "sources.json", {"spot": spot, "bathymetry": bath, "marine": marine, "wind": winds})
        with tarfile.open(archive_dir / f'{spot["id"]}.tar.gz', "w:gz") as archive:
            for file in directory.iterdir():
                if file.is_file():
                    archive.add(file, arcname=file.name)
    return {"schema": 2, "version": VERSION, "engine": "SWAN 41.51AB", "status": "ready", "generatedAt": int(time.time()),
            "shoreline": shoreline_reference(spot, bath), "maxShoreDistanceM": MAX_SHORE_DISTANCE,
            "cycle": int(now // 43200) * 43200,
            "spot": {k: spot[k] for k in ["id", "lat", "lon", "normal"]}, "geometryKey": geometry_key(spot),
            "boundaryModel": boundary, "boundaryFetchedAt": marine["fetchedAt"], "windFetchedAt": min(w["fetchedAt"] for w in winds),
            "windModels": WIND_MODELS, "windName": "BS Wind 3", "inputHash": input_hash, "engineArchiveSha256": ENGINE_SHA256,
            "sourceCommit": os.environ.get("GITHUB_SHA"),
            "grid": {"lengthM": (len(bath["depth"]) - 1) * DX, "offshoreDistanceM": LENGTH, "spacingM": DX, "timeStepMinutes": DT_MINUTES, "directions": 36, "frequencies": 32, "spinupHours": SPINUP_HOURS},
            "assumptions": ["1D transect, no harbour shadow/diffraction", "reconstructed JONSWAP boundary from mean period; spreading 30 deg", "water level 0 relative to LAT; no currents or ice", "regional DTM, not current sandbar survey"],
            "bathymetry": bath, "windUsed": used, "history": history, "hourly": hourly}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--cache", type=Path, default=ROOT / ".forecast-cache")
    parser.add_argument("--output", type=Path, default=ROOT / "dist" / "data")
    parser.add_argument("--spots", help="Comma-separated IDs; omitted means all")
    parser.add_argument("--workers", type=int, default=2)
    parser.add_argument("--hours", type=int, default=HORIZON_HOURS)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    args.cache.mkdir(parents=True, exist_ok=True)
    args.output.mkdir(parents=True, exist_ok=True)
    spots = json.loads(subprocess.check_output(["node", "-e", "console.log(JSON.stringify(require('./surf-spots.js')))"], cwd=ROOT, text=True))
    if args.spots:
        ids = set(args.spots.split(","))
        spots = [s for s in spots if s["id"] in ids]
        if len(spots) != len(ids):
            raise ValueError("Unknown spot ID")
    now = time.time()
    code_hash = hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    old = {s["id"]: load(args.cache / "results" / f'{s["id"]}.json') for s in spots}
    needed = [s for s in spots if args.force or not old[s["id"]] or old[s["id"]].get("codeHash") != code_hash or
              old[s["id"]].get("geometryKey") != geometry_key(s) or old[s["id"]].get("cycle") != int(now // 43200) * 43200 or
              old[s["id"]].get("hourly", [{}])[-1].get("time", 0) < now + max(0, args.hours - 12) * 3600]
    print(f"Fetching wind for {len(spots)} spots; {len(needed)} SWAN runs due", flush=True)
    # Three spatial nodes, ordered offshore -> shore; both the run and the
    # public table use the same BS Wind 3 algorithm and raw three-model data.
    points = [offshore(s, d) for s in spots for d in [5000, 2500, 0]]
    winds = bulk_forecast(points)
    wind_by_spot = {s["id"]: winds[i * 3:i * 3 + 3] for i, s in enumerate(spots)}
    for s in spots:
        shore = wind_by_spot[s["id"]][-1]
        dump(args.output / "wind" / f'{s["id"]}.json', {"schema": 1, "spotId": s["id"], "fetchedAt": shore["fetchedAt"] * 1000,
            "data": shore["data"], "source": "BS Wind 3 — ICON / GFS / ECMWF", "sourceType": "scheduled"})
    marine = bulk_forecast([offshore(s, 5000) for s in needed], marine=True) if needed else []
    marine_by_spot = {s["id"]: m for s, m in zip(needed, marine)}
    executable = install_engine(args.cache) if needed else None
    statuses = []

    def work(s):
        try:
            bath = bathymetry(s, args.cache)
            result = simulate(s, bath, marine_by_spot[s["id"]], wind_by_spot[s["id"]], executable, args.cache, now, args.hours)
            result["codeHash"] = code_hash
            dump(args.cache / "results" / f'{s["id"]}.json', result)
            return s["id"], result, None
        except Exception as error:
            return s["id"], old[s["id"]], str(error)

    results = dict(old)
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
        for id, result, error in pool.map(work, needed):
            results[id] = result
            statuses.append({"id": id, "error": error})
            print(f'{id}: {"OK" if not error else "FAILED " + error[:180]}', flush=True)
    errors = {s["id"]: s["error"] for s in statuses if s["error"]}
    ready = 0
    for s in spots:
        result = results[s["id"]]
        if result and result.get("schema") == 2 and result.get("geometryKey") == geometry_key(s):
            document = {**result, "lastAttemptError": errors.get(s["id"])}
            if 0 <= time.time() - result.get("generatedAt", 0) <= 18 * 3600:
                ready += 1
        else:
            document = {"schema": 2, "status": "unavailable", "spot": {"id": s["id"]}, "error": errors.get(s["id"], "Brak potwierdzonej prognozy w strefie 0–500 m")}
        dump(args.output / "nearshore" / f'{s["id"]}.json', document)
    dump(args.output / "status.json", {"generatedAt": int(time.time()), "engine": "SWAN 41.51AB", "version": VERSION,
        "spots": len(spots), "available": ready, "newRuns": len(needed), "errors": errors,
        "windScheduleHours": 3, "simulationMaxAgeHours": 12})
    print(f"Published {ready}/{len(spots)} simulations to {args.output}", flush=True)
    if not ready:
        raise SystemExit("No usable SWAN results; refusing empty publication")


if __name__ == "__main__":
    main()
