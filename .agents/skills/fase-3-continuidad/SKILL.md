---
name: fase-3-continuidad
description: Ejecuta la Fase 3 (continuidad - respaldos, restauración, instalación como servicio de Windows, observabilidad, seed y configuración) del plan de corrección del POS. Úsala desde el orquestador o cuando se pida la fase 3 o una subfase 3.x.
---

# Fase 3: Continuidad (H-12, H-13, H-23, H-36, H-37, H-42, H-51)

**Requisito:** gate de la Fase 2 aprobado. Se puede adelantar en paralelo a la Fase 2 en un carril propio (`fix/fase-3`) porque toca otros archivos. Ver `ORQUESTA.md`.
**Entorno real:** Windows 11, servicio `postgresql-x64-18`, binarios en `C:\Program Files\PostgreSQL\18\bin` (no están en el PATH).

## 3.1 Respaldos que funcionan (H-12, H-42)
- **Archivo:** `backend/app/services/backup_service.py`.
- **3.1.1** `_pg_bin(name)`:
  1. `PG_BIN_DIR` del entorno.
  2. Si no, `shutil.which(name)`.
  3. Si no, el `glob` de `C:\Program Files\PostgreSQL\*\bin` con la versión mayor.
  4. Si nada existe → `RuntimeError` con un mensaje claro.
  
  Se usa en `pg_dump` (`:71-92`) y `pg_restore` (`:161`). Al arrancar, registrar un warning si no se encuentra.
  - **Test:** `test_pg_bin_resuelve_por_env_y_glob` (con monkeypatch).
- **3.1.2** En `api/cash_register.py:104-111`:
  - El respaldo corre en un `threading.Thread` con `app.app_context()`.
  - Guardar el resultado en `config` (`last_backup_at`, `last_backup_ok`, `last_backup_error`).
  - La respuesta del cierre incluye `backup: "en_curso"`.
  - `cash-cut.tsx` muestra un toast de advertencia si `/api/health` reporta que el último respaldo falló.
- **3.1.3** Comando `flask backup` (`app/cli.py`), más un script `scripts/registrar-tarea-respaldo.ps1` que crea una Tarea programada diaria a las 23:30 con `schtasks`. ⚠️ **Pide confirmación antes de registrarla.**
- **3.1.4**
  - Extensión `.dump`. `list_backups` acepta `.dump` y `.sql`.
  - Borrar el archivo parcial si falla.
  - Retención: `BACKUP_KEEP_DAILY=14` y `BACKUP_KEEP_WEEKLY=8`.
  - Capturar `OSError` de la copia a USB → `usb_copied: false` con un aviso. `api/backup.py` captura `OSError`.
  - **Tests:** de retención y de USB que falla.
- **3.1.5** `BACKUP_OFFSITE_DIR`, opcional (carpeta sincronizada con la nube o NAS): copia y registro de `last_offsite_at`.
- **3.1.6** El último respaldo, el offsite y su estado se muestran en Configuración → Respaldos.

## 3.2 Restauración segura (H-13)
- **`restore-backup.ps1`:**
  - Leer `DATABASE_URL` de `backend\.env`.
  - Resolver `pg_restore` igual que en 3.1.1.
  - Abortar si el servicio o puerto del POS (5000) responde.
  - Hacer un respaldo previo automático (`pre-restore-<fecha>.dump`).
  - `pg_restore --clean --if-exists --single-transaction --exit-on-error`.
  - Revisar `$LASTEXITCODE` en cada paso.
- **Test de integración** `tests/test_backup_real.py` (marcado `@pytest.mark.integration` y omitido si no hay binarios):
  1. `pg_dump` de `pos_test_db`.
  2. Restore en `pos_restore_tmp`.
  3. Comparar los conteos de las tablas principales.
  4. Borrar la base temporal.
- **Documentar** en `DEPLOYMENT.md` el simulacro trimestral.

## 3.3 Instalación y servicio (H-23, H-37, H-51)
- **3.3.1** `scripts/instalar-servicio.ps1`: NSSM (documentar la descarga) o `pywin32`.
  - Servicio `POS-VRNTAS`: waitress con `--threads=8`, `AppDirectory=backend`, inicio automático, dependencia `postgresql-x64-18`, reinicio ante falla y logs en `backend\logs`.
  - ⚠️ **Requiere administrador y confirmación del usuario.**
- **3.3.2** `install-production.ps1`, `build-production.ps1`, `setup-db.ps1` y `start-production.ps1`:
  - `$LASTEXITCODE` después de cada comando nativo.
  - Validar Python ≥3.10.
  - `npm ci`.
  - Separar `requirements-dev.txt` (pytest).
  - Regla de firewall `New-NetFirewallRule` para el puerto 5000 (con confirmación).
- **3.3.3** Mover las secuencias `sale_folio_seq` y `purchase_order_folio_seq` (`seed.py:199-200`) a una migración idempotente (`CREATE SEQUENCE IF NOT EXISTS`).
  - El seed sincroniza los permisos de los roles del sistema (agrega los que falten).
  - `start-production.ps1` deja de correr el seed en cada arranque: solo `flask db upgrade`.
  - **Test:** `test_seed_sincroniza_permisos`.
- **3.3.4** Completar `.env.example` con `PG_BIN_DIR`, `PRINTER_DEVICE_PATH`, `BUSINESS_NAME`, `APP_TIMEZONE`, `BACKUP_*`, `POS_HOST` y `FLASK_DEBUG`. Quitar `FLASK_ENV`.
  - Reescribir `DEPLOYMENT.md` con: requisitos previos, instalación, servicio, firewall, secretos, respaldo y restauración, y un checklist posterior a la instalación.

## 3.4 Observabilidad (H-36)
- `app/__init__.py`: `RotatingFileHandler` en `backend/logs/pos.log` (5 MB × 10) con formato `%(asctime)s %(levelname)s %(name)s %(message)s`.
- `/api/health` (`api/__init__.py:29-31`): `SELECT 1`, `last_backup_at`/`ok`, espacio libre del disco de respaldos y versión. Si la BD no responde → 503.
- `utils/errors.py`: un 500 incluye `error_id` (uuid4) y el traceback se registra con ese id.
- `api/__init__.py:22-27`: si un blueprint falla al importarse → `raise` (fallar al arrancar).
- **Tests:** `test_health_reporta_bd` y `test_500_incluye_error_id`.

## Cierre
Ejecuta `/gate-fase` con N=3. Incluye la restauración real en una base temporal y, si el usuario lo aprueba, el registro del servicio.
