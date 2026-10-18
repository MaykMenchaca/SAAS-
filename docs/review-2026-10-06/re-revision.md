# Re-revisión final del plan (fases 0 a 6) · 2026-10-11

- **Rama revisada:** `fix/fase-6-claude` (HEAD `821429d`), en modo solo lectura.
- **Revisores:** `revisor-backend`, `revisor-frontend`, `revisor-seguridad` y `revisor-operacion`.
- **Pendientes:** `qa-funcional` y `revisor-visual`. Los dos necesitan una sesión iniciada en el navegador.
- **Pruebas automáticas antes de la revisión:** gate de la F6 aprobado, con 429 tests passed, build OK y Vitest en verde.
- **Pruebas después de las correcciones** (HEAD `3d9b88a`):
  - pytest: **443 passed** en el esquema aislado `lane_c` de `pos_test_db`;
  - Vitest: **25 passed**;
  - `tsc -b` y `vite build` OK.

## Veredicto

Cuando se hizo la revisión quedaban abiertos **2 Críticos y 5 Altos**. Ya están todos corregidos, con test. Seguridad no encontró Críticos ni Altos.

Lo que sigue abierto son hallazgos **Medios y Bajos**. Ninguno impide operar, pero hay que cuidar tres puntos antes de abrir la tienda:
- **Respaldos:**
  - no hay respaldo programado (OPS-30);
  - la carpeta de respaldos tiene permisos abiertos (SEC-101).
- **Servicio:**
  - corre como LocalSystem desde una carpeta que el usuario puede modificar (OPS-29, SEC-102, SEC-104).
- **Prueba con hardware:**
  - con impresora y cajón reales (OPS-28).

## Críticos y Altos corregidos

