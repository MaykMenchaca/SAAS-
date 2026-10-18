# Revisión funcional — hallazgos consolidados

**Fecha:** 2026-10-14 (consolidado el 2026-10-17)
**Código revisado:** `feat/rediseno-industry` @ `6f5f9d8`
**Alcance:** todas las funciones del backend (API) y los flujos principales en el navegador.
**Método:** pruebas contra el backend real, en esquemas aislados de `pos_test_db`. Los montos se recalcularon a mano con `Decimal`, y se revisó el código de cada servicio. `pos_db` no se usó.

| Fuente | IDs crudos | Cómo |
|---|---|---|
| Agente QA-A | QA-A-01…12 | API: ventas, caja, devoluciones, impresión (`qa_api_a`) |
| Agente QA-B | QA-B-01…22 | API: productos, categorías, unidades, inventario, conteos, compras (`qa_api_b`) |
| Agente QA-C | QA-C-01…19 | API: auth, usuarios, matriz de permisos (91 rutas × 4 roles), reportes, configuración, auditoría, respaldos y restauración (`qa_api_c`) |
| QA-UI (Claude) | QA-UI-01 | Navegador, esquema `shots` |

Los reportes crudos, con pasos, folios y archivo:línea, están en [`anexos/`](anexos/). Este documento fusiona los duplicados: 54 hallazgos crudos quedan en **52 consolidados (RF)**, contando los que salieron en la Fase 0.2. El plan de corrección está en [`plan-correccion.md`](plan-correccion.md); la columna **Fase** indica la subfase que corrige cada hallazgo.

**Severidad:** 🔴 Crítico (dinero o inventario incorrecto, pérdida de datos o seguridad) · 🟠 Alto (flujo roto o regla de negocio violada) · 🟡 Medio · ⚪ Bajo

## Estado de la corrección (2026-10-18)
**Los 52 hallazgos RF están corregidos** en la rama `fix/revision-funcional`, cada uno con su prueba de regresión (`backend/tests/test_revision_funcional_*.py` y pruebas de vitest). Detalle por fase y commits en [`progreso.md`](progreso.md).

| Fase | Hallazgos | Verificación |
|---|---|---|
| 1 Críticos | RF-01…05 | pytest completo + CI + navegador |
| 2 Altos | RF-06…10, RF-52 | pytest completo + CI + navegador (venta sin conexión y sincronización) |
| 3 Medios | RF-11…28, RF-41, RF-42 | pytest completo + CI + navegador |
| 4 Bajos | RF-29…40, RF-43…51 + pendientes del Dashboard | pytest completo + CI + Playwright (3 flujos) + navegador |

**Abierto (no son defectos de esta lista o requieren decisión):**
- Datos dañados en `pos_db` por pruebas del 2026-10-07 (`tools/check_datos.py`): `TO-002` con stock 79.5 pz y la venta `V-20261007-0011` reembolsada al doble. Reparación pendiente de decisión.
- Sin índices únicos en BD para SKU/código de barras, unidades y usuarios sin distinguir mayúsculas (la validación está en el servidor); requiere depurar antes los duplicados de prueba de `pos_db`.
- El ticket toma `business_name` antes que `company_name` (`printer_service._company_info`); con ambas claves distintas, ticket y branding difieren.
- Fechas extremas (`0001-01-01`) en `/api/sales/` y `/api/audit/` probablemente aún dan 500 (no reproducido).
- Ramas del frontend que esperaban "422 con msg" para token inválido quedaron sin uso (`api/client.ts`, `hooks/useSyncQueue.ts`).
- Nombres de proveedor duplicados permitidos.
- Playwright requiere `E2E_CHANNEL=chrome` (no hay Chromium propio instalado) y su `tsc` no está en el hook.
- Decisiones de producto de la tabla anterior (permisos de cajero/gerente, `/api/health` público).

## Resumen ejecutivo
**Veredicto: no apto para usarse en tienda hasta corregir la Fase 1.** Hay 5 Críticos, y 4 de ellos afectan dinero o inventario en flujos de uso diario: escanear, devolver y vender a granel. La base es sólida en lo demás:
- La matriz de permisos no tiene huecos.
- El cálculo de cotización, pagos mixtos, cambio y corte de caja cuadra a mano.
- La idempotencia aguanta 6 envíos simultáneos.
- El costo promedio ponderado coincide al decimal.
- Los reportes respetan la zona horaria.
- La auditoría no guarda contraseñas.

