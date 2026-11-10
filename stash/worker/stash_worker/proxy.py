"""Every Supabase call the worker makes goes through the Edge Function `stash-worker-proxy`.

The worker has no service key. It shows the proxy the wake-up token it received in the `/run`
request (header `x-stash-worker-token`); the proxy checks it and relays to PostgREST (schema
`stash`), signs Storage URLs and computes embeddings. Files themselves never pass through the
proxy: they go straight to Storage with a signed URL, on a second HTTP client that never
carries the token.

The token is kept in this object for one run and is never logged or put in an error message.
"""

from __future__ import annotations

import time
from pathlib import Path
from typing import Any

import httpx

from . import deadline

FUNCTION = "stash-worker-proxy"
INSERT_CHUNK = 500  # rows per POST: keeps every body far below the proxy's 1 MB limit
TRANSIENT = (502, 503, 504)
UPLOAD_TIMEOUT_S = 180.0


class ProxyError(Exception):
    """The proxy (or Storage behind a signed URL) answered with an error. Carries no secret."""

    def __init__(self, what: str, status: int = 0):
        super().__init__(f"{what} -> {status}" if status else what)
        self.status = status


class Unauthorized(ProxyError):
    """The proxy refused the token."""


class Proxy:
    def __init__(self, supabase_url: str, token: str, *, http: Any | None = None, plain: Any | None = None,
                 sleep=time.sleep):
        self.base = f"{supabase_url.rstrip('/')}/functions/v1/{FUNCTION}"
        self.http = http or httpx.Client(timeout=httpx.Timeout(60.0, connect=10.0),
                                         headers={"x-stash-worker-token": token})
        # Signed Storage URLs: no token, long timeout for a 45 MB video.
        self.plain = plain or httpx.Client(timeout=httpx.Timeout(UPLOAD_TIMEOUT_S, connect=10.0), follow_redirects=False)
        self._sleep = sleep

    def close(self) -> None:
        for c in (self.http, self.plain):
            try:
                c.close()
            except Exception:  # noqa: BLE001
                pass

    # --- transport --------------------------------------------------------------------
    def _call(self, method: str, route: str, *, params: dict[str, str] | None = None, json: Any = None,
              headers: dict[str, str] | None = None, retry: bool = True) -> httpx.Response:
        what = f"{method} {route}"
        attempts = 3 if retry else 1
        last: Exception | None = None
        for attempt in range(attempts):
            if attempt:
                self._sleep(0.4 * attempt)
            try:
                r = self.http.request(method, f"{self.base}{route}", params=params, json=json, headers=headers)
            except httpx.HTTPError as exc:  # connection reset, timeout…
                last = ProxyError(f"{what}: {type(exc).__name__}")
                continue
            if r.status_code == 401:
                raise Unauthorized(what, 401)
            if r.status_code in TRANSIENT and attempt + 1 < attempts:
                last = ProxyError(what, r.status_code)
                continue
            if r.status_code >= 400:
                raise ProxyError(what, r.status_code)
            return r
        raise last or ProxyError(what)

    # --- config -----------------------------------------------------------------------
    def config(self) -> dict[str, Any]:
        return self._call("POST", "/config", json={}).json()

    # --- PostgREST (schema stash) -------------------------------------------------------
    def select(self, table: str, params: dict[str, str]) -> list[dict[str, Any]]:
        return self._call("GET", f"/rest/{table}", params=params).json()

    def one(self, table: str, params: dict[str, str]) -> dict[str, Any] | None:
        rows = self.select(table, {**params, "limit": "1"})
        return rows[0] if rows else None

    def insert(self, table: str, rows: list[dict[str, Any]] | dict[str, Any], upsert_on: str | None = None) -> None:
        headers = {"Prefer": "return=minimal"}
        params: dict[str, str] = {}
        if upsert_on:
            headers["Prefer"] = "return=minimal,resolution=merge-duplicates"
            params["on_conflict"] = upsert_on
        batches = [rows] if isinstance(rows, dict) else [rows[i:i + INSERT_CHUNK] for i in range(0, len(rows), INSERT_CHUNK)]
        for batch in batches:
            # A plain insert is not repeated on a gateway error: it could land twice.
            self._call("POST", f"/rest/{table}", params=params, json=batch, headers=headers, retry=bool(upsert_on))

    def update(self, table: str, match: dict[str, str], values: dict[str, Any]) -> None:
        self._call("PATCH", f"/rest/{table}", params=match, json=values, headers={"Prefer": "return=minimal"})

    def delete(self, table: str, match: dict[str, str]) -> None:
        self._call("DELETE", f"/rest/{table}", params=match, headers={"Prefer": "return=minimal"})

    def rpc(self, fn: str, args: dict[str, Any]) -> Any:
        r = self._call("POST", f"/rest/rpc/{fn}", json=args, retry=fn != "claim_jobs")
        return r.json() if r.content else None

    # --- Storage ------------------------------------------------------------------------
    def upload(self, bucket: str, path: str, data: bytes | Path, content_type: str) -> int:
        """Signed upload URL from the proxy, then the bytes straight to Storage. Returns the size."""
        signed = self._call("POST", "/storage/sign-upload", json={"bucket": bucket, "path": path}).json()
        size = data.stat().st_size if isinstance(data, Path) else len(data)
        headers = {"Content-Type": content_type, "x-upsert": "true", "Cache-Control": "max-age=31536000",
                   "Content-Length": str(size)}
        # Bounded by what is left of the run: a slow upload must not outlive the function.
        extra: dict[str, Any] = {}
        if deadline.remaining() is not None:
            try:
                left = deadline.cap(UPLOAD_TIMEOUT_S, floor=5.0)
            except deadline.OutOfTime:
                raise ProxyError(f"PUT storage {bucket}: out of time") from None
            extra["timeout"] = httpx.Timeout(left, connect=min(10.0, left))
        try:
            if isinstance(data, Path):
                with data.open("rb") as fh:
                    r = self.plain.put(signed["url"], content=fh, headers=headers, **extra)
            else:
                r = self.plain.put(signed["url"], content=data, headers=headers, **extra)
        except httpx.HTTPError as exc:
            raise ProxyError(f"PUT storage {bucket}: {type(exc).__name__}") from None
        if r.status_code >= 400:
            raise ProxyError(f"PUT storage {bucket}", r.status_code)
        return size

    def signed_url(self, bucket: str, path: str, expires_in: int = 600) -> str:
        return self._call("POST", "/storage/sign-download",
                          json={"bucket": bucket, "path": path, "expires_in": expires_in}).json()["url"]

    def download(self, bucket: str, path: str, max_bytes: int = 60 * 1024 * 1024) -> bytes:
        url = self.signed_url(bucket, path)
        try:
            r = self.plain.get(url)
        except httpx.HTTPError as exc:
            raise ProxyError(f"GET storage {bucket}: {type(exc).__name__}") from None
        if r.status_code >= 400:
            raise ProxyError(f"GET storage {bucket}", r.status_code)
        if len(r.content) > max_bytes:
            raise ProxyError(f"GET storage {bucket}: too large")
        return r.content

    def remove(self, bucket: str, paths: list[str]) -> int:
        removed = 0
        for i in range(0, len(paths), 100):
            r = self._call("POST", "/storage/remove", json={"bucket": bucket, "paths": paths[i:i + 100]})
            removed += int((r.json() or {}).get("removed") or 0)
        return removed

    # --- Embeddings (gte-small inside the Edge Function, 384 dims) ------------------------
    def embed(self, texts: list[str]) -> list[list[float]]:
        out: list[list[float]] = []
        for i in range(0, len(texts), 16):
            body = self._call("POST", "/embed", json={"input": [t[:2000] for t in texts[i:i + 16]]}).json()
            vectors = body.get("embeddings") or []
            if len(vectors) != len(texts[i:i + 16]) or any(len(v) != 384 for v in vectors):
                raise ProxyError("POST /embed: unexpected shape")
            out += vectors
        return out


def vector_literal(v: list[float]) -> str:
    """pgvector text form for PostgREST."""
    return "[" + ",".join(f"{float(x):.6f}" for x in v) + "]"
