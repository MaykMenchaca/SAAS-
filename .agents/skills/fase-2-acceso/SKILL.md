---
name: fase-2-acceso
description: Ejecuta la Fase 2 (trazabilidad y control de acceso) del plan de corrección del POS. Auditoría que persiste y con cobertura completa, revocación de tokens, permisos en la UI, aislamiento entre sesiones de usuario y confirmaciones en acciones destructivas. Úsala desde el orquestador o cuando se pida la fase 2 o una subfase 2.x.
---

# Fase 2: Trazabilidad y control de acceso (H-09, H-17, H-18, H-19, H-39, H-40)

**Requisito:** gate de la Fase 1 aprobado.
**Carriles:**
- **A, backend:** 2.1, 2.2, el backend de 2.3 (branding y `editar_precio`) y el backend de 2.5.
- **B, frontend:** el frontend de 2.3, 2.4 y el frontend de 2.5. B puede empezar en paralelo con A.

## 2.1 Auditoría que persiste (H-09, H-39)
- **Archivos:** `backend/app/services/audit_service.py:50` y los que la llaman después del commit: `api/auth.py:20,28,56`, `api/sales.py:47,74`, `api/config.py:42`, `api/backup.py:27,48,70` y `utils/decorators.py:67`.
- **Test primero:** `test_audit_persiste_tras_request`. Hace login, una venta y cambia la configuración. Luego `db.session.remove()` y consulta `AuditLog` → ≥3 filas. **Hoy debe fallar.**
- **Cambio:**
  - Mover `log_action` **dentro** de los servicios, antes de su commit.
  - Para los eventos sin servicio (login fallido, logout): `log_action(..., commit=True)`.
  - En `decorators.audit_action`: registrar antes del commit del servicio, o con `commit=True`.
- **2.1.2 Cobertura.** Auditar devoluciones, ajustes y cierre de conteo, usuarios (crear, editar, rol, desactivar), apertura y cierre de caja, recepción de OC, proveedores, categorías y unidades.
  - `details` incluye `{antes, despues}` para precios, roles y configuración.
  - **Test** parametrizado por acción.
- **Corrige `tests/conftest.py`** para que el test client no comparta el app context. Si rompe otros tests, arréglalos (ver 6.1).

## 2.2 Revocación de tokens (H-17)
- **Migraciones:**
  - Tabla `token_blocklist(jti, expires_at)`.
  - Columna `users.token_version` (int, default 0).
- **`backend/app/__init__.py` o `extensions.py`:**
  - `@jwt.token_in_blocklist_loader`: el `jti` está en la blocklist, **o** `claims["tv"] != user.token_version`, **o** `not user.is_active`.
  - Usar un cache en memoria de 30 s por `user_id` para no consultar la BD en cada request.
- **`auth_service`:** agrega el claim `tv`. El logout inserta el `jti` del access y del refresh. Desactivar, cambiar el rol o la contraseña hace `token_version += 1`.
- **`config.py`:** access de 30 min. Refresh de 7 días (el interceptor de `frontend/src/api/client.ts` ya refresca).
- **Tests:** `test_token_revocado_tras_logout`, `test_token_invalido_tras_desactivar` y `test_token_invalido_tras_cambio_rol`.

## 2.3 Permisos en la interfaz (H-19)
- **Backend:**
  - `GET /api/config/branding`, público: nombre y logo.
  - `PATCH /products`: si el payload trae `sale_price`, `purchase_price` o `avg_cost`, exigir `productos:editar_precio`.
  - `avg_cost` pasa a ser `dump_only`.
  - **Test:** `test_editar_precio_requiere_permiso`.
- **Frontend:**
  - `src/lib/permissions.ts` con `can(perm)` a partir de `useAuthStore().user.permissions`.
  - Componente `<RequirePermission perm>` en `App.tsx` por ruta.
  - Filtrar `navSections` en `components/layout/app-shell.tsx`, los comandos en `command-palette.tsx` y las queries de `hooks/use-sidebar-badges.ts` (`enabled: can(...)`).
  - La ruta índice redirige a `/pos` si no hay `reportes:ver`.
  - React Query con `retry: (n, e) => ![401,403].includes(e?.response?.status) && n < 1`.

## 2.4 Aislamiento entre usuarios (H-18)
- `stores/auth-store.ts:clearSession`: `queryClient.clear()`, `usePosStore.getState().clearSession()` y limpiar `cart`.
- `pages/login.tsx`: no restaurar `state.from` si el usuario cambió.
- `pages/pos.tsx` al montar: `GET /cash-register/sessions/<id>`. Si no está abierta o no es del usuario → `clearSession()` y pantalla de "Abrir caja".
- `pages/cash-cut.tsx`: al cerrar la sesión activa del POS, limpiarla.
- La cola offline guarda `user_id`; solo sincroniza las ventas del usuario actual.
- **Verificación en el navegador:** admin abre /usuarios → logout → entra el cajero → no ve ningún dato.

## 2.5 Acciones destructivas (H-40)
- **Frontend:** `Modal` de confirmación (el patrón de `pages/products.tsx:384-392`) en:
  - Cancelar OC y desactivar proveedor (`purchases.tsx:271,927`).
  - Desactivar usuario (`users.tsx:205`).
  - "Cerrar Turno" (`cash-cut.tsx`).
  - "Reiniciar terminal" (`settings.tsx`).
  
  Agregar `onError → toast.error` en las mutaciones de `purchases.tsx:130-142`.
- **Backend:** `user_service.deactivate_user` rechaza al propio usuario y al último admin activo.
  - **Test:** `test_no_desactiva_ultimo_admin`.

## Cierre
Ejecuta `/gate-fase` con N=2.
