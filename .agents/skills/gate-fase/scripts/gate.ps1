param([Parameter(Mandatory = $true)][ValidateRange(0, 6)][int]$Fase)

# Gate de calidad por fase. Ejecutar desde pos-system/.
$ErrorActionPreference = "Continue"
$root = Resolve-Path (Join-Path $PSScriptRoot "..\..\..\..")
$fails = New-Object System.Collections.Generic.List[string]
function Check($name, [scriptblock]$ok) {
    try { $r = & $ok } catch { $r = $false }
    if ($r) { Write-Host "[OK]   $name" -ForegroundColor Green }
    else { Write-Host "[FAIL] $name" -ForegroundColor Red; $fails.Add($name) }
}
function Grep($path, $pattern) { Select-String -Path (Join-Path $root $path) -Pattern $pattern -Quiet }

Write-Host "=== Gate fase $Fase ===" -ForegroundColor Cyan

# 1. Backend tests
Push-Location (Join-Path $root "backend")
& .\venv\Scripts\python.exe -m pytest -q -p no:cacheprovider 2>&1 | Select-Object -Last 5
$pytestOk = ($LASTEXITCODE -eq 0)
Pop-Location
Check "pytest completo" { $pytestOk }

# 2. Frontend build
Push-Location (Join-Path $root "frontend")
npm run build 2>&1 | Select-Object -Last 3
$buildOk = ($LASTEXITCODE -eq 0)
Pop-Location
Check "npm run build" { $buildOk }

# 3. Chequeos de regresion por fase (acumulativos: una fase incluye las anteriores)
if ($Fase -ge 0) {
    Check "0.1 printing.py no lee printer_path del request" { -not (Grep "backend/app/api/printing.py" 'get\("printer_path"\)') }
    Check "0.2 config.py sin fallbacks de secretos" { -not (Grep "backend/app/config.py" 'dev-secret|jwt-dev') }
    Check "0.2 seed sin admin123" { -not (Grep "backend/app/seed.py" 'admin123') }
    Check "0.2 scripts sin admin123" { -not ((Grep "start.bat" 'admin123') -or (Grep "start.ps1" 'admin123')) }
    Check "0.3 backups ignorados por git" { git -C $root check-ignore -q "backend/backups/x.dump"; $LASTEXITCODE -eq 0 }
    Check "0.4 run.py sin debug=True fijo" { -not (Grep "backend/run.py" 'debug=True') }
}
if ($Fase -ge 1) {
    Check "1.1 sale_service no usa unit_price del cliente" { -not (Grep "backend/app/services/sale_service.py" 'item_data\["unit_price"\]') }
    Check "1.4 pos.tsx no cae a offline con catch generico" { -not (Grep "frontend/src/pages/pos.tsx" 'procediendo a modo offline') }
    Check "1.4 columna client_uuid en Sale" { Grep "backend/app/models/sale.py" 'client_uuid' }
    Check "1.5 returns.tsx sin step=1 fijo" { -not (Grep "frontend/src/pages/returns.tsx" 'step="1"') }
}
if ($Fase -ge 2) {
    Check "2.1 audit_service hace commit o se usa antes del commit" { Grep "backend/app/services/audit_service.py" 'commit|# in-transaction' }
    Check "2.2 blocklist / token_in_blocklist_loader" { (Get-ChildItem (Join-Path $root "backend/app") -Recurse -Filter *.py | Select-String 'token_in_blocklist_loader' -Quiet) }
    Check "2.3 helper can() en frontend" { (Get-ChildItem (Join-Path $root "frontend/src") -Recurse -Include *.ts, *.tsx | Select-String 'RequirePermission' -Quiet) }
}
if ($Fase -ge 3) {
    Check "3.1 PG_BIN_DIR soportado" { Grep "backend/app/services/backup_service.py" 'PG_BIN_DIR' }
    Check "3.2 restore con --single-transaction" { Grep "restore-backup.ps1" 'single-transaction' }
    Check "3.4 health consulta la BD" { (Get-ChildItem (Join-Path $root "backend/app/api") -Filter *.py | Select-String 'SELECT 1|select\(1\)|text\("SELECT 1"\)' -Quiet) }
}
if ($Fase -ge 4) {
    Check "4.1 APP_TIMEZONE en config" { Grep "backend/app/config.py" 'APP_TIMEZONE' }
    Check "4.3 axios con timeout" { Grep "frontend/src/api/client.ts" 'timeout' }
}
if ($Fase -ge 5) {
    Check "5.1 dashboard sin deltas fijos" { -not (Grep "frontend/src/pages/dashboard.tsx" '"\+12\.4%"|"\+8\.1%"') }
    Check "5.5 focus-visible global" { Grep "frontend/src/index.css" 'focus-visible' }
    Check "5.7 sin text-[9px|10px|11px]" { -not (Get-ChildItem (Join-Path $root "frontend/src") -Recurse -Include *.tsx | Select-String 'text-\[(9|10|11)px\]') }
}
if ($Fase -ge 6) {
    Check "6.3 workflow de CI existe" { Test-Path (Join-Path $root ".github/workflows") }
    Check "6.2 script de test en frontend" { Grep "frontend/package.json" '"test"' }
    Push-Location (Join-Path $root "frontend")
    $audit = npm audit --omit=dev --audit-level=high 2>&1; $auditOk = ($LASTEXITCODE -eq 0)
    Pop-Location
    Check "6.4 npm audit sin altas" { $auditOk }
}

Write-Host ""
if ($fails.Count -eq 0) { Write-Host "GATE FASE ${Fase}: APROBADO (falta la verificacion manual del SKILL.md)" -ForegroundColor Green; exit 0 }
else { Write-Host "GATE FASE ${Fase}: RECHAZADO ($($fails.Count) fallas)" -ForegroundColor Red; $fails | ForEach-Object { Write-Host " - $_" }; exit 1 }
