"""Small stand-ins shared by the tests: an HTTP client that answers from a queue, and a provider."""

from __future__ import annotations

import json
from typing import Any


class Resp:
    def __init__(self, status: int = 200, body: Any = None, headers: dict[str, str] | None = None, content: bytes | None = None):
        self.status_code = status
        self._body = body
        self.headers = headers or {}
        self.content = content if content is not None else (json.dumps(body).encode() if body is not None else b"")

    def json(self) -> Any:
        return self._body


class FakeHttp:
    """Answers `request()` with the queued replies (a Resp, or a callable(method, url, kw) -> Resp)."""

    def __init__(self, replies: list[Any]):
        self.replies = list(replies)
        self.requests: list[dict[str, Any]] = []

    def request(self, method: str, url: str, **kw: Any) -> Resp:
        self.requests.append({"method": method, "url": url, **kw})
        reply = self.replies.pop(0)
        return reply(method, url, kw) if callable(reply) else reply

    def put(self, url: str, **kw: Any) -> Resp:
        return self.request("PUT", url, **kw)

    def get(self, url: str, **kw: Any) -> Resp:
        return self.request("GET", url, **kw)

    def close(self) -> None:
        pass


class FakeProvider:
    """A provider whose `structured` returns the queued raw answers and records what it was asked."""

    name = "fake"

    def __init__(self, answers: list[Any], tokens: tuple[int, int] = (10, 5)):
        self.answers = list(answers)
        self.tokens = tokens
        self.calls: list[dict[str, Any]] = []

    def structured(self, **kw: Any):
        self.calls.append(kw)
        answer = self.answers.pop(0)
        if isinstance(answer, Exception):
            raise answer
        return answer, *self.tokens
