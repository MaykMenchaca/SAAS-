import time
from collections import defaultdict

IP_WINDOW = 60.0          # segundos
IP_MAX_FAILURES = 5       # fallos por IP en la ventana
USER_WINDOW = 300.0       # segundos
USER_MAX_FAILURES = 10    # fallos de un usuario desde una IP en la ventana
USER_LOCKOUT = 300.0      # duración del bloqueo


class LoginRateLimiter:
    """Límite de intentos de inicio de sesión, en memoria del proceso.

    Decisiones (RF-28, RF-41):
    - Por IP solo cuentan los fallos: los inicios de sesión correctos no consumen el límite.
    - El bloqueo por usuario solo se lleva para usuarios que EXISTEN (la llave es su id, así que
      todas las variantes de mayúsculas que resuelven al mismo usuario comparten contador y los
      nombres inexistentes no dejan rastro).
    - La llave del bloqueo es usuario + IP: quien no tiene la contraseña solo se bloquea a sí mismo
      y no puede dejar fuera al administrador desde su propia caja. El límite por IP sigue frenando
      la fuerza bruta desde una misma máquina.
    """

    def __init__(self):
        # Reloj inyectable para las pruebas
        self.clock = time.time
        # ip -> marcas de tiempo de intentos fallidos
        self.ip_failures = defaultdict(list)
        # (user_id, ip) -> marcas de tiempo de intentos fallidos
        self.user_failures = defaultdict(list)
        # (user_id, ip) -> fin del bloqueo
        self.user_lockouts = {}

    def is_ip_limited(self, ip: str) -> bool:
        now = self.clock()
        recent = [t for t in self.ip_failures.get(ip, []) if now - t < IP_WINDOW]
        if recent:
            self.ip_failures[ip] = recent
        else:
            self.ip_failures.pop(ip, None)
        return len(recent) >= IP_MAX_FAILURES

    def record_ip_failure(self, ip: str):
        self.ip_failures[ip].append(self.clock())

    def is_user_locked(self, user_id, ip: str) -> bool:
        if user_id is None:
            return False
        key = (user_id, ip)
        lockout_until = self.user_lockouts.get(key)
        if lockout_until is None:
            return False
        if self.clock() < lockout_until:
            return True
        del self.user_lockouts[key]
        self.user_failures.pop(key, None)
        return False

    def record_login_failure(self, user_id, ip: str):
        if user_id is None:
            return
        now = self.clock()
        key = (user_id, ip)
        failures = [t for t in self.user_failures.get(key, []) if now - t < USER_WINDOW]
        failures.append(now)
        self.user_failures[key] = failures
        if len(failures) >= USER_MAX_FAILURES:
            self.user_lockouts[key] = now + USER_LOCKOUT

    def record_login_success(self, user_id, ip: str):
        if user_id is None:
            return
        self.user_failures.pop((user_id, ip), None)
        self.user_lockouts.pop((user_id, ip), None)

    def reset(self):
        self.ip_failures.clear()
        self.user_failures.clear()
        self.user_lockouts.clear()


login_limiter = LoginRateLimiter()
