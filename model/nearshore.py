"""Bałtyk Surf: reproducible, nonstationary SWAN transects. See MODEL.md.

The offshore forecast is a boundary condition, not a claim that we model the
whole Baltic. Actual SWAN transport/source terms evolve spectra over the last
5 km using spatial wind forcing and measured-grid bathymetry.
"""
from __future__ import annotations

import argparse
from bisect import bisect_right
import concurrent.futures
import hashlib
import ipaddress
import io
import json
import math
import os
from pathlib import Path
import statistics
import subprocess
import socket
import sys
import tarfile
import tempfile
import time
from datetime import datetime, timezone
from urllib.parse import urlsplit

from PIL import Image
import requests
import urllib3.util.connection

# Hosted runners can advertise IPv6 even when the provider route is unusable.
# Keep TLS verification and hostname checks; only select the IPv4 transport.
urllib3.util.connection.allowed_gai_family = lambda: socket.AF_INET
_original_getaddrinfo = socket.getaddrinfo
_dns_overrides = {}


def resolve_address(host, port, *args, **kwargs):
    return _original_getaddrinfo(_dns_overrides.get(host, host), port, *args, **kwargs)


socket.getaddrinfo = resolve_address


def refresh_forecast_dns(url):
    """Retry unreachable forecast endpoints through a public DNS resolver.

    URL, Host header, SNI and certificate verification stay unchanged. This
    is never used for HTTP rate limits or authorization errors.
    """
    host = urlsplit(url).hostname
    if host not in {"api.open-meteo.com", "marine-api.open-meteo.com"} or host in _dns_overrides:
        return False
    try:
        response = requests.get("https://dns.google/resolve", params={"name": host, "type": "A", "edns_client_subnet": "0.0.0.0/0"}, timeout=(10, 15))
        response.raise_for_status()
        data = response.json()
        if data.get("Status") != 0:
            return False
        for answer in data.get("Answer", []):
            if answer.get("type") == 1:
                address = ipaddress.IPv4Address(answer["data"])
                if address.is_global:
                    _dns_overrides[host] = str(address)
                    print(f"Forecast DNS fallback: {host} -> {address}; TLS verification unchanged", flush=True)
                    return True
    except (requests.RequestException, ValueError, KeyError):
        pass
    return False

ROOT = Path(__file__).resolve().parents[1]
VERSION = "BS-SWAN-1.4-waves-sealevel"
ENGINE_URL = "https://swanmodel.sourceforge.io/download/zip/SWAN-41.51-Linux.tar.gz"
ENGINE_SHA256 = "11ec02bd4106cee1e9267a648a525ec009a5c0e18c5fe57a3a1f685b90b4f894"
# Offshore wave models for the SWAN boundary, in order of preference when two remain or several tie
# (see boundary_models). Open-Meteo serves the first, third and fourth; DMI's open data API serves its WAM.
WAVE_MODELS = ["ecmwf_wam", "dmi_wam_nsb", "dwd_ewam", "ncep_gfswave025"]
MARINE_MODELS = ["dwd_ewam", "ecmwf_wam", "ncep_gfswave025"]
# DMI open data (CC BY 4.0, no key): WAM NSB waves (~5 km, ~5.5 days) and the DKSS NSBS storm surge model (~5 days).
DMI_API = "https://opendataapi.dmi.dk/v1/forecastedr/collections"
# DMI's WAM in three requests (the whole coast with every parameter at once is too large for the service): the total
# wave, then swell and wind sea apart.
DMI_WAVE_GROUPS = [
    {"significant-wave-height": "wave_height_dmi_wam_nsb", "mean-wave-period": "wave_period_dmi_wam_nsb", "mean-wave-dir": "wave_direction_dmi_wam_nsb"},
    {"significant-totalswell-height": "swell_wave_height_dmi_wam_nsb", "mean-totalswell-period": "swell_wave_period_dmi_wam_nsb",
     "mean-totalswell-dir": "swell_wave_direction_dmi_wam_nsb"},
    {"significant-windwave-height": "wind_wave_height_dmi_wam_nsb", "mean-windwave-period": "wind_wave_period_dmi_wam_nsb",
     "mean-windwave-dir": "wind_wave_direction_dmi_wam_nsb"}]
DMI_WAVES = {parameter: key for group in DMI_WAVE_GROUPS for parameter, key in group.items()}
SEA_LEVEL = "sea_level_dmi_dkss_nsbs"
# Sea ice from the same DKSS runs (0-1); SWAN ignores ice, the app warns about it and holds the rating down.
ICE = "ice_dmi_dkss_nsbs"
# A grid cell farther than this from the boundary point does not represent it.
DMI_CELL_RADIUS = 10000
# Wave models agree when, leaving out the one farthest from the central model, every other one differs from it by at most
# the larger of these heights and, for waves of 0.3 m or more, by at most this angle.
AGREE_HEIGHT = .5
AGREE_HEIGHT_SHARE = .3
AGREE_DIRECTION = 45
# Changing the boundary model costs as much as an hour on a model 0.25 m, 1 s or 30° farther from the others.
SWITCH_COST = 1
# The boundary spectrum: the solver's 32 frequencies (0.05-1 Hz) and 36 directions. A model that gives swell and
# wind sea apart (DMI WAM, DWD EWAM, GFS Wave) enters as two JONSWAP peaks; one without (ECMWF WAM) as one.
SPECTRUM_FREQUENCIES = [0.05 * 20 ** (i / 31) for i in range(32)]
SPECTRUM_DIRECTIONS = list(range(0, 360, 10))
# JONSWAP (gamma 3.3) on this grid: the mean period Tm01 is 0.84 of the peak period.
MEAN_TO_PEAK = .84
SEA_SPREAD, SWELL_SPREAD = 30, 20
# BS Wind 8: seven global models and the regional DMI HARMONIE (about 2 km, first ~2 days).
# ICON stays first: it is the marked substitute when the directions conflict.
WIND_MODELS = ["icon_seamless", "gfs_seamless", "ecmwf_ifs025", "ecmwf_aifs025_single", "ukmo_seamless", "jma_seamless", "gem_seamless",
               "dmi_harmonie_arome_europe"]
# Open-Meteo counts every location of a request, and more than 10 variables or 14 days as several calls.
# Requests are spaced to stay well below the free limit of 600 calls per minute.
CALLS_PER_MINUTE = 400
LENGTH = 5000
DX = 100
COMPUTE_DX = 50
DT_MINUTES = 10
SPINUP_HOURS = 12
HISTORY_HOURS = 24
HORIZON_HOURS = 336
# The 0-500 m cross-section is published for the whole forecast.
PROFILE_HOURS = HORIZON_HOURS
MAX_SHORE_DISTANCE = 500
# SWAN accepts at most 300 COMPUTE commands per run and we issue one per hour of
# forcing. Longer horizons run in consecutive parts joined by a binary hotfile.
CHUNK_HOURS = 240
SUMMARY_DEPTH = 2


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


