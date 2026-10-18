# POS Retail VRNTAS

Punto de venta local para retail (ferretería) en México. Corre en Windows con un servidor y varias cajas conectadas por la red local, impresoras térmicas ESC/POS, cajón de dinero y lectores de código de barras USB. Funciona sin internet y tolera caídas breves de la red.

Incluye ventas con pagos mixtos, devoluciones, corte de caja por denominaciones, inventario con conteo físico, compras a proveedores, reportes, auditoría, respaldos automáticos y modo offline en las cajas.

Fuera del alcance actual: facturación electrónica (CFDI), ventas a crédito, módulo de clientes y promociones.

## Stack

| Capa | Tecnología |
|---|---|
| Backend | Python 3.13, Flask 3, SQLAlchemy 2.0, Marshmallow, Flask-JWT-Extended, Alembic |
| Base de datos | PostgreSQL 18 (extensión `pg_trgm` para la búsqueda) |
| Frontend | React 19, TypeScript, Vite, Tailwind 4, React Query, Zustand |
| Producción | Waitress como servicio de Windows (NSSM); el backend sirve el frontend compilado |
| Impresión | ESC/POS directo desde el servidor o con el agente de impresión de cada caja (`tools/print-agent`) |

## Inicio rápido (desarrollo)

Requisitos: Python 3.11 o superior, Node.js LTS y PostgreSQL 18.

```powershell
# 1. Base de datos y usuario (genera backend\.env con secretos aleatorios)
.\setup-db.ps1

# 2. Backend
cd backend
python -m venv venv
.\venv\Scripts\python.exe -m pip install -r requirements.txt -r requirements-dev.txt
.\venv\Scripts\python.exe -m flask --app run db upgrade
.\venv\Scripts\python.exe -m flask --app run seed
cd ..

# 3. Frontend
cd frontend
npm ci
cd ..

# 4. Arrancar ambos (SOLO DESARROLLO)
.\start.ps1
```

El frontend queda en `http://localhost:3000` y la API en `http://localhost:5000/api`. El primer administrador se crea en el seed con una contraseña temporal que hay que cambiar en el primer inicio de sesión.

Activa los hooks de git versionados (diseño y compilación antes de cada commit):

```powershell
powershell -ExecutionPolicy Bypass -File scripts/instalar-hooks.ps1
```

## Instalación en tienda

Sigue [`DEPLOYMENT.md`](DEPLOYMENT.md). En resumen:

- `install-production.ps1` hace la instalación inicial.
- `install-service.ps1` registra el servicio de Windows con Waitress en la red local.
- `update-production.ps1` actualiza con un respaldo previo.
- `tools/print-agent/install-agent.ps1` instala el agente en las cajas con impresora USB.

Ahí mismo están el alcance del modo offline, la impresora y el cajón por caja, y los folios.

## Respaldo y restauración

- **Respaldos automáticos** al cerrar cada caja, y manuales desde **Configuración → Respaldos**. Se guardan en `BACKUP_DIR` (por defecto `C:\ProgramData\pos-vrntas\backups`) con retención de 14 diarios y 8 semanales. Opcionalmente se copian a una USB (`USB_BACKUP_DIR`).
- **Restauración:** `.\restore-backup.ps1 -BackupFile <archivo.dump>`. Antes de restaurar hace un respaldo de seguridad, y aplica todo o nada (`--single-transaction`). El simulacro trimestral está en [`docs/simulacro-restauracion.md`](docs/simulacro-restauracion.md).
- **Estado:** `/api/health` reporta la base de datos, el espacio en disco y el último respaldo.

## Pruebas

```powershell
# Backend (usa pos_test_db; nunca toca pos_db)
cd backend
.\venv\Scripts\python.exe -m pytest -q

# Frontend
cd frontend
npm test            # Vitest (unitarias)
npm run test:e2e    # Playwright (flujos críticos; requiere backend y frontend corriendo)
npm run build       # TypeScript + Vite
```

Para que varias personas o agentes corran pytest a la vez sin pisarse, usa un esquema propio de `pos_test_db` con `TEST_DATABASE_URL`. La base ya tiene los esquemas `lane_a` a `lane_d`:

```powershell
$env:TEST_DATABASE_URL = "postgresql://<usuario>:<contraseña>@localhost:5432/pos_test_db?options=-csearch_path%3Dlane_a,public"
```

Prueba completa de la app con un solo comando (recorre login, usuarios, catálogo, compras, inventario, caja, ventas, devoluciones, corte, reportes, configuración, auditoría, permisos y respaldos contra un esquema nuevo de `pos_test_db`, que borra al terminar; nunca toca `pos_db`):

```powershell
backendenv\Scripts\python.exe tools\prueba_completa.py
```

Imprime cada prueba con ✅/❌ y guarda el reporte en `tools/reportes-prueba/`. Conviene correrla antes de cada actualización en tienda.

El CI (`.github/workflows/ci.yml`) corre en cada push y pull request:

- `pytest` contra PostgreSQL 18;
- el build y Vitest del frontend;
- `npm audit` y `pip-audit`.

## Diseño

La interfaz usa el sistema "Industry" (acero sobre fondo técnico, Barlow, esquinas rectas, claro y oscuro, contraste WCAG AA verificado). Guía y reglas: [`docs/sistema-de-diseno.md`](docs/sistema-de-diseno.md).

## Estructura

```text
backend/            API Flask
  app/api/          rutas (solo validan y serializan)
  app/services/     lógica de negocio y transacciones
  app/models/       modelos SQLAlchemy
  migrations/       migraciones Alembic
  tests/            pytest
frontend/           React + Vite
  src/pages/        pantallas
  src/components/   UI y layout
  src/stores/       Zustand (POS, sesión, conexión)
  e2e/              Playwright
tools/              verify_design.py, verify_code.py, bug_checker.py y print-agent/
scripts/            hooks de git versionados e instalador
docs/               revisión, plan de corrección y progreso
*.ps1, start.bat    instalación, arranque, servicio, actualización y restauración
```

## Agentes y plan de corrección

- [`AGENTS.md`](AGENTS.md) reúne el contexto y las reglas no negociables para cualquier agente: el test va primero, el dinero se calcula con `Decimal`, nunca se toca `pos_db` desde los tests y no se commitean secretos.
- Las reglas por capa están en `.agents/rules/`. Las skills del plan están en `.agents/skills/`: el orquestador, una por fase y el gate. Los seis revisores de solo lectura están en `.claude/agents/`.
- La fuente de verdad del avance es [`docs/review-2026-10-06/progreso.md`](docs/review-2026-10-06/progreso.md).
