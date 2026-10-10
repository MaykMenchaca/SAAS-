param(
    [Parameter(Mandatory = $true)]
    [string]$BackupFile,

    [string]$DatabaseUrl = $env:DATABASE_URL,

    [string]$PgBinDir = $env:PG_BIN_DIR,

    [switch]$Force,

    [switch]$SkipServiceCheck,

    [switch]$SkipPreBackup
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $BackupFile -PathType Leaf)) {
    Write-Host "[ERROR] Archivo de backup no encontrado: $BackupFile" -ForegroundColor Red
    exit 1
}

# 1. Cargar variables de entorno desde .env si no están presentes
$envFilePaths = @(
    Join-Path $PSScriptRoot "backend\.env",
    Join-Path $PSScriptRoot ".env"
)

foreach ($envPath in $envFilePaths) {
    if (Test-Path -LiteralPath $envPath -PathType Leaf) {
        Get-Content $envPath | ForEach-Object {
            $line = $_.Trim()
            if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
                $kv = $line.Split("=", 2)
                $key = $kv[0].Trim()
                $val = $kv[1].Trim()
                if ($key -eq "DATABASE_URL" -and [string]::IsNullOrWhiteSpace($DatabaseUrl)) {
                    $DatabaseUrl = $val
                }
                if ($key -eq "PG_BIN_DIR" -and [string]::IsNullOrWhiteSpace($PgBinDir)) {
                    $PgBinDir = $val
                }
            }
        }
        break
    }
}

if ([string]::IsNullOrWhiteSpace($DatabaseUrl)) {
    $DatabaseUrl = "postgresql://pos_user:pos_pass@localhost:5432/pos_db"
}

# 2. Localizar binarios de PostgreSQL (pg_restore y pg_dump)
function Get-PgExecutable([string]$name, [string]$binDir) {
    if ($binDir -and (Test-Path -LiteralPath $binDir)) {
        $candidate = Join-Path $binDir "$name.exe"
        if (Test-Path -LiteralPath $candidate) {
            return $candidate
        }
    }

    # Autodetección en C:\Program Files\PostgreSQL\*\bin
    $progFiles = if ($env:ProgramFiles) { $env:ProgramFiles } else { "C:\Program Files" }
    $autodetectDirs = Get-ChildItem -Path (Join-Path $progFiles "PostgreSQL") -Directory -ErrorAction SilentlyContinue |
        Sort-Object -Property Name -Descending
    foreach ($dir in $autodetectDirs) {
        $candidate = Join-Path $dir.FullName (Join-Path "bin" "$name.exe")
        if (Test-Path -LiteralPath $candidate) {
            return $candidate
        }
    }

    return $name
}

$pgRestoreCmd = Get-PgExecutable -name "pg_restore" -binDir $PgBinDir
$pgDumpCmd = Get-PgExecutable -name "pg_dump" -binDir $PgBinDir

# 3. Parsear DATABASE_URL
try {
    $uri = [Uri]$DatabaseUrl
} catch {
    Write-Host "[ERROR] DATABASE_URL invalido: $DatabaseUrl" -ForegroundColor Red
    exit 1
}

$userInfo = $uri.UserInfo.Split(":", 2)
$pgUser = if ($userInfo[0]) { [Uri]::UnescapeDataString($userInfo[0]) } else { "pos_user" }
$pgPass = if ($userInfo.Length -gt 1) { [Uri]::UnescapeDataString($userInfo[1]) } else { "" }
$pgHost = if ($uri.Host) { $uri.Host } else { "localhost" }
$pgPort = if ($uri.Port -gt 0) { $uri.Port } else { 5432 }
$pgDb = $uri.AbsolutePath.TrimStart("/")

if ([string]::IsNullOrWhiteSpace($pgDb)) {
    Write-Host "[ERROR] No se pudo detectar el nombre de la base de datos en DATABASE_URL." -ForegroundColor Red
    exit 1
}

