param(
    [string]$ServiceName = "pos-backend",
    [string]$DisplayName = "POS Retail VRNTAS Backend",
    [string]$NssmPath,
    [int]$Port = 5000,
    [switch]$Uninstall,
    [switch]$SkipFirewall
)

$ErrorActionPreference = "Stop"

# 1. Validar privilegios de Administrador
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "[ERROR] Este script requiere ejecutarse con privilegios de Administrador." -ForegroundColor Red
    Write-Host "Abre PowerShell con 'Ejecutar como administrador' e intenta nuevamente." -ForegroundColor Yellow
    exit 1
}

$projectRoot = $PSScriptRoot
$backendDir = Join-Path $projectRoot "backend"
$pythonExe = Join-Path $backendDir "venv\Scripts\python.exe"
$frontendDist = Join-Path $projectRoot "frontend\dist"

if (-not (Test-Path -LiteralPath $pythonExe)) {
    Write-Host "[ERROR] Entorno virtual no encontrado en: $pythonExe" -ForegroundColor Red
    Write-Host "Ejecuta primero .\build-production.ps1 para preparar el backend." -ForegroundColor Yellow
    exit 1
}

if (-not $Uninstall -and -not (Test-Path -LiteralPath (Join-Path $frontendDist "index.html"))) {
    Write-Host "[ERROR] No existe frontend\dist. Ejecuta .\build-production.ps1 antes de instalar el servicio." -ForegroundColor Red
    exit 1
}

# 2. Localizar nssm.exe
function Find-Nssm([string]$customPath) {
    if ($customPath -and (Test-Path -LiteralPath $customPath)) {
        return $customPath
    }
    $inPath = Get-Command "nssm.exe" -ErrorAction SilentlyContinue
    if ($inPath) {
        return $inPath.Source
    }
    $candidates = @(
        Join-Path $projectRoot "tools\nssm.exe",
        Join-Path $projectRoot "tools\nssm-win64\nssm.exe",
        "C:\ProgramData\chocolatey\bin\nssm.exe",
        "C:\nssm\nssm.exe"
    )
    foreach ($cand in $candidates) {
        if (Test-Path -LiteralPath $cand) {
            return $cand
        }
    }
    return $null
}

$nssmExe = Find-Nssm -customPath $NssmPath

# 3. Desinstalación si se solicita -Uninstall
if ($Uninstall) {
    Write-Host "=== Desinstalando servicio '$ServiceName' ===" -ForegroundColor Yellow
    if ($nssmExe) {
        & $nssmExe stop $ServiceName 2>$null
        & $nssmExe remove $ServiceName confirm
    } else {
        Stop-Service -Name $ServiceName -ErrorAction SilentlyContinue
        sc.exe delete $ServiceName
    }
    Write-Host "[OK] Servicio '$ServiceName' desinstalado." -ForegroundColor Green
    exit 0
}

if (-not $nssmExe) {
    Write-Host "[ALERTA] NSSM no encontrado automáticamente en el sistema." -ForegroundColor Yellow
    Write-Host "NSSM (Non-Sucking Service Manager) es la herramienta recomendada para instalar servicios en Windows."
    Write-Host "Puedes descargarlo de https://nssm.cc o instalarlo con: choco install nssm"
    Write-Host "O especificar la ruta con: .\install-service.ps1 -NssmPath 'C:\ruta\a\nssm.exe'" -ForegroundColor Cyan
    exit 1
}

Write-Host "=== Instalando servicio de Windows '$ServiceName' con NSSM ===" -ForegroundColor Cyan
Write-Host "Binario NSSM: $nssmExe"
Write-Host "Python venv:  $pythonExe"
Write-Host "Directorio:   $backendDir"

# 4. Detectar servicio de PostgreSQL para establecer dependencia
$pgService = Get-Service -Name "postgresql*", "postgresql-x64-18" -ErrorAction SilentlyContinue | Select-Object -First 1
$pgServiceName = if ($pgService) { $pgService.Name } else { "postgresql-x64-18" }

# 5. Instalar y configurar servicio con NSSM
# Waitress (servidor de producción) escuchando en la LAN para que las cajas lleguen al servidor (OPS-06).
# Nunca run.py: es el servidor de desarrollo de Flask y escucha solo en 127.0.0.1.
& $nssmExe install $ServiceName $pythonExe "-m waitress --listen=0.0.0.0:$Port --threads=8 run:app"
& $nssmExe set $ServiceName AppDirectory $backendDir
& $nssmExe set $ServiceName AppEnvironmentExtra "SERVE_FRONTEND=true" "FRONTEND_DIST=$frontendDist"
& $nssmExe set $ServiceName DisplayName $DisplayName
& $nssmExe set $ServiceName Description "Servicio en segundo plano de POS Retail VRNTAS"
& $nssmExe set $ServiceName Start SERVICE_AUTO_START
& $nssmExe set $ServiceName AppRestartDelay 5000

if ($pgServiceName) {
    Write-Host "Configurando dependencia del servicio de PostgreSQL: $pgServiceName" -ForegroundColor Yellow
    & $nssmExe set $ServiceName DependOnService $pgServiceName
}

# Redirección de logs estándar a archivo
$logDir = Join-Path $projectRoot "logs"
if (-not (Test-Path -LiteralPath $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}
& $nssmExe set $ServiceName AppStdout (Join-Path $logDir "service-stdout.log")
& $nssmExe set $ServiceName AppStderr (Join-Path $logDir "service-stderr.log")

Write-Host "[OK] Servicio '$ServiceName' configurado exitosamente." -ForegroundColor Green

# 6. Regla en Firewall de Windows para el puerto de la aplicación
if (-not $SkipFirewall) {
    Write-Host "`n=== Configurando regla de Firewall para puerto $Port ===" -ForegroundColor Cyan
    $ruleName = "POS System Backend ($Port)"
    $existingRule = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
    if (-not $existingRule) {
        New-NetFirewallRule `
            -DisplayName $ruleName `
            -Direction Inbound `
            -LocalPort $Port `
            -Protocol TCP `
            -Action Allow `
            -Description "Permite conexiones entrantes al POS en el puerto $Port" | Out-Null
        Write-Host "[OK] Regla de firewall creada para el puerto $Port." -ForegroundColor Green
    } else {
        Write-Host "[OK] Regla de firewall para el puerto $Port ya existe." -ForegroundColor Green
    }
}

Write-Host "`nPara iniciar el servicio:" -ForegroundColor White
Write-Host "  Start-Service -Name $ServiceName" -ForegroundColor Cyan
Write-Host "Para verificar el estado:" -ForegroundColor White
Write-Host "  Get-Service -Name $ServiceName" -ForegroundColor Cyan
