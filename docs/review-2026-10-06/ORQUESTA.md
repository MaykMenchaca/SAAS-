# Orquesta de agentes: ejecución del plan de corrección en Antigravity

Este documento explica **cómo ejecutar** el [plan-correccion.md](plan-correccion.md) con agentes de Antigravity: qué roles hay, qué se puede hacer en paralelo y qué prompt pegar en cada conversación del **Agent Manager**.

## 1. Piezas instaladas en el repo

| Pieza | Ruta | Cómo la usa Antigravity |
|---|---|---|
| Contexto y reglas globales | `AGENTS.md` (raíz de `pos-system`) | Se carga siempre (`always_on`) |
| Reglas del backend | `.agents/rules/backend.md` | Se activa automáticamente con `backend/**/*.py` |
| Reglas del frontend | `.agents/rules/frontend.md` | Se activa con `frontend/src/**` |
| **Orquestador** | `.agents/skills/orquestador-correccion/` | `/orquestador-correccion` |
| Skills de fase | `.agents/skills/fase-0-contencion` … `fase-6-calidad` | `/fase-N-…`, o las invoca el orquestador |
| Gate de calidad | `.agents/skills/gate-fase/` (+ `scripts/gate.ps1`) | `/gate-fase` |
| Revisores (6) | `.agents/skills/revision-agentes/` → `.claude/agents/*.md` | `/revision-agentes` |
| Estado compartido | `docs/review-2026-10-06/progreso.md` | Lo leen y escriben todos los agentes |

> **Nota:** se usan **Skills** y no Workflows porque Antigravity deja de soportar los workflows el **19 de octubre de 2026** y recomienda migrar a Skills.

## 2. Roles de la orquesta

| Rol | Quién lo ejecuta | Responsabilidad | Puede escribir código |
|---|---|---|---|
| **Orquestador** | Conversación principal con `/orquestador-correccion` | Elige la siguiente subfase, actualiza `progreso.md`, corre los gates y pide decisiones al usuario | Solo `progreso.md` |
| **Implementador backend** | Conversación de carril A | Ejecuta las subfases de backend de la skill de fase. El test va primero | Sí (`backend/`, scripts `.ps1`) |
| **Implementador frontend** | Conversación de carril B | Ejecuta las subfases de frontend | Sí (`frontend/`) |
| **Implementador ops** | Conversación de carril C | Fase 3, CI (6.3), scripts, `DEPLOYMENT.md` | Sí (scripts, docs, `.github/`) |
| **Gate** | `/gate-fase N` | Suite, build, chequeos de regresión y verificación manual | No |
| **Revisores** (6) | `/revision-agentes` | Re-revisión de solo lectura al cerrar fases | No |

## 3. Grafo de dependencias y carriles paralelos

```
F0 (secuencial, 1 agente)
 │
 ├──► F6.3 CI ─────────────── (carril C, en paralelo desde aquí)
 │
 ▼
F1 ─ carril A: backend 1.1 → 1.2.1 → 1.3 → 1.4.1 → 1.5.1-3 → 1.6 → 1.7
     carril B: frontend (espera el contrato de 1.2.1 y 1.4.1) 1.2.2 → 1.4.2 → 1.4.3 → 1.5.4
     └─ merge A+B → gate F1
 │
 ├──► F3 (carril C: respaldos, servicio, observabilidad), en paralelo a F2
 ▼
F2 ─ carril A: 2.1 → 2.2 → backend de 2.3 y 2.5
     carril B: 2.3 (UI) → 2.4 → 2.5 (UI)
     └─ gate F2
 │
 ▼  (gate F3 debe estar aprobado)
F4 (carril A backend) ║ F5 (carril B frontend) ║ F6 restante (carril C)
     └─ gates F4, F5, F6 → /revision-agentes completo → criterios "listo para tienda"
```

**Reglas de paralelismo:**
1. Cada carril trabaja en **su propia rama y su propio worktree**, para no pisarse archivos en el mismo checkout:
   ```bash
   git worktree add ../pos-carril-a fix/fase-1-backend
   ```
   ```bash
   git worktree add ../pos-carril-b fix/fase-1-frontend
   ```
   En Antigravity, abre cada worktree como un workspace distinto en el Agent Manager.
2. **Contratos antes que consumidores.** Cuando A define un endpoint nuevo (`/sales/quote`, `client_uuid`, `/config/branding`, `open_sessions`), lo documenta en `progreso.md` → "Contratos de API" **antes** de que B lo consuma.
3. `progreso.md` se edita solo en la rama del orquestador (`main` local o `fix/orquesta`). Los carriles reportan su avance al orquestador, o lo editan en su rama y el orquestador consolida al hacer merge.
4. **Merge** hacia la rama de fase y luego a `main` solo tras un gate aprobado y **con la aprobación del usuario**. No se hace push sin pedirlo.
5. Los revisores QA y Visual nunca corren en paralelo entre sí, porque comparten el navegador y los datos.

## 4. Prompts para el Agent Manager (copiar y pegar)

**Orquestador (conversación principal, workspace `pos-system`):**
> Usa /orquestador-correccion. Lee docs/review-2026-10-06/progreso.md y ejecuta la siguiente subfase desbloqueada siguiendo AGENTS.md. Detente y pregúntame antes de cualquier decisión marcada con ⚠️, cambios a pos_db o PostgreSQL, push o merge.

**Carril A (backend), workspace `../pos-carril-a`:**
> Eres el implementador backend del carril A. Usa /fase-1-dinero (cambia el número según la fase) y ejecuta SOLO las subfases marcadas "(A)" o de backend, en orden. Para cada una, primero el test que falla, luego el cambio y luego el test que pasa. Haz un commit `fix(fase-N.M): … (H-xx)`. Publica los contratos de API nuevos en progreso.md → "Contratos de API". No toques frontend/.

**Carril B (frontend), workspace `../pos-carril-b`:**
> Eres el implementador frontend del carril B. Usa /fase-1-dinero (o la fase actual) y ejecuta SOLO las subfases "(B)" o de frontend. Antes de consumir un endpoint nuevo, verifica que su contrato esté en progreso.md → "Contratos de API". Al terminar cada subfase, verifica con `npm run build` y en el navegador. No toques backend/.

**Carril C (ops y CI), workspace `../pos-carril-c`:**
> Eres el implementador de operaciones. Ejecuta /fase-6-calidad subfase 6.3 (CI) y después /fase-3-continuidad. Pide confirmación antes de registrar servicios, tareas programadas, reglas de firewall o tocar PostgreSQL.

**Gate:**
> Usa /gate-fase con N=<fase>. Ejecuta el script y la verificación manual de la tabla, y escribe el resultado en progreso.md.

**Re-revisión:**
> Usa /revision-agentes con los revisores <lista> y consolida en docs/review-<fecha>/re-revision.md comparando contra hallazgos.md.

## 5. Antes de empezar (una sola vez)
1. Commitea en `main` esta orquesta: `AGENTS.md`, `.agents/`, `.claude/agents/` y `docs/review-2026-10-06/`.
2. Decide si vas a restaurar `pos_db` desde `backend/backups/pre-review-2026-10-06.dump`, porque QA dejó datos de prueba. El `.dump` no se commitea.
3. Abre `pos-system` en Antigravity y lanza el prompt del **Orquestador**.