if ($pgPass) {
    $env:PGPASSWORD = $pgPass
}

# 4. Verificar estado del servicio backend de Windows
if (-not $SkipServiceCheck) {
    $services = Get-Service -Name "pos-backend", "pos-vrntas" -ErrorAction SilentlyContinue
    foreach ($svc in $services) {
        if ($svc.Status -eq "Running") {
            Write-Host "`n[ALERTA] El servicio de backend '$($svc.Name)' esta en ejecucion." -ForegroundColor Yellow
            Write-Host "Se recomienda detener el servicio para evitar conexiones y modificaciones concurrentes."
            if (-not $Force) {
                $stopSvc = Read-Host "Deseas detener el servicio $($svc.Name) ahora? (S/N)"
                if ($stopSvc -eq "S" -or $stopSvc -eq "s") {
                    Stop-Service $svc.Name
                    Write-Host "[OK] Servicio $($svc.Name) detenido." -ForegroundColor Green
                } else {
                    Write-Host "[ERROR] Restaura cancelada. Deten el servicio antes de restaurar o usa -SkipServiceCheck." -ForegroundColor Red
                    exit 1
                }
            }
        }
    }
}

# 5. Verificar legibilidad del archivo con pg_restore
Write-Host "`n=== Verificando archivo de backup ===" -ForegroundColor Cyan
& $pgRestoreCmd --list $BackupFile *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] pg_restore no pudo leer o verificar el archivo de backup." -ForegroundColor Red
    exit 1
}
Write-Host "[OK] Archivo de backup verificado y legible." -ForegroundColor Green

# 6. Respaldo previo de seguridad
if (-not $SkipPreBackup) {
    $timestamp = (Get-Date).ToString("yyyyMMdd_HHmmss")
    $parentDir = Split-Path -Path $BackupFile -Parent
    if (-not $parentDir) { $parentDir = "." }
    $preBackupFile = Join-Path $parentDir "pre_restore_backup_${pgDb}_${timestamp}.dump"

    Write-Host "`n=== Generando respaldo previo de seguridad: $preBackupFile ===" -ForegroundColor Cyan
    & $pgDumpCmd `
        -h $pgHost `
        -p $pgPort `
        -U $pgUser `
        -F c `
        -f $preBackupFile `
        $pgDb

    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Fallo la creacion del respaldo previo de seguridad. Abortando para proteger datos." -ForegroundColor Red
        exit 1
    }
    Write-Host "[OK] Respaldo previo de seguridad generado exitosamente." -ForegroundColor Green
}

# 7. Confirmación del operador
Write-Host "`nDestino de la restauracion:" -ForegroundColor Yellow
Write-Host "  Host:    $pgHost"
Write-Host "  Puerto:  $pgPort"
Write-Host "  Base:    $pgDb"
Write-Host "  Usuario: $pgUser"

if (-not $Force) {
    Write-Host "`n[ATENCION] Esta operacion reemplazara los datos actuales de la base de datos." -ForegroundColor Red
    $confirmation = Read-Host "Escribe RESTAURAR para continuar"
    if ($confirmation -ne "RESTAURAR") {
        Write-Host "Restauracion cancelada por el usuario." -ForegroundColor Yellow
        exit 0
    }
}

# 8. Ejecución segura con --single-transaction y --exit-on-error
Write-Host "`n=== Restaurando backup de forma segura ===" -ForegroundColor Cyan
& $pgRestoreCmd `
    --clean `
    --if-exists `
    --no-owner `
    --single-transaction `
    --exit-on-error `
    --host $pgHost `
    --port $pgPort `
    --username $pgUser `
    --dbname $pgDb `
    $BackupFile

if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Fallo la restauracion con pg_restore (codigo de salida $LASTEXITCODE)." -ForegroundColor Red
    exit 1
}

Write-Host "[OK] Restauracion completada exitosamente sin errores." -ForegroundColor Green
