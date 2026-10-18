# POS System — Database Setup
# Creates the PostgreSQL databases and user for the POS system
# Run this ONCE before first start

$ErrorActionPreference = "Stop"

Write-Host "=== POS System - Configuracion de Base de Datos ===" -ForegroundColor Cyan
Write-Host "Este script crea el usuario y las bases de datos necesarias.`n" -ForegroundColor Gray

# Localizar psql.exe
$psqlPath = $null
if ($env:PG_BIN -and (Test-Path (Join-Path $env:PG_BIN "psql.exe"))) {
    $psqlPath = Join-Path $env:PG_BIN "psql.exe"
} else {
    $found = Get-ChildItem "C:\Program Files\PostgreSQL\*\bin\psql.exe" -ErrorAction SilentlyContinue | Select-Object -Last 1
    if ($found) {
        $psqlPath = $found.FullName
    } elseif (Get-Command psql.exe -ErrorAction SilentlyContinue) {
        $psqlPath = "psql.exe"
    }
}

if (-not $psqlPath) {
    Write-Error "No se encontro psql.exe en C:\Program Files\PostgreSQL\*\bin ni en PATH. Configura la variable PG_BIN."
    exit 1
}

$pgUser = "pos_user"
$backendDir = Join-Path $PSScriptRoot "backend"
$envPath = Join-Path $backendDir ".env"

# Generar contrasena segura para pos_user
$pythonExe = Join-Path $backendDir "venv\Scripts\python.exe"
if (Test-Path $pythonExe) {
    $pgPass = & $pythonExe -c "import secrets; print(secrets.token_urlsafe(24))"
} else {
    $pgPass = -join ((65..90) + (97..122) + (48..57) | Get-Random -Count 24 | ForEach-Object { [char]$_ })
}

# Actualizar o insertar DATABASE_URL en backend\.env si existe
if (Test-Path $envPath) {
    $envContent = Get-Content -LiteralPath $envPath -Raw
    if ($envContent -match "DATABASE_URL=") {
        $envContent = $envContent -replace "DATABASE_URL=postgresql://[^@]+@([^/]+)/([^`r`n]+)", "DATABASE_URL=postgresql://${pgUser}:${pgPass}@`$1/`$2"
        Set-Content -LiteralPath $envPath -Value $envContent -NoNewline
    } else {
        Add-Content -LiteralPath $envPath -Value "`nDATABASE_URL=postgresql://${pgUser}:${pgPass}@localhost:5432/pos_db"
    }
    Write-Host "[OK] Contrasena de BD actualizada en backend\.env" -ForegroundColor Green
}

$pgDbMain = "pos_db"
$pgDbTest = "pos_test_db"

Write-Host "Creando/actualizando usuario '$pgUser'..." -ForegroundColor Yellow
& $psqlPath -U postgres -c "DO `$do`$ BEGIN IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = '$pgUser') THEN CREATE ROLE $pgUser LOGIN PASSWORD '$pgPass'; ELSE ALTER ROLE $pgUser WITH PASSWORD '$pgPass'; END IF; END `$do`$;"
if ($LASTEXITCODE -ne 0) {
    Write-Error "Fallo al crear o configurar el usuario $pgUser"
    exit $LASTEXITCODE
}

& $psqlPath -U postgres -c "ALTER USER $pgUser CREATEDB;"
if ($LASTEXITCODE -ne 0) {
    Write-Error "Fallo al otorgar permisos CREATEDB a $pgUser"
    exit $LASTEXITCODE
}

Write-Host "Creando base de datos '$pgDbMain'..." -ForegroundColor Yellow
& $psqlPath -U postgres -c "SELECT 'CREATE DATABASE $pgDbMain OWNER $pgUser' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$pgDbMain')\gexec"
if ($LASTEXITCODE -ne 0) {
    Write-Error "Fallo al verificar/crear la base de datos $pgDbMain"
    exit $LASTEXITCODE
}

Write-Host "Creando base de datos de pruebas '$pgDbTest'..." -ForegroundColor Yellow
& $psqlPath -U postgres -c "SELECT 'CREATE DATABASE $pgDbTest OWNER $pgUser' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$pgDbTest')\gexec"
if ($LASTEXITCODE -ne 0) {
    Write-Error "Fallo al verificar/crear la base de datos $pgDbTest"
    exit $LASTEXITCODE
}

Write-Host "`n[OK] Base de datos configurada exitosamente." -ForegroundColor Green
Write-Host "  Usuario: $pgUser" -ForegroundColor White
Write-Host "  BD Principal: $pgDbMain" -ForegroundColor White
Write-Host "  BD Pruebas: $pgDbTest" -ForegroundColor White
Write-Host "`nSiguiente paso: ejecuta .\start.ps1`n" -ForegroundColor Cyan
