"""How long this run may still take.

The platform kills the function at its maximum duration (300 s) without warning, which would leave
a save stuck in `processing`. So `/run` sets one deadline when it starts, and everything slow reads
it: provider calls and the Storage upload cap their timeouts to what is left, yt-dlp is stopped
from its progress hook, and the pipeline skips a step it could not finish (the sweep retries it).

Kept in a context variable: each `/run` request has its own, and code that never set one (tests,
the CLI) simply has no limit.
"""

from __future__ import annotations

import time
from contextvars import ContextVar

_deadline: ContextVar[float | None] = ContextVar("stash_deadline", default=None)

MARGIN_S = 5.0  # a call must end this long before the deadline, to leave room to write the result


class OutOfTime(Exception):
    """Not enough time left in this run to start (or go on with) a slow step."""


def set_deadline(at: float | None):
    """`at` is on the time.monotonic() clock. Returns a token for reset()."""
    return _deadline.set(at)


def reset(token) -> None:
    _deadline.reset(token)


def remaining(clock=time.monotonic) -> float | None:
    """Seconds left, or None when no deadline is set."""
    at = _deadline.get()
    return None if at is None else at - clock()


def has(seconds: float) -> bool:
    """True when at least `seconds` are left (or there is no deadline)."""
    left = remaining()
    return left is None or left >= seconds


def cap(timeout: float, floor: float = 1.0) -> float:
    """`timeout`, shortened so the call ends before the deadline. Raises OutOfTime when nothing is left."""
    left = remaining()
    if left is None:
        return timeout
    left -= MARGIN_S
    if left < floor:
        raise OutOfTime("out of time")
    return min(timeout, left)
