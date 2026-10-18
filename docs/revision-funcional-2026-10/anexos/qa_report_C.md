# QA-C — Revisión funcional POS VRNTAS: auth, usuarios, permisos, reportes, config, auditoría, respaldos

- Rama `feat/rediseno-industry`, backend aislado en `http://127.0.0.1:5103/api`, esquema `qa_api_c` de `pos_test_db` (verificado `current_schema() = qa_api_c` antes de cada SQL). No se tocó `pos_db` ni otros esquemas. No se editó código del repo.
- Fecha de prueba: 2026-10-14 (miércoles), zona `America/Mexico_City`.
- Scripts y salidas: `S\qac_*.py`, `S\qac_matrix.json`, `S\qac_lock.out`. Contraseñas de usuarios de prueba en `S\qac_testusers.json` (no se incluyen aquí).
- Nota sobre fechas: para probar zona horaria y devoluciones en días sin ventas se cambiaron por SQL los `created_at` de las ventas 2 y 3 y de la devolución 3 en `qa_api_c`. Por eso los folios dicen `20261014` aunque las fechas sean otras.

## Resumen

| ID | Sev. | Función | Título |
|---|---|---|---|
| QA-C-01 | **Crítico** | Restauración / sesiones | La restauración no cierra los tokens emitidos con `token_version` = respaldo+1 |
| QA-C-02 | **Alto** | Config / ventas | `PUT /api/config` no valida valores: `max_discount_percent` inválido detiene las ventas (500/400) o quita el tope de descuento |
| QA-C-03 | Medio | Auth / cambio de contraseña | `change-password` revoca el refresh token y no entrega otro: la sesión muere al vencer el access (30 min) |
| QA-C-04 | Medio | Reportes de ventas | `daily` y `payment_methods` no cuadran con `total_revenue` cuando hay devoluciones |
| QA-C-05 | Medio | Respaldos | DELETE y verify aceptan archivos que no están en la lista (borran los `pre-restore-*`) |
| QA-C-06 | Medio | Restauración | Dos restauraciones simultáneas se aceptan y se ejecutan las dos (202 + 202) |
| QA-C-07 | Medio | Login | Bloqueo por usuario sin distinguir mayúsculas: cualquiera bloquea la cuenta real (incluido admin) con 10 intentos de una variante inexistente |
| QA-C-08 | Bajo | Respaldos | Dos respaldos en el mismo segundo comparten nombre: 3×201, un solo archivo |
| QA-C-09 | Bajo | Errores HTTP | Un método no permitido (405) responde 500 "Error interno" |
| QA-C-10 | Bajo | Auth | Credenciales no-string (número) en login/change-password → 500 |
| QA-C-11 | Bajo | Login | El límite por IP (5/min) cuenta también los inicios de sesión correctos |
| QA-C-12 | Bajo | Usuarios | Username con espacios o que solo cambia mayúsculas, y email duplicado en mayúsculas, se aceptan (uno de ellos nunca puede entrar) |
| QA-C-13 | Bajo | Config | Claves desconocidas, claves largas (500), lista como cuerpo (500), `null` guardado como "None" |
| QA-C-14 | Bajo | Branding | `/config/branding` lee `business_*` pero la pantalla guarda `company_*`: dirección, teléfono y RFC salen vacíos |
| QA-C-15 | Bajo | Reportes | `limit=-1` recorta el último producto; rango 0001-01-01..9999-12-31 → 500; `from > to` sin error |
| QA-C-16 | Bajo | Respaldos | `..` en DELETE/verify → 500; mensajes con rutas absolutas del servidor; `path` absoluto en la respuesta de crear |
| QA-C-17 | Bajo | Auth | `change-password` sin límite de intentos y acepta la misma contraseña |
| QA-C-18 | Bajo | Auditoría | `user_id=abc` se ignora sin error (devuelve todo) |
| QA-C-19 | Bajo | Respaldos | Los `pre-restore-*.dump` no entran en la retención: se acumulan sin límite |

Sospechas sin confirmar (no cuentan como hallazgo): ver el final.

---

## Hallazgos

### QA-C-01 — Crítico — La restauración no revoca todas las sesiones
- **Función:** `POST /api/backup/<f>/restore`, paso "Cerrando todas las sesiones".
- **Causa:** `restore_service.py:174-179` hace `token_version = token_version + 1` **sobre el valor restaurado**. Un token emitido después del respaldo, cuando el usuario ya tenía `token_version` = valor del respaldo + 1, vuelve a coincidir y se acepta (`app/__init__.py:94-96`). `TokenBlocklist` también vuelve al estado del respaldo.
- **Pasos (reproducido 2 veces):**
  1. Usuario `qa_c_tv` (cajero) con `token_version` = N. Admin crea respaldo B.
  2. Repro 1: el usuario cambia **su** contraseña (`/auth/change-password`) y recibe un token nuevo (tv N+1). Repro 2: el admin le cambia el rol a gerente y el usuario inicia sesión (tv N+1).
  3. Admin restaura B con la confirmación correcta y espera `state=ok`.
