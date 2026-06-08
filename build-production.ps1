$ErrorActionPreference = "Stop"

$backendDir = Join-Path $PSScriptRoot "backend"
$frontendDir = Join-Path $PSScriptRoot "frontend"

Write-Host "=== POS System - Build Produccion ===" -ForegroundColor Cyan

Write-Host "`n--- Instalando dependencias backend ---" -ForegroundColor Yellow
if (-not (Test-Path -LiteralPath "$backendDir\venv\Scripts\python.exe")) {
    python -m venv "$backendDir\venv"
}
& "$backendDir\venv\Scripts\python.exe" -m pip install --upgrade pip
& "$backendDir\venv\Scripts\python.exe" -m pip install -r "$backendDir\requirements.txt"

Write-Host "`n--- Instalando dependencias frontend ---" -ForegroundColor Yellow
Push-Location $frontendDir
npm install
npm run build
Pop-Location

Write-Host "`n[OK] Build listo." -ForegroundColor Green
Write-Host "Frontend generado en: $frontendDir\dist" -ForegroundColor White
