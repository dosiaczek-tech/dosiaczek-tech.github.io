"""Fail monitoring when a successful deployment still contains unusable forecasts."""
import json
import sys
import time
from urllib.request import urlopen


def validate(status, now):
    total = status.get("spots", 0)
    if not isinstance(total, int) or total <= 0:
        raise ValueError("No spot catalogue in published status")
    for label, count, stamp, limit in [
        ("wind", status.get("windAvailable", 0), status.get("oldestWindFetchedAt"), 6 * 3600),
        ("waves", status.get("available", 0), status.get("oldestWaveInputAt"), 18 * 3600),
    ]:
        if not isinstance(count, int) or count < total * .9:
            raise ValueError(f"Published {label}: only {count}/{total} spots available")
        if not isinstance(stamp, (int, float)) or not -300 <= now - stamp <= limit:
            raise ValueError(f"Published {label}: missing or expired source timestamp")
    return f"Published forecast OK: wind {status['windAvailable']}/{total}, waves {status['available']}/{total}"


if __name__ == "__main__":
    origin = sys.argv[1].rstrip("/") if len(sys.argv) > 1 else "https://dosiaczek-tech.github.io"
    with urlopen(f"{origin}/data/status.json?v={int(time.time())}", timeout=30) as response:
        status = json.load(response)
    print(validate(status, time.time()))
    with urlopen(f"{origin}/sup/", timeout=30) as response:
        if response.status != 200 or b"assets/app.js" not in response.read():
            raise SystemExit("Public SUP interface unavailable")
    print("Public SUP interface OK")
