# POS System — Local Development Startup (SOLO DESARROLLO)
# Starts both backend (Flask) and frontend (Vite) servers
# Para uso en tienda o produccion ejecute start-production.ps1

Write-Host "=== POS System - SOLO DESARROLLO (Para produccion use start-production.ps1) ===" -ForegroundColor Yellow
Write-Host "Aviso: Este script es exclusivamente para desarrollo local.`n" -ForegroundColor Gray

# Check PostgreSQL is running
try {
    $pg = Get-Service -Name "postgresql*" -ErrorAction Stop
    if ($pg.Status -ne 'Running') {
        Write-Host "[!] PostgreSQL no esta corriendo. Inicialo primero." -ForegroundColor Red
        exit 1
    }
    Write-Host "[OK] PostgreSQL corriendo" -ForegroundColor Green
} catch {
    Write-Host "[!] No se detecto servicio PostgreSQL. Verifica que esta instalado." -ForegroundColor Yellow
}

$backendDir = Join-Path $PSScriptRoot "backend"
$frontendDir = Join-Path $PSScriptRoot "frontend"

# Run migrations and seed
Write-Host "`n--- Aplicando migraciones ---" -ForegroundColor Yellow
& "$backendDir\venv\Scripts\python.exe" -m flask --app run db upgrade 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "[OK] Migraciones aplicadas" -ForegroundColor Green
} else {
    Write-Host "[!] Error en migraciones" -ForegroundColor Red
}

Write-Host "`n--- Sembrando datos iniciales ---" -ForegroundColor Yellow
& "$backendDir\venv\Scripts\python.exe" -m flask --app run seed 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "[OK] Datos sembrados" -ForegroundColor Green
}

# Start backend in background
Write-Host "`n--- Iniciando Backend (Flask :5000) ---" -ForegroundColor Yellow
$backend = Start-Process -FilePath "$backendDir\venv\Scripts\python.exe" `
    -ArgumentList "run.py" `
    -WorkingDirectory $backendDir `
    -PassThru -NoNewWindow

# Start frontend in background
Write-Host "--- Iniciando Frontend (Vite :5173) ---" -ForegroundColor Yellow
$frontend = Start-Process -FilePath "npm" `
    -ArgumentList "run", "dev" `
    -WorkingDirectory $frontendDir `
    -PassThru -NoNewWindow

Write-Host "`n=== Sistema POS Listo ===" -ForegroundColor Green
Write-Host "  Backend:  http://localhost:5000" -ForegroundColor White
Write-Host "  Frontend: http://localhost:5173" -ForegroundColor White
Write-Host "  API Health: http://localhost:5000/api/health" -ForegroundColor White
Write-Host "`n  Login: admin (contrasena configurada en seed o instalador)" -ForegroundColor Cyan
Write-Host "`nPresiona Ctrl+C para detener ambos servidores...`n" -ForegroundColor Gray

try {
    # Wait for either process to exit
    while ($backend.HasExited -eq $false -and $frontend.HasExited -eq $false) {
        Start-Sleep -Seconds 1
    }
} finally {
    # Cleanup
    if (-not $backend.HasExited) { $backend.Kill() }
    if (-not $frontend.HasExited) { $frontend.Kill() }
    Write-Host "`nServidores detenidos." -ForegroundColor Yellow
}