| Severidad | Cantidad |
|---|---|
| 🔴 Crítico | 5 |
| 🟠 Alto | 5 |
| 🟡 Medio | 19 |
| ⚪ Bajo | 23 |

## 🔴 Críticos
| ID | Hallazgo | Evidencia clave | Fuentes | Fase |
|---|---|---|---|---|
| RF-01 | **El escaneo devuelve el producto equivocado.** Si el producto A tiene `barcode=X` y el B tiene `sku=X` y no tiene código de barras, `by-code/X` devuelve B. El POS cobra otro precio y descuenta otro inventario. El catálogo offline sí prioriza el código de barras, así que los dos caminos se contradicen. | `product_service.py:53`: `(lower(barcode)=code) DESC` da NULL, y en PostgreSQL los NULL van primero en DESC. Reproducido 3 veces (se cobró la id 26 a $8 en lugar de la id 25 a $35). | QA-B-01 | 1.1 |
| RF-02 | **Devoluciones con fracciones de pieza.** `return_sale` acepta devolver 0.5 o 0.333 de un producto por pieza: reembolsa y deja stock fraccionario (97.666 pz). | La validación de fracciones solo está en `price_lines` (`sale_service.py:479-487`). V-20261014-0015, -0027, -0028 | QA-A-01 | 1.2 |
| RF-03 | **Cantidades con más de 3 decimales.** El precio se calcula con 2.001, la partida guarda 2.001 y el stock baja 2.000. Cada venta seguida de su devolución deja +0.001 kg fantasma. Con 0.0004 kg se crea una venta de $0.01 con cantidad 0.000 que no descuenta stock. | `schemas/sale.py:62` no limita los decimales. V-…-0013, -0029, -0030 | QA-A-02 | 1.2 |
| RF-04 | **Las devoluciones parciales reembolsan de más.** Tres devoluciones de 1 pieza a 1.05 + IVA reembolsan 1.22 × 3 = 3.66 de una venta de 3.65. | Cada devolución redondea por separado (`sale_service.py:526-528`). V-…-0017, -0018 | QA-A-03 | 1.3 |
| RF-05 | **La restauración no revoca todas las sesiones.** Un token emitido después del respaldo (por ejemplo, tras un cambio de contraseña o de rol) sigue siendo válido después de restaurar. | `restore_service.py:174-179` hace `token_version+1` sobre el valor ya restaurado, que vuelve a coincidir con el del token (`app/__init__.py:94-96`). Reproducido 2 veces. | QA-C-01 | 1.4 |

## 🟠 Altos
| ID | Hallazgo | Evidencia clave | Fuentes | Fase |
|---|---|---|---|---|
| RF-06 | **La configuración no valida valores.** Con `max_discount_percent="NaN"`, todas las ventas responden 500. Con `"-5"` nadie puede vender. Con `"150"` o `"Infinity"` el cajero vende con 100 % de descuento (se creó una venta de $0.00). También se aceptan `"abc"` (se toma como 0), claves desconocidas, claves de más de 150 caracteres (500), cuerpo tipo lista (500) y `null` (se guarda como "None"). | `config_service.py:46-62` guarda `str(value)`; el valor se usa en `sale_service.py:40-44,75` | QA-C-02, QA-C-13, QA-A-12 | 2.1 |
| RF-07 | **El costo promedio queda en 0 y diluye las recepciones.** Un producto dado de alta sin `purchase_price` queda con `avg_cost=0`; un PATCH posterior no lo cambia, y el stock cargado por ajuste entra a costo 0. Ejemplo: `avg_cost` 10 en lugar de 40 y valuación de $400 en lugar de $1,600. | `product_service.py:197-199,227`. OC-20261014-0015 | QA-B-02 | 2.2 |
| RF-08 | **El gerente desactiva y reactiva productos y categorías sin `productos:desactivar`.** `DELETE` le responde 403, pero `PATCH {"is_active":false}` responde 200 y la auditoría lo registra como "editar". | `schemas/product.py:20,119`. Productos 13 y 20, categoría 4 | QA-B-03 | 2.3 |
| RF-09 | **No se puede dar de alta una segunda caja.** No hay `POST` de cajas ni pantalla para hacerlo; solo `seed.py:196` crea "Caja 1". Con una sola caja, el cajero no puede vender si el admin dejó su turno abierto. El README describe varias cajas en la LAN. | `api/cash_register.py` (solo `PATCH /registers/<id>` y `agent-key`) | QA-UI-01 | 2.4 |
| RF-52 | **"Algo salió mal" se queda en todas las pestañas.** Un solo `ErrorBoundary` envuelve toda la app (`App.tsx:63`) y no se reinicia al navegar: un error en una página deja el recuadro en todas hasta recargar. Las páginas se cargan con `lazy(() => import(...))` sin reintento: si el servidor se reinició o se actualizó (nuevos nombres de archivos), la siguiente página que se abre falla. En tienda pasaría tras cada actualización con las cajas abiertas. El recuadro no muestra el error real. | Captura del usuario en `/compras` (2026-10-17); `components/layout/error-boundary.tsx`, `App.tsx:16-35` | Usuario | 2.6 |

