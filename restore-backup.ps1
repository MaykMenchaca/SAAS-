param(
    [Parameter(Mandatory = $true)]
    [string]$BackupFile,

    [string]$DatabaseUrl = $env:DATABASE_URL,

    [switch]$Force
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $BackupFile -PathType Leaf)) {
    Write-Host "[ERROR] Backup no encontrado: $BackupFile" -ForegroundColor Red
    exit 1
}

if ([string]::IsNullOrWhiteSpace($DatabaseUrl)) {
    $DatabaseUrl = "postgresql://pos_user:pos_pass@localhost:5432/pos_db"
}

try {
    $uri = [Uri]$DatabaseUrl
} catch {
    Write-Host "[ERROR] DATABASE_URL invalido." -ForegroundColor Red
    exit 1
}

$userInfo = $uri.UserInfo.Split(":", 2)
$pgUser = if ($userInfo[0]) { [Uri]::UnescapeDataString($userInfo[0]) } else { "pos_user" }
$pgPass = if ($userInfo.Length -gt 1) { [Uri]::UnescapeDataString($userInfo[1]) } else { "" }
$pgHost = if ($uri.Host) { $uri.Host } else { "localhost" }
$pgPort = if ($uri.Port -gt 0) { $uri.Port } else { 5432 }
$pgDb = $uri.AbsolutePath.TrimStart("/")

if ([string]::IsNullOrWhiteSpace($pgDb)) {
    Write-Host "[ERROR] No se pudo detectar la base de datos en DATABASE_URL." -ForegroundColor Red
    exit 1
}

Write-Host "=== Verificando backup ===" -ForegroundColor Cyan
if ($pgPass) {
    $env:PGPASSWORD = $pgPass
}

& pg_restore --list $BackupFile *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] pg_restore no pudo leer el backup." -ForegroundColor Red
    exit 1
}
Write-Host "[OK] Backup legible." -ForegroundColor Green

Write-Host "`nDestino:" -ForegroundColor Yellow
Write-Host "  Host: $pgHost"
Write-Host "  Puerto: $pgPort"
Write-Host "  Base: $pgDb"
Write-Host "  Usuario: $pgUser"

if (-not $Force) {
    Write-Host "`nEsta operacion reemplazara objetos existentes de la base de datos." -ForegroundColor Red
    $confirmation = Read-Host "Escribe RESTAURAR para continuar"
    if ($confirmation -ne "RESTAURAR") {
        Write-Host "Restauracion cancelada." -ForegroundColor Yellow
        exit 0
    }
}

Write-Host "`n=== Restaurando backup ===" -ForegroundColor Cyan
& pg_restore `
    --clean `
    --if-exists `
    --no-owner `
    --host $pgHost `
    --port $pgPort `
    --username $pgUser `
    --dbname $pgDb `
    $BackupFile

if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Fallo la restauracion." -ForegroundColor Red
    exit 1
}

Write-Host "[OK] Restauracion completada." -ForegroundColor Green
