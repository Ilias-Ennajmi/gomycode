"""No test may touch the network: a real HTTP call fails loudly instead of hanging on a proxy."""

import httpx
import pytest


@pytest.fixture(autouse=True)
def no_network(monkeypatch):
    def refuse(self, request, *a, **k):
        raise AssertionError(f"network call in a test: {request.method} {request.url.host}")

    monkeypatch.setattr(httpx.Client, "send", refuse)
