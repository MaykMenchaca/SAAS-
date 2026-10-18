# QA-B: Catálogo, inventario, conteo físico y compras (POS VRNTAS, rama feat/rediseno-industry)

Entorno: esquema `qa_api_b` de `pos_test_db` (verificado: `current_schema()` = `qa_api_b`), backend en 127.0.0.1:5102 (ya apagado). Todo se probó por API con los usuarios admin, gerente y cajero; la BD se revisó por SQL. Scripts y salidas en el scratchpad: `qab_*.py` y el log del backend en `qa_b_backend.log`.
Validaciones: los errores de esquema regresan **422** (no 400). Solo un motivo de ajuste inválido regresa 400.

## Hallazgos

### QA-B-01 · Crítico · Escaneo `by-code`: devuelve el producto que coincide por SKU en lugar del que coincide por código de barras
- **Función:** `GET /api/products/by-code/<code>`, que el POS usa al escanear (`frontend/src/pages/pos/pos-terminal.tsx:43`).
- **Pasos:** se crea A con `barcode=7502000000011`, y B con `sku=7502000000011` y sin código de barras. Luego se escanea `7502000000011`.
- **Esperado:** A, porque el comentario del código dice que el código de barras gana. El catálogo offline sí lo hace así (`frontend/src/lib/offline-catalog.ts:128`).
- **Obtenido:** se recibe B: 200 con id 26 "Lija de agua…" a $8.00, en lugar de id 25 "Pegamento…" a $35.00. **Lo reproduje 3 veces:** pares 1/4, 25/26 y 27/28.
- **Causa:** `backend/app/services/product_service.py:53` ordena por `(lower(barcode)=code) DESC`. Como B no tiene código de barras, esa comparación da NULL, y PostgreSQL pone los NULL **primero** en un orden DESC. Así se vende otro producto, con otro precio, y se descuenta el inventario equivocado. Además, el alta permite que un SKU sea igual al código de barras de otro producto. `tests/test_pos_catalog_fase4.py` no cubre este caso.
- **Corrección:** `func.coalesce(func.lower(Product.barcode) == code.lower(), False).desc()` o `.nulls_last()`. Además, validar en el alta y en la edición que un SKU no choque con un código de barras ajeno, y al revés.

### QA-B-02 · Alto · El costo promedio queda congelado en 0 y una recepción posterior lo diluye (valuación y utilidad incorrectas)
- **Función:** alta y edición de producto, y después `PurchaseOrderService.receive_order`.
- **Pasos:** se da de alta un producto sin `purchase_price`, así que `avg_cost=0`. Luego `PATCH purchase_price=40`, y `avg_cost` sigue en 0.0000. Se carga el inventario inicial con un ajuste a 30. Al final se recibe una OC de 10 a $40.
- **Esperado:** `avg_cost` = 40.0000 y una valuación de 40 × 40 = $1,600.
- **Obtenido:** `avg_cost` = **10.0000** y una valuación de **$400.00** (folio OC-20261014-0015, producto 29). En la repetición #1 (producto 24, 10 piezas previas y 10 recibidas a $120) quedó `avg_cost` = 60.0000 en lugar de 120.
- **Causa:** `product_service.py:197-199` fija el promedio solo en el alta. `update_product` descarta `avg_cost` (línea 227) y no lo recalcula al cambiar `purchase_price`. El ajuste de entrada no pide costo. Con ese promedio se calculan `cost_at_sale` (`sale_service.py:107`) y la valuación (`api/reports.py:357`).
- **Corrección:** si el producto no tiene stock ni recepciones, que un `PATCH purchase_price` también fije `avg_cost`, y dejarlo en auditoría. Otra opción: pedir costo unitario en los ajustes que suben stock y promediarlo.

### QA-B-03 · Alto (seguridad/permisos) · El gerente desactiva y reactiva productos y categorías con PATCH aunque no tiene `productos:desactivar`
- **Pasos:** el gerente prueba `DELETE /products/13` y recibe **403**. Luego manda `PATCH /products/13 {"is_active":false}` y recibe **200**: en BD queda `is_active=False`. Lo mismo con `/products/20`: después de eso, `by-code/CEM-001` da 404 en el POS. También pasa con `PATCH /categories/4 {"is_active":false}`, que da 200.
- **Esperado:** 403, igual que con DELETE y `/reactivate`.
- **Causa:** `ProductUpdateSchema.is_active` (`schemas/product.py:119`) y `CategoryUpdateSchema.is_active` (`schemas/product.py:20`) solo exigen `productos:editar`. La auditoría lo registra como `editar` y no como `desactivar`. **Lo reproduje 2 veces** con productos (13 y 20) y una vez con una categoría.
- **Corrección:** quitar `is_active` de los esquemas de edición, o exigir `productos:desactivar` cuando venga en el payload.

