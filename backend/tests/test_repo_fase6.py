"""CI, hooks versionados, scripts en tools/ y README (Subfase 6.3, H-50)."""
import re
from pathlib import Path

ROOT = Path(__file__).parents[2]


def _read(*parts):
    return ROOT.joinpath(*parts).read_text(encoding="utf-8")


def test_workflow_de_ci_con_backend_frontend_y_auditoria():
    ci = _read(".github", "workflows", "ci.yml")
    for job in ("backend:", "frontend:", "audit:"):
        assert job in ci, f"falta el job {job}"
    assert "postgres:18" in ci and "pos_test_db" in ci and "TEST_DATABASE_URL" in ci
    assert "requirements-dev.txt" in ci and "pytest" in ci
    assert "npm ci" in ci and "npm run build" in ci and "npm test" in ci
    assert "npm audit --omit=dev --audit-level=high" in ci and "pip-audit" in ci


def test_hook_pre_commit_versionado_sin_echo_punto():
    hook = _read("scripts", "hooks", "pre-commit")
    assert hook.startswith("#!/bin/sh")
    assert not re.search(r"^\s*echo\.\s*$", hook, re.M), "echo. no existe en sh"
    assert "tools/verify_design.py" in hook
    assert "python3" in hook and "python" in hook, "debe detectar el intérprete de Python"
    instalador = _read("scripts", "instalar-hooks.ps1")
    assert "core.hooksPath" in instalador and "scripts/hooks" in instalador


def test_scripts_sueltos_movidos_a_tools():
    for name in ("bug_checker.py", "verify_code.py", "verify_design.py"):
        assert not (ROOT / name).exists(), f"{name} debe estar en tools/"
        script = _read("tools", name)
        # La raíz del proyecto es el padre de tools/, no la carpeta del script
        assert "os.path.dirname(os.path.dirname(os.path.abspath(__file__)))" in script, name


def test_readme_completo():
    readme = _read("README.md")
    for seccion in ("Stack", "Inicio rápido", "Instalación en tienda", "Respaldo", "Pruebas", "Estructura", "Agentes"):
        assert seccion in readme, f"falta la sección {seccion}"
    assert "DEPLOYMENT.md" in readme and "AGENTS.md" in readme
    assert "TEST_DATABASE_URL" in readme


def test_start_scripts_detienen_si_fallan_las_migraciones():
    bat = _read("start.bat")
    assert "EnableDelayedExpansion" in bat or "enabledelayedexpansion" in bat
    assert "%ERRORLEVEL%" not in bat
    ps1 = _read("start.ps1")
    upgrade = ps1.index("db upgrade")
    assert "exit 1" in ps1[upgrade:upgrade + 500], "start.ps1 debe abortar si fallan las migraciones"
