param(
    [Parameter(Mandatory = $true)][string]$ServerUrl,
    [Parameter(Mandatory = $true)][string]$PrinterName,
    [string]$ServiceName = "pos-print-agent",
    [string]$NssmPath,
    [switch]$Uninstall
)

# Instala (o reconfigura) el agente de impresión en una caja con impresora USB (OPS-03).
# Ejecutar en la caja (no en el servidor), en PowerShell como administrador:
#   .\install-agent.ps1 -ServerUrl http://192.168.1.10:5000 -PrinterName "EPSON TM-T20II"
# La clave del agente se pide sin mostrarla y se guarda en un archivo legible solo por
# Administradores y SYSTEM (no queda en el historial ni en el registro de servicios).

$ErrorActionPreference = "Stop"

function Fail([string]$message) {
    Write-Host "[ERROR] $message" -ForegroundColor Red
    exit 1
}

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { Fail "Ejecuta este script como administrador." }

$sourceDir = $PSScriptRoot
# El código del agente corre como LocalSystem: debe vivir donde solo Administradores escriben (OPS-20)
$installDir = Join-Path $env:ProgramFiles "POS Print Agent"
$dataDir = Join-Path $env:ProgramData "POS Print Agent"
$keyFile = Join-Path $dataDir "agent.key"
$venvPython = Join-Path $installDir "venv\Scripts\python.exe"

$nssmExe = if ($NssmPath -and (Test-Path -LiteralPath $NssmPath)) { $NssmPath } else {
    $cmd = Get-Command "nssm.exe" -ErrorAction SilentlyContinue
    if ($cmd) { $cmd.Source } else { $null }
}
if (-not $nssmExe) { Fail "No se encontró nssm.exe. Instálalo (choco install nssm) o usa -NssmPath." }

function Invoke-Nssm {
    & $nssmExe @args
    if ($LASTEXITCODE -ne 0) { Fail "nssm $($args -join ' ') falló (código $LASTEXITCODE)." }
}

$existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue

if ($Uninstall) {
    if ($existing) {
        if ($existing.Status -ne "Stopped") { Stop-Service -Name $ServiceName -Force }
        Invoke-Nssm remove $ServiceName confirm
    }
    Write-Host "[OK] Agente desinstalado. La clave sigue en $keyFile (bórrala si ya no se usará)." -ForegroundColor Green
    exit 0
}

# 1. Python 3.11+
$pyVersion = & python -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>$null
if ($LASTEXITCODE -ne 0 -or -not $pyVersion -or [version]$pyVersion -lt [version]"3.11") {
    Fail "Se requiere Python 3.11 o superior en esta caja. Detectado: '$pyVersion'."
}

# 2. Verificar que la impresora exista en Windows (salvo puertos COM/LPT)
if ($PrinterName -notmatch '^(COM\d+|LPT\d|\\\\\.\\)') {
    if (-not (Get-Printer -Name $PrinterName -ErrorAction SilentlyContinue)) {
        Write-Host "[ERROR] No existe la impresora '$PrinterName'. Impresoras disponibles:" -ForegroundColor Red
        Get-Printer | Select-Object -ExpandProperty Name | ForEach-Object { Write-Host "  - $_" }
        exit 1
    }
}

# 3. Detener el servicio si ya existe (reinstalación o rotación de clave)
if ($existing -and $existing.Status -ne "Stopped") { Stop-Service -Name $ServiceName -Force }

# 4. Copiar el agente a Program Files con escritura solo para Administradores y SYSTEM
New-Item -ItemType Directory -Path $installDir -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $sourceDir "pos_print_agent.py") -Destination $installDir -Force
& icacls $installDir /inheritance:r /grant:r "*S-1-5-32-544:(OI)(CI)F" "*S-1-5-18:(OI)(CI)F" "*S-1-5-32-545:(OI)(CI)RX" | Out-Null
if ($LASTEXITCODE -ne 0) { Fail "No se pudieron fijar los permisos de $installDir." }

if (-not (Test-Path -LiteralPath $venvPython)) {
    python -m venv (Join-Path $installDir "venv")
    if ($LASTEXITCODE -ne 0) { Fail "No se pudo crear el entorno de Python del agente." }
}
& $venvPython -m pip install --upgrade pywin32
if ($LASTEXITCODE -ne 0) { Fail "No se pudo instalar pywin32." }

# 5. Clave del agente: se pide sin eco y se guarda con ACL (solo Administradores y SYSTEM)
$secure = Read-Host -AsSecureString "Pega la clave del agente (Configuración → Cajas → Generar clave)"
$plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
if ($plain -notmatch '^\d+\.[A-Za-z0-9_-]{16,}$') { Fail "La clave no tiene el formato esperado (<id>.<secreto>)." }
New-Item -ItemType Directory -Path $dataDir -Force | Out-Null
& icacls $dataDir /inheritance:r /grant:r "*S-1-5-32-544:(OI)(CI)F" "*S-1-5-18:(OI)(CI)F" | Out-Null
if ($LASTEXITCODE -ne 0) { Fail "No se pudieron fijar los permisos de $dataDir." }
Set-Content -LiteralPath $keyFile -Value $plain -NoNewline -Encoding ascii
$plain = $null

# 6. Servicio de Windows: crear o reconfigurar (idempotente, OPS-19)
if (-not $existing) {
    Invoke-Nssm install $ServiceName $venvPython (Join-Path $installDir "pos_print_agent.py")
}
Invoke-Nssm set $ServiceName Application $venvPython
Invoke-Nssm set $ServiceName AppParameters "`"$(Join-Path $installDir 'pos_print_agent.py')`""
Invoke-Nssm set $ServiceName AppDirectory $installDir
Invoke-Nssm set $ServiceName DisplayName "POS Retail VRNTAS - Agente de impresión"
Invoke-Nssm set $ServiceName Start SERVICE_AUTO_START
Invoke-Nssm set $ServiceName AppRestartDelay 5000
Invoke-Nssm set $ServiceName AppEnvironmentExtra "POS_SERVER_URL=$ServerUrl" "POS_AGENT_KEY_FILE=$keyFile" "POS_PRINTER_NAME=$PrinterName"
$logDir = Join-Path $dataDir "logs"
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
Invoke-Nssm set $ServiceName AppStdout (Join-Path $logDir "agent.log")
Invoke-Nssm set $ServiceName AppStderr (Join-Path $logDir "agent.log")
Invoke-Nssm set $ServiceName AppRotateFiles 1
Invoke-Nssm set $ServiceName AppRotateBytes 1048576

Restart-Service -Name $ServiceName
Start-Sleep -Seconds 3
if ((Get-Service -Name $ServiceName).Status -ne "Running") {
    Fail "El servicio no quedó en ejecución. Revisa $logDir\agent.log."
}
Write-Host "[OK] Agente '$ServiceName' instalado y en ejecución. Registro: $logDir\agent.log" -ForegroundColor Green
Write-Host "En Configuración → Cajas debe aparecer 'Agente conectado' en unos segundos."
