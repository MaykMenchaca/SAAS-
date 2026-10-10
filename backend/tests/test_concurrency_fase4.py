"""Concurrencia: sesión única por caja y bloqueos (Subfase 4.6, H-31).

Las pruebas de carrera usan dos hilos, cada uno con su propio app context (y por lo tanto su
propia sesión y conexión de BD), e inyectan una pausa para que ambos lean el mismo estado
antes de que el primero confirme. Sin `with_for_update()` las dos operaciones pasan.
"""
import threading
import time
from decimal import Decimal

import pytest
from sqlalchemy.exc import IntegrityError


def _en_hilo(app, fn, resultados, clave):
    def run():
        with app.app_context():
            from app.extensions import db

            try:
                resultados[clave] = fn()
            except Exception as exc:  # noqa: BLE001 - el test inspecciona la excepción
                resultados[clave] = exc
            finally:
                db.session.remove()

    return threading.Thread(target=run)


@pytest.fixture
def producto(db):
    from app.models.inventory import Stock
    from app.models.product import Product, UnitOfMeasure

    unit = UnitOfMeasure(name="Pieza", abbreviation="pz")
    db.session.add(unit)
    db.session.flush()
    product = Product(
        sku="CC-001", name="Martillo", unit_id=unit.id,
        sale_price=Decimal("100.00"), avg_cost=Decimal("10.00"), tax_rate=Decimal("16.00"),
    )
    db.session.add(product)
    db.session.flush()
    db.session.add(Stock(product_id=product.id, quantity=Decimal("3")))
    db.session.flush()
    return product


def test_no_abre_dos_sesiones_misma_caja(db, seed_admin, seed_cash_register):
    from app.models.sale import CashRegisterSession

    for _ in range(2):
        db.session.add(CashRegisterSession(
            cash_register_id=seed_cash_register.id, user_id=seed_admin.id,
            opening_amount=Decimal("0"), status="abierta",
        ))
    with pytest.raises(IntegrityError):
        db.session.flush()
    db.session.rollback()


def test_caja_cerrada_permite_nueva_sesion(db, seed_admin, seed_cash_register):
    from app.models.sale import CashRegisterSession

    db.session.add(CashRegisterSession(
        cash_register_id=seed_cash_register.id, user_id=seed_admin.id,
        opening_amount=Decimal("0"), status="cerrada",
    ))
    db.session.add(CashRegisterSession(
        cash_register_id=seed_cash_register.id, user_id=seed_admin.id,
        opening_amount=Decimal("0"), status="abierta",
    ))
    db.session.flush()


