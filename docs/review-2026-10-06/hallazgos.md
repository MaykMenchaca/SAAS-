# Revisión integral: POS Retail VRNTAS

**Fecha:** 2026-10-06
**Alcance:** `pos-system` (backend Flask, frontend React, scripts de operación), commit `749aa06`
**Método:** 6 agentes de solo lectura definidos en [`.claude/agents/`](../../.claude/agents/). Cada hallazgo indica qué agentes lo reportaron. Se agruparon los duplicados y se verificaron en el código o reproduciéndolos.

| Agente | Hallazgos | Ejecución |
|---|---|---|
| `revisor-backend` | BE-01…18 | pytest: **181 passed** (226 warnings `InsecureKeyLengthWarning`). Script de verificación en `pos_test_db` |
| `revisor-frontend` | FE-01…19 | `npm run build` OK (418 kB / 132 kB gzip el chunk mayor) |
| `revisor-seguridad` | SEC-01…15 | Tabla de permisos por endpoint. `npm audit`: 3 altas y 1 moderada |
| `revisor-operacion` | OPS-01…21 | Lectura de scripts y config; verificación de PATH, `pg_hba.conf` y zona horaria |
| `qa-funcional` | QA-01…32 | 11 flujos de punta a punta en el navegador. 3 ❌ graves, 4 ❌ y 4 ⚠️ en total |
| `revisor-visual` | UI-01…17 | 14 páginas × 3 viewports × 2 temas, con contraste y dimensiones medidos |

**Severidades:** 🔴 Crítico (pierde dinero o datos, o expone el sistema) · 🟠 Alto · 🟡 Medio · ⚪ Bajo

---

## Resumen ejecutivo

**Veredicto:** el sistema compila y sus 181 tests pasan, pero **todavía no es apto para operar en una tienda real.** Los tests no cubren los flujos de dinero que fallan.

Los riesgos se concentran en cuatro frentes:
1. **Integridad del dinero.** Precios manipulables, devoluciones duplicables, un corte de caja que no cuadra, ventas duplicadas y ventas "fantasma".
2. **Seguridad.** Escritura arbitraria de archivos, secretos y credenciales públicas, y el modo debug expuesto.
3. **Trazabilidad.** La auditoría no guarda nada.
4. **Continuidad.** Los respaldos nunca se generaron y la restauración no funciona.

---

## 🔴 Críticos

