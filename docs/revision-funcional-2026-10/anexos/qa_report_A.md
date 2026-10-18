# QA-A: revisión funcional del POS VRNTAS (ventas, cancelación, devoluciones, caja, listado, impresión)

- **Entorno:** backend aislado en http://127.0.0.1:5101/api, base `pos_test_db`, esquema `qa_api_a`. Antes de empezar comprobé `current_schema() = qa_api_a`. No toqué ningún otro esquema ni `pos_db`.
- **Código:** rama feat/rediseno-industry. No edité nada del repo, no hice commits.
- **Scripts y logs:** están en el scratchpad (S): `qa_a_01_setup.py` … `qa_a_08_lengths.py`, el helper `qa_a_common.py` y los logs `qa_a_0N.log` / `qa_a_01.out`. El log del servidor está en `qa_a_backend.log`.
- **Montos:** todos los recalculé a mano con `Decimal` y `ROUND_HALF_EVEN`.
- **Backend:** lo apagué al terminar.

## Hallazgos

### QA-A-01 · Crítico · Devolución: acepta cantidades fraccionarias en productos por pieza
- **Pasos:**
  1. Vender 1 pieza de "QA Devoluciones" (unidad `pz`, `allows_fractions=false`).
  2. Hacer `POST /api/sales/<id>/return` con `{"reason":"QA frac","session_id":S,"items":[{"sale_item_id":X,"quantity":"0.333"}]}`.
- **Esperado:** 400, como en la venta, que rechaza la misma fracción ("no permite cantidades fraccionarias").
- **Obtenido:** 200. Se devuelven 7.73 y el stock pasa de 98.000 a 98.333 pz. Repetido: 97.333 → 97.666. Antes ya había pasado con 0.5 pz: 200, folio D-20261014-0002, 11.60.
  - Lo reproduje 3 veces: V-20261014-0015, V-20261014-0027 y V-20261014-0028.
  - El producto queda con stock fraccionario: QAA-RE = 97.666 pz.
- **Evidencia:**
  - `backend/app/services/sale_service.py:479-487`: `return_sale` solo valida `qty > 0`.
  - La validación de fracciones existe únicamente en `price_lines` (`sale_service.py:63-67`).
  - No hay ningún test que lo cubra.
- **Corrección:** en `return_sale`, si `sale_item.product.unit` no admite fracciones y `qty % 1 != 0`, lanzar `ValueError`. Añadir un test.

### QA-A-02 · Crítico · Venta: cantidades con más de 3 decimales descuadran inventario y partida
- **Pasos:**
  1. Vender `"quantity":"2.0005"` de un producto por kg (12.99/kg).
  2. Devolver la cantidad que muestra la partida (2.001) con `restock`.
- **Esperado:**
  - Rechazo con 422 (más de 3 decimales), o bien redondear la cantidad a 3 decimales antes de calcular el precio y de mover el stock.
  - Después de vender y devolver, el stock debe quedar igual.
- **Obtenido:**
  - La venta se crea. El precio se calcula con 2.0005 sin redondear, pero `sale_items.quantity` guarda 2.001 (PostgreSQL redondea).
  - El movimiento registra `quantity=2.001`, pero `previous→new` es 48.501 → 46.501: solo bajó 2.000, porque la columna de stock redondea el resultado de la resta.
  - La devolución reingresa 2.001. El stock pasa de 48.501 a 46.501 y luego a 48.502: aparecen **+0.001 kg fantasma por ciclo**.
  - Reproducido 3 veces: V-20261014-0013 (1.0005), V-20261014-0029 y V-20261014-0030. El stock de QAA-KG terminó en 48.503, cuando lo real es ≈48.500.
- **Variantes:**
  - `quantity "0.0004"` (V-20261014-0012) crea una venta de 0.01 con `sale_items.quantity = 0.000`, sin descontar stock (48.500 → 48.500), y esa partida no se puede devolver.
  - `quote` con "1.0005" muestra `quantity 1.000` (HALF_EVEN), pero la venta guarda 1.001 (HALF_UP de PostgreSQL).
  - `quote` con "1E+20" responde 200 con total 1506840000000000000000.00; con "1e-9" responde 200 con cantidad 0.000 y total 0.00.
- **Evidencia:**
  - `backend/app/schemas/sale.py:62`: `quantity` sin `places` ni máximo.
  - `sale_service.py:59` y `:85`: se usa la cantidad sin redondear.
  - `models/sale.py:138` y `models/inventory.py:24`: columnas `Numeric(12,3)`.
