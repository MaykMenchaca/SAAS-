# Progreso del rediseño Industry

**Estado:** `[ ]` pendiente · `[~]` en curso · `[x]` hecha · `[!]` bloqueada
**Formato al cerrar:** `[x] N.M Título · commit <hash> · verificación · notas`
**Rama:** `feat/rediseno-industry` (worktree `../pos-rediseno`)

## Fase 0: Preparación
- [x] 0.1 Rama y worktree, paquete de diseño en `docs/rediseno-2026-10/diseno/`, guía `ui-ux-pro-max` copiada
- [x] 0.2 Línea base verde · pytest **446 passed** (6 min 29 s, esquema `lane_d`), Vitest **29 passed**, build OK (chunk mayor 455.7 kB / 141.9 kB gzip)
- [x] 0.3 Entorno de revisión · esquema `shots` en `pos_test_db` (no toca `pos_db`), con migraciones al día y datos del diseño: 17 productos, 6 categorías, turno abierto, 5 ventas (efectivo, mixta y tarjeta), 1 devolución, 1 proveedor y 1 OC. Usuarios `admin` (24 permisos), `lmendez` gerente (19) y `jperez` cajero (7), con contraseñas solo en el `shots.env` del scratchpad. Servidores: backend :5000 (esquema `shots`) y frontend :3000 desde `pos-rediseno`
- [x] 0.4 `equivalencias.md` · estrategia de tokens nuevos + alias viejos (se borran en 8.3), mapa de componentes, shell y pantallas, y lista de lo que no se toca
- [x] **Gate 0** · APROBADO (2026-10-12): línea base verde, entorno de revisión con 3 roles verificados por API y equivalencias escritas

## Fase 1: Fundaciones
- [ ] 1.1 Tokens Industry en claro y oscuro (acento 700)
- [ ] 1.2 Barlow / Barlow Condensed locales + escala tipográfica
- [ ] 1.3 Lucide con trazo 1.5
- [ ] 1.4 Primitivas `.blueprint`/`<Corners/>`, foco, selección
- [ ] 1.5 Script de contraste + verificación
- [ ] **Gate 1**

## Fase 2: Componentes base
- [ ] 2.1 Button
- [ ] 2.2 Input, Select, Field, Toggle, Segmented
- [ ] 2.3 Tag/Badge + Kbd
- [ ] 2.4 Panel blueprint (Card)
- [ ] 2.5 Table
- [ ] 2.6 Modal/Dialog
- [ ] 2.7 Toast, Empty, Error, Skeleton, Pagination, Avatar, Tooltip
- [ ] 2.8 Catálogo `/_ui` (solo desarrollo)
- [ ] **Gate 2**

## Fase 3: Shell
- [ ] 3.1 Sidebar expandido
- [ ] 3.2 Tarjeta de turno + usuario
- [ ] 3.3 Sidebar colapsado (automático en el POS)
- [ ] 3.4 Header
- [ ] 3.5 Paleta Ctrl K
- [ ] 3.6 Móvil y tablet
- [ ] 3.7 Verificación por rol, tema y viewport
- [ ] **Gate 3**

## Fase 4: Punto de venta ⚠️
- [ ] 4.1 Sin sesión: unirse o abrir caja
- [ ] 4.2 Búsqueda y escaneo + feedback
- [ ] 4.3 Categorías
- [ ] 4.4 Cuadrícula de productos
- [ ] 4.5 Ticket lateral (fracciones y descuento con permiso)
- [ ] 4.6 Totales del quote + métodos + Cobrar
- [ ] 4.7 Modal de cobro: teclado y pagos divididos
- [ ] 4.8 Venta completada + F8
- [ ] 4.9 Offline, sincronización y rechazadas
- [ ] 4.10 Barra de atajos
- [ ] 4.11 Verificación de dinero (vitest, Playwright, navegador)
- [ ] **Gate 4**

## Fase 5: Pantallas operativas
- [ ] 5.1 Login (+ cambio de contraseña y 404)
- [ ] 5.2 Dashboard
- [ ] 5.3 Corte de caja
- [ ] 5.4 Devoluciones (+ backend `restock`)
- [ ] 5.5 Historial de ventas (+ CSV, filtro por cajero)
- [ ] **Gate 5**

## Fase 6: Catálogo e inventario
- [ ] 6.1 Productos
- [ ] 6.2 Inventario (+ backend motivo de ajuste)
- [ ] 6.3 Conteo físico
- [ ] 6.4 Compras
- [ ] **Gate 6**

## Fase 7: Administración
- [ ] 7.1 Usuarios (+ restablecer contraseña, matriz de permisos)
- [ ] 7.2 Reportes (+ CSV)
- [ ] 7.3 Configuración (+ descargar respaldo)
- [ ] 7.4.1 Restaurar: endpoint con confirmación
- [ ] 7.4.2 Restaurar: protocolo (respaldo previo, mantenimiento, reversión)
- [ ] 7.4.3 Restaurar: UI en dos pasos
- [ ] 7.4.4 Restaurar: tests
- [ ] 7.4.5 Restaurar: documentación
- [ ] **Gate 7**

## Fase 8: Cierre
- [ ] 8.1 QA visual (`revisor-visual`)
- [ ] 8.2 QA funcional (`qa-funcional` + Playwright)
- [ ] 8.3 Limpieza de tokens viejos + MASTER.md + README
- [ ] 8.4 Push, CI y PR (tras fusionar `fix/fase-6-claude` en `main`)
- [ ] **Gate 8**

## Decisiones
| Fecha | Tema | Decisión |
|---|---|---|
| 2026-10-12 | Contraste | Acento 700 (#416180) en rellenos y textos de acento |
| 2026-10-12 | Respaldos en Configuración | Descargar **y** Restaurar desde la web (protocolo 7.4) |
| 2026-10-12 | Skill ui-ux-pro-max | Solo la guía SKILL.md, sin scripts |
| 2026-10-12 | Ejecutor | Claude (esta sesión) |

## Hallazgos nuevos