| ID | Hallazgo | Evidencia clave | Fuentes |
|---|---|---|---|
| **H-01** | **El cliente fija el precio, el IVA y el descuento de la venta.** Además se aceptan fracciones en productos que se venden por pieza y productos inactivos. | `backend/app/services/sale_service.py:62-65` usa `item_data["unit_price"]`. Reproducido: un cajero vendió una Tuerca de $34.90 en **$0.01** (V-20261007-0003). | BE-01, SEC-03, QA-03, QA-19 |
| **H-02** | **Escritura arbitraria de archivos** a través del campo `printer_path` (basta con el rol cajero). Abre una cadena hasta `.env`, XSS en `dist/index.html` o la fuga del hash NTLM por rutas UNC. | `backend/app/api/printing.py:13-15` y `backend/app/services/printer_service.py:95-101` (`Path(target).write_bytes`). Reproducido en `pos_test_db`. | BE-06, SEC-02, OPS-10, QA-04 |
| **H-03** | **Cualquier error del servidor al cobrar se convierte en una "venta offline" exitosa.** Pasa con 400 por falta de stock, caja cerrada o pago insuficiente: la pantalla muestra "Venta completada", el carrito se vacía y la venta queda bloqueando la cola. | `frontend/src/pages/pos.tsx:771-778` (`catch` genérico). Reproducido con stock insuficiente y con la caja cerrada. | FE-01, OPS-03, QA-02 |
| **H-04** | **El total del frontend no coincide con el del backend.** El frontend redondea el IVA global y el backend lo hace por línea con HALF_EVEN. El botón "Exacto" queda 1 centavo corto, el backend responde 400 y la venta cae en H-03. | `frontend/src/stores/pos-store.ts:43-68` y `sale_service.py:71-79`. Reproducido: POS $115.77 contra venta $115.76, con el cambio mal entregado. | FE-02, QA-16 |
| **H-05** | **Ventas duplicadas.** Un doble clic en "Completar Cobro" crea 2 ventas. No hay clave de idempotencia y la sincronización offline puede reenviar ventas. | Reproducido: V-0004 y V-0005, dos `201` en 1 ms. `frontend/src/hooks/useSyncQueue.ts` sin mutex. | QA-01, OPS-03/04, FE-08 |
| **H-06** | **Una devolución con el mismo `sale_item_id` repetido devuelve más de lo vendido.** | `sale_service.py:197-225` no actualiza `already_returned` dentro del bucle. Reproducido: reembolso de $231.54 sobre una venta de $115.77 y stock por encima del original. | BE-03, QA-05 |
| **H-07** | **Se puede cancelar una venta ya devuelta y el stock se repone dos veces.** | `sale_service.py:154-166`. Reproducido: stock de 10 a 11.5 kg. | BE-04, QA-06 |
| **H-08** | **El corte de caja, el dashboard y los reportes ignoran las ventas con devolución y no restan los reembolsos.** | `backend/app/api/cash_register.py:84-92` y `backend/app/api/reports.py` filtran `status=="completada"`. `SaleReturn` no registra sesión ni método. Reproducido: corte con sobrante falso de +$19.49. | BE-02, QA-08 |
| **H-09** | **La bitácora de auditoría nunca guarda nada.** | `backend/app/services/audit_service.py:50` solo hace `flush()` y se llama después del `commit`. `audit_logs` tiene **0 filas** en `pos_db`. Los tests pasan en falso. | BE-05, SEC-04, QA-09 |
| **H-10** | **Secretos débiles o por defecto.** El `.env` real tiene un `SECRET_KEY` provisional de 21 caracteres, idéntico al `JWT_SECRET_KEY`. `install-production.ps1` copia el `.env.example`, que es público. `backend/app/config.py` tiene fallbacks. La contraseña de PostgreSQL es la pública (`pos_pass`) y la base escucha en `0.0.0.0:5432`. Con eso se puede **falsificar un JWT de admin.** | `install-production.ps1:9-12`, `config.py:8,11,20`, `setup-db.ps1:9`. Verificado sin imprimir los valores. | SEC-01, SEC-08, OPS-05 |
| **H-11** | **`admin/admin123` sigue activo.** El seed lo recrea en cada arranque, nunca se obliga a cambiarlo, los scripts lo muestran en pantalla y el login no tiene límite de intentos. | `backend/app/seed.py:126-147`, `start.bat:73`. Hash verificado. 10 intentos fallidos sin ningún 429. | SEC-05, OPS-05, OPS-16, QA-26 |
| **H-12** | **Los respaldos automáticos nunca se han generado** y el fallo es invisible. `pg_dump` no está en el PATH, el cierre de caja se traga la excepción y no hay ningún respaldo programado. | `backend/app/services/backup_service.py:71-92`, `cash_register.py:104-111`. `backups/` estaba vacío. El cierre de caja mostró "Caja cerrada correctamente" sin respaldo. | OPS-01, QA-20, BE-14 |
| **H-13** | **La restauración no funciona y nunca se ha probado.** `pg_restore` no está en el PATH. El script no lee `.env`. Sin `--single-transaction`, una falla a la mitad deja la base parcialmente borrada. | `restore-backup.ps1:5,17-19,45,68-76`. `backend/tests/test_backup.py` está 100 % simulado con mocks. | OPS-02 |
| **H-14** | **Los respaldos con datos reales pueden terminar en el repo público.** `.gitignore` no cubre `backend/backups/` ni `*.dump`/`*.sql`, que es el destino por defecto de los respaldos. | `git status` → `?? backend/backups/` | SEC-07, OPS-17 |

## 🟠 Altos