## 🟡 Medios
| ID | Hallazgo | Fuentes | Fase |
|---|---|---|---|
| RF-10 | **El modo sin conexión no se activa si el servidor responde con 5xx.** `useSyncQueue.ts:129` da por alcanzable al servidor ante *cualquier* respuesta HTTP, y `findProductByCode` (`pos-terminal.tsx:39-53`) trata un 5xx como error del servidor en lugar de usar el catálogo local. Con el backend apagado en desarrollo, el proxy de Vite responde 500: el POS sigue en "Conexión LAN activa" y el escaneo falla ("Error al procesar la lectura del código"). En la tienda, con el equipo servidor apagado, sí hay error de red y sí entra en modo sin conexión. Pero si el backend responde con la base de datos caída (5xx), la caja no puede vender. | QA-UI (0.2) | 2.5 |
| RF-11 | Una venta rechazada consume folio y deja huecos (0003 → 0007): `nextval` se pide antes de validar (`sale_service.py:194`) | QA-A-04 | 3.B |
| RF-12 | Errores 500 en lugar de 4xx: desbordamiento numérico (pago ≥ 1e10, precio, IVA, cantidad), referencia de más de 100 caracteres, `printer_path` de más de 255, teléfono de más de 20, `limit=-1`, credenciales numéricas en login y change-password. No hay manejo de `DataError` ni tope de IVA (se aceptan 250 %). | QA-A-05, QA-B-08, QA-C-10 | 3.A |
| RF-13 | Un método no permitido (405) responde 500, porque el handler de `Exception` atrapa las `HTTPException` (`errors.py:117-118`) | QA-A-09, QA-C-09 | 3.A |
| RF-14 | Dos respaldos en el mismo segundo (manual o al cerrar caja) comparten nombre: 3 respuestas 201 y un solo archivo (`backup_service.py:123-131`) | QA-A-06, QA-C-08 | 3.G |
| RF-15 | El ticket de una venta cancelada o devuelta sale igual que el de una vigente (`printer_service.py:70-121`) | QA-A-07 | 3.B |
| RF-16 | La etiqueta imprime el precio sin IVA ($155.00, cuando se cobra $179.80) (`printer_service.py:135`) | QA-B-04 | 3.C |
| RF-17 | Se aceptan SKU duplicados que solo difieren en mayúsculas o espacios (`mart-001`, `"MART-001 "`), y esos productos no se pueden escanear (`product_service.py:330`) | QA-B-05 | 3.C |
| RF-18 | Se aceptan unidades duplicadas (Galón/galón/"GALÓN ") y unidades con nombre en blanco | QA-B-06 | 3.C |
| RF-19 | `allows_fractions` solo se valida en ventas: ajustes, conteos y OC aceptan fracciones de pieza, y se puede apagar en una unidad con 22.5 kg en stock | QA-B-07 | 3.C |
| RF-20 | Desactivar una categoría no revisa si tiene productos; después, editar esos productos da 422 porque el formulario reenvía `category_id` | QA-B-09 | 3.C |
| RF-21 | Un proveedor desactivado no se puede reactivar y su RFC queda bloqueado (409); "Sin Proveedor" se sigue usando aunque esté inactivo | QA-B-10 | 3.D |
| RF-22 | Una OC en estado `parcial` no se puede cerrar ni cancelar | QA-B-11 | 3.D |
| RF-23 | El KPI "Agotados" marca 12 contra 17 reales: `low-stock` excluye los productos con `min_stock=0`, solo lee 100 filas, y un stock igual al mínimo no cuenta como "bajo mínimo" | QA-B-12 | 3.D |
| RF-24 | `change-password` revoca el refresh token y no entrega otro: la sesión muere a los 30 min tras el primer cambio obligatorio (`auth.py:138,150-156`, `change-password.tsx:41`) | QA-C-03 | 3.E |
| RF-25 | El reporte de ventas no cuadra con devoluciones: `daily` y `payment_methods` omiten los días o métodos que solo tienen devoluciones y recortan a 0 (`reports.py:197-200,263-267,328-339`) | QA-C-04 | 3.F |
| RF-26 | DELETE y verify de respaldos aceptan archivos que no están en la lista: se pueden borrar los `pre-restore-*` (`backup_service.py:300-315,369-377`) | QA-C-05 | 3.G |
| RF-27 | Dos restauraciones simultáneas se aceptan y se ejecutan las dos (202 + 202). Sospecha: quedaría un hueco de mantenimiento (`restore_service.py:274-308`) | QA-C-06 | 3.G |
| RF-28 | Cualquiera, sin autenticarse, bloquea una cuenta real (incluida `admin`) con 10 intentos de una variante en mayúsculas o inexistente: la llave del bloqueo usa `lower()` y el login distingue mayúsculas (`rate_limiter.py:25-46`, `auth_service.py:33`) | QA-C-07 | 3.E |

