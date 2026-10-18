"""Suite de regresión de dinero e inventario — Fase 1 (Subfase 1.8).

Cubre los 7 escenarios críticos de integridad monetaria y control de stock:
1. Precio manipulado por el cliente ignorado (catálogo autoritativo).
2. Devolución duplicada / sobre-devolución bloqueada y agrupada.
3. Cancelación de venta rechazada si tiene devoluciones registradas.
4. Corte de caja con devoluciones (QA-08: diferencia exacta $0.00).
5. Sobrepago no-efectivo rechazado y cambio calculado autoritativamente en servidor.
6. Doble envío con mismo client_uuid es idempotente (no duplica stock ni cobros).
7. Conteo físico aplica ajuste por diferencia respetando ventas intermedias (H-20).
"""
import uuid
from decimal import Decimal
import pytest


class TestMoneyAndInventoryRegression:
    """Escenarios completos de regresión de dinero e inventario."""

    def test_1_precio_manipulado_ignorado_usa_autoritativo(
        self, client, admin_token, seed_open_session, seed_product_for_sale
    ):
        """1. El cliente no puede imponer precios o impuestos distintos al catálogo."""
        # Producto cuesta 100.00 + 16% IVA = 116.00
        # Cliente intenta pagar enviando precio unitario de 0.01 y tasa 0
        resp_tampered = client.post(
            "/api/sales/",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "session_id": seed_open_session.id,
                "items": [
                    {
                        "product_id": seed_product_for_sale.id,
                        "quantity": 1,
                        "unit_price": "0.01",
                        "tax_rate": "0.00",
                    }
                ],
                "payments": [{"method": "efectivo", "amount": "0.01"}],
            },
        )
        # Debe fallar porque el total autoritativo es 116.00 y solo pagó 0.01
        assert resp_tampered.status_code == 400
        assert "Pago insuficiente" in resp_tampered.get_json()["error"]

        # Cuando paga los 116.00 reales, la venta se crea con los valores autoritativos
        resp_valid = client.post(
            "/api/sales/",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "session_id": seed_open_session.id,
                "items": [
                    {
                        "product_id": seed_product_for_sale.id,
                        "quantity": 1,
                        "unit_price": "0.01",  # Se ignora
                    }
                ],
                "payments": [{"method": "efectivo", "amount": "116.00"}],
            },
        )
        assert resp_valid.status_code == 201
        data = resp_valid.get_json()
        assert data["total"] == "116.00"
        item = data["items"][0]
        assert item["unit_price"] == "100.00"
        assert item["tax_rate"] == "16.00"

    def test_2_devolucion_duplicada_agrupada_y_rechazo_sobredevolucion(
        self, client, admin_token, seed_open_session, seed_product_for_sale
    ):
        """2. Prevenir devolver más piezas de las vendidas o enviar líneas duplicadas."""
        # Venta de 2 piezas
        resp_sale = client.post(
            "/api/sales/",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "session_id": seed_open_session.id,
                "items": [{"product_id": seed_product_for_sale.id, "quantity": 2}],
                "payments": [{"method": "efectivo", "amount": "232.00"}],
            },
        )
        assert resp_sale.status_code == 201
        sale_data = resp_sale.get_json()
        sale_id = sale_data["id"]
        sale_item_id = sale_data["items"][0]["id"]

        # Intento de devolver líneas duplicadas que en conjunto superan la cantidad (1.5 + 1.0 = 2.5 > 2.0)
        resp_dup = client.post(
            f"/api/sales/{sale_id}/return",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "reason": "Intento de sobre-devolución",
                "session_id": seed_open_session.id,
                "items": [
                    # Piezas enteras: 2 + 1 = 3 de 2 vendidas (media pieza ya se rechaza por RF-02)
                    {"sale_item_id": sale_item_id, "quantity": "2"},
                    {"sale_item_id": sale_item_id, "quantity": "1"},
                ],
            },
        )
        assert resp_dup.status_code == 400
        assert "excede lo disponible" in resp_dup.get_json()["error"]

        # Devolución válida de 1 pieza
        resp_ret1 = client.post(
            f"/api/sales/{sale_id}/return",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "reason": "Devolución legítima parcial",
                "session_id": seed_open_session.id,
                "items": [{"sale_item_id": sale_item_id, "quantity": "1.0"}],
            },
        )
        assert resp_ret1.status_code == 200

        # Segundo intento de devolver 2 piezas más (solo queda 1 disponible)
        resp_ret2 = client.post(
            f"/api/sales/{sale_id}/return",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "reason": "Exceso de devolución",
                "session_id": seed_open_session.id,
                "items": [{"sale_item_id": sale_item_id, "quantity": "2.0"}],
            },
        )
        assert resp_ret2.status_code == 400
        assert "excede lo disponible" in resp_ret2.get_json()["error"]

    def test_3_cancelar_venta_tras_devolucion_rechazado(
        self, client, admin_token, seed_open_session, seed_product_for_sale
    ):
        """3. No se puede cancelar una venta que ya tiene una devolución (evita doble retorno de stock)."""
        resp_sale = client.post(
            "/api/sales/",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "session_id": seed_open_session.id,
                "items": [{"product_id": seed_product_for_sale.id, "quantity": 1}],
                "payments": [{"method": "efectivo", "amount": "116.00"}],
            },
        )
        sale_data = resp_sale.get_json()
        sale_id = sale_data["id"]
        sale_item_id = sale_data["items"][0]["id"]

        # Realizar devolución
        resp_ret = client.post(
            f"/api/sales/{sale_id}/return",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "reason": "Devolución antes de cancelación",
                "session_id": seed_open_session.id,
                "items": [{"sale_item_id": sale_item_id, "quantity": "1"}],
            },
        )
        assert resp_ret.status_code == 200

        # Intentar cancelar la venta
        resp_cancel = client.post(
            f"/api/sales/{sale_id}/cancel",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"reason": "Intento de cancelación ilícita"},
        )
        assert resp_cancel.status_code == 400
        assert "tiene devoluciones" in resp_cancel.get_json()["error"]

    def test_4_corte_de_caja_con_devoluciones_qa08_sobrante_cero(
        self, client, admin_token, seed_cash_register, seed_product_for_sale
    ):
        """4. Escenario QA-08: Corte de caja con venta y devolución en efectivo da sobrante $0.00."""
        # 1. Abrir sesión con $1000.00
        resp_open = client.post(
            "/api/cash-register/open",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "cash_register_id": seed_cash_register.id,
                "opening_amount": "1000.00",
            },
        )
        session_id = resp_open.get_json()["id"]

        # 2. Venta en efectivo por $116.00
        resp_sale = client.post(
            "/api/sales/",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "session_id": session_id,
                "items": [{"product_id": seed_product_for_sale.id, "quantity": 1}],
                "payments": [{"method": "efectivo", "amount": "116.00"}],
            },
        )
        sale_data = resp_sale.get_json()
        sale_id = sale_data["id"]
        sale_item_id = sale_data["items"][0]["id"]

        # 3. Devolución con reembolso en efectivo de $116.00
        resp_ret = client.post(
            f"/api/sales/{sale_id}/return",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "reason": "Garantía QA-08",
                "session_id": session_id,
                "refund_method": "efectivo",
                "items": [{"sale_item_id": sale_item_id, "quantity": "1"}],
            },
        )
        assert resp_ret.status_code == 200

        # 4. Cerrar caja declarando los $1000.00 físicos reales (1000 + 116 - 116 = 1000)
        resp_close = client.post(
            f"/api/cash-register/{session_id}/close",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"closing_amount": "1000.00"},
        )
        assert resp_close.status_code == 200
        data_close = resp_close.get_json()
        assert Decimal(data_close["expected_cash"]) == Decimal("1000.00")
        assert Decimal(data_close["difference"]) == Decimal("0.00")

    def test_5_sobrepago_no_efectivo_rechazado_y_cambio_autoritativo_servidor(
        self, client, admin_token, seed_open_session, seed_product_for_sale
    ):
        """5. Sobrepago con tarjeta rechazado; cambio en efectivo calculado autoritativamente."""
        # Total a pagar = 116.00. Intento de pagar 150.00 con tarjeta
        resp_card_over = client.post(
            "/api/sales/",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "session_id": seed_open_session.id,
                "items": [{"product_id": seed_product_for_sale.id, "quantity": 1}],
                "payments": [{"method": "tarjeta", "amount": "150.00"}],
            },
        )
        assert resp_card_over.status_code == 400
        assert "No se permite sobrepago" in resp_card_over.get_json()["error"]

        # Pago en efectivo con $200.00 y cliente enviando change_amount fraudulento de 999.00
        resp_cash = client.post(
            "/api/sales/",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "session_id": seed_open_session.id,
                "items": [{"product_id": seed_product_for_sale.id, "quantity": 1}],
                "payments": [{"method": "efectivo", "amount": "200.00"}],
                "change_amount": "999.00",
            },
        )
        assert resp_cash.status_code == 201
        data_cash = resp_cash.get_json()
        # El cambio debe ser exactamente 200.00 - 116.00 = 84.00 en el pago en efectivo
        assert len(data_cash["payments"]) == 1
        assert data_cash["payments"][0]["change_amount"] == "84.00"

    def test_6_doble_envio_mismo_client_uuid_idempotente(
        self, client, admin_token, db, seed_open_session, seed_product_for_sale
    ):
        """6. Reintento con mismo client_uuid devuelve venta existente sin duplicar deducciones."""
        from app.models.inventory import Stock

        client_uuid = str(uuid.uuid4())
        stock_init = Stock.query.filter_by(product_id=seed_product_for_sale.id).first().quantity

        # Primer envío
        payload = {
            "client_uuid": client_uuid,
            "session_id": seed_open_session.id,
            "items": [{"product_id": seed_product_for_sale.id, "quantity": 1}],
            "payments": [{"method": "efectivo", "amount": "116.00"}],
        }
        resp1 = client.post(
            "/api/sales/",
            headers={"Authorization": f"Bearer {admin_token}"},
            json=payload,
        )
        assert resp1.status_code == 201
        sale1 = resp1.get_json()

        # Stock bajó 1 unidad
        stock_after_1 = Stock.query.filter_by(product_id=seed_product_for_sale.id).first().quantity
        assert stock_after_1 == stock_init - Decimal("1.000")

        # Segundo envío con exactamente el mismo client_uuid
        resp2 = client.post(
            "/api/sales/",
            headers={"Authorization": f"Bearer {admin_token}"},
            json=payload,
        )
        assert resp2.status_code in (200, 201)
        sale2 = resp2.get_json()
        assert sale2["id"] == sale1["id"]
        assert sale2["folio"] == sale1["folio"]

        # Stock no se redujo nuevamente
        stock_after_2 = Stock.query.filter_by(product_id=seed_product_for_sale.id).first().quantity
        assert stock_after_2 == stock_after_1

    def test_7_conteo_fisico_con_ventas_intermedias_ajuste_por_diferencia(
        self, client, admin_token, db, seed_admin, seed_product_for_sale
    ):
        """7. Conteo físico aplica delta respetando ventas intermedias."""
        from app.models.inventory import Stock
        from app.services.inventory_service import InventoryService

        p = seed_product_for_sale  # stock = 100.000

        # Iniciar conteo (esperado = 100.000)
        resp_count = client.post(
            "/api/inventory/counts",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"notes": "Auditoría H-20"},
        )
        count_id = resp_count.get_json()["id"]

        # Capturar conteo físico: 95.000 (diferencia = -5.000)
        client.patch(
            f"/api/inventory/counts/{count_id}/items/{p.id}",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"counted_quantity": "95.000"},
        )

        # Ocurren ventas intermedias: 10 unidades vendidas (stock actual pasa a 90.000)
        InventoryService.move_stock(
            product_id=p.id,
            quantity=Decimal("10.000"),
            movement_type="salida",
            reference_type="venta",
            reference_id=888,
            user_id=seed_admin.id,
            notes="Venta intermedia durante conteo",
        )
        db.session.commit()

        # Cerrar el conteo
        resp_close = client.post(
            f"/api/inventory/counts/{count_id}/close",
            headers={"Authorization": f"Bearer {admin_token}"},
        )
        assert resp_close.status_code == 200

        # Stock final debe ser 90.000 + (-5.000) = 85.000 (no reseteado a 95.000)
        stock_final = Stock.query.filter_by(product_id=p.id).first()
        assert stock_final.quantity == Decimal("85.000")