- **Esperado:** según el propio mensaje ("Todas las sesiones se cerraron; vuelve a iniciar sesión"), todos los tokens anteriores dan 401.
- **Obtenido:** el token de admin y el de cajero previos dan 401, pero el token de `qa_c_tv` emitido después del respaldo sigue funcionando: `/auth/me` 200 y `GET /products/` 200. `token_version` restaurado+1 = 3 = el del token (repro 1); 4 = 4 (repro 2). Salida: `qac_restore.py password` / `qac_restore.py role`.
- **Impacto:** el caso típico de "restaurar a antes de un incidente" falla. Un atacante que tomó una cuenta y cambió su contraseña una vez conserva la sesión después de la restauración.
- **Corrección propuesta:** antes de restaurar, guardar `max(token_version)` por usuario (o global) y, después, fijar `token_version = GREATEST(restaurado, guardado) + 1`. Otra opción: una "época de sesiones" fuera de la BD (archivo junto a la bandera de mantenimiento) o rechazar todo `iat` anterior al fin de la restauración. Agregar una prueba con un token emitido después del respaldo.

### QA-C-02 — Alto — Configuración sin validación; `max_discount_percent` rompe o abre las ventas
- **Función:** `PUT /api/config/` (`config_service.py:46-62`, guarda `str(value)` de cualquier clave) y su uso en `sale_service.py:40-44,75`.
- **Pasos / obtenido** (cajero, `POST /sales/quote` con `discount_percent` 0/50/100; `qac_config.py`):
  - `"NaN"` → **500** en toda cotización y venta, también sin descuento y también para admin (`venta cajero SIN descuento con tope 'NaN': 500`, `venta ADMIN ...: 500`). Reproducido 2 veces. La comparación `Decimal > NaN` lanza `InvalidOperation`.
  - `"-5"` → 400 "El descuento del 0.00% supera el tope permitido (-5%)": el cajero no puede vender **ni sin descuento**.
  - `"Infinity"` o `"150"` → el cajero aplica 100 %: se creó la venta id 6 con total **0.00**, pagada con 0.01.
  - `"abc"` → se acepta y se toma como 0 sin avisar.
  - Los demás valores tampoco se validan: `default_tax_rate: "abc"` y `allow_negative_stock: "quizas"` → 200.
- **Esperado:** 400/422 para valores fuera de tipo o rango.
- **Corrección propuesta:** un esquema por clave conocida (decimal 0–100 finito para porcentajes, booleano, longitud máxima). En `price_lines`, rechazar valores no finitos y negativos y usar un valor seguro (0).

### QA-C-03 — Medio — `change-password` deja la sesión sin refresh válido
- **Función:** `POST /api/auth/change-password` (`auth.py:138,150-156`; `models/user.py:58-60` sube `token_version`).
- **Pasos:** login → change-password correcto → `POST /auth/refresh` con el refresh del login.
- **Obtenido:** 401 `token_revoked` (reproducido 2 veces: cambio normal y cambio tras restablecimiento). La respuesta solo trae `access_token`. El frontend guarda solo ese token (`pages/change-password.tsx:41`, `passwordChanged(result.access_token)`) y conserva el refresh viejo, así que a los 30 min la sesión se cierra. Esto le pasa a todo usuario nuevo o con contraseña restablecida, justo después del primer cambio obligatorio.
- **Esperado:** el cambio entrega también un `refresh_token` nuevo, o revoca las demás sesiones y mantiene la actual.
- **Corrección:** devolver `refresh_token` en la respuesta y guardarlo en el frontend.

### QA-C-04 — Medio — Reporte de ventas: los desgloses no cuadran con el total
- **Función:** `GET /api/reports/sales` (`reports.py:263-267` y `328-339`; recorte a 0 en `197-200`).
- **Datos:** 5 ventas, 1 cancelada y 3 devoluciones (`qac_reports.py`, `qac_reports2.py`).
- **Caso 1:** devolución hoy, por tarjeta, de una venta de ayer pagada con tarjeta (100.00). Reporte de hoy: `total_revenue` 182.00 y suma de `daily` 182.00, pero `payment_methods` solo trae efectivo 282.00. El reembolso con tarjeta desaparece porque hoy no hubo ventas con tarjeta.
- **Caso 2:** devolución en efectivo de 116.00 en un día sin ventas (D-3). Rango D-3..hoy: `total_revenue` 354.60, suma de `daily` **470.60**: el día D-3 no aparece. Consultando solo D-3: `total_revenue` "0.00" (recortado), sin `daily` ni métodos. La salida de efectivo no se ve.
- **Esperado:** total = Σ daily = Σ métodos, incluyendo días y métodos que solo tienen devoluciones, sin recortar a 0.
- **Corrección:** unir las claves de ventas y devoluciones (días y métodos) y permitir netos negativos o mostrar las devoluciones aparte.

### QA-C-05 — Medio — Eliminar o verificar archivos fuera de la lista de respaldos
- **Función:** `DELETE /api/backup/<f>` y `POST /<f>/verify` usan solo `_resolve_backup_path` (`backup_service.py:300-308, 311-315, 369-377`). No validan contra la lista como lo hacen download y restore (`resolve_listed_backup`, `:349`).
- **Obtenido:** `DELETE /backup/notas_qa_c.txt` → 200 y se borró. `DELETE /backup/pre-restore-20200101_000000.dump` → 200 y se borró. Ese archivo es la red de seguridad que la restauración indica usar con `restore-backup.ps1`. Verify sobre `notas_qa_c.txt` → 500. También se pueden borrar `.restore-status.json` y la bandera de mantenimiento por defecto, que viven en la misma carpeta. La salida del directorio sí está bloqueada: `../`, `..%5C`, rutas absolutas y `C:\Windows\win.ini` → 400/404, y el archivo de fuera siguió existiendo.
- **Corrección:** usar `resolve_listed_backup` en delete y verify. Si se quiere permitir borrar `pre-restore-*`, hacerlo con una ruta explícita.

