$ErrorActionPreference = "Stop"

$backendDir = Join-Path $PSScriptRoot "backend"
$envPath = Join-Path $backendDir ".env"
$envExample = Join-Path $backendDir ".env.example"

Write-Host "=== POS System - Instalacion Produccion Local ===" -ForegroundColor Cyan

# 1. Validar entorno y secretos
if (-not (Test-Path -LiteralPath $envPath)) {
    Write-Host "Generando backend\.env con secretos criptograficos..." -ForegroundColor Yellow
    $pythonExe = Join-Path $backendDir "venv\Scripts\python.exe"
    if (Test-Path $pythonExe) {
        $secretKey = & $pythonExe -c "import secrets; print(secrets.token_urlsafe(64))"
        $jwtSecretKey = & $pythonExe -c "import secrets; print(secrets.token_urlsafe(64))"
    } else {
        $secretKey = [System.Guid]::NewGuid().ToString("N") + [System.Guid]::NewGuid().ToString("N")
        $jwtSecretKey = [System.Guid]::NewGuid().ToString("N") + [System.Guid]::NewGuid().ToString("N")
    }

    $content = Get-Content -LiteralPath $envExample -Raw
    $content = $content -replace "SECRET_KEY=.*", "SECRET_KEY=$secretKey"
    $content = $content -replace "JWT_SECRET_KEY=.*", "JWT_SECRET_KEY=$jwtSecretKey"
    Set-Content -LiteralPath $envPath -Value $content -NoNewline
    Add-Content -LiteralPath $envPath -Value "`nSERVE_FRONTEND=true"
    Write-Host "[OK] backend\.env creado desde .env.example con secretos unicos" -ForegroundColor Green
} else {
    Write-Host "[OK] backend\.env ya existe" -ForegroundColor Green
}

# 2. Build de producción
Write-Host "`n--- Ejecutando build de produccion ---" -ForegroundColor Yellow
& "$PSScriptRoot\build-production.ps1"
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Fallo el build de produccion." -ForegroundColor Red
    exit 1
}

# 3. Configuración de base de datos
Write-Host "`n--- Configurando base de datos ---" -ForegroundColor Yellow
& "$PSScriptRoot\setup-db.ps1"
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Fallo la configuracion de la base de datos." -ForegroundColor Red
    exit 1
}

# 4. Migraciones de base de datos
Write-Host "`n--- Aplicando migraciones ---" -ForegroundColor Yellow
& "$backendDir\venv\Scripts\python.exe" -m flask --app run db upgrade
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Fallo la aplicacion de migraciones (flask db upgrade)." -ForegroundColor Red
    exit 1
}

# 5. Sembrado de datos iniciales
Write-Host "`n--- Sembrando datos iniciales ---" -ForegroundColor Yellow
& "$backendDir\venv\Scripts\python.exe" -m flask --app run seed
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Fallo el sembrado de datos iniciales (flask seed)." -ForegroundColor Red
    exit 1
}

Write-Host "`n[OK] Instalacion lista y verificada." -ForegroundColor Green
Write-Host "Arranque produccion: .\start-production.ps1" -ForegroundColor Cyan
Write-Host "O para instalar como servicio de Windows: .\install-service.ps1 (como Administrador)" -ForegroundColor Yellow
