from __future__ import annotations

from collections.abc import Callable
from threading import Lock, local

from curl_cffi import requests as curl_requests


def create_http_session() -> curl_requests.Session:
    return curl_requests.Session(impersonate="chrome", allow_redirects=True, timeout=30.0)


class ThreadLocalSessionPool:
    """Create and close one reusable HTTP session per worker thread."""

    def __init__(self, factory: Callable[[], curl_requests.Session] = create_http_session) -> None:
        self._factory = factory
        self._local = local()
        self._lock = Lock()
        self._sessions: list[curl_requests.Session] = []

    def __enter__(self) -> ThreadLocalSessionPool:
        return self

    def __exit__(self, *_: object) -> None:
        with self._lock:
            sessions = tuple(self._sessions)
            self._sessions.clear()
        for session in sessions:
            session.close()

    def get(self) -> curl_requests.Session:
        session = getattr(self._local, "session", None)
        if session is None:
            session = self._factory()
            self._local.session = session
            with self._lock:
                self._sessions.append(session)
        return session