def test_abrir_caja_con_carrera_responde_400(client, admin_token, db, seed_admin, seed_cash_register, monkeypatch):
    """Si dos aperturas pasan la verificación previa a la vez, el índice único decide."""
    from app.models.sale import CashRegisterSession

    db.session.add(CashRegisterSession(
        cash_register_id=seed_cash_register.id, user_id=seed_admin.id,
        opening_amount=Decimal("0"), status="abierta",
    ))
    db.session.commit()

    # Simula que la verificación previa no vio la sesión abierta (otra petición la creó entre medio)
    from app.api import cash_register as api

    monkeypatch.setattr(api, "_find_open_session", lambda register_id: None)
    response = client.post(
        "/api/cash-register/open",
        json={"cash_register_id": seed_cash_register.id, "opening_amount": "100.00"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 400
    assert "sesión abierta" in response.get_json()["error"]


def test_recepcion_no_excede_pendiente(flask_app, db, seed_admin, producto, monkeypatch):
    from app.models.inventory import Stock
    from app.models.purchase import PurchaseOrderItem
    from app.services import purchase_order_service as pos_module
    from app.services.purchase_order_service import PurchaseOrderService

    order = PurchaseOrderService.create_order(
        user_id=seed_admin.id, supplier_id=None,
        items=[{"product_id": producto.id, "quantity": "10", "unit_cost": "10.00"}],
    )
    PurchaseOrderService.send_order(order.id)
    db.session.commit()
    order_id, item_id, admin_id, product_id = order.id, order.items[0].id, seed_admin.id, producto.id

    original = pos_module.InventoryService.move_stock

    def lento(*args, **kwargs):
        time.sleep(0.5)
        return original(*args, **kwargs)

    monkeypatch.setattr(pos_module.InventoryService, "move_stock", staticmethod(lento))

    def recibir():
        return PurchaseOrderService.receive_order(
            order_id, admin_id, [{"order_item_id": item_id, "received_quantity": "10"}]
        )

    resultados = {}
    hilos = [_en_hilo(flask_app, recibir, resultados, i) for i in range(2)]
    hilos[0].start()
    time.sleep(0.15)
    hilos[1].start()
    for h in hilos:
        h.join(timeout=15)

    errores = [r for r in resultados.values() if isinstance(r, Exception)]
    assert len(errores) == 1, resultados
    assert isinstance(errores[0], ValueError)

    db.session.remove()
    assert db.session.get(PurchaseOrderItem, item_id).received_quantity == Decimal("10")
    assert Stock.query.filter_by(product_id=product_id).one().quantity == Decimal("13")


def test_venta_durante_cierre_de_caja_se_rechaza(
    flask_app, client, admin_token, db, seed_admin, seed_open_session, producto, monkeypatch
):
    from app.models.sale import CashRegisterSession, Sale
    from app.services import audit_service
    from app.services.sale_service import SaleService

    db.session.commit()
    session_id, admin_id, product_id = seed_open_session.id, seed_admin.id, producto.id

    original = audit_service.log_action

    def log_lento(*args, **kwargs):
        if kwargs.get("action") == "close":
            time.sleep(0.6)
        return original(*args, **kwargs)

    monkeypatch.setattr(audit_service, "log_action", log_lento)

    def cerrar():
        return flask_app.test_client().post(
            f"/api/cash-register/{session_id}/close",
            json={"closing_amount": "1000.00"},
            headers={"Authorization": f"Bearer {admin_token}"},
        ).status_code

    def vender():
        return SaleService.create_sale(
            user_id=admin_id, session_id=session_id,
            items=[{"product_id": product_id, "quantity": 1}],
            payments=[{"method": "efectivo", "amount": "116.00"}],
        ).id

    resultados = {}
    hilo_cierre = _en_hilo(flask_app, cerrar, resultados, "cierre")
    hilo_venta = _en_hilo(flask_app, vender, resultados, "venta")
    hilo_cierre.start()
    time.sleep(0.2)
    hilo_venta.start()
    hilo_cierre.join(timeout=15)
    hilo_venta.join(timeout=15)

    assert resultados["cierre"] == 200
    assert isinstance(resultados["venta"], ValueError), resultados
    db.session.remove()
    assert Sale.query.filter_by(session_id=session_id).count() == 0
    assert db.session.get(CashRegisterSession, session_id).expected_cash == Decimal("1000.00")


def test_avg_cost_con_cuatro_decimales(db, seed_admin, producto):
    from app.models.product import Product
    from app.services.purchase_order_service import PurchaseOrderService

    order = PurchaseOrderService.create_order(
        user_id=seed_admin.id, supplier_id=None,
        items=[{"product_id": producto.id, "quantity": "7", "unit_cost": "10.01"}],
    )
    PurchaseOrderService.send_order(order.id)
    product_id = producto.id
    PurchaseOrderService.receive_order(
        order.id, seed_admin.id, [{"order_item_id": order.items[0].id, "received_quantity": "7"}]
    )
    db.session.remove()
    # (3 × 10.00 + 7 × 10.01) / 10 = 10.007: con 2 decimales se perdía en cada recepción
    assert db.session.get(Product, product_id).avg_cost == Decimal("10.0070")