- **Corrección:**
  - En `SaleItemInputSchema.quantity` (y en `SaleReturnItemInputSchema.quantity`, `sale.py:201`), rechazar más de 3 decimales, o cuantizar a 0.001 antes de `price_lines`.
  - Fijar un máximo razonable (por ejemplo `< 10^9`).
  - Rechazar cantidades que, cuantizadas, den 0.

### QA-A-03 · Crítico (monto pequeño) · Devolución: las devoluciones parciales pueden reembolsar más de lo cobrado
- **Pasos:**
  1. Vender 3 × "QA Tornillo" a 1.05 con IVA 16%. Total: 3.15 + 0.50 = 3.65.
  2. Devolver 1 pieza, tres veces.
- **Esperado:** la suma de los reembolsos debe ser 3.65 como máximo.
- **Obtenido:** cada devolución reembolsa 1.22 (1.05 × 1.16 = 1.218 → 1.22). En total salen **3.66, 0.01 más de lo cobrado**, y en efectivo eso descuadra el corte.
  - Reproducido 2 veces: V-20261014-0017 y V-20261014-0018.
  - Con otros precios ocurre lo contrario (se reembolsa de menos).
- **Evidencia:** `sale_service.py:526-528`. El reembolso se recalcula por unidad (`subtotal/qty × (1+tasa)`) y se redondea en cada devolución, mientras que en la venta el IVA se redondeó una sola vez por línea.
- **Corrección:**
  - Calcular el reembolso proporcional sobre el total de la línea: `line_total = subtotal + IVA` de la línea.
  - Cuando la devolución completa la línea, reembolsar exactamente `line_total − ya_reembolsado`.
  - En cualquier caso, limitar el reembolso a ese remanente.
  - Añadir un test con 1.05 × 3.

### QA-A-04 · Medio · Folio: las ventas rechazadas consumen número y dejan huecos
- **Pasos:** intentar ventas que fallan por pago insuficiente, sobrepago con tarjeta, stock insuficiente, un 500 de BD, etc.
- **Esperado:** folios consecutivos, sin huecos.
- **Obtenido:** `sale_folio_seq` avanza con cada rechazo (3 → 5, 30 → 32, 32 → 34, 46 → 48). Los folios guardados saltan de V-20261014-0003 a V-20261014-0007. Reproducido 3 veces.
- **Evidencia:** `sale_service.py:194`. `_generate_folio()` (`nextval`) se llama antes de descontar stock (`:228`) y de validar los pagos (`:238-270`), y el rollback no devuelve los valores de la secuencia.
- **Corrección:** validar pagos y stock antes de pedir el folio, es decir, mover `nextval` justo antes del commit. Si se exige numeración sin huecos, usar una tabla contador bloqueada dentro de la transacción en lugar de `SEQUENCE`.

### QA-A-05 · Medio · Validación: entradas demasiado grandes devuelven 500 en lugar de 4xx
- **Pasos y resultados (cada caso reproducido 2 veces):**
  - Pago `"amount":"100000000000.00"` (cabe en el schema, desborda `Numeric(12,2)`): **500** (`NumericValueOutOfRange`, ERROR_ID 99514cf16388). Además consume un folio.
  - Pago con `reference` de 101 caracteres: **500** (`StringDataRightTruncation` varchar(100)). Además consume un folio.
  - `PATCH /cash-register/registers/1` con `printer_path` absoluto de 266 caracteres: **500** (varchar(255)).
- **Esperado:** 422 o 400.
- **Evidencia:**
  - `schemas/sale.py:75-76`: `amount` sin máximo y `reference` sin `Length`.
  - `models/sale.py:174`.
  - `api/cash_register.py:61-63` y `models/sale.py:15`.
- **Corrección:** añadir `validate.Range(max=…)` a `amount` y `validate.Length(max=100)` a `reference`, y validar la longitud de `printer_path` en `PrinterService.validate_target`.
- En todos los casos el rollback funcionó: no quedó ninguna venta ni movimiento de stock.

