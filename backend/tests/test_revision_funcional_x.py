"""Revisión funcional 2026-10, carril X (fase 3, hallazgos medios).

3.A  RF-12 (entradas fuera de rango → 4xx, DataError → 400) y RF-13 (405 ya no es 500).
3.B  RF-11 (una venta rechazada no consume folio) y RF-15 (ticket de venta cancelada o con devolución).
3.G  RF-14 (nombres de respaldo únicos), RF-26/RF-31 (delete/verify solo de respaldos listados, sin rutas
     absolutas) y RF-27 (dos restauraciones simultáneas: la segunda recibe 409).
"""
import threading
from datetime import datetime
from decimal import Decimal
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy import text

from app.models.sale import Payment, Sale
from app.services import backup_service, restore_service
# Fixture y utilidades de las pruebas de restauración (esquema lane_* aislado)
from tests.test_rediseno_restore import _crear_respaldo, _esperar_fin, _restaurar, aislado  # noqa: F401


def _h(token):
    return {"Authorization": f"Bearer {token}"}


def _vender(client, token, session, product, qty="1", payments=None):
    return client.post("/api/sales/", headers=_h(token), json={
        "session_id": session.id,
        "items": [{"product_id": product.id, "quantity": str(qty)}],
        "payments": payments or [{"method": "efectivo", "amount": "10000.00"}],
    })


def _consecutivo(folio: str) -> int:
    return int(folio.rsplit("-", 1)[1])


# ── 3.A · RF-13: un método no permitido responde 405, no 500 ──────────────────────────────

@pytest.mark.parametrize("metodo,ruta", [("put", "/api/health"), ("delete", "/api/auth/me"), ("put", "/api/sales/1")])
def test_rf13_metodo_no_permitido_responde_405(client, metodo, ruta):
    resp = getattr(client, metodo)(ruta)
    assert resp.status_code == 405
    datos = resp.get_json()
    assert datos["error"]
    assert "error_id" not in datos
    assert "Allow" in resp.headers


def test_rf13_ruta_inexistente_sigue_en_404(client):
    resp = client.get("/api/no-existe-rf13")
    assert resp.status_code == 404
    assert resp.get_json()["error"]


# ── 3.A · RF-12: desbordamientos y textos largos responden 4xx ────────────────────────────

def test_rf12_dataerror_de_la_base_responde_400_sin_detalles(client, admin_token, db, seed_open_session,
                                                            seed_product_for_sale, monkeypatch):
    """Cualquier DataError que se escape (desbordamiento numérico real de PostgreSQL) es un 400, no un 500."""
    from app.extensions import db as _db
    from app.services.sale_service import SaleService

    def desborda(**kwargs):
        _db.session.execute(text("SELECT CAST(100000000000 AS numeric(12,2))"))

    monkeypatch.setattr(SaleService, "create_sale", staticmethod(desborda))
    resp = _vender(client, admin_token, seed_open_session, seed_product_for_sale)
    assert resp.status_code == 400
    datos = resp.get_json()
    assert datos["error"]
    cuerpo = resp.get_data(as_text=True).lower()
    assert "numeric" not in cuerpo and "select" not in cuerpo and "error_id" not in cuerpo
    monkeypatch.undo()
    # La sesión de la base quedó usable (hubo rollback)
    assert _vender(client, admin_token, seed_open_session, seed_product_for_sale).status_code == 201


def test_rf12_pago_que_desborda_numeric_responde_422(client, admin_token, db, seed_open_session, seed_product_for_sale):
    resp = _vender(client, admin_token, seed_open_session, seed_product_for_sale,
                   payments=[{"method": "efectivo", "amount": "100000000000.00"}])
    assert resp.status_code == 422, resp.get_json()
    assert "amount" in str(resp.get_json()["details"])
    assert Sale.query.count() == 0


def test_rf12_pago_en_el_maximo_de_numeric_no_se_rechaza_por_esquema(client, admin_token, db, seed_open_session,
                                                                      seed_product_for_sale):
    resp = _vender(client, admin_token, seed_open_session, seed_product_for_sale,
                   payments=[{"method": "efectivo", "amount": "9999999999.99"}])
    assert resp.status_code == 201, resp.get_json()


def test_rf12_referencia_de_mas_de_100_caracteres_responde_422(client, admin_token, db, seed_open_session,
                                                              seed_product_for_sale):
    resp = _vender(client, admin_token, seed_open_session, seed_product_for_sale,
                   payments=[{"method": "tarjeta", "amount": "116.00", "reference": "R" * 101}])
    assert resp.status_code == 422, resp.get_json()
    assert "reference" in str(resp.get_json()["details"])
    assert Sale.query.count() == 0
    # 100 caracteres sí caben
    resp = _vender(client, admin_token, seed_open_session, seed_product_for_sale,
                   payments=[{"method": "tarjeta", "amount": "116.00", "reference": "R" * 100}])
    assert resp.status_code == 201, resp.get_json()
    assert Payment.query.one().reference == "R" * 100


def test_rf12_cantidad_que_desborda_numeric_responde_422(client, admin_token, db, seed_open_session,
                                                        seed_product_for_sale):
    resp = _vender(client, admin_token, seed_open_session, seed_product_for_sale, qty="1000000000")
    assert resp.status_code == 422, resp.get_json()
    resp = client.post("/api/sales/quote", headers=_h(admin_token), json={
        "items": [{"product_id": seed_product_for_sale.id, "quantity": "1000000000"}]})
    assert resp.status_code == 422


