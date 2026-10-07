---
name: revision-agentes
description: Ejecuta uno o varios de los 6 agentes revisores del POS (backend, frontend, seguridad, operación, QA funcional, visual) en modo solo lectura y compara contra los hallazgos previos. Úsala para la re-revisión al cerrar una fase, para una auditoría completa, o cuando el usuario pida revisar el sistema.
---

# Orquesta de revisores (solo lectura)

Las definiciones de los 6 revisores están en `.claude/agents/<nombre>.md`. Son las mismas que usó la revisión del 2026-10-06. En Antigravity:
- **Ignora** la línea `tools:` del frontmatter. Usa las herramientas equivalentes: terminal, lectura de archivos y el **browser agent** de Antigravity en lugar de `mcp__Claude_Browser__*`.
- Respeta su regla: **SOLO LECTURA.** No editan código. Los de navegador pueden crear datos `QA-` en la base de desarrollo, pero solo después de un respaldo.

| Revisor | Archivo | Requiere el sistema corriendo | Prefijo |
|---|---|---|---|
| Backend | `.claude/agents/revisor-backend.md` | No (corre pytest) | BE |
| Frontend | `.claude/agents/revisor-frontend.md` | No (corre el build) | FE |
| Seguridad | `.claude/agents/revisor-seguridad.md` | No | SEC |
| Operación | `.claude/agents/revisor-operacion.md` | No | OPS |
| QA funcional | `.claude/agents/qa-funcional.md` | Sí (localhost:3000 y :5000) | QA |
| Visual | `.claude/agents/revisor-visual.md` | Sí | UI |

## Procedimiento
1. **Elige** los revisores (todos, o los que indique `/gate-fase` para esa fase).
2. **Paralelismo** (Agent Manager): los 4 estáticos pueden ir en conversaciones paralelas. QA y Visual van **uno después del otro**, porque comparten el navegador y los datos.
3. **Antes de QA o Visual:**
   - Arranca el sistema: el backend con `cd backend; .\venv\Scripts\python.exe run.py` (o waitress, si la fase 0 ya cambió el arranque) y el frontend con `cd frontend; npm run dev`.
   - Haz un respaldo con `pg_dump` usando la ruta completa.
   - Inicia sesión con el admin del seed **actual**. Desde la fase 0.2 ya no es `admin123`: pide la credencial al usuario.
4. **A cada revisor** pásale el contenido de su archivo de definición más este contexto: "Hallazgos previos en `docs/review-2026-10-06/hallazgos.md`. Para cada uno del área, indica CERRADO / ABIERTO / REGRESIÓN con evidencia. Reporta los nuevos con el formato del archivo."
5. **Consolida** en `docs/review-<fecha>/re-revision.md`:
   - Tabla de hallazgos previos con su estado.
   - Hallazgos nuevos agrupados, con un ID `N-xx` y su severidad.
   - Resultado real de pytest y del build.
6. **Agrega** los hallazgos nuevos Críticos o Altos a `progreso.md` → "Hallazgos nuevos". El orquestador decide en qué fase entran.
