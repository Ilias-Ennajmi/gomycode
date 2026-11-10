"""Process the queue once from a terminal: `STASH_WORKER_TOKEN=… SUPABASE_URL=… python -m stash_worker`.

For debugging only. The token is the Vault secret `stash_worker_token`; it is read from the
environment of this one process and not stored anywhere."""

import json
import os

from .config import Config, supabase_url_from_env
from .pipeline import run
from .proxy import Proxy

if __name__ == "__main__":
    url, token = supabase_url_from_env(), os.environ.get("STASH_WORKER_TOKEN", "").strip()
    if not url or len(token) < 32:
        raise SystemExit("Set SUPABASE_URL and STASH_WORKER_TOKEN")
    proxy = Proxy(url, token)
    print(json.dumps(run(proxy, Config.from_worker_config(proxy.config(), url))))
