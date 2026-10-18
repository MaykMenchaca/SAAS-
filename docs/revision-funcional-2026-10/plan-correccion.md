# Plan: Corrección de los hallazgos de la revisión funcional

## Contexto
La revisión funcional del POS ya se hizo: tres agentes por API sobre los esquemas aislados `qa_api_a/b/c`, más mis pruebas en el navegador sobre `shots`. Encontró **54 hallazgos**: 5 Críticos, 4 Altos, 14 Medios, 31 Bajos.
- **Los Críticos tocan dinero, inventario o seguridad:**
  - el escaneo devuelve el producto equivocado;
  - se aceptan devoluciones con fracciones de pieza;
  - las cantidades con más de 3 decimales crean inventario fantasma;
  - las devoluciones parciales reembolsan de más;
  - la restauración no revoca todas las sesiones.
- **Fuente de cada hallazgo:** los reportes crudos están en el scratchpad (`qa_report_A.md`, `qa_report_B.md`, `qa_report_C.md`, `qa_report_UI.md`). En cada uno hay archivo:línea, pasos y folios.
- **Decisiones del usuario:**
  - rama nueva `fix/revision-funcional` creada desde `feat/rediseno-industry`;
  - primero se fusiona el rediseño a `main` y las correcciones van en otro PR;
  - se corrige todo, por prioridad.

## Fase 0: Preparación
- **0.1** Consolidar `docs/revision-funcional-2026-10/hallazgos.md` con el formato de `docs/review-2026-10-06/hallazgos.md`:
  - IDs `RF-NN` con la fuente `QA-A/B/C/UI-NN`;
  - severidad, evidencia y corrección propuesta;
  - matriz de cobertura;
  - qué datos quedaron en cada esquema.
- **0.2** Terminar los flujos de navegador que quedaron sin probar:
  - sin conexión (repro del error "Error al procesar la lectura del código");
  - devolución, corte por denominaciones, compras, reportes/CSV, configuración y aviso de mantenimiento.
  - Lo que salga se añade a `hallazgos.md`.
- **0.3** Crear `fix/revision-funcional` desde `feat/rediseno-industry` (`6f5f9d8`) y `docs/revision-funcional-2026-10/progreso.md` con las fases de abajo.
- **0.4** Escribir `tools/check_datos.py`, un script de solo lectura que busca en `pos_db` datos ya dañados por los Críticos:
  - stock fraccionario en unidades sin fracciones;
  - cantidades con más de 3 decimales;
  - reembolsos acumulados mayores al total de la venta;
  - SKU iguales al código de barras de otro producto.
  - Solo reporta. Cualquier reparación se decide con el usuario.

**Regla de trabajo para todo el plan:**
- **Test primero:** cada hallazgo lleva un test de regresión en `backend/tests/test_revision_funcional_<area>.py` que falla antes del cambio y pasa después.
- **Dinero:** siempre con `Decimal`.
- **Migraciones:** se escriben a mano, una sola cabeza.

## Fase 1: Críticos (gate antes de seguir)
| Sub | Hallazgos | Cambio | Archivos |
|---|---|---|---|
| 1.1 | RF Crít. escaneo (QA-B-01) | El orden de `by-code` usa `coalesce(lower(barcode)=code, false) DESC` / `nulls_last`, con prioridad al código de barras como `offline-catalog.ts:128`. Se valida al crear o editar que un SKU no coincida con el código de barras de otro producto y al revés. | `services/product_service.py:53`, validación en `create_product`/`update_product` |
| 1.2 | Fracciones y decimales (QA-A-01, QA-A-02) | Esquema de cantidades: máximo 3 decimales y > 0, en ventas y devoluciones (`schemas/sale.py:62` y el esquema de devolución). Se cuantiza a 3 decimales **antes** de calcular el precio. `return_sale` valida `allows_fractions` igual que `price_lines` (`sale_service.py:479-487`); conviene extraer un helper compartido `validate_quantity(product, qty)`. | `schemas/sale.py`, `services/sale_service.py` |
| 1.3 | Reembolso de más (QA-A-03) | El reembolso de cada devolución = reembolso acumulado de lo devuelto hasta ahora (calculado sobre el total de la línea) − lo ya reembolsado. Así la suma nunca excede el total y el último centavo cuadra. | `services/sale_service.py:526-528` |
| 1.4 | Restauración y sesiones (QA-C-01) | Se guarda el `max(token_version)` de cada usuario antes de restaurar y se fija `GREATEST(restaurado, previo) + 1`. Como respaldo extra, se rechaza todo token con `iat` anterior al fin de la restauración (marca en config o archivo). | `services/restore_service.py:174-179`, `app/__init__.py:94-96` |

