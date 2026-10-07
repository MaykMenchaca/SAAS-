---
name: gate-fase
description: Puerta de calidad al cerrar una fase del plan de corrección del POS. Úsala cuando termine la última subfase de una fase o el usuario pida verificar una fase. Ejecuta la suite, el build, las verificaciones específicas de la fase y la re-revisión del agente revisor correspondiente.
---

# Gate de fase

Recibe el número de fase N. **Solo apruebas si todo pasa.** Si algo falla, reporta la falla y crea las subfases de corrección necesarias en `progreso.md`.

## 1. Verificación automática
```powershell
powershell -ExecutionPolicy Bypass -File .agents/skills/gate-fase/scripts/gate.ps1 -Fase N
```
El script corre `pytest` completo, `npm run build` y los chequeos por fase (greps de regresión), y termina con exit code distinto de 0 si algo falla. Copia el resumen final en `progreso.md`.

## 2. Verificación manual por fase

| Fase | Qué comprobar además del script | Revisores a volver a correr (`/revision-agentes`) |
|---|---|---|
| 0 | Un JWT firmado con el secreto de ejemplo da 401. 10 logins fallidos dan 429. `POST /api/printing/...` con `printer_path` no crea ningún archivo. `git check-ignore backend/backups/x.dump` coincide. `run.py` no tiene debug. | `revisor-seguridad` |
| 1 | En el navegador: doble clic en Cobrar crea 1 venta. Vender más que el stock muestra un error (no "Venta completada"). "Exacto" cuadra al centavo. El escenario QA-08 (ventas, devolución parcial y total, corte) da diferencia $0.00. | `revisor-backend`, `qa-funcional` (flujos 3, 4, 5 y 9) |
| 2 | `audit_logs` crece tras login, venta y configuración (consulta en `pos_test_db` o en la UI de Auditoría). Un token después del logout da 401. Un cajero no ve Usuarios, Reportes ni Configuración. Cambiar de usuario no muestra datos del anterior. | `revisor-seguridad`, `qa-funcional` (flujos 1, 2 y 10) |
| 3 | Respaldo manual y automático creados. Restauración en una base temporal con conteos iguales. `/api/health` reporta la BD y el último respaldo. Instalación en limpio siguiendo solo `DEPLOYMENT.md` (si hay una VM disponible). | `revisor-operacion` |
| 4 | Una venta a las 19:00 hora local se cuenta en el día local. Ticket con los datos de la empresa y acentos correctos. Cola offline sin duplicados (simular el servidor caído). | `revisor-operacion`, `qa-funcional` |
| 5 | Contraste ≥4.5:1 en botones primarios y badges. Foco visible con Tab en el sidebar. A 375 y 768 px el contenido se ve sin hacer scroll del menú. | `revisor-visual`, `revisor-frontend` |
| 6 | CI en verde en GitHub. `npm audit --omit=dev` sin altas. Tests de frontend corriendo. | `revisor-frontend`, `revisor-backend` |

## 3. Criterio de aprobación
- 0 tests fallidos y el build sin errores.
- Los hallazgos de la fase están cerrados según los revisores. Si el revisor reporta un hallazgo **nuevo** Crítico o Alto, la fase no se aprueba: agrégalo como subfase N.x.
- Marca en `progreso.md`: `Gate fase N: APROBADO (fecha, commit)` o `RECHAZADO` con la lista de motivos.
- Al aprobar, sugiere al usuario hacer el merge de `fix/fase-N` a `main` y el push. **No lo hagas sin su aprobación.**
