---
name: fase-6-calidad
description: Ejecuta la Fase 6 (calidad continua y deuda técnica) del plan de corrección del POS. Tests que detectan errores de transacción, tests de frontend (Vitest/Playwright), CI en GitHub Actions, dependencias, constraints e índices, y limpieza del frontend. Úsala desde el orquestador o cuando se pida la fase 6 o una subfase 6.x.
---

# Fase 6: Calidad continua y deuda técnica (H-32…H-35, H-41, H-45…H-48, H-50, H-52, H-55)

**Paralelismo:** es transversal. **Adelanta la 6.3 (CI) justo después del gate de la Fase 0** en un carril propio (`fix/fase-6-ci`), para que proteja las correcciones siguientes. Lo demás va después de la Fase 3.

## 6.1 Tests que sí detectan errores (H-34)
- `backend/tests/conftest.py:59-62`: el test client no debe correr dentro de un `app_context` abierto todo el test. Usa fixtures que hagan `db.session.remove()` después de cada request, o un context por request.
- Los servicios hacen `db.session.rollback()` ante una excepción (`sale_service.py:69,129,226` y similares).
- Los fixtures venden a `sale_price` (si no se hizo en la 1.1).
- Arregla los tests que fallen por este cambio: **son bugs reales**. Documenta cada uno en `progreso.md`.

## 6.2 Tests de frontend
- **Vitest y Testing Library:** `npm i -D vitest @testing-library/react jsdom`. Scripts `"test": "vitest run"` y `"test:watch"`.
- **Tests unitarios:**
  - `getCartTotals`: paridad con los casos del backend, como 2 × 12.85 al 16 % → 29.82.
  - `useSyncQueue`: sin duplicados, rechazo con 4xx y backoff.
  - `useBarcodeScanner`: ráfaga frente a tipeo humano.
  - `can()` y `formatQuantity`.
- **Playwright** (`npm i -D @playwright/test`, en `frontend/e2e/`): login, venta en efectivo con doble clic (1 venta), devolución parcial, corte que cuadra y cajero sin acceso a /usuarios. Correr contra `pos_test_db` con un seed de prueba.

## 6.3 CI y repositorio (H-50)
- **`.github/workflows/ci.yml`:**
  - Job `backend`: Ubuntu, servicio `postgres:18` con `pos_test_db`, Python 3.13, `pip install -r requirements.txt -r requirements-dev.txt` y `pytest -q`.
  - Job `frontend`: Node LTS, `npm ci`, `npm run build`, `npm test`.
  - Job `audit`: `npm audit --omit=dev --audit-level=high` y `pip-audit`.
  - Ajustar la URL de la base de datos de prueba por variable de entorno (`TEST_DATABASE_URL`) en `config.py:TestConfig`.
- **Hook pre-commit:** moverlo a `scripts/hooks/pre-commit` (sin `echo.`, con `python3`/`python` detectado) y añadir `scripts/instalar-hooks.ps1` (`git config core.hooksPath scripts/hooks`).
- **Scripts sueltos:** mover `bug_checker.py`, `verify_code.py` y `verify_design.py` a `tools/` y ajustar sus rutas.
- **`README.md`:** qué es, stack, inicio rápido para desarrollo, instalación en tienda (enlace a `DEPLOYMENT.md`), respaldo y restauración, estructura, cómo correr los tests y los agentes (`AGENTS.md`, `.agents/`, `.claude/agents/`).
- **`start.bat`:** `setlocal EnableDelayedExpansion` y `!ERRORLEVEL!`. **`start.ps1`:** abortar si fallan las migraciones (OPS-19).

## 6.4 Dependencias y configuración (H-35, H-45)
- `npm audit fix`, y revisar que react-router y axios no rompan el build.
- `requirements.txt`: `flask-cors>=6`, Flask 3.1.3, Werkzeug, PyJWT y Flask-JWT-Extended en sus últimas versiones de parche. Correr la suite completa.
- **CORS** (`app/__init__.py:15`): `origins` desde `CORS_ORIGINS` (por defecto el propio host). Sin CORS si `SERVE_FRONTEND`.
- **Paginación** en `/cash-register/sessions`, `/inventory/low-stock` y `/purchases/suppliers`, con los consumidores del frontend actualizados.

## 6.5 Modelo de datos (H-33, H-32, H-52)
- **Migración:**
  - CHECK `stock.quantity >= 0`, `payments.amount > 0`, `payments.change_amount >= 0`.
  - Índices en `sales.created_at`, `stock_movements.created_at`, `audit_logs(created_at)`, `audit_logs(user_id)`, `audit_logs(entity_type, entity_id)` y `sale_return_items.sale_item_id`.
  - Declarar `idx_products_name_trgm` en `Product.__table_args__` (`postgresql_using="gin"`, `postgresql_ops={"name": "gin_trgm_ops"}`).
- **`utils/errors.py`:**
  - Helper `parse_date()` → 400, usado en `reports.py:117,124,271,278,347,354` y `audit.py:42-46`.
  - Manejador global de `IntegrityError` → 409.
  - **Test:** `test_fecha_invalida_400`.
- **Folios sin huecos:** ⚠️ decisión del usuario. Si se requiere, asignar el folio después de validar, con una tabla contador y `with_for_update` en lugar de una secuencia.

## 6.6 Limpieza del frontend (H-41, H-46, H-47, H-48, H-55)
- **`main.tsx:12-18`:** registrar el service worker solo si `import.meta.env.PROD`.
- **`public/sw.js`:** `CACHE_NAME` con la versión del build. Corregir el fallback `(await caches.match("/")) ?? caches.match("/index.html")` (`:75`). No cachear `/api/config`.
- **Eliminar:** la dependencia `motion` y `src/graphify-out/` (ya ignorado; borrar del árbol). Usar `formatCurrency` en todas partes. Los `any` de `dashboard.tsx:11-23,74`, `app-shell.tsx:48` (usar `LucideIcon`), `pos.tsx:184` y `products.tsx:977-1004` (`unknown` con `isAxiosError`).
- **`useBarcodeScanner.ts`:** patrón "latest ref" para `onScan`, `preventDefault` de los caracteres en ráfaga y umbral configurable.
- **`api/sales.ts:72`:** `quantity` como string con `toFixed(3)`.
- **`api/client.ts`:** ante un 422 con un error de JWT, cerrar la sesión igual que con un 401.

## Cierre
Ejecuta `/gate-fase` con N=6 y luego `/revision-agentes` completo (los 6 revisores) para el cierre del plan.