| ID | Hallazgo | Evidencia clave | Fuentes |
|---|---|---|---|
| **H-15** | El servidor de desarrollo corre con `debug=True` en `0.0.0.0` (el depurador de Werkzeug queda expuesto en la LAN). `start.bat` arranca en modo desarrollo, y Vite sin `host` no es accesible desde las cajas. | `backend/run.py:6`, `start.bat:58,62`, `frontend/vite.config.ts` | BE-09, SEC-06, OPS-06 |
| **H-16** | El cliente decide el cambio (`change_amount`): no se valida que pagos menos cambio sea igual al total. Además, cualquier cajero puede cerrar la caja de otro o vender en una sesión ajena (IDOR). | `sale_service.py:115-131`, `cash_register.py:67-78` | BE-07, SEC-10 |
| **H-17** | Los tokens no se revocan: siguen sirviendo tras el logout y tras desactivar al usuario. Los permisos quedan congelados en el JWT durante 8 h, el refresh dura 7 días y todo se guarda en `localStorage`. | `backend/app/utils/decorators.py:10-13`, `config.py:21-26`. Reproducido con un token de un usuario desactivado → 200. | BE-10, SEC-09, QA-11 |
| **H-18** | El estado del POS sobrevive al corte de caja y al logout (sesión de caja y carrito). La caché de React Query pasa de un usuario a otro: un cajero vio la lista de usuarios del admin. | `pos-store.ts:144-146`, `auth-store.ts:61-71`. Reproducido. | FE-04, QA-10, QA-22 |
| **H-19** | La interfaz ignora los permisos: muestra todo el menú y todas las rutas al cajero, y el dashboard le responde 403. Los badges generan 403 cada 60 s. `productos:editar_precio` nunca se aplica. | `app-shell.tsx:59-91`, `App.tsx:66-77`, `use-sidebar-badges.ts` | FE-05, QA-17, SEC-12 |
| **H-20** | El conteo físico fija el stock en un valor absoluto y borra las ventas hechas durante el conteo. | `inventory_count_service.py:143-152` | BE-08 |
| **H-21** | Fechas en UTC en reportes, dashboard, folios, filtros y nombres de respaldo. Las ventas después de las 18:00 cuentan para el día siguiente. | `reports.py:21-24`, `sale_service.py:289`, `dashboard.tsx:73`. Reproducido: folios `V-20261007` el 6 de octubre. | OPS-12, BE-12, FE-09, QA-15 |
| **H-22** | La impresión no está configurada (`PRINTER_DEVICE_PATH` no existe) y está centralizada en el servidor. El cajón solo abre al imprimir a mano. El ticket ignora los datos de la empresa y el pie configurados. Codificación cp437 sin `ESC t`. Una impresora desconectada da un 500 genérico. | `printer_service.py:21,95-101`, `frontend/src/api/printing.ts` | OPS-09, OPS-11, QA-21 |
| **H-23** | No hay servicio de Windows, arranque automático ni reinicio ante caídas. La instalación falla en silencio y termina diciendo "OK": `psql` no está en el PATH y no se revisa `$LASTEXITCODE`. | `start-production.ps1`, `setup-db.ps1:14-23`, `install-production.ps1`, `DEPLOYMENT.md` | OPS-07, OPS-08 |
| **H-24** | El modo offline no es fiable. La cola se bloquea con una sola venta mala, no reintenta y usa el JWT de quien esté logueado. Recargar sin servidor cierra la sesión. Axios no tiene timeout. El service worker no funciona por HTTP en la LAN. El ticket offline usa `user_id: 1`. | `useSyncQueue.ts`, `auth-store.ts:73-86`, `api/client.ts`, `pos.tsx:782-815` | OPS-04, OPS-15, FE-06, FE-11 |
| **H-25** | Desde la interfaz no se puede devolver una cantidad válida (`step="1" min="0.001"`). El modal de devoluciones usa datos viejos de la caché. | `pages/returns.tsx:335-337`. Reproducido. | QA-07, QA-28 |
| **H-26** | Un producto nuevo no aparece en Inventario ni en las alertas hasta su primer movimiento (no se crea el registro `Stock`), y su `avg_cost` queda en 0. | Reproducido con QA-Producto | QA-13 |
| **H-27** | El dashboard muestra datos inventados: tendencias fijas (+12.4 %, +3, +8.1 %), banner "Turno Abierto" siempre visible y "Vendido en turno" que en realidad es lo del día. Configuración muestra "Red: Online" y versión v1.0.0 fijos. | `dashboard.tsx:92-146`, `settings.tsx:196-217` | FE-03, FE-12, QA-14 |
| **H-28** | No se puede crear un usuario sin email aunque el campo dice "opcional", y el error sale en inglés ("Field may not be null."). | `UserCreateSchema.email` con `required=True` | QA-12 |

## 🟡 Medios