### QA-B-04 · Medio · La etiqueta de precio imprime el precio sin IVA
- **Pasos:** `POST /printing/products/1/label` con `sale_price=155.00` e IVA de 16 %.
- **Obtenido:** la etiqueta dice "$155.00", pero en la venta se cobra 155 × 1.16 = $179.80. `sale_service.py:70-91` suma el IVA encima de `sale_price`.
- **Evidencia:** `printer_service.py:135`.
- **Corrección:** imprimir el precio con IVA, o los dos. Al público se le deben mostrar precios con impuestos incluidos.
- **Sin impresora:** `{"send":true}` da 400 "Ruta de impresora no configurada" con cualquier rol. La vista previa (`send:false`) da 200 con el contenido ESC/POS y el código Code128 (usa el código de barras y, si no hay, el SKU). Un producto inactivo también imprime (200) y uno inexistente da 404.

### QA-B-05 · Medio · Se aceptan SKU duplicados que solo difieren en mayúsculas o espacios
- **Pasos:** con `MART-001` ya existente, se dan de alta `mart-001` (id 2) y `"MART-001 "` (id 3), y las dos dan 201.
- **Problema:** `by-code` no distingue mayúsculas y recorta espacios, así que para `mart-001` y para `MART-001 ` siempre devuelve el id 1. Esos productos no se pueden escanear por SKU.
- **Causa:** `product_service.py:330` usa `filter_by(sku=sku)`, que distingue mayúsculas y no recorta. El frontend recorta (`form-state.ts:52`), pero no unifica mayúsculas.
- **Corrección:** índice único sobre `lower(trim(sku))` y sobre `lower(trim(barcode))`, como se hizo con categorías (H-54), y `strip()` en el esquema.

### QA-B-06 · Medio · Unidades duplicadas que solo difieren en mayúsculas, acentos o espacios, y nombres en blanco
- **Pasos:** se crean "Galón" (8), "galón" (9), "GALÓN " con abreviatura "GAL" (10) y "   " con abreviatura "  " (11), y todas dan 201. Los duplicados exactos sí se rechazan con 422.
- **Evidencia:** `product_service.py:165-175` usa `filter_by` exacto. La abreviatura no tiene restricción UNIQUE en BD.
- **Corrección:** misma normalización que categorías (índice sobre `lower(trim())`) y recortar espacios antes de validar.

### QA-B-07 · Medio · Solo las ventas validan `allows_fractions`
- **Obtenido:** se aceptan un ajuste a 2.5 pz (producto 14, 200), un conteo de 1.5 pz (producto 15, cierre aplicado), una OC de 1.5 pz (OC-20261014-0006) y el cambio de "Kilogramo" a `allows_fractions=false` aunque hay 22.5 kg en stock (producto 23).
- **Causa:** la única validación está en `sale_service.py:62`. Un producto por pieza puede quedar con fracciones que nunca se pueden vender.
- **Corrección:** validar cantidades enteras en ajuste, conteo, OC y recepción. Bloquear el cambio de `allows_fractions` si hay stock fraccionario.

### QA-B-08 · Medio · Varios errores 500 por desbordamiento numérico o texto largo
Cada caso regresa 500 con su `error_id`:
- `sale_price=99999999999` → dbc8a293154e
- `tax_rate=1000` en el alta → 185bb0b3a29d
- `tax_rate=1000` en PATCH → 69ba7f3b4b58
- ajuste `1000000000` → d21e36cc1513
- OC con `tax_rate=1000` → cf009b2990e0
- OC con `quantity=1e10` → 1f166f2daef0
- teléfono de proveedor de 25 caracteres (la columna es `varchar(20)`) → b1609d1af9cc
- `GET /inventory/movements/14?limit=-1` → 0039400463ee

**Causa:** los esquemas no ponen un máximo acorde a `Numeric(12,2)`, `Numeric(5,2)`, `Numeric(12,3)` y `String(20/150/120/100)`. `utils/errors.py` no maneja `DataError`. `api/inventory.py:164` no fuerza `limit >= 1`. Además, el IVA no tiene tope ni catálogo: se aceptan 250 % y 7 % (`schemas/product.py:83-88`, `schemas/purchase.py:61`).

