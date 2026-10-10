# Re-revisión del Gate de Fase 4 (2026-10-10)

- **Revisor:** `revisor-operacion`, en modo solo lectura sobre la rama `fix/fase-4` (commit `e6c3d16`).
- **`qa-funcional`:** pendiente. Necesita una sesión iniciada en el navegador.
- **Pruebas automáticas:** `gate.ps1 -Fase 4` dio 324 tests en verde, el build OK y los chequeos de regresión 0.1–4.3 en verde.
- **Migraciones:** el revisor las encontró sin aplicar. Después de la revisión se aplicaron a `pos_db`, con el respaldo `backend/backups/pre-fase-4.dump`. Se aplicaron las 9 que faltaban, incluidas 5 de las fases 1–3, y luego se corrió `flask seed`.

## Estado de los hallazgos de la fase

| ID | Estado | Evidencia |
|---|---|---|
| H-21 | Cerrado. Queda un residuo menor: OPS-11 | `utils/timeutil.py`, `api/reports.py`, folios, respaldos y ticket en hora local. El filtro de `api/audit.py:41-46` sigue en UTC. |
| UI-04 | Cerrado | `lib/dates.ts`; `dashboard.tsx` y `reports.tsx` usan `localISODate`. |
| H-22 | **Abierto (parcial)** | Ya están resueltos `ESC t`, la transliteración, el corte `GS V`, los datos de la empresa, el timeout, el 503 y el cajón después del commit. **Falta:** la impresión está centralizada en el servidor (OPS-03) y `.env.example` no coincide con el código (OPS-05). La prueba física sigue pendiente. |
| H-24 | **Abierto (parcial)** | La cola ya es única, con backoff, rechazadas y `client_uuid`. **Falta:** la sesión y el carrito se borran durante una caída (OPS-01), no hay catálogo offline (OPS-02) y las rechazadas no se pueden recapturar (OPS-07). |
| H-26 | Cerrado | `product_service.create_product` y la migración `b5e3d2c1f0a9`. |
| H-28 | Cerrado | `schemas/user.py`, `utils/errors.py` y `c7a1e4b2d3f6`. |
| H-31 | Cerrado dentro del alcance del plan | `uq_cash_session_open` y `with_for_update` en venta, cierre y recepción. Relacionados: OPS-08 y OPS-09. |
| H-38 | Cerrado | `word_similarity > 0.4`. Relacionado: OPS-14. |
| H-43 | Cerrado dentro del alcance del plan | Reactivar e incluir inactivos. El inventario sin inactivos ya estaba anotado en `progreso.md`. |

## Hallazgos nuevos

| ID | Severidad | Título | Destino |
|---|---|---|---|
| OPS-01 | **Alto** | Una caída del servidor borra la sesión de caja y el carrito del POS (`pos.tsx:50-54`, `clearSession` ante `isError`) | Subfase 4.7 |
| OPS-02 | **Alto** | Sin servidor no se pueden agregar productos: no hay catálogo local y el escáner depende de la API | Subfase 4.8 |
| OPS-03 | **Alto** | La impresora y el cajón "por caja" solo funcionan si están conectados al servidor, porque la escritura ocurre en el servidor | ⚠️ Decisión del usuario sobre la topología de impresión |
| OPS-06 | **Alto** | El servicio de Windows (`install-service.ps1`) arranca `run.py` del servidor de desarrollo en 127.0.0.1, así que la LAN no lo alcanza (origen: F3) | Subfase 4.9 |
| OPS-04 | Medio | La validación de la ruta acepta `COM10+` sin `\\.\` y sobrescribe archivos normales | Subfase 4.10 |
| OPS-05 | Medio | `.env.example` no coincide con el código (`PRINTER_DEVICE_PATH`, `POS_HOST`, `BUSINESS_*`) y `APP_TIMEZONE` no se valida | Subfase 4.10 |
| OPS-07 | Medio | Las ventas offline rechazadas solo se pueden descartar, y el corte de caja no avisa de pendientes | Subfase 4.10 (aviso en el corte); la recaptura queda en Hallazgos nuevos |
| OPS-08 | Medio | Una devolución en efectivo que coincide con el cierre de caja descuadra el corte, porque `return_sale` no bloquea la sesión | Subfase 4.10 |
| OPS-13 | Medio | El procedimiento de actualización no hace respaldo ni revisa `$LASTEXITCODE` de `db upgrade` | Subfase 4.9 |
| OPS-09 | Bajo | Posible deadlock por bloquear el stock en orden arbitrario | Hallazgos nuevos |
| OPS-10 | Bajo | Un reenvío concurrente con el mismo `client_uuid` responde 500 (IntegrityError en el flush) | Hallazgos nuevos |
| OPS-11 | Bajo | El filtro de fechas de auditoría sigue en UTC | Subfase 4.10 |
| OPS-12 | Bajo | Un timeout de impresión deja hilos colgados y el cajón puede abrir tarde | Hallazgos nuevos (junto con OPS-03) |
| OPS-14 | Bajo | El escáner puede rechazar un código existente cuando es subcadena de otro | Subfase 4.8 (búsqueda exacta por código) |

Según el criterio del gate, los hallazgos Altos nuevos impiden aprobar la fase. Se abrieron las subfases 4.7 a 4.10 en `progreso.md`. OPS-03 queda pendiente de la decisión del usuario.