def archived_inputs(spot, cache, now):
    """Reuse real input forecasts for at most six hours, preserving source dates."""
    path = cache / "reproducibility" / f'{spot["id"]}.tar.gz'
    try:
        with tarfile.open(path, "r:gz") as archive:
            stream = archive.extractfile("sources.json")
            if stream is None:
                return None
            data = json.load(stream)
        if geometry_key(data["spot"]) != geometry_key(spot) or len(data["wind"]) != 3:
            return None
        for bundle in [data["marine"], *data["wind"]]:
            if not finite(bundle.get("fetchedAt")) or not 0 <= now - bundle["fetchedAt"] <= 6 * 3600:
                return None
            if not bundle.get("data", {}).get("hourly", {}).get("time"):
                return None
        return data
    except (OSError, ValueError, KeyError, TypeError, tarfile.TarError):
        return None


def request(url, params=None, session=None):
    # A session sends the next request over the connection already opened to the same host.
    get = session.get if session is not None else requests.get
    for attempt in range(4):
        try:
            response = get(url, params=params, timeout=(15, 90), headers={"User-Agent": "BalticSurf/1.0 (github.com/dosiaczek-tech/dosiaczek-tech.github.io)"})
            if response.status_code in (429, 500, 502, 503, 504) and attempt < 3:
                time.sleep(5 * (attempt + 1))
                continue
            response.raise_for_status()
            return response
        except requests.RequestException as error:
            status = error.response.status_code if error.response is not None else None
            print(f"Network retry {attempt + 1}/4 for {url}: {type(error).__name__}, HTTP {status}", flush=True)
            if attempt == 3:
                raise
            if isinstance(error, (requests.ConnectionError, requests.Timeout)) and not isinstance(error, requests.exceptions.SSLError) and refresh_forecast_dns(url):
                continue
            time.sleep(3 * (attempt + 1))


def install_engine(cache):
    executable = cache / "engine" / "SWAN-41.51-Linux" / "bin" / "swan.exe"
    if executable.exists():
        return configure_engine(executable)
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
    return configure_engine(executable)


def configure_engine(executable):
    # NixOS supplies the loader/libraries through shell.nix; solver code and inputs stay unchanged.
    linker = os.environ.get("SWAN_DYNAMIC_LINKER")
    libraries = os.environ.get("SWAN_LIBRARY_PATH")
    if linker and libraries:
        subprocess.run(["patchelf", "--set-interpreter", linker, "--set-rpath", libraries, str(executable)], check=True)
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


def api_calls(params):
    """Open-Meteo calls of one request: per location, more than 10 variables or 14 days count as several."""
    locations = len(params["latitude"].split(","))
    variables = len(params["hourly"].split(",")) * len(params["models"].split(","))
    days = params.get("past_days", 0) + params.get("forecast_days", 7)
    return locations * max(1, variables / 10) * max(1, days / 14)


def bulk_forecast(points, marine=False, cache=None):
    result = []
    rate_limited = False
    # One connection for every batch of this download. On hosted runners a new TLS handshake with the
    # provider can stall for 15 s before a retry succeeds; the open connection spares later batches that.
    session = requests.Session()
    try:
        # 18 is divisible by three: each wind transect stays in one API request.
        for offset in range(0, len(points), 18):
            batch = points[offset:offset + 18]
            params = {"latitude": ",".join(str(p[0]) for p in batch), "longitude": ",".join(str(p[1]) for p in batch),
                      "past_days": 2, "forecast_days": 16, "timeformat": "unixtime", "timezone": "GMT"}
            if marine:
                params.update(hourly="wave_height,wave_direction,wave_period,swell_wave_height,swell_wave_period,swell_wave_direction,"
                              "wind_wave_height,wind_wave_period,wind_wave_direction", models=",".join(MARINE_MODELS), cell_selection="sea")
                url = "https://marine-api.open-meteo.com/v1/marine"
            else:
                params.update(hourly="wind_speed_10m,wind_direction_10m,wind_gusts_10m,is_day",
                              models=",".join(WIND_MODELS), wind_speed_unit="ms", cell_selection="nearest")
                url = "https://api.open-meteo.com/v1/forecast"
            # Persist each completed batch independently. A later failed request must
            # not discard wind already downloaded for other beaches.
            key = hashlib.sha256(json.dumps([url, params], sort_keys=True).encode()).hexdigest()
            path = cache / "inputs" / f"{key}.json" if cache else None
            fetched = int(time.time())
            old = load(path) if path else None
            valid_cache = isinstance(old, list) and len(old) == len(batch) and all(
                isinstance(b, dict) and finite(b.get("fetchedAt")) and 0 <= fetched - b["fetchedAt"] <= 6 * 3600
                and b.get("data", {}).get("hourly", {}).get("time") for b in old)
            # Hourly scheduler checks do not multiply the provider's request load.
            # The original retrieval timestamps remain visible to every client.
            if valid_cache and all(fetched - b["fetchedAt"] < 3 * 3600 for b in old):
                result.extend(old)
                continue
            try:
                if rate_limited:
                    raise ValueError("Provider rate limit; no additional requests in this run")
                data = request(url, params, session).json()
                data = data if isinstance(data, list) else [data]
                if len(data) != len(batch) or any(not d.get("hourly", {}).get("time") for d in data):
                    raise ValueError("Forecast response count/shape mismatch")
                bundles = [{"fetchedAt": fetched, "data": d} for d in data]
                if path:
                    dump(path, bundles)
            except (requests.RequestException, ValueError) as error:
                if path is None:
                    raise
                if isinstance(error, requests.HTTPError) and error.response is not None and error.response.status_code == 429:
                    rate_limited = True
                bundles = [{**b, "reusedInputs": True} for b in old] if valid_cache else [None] * len(batch)
                print(f"Forecast batch {offset // 18 + 1}: {'retained original inputs' if valid_cache else 'unavailable'} ({type(error).__name__})", flush=True)
            result.extend(bundles)
            if offset + 18 < len(points):
                time.sleep(max(.3, api_calls(params) * 60 / CALLS_PER_MINUTE))
    finally:
        session.close()
    return result


def coverage_axis(axis):
    if "values" in axis:
        return list(axis["values"])
    count = axis["num"]
    return [axis["start"] + k * (axis["stop"] - axis["start"]) / (count - 1) for k in range(count)] if count > 1 else [axis["start"]]


