"""Impresión por caja, ESC/POS, cajón y reimpresión (Subfase 4.2, H-22)."""
import time

import pytest

ESC_INIT = b"\x1b@"
DRAWER_KICK = b"\x1bp\x00\x19\x96"
CUT = b"\x1bd\x04\x1dV\x42\x00"


def _vender(client, token, session_id, product_id, method="efectivo"):
    amount = "116.00"
    response = client.post(
        "/api/sales/",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "session_id": session_id,
            "items": [{"product_id": product_id, "quantity": 1}],
            "payments": [{"method": method, "amount": amount}],
        },
    )
    assert response.status_code == 201, response.get_json()
    return response.get_json()


@pytest.fixture
def caja_con_impresora(db, seed_cash_register, tmp_path):
    target = tmp_path / "impresora.prn"
    seed_cash_register.printer_path = str(target)
    seed_cash_register.printer_codepage = "cp850"
    db.session.flush()
    return target


def test_ticket_usa_config_empresa(db, seed_admin, seed_open_session, seed_product_for_sale):
    from app.services import config_service
    from app.services.printer_service import PrinterService
    from app.services.sale_service import SaleService

    config_service.set_bulk({
        "company_name": "Ferretería El Clavo",
        "company_address": "Av. Juárez 123",
        "business_rfc": "FEC010101AB1",
        "ticket_footer": "Vuelva pronto",
    })
    sale = SaleService.create_sale(
        user_id=seed_admin.id,
        session_id=seed_open_session.id,
        items=[{"product_id": seed_product_for_sale.id, "quantity": 1}],
        payments=[{"method": "efectivo", "amount": "116.00"}],
    )

    ticket = PrinterService.format_sale_ticket(sale)

    assert "Ferretería El Clavo" in ticket
    assert "Av. Juárez 123" in ticket
    assert "RFC: FEC010101AB1" in ticket
    assert "Vuelva pronto" in ticket
    assert "Gracias por su compra" not in ticket


def test_encoding_acentos_mayusculas():
    from app.services.printer_service import PrinterService

    payload = PrinterService.build_payload("ÁÉÍÓÚ Ñ ñ ü", codepage="cp850")
    assert payload.startswith(ESC_INIT + b"\x1bt\x02")
    assert "ÁÉÍÓÚ Ñ ñ ü".encode("cp850") in payload
    assert b"?" not in payload

    # cp437 no tiene mayúsculas acentuadas: se translitera en lugar de imprimir "?"
    payload_437 = PrinterService.build_payload("ÁRBOL €", codepage="cp437")
    assert payload_437.startswith(ESC_INIT + b"\x1bt\x00")
    assert b"ARBOL" in payload_437
    assert b"?" not in payload_437


def test_corte_gs_v():
    from app.services.printer_service import PrinterService

    payload = PrinterService.build_payload("TOTAL $10.00", codepage="cp850")
    assert payload.endswith(CUT)
    assert b"\x1di" not in payload


def test_codepage_invalida_rechazada():
    from app.services.printer_service import PrinterService

    with pytest.raises(ValueError):
        PrinterService.build_payload("x", codepage="utf-8")


def test_ticket_se_imprime_en_la_impresora_de_la_caja(
    client, admin_token, seed_open_session, seed_product_for_sale, caja_con_impresora, monkeypatch
):
    monkeypatch.delenv("PRINTER_DEVICE_PATH", raising=False)
    sale = _vender(client, admin_token, seed_open_session.id, seed_product_for_sale.id, "tarjeta")

    response = client.post(
        f"/api/printing/sales/{sale['id']}/ticket",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"send": True},
    )

    assert response.status_code == 200, response.get_json()
    assert response.get_json()["sent"] is True
    written = caja_con_impresora.read_bytes()
    assert sale["folio"].encode() in written
    assert written.endswith(CUT)


def test_reimpresion_no_abre_cajon(
    client, admin_token, seed_open_session, seed_product_for_sale, caja_con_impresora
):
    sale = _vender(client, admin_token, seed_open_session.id, seed_product_for_sale.id)
    caja_con_impresora.unlink(missing_ok=True)

    response = client.post(
        f"/api/printing/sales/{sale['id']}/ticket",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"send": True},
    )

    assert response.status_code == 200
    assert DRAWER_KICK not in caja_con_impresora.read_bytes()


def test_venta_en_efectivo_abre_cajon(
    client, admin_token, seed_open_session, seed_product_for_sale, caja_con_impresora
):
    _vender(client, admin_token, seed_open_session.id, seed_product_for_sale.id, "efectivo")
    assert DRAWER_KICK in caja_con_impresora.read_bytes()