**Gate 1:**
- pytest completo, vitest y CI verdes;
- se vuelven a correr los scripts de los agentes (`qaa_*`, `qab_*`, `qac_restore.py`) contra el código corregido;
- `tools/check_datos.py` corre sobre `pos_db`.

## Fase 2: Altos
| Sub | Hallazgos | Cambio | Archivos |
|---|---|---|---|
| 2.1 | Configuración sin validar (QA-C-02, y QA-C-13 y QA-A-12 que van juntos) | Esquema por clave en `config_service`: porcentajes decimales finitos entre 0 y 100, booleanos, longitud máxima, solo claves conocidas, cuerpo objeto. En `price_lines`, un tope no finito o negativo se rechaza y se usa un valor seguro. | `services/config_service.py:46-62`, `services/sale_service.py:40-44,75` |
| 2.2 | Costo promedio en 0 (QA-B-02) | `avg_cost` inicial = `purchase_price` al crear. El PATCH de `purchase_price` lo actualiza cuando `avg_cost` es 0 o el stock es 0. Los ajustes de entrada no diluyen el promedio: entran al costo vigente. | `services/product_service.py:197-199,227`, ajuste en `inventory_service` |
| 2.3 | Gerente desactiva sin permiso (QA-B-03) | Si el PATCH incluye `is_active`, se exige `productos:desactivar` en productos y categorías. Si no lo tiene, 403. La auditoría registra "desactivar". | `api/products.py`, `api/categories.py` (`schemas/product.py:20,119`) |
| 2.4 | Sin alta de cajas (QA-UI-01) | `POST /api/cash-register/registers` (admin) más un botón "Nueva caja" en Configuración → Cajas; renombrar ya existe. Test de API y vitest. | `api/cash_register.py`, `frontend/src/pages/settings/cash-registers-tab.tsx`, `api/sales.ts` |
| 2.5 | Escaneo sin conexión (pendiente de confirmar en 0.2) | Si se confirma, el escáner y el Enter sin servidor usan `searchOffline`/catálogo local en vez de fallar. | `pages/pos/pos-terminal.tsx` (`findProductByCode`), `lib/offline-catalog.ts` |
| 2.6 | "Algo salió mal" persistente (RF-52) | (a) `lazyWithRetry`: si falla la carga de una página (archivo viejo tras reinicio o actualización), recarga la página una sola vez (marca en `sessionStorage`) en vez de romper; (b) `ErrorBoundary` por página dentro del shell con `key` = ruta, para que al navegar se reinicie y el menú siga disponible; (c) el recuadro muestra el mensaje técnico (plegado) y "Volver al inicio"; (d) vitest: error en una página → navegar a otra la muestra bien; error de carga de módulo → recarga una vez. | `App.tsx`, `components/layout/error-boundary.tsx`, `components/layout/app-shell.tsx`, nuevo `lib/lazy-with-retry.ts` |

**Gate 2:** igual que el gate 1, más el flujo en navegador de las subfases 2.4 y 2.5.

## Fase 3: Medios
Se reparte en carriles paralelos que no comparten archivos.
- **3.A Errores HTTP y validación global:**
  - `DataError` → 400 con mensaje (QA-A-05, QA-B-08, QA-C-13);
  - las `HTTPException` conservan su código, sin el 500 por 405 (QA-C-09, QA-A-09);
  - tipos no-string en `auth` → 400 (QA-C-10);
  - topes de IVA, precio y cantidad, y `limit` ≥ 1.
  - Archivos: `utils/errors.py:117-118`, `api/auth.py`.
- **3.B Ventas:**
  - el folio se pide **después** de validar (QA-A-04, `sale_service.py:194`);
  - el ticket marca CANCELADA o DEVOLUCIÓN (QA-A-07, `printer_service.py:70-121`).
- **3.C Catálogo e inventario:**
  - etiqueta con precio con IVA (QA-B-04);
  - SKU normalizado (`strip`, único sin distinguir mayúsculas) (QA-B-05);
  - unidades únicas sin distinguir mayúsculas y sin nombre en blanco (QA-B-06);
  - `allows_fractions` en ajuste, conteo y OC, y no se puede apagar con stock fraccionario (QA-B-07);
  - desactivar una categoría con productos se bloquea, o no impide editarlos (QA-B-09).
- **3.D Compras:**
  - reactivar proveedor y RFC liberado o único sin distinguir mayúsculas (QA-B-10);
  - "Cerrar orden" para una OC en `parcial` (QA-B-11);
  - endpoint `GET /inventory/summary` para los KPI "Agotados" y "Bajo mínimo": incluye `min_stock=0` y stock = mínimo, sin el límite de 100 (QA-B-12).