| ID | Sev. | Problema | Corrección | Commit |
|---|---|---|---|---|
| FE-100 / BE-100 | Crítico | Las devoluciones hechas desde la UI no enviaban `session_id` ni `refund_method`, así que el corte no descontaba el reembolso (H-08 seguía abierto de punta a punta). | La UI elige el método de reembolso (por defecto, el de la venta) y envía la caja activa. Si no llega sesión, el backend usa la caja abierta del usuario. Un reembolso en efectivo sin caja abierta se rechaza. | `8a03021` |
| OPS-25 | Crítico | `restore-backup.ps1` abortaba siempre por la sintaxis de `Join-Path` dentro de `@( )` (H-13 volvía a quedar abierto). | Paréntesis en los arreglos. Hay un test que ejecuta el bloque real en PowerShell. | `ab5108f` |
| OPS-26 | Alto | La instalación en limpio fallaba en las migraciones, porque `flask --app run` se ejecutaba fuera de `backend\`. | `Push-Location $backendDir` en `install-production.ps1` y `start.ps1`. | `ab5108f` |
| FE-101 | Alto | No había pantalla para el cambio obligatorio de contraseña, así que el admin inicial no podía operar. | Página `/cambiar-contrasena`, redirección desde `ProtectedRoute` y evento ante un 403 `password_change_required`. | `bd31b61` |
| FE-102 | Alto | Devoluciones solo encontraba ventas entre las últimas 20. | `GET /api/sales/?folio=&status=` y búsqueda en el servidor. | `7f8f45f` |
| FE-103 | Alto | Con cantidades fraccionarias el total tenía fracciones de centavo: "Exacto" se rechazaba y no se podía cobrar con tarjeta. | Cada línea se cuantiza a centavos con HALF_EVEN, en el backend y en el carrito. | `1a65567` |
| BE-103 | Alto | El conteo físico descontaba dos veces las ventas hechas antes de capturar cada producto. | `expected_quantity` se toma del stock bloqueado al momento de capturar. | `c1d2d82` |

## Medios corregidos

| ID | Problema | Corrección | Commit |
|---|---|---|---|
| OPS-27 | `install-service.ps1` fallaba con un error críptico si NSSM no estaba en el PATH. | Mismo arreglo de `Join-Path` que OPS-25. | `ab5108f` |
| BE-102 | Cerrar el conteo dos veces aplicaba el ajuste dos veces. | El conteo se bloquea con `with_for_update().populate_existing()` al capturar, cerrar y cancelar. | `c1d2d82` |
| SEC-100 | Se podían inyectar comandos ESC/POS desde el nombre del producto o la referencia de pago, lo que permitía abrir el cajón sin venta. | Se quitan los caracteres de control (C0 y C1) de todos los datos del ticket. | `59f5e1f` |
| SEC-103 | El refresh token (7 días) no se revocaba al cerrar sesión desde la UI. | `logoutRequest` envía `refresh_token`. | `3d9b88a` |
| FE-104 | En un pago dividido, la suma en flotantes dejaba deshabilitado "Completar cobro". | Los pagos se suman y comparan en centavos enteros (`sumPaymentsCents`). | `3d9b88a` |
| FE-105 | La cola offline marcaba como rechazadas permanentes las ventas que fallaban por autenticación. | Un 401, un 422 de JWT o un 403 `password_change_required`/`user_inactive` ya no rechazan la venta: se conserva y se reintenta. | `3d9b88a` |

## Pendientes · Medios

| ID | Problema | Corrección propuesta |
|---|---|---|
| BE-101 | Cancelar una venta de una sesión ya cerrada altera el corte histórico y no registra la salida de efectivo en la caja actual. | Bloquear la sesión de la venta y permitir la cancelación solo con la sesión abierta. Para sesiones cerradas, usar el flujo de devolución. |
| FE-106 | Las ventas con devolución aparecen como "Cancelada". | Agregar `devolucion_parcial` y `devolucion_total` al tipo, con su etiqueta y su tono. |
| FE-107 | Los botones de acción dentro de las páginas no respetan los permisos (el backend sí los aplica). | Envolver los botones con `useCan()` o `<RequirePermission fallback={null}>`. |
| OPS-28 | El agente rechaza trabajos válidos si la cola de Windows tiene cualquier trabajo (sin verificar con hardware). | Contar solo los trabajos en error, pausados o viejos. Probarlo con la impresora real. |
| OPS-29 / SEC-102 / SEC-104 | El backend y el agente corren como LocalSystem con código, `.env` o un Python que el usuario puede modificar. | Instalar en `Program Files` o aplicar ACL con `icacls`, usar una cuenta virtual de servicio y exigir Python "para todos los usuarios". |
| OPS-30 | No hay respaldo programado; solo al cerrar caja o a mano. | Tarea diaria con `schtasks` que corra `flask backup`, más un aviso en `/api/health` si el último respaldo tiene más de 24 h. |
| OPS-32 / BE-110 | Ni el CI ni los tests prueban las migraciones de Alembic, porque los tests usan `create_all`. | Un job que corra `flask db upgrade` sobre una base vacía, `alembic check` y un ciclo de downgrade y upgrade. |
| SEC-101 | Cualquier usuario local puede leer los respaldos en `C:\ProgramData\pos-vrntas\backups` y dejar archivos ahí. | Al crear la carpeta, `icacls /inheritance:r` con acceso solo para Administradores, SYSTEM y la cuenta del servicio. |
| FE-112 (Bajo/Medio) | La cantidad del carrito usa `step="1"` y el input controlado impide escribir decimales (sin verificar en el navegador). | Estado de texto local por línea, validación al perder el foco y `step` según `allows_fractions`. |

## Pendientes · Bajos

| ID | Problema |
|---|---|
| BE-104 | Los errores HTTP de Werkzeug (405, 400, 413) responden 500 con `error_id`. |
| BE-105 | Un reenvío concurrente con el mismo `client_uuid` puede abrir el cajón dos veces. |
| BE-106 | Varias devoluciones parciales pueden reembolsar centavos de más sobre la línea. |
| BE-107 | Cantidades de entrada sin límite de decimales en devoluciones y recepciones. |
| BE-108 | Cancelar o enviar una OC sin bloqueo compite con la recepción. |
| BE-109 | Sigue el fallback de `DATABASE_URL` con la contraseña pública (no es explotable si ya se rotó). |
| BE-111 | Código muerto: el decorador `audit_action`. |
| BE-112 | Los reportes recortan el neto a 0 y omiten los días que solo tienen reembolsos. |
| BE-113 | `lock_stock` y `move_stock` no usan `populate_existing()` (riesgo latente). |
| FE-108 | El escáner escribe 2 caracteres en el campo con foco y sigue activo durante el cobro. |
| FE-109 | Al crear, editar o desactivar productos solo se invalida `qk.products()`. |
| FE-110 / OPS-33 | Los listados paginados (corte, proveedores, stock bajo) se cortan en 100 sin aviso. |
| FE-111 | La versión del service worker y de Configuración es siempre "0.0.0". |
| FE-113 | Con el servidor colgado, el POS espera los timeouts aunque el ping ya dijo "sin servidor". |
| FE-114 | Formato de dinero inconsistente y lógica duplicada. |
| FE-115 | Hay otras formas de vaciar el carrito sin pedir confirmación. |
| SEC-105 | XSS almacenado en la impresión del corte, a través del nombre de la caja. |
| SEC-106 | Desde la LAN se puede bloquear el login de cualquier usuario, y los usuarios se pueden enumerar por el tiempo de respuesta. |
| SEC-107 | `/api/print-agent/*` no tiene límite de tasa, y la `X-Agent-Key` viaja en claro (residuo de H-45, sin TLS). |
| SEC-108 | `PGPASSWORD` se queda en la sesión de PowerShell del administrador. |
| SEC-109 | Un cajero puede ver el corte de cualquier sesión y mandar reimpresiones a otra caja. |
| SEC-110 | No hay cabeceras de seguridad (CSP, `X-Frame-Options`, `nosniff`, `Referrer-Policy`). |
| SEC-111 | Las acciones del CI no están fijadas por SHA y las dependencias transitivas de Python no tienen lock. |
| SEC-112 | Una venta offline rechazada se puede descartar sin dejar rastro en el servidor. |
| OPS-31 | El arranque rápido del README no funciona en una máquina limpia, porque falta `.env`. |
| OPS-34 | `DEPLOYMENT.md`, `README.md` y `.env.example` están desactualizados (por ejemplo, falta `POS_ADMIN_PASSWORD`). |
| OPS-35 | A `update-production` e `install-production` les faltan comprobaciones: privilegios y sondeo de `/api/health`. |
| OPS-36 | Los logs del servicio no rotan. |
| OPS-37 | El hook versionado es frágil fuera de Windows y entre worktrees. |

## Sin verificar

- **CI:** que corra en GitHub. Requiere hacer push.
- **Hardware:** impresión y cajón con equipo real (OPS-18, OPS-28).
- **Navegador:** QA funcional y visual, incluidos los flujos nuevos de devolución, cambio de contraseña y pago dividido.
- **Migraciones:** aplicarlas a `pos_db`: `a1b3c5d7e9f2`, `f2d5b8c9a0e1`, `b7c8d9e0f1a2` y `c9d0e1f2a3b4`.
  - Antes, comprobar de nuevo que no hay stock negativo, porque `c9d0e1f2a3b4` falla si lo hay.
  - `f2d5b8c9a0e1` borra categorías duplicadas y no se puede revertir.
  - Hacerlo con `update-production.ps1`, que respalda antes de migrar.
