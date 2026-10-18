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

## Fase 1: Críticos
- [x] 1.1 RF-01 Escaneo `by-code` prioriza código de barras; SKU ≠ código de barras de otro
- [x] 1.2 RF-02, RF-03 Cantidades: máximo 3 decimales y `allows_fractions` en ventas y devoluciones
- [x] 1.3 RF-04 Reembolso acumulado sin exceder el total
- [x] 1.4 RF-05 Restauración revoca todas las sesiones
- [ ] **Gate 1**

## Fase 2: Altos
- [ ] 2.1 RF-06 Validación de configuración
- [ ] 2.2 RF-07 Costo promedio inicial
- [ ] 2.3 RF-08 Desactivar por PATCH exige permiso
- [ ] 2.4 RF-09 Alta de cajas
- [ ] 2.5 RF-10 Modo sin conexión ante 5xx / base caída
- [ ] 2.6 RF-52 "Algo salió mal" persistente: reintento de carga de páginas y ErrorBoundary por ruta
- [ ] **Gate 2**

## Fase 3: Medios
- [ ] 3.A RF-12, RF-13 · [ ] 3.B RF-11, RF-15 · [ ] 3.C RF-16…20 · [ ] 3.D RF-21…23 · [ ] 3.E RF-24, RF-28, RF-41, RF-42 · [ ] 3.F RF-25 · [ ] 3.G RF-14, RF-26, RF-27
- [ ] **Gate 3**

## Fase 4: Bajos
- [ ] RF-29…40, RF-43…51
- [ ] **Gate 4**
