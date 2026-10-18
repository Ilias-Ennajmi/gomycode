"""Process the queue once: `python -m stash_worker`. This is what the GitHub Actions run calls."""

import json
import logging

from .config import Config, with_remote
from .pipeline import run
from .supa import Supa

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s %(message)s")
    cfg = Config()
    missing = cfg.missing_required()
    if missing:
        raise SystemExit(f"Missing env: {', '.join(missing)}")
    try:
        cfg = with_remote(cfg, Supa(cfg).rpc("worker_config", {}) or {})
    except Exception as exc:  # noqa: BLE001 — env vars alone still work
        logging.warning("no settings from Vault: %s", type(exc).__name__)
    logging.info("summaries: %s · video storage: %s · search by meaning: %s · owners: %d",
                 cfg.insights_provider or "off", "on" if cfg.has_video_storage else "off",
                 "on" if cfg.voyage_key else "off", len(cfg.owner_user_ids))
    print(json.dumps(run(Supa(cfg), cfg)))
