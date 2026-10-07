---
name: orquestador-correccion
description: Orquesta la ejecución del plan de corrección del POS (fases 0-6). Úsala cuando el usuario pida avanzar, continuar o ejecutar el plan de corrección, una fase o una subfase, o pregunte qué sigue. Lee el progreso, elige la siguiente subfase desbloqueada, delega en la skill de fase y cierra con el gate.
---

# Orquestador del plan de corrección

Eres el **orquestador**. No improvises correcciones: ejecutas el plan en `docs/review-2026-10-06/plan-correccion.md` respetando su orden, sus dependencias y sus gates.

## Archivos que gobiernan el trabajo
- `docs/review-2026-10-06/progreso.md`: estado de cada subfase (`[ ]` pendiente, `[~]` en curso, `[x]` hecha, `[!]` bloqueada). **Léelo primero y mantenlo al día.**
- `docs/review-2026-10-06/plan-correccion.md`: qué hacer en cada subfase.
- `docs/review-2026-10-06/hallazgos.md`: la evidencia (`archivo:línea`) de cada `H-xx` y `UI-xx`.
- `docs/review-2026-10-06/ORQUESTA.md`: los carriles paralelos y los roles.

## Algoritmo (una iteración)
1. **Lee** `progreso.md`. Si hay una subfase `[~]`, retómala. Si no, elige la primera `[ ]` cuyas dependencias estén `[x]` (ver el grafo en `ORQUESTA.md`).
   - **Nunca** empieces una fase si el gate de la anterior no está marcado como aprobado. Excepción: los carriles paralelos que `ORQUESTA.md` permite explícitamente.
2. **Rama:** trabaja en `fix/fase-N` (créala desde `main` si no existe: `git switch -c fix/fase-N`). Si estás en un carril paralelo, usa la rama del carril.
3. **Marca** la subfase como `[~]` en `progreso.md`.
4. **Delega** en la skill de la fase: `/fase-0-contencion`, `/fase-1-dinero`, `/fase-2-acceso`, `/fase-3-continuidad`, `/fase-4-operacion`, `/fase-5-ui` o `/fase-6-calidad`. Sigue su procedimiento para esa subfase, en este orden:
   1. Releer la evidencia en `hallazgos.md` y el código citado.
   2. Escribir el test de regresión y comprobar que **falla**.
   3. Implementar el cambio mínimo.
   4. Comprobar que el test **pasa** y que no rompe la suite del área.
5. **Verifica rápido:**
   - Backend: `pytest -q tests/<archivos del área>`.
   - Frontend: `npm run build`.
6. **Commit:** `fix(fase-N.M): <resumen> (H-xx, H-yy)`, con el cuerpo explicando el cambio y los tests añadidos.
   - El hook pre-commit compila el frontend y tarda unos minutos; es normal.
   - **No hagas push.**
7. **Actualiza** `progreso.md`: `[x]`, hash del commit, tests añadidos y notas o riesgos. Si encontraste algo fuera de alcance, agrégalo en "Hallazgos nuevos".
8. **Si la subfase era la última de la fase,** ejecuta `/gate-fase` con N. Si el gate falla, abre las subfases necesarias para corregirlo y **no avances**.
9. **Reporta al usuario** en 3-5 líneas: qué se cerró, qué evidencia lo respalda y qué sigue.

## Cuándo detenerte y preguntar al usuario
- Una decisión de producto que el plan deja abierta, por ejemplo el tope de descuento (1.1.2), los folios sin huecos (6.5) o HTTPS local (4.3).
- Cambios en `pos_db`, en servicios de Windows o en PostgreSQL (`listen_addresses`, contraseñas): **pide confirmación** y respalda antes con `& "C:\Program Files\PostgreSQL\18\bin\pg_dump.exe" -Fc -f backend\backups\pre-<fase>.dump <DATABASE_URL>`.
- Rotar secretos reales en `.env` (0.2.1): genera los valores, escríbelos en `.env` y **no los muestres**.
- Un test existente que tenga que cambiar de expectativa: explica por qué (por ejemplo, los fixtures que vendían a otro precio).
- Más de 2 intentos fallidos en el mismo problema: marca `[!]` con el diagnóstico y pregunta.

## Modo "revisión de cierre"
Cuando todas las fases bloqueantes (0-3) estén aprobadas, ejecuta `/revision-agentes` para volver a correr los 6 revisores y compara contra `hallazgos.md`. Los criterios de "listo para tienda" están al final de `plan-correccion.md`.
