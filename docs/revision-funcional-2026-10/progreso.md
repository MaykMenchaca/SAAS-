# Progreso: corrección de la revisión funcional

Rama: `fix/revision-funcional` (desde `feat/rediseno-industry` @ `6f5f9d8`). Hallazgos: [`hallazgos.md`](hallazgos.md) · Plan: [`plan-correccion.md`](plan-correccion.md).
Regla: test de regresión primero (`backend/tests/test_revision_funcional_<área>.py`), dinero con `Decimal`, migraciones a mano con una sola cabeza.

## Fase 0: Preparación
- [x] 0.1 `hallazgos.md` consolidado (47 RF) + reportes crudos en `anexos/`
- [x] 0.2 Flujos de navegador: devolución, corte y compras ✅; sin conexión → RF-10 (Medio, se corrige en 2.5); nuevos RF-49…51 (Bajos). Reportes, configuración y mantenimiento los cubrió QA-C por API
- [x] 0.3 Rama `fix/revision-funcional` + este archivo
- [x] 0.4 `tools/check_datos.py` (solo lectura)

### Datos dañados encontrados en `pos_db` (0.4, 2026-10-17) — reparación pendiente de decisión del usuario
| Chequeo | Registro | Detalle | Origen probable |
|---|---|---|---|
| RF-02/03 | Producto `TO-002` "Tuerca hexagonal 1/4 (50pz)" | stock 79.500 en unidad sin fracciones | venta id 3 con cantidad 0.500 (QA del 2026-10-07) |
| RF-04 | Venta `V-20261007-0011` | total $115.77, reembolsado $231.54 (el doble) | devoluciones de QA del 2026-10-07 |

