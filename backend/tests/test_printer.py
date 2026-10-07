"""Tests for ESC/POS ticket and label formatting (Task 26)."""


def _create_sale(db, seed_admin, seed_open_session, seed_product_for_sale):
    from app.services.sale_service import SaleService

    return SaleService.create_sale(
        user_id=seed_admin.id,
        session_id=seed_open_session.id,
        items=[
            {
                "product_id": seed_product_for_sale.id,
                "quantity": 2,
                "unit_price": "149.90",
                "tax_rate": "16.00",
            }
        ],
        payments=[{"method": "efectivo", "amount": "347.77"}],
    )


def test_format_sale_ticket_includes_key_sale_details(
    db, seed_admin, seed_open_session, seed_product_for_sale
):
    from app.services.printer_service import PrinterService

    sale = _create_sale(db, seed_admin, seed_open_session, seed_product_for_sale)

    ticket = PrinterService.format_sale_ticket(sale)

    assert "POS Local" in ticket
    assert sale.folio in ticket
    assert "Martillo" in ticket
    assert "Subtotal" in ticket
    assert "IVA" in ticket
    assert "TOTAL" in ticket
    assert "EFECTIVO" in ticket


def test_format_price_label_includes_price_and_barcode(db, seed_product_for_sale):
    from app.services.printer_service import PrinterService

    seed_product_for_sale.barcode = "750100000001"
    db.session.flush()

    label = PrinterService.format_price_label(seed_product_for_sale)

    assert "Martillo" in label
    assert "POS-001" in label
    assert "$149.90" in label
    assert "CODIGO 750100000001" in label
    assert "750100000001" in label
    assert "\x1dkI" in label
    assert "{B750100000001" in label


def test_format_price_label_falls_back_to_sku_barcode(db, seed_product_for_sale):
    from app.services.printer_service import PrinterService

    seed_product_for_sale.barcode = None
    db.session.flush()

    label = PrinterService.format_price_label(seed_product_for_sale)

    assert "CODIGO POS-001" in label
    assert "{BPOS-001" in label


def test_send_to_printer_writes_cp437_bytes(tmp_path):
    from app.services.printer_service import PrinterService

    output_path = tmp_path / "ticket.prn"

    sent = PrinterService.send_to_printer("POS Local\nTOTAL $10.00\n", output_path)

    assert sent is True
    assert output_path.read_bytes().startswith(b"\x1b@")
    assert output_path.read_bytes().endswith(b"\n\x1di")


def test_admin_can_preview_sale_ticket(
    client, admin_token, db, seed_admin, seed_open_session, seed_product_for_sale
):
    sale = _create_sale(db, seed_admin, seed_open_session, seed_product_for_sale)

    response = client.post(
        f"/api/printing/sales/{sale.id}/ticket",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"send": False},
    )

    assert response.status_code == 200
    data = response.get_json()
    assert data["sent"] is False
    assert data["sale_id"] == sale.id
    assert sale.folio in data["content"]


def test_admin_can_preview_product_label(client, admin_token, db, seed_product_for_sale):
    seed_product_for_sale.barcode = "750100000001"
    db.session.flush()

    response = client.post(
        f"/api/printing/products/{seed_product_for_sale.id}/label",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"send": False},
    )

    assert response.status_code == 200
    data = response.get_json()
    assert data["sent"] is False
    assert data["product_id"] == seed_product_for_sale.id
    assert "750100000001" in data["content"]


def test_printer_path_del_cliente_se_ignora(
    client, regular_user_token, db, seed_admin, seed_open_session, seed_product_for_sale, tmp_path
):
    sale = _create_sale(db, seed_admin, seed_open_session, seed_product_for_sale)
    pwn_file = tmp_path / "pwn.txt"

    response = client.post(
        f"/api/printing/sales/{sale.id}/ticket",
        headers={"Authorization": f"Bearer {regular_user_token}"},
        json={"send": True, "printer_path": str(pwn_file)},
    )

    assert not pwn_file.exists()


def test_impresora_no_disponible_da_503(
    client, regular_user_token, db, seed_admin, seed_open_session, seed_product_for_sale, monkeypatch, tmp_path
):
    sale = _create_sale(db, seed_admin, seed_open_session, seed_product_for_sale)
    non_existent_target = tmp_path / "carpeta_inexistente" / "impresora.prn"
    monkeypatch.setenv("PRINTER_DEVICE_PATH", str(non_existent_target))

    response = client.post(
        f"/api/printing/sales/{sale.id}/ticket",
        headers={"Authorization": f"Bearer {regular_user_token}"},
        json={"send": True},
    )

    assert response.status_code == 503
    assert "Impresora no disponible" in response.get_json().get("error", "")


def test_send_to_printer_rechaza_rutas_unc_y_relativas():
    import pytest
    from app.services.printer_service import PrinterService

    with pytest.raises(ValueError):
        PrinterService.send_to_printer("test", r"\\servidor\impresora")

    with pytest.raises(ValueError):
        PrinterService.send_to_printer("test", "archivo_relativo.txt")

