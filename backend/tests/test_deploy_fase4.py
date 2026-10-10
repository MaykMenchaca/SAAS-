"""Servicio de Windows en la LAN y actualización segura (Subfase 4.9, OPS-06, OPS-13)."""
import re
from pathlib import Path

ROOT = Path(__file__).parents[2]


def _read(name):
    return (ROOT / name).read_text(encoding="utf-8")


def test_servicio_usa_waitress_en_la_lan():
    script = _read("install-service.ps1")
    assert "waitress" in script, "el servicio debe usar waitress, no el servidor de desarrollo"
    assert "0.0.0.0" in script, "el servicio debe escuchar en la LAN"
    assert not re.search(r'install \$ServiceName \$pythonExe "run\.py"', script)
    assert "SERVE_FRONTEND=true" in script, "el servicio debe servir el frontend compilado"


def test_start_production_verifica_migraciones():
    script = _read("start-production.ps1")
    upgrade = script.index("db upgrade")
    assert "LASTEXITCODE" in script[upgrade:upgrade + 400], "start-production debe abortar si falla db upgrade"


def test_update_production_respalda_antes_de_migrar():
    script = _read("update-production.ps1")
    dump, upgrade = script.index("pg_dump"), script.index("db upgrade")
    assert dump < upgrade, "el respaldo debe hacerse antes de migrar"
    assert "Stop-Service" in script and "Start-Service" in script
    assert script.count("LASTEXITCODE") >= 3, "cada paso crítico debe verificar el código de salida"


def test_env_example_documenta_lo_que_usa_el_codigo():
    env = _read("backend/.env.example")
    for key in ("PRINTER_DEVICE_PATH", "POS_HOST", "APP_TIMEZONE"):
        assert re.search(rf"^#?\s*{key}=", env, re.M), f"falta {key} en .env.example"
    for unused in ("PRINTER_PATH=", "PRINTER_BAUDRATE", "BUSINESS_NAME"):
        assert unused not in env, f"{unused} no lo usa el código"


def test_deployment_usa_script_de_actualizacion():
    assert "update-production.ps1" in _read("DEPLOYMENT.md")