Script de reparación (2026-10-18): `tools/reparar_datos_2026_10.py` — sin argumentos muestra el plan; `--probar` aplica en una transacción, corre los chequeos y deshace; `--aplicar` crea un respaldo `pre-reparacion` y repara (quita la partida duplicada de la devolución #4 → reembolso $115.77; ajuste +0.500 de TO-002 → 80 pz; ambos auditados como `reparacion_datos`). Probado con `--probar` sobre `pos_db`: deja 1 aviso esperado (la partida histórica de 0.5 pz de V-20261007-0003). **Pendiente: aplicar con aprobación del usuario.**

## Fase 1: Críticos
- [x] 1.1 RF-01 Escaneo `by-code` prioriza código de barras; SKU ≠ código de barras de otro
- [x] 1.2 RF-02, RF-03 Cantidades: máximo 3 decimales y `allows_fractions` en ventas y devoluciones
- [x] 1.3 RF-04 Reembolso acumulado sin exceder el total
- [x] 1.4 RF-05 Restauración revoca todas las sesiones
- [x] **Gate 1** (aprobado 2026-10-17: pytest completo local y CI de GitHub en verde)

## Fase 2: Altos
- [x] 2.1 RF-06 Validación de configuración
- [x] 2.2 RF-07 Costo promedio inicial
- [x] 2.3 RF-08 Desactivar por PATCH exige permiso
- [x] 2.4 RF-09 Alta de cajas
- [x] 2.5 RF-10 Modo sin conexión ante 5xx / base caída
- [x] 2.6 RF-52 "Algo salió mal" persistente: reintento de carga de páginas y ErrorBoundary por ruta
- [x] **Gate 2** (aprobado 2026-10-18: pytest completo local y CI en verde)

## Fase 3: Medios
- [x] 3.A RF-12, RF-13 · [x] 3.B RF-11, RF-15 · [x] 3.C RF-16…20 · [x] 3.D RF-21…23 · [x] 3.E RF-24, RF-28, RF-41, RF-42 · [x] 3.F RF-25 · [x] 3.G RF-14, RF-26, RF-27
  - 3.A/3.B/3.G (carril X, `test_revision_funcional_x.py`): `DataError` → 400 y HTTPException con su código; topes de dinero y cantidades en ventas y caja; folio pedido tras validar (folio provisional `TMP-`); ticket marca CANCELADA / CON DEVOLUCIÓN; respaldos con nombre único (O_EXCL), solo archivos listados en borrar/verificar, sin rutas absolutas, una restauración a la vez (candado de hilo + `.restore.lock`)
  - 3.E/3.F (carril Z, `test_revision_funcional_z.py`): login sin distinguir mayúsculas; bloqueo por usuario existente + IP; límite por IP solo cuenta fallos; `change-password` entrega refresh nuevo; reporte de ventas une días/métodos con devoluciones y permite netos negativos (el tablero sigue recortando a 0). RF-12 solo en login/change-password
  - 3.C/3.D (carril Y, `test_revision_funcional_y.py`): etiqueta con IVA; SKU/código de barras sin espacios y únicos sin mayúsculas; unidades únicas (sin acentos ni mayúsculas); fracciones en ajustes, conteos y OC; categoría con productos activos no se desactiva; topes de precio/IVA/cantidades; reactivar proveedores (RFC de inactivo sugiere reactivar); OC parcial → «Cerrar orden» (estado `cerrada`); `GET /inventory/summary` para los KPI y `low-stock` incluye agotados sin mínimo
  - Pendiente detectado: `api/reports.py` `low_stock_count` (Dashboard y badge) aún usa la regla vieja; alinear en Fase 4. Sin índices únicos en BD (habría que depurar duplicados de `pos_db` primero)
- [x] **Gate 3** (aprobado 2026-10-18: pytest completo local y CI en verde)

## Fase 4: Bajos
- [ ] RF-29…40, RF-43…51
  - Carril P (`test_revision_funcional_p.py`, commits 924e646 y 7eb83f4): [x] RF-29 (parte P: venta inexistente 404, token inválido o de otro tipo 401) · [x] RF-30 · [x] RF-31 (parte P: 503 de impresión genérico) · [x] RF-43 · [x] RF-44 · [x] RF-45 · [x] RF-46 · [x] RF-47 (`PRE_RESTORE_KEEP` = 5) · [x] pendientes del Dashboard (`low_stock_count` = agotados + bajo mínimo como `/inventory/summary`; neto del día, mes y turno sin recortar, en rojo si es negativo)
  - [x] Carril R (frontend: devoluciones, corte, e2e): RF-48, RF-49, RF-50, RF-51. Estimado de reembolso = `_refund_upto` del servidor (acumulado por partida, HALF_EVEN, enteros); devoluciones muestran todos los métodos de pago; el corte adopta la sesión que devuelve el cierre (hora y observaciones); `e2e/critical-flows.spec.ts` reescrito contra los endpoints reales (3 flujos, falla ante endpoints no simulados; `npx tsc --noEmit -p e2e/tsconfig.json`; `E2E_PORT`/`E2E_CHANNEL` para usar otro puerto y el Chrome del equipo)
  - Carril Q (`test_revision_funcional_q.py`): [x] RF-29 (conteo y OC inexistentes → 404) · [x] RF-32 · [x] RF-33 · [x] RF-34 · [x] RF-35 · [x] RF-36 · [x] RF-37 · [x] RF-38 · [x] RF-39 · [x] RF-40
    - Regla del conteo (RF-32): la diferencia se calcula contra el stock AL CAPTURAR y al cerrar se aplica sobre el stock actual (las ventas posteriores se respetan). Un ajuste manual (absoluto) durante el conteo anula la captura de ese producto (queda sin contar, con nota) porque es una existencia física más reciente; si se recaptura, la diferencia es contra el stock ajustado. Si una diferencia dejaría stock negativo, el cierre responde 409 `count_negative_stock` con el producto y no aplica nada. El conteo incluye inactivos con existencias
    - Movimientos (RF-33): en un `ajuste`, `quantity` es el cambio con signo (nuevo − anterior); entradas y salidas siguen positivas. Los movimientos viejos en `pos_db` conservan el valor anterior (stock nuevo o `abs(delta)`); ningún reporte suma `quantity` y el historial del frontend usa `new_stock − previous_stock`
    - RF-38: la cantidad 0.0004 ya la rechazaba RF-12 (se deja la prueba); el folio de OC se pide después de validar
- [x] **Gate 4** (aprobado 2026-10-18: pytest completo local, CI y Playwright en verde)
