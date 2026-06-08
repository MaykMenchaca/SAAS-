$ErrorActionPreference = "Stop"

$backendDir = Join-Path $PSScriptRoot "backend"
$envPath = Join-Path $backendDir ".env"
$envExample = Join-Path $backendDir ".env.example"

Write-Host "=== POS System - Instalacion Produccion Local ===" -ForegroundColor Cyan

if (-not (Test-Path -LiteralPath $envPath)) {
    Copy-Item -LiteralPath $envExample -Destination $envPath
    Add-Content -LiteralPath $envPath -Value "SERVE_FRONTEND=true"
    Write-Host "[OK] backend\.env creado desde .env.example" -ForegroundColor Green
} else {
    Write-Host "[OK] backend\.env ya existe" -ForegroundColor Green
}

& "$PSScriptRoot\build-production.ps1"

Write-Host "`n--- Configurando base de datos ---" -ForegroundColor Yellow
& "$PSScriptRoot\setup-db.ps1"

Write-Host "`n--- Aplicando migraciones ---" -ForegroundColor Yellow
& "$backendDir\venv\Scripts\python.exe" -m flask --app run db upgrade

Write-Host "`n--- Sembrando datos iniciales ---" -ForegroundColor Yellow
& "$backendDir\venv\Scripts\python.exe" -m flask --app run seed

Write-Host "`n[OK] Instalacion lista." -ForegroundColor Green
Write-Host "Arranque produccion: .\start-production.ps1" -ForegroundColor Cyan