**Corrección:** agregar `Range(max=…)` y `Length(max=…)`, un handler `DataError` → 422, `limit = max(1, …)` y un catálogo de tasas de IVA (0/8/16).

### QA-B-09 · Medio · Editar un producto cuya categoría se desactivó falla (sospecha en la UI, confirmado en la API)
- **Pasos:** se desactiva la categoría 5 con un producto dentro (200, sin advertencia). Luego `PATCH /products/30` reenvía su `category_id`.
- **Obtenido:** 422 "Categoria no encontrada". El formulario del frontend siempre manda `category_id` (`frontend/src/pages/products/form-state.ts:56`), así que en la UI no se puede guardar ningún cambio sin cambiar de categoría.
- **Evidencia:** `product_service.py:307-314`. Desactivar la categoría no revisa si tiene productos.
- **Corrección:** validar que la categoría esté activa solo si cambia, o avisar o bloquear al desactivar una categoría con productos.

### QA-B-10 · Medio · Un proveedor desactivado no se puede reactivar y su RFC queda bloqueado
- **Obtenido:**
  - `PATCH /suppliers/10 {"is_active":true}` da 200, pero sigue en `is_active=False`: `SupplierUpdateSchema` lo excluye.
  - No existe un endpoint para reactivar ni un `include_inactive` en el listado.
  - Dar de alta otro proveedor con el mismo RFC da **409**, porque el RFC es UNIQUE (`models/purchase.py:13`).
  - "Sin Proveedor" desactivado se sigue usando en OC nuevas sin proveedor (OC-20261014-0017, `purchase_order_service.py:43-44`).
- **Lo que sí funciona:** recibir una OC abierta de un proveedor inactivo funciona (200), y crear una OC nueva con él da 400.
- **Corrección:** endpoint o campo para reactivar, listado con inactivos, y usar o reactivar "Sin Proveedor" a propósito.

### QA-B-11 · Medio · Una OC parcial no se puede cerrar ni cancelar
- **Obtenido:** `POST /orders/7/cancel` en estado `parcial` da 400 "Solo se pueden cancelar órdenes en borrador o enviadas" (`purchase_order_service.py:203`). Tampoco existe "cerrar con faltante".
- **Efecto:** una OC a la que el proveedor nunca le surte el resto se queda para siempre en `parcial` y en la campana (`status=borrador,enviada,parcial`).
- **Corrección:** acción "cerrar parcial" que pase a `recibida`, o a un estado `cerrada`, sin revertir lo ya recibido.

### QA-B-12 · Medio (conocido, confirmado) · KPI "Agotados" y `low-stock`
- **`low-stock`:** filtra `min_stock > 0` (`api/inventory.py:84`). Un producto agotado sin mínimo (Pintura, id 15) **no aparece**.
- **KPI:** el frontend (`frontend/src/pages/inventory.tsx:68-72`) cuenta los agotados solo entre los primeros 100 de `low-stock`. Marca **12**, y por SQL hay **17** activos con stock <= 0.
- **Además:** `stock == min` no cuenta como "bajo mínimo" (Cemento: 2 de 2) porque la comparación es estricta (`<`).
- **Corrección:** endpoint o contador de agotados en el servidor (`quantity <= 0`, todos los activos) y decidir si se usa `<=`.

### QA-B-13 · Bajo · Cerrar un conteo cuya diferencia deja stock negativo da un 409 genérico
- **Pasos:** se captura el producto 17 con 0 (esperado 5, diferencia −5). Luego un ajuste lo deja en 2 y se intenta cerrar.
- **Obtenido:** **409** "Conflicto con datos existentes: el registro ya existe…". No dice qué producto falla y el conteo sigue en `en_proceso`. Hubo que recapturar para cerrarlo.
- **Sospecha:** la diferencia que se guarda al capturar se aplica después de un ajuste absoluto. El producto 16 se contó en 8 con el sistema en 10; luego un ajuste lo puso en 7; al cerrar quedó en **5**. Con ventas en medio el delta es correcto, pero con un ajuste absoluto se descuenta dos veces.
- **Evidencia:** `inventory_count_service.py:182-196`.
- **Corrección:** al cerrar, mensaje claro con el producto. Considerar recalcular o invalidar la captura si hubo un ajuste manual después.

