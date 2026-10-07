---
name: fase-0-contencion
description: Ejecuta la Fase 0 (contención inmediata de seguridad) del plan de corrección del POS. Cierra la escritura arbitraria de archivos vía printer_path, regenera secretos, elimina admin123, agrega rate limit al login, excluye respaldos de git y apaga el modo debug. Úsala desde el orquestador o cuando se pida la fase 0 o alguna subfase 0.x.
---

# Fase 0: Contención inmediata (H-02, H-10, H-11, H-14, H-15)

**Rol:** implementador de seguridad. **Rama:** `fix/fase-0`. **Carril:** único (secuencial). La fase es corta, pero bloquea todo lo demás.

## 0.1 Cerrar la escritura arbitraria de archivos (H-02)
- **Archivos:** `backend/app/api/printing.py` (`_print_options`, endpoints de ticket y etiqueta) y `backend/app/services/printer_service.py` (`send_to_printer`).
- **Test primero** (`backend/tests/test_printer.py`):
  - `test_printer_path_del_cliente_se_ignora`: un usuario cajero hace POST con `{"send": true, "printer_path": "<tmp_path>/pwn.txt"}` → 400 o el campo se ignora, y el archivo **no existe**.
  - `test_impresora_no_disponible_da_503`: con `PRINTER_DEVICE_PATH` apuntando a un directorio inexistente → 503 con mensaje en español.
- **Cambio:**
  - `_print_options` devuelve solo `send`.
  - La ruta viene únicamente de `os.getenv("PRINTER_DEVICE_PATH")`. La impresora por caja llega en 4.2.
  - Rechazar rutas UNC (`\\`) y relativas.
  - Capturar `OSError` → `RuntimeError("Impresora no disponible: …")` → 503 en la API.
- **Frontend:** `frontend/src/api/printing.ts` deja de enviar `printer_path` (hoy ya no lo envía; verifícalo).

## 0.2 Secretos y credenciales (H-10, H-11)
- **0.2.1 Rotar el `.env` local.**
  - Generar con `.\backend\venv\Scripts\python.exe -c "import secrets;print(secrets.token_urlsafe(64))"` dos valores **distintos** para `SECRET_KEY` y `JWT_SECRET_KEY`.
  - Escribirlos en `backend/.env` **sin mostrarlos** en el chat ni en logs.
  - Avisar que todas las sesiones se cierran.
- **0.2.2 `backend/app/config.py`.**
  - Quitar los fallbacks `dev-secret-change-me` y `jwt-dev-secret`.
  - Agregar `validate_secrets(app)` en `create_app` que aborte si falta un secreto, si mide menos de 32 caracteres, si los dos son iguales o si contiene "cambiar". `TestConfig` define sus propios secretos largos.
  - **Test:** `test_config_rechaza_secretos_debiles`.
- **0.2.3 Instaladores.**
  - `install-production.ps1` genera los secretos (Python `secrets`) y escribe `.env` a partir de `.env.example` reemplazando los placeholders.
  - `setup-db.ps1` genera la contraseña de `pos_user`, la escribe en `DATABASE_URL`, usa `& "$env:PG_BIN\psql.exe"` con autodetección `C:\Program Files\PostgreSQL\*\bin` y revisa `$LASTEXITCODE`.
- **0.2.4 PostgreSQL local.** ⚠️ **Pide confirmación al usuario.**
  - `ALTER USER pos_user PASSWORD '<nuevo>'` y actualizar `.env`.
  - `listen_addresses = 'localhost'` en `postgresql.conf` y reiniciar el servicio.
  - Respaldar antes con `pg_dump` usando la ruta completa.
- **0.2.5 Seed** (`backend/app/seed.py:126-147`).
  - Crear el admin **solo si no existe ningún usuario**, con la contraseña de la variable `POS_ADMIN_PASSWORD` o una aleatoria que se imprime **una sola vez** en consola.
  - Agregar la columna `users.must_change_password` (migración) y ponerla en `True`.
  - El login devuelve `must_change_password`. El frontend redirige a una pantalla "Cambiar contraseña" y el backend bloquea el resto de endpoints (403 `{"code":"password_change_required"}`) hasta que se cambie.
  - Quitar `admin123` de `seed.py`, `start.bat` y `start.ps1`.
  - **Tests:** `test_seed_no_recrea_admin_si_hay_usuarios` y `test_must_change_password_bloquea`.
- **0.2.6 Rate limit en el login.**
  - Agregar `Flask-Limiter` a `requirements.txt`, o un contador propio en memoria por IP y usuario.
  - 5 intentos por minuto y bloqueo de 5 min por usuario tras 10 fallos.
  - **Test:** `test_login_rate_limit` (el 6.º intento → 429).

## 0.3 Respaldos fuera de git (H-14)
- `.gitignore`: agregar `backend/backups/`, `backups/`, `*.dump`, `*.sql`, `*.backup`, `backend/logs/` y `bug_report.md`.
- `backend/app/services/backup_service.py`: `BACKUP_DIR` por defecto en `%PROGRAMDATA%\pos-vrntas\backups` (en Windows), o `backups` fuera del repo si no existe.
- Documentarlo en `.env.example`.
- **Verificación:** `git check-ignore backend/backups/x.dump` coincide.

## 0.4 Apagar el modo debug (H-15)
- `backend/run.py`: `debug = os.getenv("FLASK_DEBUG") == "1"` y `host = os.getenv("POS_HOST", "127.0.0.1")`.
- `start.bat` y `start.ps1`: encabezado "SOLO DESARROLLO" y que no expongan la red. El uso en tienda va por `start-production.ps1` (waitress).

## Salida
Al terminar la 0.4, ejecuta `/gate-fase` con N=0. Recuerda al usuario:
- Que los secretos se rotaron.
- Que la contraseña del admin cambió (y dónde la puede ver, si se generó).
- Que el siguiente paso es la Fase 1.