### QA-C-06 — Medio — Restauraciones concurrentes
- **Función:** `restore_service.start_restore` (`:274-308`). La revisión `_is_running()` y el cambio a `en_curso` no son atómicos, y entre ambos corren verify y el respaldo previo (segundos). El modo mantenimiento se activa después.
- **Pasos:** dos `POST /<f>/restore` válidos al mismo tiempo (`qac_restore_race.py`, 2 intentos).
- **Obtenido:** las dos respuestas fueron **202/en_curso** en ambos intentos. Hubo 2 `pre-restore` por intento y 2 filas de auditoría `restore ok`. La BD terminó bien en esta prueba (restauración de ~1 s).
- **Riesgo (sospecha, no observado):** el primer hilo que termina llama `maintenance.leave()` mientras el otro sigue restaurando. Las ventas registradas en ese hueco se perderían en el segundo `--clean`.
- **Corrección:** tomar un lock (proceso + archivo exclusivo `O_EXCL`) y marcar `en_curso` antes de verify y del respaldo previo. Rechazar con 409 si ya existe.

### QA-C-07 — Medio — Bloqueo de cuenta por terceros y sin distinguir mayúsculas
- **Función:** `rate_limiter.py:25-35,38-46` (llave `username.lower()`) con login sensible a mayúsculas (`auth_service.py:33`).
- **Pasos:** 10 intentos fallidos con `QA_C_AUTH`/`Qa_C_Auth` (usuario inexistente) y después login de `qa_c_auth` con la contraseña correcta.
- **Obtenido:** 429 "Usuario bloqueado temporalmente..." (`qac_lock.out`). El caso directo (10 fallos de `qa_c_lock` → 429 con la contraseña correcta) también se confirmó. Sin autenticarse, cualquiera en la red puede bloquear 5 minutos la cuenta `admin` (repitiendo cada 5 min, de forma indefinida). Basta con 10 intentos en 2 minutos, por el límite de IP.
- **Corrección:** usar la misma regla de mayúsculas en la llave y en la búsqueda. Contar los fallos por usuario solo si el usuario existe. Combinar usuario+IP para el bloqueo o usar retraso progresivo en vez de bloqueo duro.

### QA-C-08 — Bajo — Colisión de nombre de respaldo en el mismo segundo
- `backup_service.py:123-131`: el nombre lleva la hora al segundo y no tiene contador (salvo con prefijo). 3 `POST /backup/` simultáneos → `[201, 201, 201]`, el mismo `filename` y **1 archivo** en disco, con 3 auditorías `create` (2 intentos, `qac_bk2.py`, `qac_backup.py`). El archivo pasó verify; no se observó corrupción. También aplica al respaldo automático al cerrar caja (`cash_register.py:243-256`) si dos cajas cierran en el mismo segundo.
- **Corrección:** el mismo bucle de contador que con `prefix`, o abrir con `O_EXCL`, o microsegundos en el nombre.

### QA-C-09 — Bajo — 405 convertido en 500
- `errors.py:117-118` registra `@errorhandler(Exception)`, que también atrapa `HTTPException`. `PUT /api/health` y `DELETE /api/auth/me` → 500 `{"error":"Error interno del servidor","error_id":...}`, y el log muestra "405 Method Not Allowed" como excepción no manejada.
- **Corrección:** en el handler, `if isinstance(e, HTTPException): return jsonify(error=e.description), e.code`.

### QA-C-10 — Bajo — Tipos no-string → 500
- `POST /auth/login` con `password: 12345678` (usuario existente) → 500 (`'int' object has no attribute 'encode'`). Con `username: 123` → 500 (`.strip()`, `auth.py:18`). En `change-password`, `new_password` numérico → 500 (`len`, `auth.py:135`) y `current_password` numérico → 500. Endpoint público que devuelve 500.
- **Corrección:** validar con un esquema Marshmallow (`fields.Str`).

### QA-C-11 — Bajo — El límite por IP cuenta los logins correctos
- `auth.py:27` llama `record_ip_attempt` antes de autenticar. Con 6 logins **correctos** seguidos desde la misma IP → `[200,200,200,200,200,429]`. En un cambio de turno detrás de NAT o proxy, el sexto usuario del minuto queda fuera. Además, los contadores viven en memoria por proceso (con gunicorn de varios workers el límite real se multiplica).
- **Corrección:** contar solo los fallos, o subir el umbral para los éxitos.

### QA-C-12 — Bajo — Validación de usuarios
- `" qa_c_esp "` se crea (201), pero login hace `strip()` y busca `qa_c_esp`: **ese usuario nunca puede entrar** (401 con y sin espacios).
- `QA_C_AUTH` se crea aunque existe `qa_c_auth` (suplantación visual; además comparte el bloqueo de QA-C-07).
- `QA_C@EXAMPLE.COM` se acepta aunque existe `qa_c@example.com`.
- **Corrección:** `strip()` y unicidad sin distinguir mayúsculas (índice sobre `lower(username)` y `lower(email)`).