def test_rf12_devolucion_con_cantidad_que_desborda_responde_422(client, admin_token, db, seed_open_session,
                                                               seed_product_for_sale):
    venta = _vender(client, admin_token, seed_open_session, seed_product_for_sale).get_json()
    resp = client.post(f"/api/sales/{venta['id']}/return", headers=_h(admin_token), json={
        "reason": "RF-12", "session_id": seed_open_session.id,
        "items": [{"sale_item_id": venta["items"][0]["id"], "quantity": "1000000000"}],
    })
    assert resp.status_code == 422, resp.get_json()


def test_rf12_printer_path_de_mas_de_255_caracteres_responde_400(client, admin_token, db, seed_cash_register):
    ruta = "C:\\" + "a" * 260 + ".prn"
    resp = client.patch(f"/api/cash-register/registers/{seed_cash_register.id}", headers=_h(admin_token),
                        json={"printer_path": ruta})
    assert resp.status_code == 400, resp.get_json()
    db.session.expire_all()
    assert seed_cash_register.printer_path is None


# ── 3.B · RF-11: una venta rechazada no consume folio ─────────────────────────────────────

def test_rf11_ventas_rechazadas_no_dejan_huecos_en_el_folio(client, admin_token, db, seed_open_session,
                                                           seed_product_for_sale):
    primera = _vender(client, admin_token, seed_open_session, seed_product_for_sale)
    assert primera.status_code == 201
    n = _consecutivo(primera.get_json()["folio"])

    rechazos = [
        # Stock insuficiente (hay 99)
        _vender(client, admin_token, seed_open_session, seed_product_for_sale, qty="500"),
        # Pago insuficiente
        _vender(client, admin_token, seed_open_session, seed_product_for_sale,
                payments=[{"method": "efectivo", "amount": "1.00"}]),
        # Sobrepago con tarjeta
        _vender(client, admin_token, seed_open_session, seed_product_for_sale,
                payments=[{"method": "tarjeta", "amount": "500.00"}]),
    ]
    assert [r.status_code for r in rechazos] == [400, 400, 400]

    segunda = _vender(client, admin_token, seed_open_session, seed_product_for_sale)
    assert segunda.status_code == 201
    assert _consecutivo(segunda.get_json()["folio"]) == n + 1
    assert Sale.query.count() == 2


# ── 3.B · RF-15: el ticket dice si la venta se canceló o tuvo devolución ──────────────────

def _ticket(client, token, sale_id):
    resp = client.post(f"/api/printing/sales/{sale_id}/ticket", headers=_h(token), json={})
    assert resp.status_code == 200
    return resp.get_json()["content"]


def test_rf15_ticket_vigente_sin_marcas(client, admin_token, db, seed_open_session, seed_product_for_sale):
    venta = _vender(client, admin_token, seed_open_session, seed_product_for_sale).get_json()
    contenido = _ticket(client, admin_token, venta["id"])
    assert "CANCELADA" not in contenido
    assert "DEVOLUCI" not in contenido


def test_rf15_ticket_de_venta_cancelada_lo_indica_con_el_motivo(client, admin_token, db, seed_open_session,
                                                                seed_product_for_sale):
    venta = _vender(client, admin_token, seed_open_session, seed_product_for_sale).get_json()
    resp = client.post(f"/api/sales/{venta['id']}/cancel", headers=_h(admin_token),
                       json={"reason": "Cliente se arrepintio"})
    assert resp.status_code == 200
    contenido = _ticket(client, admin_token, venta["id"])
    assert "*** VENTA CANCELADA ***" in contenido
    assert "Cliente se arrepintio" in contenido
    # La marca aparece antes de las partidas y se repite al final (no se puede recortar)
    assert contenido.count("VENTA CANCELADA") >= 2
    assert contenido.index("VENTA CANCELADA") < contenido.index("Martillo")
    # La vista previa y la impresión usan el mismo contenido: también sale en los bytes ESC/POS
    from app.services.printer_service import PrinterService
    assert b"VENTA CANCELADA" in PrinterService.build_payload(contenido, "cp850")


def test_rf15_ticket_con_devolucion_indica_lo_reembolsado(client, admin_token, db, seed_open_session,
                                                         seed_product_for_sale):
    venta = _vender(client, admin_token, seed_open_session, seed_product_for_sale, qty="2").get_json()
    item_id = venta["items"][0]["id"]
    resp = client.post(f"/api/sales/{venta['id']}/return", headers=_h(admin_token), json={
        "reason": "Defecto", "session_id": seed_open_session.id, "refund_method": "efectivo",
        "items": [{"sale_item_id": item_id, "quantity": "1"}],
    })
    assert resp.status_code == 200, resp.get_json()
    contenido = _ticket(client, admin_token, venta["id"])
    assert "DEVOLUCIÓN PARCIAL" in contenido
    assert "$116.00" in contenido.split("DEVOLUCIÓN PARCIAL", 1)[1]
    assert "Reembolsado" in contenido

    resp = client.post(f"/api/sales/{venta['id']}/return", headers=_h(admin_token), json={
        "reason": "Defecto", "session_id": seed_open_session.id, "refund_method": "efectivo",
        "items": [{"sale_item_id": item_id, "quantity": "1"}],
    })
    assert resp.status_code == 200, resp.get_json()
    contenido = _ticket(client, admin_token, venta["id"])
    assert "DEVOLUCIÓN TOTAL" in contenido
    assert "$232.00" in contenido

