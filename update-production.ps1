param(
    [string]$ServiceName = "pos-backend",
    [string]$PgBinDir = $env:PG_BIN_DIR,
    [switch]$SkipBuild
)

# Actualización segura del POS (OPS-13, OPS-24):
# 1) detiene el servicio, 2) respalda la BD, 3) compila, 4) migra, 5) seed, 6) arranca.
# Si algo falla, se detiene y deja el servicio apagado con instrucciones para restaurar.

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$backendDir = Join-Path $root "backend"
$python = Join-Path $backendDir "venv\Scripts\python.exe"

function Fail([string]$message) {
    Write-Host "[ERROR] $message" -ForegroundColor Red
    exit 1
}

# Lee DATABASE_URL, PG_BIN_DIR y BACKUP_DIR de backend\.env sin mostrarlos
$databaseUrl = $env:DATABASE_URL
$backupDir = $env:BACKUP_DIR
$envFile = Join-Path $backendDir ".env"
if (Test-Path -LiteralPath $envFile) {
    Get-Content $envFile | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
            $kv = $line.Split("=", 2)
            if ($kv[0].Trim() -eq "DATABASE_URL" -and -not $databaseUrl) { $databaseUrl = $kv[1].Trim() }
            if ($kv[0].Trim() -eq "PG_BIN_DIR" -and -not $PgBinDir) { $PgBinDir = $kv[1].Trim() }
            if ($kv[0].Trim() -eq "BACKUP_DIR" -and -not $backupDir) { $backupDir = $kv[1].Trim() }
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

# 1. Detener el servicio antes de tocar el venv o frontend\dist (OPS-24)
$service = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($service -and $service.Status -eq "Running") {
    Write-Host "Deteniendo el servicio $ServiceName..." -ForegroundColor Yellow
    Stop-Service -Name $ServiceName
}

# 2. Respaldo previo con pg_dump en BACKUP_DIR (misma carpeta y retención que los respaldos diarios)
if (-not $backupDir) { $backupDir = Join-Path $env:ProgramData "pos-vrntas\backups" }
New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
$stamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupFile = Join-Path $backupDir "backup_pre-update_$stamp.dump"
$uri = [System.Uri]$databaseUrl
$userInfo = $uri.UserInfo.Split(":", 2)
$dbName = $uri.AbsolutePath.TrimStart("/")
$pgPort = if ($uri.Port -gt 0) { $uri.Port } else { 5432 }
Write-Host "Respaldando la base de datos en $backupFile..." -ForegroundColor Yellow
# La contraseña viaja por PGPASSWORD, no en la línea de comandos (visible en la lista de procesos)
$env:PGPASSWORD = if ($userInfo.Length -gt 1) { [System.Uri]::UnescapeDataString($userInfo[1]) } else { "" }
& (Get-PgDump) -Fc -f $backupFile -h $uri.Host -p $pgPort -U ([System.Uri]::UnescapeDataString($userInfo[0])) $dbName
$dumpExit = $LASTEXITCODE
Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
if ($dumpExit -ne 0) { Fail "Falló pg_dump. No se cambió nada; inicia el servicio con: Start-Service $ServiceName" }

# 3. Compilar backend y frontend con el código nuevo
if (-not $SkipBuild) {
    & (Join-Path $root "build-production.ps1")
    if ($LASTEXITCODE -ne 0) {
        Fail ("Falló build-production.ps1. El servicio queda detenido; corrige el error y vuelve a ejecutar, " +
            "o arranca la versión anterior con: Start-Service $ServiceName")
    }
}

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
