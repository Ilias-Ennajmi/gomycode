"""Process the queue once from a terminal: `python -m stash_worker` (reads the same env vars)."""

import json

from .config import Config
from .pipeline import run
from .supa import Supa

if __name__ == "__main__":
    cfg = Config()
    missing = cfg.missing_required()
    if missing:
        raise SystemExit(f"Missing env: {', '.join(missing)}")
    print(json.dumps(run(Supa(cfg), cfg)))