### QA-A-06 · Medio · Caja / respaldo: dos cierres en el mismo segundo generan un solo archivo de respaldo
- **Pasos:** cerrar dos sesiones de caja con menos de un segundo de diferencia (cada cierre lanza su respaldo automático).
- **Esperado:** un respaldo por cierre.
- **Obtenido:**
  - Cierres en 12:58:53.517 y 12:58:53.553: solo existe `backup_pos_test_db_20261014_065853.dump`.
  - Reproducido: cierres en 12:59:03.579 y .641 dejan solo `…_065903.dump`.
  - Antes, 3 cierres en el mismo segundo dejaron 1 archivo (`…_065247.dump`).
  - Los `.dump` que quedaron son legibles (`pg_restore -l`, rc=0).
- **Sospecha (no confirmada):** dos `pg_dump` escriben a la vez el mismo archivo. Si uno falla, `create_backup` borra el archivo (`backup_service.py:162-175`), es decir, también el del otro hilo.
- **Evidencia:**
  - `backend/app/services/backup_service.py:123,131`: el nombre del archivo tiene resolución de segundos y sin contador. Solo los respaldos con `prefix` llevan contador.
  - `api/cash_register.py:240-256`: el respaldo se lanza en un hilo por cada cierre.
- **Corrección:** añadir milisegundos o un contador o sufijo único al nombre (como ya se hace con `prefix`), o serializar los respaldos automáticos con un lock.

### QA-A-07 · Medio · Ticket: el ticket de una venta cancelada o devuelta no indica su estado
- **Pasos:** cancelar una venta y pedir `POST /api/printing/sales/<id>/ticket {}` (o con `send:true`).
- **Esperado:** una marca visible ("CANCELADA", "DEVOLUCIÓN PARCIAL/TOTAL") o el rechazo de la reimpresión.
- **Obtenido:** 200. El contenido es idéntico al de una venta vigente: TOTAL y pagos, sin ninguna marca de cancelación (venta cancelada, saleD de S2). Se puede reimprimir y entregar como comprobante válido.
- **Evidencia:** `backend/app/services/printer_service.py:70-121`. `format_sale_ticket` no usa `sale.status` ni `cancel_reason`.
- **Corrección:** añadir una línea de estado y el motivo cuando `status != 'completada'`.

### QA-A-08 · Bajo · Cancelar / devolver: venta inexistente responde 400 en vez de 404
- **Obtenido:** `POST /api/sales/999999/cancel` y `/return` responden **400** `{"error":"Venta no encontrada"}`. En cambio `GET /api/sales/999999` y el ticket responden 404.
- **Evidencia:** `sale_service.py:330-331` y `:461-462` lanzan `ValueError`; `api/sales.py:98-99` y `:124-125` lo convierten en 400.
- **Corrección:** comprobar la existencia en el endpoint (404), o usar una excepción `NotFound` específica.

### QA-A-09 · Bajo · General: un método HTTP no permitido devuelve 500
- **Obtenido:** `PUT /api/sales/1` y `DELETE /api/cash-register/1` responden **500** "Error interno del servidor" (ERROR_ID 3d972d87b446 y 90890b8eb044). El log muestra `405 Method Not Allowed` capturado como excepción no manejada.
- **Evidencia:** `backend/app/utils/errors.py:117-118`. `@app.errorhandler(Exception)` también atrapa `HTTPException`.
- **Corrección:** dentro del handler, si `isinstance(e, HTTPException)`, devolver `e.code` con JSON (o registrar un handler para `HTTPException`).

### QA-A-10 · Bajo · Venta: la idempotencia por `client_uuid` no está ligada al usuario ni al contenido
- **Obtenido:** reenviar un `client_uuid` ya usado:
  - con otro contenido (cantidad 5 en lugar de 2), o
  - desde otro usuario (admin reenvía el uuid del cajero)

  responde 201 con la venta original del cajero (id 9, user_id 3). No avisa de la discrepancia y expone la venta de otro usuario a quien conozca el uuid.
- **Lo que sí funciona:** reenvío secuencial y concurrente (2 y 6 hilos): una sola venta, un solo movimiento de stock y un solo pulso de cajón.
- **Evidencia:** `sale_service.py:157-160` y `:175-178`; `api/sales.py:62`.
- **Corrección:**
  - Filtrar por `client_uuid` y `user_id`, o responder 409 si el usuario o la sesión no coinciden.
  - Opcional: responder 200 en vez de 201 en el reenvío.

### QA-A-11 · Bajo · Impresión: el error 503 expone la ruta completa del servidor
- **Obtenido:** con `printer_path` apuntando a un directorio inexistente, `send:true` responde 503 con `"Impresora no disponible: [Errno 2] No such file or directory: 'C:\\Users\\…\\x.prn'"`.
- **Evidencia:** `printer_service.py:233`; `api/printing.py:239-240`.
- **Corrección:** mostrar un mensaje genérico al cliente y enviar el detalle solo al log.

