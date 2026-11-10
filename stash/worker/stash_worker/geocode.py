"""Place names → coordinates with OpenStreetMap Nominatim.

Nominatim's usage policy: an identifying User-Agent, at most 1 request per
second, and cache results. Places the AI found get lat/lng/address so they can
be pinned on the Map and checked by "Next time I'm nearby".
"""

from __future__ import annotations

import logging
import threading
import time
from datetime import datetime, timezone
from typing import Any, Callable

import httpx

from .config import Config

Supa = Any  # the proxy client, or a fake in tests

log = logging.getLogger("stash.geocode")

URL = "https://nominatim.openstreetmap.org/search"
USER_AGENT = "Stash personal app"
MIN_INTERVAL_S = 1.05


class Geocoder:
    def __init__(
        self,
        http: Any | None = None,
        *,
        clock: Callable[[], float] = time.monotonic,
        sleep: Callable[[float], None] = time.sleep,
    ):
        self.http = http or httpx.Client(timeout=httpx.Timeout(15.0, connect=5.0),
                                         headers={"User-Agent": USER_AGENT, "Accept-Language": "en"})
        self.clock, self.sleep = clock, sleep
        self.cache: dict[str, dict[str, Any] | None] = {}
        self._last = float("-inf")
        self._lock = threading.Lock()

    @staticmethod
    def query_for(name: str, address: str | None) -> str:
        name, address = (name or "").strip(), (address or "").strip()
        if address and name.lower() not in address.lower():
            return f"{name}, {address}"
        return address or name

    def lookup(self, query: str) -> dict[str, Any] | None:
        """{"lat", "lng", "address"} or None. Raises on network errors (so the caller can retry later)."""
        key = " ".join(query.lower().split())
        if not key:
            return None
        if key in self.cache:
            return self.cache[key]
        with self._lock:
            wait = self._last + MIN_INTERVAL_S - self.clock()
            if wait > 0:
                self.sleep(wait)
            try:
                r = self.http.get(URL, params={"format": "json", "q": query, "limit": "1"},
                                  headers={"User-Agent": USER_AGENT})
            finally:
                self._last = self.clock()
        r.raise_for_status()
        rows = r.json() or []
        hit = None
        if rows:
            try:
                hit = {"lat": float(rows[0]["lat"]), "lng": float(rows[0]["lon"]),
                       "address": str(rows[0].get("display_name") or "")[:300] or None}
            except (KeyError, TypeError, ValueError):
                hit = None
        self.cache[key] = hit
        return hit


_default: Geocoder | None = None


def default_geocoder() -> Geocoder:
    global _default
    _default = _default or Geocoder()
    return _default


def geocode_save(supa: Supa, cfg: Config, save_id: str, geocoder: Geocoder | None = None) -> int:
    """Geocodes the save's places that have no coordinates yet. Returns how many were found."""
    if not cfg.geocode:
        return 0
    places = supa.select("places", {"select": "id,name,address,lat,lng,geocoded_at", "save_id": f"eq.{save_id}"})
    todo = [p for p in places if p.get("lat") is None and not p.get("geocoded_at")]
    if not todo:
        return 0
    g = geocoder or default_geocoder()
    found = 0
    for p in todo:
        try:
            hit = g.lookup(Geocoder.query_for(p["name"], p.get("address")))
        except Exception as exc:  # noqa: BLE001 — leave geocoded_at empty so a reprocess tries again
            log.info("geocode skipped: %s", type(exc).__name__)
            continue
        values: dict[str, Any] = {"geocoded_at": datetime.now(timezone.utc).isoformat()}
        if hit:
            values.update({"lat": hit["lat"], "lng": hit["lng"]})
            if not p.get("address") and hit.get("address"):
                values["address"] = hit["address"]
            found += 1
        supa.update("places", {"id": f"eq.{p['id']}"}, values)
    return found
