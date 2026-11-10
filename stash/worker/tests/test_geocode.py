"""Geocoding with a fake HTTP client and a fake clock: rate limit, cache, storage."""

from __future__ import annotations

from stash_worker import geocode

from test_pipeline import OWNER, FakeSupa, cfg


class FakeResponse:
    def __init__(self, rows, status=200):
        self.rows, self.status_code = rows, status

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")

    def json(self):
        return self.rows


class FakeHttp:
    def __init__(self, answers):
        self.answers, self.calls = answers, []

    def get(self, url, params=None, headers=None):
        self.calls.append({"url": url, "params": params, "headers": headers})
        a = self.answers.get(params["q"], [])
        return a if isinstance(a, FakeResponse) else FakeResponse(a)


class Clock:
    def __init__(self):
        self.now, self.slept = 100.0, []

    def __call__(self):
        return self.now

    def sleep(self, s):
        self.slept.append(round(s, 2))
        self.now += s


HIT = [{"lat": "33.5899", "lon": "-7.6039", "display_name": "Café Bianca, Casablanca, Morocco"}]


def make(answers):
    http, clock = FakeHttp(answers), Clock()
    return geocode.Geocoder(http, clock=clock, sleep=clock.sleep), http, clock


def test_lookup_sends_user_agent_and_parses():
    g, http, _ = make({"Café Bianca, Casablanca": HIT})
    hit = g.lookup("Café Bianca, Casablanca")
    assert hit == {"lat": 33.5899, "lng": -7.6039, "address": "Café Bianca, Casablanca, Morocco"}
    call = http.calls[0]
    assert call["url"].startswith("https://nominatim.openstreetmap.org/search")
    assert call["params"]["format"] == "json" and call["params"]["limit"] == "1"
    assert call["headers"]["User-Agent"] == "Stash personal app"


def test_at_most_one_request_per_second_and_cache():
    g, http, clock = make({"a": HIT, "b": []})
    g.lookup("a")
    g.lookup("b")
    g.lookup("A ")  # cached (same query once normalised)
    assert len(http.calls) == 2
    assert clock.slept and clock.slept[0] >= 1.0


def test_query_combines_name_and_address():
    assert geocode.Geocoder.query_for("Café Bianca", "Casablanca") == "Café Bianca, Casablanca"
    assert geocode.Geocoder.query_for("Bianca", "Café Bianca, Maarif") == "Café Bianca, Maarif"
    assert geocode.Geocoder.query_for("Bianca", None) == "Bianca"


def test_geocode_save_stores_coordinates_and_marks_misses():
    db = FakeSupa()
    db.tables["places"] = [
        {"id": "p1", "save_id": "s1", "user_id": OWNER, "name": "Café Bianca", "address": "Casablanca", "lat": None, "lng": None},
        {"id": "p2", "save_id": "s1", "user_id": OWNER, "name": "Nowhere Bar", "address": None, "lat": None, "lng": None},
        {"id": "p3", "save_id": "s1", "user_id": OWNER, "name": "Done", "address": None, "lat": 1.0, "lng": 2.0},
    ]
    g, http, _ = make({"Café Bianca, Casablanca": HIT})
    assert geocode.geocode_save(db, cfg(), "s1", g) == 1
    p1, p2, p3 = db.tables["places"]
    assert (p1["lat"], p1["lng"]) == (33.5899, -7.6039) and p1["address"] == "Casablanca" and p1["geocoded_at"]
    assert p2["lat"] is None and p2["geocoded_at"] and p2["address"] == None  # noqa: E711
    assert "geocoded_at" not in p3
    assert len(http.calls) == 2
    # Already tried: nothing is asked again.
    assert geocode.geocode_save(db, cfg(), "s1", g) == 0 and len(http.calls) == 2


def test_network_error_leaves_place_for_later():
    db = FakeSupa()
    db.tables["places"] = [{"id": "p1", "save_id": "s1", "name": "X", "address": None, "lat": None, "lng": None}]
    g, _, _ = make({"X": FakeResponse([], status=503)})
    assert geocode.geocode_save(db, cfg(), "s1", g) == 0
    assert "geocoded_at" not in db.tables["places"][0]


def test_switched_off():
    db = FakeSupa()
    db.tables["places"] = [{"id": "p1", "save_id": "s1", "name": "X", "lat": None}]
    g, http, _ = make({})
    assert geocode.geocode_save(db, cfg(geocode=False), "s1", g) == 0 and not http.calls
