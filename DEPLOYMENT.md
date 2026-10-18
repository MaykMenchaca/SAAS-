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

Después de traer cambios nuevos, en PowerShell como administrador:

```powershell
.\update-production.ps1
```

El script detiene el servicio `pos-backend`, respalda la base con `pg_dump` en `BACKUP_DIR` (`backup_pre-update_<fecha>.dump`), compila, aplica las migraciones, ejecuta el seed y vuelve a arrancar. Si un paso falla, se detiene, deja el servicio apagado e indica cómo restaurar con `restore-backup.ps1`. Una migración que falla no deja el esquema a medias (PostgreSQL las aplica en una transacción).

## Servicio de Windows

`install-service.ps1` (como administrador) registra el servicio `pos-backend` con NSSM; si ya existe (por ejemplo, instalado en una versión anterior con `run.py`), lo reconfigura, lo reinicia y verifica que responda en `/api/health`. El servicio ejecuta **waitress** en `0.0.0.0:5000` y sirve el frontend compilado, de modo que las cajas de la LAN entran en `http://<ip-servidor>:5000`. También abre el puerto en el firewall de Windows.

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

## Impresora USB en una caja (agente de impresión)

Si la impresora de tickets y el cajón están conectados por USB a una caja que **no** es el servidor:

1. En el servidor: **Configuración → Cajas**, elegir "USB en esta caja (agente de impresión)", guardar y pulsar **Generar clave del agente**. Copiar la clave (se muestra una sola vez).
2. En la caja: instalar Python 3.11+ y NSSM, copiar la carpeta `tools\print-agent` (a cualquier lugar; el script instala el agente en `C:\Program Files\POS Print Agent`, donde solo los administradores pueden escribir) y, en PowerShell como administrador:

```powershell
.\install-agent.ps1 -ServerUrl http://<ip-servidor>:5000 -PrinterName "<nombre de la impresora en Windows>"
```

El agente es un servicio de Windows (`pos-print-agent`) que cada segundo pide al servidor los tickets y pulsos de cajón de su caja y los envía en modo RAW a la impresora. No abre puertos en la caja. En Configuración → Cajas aparece "Agente conectado". Un pulso de cajón que no se entregó en 30 segundos se descarta (no abre el cajón tarde); un ticket caduca a los 10 minutos. El script pide la clave sin mostrarla y la guarda en `C:\ProgramData\POS Print Agent\agent.key`, legible solo por Administradores y SYSTEM. Antes de imprimir, el agente revisa que la impresora esté lista (encendida, con papel, sin trabajos atascados); si no, reporta el error y no deja el trabajo en la cola de Windows. Volver a ejecutar el script reconfigura y reinicia el servicio (por ejemplo, tras generar una clave nueva). Registro del agente: `C:\ProgramData\POS Print Agent\logs\agent.log`.

## Modo offline: alcance

Decisión de la fase 4.3: **no se configura HTTPS local**. Por eso:

- El navegador solo permite el service worker en `http://localhost`. En las cajas de la LAN (`http://<ip-servidor>:5000`) **no hay caché de la aplicación**: si se recarga la página sin servidor, no carga.
- Mientras la página siga abierta, una caída de red o del servidor no detiene la venta: se guarda en el equipo con la marca **PENDIENTE DE SINCRONIZAR**, se envía sola cuando el servidor vuelve a responder (ping a `/api/health` cada 30 s, con reintentos crecientes) y no se duplica, porque cada venta lleva su `client_uuid`.
- El POS guarda en el equipo una **copia del catálogo** (se refresca cada 10 minutos con servidor). Sin servidor, el lector de código y la búsqueda usan esa copia y avisan que los precios se confirman al sincronizar. La sesión de caja y el carrito no se pierden por una caída de red.
- El header muestra **"N ventas pendientes"**. Si el servidor rechaza una venta (por ejemplo, la caja ya se cerró o no hay stock), pasa a **"Rechazadas"**: no bloquea a las demás y se revisa o descarta desde ese mismo panel.
- Las ventas pendientes se guardan en el navegador de esa caja: **no borres los datos del navegador** mientras haya pendientes.
- Para tener caché real en las cajas haría falta HTTPS local con un certificado confiable en cada equipo; queda fuera de esta fase.

## Folios de venta y de compra

Los folios (`V-AAAAMMDD-NNNN`, `OC-AAAAMMDD-NNNN`) salen de secuencias de PostgreSQL. Son únicos y crecientes, pero **pueden tener huecos**: si una venta se rechaza después de pedir su número (por ejemplo, por stock insuficiente), ese número no se reutiliza. Es el comportamiento elegido en la fase 6.5 porque la facturación (CFDI) está fuera del alcance actual y numerar sin huecos obligaría a serializar todas las ventas de todas las cajas. Si en el futuro se requiere numeración consecutiva para fines fiscales, el folio debe asignarse al final de la venta con una tabla contador bloqueada (`with_for_update`).