### QA-A-12 · Bajo (fuera del alcance directo) · Config: `max_discount_percent` acepta valores no numéricos
- **Obtenido:** `PUT /api/config/ {"max_discount_percent":"abc"}` responde 200 y guarda "abc". `price_lines` lo interpreta en silencio como 0 (`sale_service.py:40-44`), así que el cajero pierde cualquier descuento sin que nadie lo note.
- **Funciona:** el tope numérico (con 5, el cajero puede 5% y no 5.01%).
- **Corrección:** validar que sea numérico entre 0 y 100 en `config_service.set_bulk`.

### Observaciones de código (sin reproducir por API, "sospecha" o diseño)
- **Sospecha:** `open_session` (`api/cash_register.py:123-129`) no comprueba `register.is_active`. No pude probarlo porque no hay endpoint para desactivar cajas.
- **Diseño a confirmar:**
  - El rol cajero no tiene `ventas:cancelar`, así que no puede cancelar ni hacer devoluciones.
  - El gerente no tiene `ventas:crear` (quote y venta responden 403), pero sí `caja:supervisar` (`seed.py:57-72`).
  - Por eso la rama `PermissionError` de `return_sale` (`sale_service.py:449-458`) es inalcanzable con los roles sembrados.
- **Venta de total 0.00** (descuento 100%): no se puede pagar con tarjeta (sobrepago, 400). Solo se puede con efectivo de 0.01 y cambio de 0.01.
- **Rate limit de login** (fuera de alcance): cuenta también los inicios exitosos, 5 por minuto por IP (`api/auth.py:25`, `services/rate_limiter.py:18-20`). Mis propios scripts recibieron 429 con credenciales válidas. Tras un proxy o NAT compartido puede bloquear cajas legítimas.
- **Cancelación:** cualquier usuario con `ventas:cancelar` puede cancelar ventas de la sesión de otro mientras esté abierta. No exige `caja:supervisar`, a diferencia de la venta y la devolución.

## Matriz de cobertura

