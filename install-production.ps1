$ErrorActionPreference = "Stop"

$backendDir = Join-Path $PSScriptRoot "backend"
$envPath = Join-Path $backendDir ".env"
$envExample = Join-Path $backendDir ".env.example"

Write-Host "=== POS System - Instalacion Produccion Local ===" -ForegroundColor Cyan

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

& "$PSScriptRoot\build-production.ps1"

Write-Host "`n--- Configurando base de datos ---" -ForegroundColor Yellow
& "$PSScriptRoot\setup-db.ps1"

Write-Host "`n--- Aplicando migraciones ---" -ForegroundColor Yellow
& "$backendDir\venv\Scripts\python.exe" -m flask --app run db upgrade

Write-Host "`n--- Sembrando datos iniciales ---" -ForegroundColor Yellow
& "$backendDir\venv\Scripts\python.exe" -m flask --app run seed

Write-Host "`n[OK] Instalacion lista." -ForegroundColor Green
Write-Host "Arranque produccion: .\start-production.ps1" -ForegroundColor Cyan