- **3.E Autenticación:**
  - `change-password` devuelve un `refresh_token` y el frontend lo guarda (QA-C-03, `auth.py:138,150-156`, `pages/change-password.tsx:41`);
  - la llave de bloqueo es igual al login, solo cuenta usuarios existentes y se combina con la IP (QA-C-07, `rate_limiter.py:25-46`);
  - el límite por IP cuenta solo los fallos (QA-C-11);
  - usernames con `strip()` y únicos sin distinguir mayúsculas (QA-C-12, lo necesita QA-C-07).
- **3.F Reportes:** `daily` y `payment_methods` unen ventas con devoluciones y no recortan a 0 (QA-C-04, `reports.py:197-200,263-267,328-339`); se ajusta el frontend de Reportes.
- **3.G Respaldos:**
  - `resolve_listed_backup` también en delete y verify (QA-C-05);
  - lock exclusivo y `en_curso` antes de la verificación, con 409 si ya hay una en curso (QA-C-06);
  - nombre único con contador u `O_EXCL` (QA-A-06, QA-C-08);
  - `..` → 400 (QA-C-16).

**Gate 3:** igual que el gate 2.

## Fase 4: Bajos
- 400 → 404 para recursos inexistentes, y token inválido → 401 (QA-A-08, QA-B-17).
- `client_uuid` ligado al usuario: si otro usuario reenvía el mismo uuid, 409 (QA-A-10).
- No exponer rutas absolutas en errores ni respuestas de impresión y respaldos (QA-A-11, QA-C-16).
- Cierre de conteo: decir qué producto falla en lugar del 409 genérico, y revisar la sospecha de doble aplicación (QA-B-13).
- El movimiento de ajuste guarda la diferencia y el stock resultante (QA-B-14).
- Nombres en blanco (QA-B-15); escapar `%`/`_` en las búsquedas (QA-B-16); conservar la nota al recapturar (QA-B-18).
- RFC: formato y duplicado vacío (QA-B-19).
- OC: productos inactivos, cantidad mínima, texto de lista vacía (QA-B-20).
- Auditoría: duplicados, valor previo y cambio de `avg_cost` (QA-B-21).
- Precio con más de 2 decimales → 422 (QA-B-22).
- Branding lee las claves `company_*` (QA-C-14, `api/config.py:24-26`).
- Parámetros de reportes: `from > to` → 400, rango acotado (QA-C-15).
- `change-password`: límite de intentos y que la nueva sea distinta (QA-C-17).
- Filtro de auditoría inválido → 400 (QA-C-18).
- Retención de los `pre-restore` (QA-C-19).
- Reescribir `frontend/e2e/critical-flows.spec.ts` contra los endpoints reales (`/config/branding`, `/cash-register/active`).

**Decisiones de producto, no se cambian sin aprobación** (quedan en `hallazgos.md`):
- el cajero no puede cancelar ni devolver;
- el gerente no puede vender;
- `/api/health` público expone el disco.

**Gate 4.**

## Ejecución
- **Fase 1, en serie, la hago yo:** las subfases 1.2 y 1.3 tocan el mismo `sale_service.py`.
- **Fases 2 a 4: agentes en worktrees paralelos**, un carril por grupo de archivos que no se cruzan.
  - Fase 2: la 2.1, 2.2, 2.3 y 2.4 son independientes.
  - Fase 3: carriles 3.A a 3.G.
  - Yo integro, uno las cabezas de Alembic, corro el CI y reviso en el navegador.
  - Cada agente: test primero, sin push y con un reporte de cambios.
- **Al cerrar cada fase:** marcar `progreso.md` y pedir el gate al usuario.
- **PR:**
  - el rediseño a `main` primero, con su aprobación;
  - después, el PR de `fix/revision-funcional`.

## Verificación
- Por subfase: el test nuevo falla antes y pasa después; se suma pytest completo con `agent_pytest.py lane_X`, vitest y `tsc`/build.
- Por gate: CI en GitHub verde, y los scripts de QA de los agentes vuelven a correr en esquemas `qa_*` recién creados con `scratchpad/qa_setup.py` y `qa_run_backend.py`. Todo lo corregido debe dar ✅.
- En el navegador (`shots`): venta, venta sin conexión, devolución parcial y total, corte, alta de caja, configuración y KPI de inventario.
- Al final:
  - `tools/check_datos.py` sobre `pos_db`, y los conteos de `pos_db` iguales a la línea base (no se tocó sin permiso);
  - `hallazgos.md` con cada hallazgo marcado corregido, descartado o pendiente.
