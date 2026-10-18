$ErrorActionPreference = "Stop"

$backendDir = Join-Path $PSScriptRoot "backend"
$frontendDist = Join-Path $PSScriptRoot "frontend\dist"

if (-not (Test-Path -LiteralPath "$backendDir\venv\Scripts\python.exe")) {
    Write-Host "[ERROR] No existe backend\venv. Ejecuta .\install-production.ps1 primero." -ForegroundColor Red
    exit 1
}

if (-not (Test-Path -LiteralPath "$frontendDist\index.html")) {
    Write-Host "[ERROR] No existe frontend\dist. Ejecuta .\build-production.ps1 primero." -ForegroundColor Red
    exit 1
}

$env:SERVE_FRONTEND = "true"
$env:FRONTEND_DIST = $frontendDist

Write-Host "=== POS System - Produccion Local ===" -ForegroundColor Cyan

Push-Location $backendDir

Write-Host "`n--- Aplicando migraciones ---" -ForegroundColor Yellow
& ".\venv\Scripts\python.exe" -m flask --app run db upgrade
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Fallaron las migraciones. No se inicia el servidor con un esquema incompleto." -ForegroundColor Red
    Write-Host "Revisa el mensaje anterior y restaura con .\restore-backup.ps1 si es necesario." -ForegroundColor Yellow
    Pop-Location
    exit 1
}

Write-Host "`n--- Verificando seed ---" -ForegroundColor Yellow
& ".\venv\Scripts\python.exe" -m flask --app run seed
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Fallo el seed. No se inicia el servidor." -ForegroundColor Red
    Pop-Location
    exit 1
}

Write-Host "`n--- Iniciando servidor ---" -ForegroundColor Yellow
if ($IsWindows -or $env:OS -eq "Windows_NT") {
    Write-Host "Servidor: Waitress (Windows)" -ForegroundColor White
    & ".\venv\Scripts\python.exe" -m waitress --listen=0.0.0.0:5000 run:app
} else {
    Write-Host "Servidor: Gunicorn" -ForegroundColor White
    & ".\venv\Scripts\python.exe" -m gunicorn -c gunicorn.conf.py run:app
}

Pop-Location
