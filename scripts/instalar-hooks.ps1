# Activa los hooks versionados en scripts/hooks para este repositorio (6.3, H-50).
# Uso (desde la raíz de pos-system): powershell -ExecutionPolicy Bypass -File scripts/instalar-hooks.ps1
$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)
git config core.hooksPath scripts/hooks
if ($LASTEXITCODE -ne 0) { Write-Host "[ERROR] No se pudo configurar core.hooksPath." -ForegroundColor Red; exit 1 }
Write-Host "[OK] Hooks activos desde scripts/hooks (pre-commit: diseño + build del frontend)." -ForegroundColor Green
