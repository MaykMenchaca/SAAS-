# POS Retail VRNTAS: contexto para agentes

Sistema POS local para retail (ferretería) en México. Corre en Windows, con un servidor y cajas conectadas por LAN, impresoras ESC/POS y lectores USB.

- **Backend:** `backend/`, con Flask 3, SQLAlchemy 2, Marshmallow, Flask-JWT-Extended, Alembic y PostgreSQL 18.
- **Frontend:** `frontend/`, con React 19, TypeScript, Vite, Tailwind 4, React Query y Zustand.
- **Fuera del MVP:** CFDI, ventas a crédito, módulo de clientes y promociones.

## Estado actual: en corrección

Hay una revisión integral con 55 hallazgos más 17 de UI y un plan de corrección por fases:
- Hallazgos: `docs/review-2026-10-06/hallazgos.md` (IDs `H-xx` y `UI-xx`).
- Plan: `docs/review-2026-10-06/plan-correccion.md` (fases 0-6, subfases `N.M`).
- Orquesta y carriles de trabajo: `docs/review-2026-10-06/ORQUESTA.md`.
- **Progreso, la fuente de verdad del avance:** `docs/review-2026-10-06/progreso.md`.

Para trabajar en el plan, usa la skill `/orquestador-correccion`. Ella decide la siguiente subfase y llama a la skill de fase correspondiente (`/fase-0-contencion` … `/fase-6-calidad`) y al gate (`/gate-fase`).

## Comandos (Windows, desde `pos-system/`)

| Acción | Comando |
|---|---|
| Tests backend | `cd backend; .\venv\Scripts\python.exe -m pytest -q` (usa `pos_test_db`, es seguro) |
| Un test | `cd backend; .\venv\Scripts\python.exe -m pytest -q tests/test_sales.py -k nombre` |
| Migración nueva | `cd backend; .\venv\Scripts\python.exe -m flask db migrate -m "msg"` y luego `flask db upgrade` |
| Build frontend | `cd frontend; npm run build` |
| Gate completo | `powershell -File .agents/skills/gate-fase/scripts/gate.ps1 -Fase N` |
| Binarios de PostgreSQL | `C:\Program Files\PostgreSQL\18\bin\` (**no están en el PATH**) |

## Reglas no negociables

1. **El test va primero.** Cada corrección de lógica lleva un test de regresión que falla antes del cambio y pasa después. Nada se marca como hecho sin ese test o sin una verificación explícita.
2. **El dinero se calcula con `Decimal`** en el backend y con centavos enteros en el frontend. El servidor es la autoridad sobre los precios, el IVA, el cambio y los totales.
3. **No toques `pos_db`** (la base de desarrollo con datos) desde los tests ni los scripts. Los tests usan `pos_test_db`. Antes de una migración destructiva, haz un respaldo con `pg_dump` usando la ruta completa.
4. **Nunca imprimas ni commitees secretos.** No commitees `.env`, `backend/backups/`, `*.dump` ni `*.sql`. El repo es **público**.
5. **Haz cambios pequeños:** un commit por subfase, con el formato `fix(fase-N.M): <qué> (H-xx)`. No hagas `push` ni merge a `main` sin aprobación del usuario.
6. **No cambies el alcance.** Si encuentras un problema fuera de la subfase, anótalo en `progreso.md` → "Hallazgos nuevos" y no lo corrijas ahí.
7. **Todo en español:** mensajes de error al usuario, textos de la UI (con acentos) y la documentación.
8. Al terminar cada subfase, actualiza `progreso.md` con el estado, el commit, los tests añadidos y las notas.
