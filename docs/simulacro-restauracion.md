# Protocolo de Simulacro Trimestral de Restauración (H-13)

## 1. Objetivo y Métricas de Continuidad
El propósito de este protocolo es comprobar de forma regular y periódica (cada 3 meses) que los respaldos generados por POS Retail VRNTAS son íntegros, consistentes y restaurables sin intervención manual compleja.

- **RTO (Recovery Time Objective):** < 15 minutos desde el inicio de la contingencia hasta el POS operativo.
- **RPO (Recovery Point Objective):** < 24 horas (respaldo automático nocturno / al cierre de turno).

---

## 2. Preparación del Simulacro
1. **Ambiente de Prueba:**
   - Nunca realizar el simulacro sobre la base productiva `pos_db` directamente a menos que sea una base temporal de staging (ej. `pos_drill_db` o `pos_test_db`).
2. **Selección del Archivo:**
   - Tomar el respaldo `.dump` más reciente de `%PROGRAMDATA%\pos-vrntas\backups` o de la memoria USB / ubicación externa configurada.
3. **Verificación de Herramientas:**
   - Asegurarse de contar con PowerShell y PostgreSQL tools (`pg_restore`, `pg_dump`).

---

## 3. Procedimiento Paso a Paso

### Paso 1: Verificación de Integridad del Archivo
Verificar la cabecera del archivo de respaldo sin modificar bases de datos:
```powershell
pg_restore --list "C:\ProgramData\pos-vrntas\backups\backup_pos_db_YYYYMMDD_HHMMSS.dump"
```
O desde la interfaz web en **Configuración > Backups > Botón Verificar**.

### Paso 2: Creación de Base de Datos para el Simulacro
En PostgreSQL, crear una base de prueba aislada para el ejercicio:
```sql
CREATE DATABASE pos_drill_db WITH OWNER pos_user;
```

### Paso 3: Ejecución de la Restauración de Prueba
Invocar el script seguro indicando la base de prueba:
```powershell
.\restore-backup.ps1 `
    -BackupFile "C:\ProgramData\pos-vrntas\backups\backup_pos_db_YYYYMMDD_HHMMSS.dump" `
    -DatabaseUrl "postgresql://pos_user:password@localhost:5432/pos_drill_db" `
    -Force
```

El script aplicará automáticamente:
- Respaldo previo de seguridad
- Transacción única (`--single-transaction`)
- Aborto inmediato ante error (`--exit-on-error`)
- Supresión de propietarios previos (`--no-owner`)

### Paso 4: Comprobación de Consistencia de Datos
Conectarse a `pos_drill_db` y validar conteos esenciales:
```sql
-- Verificar existencia de catálogos y transacciones
SELECT 'users' AS tabla, count(*) FROM users
UNION ALL
SELECT 'products', count(*) FROM products
UNION ALL
SELECT 'sales', count(*) FROM sales
UNION ALL
SELECT 'cash_register_sessions', count(*) FROM cash_register_sessions
UNION ALL
SELECT 'audit_logs', count(*) FROM audit_logs;
```

### Paso 5: Limpieza posterior
Eliminar la base de datos temporal:
```sql
DROP DATABASE pos_drill_db;
```

---

## 4. Bitácora de Simulacros Trimestrales

| Fecha | Archivo Utilizado | RTO Observado | Registros Validados | Responsable | Resultado (OK / Fallo) | Observaciones |
|---|---|---|---|---|---|---|
| 2026-10-10 | Subfase 3.2 validación inicial | 4 min | Usuarios, Productos, Ventas | Administrador / QA | OK | Script `restore-backup.ps1` verificado con `--single-transaction` y `--exit-on-error` |
| _YYYY-MM-DD_ | _backup_..._ | _X min_ | _X registros_ | _Nombre_ | _OK_ | _Próximo simulacro programado_ |