### QA-B-14 · Bajo · La cantidad del movimiento de ajuste no es el delta
- **Obtenido:** un ajuste manual de 1 a 20 guarda `quantity=20`, y uno de 2.5 a 1 guarda `quantity=1`: se guarda el stock nuevo, no el cambio. Los ajustes por conteo guardan `abs(delta)` sin signo.
- **Evidencia:** `inventory_service.py:89-92`. Los reportes no lo suman (lo revisé), pero el historial de movimientos se lee mal.
- **Corrección:** guardar el delta con signo, o `new - previous`.

### QA-B-15 · Bajo · Se aceptan nombres en blanco
- **Obtenido:** la categoría `"   "` se guarda como `""` (id 2): pasa la validación de longitud y después se recorta. También se aceptan un producto con nombre `"   "` (id 7), un SKU `"   "` (id 8), un proveedor `"   "` (id 8) y la unidad 11.
- **Corrección:** recortar espacios antes de validar (`Length(min=1)` sobre el texto ya recortado).

### QA-B-16 · Bajo · Búsqueda: comodines y diferencias entre buscadores
- **Comodines:** `search=%` o `search=_` regresan todos los productos (21), porque `product_service.py:27` y `api/inventory.py:53` no escapan los comodines de ILIKE.
- **Inconsistencia:** `/inventory/stock?search=tornilo` da 0, porque no usa trigramas, mientras que `/products?search=tornilo` da 1.
- **Parámetro inválido:** `category_id=abc` se ignora sin aviso y regresa todo.

### QA-B-17 · Bajo · Códigos HTTP inconsistentes
- Un conteo inexistente en capture, close o cancel da **400** en lugar de 404 (`inventory_count_service.py:109,172,238`).
- Una OC inexistente en send, cancel o receive da **400**.
- `movements/<id inexistente>` da 200 `[]`.
- Un token basura da 422 en lugar de 401.

### QA-B-18 · Bajo · Recapturar sin notas borra la nota anterior del renglón
"faltan 3" se convirtió en null (`inventory_count_service.py:136`).

### QA-B-19 · Bajo · Proveedores: validación débil del RFC
- `rfc:""` por API: el segundo alta da 409, porque el string vacío no se convierte en NULL. El frontend sí manda null (`supplier-form-modal.tsx:42`).
- Se acepta el mismo RFC en minúsculas (`fno120304ab1`, id 6).
- No se valida el formato del RFC: se acepta "123".
- Se aceptan nombres duplicados.

### QA-B-20 · Bajo · Órdenes de compra: detalles menores
- Se acepta un producto inactivo en una OC (OC-20261014-0005).
- `quantity=0.0004` pasa la validación, se guarda como 0.000 con total $0.00 y la orden no se puede recibir (OC-20261014-0007).
- Hay huecos de folio: el primero fue OC-…-0005, porque las altas fallidas consumen la secuencia.
- Con `items:[]` el mensaje dice "Debe tener al menos 1 caracteres".

### QA-B-21 · Bajo · Auditoría ruidosa o incompleta
- Un segundo DELETE de producto o proveedor da 200 y registra otra vez `desactivar` (con el valor previo ya en False).
- Un PATCH sin cambios registra `editar`.
- El ajuste no registra el stock previo.
- El cambio de `avg_cost` al recibir no se audita.
- Un producto inactivo con stock (id 11, 3 pz) sale en `/inventory/stock`, pero se excluye de los conteos, así que nunca se puede conciliar por conteo.

### QA-B-22 · Bajo · Precios con 3 decimales se redondean sin avisar
`sale_price=10.125` se guarda como 10.12 (redondeo bancario). Sería mejor rechazarlo con 422.

**Fuera de alcance, para el coordinador:** `/api/health` reporta el disco al **98.5 %** (3.5 GB libres).

