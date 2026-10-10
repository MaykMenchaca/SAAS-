param(
    [string]$ServiceName = "pos-backend",
    [string]$PgBinDir = $env:PG_BIN_DIR,
    [switch]$SkipBuild
)

# Actualización segura del POS (OPS-13):
# 1) compila, 2) detiene el servicio, 3) respalda la BD, 4) migra, 5) seed, 6) arranca.
# Si algo falla, se detiene y deja el servicio apagado con instrucciones para restaurar.

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$backendDir = Join-Path $root "backend"
$python = Join-Path $backendDir "venv\Scripts\python.exe"

function Fail([string]$message) {
    Write-Host "[ERROR] $message" -ForegroundColor Red
    exit 1
}

# Lee DATABASE_URL y PG_BIN_DIR de backend\.env sin mostrarlos
$databaseUrl = $env:DATABASE_URL
$envFile = Join-Path $backendDir ".env"
if (Test-Path -LiteralPath $envFile) {
    Get-Content $envFile | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
            $kv = $line.Split("=", 2)
            if ($kv[0].Trim() -eq "DATABASE_URL" -and -not $databaseUrl) { $databaseUrl = $kv[1].Trim() }
            if ($kv[0].Trim() -eq "PG_BIN_DIR" -and -not $PgBinDir) { $PgBinDir = $kv[1].Trim() }
        }
    }
}
if (-not $databaseUrl) { Fail "DATABASE_URL no está definido en backend\.env." }

function Get-PgDump {
    if ($PgBinDir -and (Test-Path -LiteralPath (Join-Path $PgBinDir "pg_dump.exe"))) {
        return Join-Path $PgBinDir "pg_dump.exe"
    }
    $progFiles = if ($env:ProgramFiles) { $env:ProgramFiles } else { "C:\Program Files" }
    $found = Get-ChildItem -Path (Join-Path $progFiles "PostgreSQL") -Directory -ErrorAction SilentlyContinue |
        Sort-Object -Property Name -Descending |
        ForEach-Object { Join-Path $_.FullName "bin\pg_dump.exe" } |
        Where-Object { Test-Path -LiteralPath $_ } |
        Select-Object -First 1
    if ($found) { return $found }
    Fail "No se encontró pg_dump.exe. Define PG_BIN_DIR en backend\.env."
}

Write-Host "=== Actualización del POS ===" -ForegroundColor Cyan

# 1. Compilar backend y frontend con el código nuevo
if (-not $SkipBuild) {
    & (Join-Path $root "build-production.ps1")
    if ($LASTEXITCODE -ne 0) { Fail "Falló build-production.ps1. El sistema sigue funcionando con la versión anterior." }
}

# 2. Detener el servicio para que nadie venda durante la migración
$service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($service -and $service.Status -eq "Running") {
    Write-Host "Deteniendo el servicio $ServiceName..." -ForegroundColor Yellow
    Stop-Service -Name $ServiceName
}

# 3. Respaldo previo con pg_dump
$backupDir = Join-Path $backendDir "backups"
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupFile = Join-Path $backupDir "pre-update_$stamp.dump"
Write-Host "Respaldando la base de datos en $backupFile..." -ForegroundColor Yellow
& (Get-PgDump) -Fc -f $backupFile $databaseUrl
if ($LASTEXITCODE -ne 0) { Fail "Falló pg_dump. No se migró nada; inicia el servicio con: Start-Service $ServiceName" }

# 4. Migraciones (transaccionales: si fallan, el esquema queda como estaba)
Push-Location $backendDir
& $python -m flask --app run db upgrade
if ($LASTEXITCODE -ne 0) {
    Pop-Location
    Fail ("Fallaron las migraciones. El servicio queda detenido. Corrige el problema indicado arriba " +
        "(por ejemplo, cajas con dos sesiones abiertas) o restaura con: .\restore-backup.ps1 -BackupFile `"$backupFile`"")
}

# 5. Seed idempotente (sincroniza permisos de roles)
& $python -m flask --app run seed
if ($LASTEXITCODE -ne 0) { Pop-Location; Fail "Falló el seed. El servicio queda detenido." }
Pop-Location

# 6. Arrancar de nuevo
if ($service) {
    Start-Service -Name $ServiceName
    Write-Host "[OK] Actualización terminada y servicio $ServiceName iniciado." -ForegroundColor Green
} else {
    Write-Host "[OK] Actualización terminada. Inicia el sistema con .\start-production.ps1" -ForegroundColor Green
}
Write-Host "Respaldo previo: $backupFile"
