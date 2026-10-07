import time
from collections import defaultdict


class LoginRateLimiter:
    """In-memory rate limiter and lockout manager for login attempts."""

    def __init__(self):
        # ip -> list of timestamps
        self.ip_attempts = defaultdict(list)
        # username -> list of failure timestamps
        self.user_failures = defaultdict(list)
        # username -> lockout expiration timestamp
        self.user_lockouts = {}

    def is_ip_limited(self, ip: str) -> bool:
        now = time.time()
        window = 60.0
        self.ip_attempts[ip] = [t for t in self.ip_attempts[ip] if now - t < window]
        return len(self.ip_attempts[ip]) >= 5

    def record_ip_attempt(self, ip: str):
        self.ip_attempts[ip].append(time.time())

    def is_user_locked(self, username: str) -> bool:
        if not username:
            return False
        now = time.time()
        user_key = username.lower().strip()
        lockout_until = self.user_lockouts.get(user_key)
        if lockout_until:
            if now < lockout_until:
                return True
            del self.user_lockouts[user_key]
            self.user_failures[user_key] = []
        return False

    def record_login_failure(self, username: str):
        if not username:
            return
        now = time.time()
        user_key = username.lower().strip()
        self.user_failures[user_key] = [t for t in self.user_failures[user_key] if now - t < 300.0]
        self.user_failures[user_key].append(now)
        if len(self.user_failures[user_key]) >= 10:
            self.user_lockouts[user_key] = now + 300.0

    def record_login_success(self, username: str):
        if not username:
            return
        user_key = username.lower().strip()
        self.user_failures.pop(user_key, None)
        self.user_lockouts.pop(user_key, None)

    def reset(self):
        self.ip_attempts.clear()
        self.user_failures.clear()
        self.user_lockouts.clear()


login_limiter = LoginRateLimiter()
