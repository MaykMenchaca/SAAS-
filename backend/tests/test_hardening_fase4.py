"""Endurecimiento del gate F4 (Subfase 4.10, OPS-04, OPS-05, OPS-08, OPS-11)."""
import threading
import time
from datetime import datetime, timezone
from decimal import Decimal

import pytest


# ── OPS-04: destinos de impresora ──────────────────────────────────────────

@pytest.mark.parametrize(
    "target, esperado",
    [("COM3", "COM3"), ("com3", "COM3"), ("COM12", r"\\.\COM12"), (r"\\.\COM12", r"\\.\COM12"), ("LPT1", "LPT1")],
)
def test_puertos_validos_y_com_mayor_a_9(target, esperado):
    from app.services.printer_service import PrinterService

    assert PrinterService.validate_target(target) == esperado


@pytest.mark.parametrize(
    "target",
    [r"C:\pos-system\backend\.env", r"C:\Windows\win.ini", r"\\servidor\impresora", "relativa.prn", r"\\.\C:"],
)
def test_destinos_que_no_son_impresora_se_rechazan(target):
    from app.services.printer_service import PrinterService

    with pytest.raises(ValueError):
        PrinterService.validate_target(target)


def test_archivo_prn_absoluto_se_acepta(tmp_path):
    from app.services.printer_service import PrinterService

    destino = tmp_path / "impresora.prn"
    assert PrinterService.validate_target(str(destino)) == str(destino)


# ── OPS-05: zona horaria válida al arrancar ────────────────────────────────

def test_app_timezone_invalida_aborta_el_arranque():
    from app import create_app
    from app.config import TestConfig

    class MalaZona(TestConfig):
        APP_TIMEZONE = "America/Ciudad_Inexistente"

    with pytest.raises(RuntimeError, match="APP_TIMEZONE"):
        create_app(MalaZona)


# ── OPS-11: filtro de auditoría en hora local ──────────────────────────────

def test_filtro_de_auditoria_usa_el_dia_local(client, admin_token, db, seed_admin):
    from app.models.audit import AuditLog

    # 2026-10-06 19:30 en Ciudad de México == 2026-10-07 01:30 UTC
    log = AuditLog(user_id=seed_admin.id, username="admin", action="prueba", entity_type="qa",
                   created_at=datetime(2026, 10, 7, 1, 30, tzinfo=timezone.utc))
    db.session.add(log)
    db.session.commit()

    def contar(dia):
        data = client.get(
            "/api/audit/", query_string={"from": dia, "to": dia, "action": "prueba"},
            headers={"Authorization": f"Bearer {admin_token}"},
        ).get_json()
        return data["total"]

    assert contar("2026-10-06") == 1
    assert contar("2026-10-07") == 0


# ── OPS-08: devolución en efectivo concurrente con el cierre de caja ──────

def test_devolucion_durante_cierre_de_caja_se_rechaza(
    flask_app, client, admin_token, db, seed_admin, seed_open_session, seed_product_for_sale, monkeypatch
):
    from app.models.sale import CashRegisterSession, SaleReturn
    from app.services import audit_service
    from app.services.sale_service import SaleService

    sale = SaleService.create_sale(
        user_id=seed_admin.id, session_id=seed_open_session.id,
        items=[{"product_id": seed_product_for_sale.id, "quantity": 1}],
        payments=[{"method": "efectivo", "amount": "116.00"}],
    )
    session_id, admin_id = seed_open_session.id, seed_admin.id
    sale_id, item_id = sale.id, sale.items[0].id
    db.session.commit()

    original = audit_service.log_action

    def log_lento(*args, **kwargs):
        if kwargs.get("action") == "close":
            time.sleep(0.6)
        return original(*args, **kwargs)

    monkeypatch.setattr(audit_service, "log_action", log_lento)
    resultados = {}

    def cerrar():
        with flask_app.app_context():
            resultados["cierre"] = flask_app.test_client().post(
                f"/api/cash-register/{session_id}/close",
                json={"closing_amount": "1116.00"},
                headers={"Authorization": f"Bearer {admin_token}"},
            ).status_code

    def devolver():
        with flask_app.app_context():
            from app.extensions import db as _db

            try:
                resultados["devolucion"] = SaleService.return_sale(
                    sale_id=sale_id, user_id=admin_id, reason="QA",
                    items=[{"sale_item_id": item_id, "quantity": 1}],
                    session_id=session_id, refund_method="efectivo",
                ).id
            except Exception as exc:  # noqa: BLE001
                resultados["devolucion"] = exc
            finally:
                _db.session.remove()

    h1, h2 = threading.Thread(target=cerrar), threading.Thread(target=devolver)
    h1.start()
    time.sleep(0.2)
    h2.start()
    h1.join(timeout=15)
    h2.join(timeout=15)

    assert resultados["cierre"] == 200
    assert isinstance(resultados["devolucion"], ValueError), resultados
    db.session.remove()
    assert SaleReturn.query.count() == 0
    assert db.session.get(CashRegisterSession, session_id).expected_cash == Decimal("1116.00")
