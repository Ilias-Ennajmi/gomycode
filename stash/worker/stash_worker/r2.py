"""Cloudflare R2 (S3-compatible) for the video files."""

from __future__ import annotations

from pathlib import Path

from .config import Config


def _client(cfg: Config):
    import boto3  # lazy
    from botocore.config import Config as BotoConfig

    return boto3.client(
        "s3",
        endpoint_url=f"https://{cfg.r2_account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=cfg.r2_access_key,
        aws_secret_access_key=cfg.r2_secret_key,
        region_name="auto",
        config=BotoConfig(signature_version="s3v4", retries={"max_attempts": 3}),
    )


def upload_video(cfg: Config, local: Path, key: str) -> None:
    _client(cfg).upload_file(
        str(local), cfg.r2_bucket, key,
        ExtraArgs={"ContentType": "video/mp4", "CacheControl": "private, max-age=31536000, immutable"},
    )


def delete(cfg: Config, keys: list[str]) -> None:
    if not keys:
        return
    _client(cfg).delete_objects(Bucket=cfg.r2_bucket, Delete={"Objects": [{"Key": k} for k in keys], "Quiet": True})