def coverage_points(coverage, points, names):
    """Hourly series of the nearest grid cell with data to every point, like Open-Meteo's cell_selection=sea.

    names maps DMI parameters to our keys. A point without such a cell within DMI_CELL_RADIUS gets None.
    """
    axes = coverage["domain"]["axes"]
    times = [int(datetime.fromisoformat(t.replace("Z", "+00:00")).timestamp()) for t in axes["t"]["values"]]
    xs, ys = coverage_axis(axes["x"]), coverage_axis(axes["y"])
    cells = len(xs) * len(ys)
    # The first parameter is required; the others (e.g. swell apart from the total) only if the service sent them.
    first_parameter = next(iter(names))
    ranges = {key: coverage["ranges"][parameter] for parameter, key in names.items() if parameter == first_parameter or parameter in coverage["ranges"]}
    for grid in ranges.values():
        if grid.get("axisNames") != ["t", "y", "x"] or grid.get("shape") != [len(times), len(ys), len(xs)] or len(grid["values"]) != len(times) * cells:
            raise ValueError("Unexpected DMI grid layout")
    # Land cells have no values; a sea cell has the first parameter (the total) in the first hour. A part such as
    # swell may be missing where there is none.
    first = ranges[names[first_parameter]]
    sea = [cell for cell in range(cells) if finite(first["values"][cell])]
    result = []
    for lat, lon in points:
        def distance(cell):
            y, x = ys[cell // len(xs)], xs[cell % len(xs)]
            return math.hypot((x - lon) * 111320 * math.cos(math.radians(lat)), (y - lat) * 110570)
        nearest = min(sea, key=distance, default=None)
        if nearest is None or distance(nearest) > DMI_CELL_RADIUS:
            result.append(None)
            continue
        result.append({"time": times, **{key: [value if finite(value) else None for value in grid["values"][nearest::cells]]
                                          for key, grid in ranges.items()}})
    return result


def dmi_cube(session, collection, parameters, bbox, run=None):
    url = f"{DMI_API}/{collection}" + (f"/instances/{run}" if run else "") + "/cube"
    return request(url, {"bbox": ",".join(f"{v:.4f}" for v in bbox), "parameter-name": ",".join(parameters),
                         "crs": "crs84", "f": "CoverageJSON"}, session).json()


def dmi_forecast(points):
    """DMI WAM NSB waves and DKSS NSBS sea level at the boundary points: one coast-wide request per model run.

    The sea level joins the latest run with the oldest one DMI still keeps, which covers the past day of history.
    A failed source is left out (waves from the other models, constant sea level as before), never invented.
    """
    result = [{"fetchedAt": int(time.time())} for _ in points]
    warnings = []
    if not points:
        return result, warnings
    lats, lons = zip(*points)
    bbox = [min(lons) - .2, min(lats) - .2, max(lons) + .2, max(lats) + .2]
    session = requests.Session()
    try:
        try:
            totals, *parts = DMI_WAVE_GROUPS
            for entry, series in zip(result, coverage_points(dmi_cube(session, "wam_nsb", list(totals), bbox), points, totals)):
                entry["waves"] = series
            for group in parts:
                try:
                    grids = coverage_points(dmi_cube(session, "wam_nsb", list(group), bbox), points, group)
                except (requests.RequestException, ValueError, KeyError, TypeError, IndexError) as error:
                    # Without the parts the wave enters SWAN as one peak.
                    warnings.append(f"DMI WAM {next(iter(group.values())).split('_')[0]} download failed: {type(error).__name__}")
                    continue
                for entry, series in zip(result, grids):
                    if entry.get("waves") and series:
                        index = {t: i for i, t in enumerate(series["time"])}
                        for key in group.values():
                            entry["waves"][key] = [series[key][index[t]] if t in index else None for t in entry["waves"]["time"]]
        except (requests.RequestException, ValueError, KeyError, TypeError, IndexError) as error:
            warnings.append(f"DMI WAM download failed: {type(error).__name__}")
        try:
            runs = sorted(run["id"] for run in request(f"{DMI_API}/dkss_nsbs/instances", None, session).json()["instances"])
            for run in dict.fromkeys([runs[-1], runs[0]]):
                try:
                    grids = coverage_points(dmi_cube(session, "dkss_nsbs", ["sea-mean-deviation", "ice-concentration"], bbox, run), points,
                                            {"sea-mean-deviation": SEA_LEVEL, "ice-concentration": ICE})
                except (requests.RequestException, ValueError, KeyError, TypeError, IndexError) as error:
                    # Without the latest run there is no sea level; an older run only adds the past day.
                    warnings.append(f"DMI DKSS run {run} download failed: {type(error).__name__}")
                    if run == runs[-1]:
                        break
                    continue
                for entry, series in zip(result, grids):
                    if series:
                        for key, name in (("seaLevel", SEA_LEVEL), ("ice", ICE)):
                            values = entry.setdefault(key, {})
                            for t, value in zip(series["time"], series[name]):
                                if value is not None:
                                    values.setdefault(t, value)
        except (requests.RequestException, ValueError, KeyError, TypeError, IndexError) as error:
            warnings.append(f"DMI DKSS download failed: {type(error).__name__}")
    finally:
        session.close()
    for warning in warnings:
        print(warning + "; the other sources are used", flush=True)
    return result, warnings


def merge_dmi(bundle, extra):
    """Add the DMI series to an Open-Meteo marine bundle, hour by hour on its time axis."""
    if not bundle or not extra or not (extra.get("waves") or extra.get("seaLevel")):
        return bundle
    hourly = dict(bundle["data"]["hourly"])
    if extra.get("waves"):
        index = {t: i for i, t in enumerate(extra["waves"]["time"])}
        for key in DMI_WAVES.values():
            if key in extra["waves"]:
                hourly[key] = [extra["waves"][key][index[t]] if t in index else None for t in hourly["time"]]
    if extra.get("seaLevel"):
        hourly[SEA_LEVEL] = [extra["seaLevel"].get(t) for t in hourly["time"]]
    if extra.get("ice"):
        hourly[ICE] = [extra["ice"].get(t) for t in hourly["time"]]
    return {**bundle, "data": {**bundle["data"], "hourly": hourly}, "dmiFetchedAt": extra["fetchedAt"]}


def direction_difference(a, b):
    return abs((a - b + 540) % 360 - 180)


def wave_members(hourly, index):
    members = []
    for model in WAVE_MODELS:
        values = []
        for variable in ("wave_height", "wave_period", "wave_direction"):
            series = hourly.get(f"{variable}_{model}") or []
            values.append(series[index] if index < len(series) else None)
        height, period, direction = values
        if all(finite(v) for v in values) and height >= 0 and (height == 0 or period > 0):
            member = {"model": model, "height": height, "period": period, "direction": direction % 360}
            parts = [wave_part(hourly, name, model, index) for name in ("swell_wave", "wind_wave")]
            if all(parts) and parts[0]["height"] + parts[1]["height"] > 0:
                member["swell"], member["sea"] = parts
            members.append(member)
    return members


def wave_part(hourly, name, model, index):
    """Swell or wind sea of a model, if it gives them apart."""
    values = []
    for variable in ("height", "period", "direction"):
        series = hourly.get(f"{name}_{variable}_{model}") or []
        values.append(series[index] if index < len(series) else None)
    height, period, direction = values
    if finite(height) and height == 0:
        return {"height": 0, "period": 1, "direction": 0}
    if all(finite(v) for v in values) and height > 0 and period > 0:
        return {"height": height, "period": period, "direction": direction % 360}
    return None


def offshore_heights(members):
    """Every wave model's height offshore, in WAVE_MODELS order (None where it has none): the app spreads the forecast
    between them."""
    by_model = {m["model"]: m["height"] for m in members}
    return [round(by_model[model], 2) if model in by_model else None for model in WAVE_MODELS]


def swell_share(member):
    """The swell's share of the wave energy, for a member that tells swell and wind sea apart."""
    swell, sea = member["swell"]["height"] ** 2, member["sea"]["height"] ** 2
    return swell / (swell + sea)


def jonswap(height, peak):
    """JONSWAP (gamma 3.3) variance density on SPECTRUM_FREQUENCIES, scaled to the variance height²/16."""
    fp = 1 / peak
    shape = [f ** -5 * math.exp(-1.25 * (fp / f) ** 4) * 3.3 ** math.exp(-((f - fp) ** 2) / (2 * (.07 if f <= fp else .09) ** 2 * fp ** 2))
             for f in SPECTRUM_FREQUENCIES]
    f = SPECTRUM_FREQUENCIES
    variance = sum((shape[i] + shape[i + 1]) / 2 * (f[i + 1] - f[i]) for i in range(len(f) - 1))
    return [value * height ** 2 / 16 / variance for value in shape]


def spreading(direction, spread):
    """cos^m around the direction, with the directional spread (degrees) as SWAN's DSPR; per degree."""
    power = 2 / math.radians(spread) ** 2 - 1
    weights = [math.cos(math.radians(direction_difference(d, direction))) ** power if direction_difference(d, direction) < 90 else 0
               for d in SPECTRUM_DIRECTIONS]
    total = sum(weights) * (SPECTRUM_DIRECTIONS[1] - SPECTRUM_DIRECTIONS[0])
    return [w / total for w in weights]


def boundary_spectrum(member, normal):
    """The hour's 2D spectrum (m²/Hz/degree) in the transect's local nautical directions: swell and wind sea as two
    peaks when the model gives them, scaled together to its total height; otherwise one peak."""
    parts = [(member, SEA_SPREAD)]
    if member.get("swell"):
        swell, sea = member["swell"], member["sea"]
        scale = member["height"] / math.hypot(swell["height"], sea["height"])
        parts = [({**swell, "height": swell["height"] * scale}, SWELL_SPREAD), ({**sea, "height": sea["height"] * scale}, SEA_SPREAD)]
    spectrum = [[0.0] * len(SPECTRUM_DIRECTIONS) for _ in SPECTRUM_FREQUENCIES]
    for part, spread in parts:
        if part["height"] <= 0:
            continue
        density = jonswap(part["height"], max(part["period"], 1) / MEAN_TO_PEAK)
        weights = spreading(local_direction(part["direction"], normal), spread)
        for i, value in enumerate(density):
            for j, weight in enumerate(weights):
                spectrum[i][j] += value * weight
    return spectrum


def write_spectra(path, times, spectra):
    """SWAN's standard 2D spectral file: one location, the spectrum of every hour."""
    lines = ["SWAN   1", "$ Baltic Surf boundary: the chosen wave model, swell and wind sea", "TIME", "     1", "LOCATIONS", "     1",
             "       0.0000       0.0000", "AFREQ", f"    {len(SPECTRUM_FREQUENCIES)}", *[f"    {f:.6f}" for f in SPECTRUM_FREQUENCIES],
             "NDIR", f"    {len(SPECTRUM_DIRECTIONS)}", *[f"    {d:.4f}" for d in SPECTRUM_DIRECTIONS],
             "QUANT", "     1", "VaDens", "m2/Hz/degr", "   -0.9900E+02"]
    for t, spectrum in zip(times, spectra):
        lines.append(swan_time(t))
        peak = max(max(row) for row in spectrum)
        if peak <= 0:
            lines.append("ZERO")
            continue
        factor = peak / 99999
        lines += ["FACTOR", f"   {factor:.8E}"]
        lines += [" ".join(f"{round(value / factor):6d}" for value in row) for row in spectrum]
    path.write_text("\n".join(lines) + "\n")


def wave_distance(members):
    """How different two models' waves are: 0.25 m (or a quarter of the typical height), 1 s or 30° each count 1."""
    scale = max(.25, .25 * statistics.median(m["height"] for m in members))
    return lambda a, b: abs(a["height"] - b["height"]) / scale + abs(a["period"] - b["period"]) + direction_difference(a["direction"], b["direction"]) / 30


def central_model(members):
    """With three or more models the one most similar to all the others; with fewer the first in WAVE_MODELS."""
    if len(members) < 3:
        return members[0]
    distance = wave_distance(members)
    return min(members, key=lambda m: sum(distance(m, other) for other in members))


def models_agree(members):
    """Leaving out the model farthest from the central one when there are three or more, the others differ from it
    by at most AGREE_HEIGHT (or AGREE_HEIGHT_SHARE of its height) and, for waves of 0.3 m or more, AGREE_DIRECTION."""
    center, distance = central_model(members), wave_distance(members)
    others = sorted((m for m in members if m is not center), key=lambda m: distance(center, m))
    if len(members) >= 3:
        others.pop()
    return all(abs(m["height"] - center["height"]) <= max(AGREE_HEIGHT, AGREE_HEIGHT_SHARE * center["height"]) and
               (min(m["height"], center["height"]) < .3 or direction_difference(m["direction"], center["direction"]) <= AGREE_DIRECTION)
               for m in others)


def boundary_models(hours):
    """The wave model of every hour for the SWAN boundary; its height, period and direction always go together.

    The model should be as close to the others as possible, so one that disagrees with the rest - like GFS Wave's
    25 km cell over the Hel peninsula - is left out, but it should not jump between models from hour to hour.
    Each hour costs a model its distance to the others beyond the central model's; with fewer than three models only
    the first in WAVE_MODELS may be used. A change costs SWITCH_COST plus the difference between the two models'
    waves. The cheapest sequence keeps a model while it stays close to the others and changes it when both give
    similar waves, also ahead of an hour when the model in use ends.
    """
    steps, previous_hour = [], None
    for members in hours:
        distance = wave_distance(members)
        if len(members) >= 3:
            spread = {m["model"]: sum(distance(m, other) for other in members) / (len(members) - 1) for m in members}
        else:
            spread = {m["model"]: 0 if rank == 0 else math.inf for rank, m in enumerate(members)}
        lowest = min(spread.values())
        step = {}
        for m in members:
            if previous_hour is None:
                step[m["model"]] = (spread[m["model"]] - lowest, None)
                continue
            options = [(cost + (0 if model == m["model"] else SWITCH_COST + distance(previous_hour[model], m)), model)
                       for model, (cost, _) in steps[-1].items()]
            cost, came_from = min(options, key=lambda option: option[0])
            step[m["model"]] = (cost + spread[m["model"]] - lowest, came_from)
        steps.append(step)
        previous_hour = {m["model"]: m for m in members}
    model = min(steps[-1], key=lambda name: steps[-1][name][0])
    chosen = []
    for members, step in zip(reversed(hours), reversed(steps)):
        chosen.append(next(m for m in members if m["model"] == model))
        model = step[model][1]
    return chosen[::-1]


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


def calculation_grid(spot, bath):
    """Align solver nodes with the estimated coast: 0, 50, ... 500 m.

    Only bathymetry is linearly resampled; wave heights come from SWAN at
    those nodes. The zero-depth land boundary is not a wet-wave observation.
    """
    coast = shoreline_reference(spot, bath)
    length = LENGTH - coast["distance"]
    cells = round(length / COMPUTE_DX)
    if abs(cells * COMPUTE_DX - length) > .001 or length < MAX_SHORE_DISTANCE:
        raise ValueError("Cannot align the SWAN grid with the coast")
    anchors = [(coast["distance"], 0.0)] + list(zip(bath["distances"][bath["wetStart"]:], bath["depth"][bath["wetStart"]:]))
    coordinates = [p[0] for p in anchors]
    distances, depths = [], []
    for i in range(cells + 1):
        d = coast["distance"] + i * COMPUTE_DX
        j = min(max(1, bisect_right(coordinates, d)), len(anchors) - 1)
        (left, a), (right, b) = anchors[j - 1], anchors[j]
        if not finite(a) or not finite(b) or not left <= d <= right:
            raise ValueError("Cannot interpolate missing bathymetry")
        depths.append(a + (b - a) * (d - left) / (right - left))
        distances.append(d)
    return coast, distances, depths


def prepare_run(directory, spot, bath, marine, winds, start, end, calm_test=False):
    mh = marine["data"]["hourly"]
    indices = {t: i for i, t in enumerate(mh["time"])}
    times = list(range(start, end + 1, 3600))
    levels_series, ice_series = mh.get(SEA_LEVEL) or [], mh.get(ICE) or []
    # Every hour one wave model (see boundary_models), never one model's height with another's period.
    hours = [wave_members(mh, indices[t]) if t in indices else [] for t in times]
    if not all(hours):
        raise ValueError("Incomplete offshore boundary for requested horizon")
    spectra, choices, levels, ice = [], {}, {}, {}
    for t, members, chosen in zip(times, hours, boundary_models(hours)):
        i = indices[t]
        level = levels_series[i] if i < len(levels_series) and finite(levels_series[i]) else None
        # The swell's share of the energy offshore: from the chosen model if it tells swell and wind sea apart, else
        # the median of the models that do. The chosen model's spectrum then stays one peak, unmixed with theirs.
        shares = [swell_share(m) for m in ([chosen] if chosen.get("swell") else members) if m.get("swell")]
        swell = statistics.median(shares) if shares else None
        choices[t] = {"model": chosen["model"], "models": len(members), "agree": models_agree(members),
                      **({"swell": round(swell, 2)} if swell is not None else {}), "heights": offshore_heights(members)}
        levels[t] = None if level is None else round(level, 3)
        ice[t] = round(ice_series[i], 2) if i < len(ice_series) and finite(ice_series[i]) else None
        spectra.append(boundary_spectrum(chosen, spot["normal"]))
    write_spectra(directory / "boundary.sp2", times, spectra)
    _, _, depths = calculation_grid(spot, bath)
    cells = len(depths) - 1
    domain_length = cells * COMPUTE_DX
    (directory / "bottom.dat").write_text(" ".join(map(str, reversed(depths))) + "\n")
    # The DKSS sea level raises or lowers the water over the whole transect; hours without it keep level 0 as before.
    with_level = any(level is not None for level in levels.values())
    header = ["PROJECT 'BalticSurf' '0001'", "MODE NONSTATIONARY ONEDIMENSIONAL",
                "SET depmin=0.05 inrhog=1 NAUTICAL", f"CGRID REGULAR 0 0 0 {domain_length} 0 {cells} 0 CIRCLE 36 0.05 1.0 31",
                f"INPGRID BOTTOM REGULAR 0 0 0 {cells} 0 {COMPUTE_DX} 1", "READINP BOTTOM 1 'bottom.dat' 3 0 FREE",
                "BOUNDSPEC SIDE W CONSTANT FILE 'boundary.sp2' 1",
                "INPGRID WIND REGULAR 0 0 0 3 0 2500 1", *([f"INPGRID WLEVEL REGULAR 0 0 0 1 0 {domain_length} 1"] if with_level else []),
                "GEN3 KOMEN", "BREAKING CONSTANT 1.0 0.73",
                "FRICTION JONSWAP 0.038", "TRIAD", "PROP BSBT", f"CURVE 'PROFILE' 0 0 {cells} {domain_length} 0"]
    wind_lookup = [{t: consensus(w["data"]["hourly"], i) for i, t in enumerate(w["data"]["hourly"]["time"]) if start <= t <= end} for w in winds]
    used, steps = [], []
    # Piecewise hourly forcing; incoming spectra evolve continuously between runs.
    for index, t in enumerate(times[:-1]):
        values = [lookup[t] for lookup in wind_lookup]
        components = [(0, 0) if calm_test else wind_components(w, spot["normal"]) for w in values]
        components.append(components[-1])  # Hold shoreline wind over the optional inland extension.
        name = f"wind{index:03d}.dat"
        (directory / name).write_text("\n".join(" ".join(f"{pair[axis]:.6f}" for pair in components) for axis in [0, 1]) + "\n")
        step = [f"READINP WIND 1 '{name}' 3 0 FREE"]
        if with_level:
            # SWAN reports the hour that ends a step with that step's water: give each step the level of its end,
            # so the depth of every published hour is that hour's sea level.
            level = levels[t + 3600] or 0
            level_name = f"level{index:03d}.dat"
            (directory / level_name).write_text(f"{level:.3f} {level:.3f}\n")
            step.append(f"READINP WLEVEL 1 '{level_name}' 3 0 FREE")
        steps.append([*step, f"COMPUTE NONSTAT {swan_time(t)} {DT_MINUTES} MIN {swan_time(t + 3600)}"])
        used.append({"time": t, **values[-1]})
    chunks = []
    for number, first in enumerate(range(0, len(steps), CHUNK_HOURS)):
        part = steps[first:first + CHUNK_HOURS]
        last = first + len(part) >= len(steps)
        commands = header + ([f"INIT HOTSTART SINGLE 'hot{number - 1}' UNFORMATTED"] if number else []) + [
            f"TABLE 'PROFILE' NOHEADER 'profile.{number}.tbl' TIME XP DEPTH HSIGN TM01 TMM10 DIR QB TRANSP TPS OUTPUT {swan_time(times[first])} 1 HR"]
        commands += [command for step in part for command in step]
        commands += ([] if last else [f"HOTFILE 'hot{number}' UNFORMATTED"]) + ["STOP"]
        chunks.append({"input": "\n".join(commands) + "\n", "table": f"profile.{number}.tbl", "start": times[first]})
    # The archived INPUT holds every part in order, so the forcing hash covers the whole run.
    (directory / "INPUT").write_text("".join(chunk["input"] for chunk in chunks))
    return {"choices": choices, "levels": levels, "ice": ice}, used, chunks


def run_chunks(directory, executable, chunks):
    """Run each SWAN part in turn and join the tables into profile.tbl.
    A continued part repeats its first hour from the hotfile before boundary
    forcing is applied, so that hour is taken from the previous part."""
    merged = []
    for number, chunk in enumerate(chunks):
        (directory / "INPUT").write_text(chunk["input"])
        run = subprocess.run([str(executable)], cwd=directory, env={**os.environ, "OMP_NUM_THREADS": "1"},
                             stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, timeout=600, text=True)
        log = (directory / "PRINT").read_text() if (directory / "PRINT").exists() else ""
        if run.returncode or "** Error" in log or "No continuation" in log or not (directory / chunk["table"]).exists():
            raise ValueError("SWAN failed: " + (run.stderr or log[-1800:]))
        first = swan_time(chunk["start"])
        merged += [line for line in (directory / chunk["table"]).read_text().splitlines()
                   if line.strip() and not (number and line.split()[0] == first)]
    (directory / "profile.tbl").write_text("\n".join(merged) + "\n")
    (directory / "INPUT").write_text("".join(chunk["input"] for chunk in chunks))
    # Intermediate parts are fully represented by INPUT and profile.tbl in the archive.
    for number, chunk in enumerate(chunks):
        (directory / chunk["table"]).unlink(missing_ok=True)
        (directory / f"hot{number}").unlink(missing_ok=True)


def summary_location(coast, distances, depths):
    """Choose a fixed shallow-water node on the sea-facing part of the profile.

    Stop at the first <=2 m node when travelling landwards within the confirmed
    500 m zone. Searching beyond that contour can pick a sheltered trough behind
    a sandbar merely because its depth is a few centimetres closer to 2 m.
    Use bathymetry, never the largest wave or best score; calm/missing output must
    not move the point. Equal depths favour the seaward node. If the whole zone
    is deeper than 2 m, keep the closest admissible depth within the same limit.
    """
    candidates = []
    for distance, depth in reversed(list(zip(distances, depths))):
        if not (coast["waterDistance"] <= distance <= coast["landDistance"] + MAX_SHORE_DISTANCE):
            continue
        if .3 <= depth <= 4:
            candidates.append((distance, depth))
        if depth <= SUMMARY_DEPTH:
            break
    if not candidates:
        raise ValueError("Brak poprawnego punktu od strony morza w strefie do 500 m od rozpoznanego brzegu")
    return min(candidates, key=lambda p: (round(abs(p[1] - SUMMARY_DEPTH), 6), -p[0]))[0]


def parse_output(path, spot, bath, start, end, levels=None, choices=None, ice=None):
    """levels: the sea level of every hour (None = 0); choices: the hour's boundary wave model and ice: the sea ice
    off the beach (0-1), both for the record."""
    by_time = {}
    for line in path.read_text().splitlines():
        if not line.strip() or line.lstrip().startswith("%"):
            continue
        parts = line.split()
        # 11 columns with the peak period; tables written before it have 10.
        if len(parts) not in (10, 11):
            raise ValueError("Unexpected SWAN table columns")
        timestamp = int(datetime.strptime(parts[0], "%Y%m%d.%H%M%S").replace(tzinfo=timezone.utc).timestamp())
        values = list(map(float, parts[1:]))
        if not all(finite(v) for v in values):
            raise ValueError("Nonfinite SWAN output")
        by_time.setdefault(timestamp, {})[int(round(values[0]))] = values
    result = []
    coast, grid_distances, grid_depths = calculation_grid(spot, bath)
    domain_length = (len(grid_distances) - 1) * COMPUTE_DX
    if any(timestamp not in by_time or len(by_time[timestamp]) != len(grid_distances)
           for timestamp in range(start, end + 1, 3600)):
        raise ValueError("SWAN did not finish the full requested horizon")
    target_distance = summary_location(coast, grid_distances, grid_depths)
    target_x = round(LENGTH - target_distance)
    for timestamp in range(start, end + 1, 3600):
        level = (levels or {}).get(timestamp) or 0
        points = sorted(by_time[timestamp].values())
        valid = [p for p in points if 0 < p[1] < 1000 and 0 <= p[2] < 20 and ((p[3] > 0 and p[4] > 0) or p[2] < .001)]
        target = next((p for p in valid if round(p[0]) == target_x), None)
        breaking = next((p for p in valid if .3 <= p[1] <= 4 and
                         0 < LENGTH - p[0] - coast["distance"] <= MAX_SHORE_DISTANCE and p[6] >= .1), None)
        def record(p):
            distance = LENGTH - p[0]
            lat, lon = offshore(spot, distance)
            return {"height": round(p[2], 3), "period": round(p[3], 3) if p[3] > 0 else None, "energyPeriod": round(p[4], 3) if p[4] > 0 else None,
                    "direction": round((p[5] - 270 + spot["normal"]) % 360, 1) if p[5] >= 0 else None, "depth": round(p[1], 3),
                    "distance": round(distance), "shoreDistance": round(distance - coast["distance"], 1),
                    "shoreDistanceMin": round(distance - coast["waterDistance"], 1),
                    "shoreDistanceMax": round(distance - coast["landDistance"], 1), "lat": lat, "lon": lon,
                    "breakingFraction": round(p[6], 4), "energyKJm2": round(1025 * 9.81 * p[2] ** 2 / 16000, 4),
                    "powerKWm": round(math.hypot(p[7], p[8]) / 1000, 4),
                    **({"peakPeriod": round(p[9], 3) if p[9] > 0 else None} if len(p) > 9 else {})}
        profile = [{"distance": LENGTH - int(p[0]), "shoreDistance": round(LENGTH - p[0] - coast["distance"], 1),
                    "shoreDistanceMin": round(LENGTH - p[0] - coast["waterDistance"], 1),
                    "shoreDistanceMax": round(LENGTH - p[0] - coast["landDistance"], 1),
                    "depth": round(p[1], 3), "height": round(p[2], 3), "qb": round(p[6], 4), "kind": "swan-node"}
                   for p in valid if 0 < LENGTH - p[0] - coast["distance"] <= MAX_SHORE_DISTANCE]
        boundary = by_time[timestamp].get(domain_length)
        # A raised sea level covers the shoreline node with that much water; it remains the model's shore.
        if boundary is None or boundary[1] > max(0, level) + .001:
            raise ValueError("Expected a dry land boundary at model shore distance zero")
        profile.append({"distance": coast["distance"], "shoreDistance": 0,
                        "shoreDistanceMin": coast["distance"] - coast["waterDistance"],
                        "shoreDistanceMax": coast["distance"] - coast["landDistance"],
                        "depth": 0, "height": 0, "qb": 0, "kind": "land-boundary"})
        for d in range(COMPUTE_DX, MAX_SHORE_DISTANCE + 1, COMPUTE_DX):
            if any(p["shoreDistance"] == d for p in profile):
                continue
            raw = by_time[timestamp].get(domain_length - d)
            input_depth = grid_depths[d // COMPUTE_DX] + level
            # SWAN excludes cells shallower than depmin; preserve this state,
            # never reinterpret an error/missing wet-cell result as zero waves.
            if raw is not None and raw[1] <= 0 and input_depth <= .05:
                distance = coast["distance"] + d
                profile.append({"distance": distance, "shoreDistance": d,
                                "shoreDistanceMin": distance - coast["waterDistance"],
                                "shoreDistanceMax": distance - coast["landDistance"],
                                "depth": round(max(0, input_depth), 4), "height": 0, "qb": 0, "kind": "dry-model-node"})
        profile.sort(key=lambda p: p["shoreDistance"])
        if [p["shoreDistance"] for p in profile] != list(range(0, MAX_SHORE_DISTANCE + 1, COMPUTE_DX)):
            missing = [d for d in range(0, MAX_SHORE_DISTANCE + 1, COMPUTE_DX) if d not in [p["shoreDistance"] for p in profile]]
            details = [p[:4] for p in points if round(LENGTH - p[0] - coast["distance"]) in missing]
            raise ValueError(f"Incomplete SWAN profile at {swan_time(timestamp)}: missing {missing}, raw x/depth/height/period={details}")
        extra = {}
        if levels is not None:
            extra["seaLevel"] = levels.get(timestamp)
        if choices is not None:
            extra["boundary"] = choices.get(timestamp)
        if ice is not None:
            extra["ice"] = ice.get(timestamp)
        raw_target = by_time[timestamp].get(target_x)
        if target is None and raw_target is not None and raw_target[1] <= 0 and grid_depths[grid_distances.index(target_distance)] + level <= .05:
            # A low sea level has left the point dry: no wave this hour (depth 0 marks it unavailable), not a failed run.
            result.append({"time": timestamp, **record([target_x, 0, 0, -9, -9, -9, 0, 0, 0]), **extra, "dry": True,
                           "breaking": record(breaking) if breaking else None, "profile": profile})
            continue
        if target is None:
            raise ValueError("Brak poprawnego wyniku SWAN w wybranym punkcie od strony morza")
        result.append({"time": timestamp, **record(target), **extra, "breaking": record(breaking) if breaking else None, "profile": profile})
    return result


def contiguous_end(times, available, start):
    """Last hour of the unbroken hourly run of usable data beginning exactly at start."""
    end, expected = start - 3600, start
    for i, t in enumerate(times):
        if t < start:
            continue
        if t != expected or not available(i):
            break
        end, expected = t, t + 3600
    return end


def available_end(marine, winds, start):
    """Models end at different horizons (EWAM ~3 days, DMI WAM ~5.5, ICON ~7, WAM/IFS ~14.5, GFS Wave 16);
    Open-Meteo pads them with nulls. Stop where real inputs stop, never fill: every hour needs a wave model."""
    mh = marine["data"]["hourly"]
    marine_end = contiguous_end(mh["time"], lambda i: bool(wave_members(mh, i)), start)

    def wind_ok(hourly):
        def check(i):
            try:
                consensus(hourly, i)
                return True
            except ValueError:
                return False
        return check
    wind_end = min(contiguous_end(w["data"]["hourly"]["time"], wind_ok(w["data"]["hourly"]), start) for w in winds)
    return min(marine_end, wind_end)


def simulate(spot, bath, marine, winds, executable, cache, now, hours=HORIZON_HOURS, calm_test=False):
    forecast_start = int(now // 3600) * 3600
    history_start = forecast_start - HISTORY_HOURS * 3600
    start = history_start - SPINUP_HOURS * 3600
    end = min(forecast_start + hours * 3600, available_end(marine, winds, start))
    if end < forecast_start + min(hours, 24) * 3600:
        raise ValueError("Insufficient actual forecast horizon; no extrapolation allowed")
    with tempfile.TemporaryDirectory(prefix=f"swan-{spot['id']}-", dir=cache) as temporary:
        directory = Path(temporary)
        boundary, used, chunks = prepare_run(directory, spot, bath, marine, winds, start, end, calm_test)
        run_chunks(directory, executable, chunks)
        hourly = parse_output(directory / "profile.tbl", spot, bath, forecast_start, end, **boundary)
        for row in hourly:
            if row["time"] > forecast_start + PROFILE_HOURS * 3600:
                row["profile"] = []
        history = parse_output(directory / "profile.tbl", spot, bath, history_start, forecast_start - 3600, **boundary)
        forcing = sorted(directory.glob("wind*.dat")) + sorted(directory.glob("level*.dat"))
        input_hash = hashlib.sha256((directory / "INPUT").read_bytes() + (directory / "boundary.sp2").read_bytes() +
                                   (directory / "bottom.dat").read_bytes() + b"".join(p.read_bytes() for p in forcing)).hexdigest()
        archive_dir = cache / "reproducibility"
        archive_dir.mkdir(parents=True, exist_ok=True)
        dump(directory / "sources.json", {"spot": spot, "bathymetry": bath, "marine": marine, "wind": winds})
        with tarfile.open(archive_dir / f'{spot["id"]}.tar.gz', "w:gz") as archive:
            for file in directory.iterdir():
                if file.is_file():
                    archive.add(file, arcname=file.name)
    return {"schema": 2, "version": VERSION, "engine": "SWAN 41.51AB", "status": "ready", "generatedAt": int(time.time()),
            "forecastHours": (end - forecast_start) // 3600, "historyHours": HISTORY_HOURS,
            "shoreline": shoreline_reference(spot, bath), "maxShoreDistanceM": MAX_SHORE_DISTANCE,
            "profileGridM": COMPUTE_DX, "profileReference": "estimated-shoreline", "profileHours": PROFILE_HOURS,
            "cycle": int(now // 43200) * 43200,
            "spot": {k: spot[k] for k in ["id", "lat", "lon", "normal"]}, "geometryKey": geometry_key(spot),
            # Each hour's boundary model is in its row ("boundary"); the sea level too ("seaLevel", null = 0).
            "boundaryModel": "hourly-medoid", "waveModels": WAVE_MODELS,
            "seaLevelModel": "dmi_dkss_nsbs" if any(level is not None for level in boundary["levels"].values()) else None,
            "boundaryFetchedAt": min(marine["fetchedAt"], marine.get("dmiFetchedAt", marine["fetchedAt"])), "windFetchedAt": min(w["fetchedAt"] for w in winds),
            "windModels": WIND_MODELS, "windName": "BS Wind 8", "inputHash": input_hash, "engineArchiveSha256": ENGINE_SHA256,
            "sourceCommit": os.environ.get("GITHUB_SHA"),
            "grid": {"lengthM": LENGTH - shoreline_reference(spot, bath)["distance"], "offshoreDistanceM": LENGTH, "spacingM": COMPUTE_DX, "bathymetrySamplingM": DX, "timeStepMinutes": DT_MINUTES, "directions": 36, "frequencies": 32, "spinupHours": SPINUP_HOURS},
            "assumptions": ["1D transect, no harbour shadow/diffraction", "reconstructed JONSWAP boundary (peak period = mean / 0.84): swell (spreading 20 deg) and wind sea (30 deg) as two peaks where the model gives them, else one peak (30 deg)",
                            "one offshore wave model per hour, the one closest to the others", "sea level from DMI DKSS where available, otherwise 0 relative to LAT; no currents or ice",
                            "regional DTM, not current sandbar survey"],
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
    # The 2D areas import this module: run as a script it must be the same module, not a second copy.
    sys.modules.setdefault("nearshore", sys.modules[__name__])
    import swan2d
    code_hash = hashlib.sha256(Path(__file__).read_bytes() + Path(swan2d.__file__).read_bytes()).hexdigest()
    old = {s["id"]: load(args.cache / "results" / f'{s["id"]}.json') for s in spots}
    needed = [s for s in spots if args.force or not old[s["id"]] or old[s["id"]].get("codeHash") != code_hash or
              old[s["id"]].get("geometryKey") != geometry_key(s) or old[s["id"]].get("cycle") != int(now // 43200) * 43200 or
              old[s["id"]].get("hourly", [{}])[-1].get("time", 0) < now + max(0, args.hours - 12) * 3600]
    print(f"Fetching wind for {len(spots)} spots; {len(needed)} SWAN runs due", flush=True)
    saved_inputs = {}
    reused = set()
    refresh_warnings = []
    def saved(s):
        if s["id"] not in saved_inputs:
            saved_inputs[s["id"]] = archived_inputs(s, args.cache, now)
        return saved_inputs[s["id"]]
    # Three spatial nodes, ordered offshore -> shore; both the run and the
    # public table use the same BS Wind 8 algorithm and raw multi-model data.
    points = [offshore(s, d) for s in spots for d in [5000, 2500, 0]]
    try:
        winds = bulk_forecast(points, cache=args.cache)
        wind_by_spot = {}
        for i, s in enumerate(spots):
            batch = winds[i * 3:i * 3 + 3]
            if not all(batch):
                batch = saved(s)["wind"] if saved(s) else None
                if batch:
                    reused.add(s["id"])
            if batch and any(b.get("reusedInputs") for b in batch):
                reused.add(s["id"])
            wind_by_spot[s["id"]] = batch
    except (requests.RequestException, ValueError) as error:
        refresh_warnings.append(f"Wind download failed: {type(error).__name__}")
        wind_by_spot = {s["id"]: saved(s)["wind"] if saved(s) else None for s in spots}
        reused.update(s["id"] for s in spots if wind_by_spot[s["id"]])
        print(f"Using original wind snapshots (max age 6 h) for {len(reused)} spots; timestamps retained", flush=True)
    for s in spots:
        wind_spot = {key: s[key] for key in ["id", "lat", "lon"]}
        if not wind_by_spot[s["id"]]:
            dump(args.output / "wind" / f'{s["id"]}.json', {"schema": 1, "spotId": s["id"], "spot": wind_spot, "fetchedAt": 0, "data": None})
            continue
        shore = wind_by_spot[s["id"]][-1]
        dump(args.output / "wind" / f'{s["id"]}.json', {"schema": 1, "spotId": s["id"], "spot": wind_spot, "fetchedAt": shore["fetchedAt"] * 1000,
            "data": shore["data"], "source": "BS Wind 8 — ICON / GFS / ECMWF IFS / ECMWF AIFS / UKMO / JMA / GEM / DMI HARMONIE", "sourceType": "scheduled", "reusedInputs": s["id"] in reused})
    try:
        marine = bulk_forecast([offshore(s, 5000) for s in needed], marine=True, cache=args.cache) if needed else []
        marine_by_spot = {}
        for s, m in zip(needed, marine):
            if m is None and saved(s):
                m = saved(s)["marine"]
                reused.add(s["id"])
            if m and m.get("reusedInputs"):
                reused.add(s["id"])
            marine_by_spot[s["id"]] = m
    except (requests.RequestException, ValueError) as error:
        refresh_warnings.append(f"Marine download failed: {type(error).__name__}")
        marine_by_spot = {s["id"]: saved(s)["marine"] if saved(s) else None for s in needed}
        reused.update(s["id"] for s in needed if marine_by_spot[s["id"]])
        print("Using original boundary snapshots where still valid (max age 6 h)", flush=True)
    # DMI WAM joins the wave models and DKSS adds the sea level; without them the other inputs still run.
    dmi, dmi_warnings = dmi_forecast([offshore(s, 5000) for s in needed])
    refresh_warnings += dmi_warnings
    for s, extra in zip(needed, dmi):
        marine_by_spot[s["id"]] = merge_dmi(marine_by_spot[s["id"]], extra)
    executable = install_engine(args.cache) if needed else None
    statuses = []

    def work(s):
        try:
            if not wind_by_spot[s["id"]] or not marine_by_spot[s["id"]]:
                raise ValueError("Brak świeżych danych wejściowych i zgodnego archiwum; nie tworzymy sztucznego wymuszenia")
            bath = bathymetry(s, args.cache)
            result = simulate(s, bath, marine_by_spot[s["id"]], wind_by_spot[s["id"]], executable, args.cache, now, args.hours)
            result["codeHash"] = code_hash
            result["reusedInputs"] = s["id"] in reused
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
    # SWAN 2D over the busiest areas for the first five days, after their spots' 1D runs of this cycle. An area runs
    # again only when its spots did; otherwise the result of the same cycle is reused. Without it the spots stay 1D.
    cycle = int(now // 43200) * 43200
    recomputed = {s["id"] for s in statuses if not s["error"]}
    areas2d = {}

    def work2d(area):
        members = [s for s in spots if s["id"] in area["spots"]]
        path = args.cache / "results2d" / f'{area["id"]}.json'
        if not any(s["id"] in recomputed for s in members):
            cached = load(path)
            return area["id"], cached if cached and cached.get("cycle") == cycle and cached.get("codeHash") == code_hash else None, None
        try:
            baths = {}
            for s in members:
                try:
                    baths[s["id"]] = bathymetry(s, args.cache)
                except ValueError:
                    continue
            # The waves enter as in the 1D run of the area's middle spot.
            with_waves = sorted((s for s in members if marine_by_spot.get(s["id"])), key=lambda s: s["lon"])
            if not with_waves:
                raise ValueError("Brak fali na granicy dla obszaru 2D")
            reference = with_waves[len(with_waves) // 2]
            winds = [wind_by_spot[s["id"]] for s in members if wind_by_spot.get(s["id"])]
            result = swan2d.simulate_area(area, members, baths, marine_by_spot[reference["id"]], winds, executable, args.cache, now)
            result.update(cycle=cycle, codeHash=code_hash, reference=reference["id"])
            dump(path, result)
            return area["id"], result, None
        except Exception as error:
            return area["id"], None, str(error)

    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, args.workers)) as pool:
        for id, result, error in pool.map(work2d, [a for a in swan2d.AREAS if any(s["id"] in a["spots"] for s in spots)]):
            areas2d[id] = result
            if error:
                refresh_warnings.append(f"SWAN 2D {id} failed: {error[:160]}")
            print(f'2D {id}: {"FAILED " + error[:180] if error else "OK, " + str(len(result["spots"])) + " spots, " + str(result["seconds"]) + " s" if result else "nothing to do"}', flush=True)
    area_of = {id: area["id"] for area in swan2d.AREAS for id in area["spots"]}
    ready = 0
    ready_input_stamps = []
    for s in spots:
        result = results[s["id"]]
        if result and result.get("schema") == 2 and result.get("version") == VERSION and result.get("geometryKey") == geometry_key(s):
            document = {**result, "lastAttemptError": errors.get(s["id"])}
            area = areas2d.get(area_of.get(s["id"]))
            if area and area.get("cycle") == result.get("cycle"):
                document = swan2d.merge(document, area)
            if all(finite(result.get(k)) and -300 <= time.time() - result[k] <= 18 * 3600
                   for k in ("generatedAt", "windFetchedAt", "boundaryFetchedAt")):
                ready += 1
                ready_input_stamps.append(min(result[k] for k in ("generatedAt", "windFetchedAt", "boundaryFetchedAt")))
        else:
            document = {"schema": 2, "status": "unavailable", "spot": {"id": s["id"]}, "error": errors.get(s["id"], "Brak potwierdzonej prognozy w strefie 0–500 m")}
        dump(args.output / "nearshore" / f'{s["id"]}.json', document)
    wind_available = sum(bool(wind_by_spot[s["id"]]) for s in spots)
    wind_stamps = [wind_by_spot[s["id"]][-1]["fetchedAt"] for s in spots if wind_by_spot[s["id"]]]
    if wind_available < len(spots):
        refresh_warnings.append(f"Missing fresh wind for {len(spots) - wind_available} spots")
    dump(args.output / "status.json", {"generatedAt": int(time.time()), "engine": "SWAN 41.51AB", "version": VERSION,
        "spots": len(spots), "available": ready, "newRuns": len(needed), "errors": errors,
        "windAvailable": wind_available,
        "oldestWaveInputAt": min(ready_input_stamps, default=None),
        "oldestWindFetchedAt": min(wind_stamps, default=None),
        "reusedInputSpots": sorted(reused), "refreshWarnings": refresh_warnings,
        "areas2d": {id: len(result["spots"]) if result else 0 for id, result in areas2d.items()},
        "windScheduleHours": 3, "simulationMaxAgeHours": 12})
    print(f"Published {ready}/{len(spots)} simulations to {args.output}", flush=True)
    if not ready or not wind_available:
        raise SystemExit("No usable waves or wind; refusing empty publication")


if __name__ == "__main__":
    main()