## Funciona bien (verificado)
- **`avg_cost` del cliente se ignora**, en el alta (enviado 1.00, queda 85.50) y en PATCH.
- **Costo promedio ponderado correcto:** 5 recepciones a costos distintos (60, 60, 45.55, 45.55, 71.37) con stock previo de 4 a $50, incluyendo parciales y fracciones de kg. Mi cálculo a mano con Decimal coincide exacto en cada paso: 56.0000 → 57.1429 → 55.5377 → 53.8731 → 56.2060. La diferencia contra el cálculo sin redondeo es menor a 0.0001. Folios OC-20261014-0011/0012/0013.
- **Totales de la OC:** subtotal, IVA y total de OC-20261014-0008 calculados a mano = 587.14 / 80.00 / 667.14.
- **Reglas de recepción:** recibir más de lo pedido da 400; el mismo renglón dos veces en una petición (6+6 > 10) da 400 y no cambia el stock; recibir en borrador, cancelada o ya recibida da 400.
- **Cancelación de OC:** se cancela en borrador y en enviada; parcial y recibida no se pueden cancelar.
- **Movimientos y auditoría** de compra con folio.
- **Conteo físico:** alta, capturas, diferencia, cierre (stock final y movimiento `conteo` correctos) y cancelación (sin tocar el stock). Capturar, cerrar o cancelar un conteo cerrado o cancelado da 400. No se puede abrir un segundo conteo: 400, y con 6 altas simultáneas solo se creó 1. El folio CF- lo genera solo el frontend a partir del id (`stock-level.ts:41`); el backend no tiene folio.
- **Ajustes:** los 5 motivos quedan en la nota del movimiento y en la auditoría; un motivo inválido o vacío da 400; una cantidad negativa da 422; un producto inexistente da 404. El motivo es opcional en la API.
- **Matriz de permisos:** 41 endpoints × 3 roles, **0 discrepancias** contra `seed.ROLES`.

## Matriz de cobertura
| Función | Estado | Qué se probó |
|---|---|---|
| Productos: alta/edición | ⚠️ | Camino feliz, auditoría, SKU y código de barras duplicados (exactos y por mayúsculas), precio e IVA inválidos, desbordamientos, `avg_cost` ignorado (01, 05, 08, 15, 22) |
| Productos: desactivar/reactivar | ⚠️ | DELETE, `reactivate`, idempotencia, 404, bypass con PATCH (03) |
| Búsqueda `GET /products` | ✅/⚠️ | Errores de dedo, acentos, mayúsculas, SKU parcial, filtros, inactivos, paginación sin duplicados; comodines (16) |
| `by-code` | ❌ | SKU, código de barras, mayúsculas, espacios, inactivo → 404; colisión con NULL (01) |
| `pos-catalog` | ✅ | 20 activos = BD, excluye inactivos, campos compactos, 401 sin token |
| Etiqueta | ⚠️ | Vista previa, envío sin impresora (400), 404, precio sin IVA (04) |
| Unidades | ⚠️ | CRUD, duplicados, en uso → 422, `allows_fractions` (06, 07) |
| Categorías | ⚠️ | CRUD, duplicados sin importar mayúsculas (OK), desactivar en uso (09), en blanco (15) |
| Ajuste de inventario | ⚠️ | 5 motivos, inválido, negativo, fracciones, inactivo, auditoría (07, 08, 14) |
| `stock`, `stock/<id>`, `movements` | ✅/⚠️ | Listado con inactivo con stock, 404, `limit` (08, 17) |
| `low-stock` y KPI Agotados | ❌ | Confirmado 12 contra 17 (12) |
| Conteo físico | ⚠️ | Crear, capturar, cerrar, cancelar, estados, concurrencia, producto nuevo después de abrir el conteo (400), delta negativo (13, 18) |
| Proveedores | ⚠️ | CRUD, RFC, email, longitudes, en uso, reactivar (10, 19) |
| OC: crear/enviar/cancelar | ✅/⚠️ | Folio, totales, validaciones (20) |
| OC: recepción y costo promedio | ✅/⚠️ | Parcial, total, exceso, duplicado, estados, promedio exacto; costo inicial 0 (02, 11) |
| Permisos por rol | ✅ | 41 endpoints × 3 roles, salvo el bypass de `is_active` (03) |

## Datos que quedaron en `qa_api_b`
- **Productos:** 30. Incluyen los ids 1-13 (variantes de prueba), 14-21 (catálogo de búsqueda), 22 (NEW-AFTER), 23 (AVG-A, en kg), 24 (AVG0-A), 25-28 (pares de colisión de `by-code`), 29 (AVG0-B) y 30 (CAT-USE). Solo el id 11 está inactivo.
- **Categorías:** 5. La id 2 tiene nombre vacío y la id 4 está inactiva.
- **Unidades:** 11. Las 8-11 son mías, y "Kilogramo" volvió a `allows_fractions=true`.
- **Movimientos y conteos:** 36 movimientos de stock; 4 conteos (1 y 3 cerrados, 2 y 4 cancelados) con 89 renglones.
- **Proveedores:** 8. Inactivos: 9 "Sin Proveedor" y 10.
- **Órdenes de compra:** 13, de OC-20261014-0005 a 0017 (7 recibidas, 4 en borrador, 2 canceladas).
- **Auditoría:** 143 registros.
- No toqué ningún otro esquema ni `pos_db`. No edité código.