## ⚪ Bajos
| ID | Hallazgo | Fuentes | Fase |
|---|---|---|---|
| RF-29 | Un recurso inexistente responde 400 en vez de 404 (cancelar o devolver venta, conteo, OC); un token inválido responde 422 en vez de 401 | QA-A-08, QA-B-17 | 4 |
| RF-30 | El reenvío de un `client_uuid` no se liga al usuario ni al contenido: devuelve la venta original de otro usuario | QA-A-10 | 4 |
| RF-31 | Se exponen rutas absolutas del servidor (error 503 de impresión, crear o verificar respaldo); `..` en DELETE o verify da 500 | QA-A-11, QA-C-16 | 4 (y 3.G) |
| RF-32 | El cierre de un conteo con stock negativo da un 409 genérico sin decir qué producto falla. Sospecha: la diferencia se aplica otra vez tras un ajuste absoluto. | QA-B-13 | 4 |
| RF-33 | El movimiento de ajuste guarda el stock nuevo, no la diferencia | QA-B-14 | 4 |
| RF-34 | Se aceptan nombres en blanco (queda una categoría con nombre `""`) | QA-B-15 | 4 |
| RF-35 | La búsqueda no escapa `%` ni `_` (devuelve todo) y la búsqueda de stock no tolera errores de dedo | QA-B-16 | 4 |
| RF-36 | Recapturar un renglón del conteo sin notas borra la nota anterior | QA-B-18 | 4 |
| RF-37 | RFC de proveedor: un RFC vacío choca en la segunda alta, no se distinguen mayúsculas y no se valida el formato | QA-B-19 | 4 |
| RF-38 | Las OC aceptan productos inactivos; una cantidad de 0.0004 se guarda como 0; hay huecos de folio; el texto de lista vacía está mal redactado | QA-B-20 | 4 |
| RF-39 | La auditoría registra eventos duplicados o vacíos y omite el stock previo y el cambio de `avg_cost` | QA-B-21 | 4 |
| RF-40 | Un precio con 3 decimales se redondea sin avisar | QA-B-22 | 4 |
| RF-41 | El límite por IP (5 por minuto) cuenta también los inicios de sesión correctos y vive en memoria de cada proceso (`auth.py:27`) | QA-C-11 | 3.E |
| RF-42 | Usernames: `" x "` se crea pero nunca puede entrar (el login aplica `strip`); se aceptan duplicados que solo difieren en mayúsculas, y lo mismo con los emails | QA-C-12 | 3.E |
| RF-43 | `/config/branding` lee claves `business_*`, pero la pantalla guarda `company_*`: dirección, teléfono y RFC salen vacíos (`api/config.py:24-26`) | QA-C-14 | 4 |
| RF-44 | Reportes: `top-products?limit=-1` recorta resultados; el rango 0001-9999 da 500; `from > to` no da error | QA-C-15 | 4 |
| RF-45 | `change-password` no limita intentos y acepta que la nueva sea igual a la actual | QA-C-17 | 4 |
| RF-46 | `GET /audit/?user_id=abc` ignora el filtro y devuelve todas las filas | QA-C-18 | 4 |
| RF-47 | Los `pre-restore-*.dump` nunca se depuran (`backup_service.py:217`) | QA-C-19 | 4 |
| RF-48 | `frontend/e2e/critical-flows.spec.ts` simula endpoints que no existen (`/api/branding`, `/cash-register/current`): no prueba los flujos reales | Explorador | 4 |
| RF-49 | En Devoluciones, el reembolso estimado redondea las mitades hacia arriba y el servidor al par (HALF_EVEN): la pantalla mostró $44.81 y se reembolsaron $44.80 (D-20261017-0003) | QA-UI (0.2) | 4 |
| RF-50 | Después de cerrar un turno, el detalle del corte no se recarga: muestra "cerrado —" sin hora y no muestra las observaciones (el servidor sí las guardó) | QA-UI (0.2) | 4 |
| RF-51 | En Devoluciones dice "Método de pago original: Efectivo" para una venta pagada con efectivo y tarjeta | QA-UI (0.2) | 4 |