### QA-C-13 — Bajo — Más casos de `PUT /config`
- Clave desconocida `qa_c_clave_desconocida` → 200 y queda guardada; no hay forma de borrarla por API.
- Clave de 150 caracteres → 500 (`DataError`, columna `String(100)`).
- Cuerpo lista `["a","b"]` → 500 (`.items()`).
- `ticket_footer: null` → se guarda la cadena "None"; un objeto se guarda como `"{'a': 1}"`.
- **Corrección:** lista blanca de claves y esquema (ver QA-C-02). Exigir que el cuerpo sea un objeto.

### QA-C-14 — Bajo — Branding inconsistente con la pantalla de Configuración
- La pantalla guarda `company_address`, `company_phone` y `company_rfc` (`frontend/src/pages/settings/general-tab.tsx:24-28`). `/config/branding` lee `business_address||address`, `business_phone||phone` y `business_rfc||rfc` (`api/config.py:24-26`). Después de guardar los `company_*`, branding devuelve `business_address: ""`, `business_phone: ""` y `business_rfc: ""`; el nombre sí se actualiza. El ticket (`printer_service.py` `_company_info`) sí lee `company_*`.
- **Corrección:** que branding use el mismo orden de claves que `_company_info`.

### QA-C-15 — Bajo — Parámetros de reportes
- `top-products?limit=-1` → 200 con 2 de 3 productos (`items[:-1]`, `reports.py:403`). `limit=0` devolvería vacío.
- `from=0001-01-01&to=9999-12-31` → **500** en `/reports/sales` y `/reports/top-products` (desbordamiento en `local_day_bounds`, `timeutil.py:44-49`).
- `from` > `to` → 200 vacío, sin error.
- **Corrección:** acotar `limit` a 1..100, validar el rango de años y `from <= to` → 400.

### QA-C-16 — Bajo — Robustez y fuga de información en respaldos
- `DELETE /api/backup/..` → 500. `filename=".."` pasa `_resolve_backup_path` porque `dir/..` tiene `parent == dir`, y luego `unlink()` falla sobre un directorio. `POST /backup/../verify` → 500 con el mensaje de `pg_restore`, que incluye la ruta absoluta del directorio.
- `POST /backup/` devuelve `path` con la ruta absoluta del servidor.
- `/api/health` es público y expone el uso de disco y la hora del último respaldo; con el disco al 98.5 % reporta `status: ok`.
- **Corrección:** rechazar `..` y `.` en `_resolve_backup_path`, no reenviar stderr, quitar `path` y considerar un aviso de disco en health.

### QA-C-17 — Bajo — `change-password` sin freno
- 15 intentos con `current_password` incorrecta → 15×400, sin bloqueo. Quien tenga un token robado puede adivinar la contraseña actual. Además se acepta `new == current` (200; solo el frontend lo impide).

### QA-C-18 — Bajo — Filtro de auditoría inválido
- `GET /api/audit/?user_id=abc` → 200 con **todas** las filas (`type=int` lo convierte en `None`). Lo esperado es 400 o un resultado vacío. Las fechas inválidas sí dan 400.

### QA-C-19 — Bajo — Los `pre-restore` nunca se depuran
- `apply_retention` solo mira `backup_*.dump` (`backup_service.py:217`). La prueba real de la función (carpeta temporal, 121 archivos de 120 días) dejó 14 días diarios + 8 semanales, que es lo correcto. El `pre-restore` y los nombres sin fecha quedan siempre. Cada restauración agrega un dump completo y el disco ya está al 98.5 %.

---

## Lo que funcionó bien (✅)
- **Auth:**
  - Login correcto (200 con access y refresh), incorrecto 401, campos faltantes 400, usuario inexistente 401.
  - `me` 200; refresh 200; refresh con un access → 422; `me` con un refresh → 422.
  - Logout: el access y el refresh presentados quedan revocados (401 `token_revoked`). Otro access del mismo usuario, obtenido antes por refresh, sigue vivo hasta que vence (comportamiento JWT normal).
  - El bloqueo tras 10 fallos y el límite de IP funcionan (ver QA-C-07 y QA-C-11).
  - `change-password`: actual incorrecta 400, nueva < 8 → 400, faltan campos 400. El token viejo queda en 401 tras el cambio.
  - `must_change_password` bloquea `/products/`, `/sales/` y `/cash-register/active` con 403 `password_change_required` (también con un token obtenido por refresh). `/auth/me` responde 200 y, después del cambio, todo responde 200.
  - `token_version` invalida tokens y refresh al cambiar el rol (no cambia si se manda el mismo rol), al desactivar (login 401) y al restablecer la contraseña.
