param(
    [Parameter(Mandatory = $true)][string]$ServerUrl,
    [Parameter(Mandatory = $true)][string]$AgentKey,
    [Parameter(Mandatory = $true)][string]$PrinterName,
    [string]$ServiceName = "pos-print-agent",
    [string]$NssmPath,
    [switch]$Uninstall
)

# Instala el agente de impresión en una caja con impresora USB (OPS-03).
# Ejecutar en la caja (no en el servidor), en PowerShell como administrador:
#   .\install-agent.ps1 -ServerUrl http://192.168.1.10:5000 -AgentKey "<clave>" -PrinterName "EPSON TM-T20II"

$ErrorActionPreference = "Stop"

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "[ERROR] Ejecuta este script como administrador." -ForegroundColor Red
    exit 1
}

$agentDir = $PSScriptRoot
$venvPython = Join-Path $agentDir "venv\Scripts\python.exe"

$nssmExe = if ($NssmPath -and (Test-Path -LiteralPath $NssmPath)) { $NssmPath } else {
    $cmd = Get-Command "nssm.exe" -ErrorAction SilentlyContinue
    if ($cmd) { $cmd.Source } else { $null }
}
if (-not $nssmExe) {
    Write-Host "[ERROR] No se encontró nssm.exe. Instálalo (choco install nssm) o usa -NssmPath." -ForegroundColor Red
    exit 1
}

if ($Uninstall) {
    & $nssmExe stop $ServiceName 2>$null
    & $nssmExe remove $ServiceName confirm
    Write-Host "[OK] Agente desinstalado." -ForegroundColor Green
    exit 0
}

# 1. Entorno de Python del agente con pywin32 (cola RAW de Windows)
if (-not (Test-Path -LiteralPath $venvPython)) {
    python -m venv (Join-Path $agentDir "venv")
    if ($LASTEXITCODE -ne 0) { Write-Host "[ERROR] No se pudo crear el entorno de Python (se requiere Python 3.11+)." -ForegroundColor Red; exit 1 }
}
& $venvPython -m pip install --upgrade pywin32
if ($LASTEXITCODE -ne 0) { Write-Host "[ERROR] No se pudo instalar pywin32." -ForegroundColor Red; exit 1 }

# 2. Verificar que la impresora exista en Windows (salvo puertos COM/LPT)
if ($PrinterName -notmatch '^(COM\d+|LPT\d|\\\\\.\\)') {
    if (-not (Get-Printer -Name $PrinterName -ErrorAction SilentlyContinue)) {
        Write-Host "[ERROR] No existe la impresora '$PrinterName'. Impresoras disponibles:" -ForegroundColor Red
        Get-Printer | Select-Object -ExpandProperty Name | ForEach-Object { Write-Host "  - $_" }
        exit 1
    }
}

# 3. Servicio de Windows
& $nssmExe install $ServiceName $venvPython (Join-Path $agentDir "pos_print_agent.py")
& $nssmExe set $ServiceName AppDirectory $agentDir
& $nssmExe set $ServiceName DisplayName "POS Retail VRNTAS - Agente de impresión"
& $nssmExe set $ServiceName Start SERVICE_AUTO_START
& $nssmExe set $ServiceName AppRestartDelay 5000
& $nssmExe set $ServiceName AppEnvironmentExtra "POS_SERVER_URL=$ServerUrl" "POS_AGENT_KEY=$AgentKey" "POS_PRINTER_NAME=$PrinterName"
$logDir = Join-Path $agentDir "logs"
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
& $nssmExe set $ServiceName AppStdout (Join-Path $logDir "agent.log")
& $nssmExe set $ServiceName AppStderr (Join-Path $logDir "agent.log")
& $nssmExe set $ServiceName AppRotateFiles 1
& $nssmExe set $ServiceName AppRotateBytes 1048576

Start-Service -Name $ServiceName
Write-Host "[OK] Agente '$ServiceName' instalado e iniciado. Registro: $logDir\agent.log" -ForegroundColor Green
Write-Host "En Configuración → Cajas debe aparecer 'Agente conectado' en unos segundos."
