@echo off
title POS Retail VRNTAS - Inicio del Sistema
color 0B

echo ============================================================
echo               POS Retail VRNTAS - Inicio Local
echo ============================================================
echo.

:: 1. Verificar servicio PostgreSQL
echo [*] Verificando estado de PostgreSQL...
net start | findstr /i "postgresql" > nul
if %ERRORLEVEL% equ 0 (
    echo [OK] PostgreSQL esta corriendo.
) else (
    echo [!] ADVERTENCIA: No se detecto PostgreSQL corriendo.
    echo Intentando verificar servicio general...
    sc query type= service | findstr /i "postgresql" > nul
    if %ERRORLEVEL% equ 0 (
        echo [OK] Servicio PostgreSQL instalado. Asegurate de que esta iniciado.
    ) else (
        echo [!] CUIDADO: No se detecto el servicio de PostgreSQL.
        echo Asegurate de que tu base de datos esta en ejecucion en el puerto 5432.
    )
)
echo.

:: Configurar rutas absolutas
set SCRIPT_DIR=%~dp0
set BACKEND_DIR=%SCRIPT_DIR%backend
set FRONTEND_DIR=%SCRIPT_DIR%frontend

:: 2. Correr migraciones y semillero de base de datos
echo [*] Aplicando migraciones de base de datos...
cd /d "%BACKEND_DIR%"
call venv\Scripts\python.exe -m flask db upgrade
if %ERRORLEVEL% neq 0 (
    echo [!] Error al aplicar migraciones de base de datos.
    echo Revisa tu conexion a PostgreSQL en el archivo backend/.env
    pause
    exit /b 1
)
echo [OK] Migraciones de base de datos aplicadas.
echo.

echo [*] Sembrando datos iniciales (productos, roles)...
call venv\Scripts\python.exe -m flask seed
if %ERRORLEVEL% neq 0 (
    echo [!] Error al sembrar datos iniciales en la base de datos.
    pause
    exit /b 1
)
echo [OK] Datos iniciales sembrados con exito.
echo.

:: 3. Iniciar Flask Backend en una nueva ventana cmd
echo [*] Iniciando servidor Backend (Flask :5000)...
start "POS Backend Server" /d "%BACKEND_DIR%" cmd /k "venv\Scripts\python.exe run.py"

:: 4. Iniciar Vite Frontend en otra ventana cmd
echo [*] Iniciando servidor Frontend (Vite :3000)...
start "POS Frontend Server" /d "%FRONTEND_DIR%" cmd /k "npm run dev"

echo.
echo ============================================================
echo                 SISTEMA POS LISTO Y DETALLADO
echo ============================================================
echo   - Accede al Sistema:   http://localhost:3000
echo   - Estado de la API:    http://localhost:5000/api/health
echo.
echo   Login de Acceso:
echo   - Usuario: admin (usa la contrasena definida en la instalacion o seed)
echo.
echo   * Para apagar los servidores, cierra las dos ventanas CMD de
echo     consola ("POS Backend Server" y "POS Frontend Server")
echo ============================================================
echo.
pause