| ID | Hallazgo | Fuentes |
|---|---|---|
| H-29 | Faltan invalidaciones de React Query tras vender, devolver, recibir o ajustar. Con `staleTime` de 5 min, el POS muestra stock viejo. | FE-07 |
| H-30 | Presionar Esc en la paleta de comandos o en el buscador vacía el carrito sin pedir confirmación. | FE-10 |
| H-31 | Condiciones de carrera: dos sesiones abiertas en la misma caja, una venta durante el cierre, recepciones concurrentes de compras. `avg_cost` se redondea a 0.01 en cada recepción. | BE-13, BE-18 |
| H-32 | Una fecha inválida en reportes o auditoría da 500. No hay manejador de `IntegrityError` (409). | BE-11 |
| H-33 | Faltan constraints (CHECK y UNIQUE) e índices en `created_at` y `audit_logs`. El índice trigram no está declarado en el modelo, así que el siguiente `migrate` lo borraría. | BE-15 |
| H-34 | Los tests comparten la sesión y el app context, y eso oculta errores de transacción. Los fixtures venden a un precio distinto al del catálogo. Hay flujos críticos sin test. | BE-17 |
| H-35 | Dependencias vulnerables o desactualizadas: `react-router`, `axios`, `form-data`, `flask-cors` 5→6, Werkzeug, PyJWT. | SEC-14 |
| H-36 | Observabilidad: no hay logs a archivo, `/api/health` no consulta la BD y los blueprints que fallan al importar desaparecen en silencio. | OPS-14, SEC-15 |
| H-37 | El seed en cada arranque no asigna permisos nuevos a los roles existentes. Las secuencias de folio se crean en el seed y no en una migración. | OPS-16 |
| H-38 | La búsqueda por similitud no encuentra errores comunes ("martilo", "tornilo"). | QA-18 |
| H-39 | Cobertura de auditoría incompleta: devoluciones, ajustes, usuarios, caja y recepciones no se registran. | SEC-11 |
| H-40 | Acciones destructivas sin confirmación (cancelar OC, desactivar usuario o proveedor, cerrar turno). Se puede desactivar al último admin o a uno mismo. | FE-13, QA-25, QA-32 |
| H-41 | El service worker también se registra en desarrollo, cachea todo y su versión está fija en `v1`. | FE-14 |
| H-42 | Los respaldos no tienen retención ni copia fuera del equipo. Un error de USB da 500. La extensión `.sql` no corresponde al formato `-Fc`. | OPS-13 |
| H-43 | Un producto desactivado no se puede ver ni reactivar, y desaparece de inventario aunque tenga stock. | QA-23 |
| H-44 | La campana de notificaciones no tiene acción, y "Conexión LAN OK" solo se basa en `navigator.onLine`. | QA-24, FE-12 |
| H-45 | Listados sin paginar, CORS abierto a cualquier origen, `avg_cost` editable a mano, HTTP sin TLS. | BE-16, SEC-13, OPS-21 |

## ⚪ Bajos

| ID | Hallazgo | Fuentes |
|---|---|---|
| H-46 | Uso de `any`, código duplicado, `motion` sin usar, `formatCurrency` sin usar, `graphify-out` dentro de `src`. | FE-15, FE-17 |
| H-47 | El lector de código de barras se vuelve a registrar en cada render y el escaneo se escribe dentro del input. Umbral fijo de 50 ms. | FE-16, OPS-20 |
| H-48 | La cantidad se envía como número flotante (`0.30000000000000004`). | FE-18 |
| H-49 | Reportes: no se valida que la fecha inicial sea anterior a la final, y la gráfica diaria se salta los días sin ventas. | FE-19 |
| H-50 | Repositorio: README vacío, sin CI, hook de pre-commit no versionado y con `echo.`, scripts sueltos, `%ERRORLEVEL%` sin delayed expansion. | OPS-18, OPS-19 |
| H-51 | `.env.example` incompleto: faltan `PRINTER_DEVICE_PATH`, `BUSINESS_NAME`, `PG_BIN_DIR` y la zona horaria. `FLASK_ENV` está obsoleta. Pool contra `max_connections`. | OPS-21 |
| H-52 | Huecos en los folios: las ventas rechazadas consumen la secuencia. | QA-29 |
| H-53 | Aparece el método de pago "Crédito", que está fuera del MVP y se cobra como efectivo. | QA-30, FE-17 |
| H-54 | Catálogos duplicados: categorías que solo cambian en mayúsculas y "Sin Proveedor" doble. | QA-31 |
| H-55 | Con un token inválido (422), la aplicación no cierra la sesión. | QA-27 |

---

## 🎨 UI y accesibilidad (`revisor-visual`)

Se revisaron 14 páginas en 3 viewports (1280, 768 y 375 px) y 2 temas, con mediciones de estilos computados.

**Lo que no ha regresado de la auditoría de junio:** no queda ningún `transition-all`, `text-muted` cumple el contraste, los modales y la paleta de comandos son accesibles y existe el enlace para saltar al contenido.