| Función | Estado | Qué se probó |
|---|---|---|
| Cotización `POST /sales/quote` | ✅ | Ignora precio y tasa del cliente. IVA 16% y 0%. HALF_EVEN en el bruto (19.485 → 19.48) y en el descuento (0.025 → 0.02). Descuento: cajero 400, admin 200, tope configurable 5%. 422 con descuento fuera de 0–100 o sin items. 401 sin token. Gerente 403. |
| Venta `POST /sales/` (camino feliz, pagos) | ✅ | Total del servidor (347.97). Cambio 52.03. Mixto efectivo/tarjeta/efectivo con cambio al último pago en efectivo. Sobrepago con tarjeta 400, insuficiente 400, monto 0 o método inválido 422. Auditoría `create` y movimiento `salida`. |
| Venta: stock, unidades, sesión, producto | ⚠️ | Stock insuficiente 400 sin efectos. Fracción en pz 400, kg 1.5 OK. Inactivo e inexistente 400. Sesión cerrada o inexistente 400. Cajero en sesión del admin 403. Admin en sesión del cajero 201. 5 compras concurrentes con stock 2 → 2 ventas. Falla con más de 3 decimales (QA-A-02) y entradas largas (QA-A-05). |
| Idempotencia `client_uuid` | ⚠️ | Secuencial y concurrente (2 y 6 hilos): 1 venta, 1 movimiento, 1 pulso de cajón. Reservas en QA-A-10. |
| Folio | ⚠️ | Formato V-AAAAMMDD-NNNN correcto. Huecos por rechazos (QA-A-04). |
| Cancelar `POST /sales/<id>/cancel` | ⚠️ | Motivo obligatorio (422). Stock regresa (+2). Estado `cancelada`, `cancelled_by` y auditoría correctos. Doble cancelación 400. Con devolución 400. Sesión cerrada 400. Cajero 403. Cancelación y devolución concurrentes: solo gana una. Inexistente responde 400 (QA-A-08). |
| Devolución `POST /sales/<id>/return` | ❌ | Parcial (23.20, `devolucion_parcial`, folio `D-`). Total (`devolucion_total`, suma = 69.60). Exceder o duplicar 400. Item ajeno 400. `restock=false` sin stock ni movimiento. Tarjeta sin caja OK. Efectivo sin caja 400. `refund_method` inválido 422. Sesión cerrada 400. Concurrentes: solo una. Falla en QA-A-01 (fracciones en pz) y QA-A-03 (sobre-reembolso). |
| Caja: abrir / active / doble sesión | ✅ | Abrir 201. Segunda sesión en la misma caja 400. Caja inexistente 404. Fondo negativo o ausente 422. `active` por usuario, y null tras el cierre. |
| Caja: summary / cierre | ✅ | S2 calculado a mano: fondo 300 + 58 + 66 + 0 + 58 − 29 − 115.99 = **337.01**, diferencia 2.99. Incluye cancelada excluida, devoluciones en efectivo y tarjeta, y devolución en S2 de una venta de S1. Summary: efectivo 37.01, tarjeta 50.00, total 87.01, 4 completadas, 1 cancelada. S1 y S4 coinciden con un cálculo SQL independiente. Doble cierre 400. Inexistente 404. Cierre ajeno: cajero 403, gerente 200. Auditoría open/close. |
| Caja: historial `sessions` / detalle | ✅ | Orden, filtro `status`, paginación, detalle, summary 404. |
| `PATCH /registers/<id>` y `agent-key` | ⚠️ | Solo admin (cajero y gerente 403). Nombre vacío o de 51 caracteres 400. Rutas relativa, UNC y no `.prn` 400. Codepage inválida 400. COM12 → `\\.\COM12`. 404 si no existe. Auditoría. Rotación de clave. Ruta de más de 255 caracteres da 500 (QA-A-05). |
| Listado de ventas, `/cashiers`, detalle | ✅ | Filtros `status` (simple y múltiple), `user_id`, `date_from`/`date_to` (hoy, mañana, ayer, rango invertido), fecha inválida 400, folio exacto sin distinguir mayúsculas, tope `per_page` 100, `page` 0/−1/abc, 401 sin token, cashiers, detalle con `returned` y `available`, 404. |
| Ticket `POST /printing/sales/<id>/ticket` | ⚠️ | Vista previa OK. `send` sin impresora 400. `send` a `.prn` escribe ESC/POS (772 bytes). Ruta inexistente 503 (QA-A-11). Vía agente: `queued` con `agent_online` false y luego true. Venta cancelada sin marca (QA-A-07). 404 y 401. |
| Agente `/print-agent/jobs`, `result` | ✅ | Clave ausente, malformada, Unicode, de otra caja o vieja tras rotar: 401. Claim entrega una sola vez. Payload con folio. `result` ok → impreso; duplicado 409; job pendiente 409; inexistente 404; error truncado a 500. Cajón caducado tras 30 s (no se entrega). Entregado sin confirmar más de 2 min → error, y resultado tardío 409. Cajón: no se encola en tarjeta, con `open_drawer=false` ni en reenvío. |

## Datos que dejé en `qa_api_a`
- **Catálogo:**
  - Categoría "QA-A Ferreteria" (id 1).
  - 8 productos: QAA-PZ, QAA-KG, QAA-T0, QAA-IN (inactivo), QAA-OV, QAA-LO, QAA-RE, QAA-CJ (ids 1–8).
- **Stock final:**
  - PZ 89, KG **48.503**, T0 93, IN 10, OV 100, LO 0, RE **97.666**, CJ 190.
  - Los valores raros de KG y RE son consecuencia de QA-A-01 y QA-A-02.
- **Ventas y devoluciones:**
  - 34 ventas: 18 completadas, 5 en devolución parcial, 8 en devolución total, 3 canceladas.
  - 35 partidas, 38 pagos, 20 devoluciones, 66 movimientos de stock, 127 registros de auditoría.
- **Caja:**
  - 8 sesiones de caja, todas cerradas (S1 diferencia −251.90 a propósito, S2 +2.99, el resto 0).
  - "Caja 1" renombrada a **"Caja 1 QA"**. Tiene una clave de agente generada (hash) y quedó con `print_via_agent=false` y `printer_path=null`.
- **Impresión:** 4 `print_jobs` (1 impreso, 1 caducado, 2 error).
- **Configuración:** `max_discount_percent` restaurado a "0".
- **Archivos en el scratchpad:**
  - `qa_a_ticket.prn` (ticket de prueba).
  - `backups_qa_api_a/` con 3 `.dump` de los cierres.
  - `qa_a_ids.json` y `qa_a_state.json`.