- **Usuarios:**
  - Duplicado de username o email, rol inexistente o 0, contraseña de 7 o 129 caracteres, username de 2, email inválido y rol de texto → 422 con mensajes en español.
  - Editar: email vacío pasa a null; username duplicado, rol inválido y contraseña corta → 422; usuario inexistente 404.
  - Desactivar y reactivar; el listado por defecto excluye inactivos y `include_inactive=true` los incluye.
  - Último admin: no se puede desactivar, quitar el rol ni restablecer la propia contraseña (400). Con 2 admins, nadie puede desactivarse a sí mismo (400).
  - `reset-password`: temporal de 14 caracteres distinta en cada llamada, `Cache-Control: no-store`. La temporal anterior deja de servir. No aparece en `GET /users/<id>` ni en la auditoría (`"password": "[RESET]"`). A un usuario inactivo → 400.
  - `roles` (admin 24, gerente 19, cajero 7 = `seed.py`) y `permissions` (24).
- **Matriz de permisos:** 91 combinaciones de ruta y método. Ningún endpoint sin protección ni con protección distinta a la esperada. Las únicas rutas públicas son login, `config/branding`, `backup/restore-status`, `health` y `print-agent/*` (este último exige `X-Agent-Key` → 401).
- **Reportes:**
  - Venta a las 23:30 local del 13-oct (05:30 UTC del 14) cae el 13-oct en `/reports/sales` y en `/sales/?date_from=`. Venta a las 23:59:59 del 12-oct cae el 12.
  - Totales cuadrados a mano antes de las devoluciones cruzadas: hoy 2 ventas / 282.00; 12–14 oct 4 ventas / 570.60 / 1 cancelada; métodos efectivo 282, tarjeta 150, transferencia 138.60.
  - top-products y gross-margin netos de devoluciones (P1 3/300/costo 180, P2 4/200/80, P3 1.5/19.48/12; resumen 519.48 / 272.00 / 247.48 / 47.64 %).
  - Valuación de inventario 8528.00 (97×60 + 96×20 + 98.5×8).
  - Dashboard: hoy, ayer, semana, mes y sesiones abiertas correctos.
  - Fecha inválida → 400.
- **Config:** branding público 200. `GET /`, `GET /<key>` y `PUT /` solo admin (gerente y cajero 403, sin token 401). Clave inexistente 404, cuerpo vacío o no-JSON 400. Los cambios quedan auditados (`update`, `config`, con valores previo y nuevo).
- **Auditoría:** quedan registrados login, login_failed, logout, change_password, crear/editar/desactivar/restablecer usuario, config, backup create/verify/download/delete/restore, open de caja, venta, cancelación, devolución y ajuste. Se revisaron 165 filas: **ninguna** contiene una contraseña conocida ni un JWT. Las únicas claves `password` son "[RESET]" o "[CHANGED]". Funcionan los filtros por acción, entidad, usuario, id y fecha, `per_page` con tope 100 y `page` fuera de rango vacío; fecha inválida → 400.
- **Respaldos:**
  - Crear 201, listar, verificar (257 entradas), descargar (bytes idénticos, `attachment`); eliminar un respaldo listado 200 y repetirlo 404.
  - Traversal bloqueado (`../`, `%2F`, `%5C`, rutas absolutas). Download y restore solo aceptan archivos listados.
  - Retención 14 diarios + 8 semanales correcta.
- **Restauración** (2 corridas, más 2 de carrera):
  - La confirmación exacta es obligatoria (sin cuerpo, vacía, otro archivo, minúsculas o espacio final → 400); gerente 403.
  - Durante el proceso: 503 con `maintenance: true`, `code: maintenance` y `Retry-After: 30`, también en login y en un segundo restore. `/api/health` 200 y `restore-status` 200 (`en_curso` → `ok`).
  - Los datos quedan como en el respaldo (el producto creado después desaparece; la contraseña vuelve a la anterior).
  - Los tokens de admin y cajero anteriores dan 401 (salvo QA-C-01). Se crea `pre-restore-<fecha>.dump`, que no aparece en la lista. Se audita `restore ok` y se libera la bandera.
- **`/api/health`:** 200 con `db: ok`; también responde en mantenimiento.

## Matriz de cobertura funcional

| Área | Camino feliz | Validaciones | Permisos | BD/Auditoría | Notas |
|---|---|---|---|---|---|
| Auth login/refresh/logout/me | ✅ | ⚠️ QA-C-10 | ✅ | ✅ | QA-C-11 |
| Rate limit / bloqueo | ✅ | — | — | ✅ login_failed | ❌ QA-C-07 |
| change-password / must_change | ⚠️ QA-C-03 | ⚠️ QA-C-10/17 | ✅ | ✅ | |
| token_version (rol/desactivar/reset) | ✅ | — | — | ✅ | |
| Usuarios CRUD | ✅ | ⚠️ QA-C-12 | ✅ | ✅ | |
| Último admin / auto-desactivación | ✅ | ✅ | ✅ | ✅ | carrera: no reproducida |
| reset-password | ✅ | ✅ | ✅ | ✅ sin secreto | |
| Matriz endpoint × rol (91) | — | — | ✅ | — | ver tabla |
| Reportes (sales/top/margin/valuación/dashboard) | ✅ | ⚠️ QA-C-15 | ✅ | — | ❌ QA-C-04 |
| Zona horaria America/Mexico_City | ✅ | — | — | — | |
| Config | ✅ | ❌ QA-C-02/13 | ✅ | ✅ | ⚠️ QA-C-14 |
| Auditoría | ✅ | ⚠️ QA-C-18 | ✅ admin | ✅ sin secretos | |
| Respaldos crear/listar/verificar/descargar/eliminar | ✅ | ❌ QA-C-05, ⚠️ QA-C-16 | ✅ | ✅ | QA-C-08 |
| Retención | ✅ | — | — | — | ⚠️ QA-C-19 |
| Restauración | ✅ | ✅ confirmación | ✅ | ✅ | ❌ QA-C-01, ⚠️ QA-C-06 |
| Mantenimiento 503 / health | ✅ | — | — | — | |
| Manejo de errores HTTP | ⚠️ | ❌ QA-C-09 | — | — | |

