"""Hallazgos de la re-revisión final (cierre del plan)."""
from decimal import Decimal

import pytest


@pytest.fixture
def producto_por_metro(db):
    from app.models.inventory import Stock
    from app.models.product import Product, UnitOfMeasure

    unit = UnitOfMeasure(name="Metro", abbreviation="m", allows_fractions=True)
    db.session.add(unit)
    db.session.flush()
    product = Product(sku="CABLE-12", name="Cable calibre 12", unit_id=unit.id,
                      sale_price=Decimal("12.99"), tax_rate=Decimal("16.00"))
    db.session.add(product)
    db.session.flush()
    db.session.add(Stock(product_id=product.id, quantity=Decimal("100")))
    db.session.commit()
    return product


# ── FE-103: cantidades fraccionarias con total en centavos exactos ─────────

def test_total_con_fraccion_queda_en_centavos(client, admin_token, seed_open_session, producto_por_metro):
    headers = {"Authorization": f"Bearer {admin_token}"}
    items = [{"product_id": producto_por_metro.id, "quantity": "1.500"}]

    quote = client.post("/api/sales/quote", json={"items": items}, headers=headers).get_json()
    # 1.5 × 12.99 = 19.485 → 19.48 (HALF_EVEN por línea); IVA 16 % = 3.12; total 22.60
    assert quote["subtotal"] == "19.48" and quote["tax_total"] == "3.12" and quote["total"] == "22.60"

    for method in ("efectivo", "tarjeta"):
        response = client.post(
            "/api/sales/",
            json={"session_id": seed_open_session.id, "items": items,
                  "payments": [{"method": method, "amount": quote["total"], "reference": "1234"}]},
            headers=headers,
        )
        assert response.status_code == 201, (method, response.get_json())
        assert response.get_json()["total"] == "22.60"


# ── OPS-25 / OPS-27 / OPS-26: scripts de PowerShell ────────────────────────

import re as _re
import shutil as _shutil
import subprocess as _subprocess
from pathlib import Path as _Path

_ROOT = _Path(__file__).parents[2]
_POWERSHELL = _shutil.which("powershell") or _shutil.which("pwsh")


def _ps_arrays_join_path(script: str) -> list[str]:
    """Bloques @( ... ) cuyos elementos son llamadas Join-Path sin paréntesis (el bug de OPS-25)."""
    return _re.findall(r"@\(\s*\n(?:[^\n]*\n)*?\s*Join-Path [^\n]*,\s*\n", script)


@pytest.mark.parametrize("name", ["restore-backup.ps1", "install-service.ps1"])
def test_arreglos_de_join_path_con_parentesis(name):
    assert _ps_arrays_join_path((_ROOT / name).read_text(encoding="utf-8")) == [], name


@pytest.mark.skipif(_POWERSHELL is None, reason="requiere PowerShell")
def test_restore_backup_llega_a_validar_la_conexion(tmp_path):
    """Con un respaldo existente y una URL vacía, el script debe pasar la lectura de .env sin errores
    de sintaxis (antes abortaba siempre en la línea 25)."""
    dummy = tmp_path / "vacio.dump"
    dummy.write_bytes(b"PGDMP")
    script = (_ROOT / "restore-backup.ps1").read_text(encoding="utf-8")
    bloque = script[: script.index("# 2. Localizar binarios")]
    copia = tmp_path / "restore-hasta-env.ps1"
    copia.write_text(bloque + '\nWrite-Output "ENV-OK"\n', encoding="utf-8-sig")
    r = _subprocess.run([_POWERSHELL, "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", str(copia),
                         "-BackupFile", str(dummy)], capture_output=True, text=True, timeout=60)
    assert "ENV-OK" in r.stdout, r.stdout + r.stderr


@pytest.mark.parametrize("name", ["install-production.ps1", "start.ps1"])
def test_flask_se_ejecuta_desde_backend(name):
    script = (_ROOT / name).read_text(encoding="utf-8")
    push, pop = script.find("Push-Location $backendDir"), script.rfind("Pop-Location")
    llamadas = [m.start() for m in _re.finditer(r"-m flask --app run", script)]
    assert llamadas and push != -1
    assert all(push < pos < pop for pos in llamadas), (
        f"{name}: flask --app run debe correr dentro de Push-Location $backendDir ... Pop-Location"
    )