| ID | Sev. | Hallazgo | Evidencia |
|---|---|---|---|
| UI-01 | 🟠 | **El color primario no cumple contraste.** Pasa con el texto blanco de todos los botones primarios y con el texto en color primario (folios, tabs activas, «Ver todo»). | Blanco sobre primario: **2.68:1** en claro y 2.71:1 en oscuro. Texto primario: 2.58:1. El danger en oscuro, 3.73:1. La referencia Obsidian usa texto oscuro sobre el primario. |
| UI-02 | 🟠 | **El foco de teclado no se ve** en el sidebar ni en el header, y el anillo de `Button` e `Input` es débil (≈1.5:1). | `app-shell.tsx:388,473,534,552` usa `outline-none` sin reemplazo. |
| UI-03 | 🟠 | **No hay navegación colapsable en tablet ni en móvil.** El sidebar se apila encima y el contenido empieza en y=764 px en todas las rutas. | El `<aside>` es `static` por debajo de `lg` y no hay botón hamburguesa. |
| UI-04 | 🟠 | La gráfica semanal del dashboard pone las ventas de hoy en el día anterior (a partir de las 18:00). | `dashboard.tsx:16-17,73`. Mismo problema de fondo que **H-21**. |
| UI-05 | 🟡 | El dashboard desborda a 375 px (el layout mide 388 px). En 768 y 375, el breadcrumb y el título se reducen a 10 px de ancho y los botones de icono a 20×36. | `dashboard.tsx` grid, y `app-shell.tsx` sin `shrink-0` |
| UI-06 | 🟡 | Badges de estado y textos chicos por debajo de 4.5:1 en tema claro. | Success 3.25:1, warning 3.03:1, avatar 2.31:1, subtítulo y rol del sidebar 2.33–2.47:1 |
| UI-07 | 🟡 | Tipografía fuera de la escala de MASTER. | `text-[9px]` ×9, `[10px]` ×44, `[11px]` ×12. El h1 mide 20 px en lugar de 32, y los KPI 20 px. |
| UI-08 | 🟡 | Inputs de 14 px en móvil y tablet (iOS hace zoom automático). Regresión parcial de la remediación 1.3. | `components/ui/input.tsx` y `select.tsx` usan `text-sm` |
| UI-09 | 🟡 | Objetivos táctiles menores de 44 px en el shell. | Header 36 px, sidebar 38 px, «Cerrar sesión» ≈24 px, toggle 24 px |
| UI-10 | 🟡 | Formato de cantidades ambiguo. | «0.000 / min 20.000» para piezas, «1.000 uds», «MIN/MAX 8 / 0» |
| UI-11 | 🟡 | Configuración muestra contenido fijo y una acción engañosa. | Igual que **H-27**, más un `window.confirm` nativo |
| UI-12 | ⚪ | Faltan acentos y hay textos en inglés. | «Configuracion», «codigo», «Backups», «Online», «1 transacciones», `document.title` «POS System» |
| UI-13 | ⚪ | Gráficas de reportes con ticks ISO repetidos y SVG sin `role="img"` ni `aria-label`. | `pages/reports*` |
| UI-14 | ⚪ | Login: el placeholder revela «admin», el botón aparece deshabilitado sin explicación, contraste de 2.17–2.38:1 y la marca no coincide entre pantallas (VRNTAS, MENCH, POS System). | `login.tsx` |
| UI-15 | ⚪ | El enlace de volver en Conteo no tiene nombre accesible. | `inventory-count.tsx` |
| UI-16 | ⚪ | Regresión de la remediación 2.4: vuelve a haber `cursor-pointer` manual en los botones. | `app-shell.tsx:473,534,552` |
| UI-17 | ⚪ | Las tablas en móvil hacen scroll sin ningún indicador. El corte de caja vacío no ofrece un botón para abrir caja. Hay una categoría duplicada (igual que H-54). | `table.tsx`, `cash-cut.tsx` |

---

## Datos de prueba creados en `pos_db` por QA

- Usuario `QA-cajero` (desactivado).
- `QA-Producto Clavo granel` (inactivo).
- `QA-Proveedor` y las órdenes de compra OC-20261007-0002/0003.
- Ventas V-20261007-0003 a 0011, incluida una a $0.01 y una devolución inflada.
- Ajustes de Tornillo y QA-Producto.
- Sesión de caja 4 cerrada con un sobrante de +$19.49.

**Respaldo previo a la revisión:** `backend/backups/pre-review-2026-10-06.dump` (`pg_dump -Fc`). Para volver al estado anterior hay que restaurarlo con la ruta completa: `C:\Program Files\PostgreSQL\18\bin\pg_restore.exe`.
