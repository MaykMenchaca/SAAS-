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
