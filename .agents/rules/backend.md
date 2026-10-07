---
trigger: glob
globs: backend/**/*.py
description: Convenciones del backend Flask del POS (servicios, transacciones, dinero, auditoría, tests)
---

# Reglas backend

- **Capas.** `api/` solo parsea y valida (schemas de Marshmallow), llama al servicio y serializa. La lógica de negocio va en `app/services/`. Los modelos están en `app/models/`.
- **Transacciones.**
  - Un servicio de escritura es atómico: un solo `db.session.commit()` al final. Ante un error, `db.session.rollback()` y se relanza la excepción.
  - Para filas que se leen y luego se modifican (stock, sesión de caja, venta, orden de compra), usa `with_for_update()`.
- **Auditoría.** `audit_service.log_action(...)` se llama **antes** del commit del servicio, dentro de la misma transacción. No llames a `log_action` después de un commit.
- **Dinero.**
  - Usa `Decimal(str(x))` y `.quantize(Decimal("0.01"), rounding=ROUND_HALF_EVEN)` por línea.
  - Nunca uses `float`.
  - El precio, el IVA y el cambio los calcula el servidor; los valores que manda el cliente se ignoran o se validan.
- **Permisos.** Todo endpoint nuevo lleva `@require_permission("modulo:accion")` o `@require_role`. Si agregas un permiso nuevo, agrégalo también en `seed.py` (PERMISSIONS y roles) y en `tests/conftest.py` (PERMISSION_CODES).
- **Errores.**
  - Las reglas de negocio lanzan `ValueError` o `ValidationError` con el mensaje en español, y la API responde 400 o 422.
  - Una fecha inválida responde 400, nunca 500.
- **Fechas.** Una vez que exista `APP_TIMEZONE` (fase 4.1), los límites del día se calculan en esa zona.
- **Migraciones.**
  - Todo cambio de esquema va por Alembic (`flask db migrate`). Revisa el archivo generado antes de aplicarlo.
  - El índice trigram `idx_products_name_trgm` debe estar declarado en el modelo.
- **Tests.**
  - Van en `backend/tests/test_<area>.py` y usan los fixtures de `conftest.py`.
  - Para verificar persistencia (por ejemplo la auditoría), consulta con una sesión nueva: `db.session.remove()` y luego la consulta.
  - Los productos de prueba se venden a `product.sale_price`.