### Matriz endpoint × rol (código HTTP observado)

Método real de cada ruta, IDs inexistentes (999999 / `noexiste_qa.dump`) y cuerpo `{}`. ✅ significa que 401/403 coinciden con lo esperado según el decorador leído de la clausura de la vista (`require_permission` o `require_role`) y los permisos de `seed.py`. Cualquier código distinto de 401/403 indica que se pasó el control de acceso (404/422/400 son validaciones posteriores). `print-agent` usa `X-Agent-Key`, así que 401 para todos los roles JWT es lo correcto. n/p = no probado.

| Método | Ruta | Protección (código) | Sin token | Cajero | Gerente | Admin | Resultado |
|---|---|---|---|---|---|---|---|
| POST | `/api/auth/login` | público | 200 / 401 | 200 | 200 | 200 | ✅ (probado aparte, §Auth) |
| GET | `/api/auth/me` | jwt | 401 | 200 | 200 | 200 | ✅ |
| POST | `/api/auth/refresh` | jwt refresh | n/p | 200 | n/p | n/p | ✅ (probado aparte, §Auth) |
| POST | `/api/auth/logout` | jwt (cualquier tipo) | n/p | 200 | n/p | n/p | ✅ (probado aparte, §Auth) |
| POST | `/api/auth/change-password` | jwt | n/p | 200/400 | n/p | 200 | ✅ (probado aparte, §Auth) |
| GET | `/api/users/` | `usuarios:ver` | 401 | 403 | 200 | 200 | ✅ |
| GET | `/api/users/roles` | `usuarios:ver` | 401 | 403 | 200 | 200 | ✅ |
| GET | `/api/users/permissions` | `usuarios:ver` | 401 | 403 | 200 | 200 | ✅ |
| GET | `/api/users/<int:user_id>` | `usuarios:ver` | 401 | 403 | 404 | 404 | ✅ |
| POST | `/api/users/` | `usuarios:crear` | 401 | 403 | 403 | 422 | ✅ |
| PATCH | `/api/users/<int:user_id>` | `usuarios:editar` | 401 | 403 | 403 | 404 | ✅ |
| DELETE | `/api/users/<int:user_id>` | `usuarios:desactivar` | 401 | 403 | 403 | 404 | ✅ |
| POST | `/api/users/<int:user_id>/reset-password` | `usuarios:editar` | 401 | 403 | 403 | 404 | ✅ |
| GET | `/api/products/` | `productos:ver` | 401 | 200 | 200 | 200 | ✅ |
| GET | `/api/products/by-code/<path:code>` | `productos:ver` | 401 | 404 | 404 | 404 | ✅ |
| GET | `/api/products/pos-catalog` | `productos:ver` | 401 | 200 | 200 | 200 | ✅ |
| GET | `/api/products/units` | `productos:ver` | 401 | 200 | 200 | 200 | ✅ |
| POST | `/api/products/units` | `productos:crear` | 401 | 403 | 422 | 422 | ✅ |
| PATCH | `/api/products/units/<int:unit_id>` | `productos:editar` | 401 | 403 | 404 | 404 | ✅ |
| DELETE | `/api/products/units/<int:unit_id>` | `productos:desactivar` | 401 | 403 | 403 | 404 | ✅ |
| GET | `/api/products/<int:product_id>` | `productos:ver` | 401 | 404 | 404 | 404 | ✅ |
| POST | `/api/products/` | `productos:crear` | 401 | 403 | 422 | 422 | ✅ |
| PATCH | `/api/products/<int:product_id>` | `productos:editar` | 401 | 403 | 404 | 404 | ✅ |
| DELETE | `/api/products/<int:product_id>` | `productos:desactivar` | 401 | 403 | 403 | 404 | ✅ |
| POST | `/api/products/<int:product_id>/reactivate` | `productos:desactivar` | 401 | 403 | 403 | 404 | ✅ |
| GET | `/api/categories/` | `productos:ver` | 401 | 200 | 200 | 200 | ✅ |
| GET | `/api/categories/<int:category_id>` | `productos:ver` | 401 | 404 | 404 | 404 | ✅ |
| POST | `/api/categories/` | `productos:crear` | 401 | 403 | 422 | 422 | ✅ |
| PATCH | `/api/categories/<int:category_id>` | `productos:editar` | 401 | 403 | 404 | 404 | ✅ |
| DELETE | `/api/categories/<int:category_id>` | `productos:desactivar` | 401 | 403 | 403 | 404 | ✅ |
| GET | `/api/inventory/stock` | `inventario:ver` | 401 | 200 | 200 | 200 | ✅ |
| GET | `/api/inventory/stock/<int:product_id>` | `inventario:ver` | 401 | 404 | 404 | 404 | ✅ |
| GET | `/api/inventory/low-stock` | `inventario:ver` | 401 | 200 | 200 | 200 | ✅ |
| GET | `/api/inventory/adjust-reasons` | `inventario:ver` | 401 | 200 | 200 | 200 | ✅ |
| POST | `/api/inventory/adjust` | `inventario:ajustar` | 401 | 403 | 422 | 422 | ✅ |
| GET | `/api/inventory/movements/<int:product_id>` | `inventario:ver` | 401 | 200 | 200 | 200 | ✅ |
| POST | `/api/inventory/counts` | `inventario:ajustar` | 401 | 403 | 201 | 400 | ✅ |
| GET | `/api/inventory/counts` | `inventario:ver` | 401 | 200 | 200 | 200 | ✅ |
| GET | `/api/inventory/counts/<int:count_id>` | `inventario:ver` | 401 | 404 | 404 | 404 | ✅ |
| PATCH | `/api/inventory/counts/<int:count_id>/items/<int:product_id>` | `inventario:ajustar` | 401 | 403 | 422 | 422 | ✅ |
| POST | `/api/inventory/counts/<int:count_id>/close` | `inventario:ajustar` | 401 | 403 | 400 | 400 | ✅ |
| POST | `/api/inventory/counts/<int:count_id>/cancel` | `inventario:ajustar` | 401 | 403 | 400 | 400 | ✅ |
| POST | `/api/sales/quote` | `ventas:crear` | 401 | 422 | 403 | 422 | ✅ |
| POST | `/api/sales/` | `ventas:crear` | 401 | 422 | 403 | 422 | ✅ |
| POST | `/api/sales/<int:sale_id>/cancel` | `ventas:cancelar` | 401 | 403 | 422 | 422 | ✅ |
| POST | `/api/sales/<int:sale_id>/return` | `ventas:cancelar` | 401 | 403 | 422 | 422 | ✅ |
| GET | `/api/sales/` | `ventas:ver` | 401 | 200 | 200 | 200 | ✅ |
| GET | `/api/sales/cashiers` | `ventas:ver` | 401 | 200 | 200 | 200 | ✅ |
| GET | `/api/sales/<int:sale_id>` | `ventas:ver` | 401 | 404 | 404 | 404 | ✅ |
| GET | `/api/cash-register/` | `caja:ver` | 401 | 200 | 200 | 200 | ✅ |
| PATCH | `/api/cash-register/registers/<int:register_id>` | rol `admin` | 401 | 403 | 403 | 404 | ✅ |
| POST | `/api/cash-register/registers/<int:register_id>/agent-key` | rol `admin` | 401 | 403 | 403 | 404 | ✅ |
| POST | `/api/cash-register/open` | `caja:abrir` | 401 | 422 | 422 | 422 | ✅ |
| POST | `/api/cash-register/<int:session_id>/close` | `caja:cerrar` | 401 | 422 | 422 | 422 | ✅ |
| GET | `/api/cash-register/<int:session_id>/summary` | `caja:ver` | 401 | 404 | 404 | 404 | ✅ |
| GET | `/api/cash-register/sessions` | `caja:ver` | 401 | 200 | 200 | 200 | ✅ |
| GET | `/api/cash-register/active` | `caja:ver` | 401 | 200 | 200 | 200 | ✅ |
| GET | `/api/cash-register/<int:session_id>` | `caja:ver` | 401 | 404 | 404 | 404 | ✅ |
| POST | `/api/purchases/suppliers` | `compras:crear` | 401 | 403 | 422 | 422 | ✅ |
| GET | `/api/purchases/suppliers` | `compras:ver` | 401 | 403 | 200 | 200 | ✅ |
| GET | `/api/purchases/suppliers/<int:supplier_id>` | `compras:ver` | 401 | 403 | 404 | 404 | ✅ |
| PATCH | `/api/purchases/suppliers/<int:supplier_id>` | `compras:editar` | 401 | 403 | 404 | 404 | ✅ |
| DELETE | `/api/purchases/suppliers/<int:supplier_id>` | `compras:editar` | 401 | 403 | 404 | 404 | ✅ |
| POST | `/api/purchases/orders` | `compras:crear` | 401 | 403 | 422 | 422 | ✅ |
| GET | `/api/purchases/orders` | `compras:ver` | 401 | 403 | 200 | 200 | ✅ |
| GET | `/api/purchases/orders/<int:order_id>` | `compras:ver` | 401 | 403 | 404 | 404 | ✅ |
| POST | `/api/purchases/orders/<int:order_id>/send` | `compras:editar` | 401 | 403 | 400 | 400 | ✅ |
| POST | `/api/purchases/orders/<int:order_id>/cancel` | `compras:editar` | 401 | 403 | 400 | 400 | ✅ |
| POST | `/api/purchases/orders/<int:order_id>/receive` | `compras:recibir` | 401 | 403 | 422 | 422 | ✅ |
| GET | `/api/reports/dashboard` | `reportes:ver` | 401 | 403 | 200 | 200 | ✅ |
| GET | `/api/reports/sales` | `reportes:ver` | 401 | 403 | 200 | 200 | ✅ |
| GET | `/api/reports/inventory-valuation` | `reportes:ver` | 401 | 403 | 200 | 200 | ✅ |
| GET | `/api/reports/top-products` | `reportes:ver` | 401 | 403 | 200 | 200 | ✅ |
| GET | `/api/reports/gross-margin` | `reportes:ver` | 401 | 403 | 200 | 200 | ✅ |
| POST | `/api/printing/sales/<int:sale_id>/ticket` | `ventas:ver` | 401 | 404 | 404 | 404 | ✅ |
| POST | `/api/printing/products/<int:product_id>/label` | `productos:ver` | 401 | 404 | 404 | 404 | ✅ |
| GET | `/api/print-agent/jobs` | X-Agent-Key (sin JWT) | 401 | 401 | 401 | 401 | ✅ |
| POST | `/api/print-agent/jobs/<int:job_id>/result` | X-Agent-Key (sin JWT) | 401 | 401 | 401 | 401 | ✅ |
| GET | `/api/config/` | rol `admin` | 401 | 403 | 403 | 200 | ✅ |
| GET | `/api/config/branding` | público | 200 | 200 | 200 | 200 | ✅ |
| GET | `/api/config/<key>` | rol `admin` | 401 | 403 | 403 | 404 | ✅ |
| PUT | `/api/config/` | rol `admin` | 401 | 403 | 403 | 400 | ✅ |
| GET | `/api/audit/` | rol `admin` | 401 | 403 | 403 | 200 | ✅ |
| GET | `/api/backup/` | rol `admin` | 401 | 403 | 403 | 200 | ✅ |
| POST | `/api/backup/` | rol `admin` | 401 | 403 | 403 | 201 | ✅ |
| DELETE | `/api/backup/<filename>` | rol `admin` | 401 | 403 | 403 | 404 | ✅ |
| POST | `/api/backup/<filename>/verify` | rol `admin` | 401 | 403 | 403 | 404 | ✅ |
| GET | `/api/backup/<filename>/download` | rol `admin` | 401 | 403 | 403 | 404 | ✅ |
| GET | `/api/backup/restore-status` | público | 200 | 200 | 200 | 200 | ✅ |
| POST | `/api/backup/<filename>/restore` | rol `admin` | 401 | 403 | 403 | 400 | ✅ |
| GET | `/api/health` | público | 200 | 200 | 200 | 200 | ✅ |

