$ErrorActionPreference = "Stop"

$backendDir = Join-Path $PSScriptRoot "backend"
$frontendDir = Join-Path $PSScriptRoot "frontend"

Write-Host "=== POS System - Build Produccion ===" -ForegroundColor Cyan

# 1. Validar versión de Python (mínimo 3.11)
$pyCheck = & python -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>$null
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($pyCheck) -or [version]$pyCheck -lt [version]"3.11") {
    Write-Host "[ERROR] Se requiere Python 3.11 o superior para ejecutar el backend. Detectado: '$pyCheck'" -ForegroundColor Red
    exit 1
}
Write-Host "[OK] Version de Python compatible detectada: $pyCheck" -ForegroundColor Green

Write-Host "`n--- Instalando dependencias backend ---" -ForegroundColor Yellow
if (-not (Test-Path -LiteralPath "$backendDir\venv\Scripts\python.exe")) {
    python -m venv "$backendDir\venv"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Fallo la creacion del entorno virtual en $backendDir\venv." -ForegroundColor Red
        exit 1
    }
}
& "$backendDir\venv\Scripts\python.exe" -m pip install --upgrade pip
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Fallo la actualizacion de pip." -ForegroundColor Red
    exit 1
}

& "$backendDir\venv\Scripts\python.exe" -m pip install -r "$backendDir\requirements.txt"
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Fallo la instalacion de dependencias de backend desde requirements.txt." -ForegroundColor Red
    exit 1
}

Write-Host "`n--- Instalando dependencias frontend ---" -ForegroundColor Yellow
Push-Location $frontendDir

if (Test-Path "package-lock.json") {
    npm ci
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[WARN] 'npm ci' fallo, reintentando con 'npm install'..." -ForegroundColor Yellow
        npm install
    }
} else {
    npm install
}

if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Fallo la instalacion de dependencias de frontend." -ForegroundColor Red
    Pop-Location
    exit 1
}

npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Fallo la compilacion del frontend (npm run build)." -ForegroundColor Red
    Pop-Location
    exit 1
}
Pop-Location

Write-Host "`n[OK] Build listo." -ForegroundColor Green
Write-Host "Frontend generado en: $frontendDir\dist" -ForegroundColor White