def test_venta_con_tarjeta_no_abre_cajon(
    client, admin_token, seed_open_session, seed_product_for_sale, caja_con_impresora
):
    _vender(client, admin_token, seed_open_session.id, seed_product_for_sale.id, "tarjeta")
    assert not caja_con_impresora.exists()


def test_cajon_con_impresora_caida_no_rompe_la_venta(
    client, admin_token, db, seed_open_session, seed_product_for_sale, seed_cash_register, tmp_path
):
    seed_cash_register.printer_path = str(tmp_path / "no_existe" / "impresora.prn")
    db.session.flush()

    _vender(client, admin_token, seed_open_session.id, seed_product_for_sale.id, "efectivo")


def test_escritura_con_timeout(tmp_path, monkeypatch):
    from pathlib import Path

    from app.services.printer_service import PrinterService

    monkeypatch.setattr(PrinterService, "WRITE_TIMEOUT", 0.2)
    monkeypatch.setattr(Path, "write_bytes", lambda self, data: time.sleep(2))

    with pytest.raises(RuntimeError, match="Impresora no disponible"):
        PrinterService.send_to_printer("x", tmp_path / "lenta.prn")


def test_puerto_com_es_destino_valido(monkeypatch):
    from pathlib import Path

    from app.services.printer_service import PrinterService

    escrito = {}
    monkeypatch.setattr(Path, "write_bytes", lambda self, data: escrito.setdefault(str(self), data))

    assert PrinterService.send_to_printer("x", "COM3") is True
    assert "COM3" in escrito


def test_admin_configura_impresora_de_caja(client, admin_token, seed_cash_register, tmp_path):
    response = client.patch(
        f"/api/cash-register/registers/{seed_cash_register.id}",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"printer_path": str(tmp_path / "caja1.prn"), "printer_codepage": "cp858"},
    )
    assert response.status_code == 200, response.get_json()
    data = response.get_json()
    assert data["printer_path"] == str(tmp_path / "caja1.prn")
    assert data["printer_codepage"] == "cp858"

    listado = client.get(
        "/api/cash-register/", headers={"Authorization": f"Bearer {admin_token}"}
    ).get_json()
    assert listado[0]["printer_codepage"] == "cp858"


@pytest.mark.parametrize(
    "payload",
    [
        {"printer_path": r"\\servidor\impresora"},
        {"printer_path": "archivo_relativo.prn"},
        {"printer_codepage": "utf-8"},
    ],
)
def test_configuracion_de_impresora_invalida(client, admin_token, seed_cash_register, payload):
    response = client.patch(
        f"/api/cash-register/registers/{seed_cash_register.id}",
        headers={"Authorization": f"Bearer {admin_token}"},
        json=payload,
    )
    assert response.status_code == 400


def test_cajero_no_configura_impresora(client, regular_user_token, seed_cash_register, tmp_path):
    response = client.patch(
        f"/api/cash-register/registers/{seed_cash_register.id}",
        headers={"Authorization": f"Bearer {regular_user_token}"},
        json={"printer_path": str(tmp_path / "x.prn")},
    )
    assert response.status_code == 403


def test_reintento_idempotente_no_reabre_cajon(
    client, admin_token, seed_open_session, seed_product_for_sale, caja_con_impresora
):
    payload = {
        "session_id": seed_open_session.id,
        "client_uuid": "11111111-2222-4333-8444-555555555555",
        "items": [{"product_id": seed_product_for_sale.id, "quantity": 1}],
        "payments": [{"method": "efectivo", "amount": "116.00"}],
    }
    headers = {"Authorization": f"Bearer {admin_token}"}
    assert client.post("/api/sales/", headers=headers, json=payload).status_code == 201
    caja_con_impresora.unlink()

    assert client.post("/api/sales/", headers=headers, json=payload).status_code in (200, 201)
    assert not caja_con_impresora.exists()


def test_venta_sincronizada_offline_no_abre_cajon(
    client, admin_token, seed_open_session, seed_product_for_sale, caja_con_impresora
):
    response = client.post(
        "/api/sales/",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={
            "session_id": seed_open_session.id,
            "open_drawer": False,
            "items": [{"product_id": seed_product_for_sale.id, "quantity": 1}],
            "payments": [{"method": "efectivo", "amount": "116.00"}],
        },
    )
    assert response.status_code == 201
    assert not caja_con_impresora.exists()