## Sospechas no confirmadas
- **Carrera del "último admin":** dos admins se desactivan uno al otro al mismo tiempo (`user_service.py` cuenta los admins sin bloquear filas). En 3 intentos con hilos **no** se llegó a 0 admins (resultados 200/401, 401/200, 400/200). No se reporta como hallazgo; convendría un `SELECT ... FOR UPDATE` o una restricción.
- Pérdida de datos por salir de mantenimiento antes de tiempo con restauraciones concurrentes (ver QA-C-06).
- Corrupción de un respaldo escrito a la vez por dos `pg_dump` (QA-C-08): no se observó.

## Observación fuera de alcance
- `POST /api/inventory/counts` con cuerpo `{}` (gerente) → 201: crea un conteo general. Se canceló de inmediato (id 1). Puede ser intencional; queda para el agente de inventario.

## Datos que quedaron en `qa_api_c`
- **Usuarios:** admin, gerente y cajero (sembrados), más `qa_c_auth`, `qa_c_lock`, `qa_c_role`, `qa_c_mail1`, `qa_c_mail2` (email `QA_C@EXAMPLE.COM`), `QA_C_AUTH`, `" qa_c_esp "`, `qa_c_admin2` (admin, **inactivo**) y `qa_c_tv`. Todos activos salvo `qa_c_admin2`; ninguno con `must_change_password`. Las contraseñas están en `S\qac_testusers.json`. Las de admin, gerente y cajero no cambiaron (`S\qa_api_c.env`).
- **Productos:** QA-C-P1 (stock 98), QA-C-P2 (97) y QA-C-P3 (kg, 98.5).
- **Caja:** sesión 1 de `cajero` en "Caja 1", **abierta**, apertura 500.00.
- **Ventas 1–6:**
  - 1: devolución parcial (devolución 3 fechada el 11-oct por SQL).
  - 2: fechada 13-oct 23:30 local, devolución parcial con tarjeta.
  - 3: fechada 12-oct 23:59:59 local.
  - 4: cancelada.
  - 5: devolución parcial.
  - 6: total 0.00 con 100 % de descuento, de la prueba QA-C-02.
- **Conteo de inventario:** 1 (cancelado).
- **`system_config`:** valores originales restaurados, más `company_rfc=''` y la clave `qa_c_clave_desconocida='x'`.
- **Auditoría:** unas 165 filas.
- **Respaldos** (`S\backups_qa_api_c`): 9 `backup_pos_test_db_20261014_*.dump`, 6 `pre-restore-20261014_*.dump` y `.restore-status.json` (estado `ok`). Fuera de esa carpeta quedó `S\qa_c_fuera.txt` (señuelo para las pruebas de traversal).
- **Estado de la BD:** proviene de la última restauración (el respaldo de las 07:11:24). Lo creado después de ese respaldo por las propias pruebas de restauración se revirtió, como se esperaba.
- **Backend:** el del puerto 5103 quedó **apagado** y el puerto libre. No quedó bandera de mantenimiento.