## Decisiones de producto (no son defectos; requieren aprobación antes de cambiarse)
- El cajero no puede cancelar ni devolver, y el gerente no puede vender (QA-A).
- `/api/health` es público y expone el uso de disco; además reporta `status: ok` con el disco al 98.5 % (QA-C-16, QA-B). **Aviso de operación:** el disco de esta máquina está al 98.5 %.
- Un conteo creado con `{}` se vuelve conteo general (QA-C).

## Matriz de cobertura (resumen)
| Área | Estado | Hallazgos |
|---|---|---|
| Cotización, venta, pagos mixtos, cambio | ✅ | RF-11, RF-12 |
| Idempotencia `client_uuid` (6 envíos simultáneos) | ✅ | RF-30 |
| Cancelar venta | ⚠️ | RF-29 |
| Devoluciones | ❌ | RF-02, RF-03, RF-04 |
| Caja: abrir, cerrar, corte (cuadrado a mano), sesiones | ✅ | RF-09 |
| Ticket e impresión, cola del agente (claves, caducidad) | ⚠️ | RF-15, RF-31 |
| Productos, SKU, búsqueda | ⚠️ | RF-17, RF-35, RF-40 |
| `by-code` (escaneo) | ❌ | RF-01 |
| `pos-catalog` | ✅ | |
| Categorías y unidades | ⚠️ | RF-18, RF-20, RF-34 |
| Ajustes de inventario (5 motivos) | ⚠️ | RF-19, RF-33 |
| Conteo físico | ⚠️ | RF-32, RF-36 |
| Compras y recepción; costo promedio ponderado (exacto en 5 recepciones) | ⚠️ | RF-07, RF-21, RF-22, RF-38 |
| KPI de inventario / `low-stock` | ❌ | RF-23 |
| Login, refresh, logout, `must_change_password`, `token_version` | ✅ | RF-24, RF-28, RF-41 |
| Usuarios, último admin, `reset-password` | ✅ | RF-42 |
| Matriz de permisos (91 rutas × 4 roles) | ✅ | RF-08 (por PATCH) |
| Reportes y zona horaria | ⚠️ | RF-25, RF-44 |
| Configuración | ❌ | RF-06, RF-43 |
| Auditoría | ✅ | RF-39, RF-46 |
| Respaldos: crear, listar, verificar, descargar, retención | ⚠️ | RF-14, RF-26, RF-47 |
| Restauración y mantenimiento | ❌ | RF-05, RF-27 |
| Navegador: login y cambio obligatorio, abrir caja, venta con escáner, fracciones, cobro dividido, F8 | ✅ | |
| Navegador: devolución sin reposición (D-20261017-0003, stock sin cambio), corte por denominaciones (faltante −$5 correcto), OC enviada y recepción parcial (costo promedio 10.0930 exacto) | ✅ | RF-49, RF-50, RF-51 |
| Navegador: venta sin conexión | ❌ | RF-10 |

## Datos de prueba
Todo está en `pos_test_db`; `pos_db` no se tocó.
- **`qa_api_a`:**
  - 8 productos `QAA-*` (QAA-KG con stock 48.503 y QAA-RE con 97.666, por los hallazgos);
  - 34 ventas y 20 devoluciones;
  - "Caja 1" renombrada a "Caja 1 QA".
- **`qa_api_b`:**
  - 30 productos, 5 categorías, 11 unidades;
  - 4 conteos y 13 OC (OC-20261014-0005 a 0017).
- **`qa_api_c`:**
  - usuarios `qa_c_*`, 6 ventas y 3 devoluciones;
  - una sesión de caja abierta;
  - estado de la última restauración.
- **`shots`:**
  - "Caja 2" creada por SQL y abierta por `jperez`;
  - venta V-20261014-0010;
  - contraseñas de `jperez` y `lmendez` cambiadas para las pruebas.
