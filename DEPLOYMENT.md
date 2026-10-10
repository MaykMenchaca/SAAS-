# Despliegue local del POS

## Instalacion inicial

1. Instalar PostgreSQL y Node.js.
2. Abrir PowerShell en la raiz del proyecto.
3. Ejecutar:

```powershell
.\install-production.ps1
```

El script crea `backend\.env` si no existe, instala dependencias, compila el frontend, crea la base de datos, aplica migraciones y ejecuta el seed.

## Arranque en produccion local

```powershell
.\start-production.ps1
```

En Windows usa Waitress y sirve la app completa en:

```text
http://localhost:5000
```

En Linux/PowerShell usa Gunicorn con `backend/gunicorn.conf.py`.

## Actualizacion

Despues de traer cambios nuevos:

```powershell
.\build-production.ps1
cd backend
.\venv\Scripts\python.exe -m flask --app run db upgrade
.\venv\Scripts\python.exe -m flask --app run seed
cd ..
.\start-production.ps1
```

## Backups y USB

Los backups se crean desde Configuracion > Backups o por API.

Para copiar tambien a USB, configurar en `backend\.env`:

```env
USB_BACKUP_DIR=E:\
```

Cuando esa ruta existe, cada backup se copia a:

```text
E:\pos-system-backups
```

## Restauracion

Antes de restaurar, detener el sistema si esta en uso. Luego ejecutar:

```powershell
.\restore-backup.ps1 -BackupFile .\backend\backups\backup_pos_db_YYYYMMDD_HHMMSS.sql
```

El script valida el archivo con `pg_restore --list` y pide escribir `RESTAURAR` antes de reemplazar objetos existentes.

Para automatizaciones controladas:

```powershell
.\restore-backup.ps1 -BackupFile .\backend\backups\backup_pos_db_YYYYMMDD_HHMMSS.sql -Force
```

## Impresora de tickets y cajón por caja

En **Configuración → Cajas**, el administrador indica para cada caja:

- **Impresora:** ruta absoluta del dispositivo o un puerto (`COM3`, `LPT1`). No se aceptan rutas de red (`\servidor\...`) ni relativas.
- **Página de códigos:** `cp850` (recomendada para español), `cp858`, `cp437` o `cp1252`. Debe coincidir con la configurada en la impresora; los caracteres que no existan se transliteran (por ejemplo `€` → `EUR`).

El cajón se abre automáticamente al completar una venta con pago en efectivo. Reimprimir un ticket (Historial de ventas → detalle → "Reimprimir ticket") no abre el cajón. Si la impresora no responde en 5 segundos, la venta se registra igual y el error queda en `logs/pos.log`.

## Modo offline: alcance

Decisión de la fase 4.3: **no se configura HTTPS local**. Por eso:

- El navegador solo permite el service worker en `http://localhost`. En las cajas de la LAN (`http://<ip-servidor>:5000`) **no hay caché de la aplicación**: si se recarga la página sin servidor, no carga.
- Mientras la página siga abierta, una caída de red o del servidor no detiene la venta: se guarda en el equipo con la marca **PENDIENTE DE SINCRONIZAR**, se envía sola cuando el servidor vuelve a responder (ping a `/api/health` cada 30 s, con reintentos crecientes) y no se duplica, porque cada venta lleva su `client_uuid`.
- El POS guarda en el equipo una **copia del catálogo** (se refresca cada 10 minutos con servidor). Sin servidor, el lector de código y la búsqueda usan esa copia y avisan que los precios se confirman al sincronizar. La sesión de caja y el carrito no se pierden por una caída de red.
- El header muestra **"N ventas pendientes"**. Si el servidor rechaza una venta (por ejemplo, la caja ya se cerró o no hay stock), pasa a **"Rechazadas"**: no bloquea a las demás y se revisa o descarta desde ese mismo panel.
- Las ventas pendientes se guardan en el navegador de esa caja: **no borres los datos del navegador** mientras haya pendientes.
- Para tener caché real en las cajas haría falta HTTPS local con un certificado confiable en cada equipo; queda fuera de esta fase.
