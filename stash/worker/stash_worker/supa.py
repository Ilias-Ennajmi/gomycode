"""Tiny Supabase client (PostgREST + Storage) using the service_role key."""

from __future__ import annotations

from typing import Any

import httpx

from .config import Config


class Supa:
    def __init__(self, cfg: Config):
        self.cfg = cfg
        self.http = httpx.Client(
            base_url=cfg.supabase_url,
            timeout=httpx.Timeout(30.0, connect=10.0),
            headers={"apikey": cfg.service_key, "Authorization": f"Bearer {cfg.service_key}"},
        )

    # PostgREST -------------------------------------------------------------
    def _rest_headers(self, extra: dict[str, str] | None = None) -> dict[str, str]:
        h = {"Accept-Profile": "stash", "Content-Profile": "stash"}
        if extra:
            h.update(extra)
        return h

    def select(self, table: str, params: dict[str, str]) -> list[dict[str, Any]]:
        r = self.http.get(f"/rest/v1/{table}", params=params, headers=self._rest_headers())
        r.raise_for_status()
        return r.json()

    def one(self, table: str, params: dict[str, str]) -> dict[str, Any] | None:
        rows = self.select(table, {**params, "limit": "1"})
        return rows[0] if rows else None

    def insert(self, table: str, rows: list[dict[str, Any]] | dict[str, Any], upsert_on: str | None = None) -> None:
        headers = {"Prefer": "return=minimal"}
        params = {}
        if upsert_on:
            headers["Prefer"] = "return=minimal,resolution=merge-duplicates"
            params["on_conflict"] = upsert_on
        r = self.http.post(f"/rest/v1/{table}", json=rows, params=params, headers=self._rest_headers(headers))
        r.raise_for_status()

    def update(self, table: str, match: dict[str, str], values: dict[str, Any]) -> None:
        r = self.http.patch(
            f"/rest/v1/{table}", params=match, json=values, headers=self._rest_headers({"Prefer": "return=minimal"})
        )
        r.raise_for_status()

    def delete(self, table: str, match: dict[str, str]) -> None:
        r = self.http.delete(f"/rest/v1/{table}", params=match, headers=self._rest_headers())
        r.raise_for_status()

    def rpc(self, fn: str, args: dict[str, Any]) -> Any:
        r = self.http.post(f"/rest/v1/rpc/{fn}", json=args, headers=self._rest_headers())
        r.raise_for_status()
        return r.json() if r.content else None

    # Storage ---------------------------------------------------------------
    def upload(self, bucket: str, path: str, data: bytes, content_type: str) -> None:
        r = self.http.post(
            f"/storage/v1/object/{bucket}/{path}",
            content=data,
            headers={"Content-Type": content_type, "x-upsert": "true", "Cache-Control": "max-age=31536000"},
            timeout=httpx.Timeout(300.0, connect=10.0),  # videos are up to ~45 MB
        )
        r.raise_for_status()

    def list_files(self, bucket: str, folder: str) -> list[dict[str, Any]]:
        """Files directly inside <folder>/ (name + metadata.size), up to 1000 per page."""
        out: list[dict[str, Any]] = []
        offset = 0
        while True:
            r = self.http.post(f"/storage/v1/object/list/{bucket}",
                               json={"prefix": folder.rstrip("/") + "/", "limit": 1000, "offset": offset})
            r.raise_for_status()
            page = [f for f in r.json() if f.get("id")]  # folders have no id
            out.extend(page)
            if len(r.json()) < 1000:
                return out
            offset += 1000

    def remove(self, bucket: str, paths: list[str]) -> None:
        if not paths:
            return
        r = self.http.request("DELETE", f"/storage/v1/object/{bucket}", json={"prefixes": paths})
        r.raise_for_status()
