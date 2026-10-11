"""Hallazgos nuevos de las fases 4 (Subfase 4.14): fechas 400, inactivos con stock, cost_at_sale,
orden de bloqueo del stock (OPS-09), client_uuid concurrente (OPS-10) e impresora colgada (OPS-12)."""
import threading
import time
from decimal import Decimal
from pathlib import Path

import pytest


def _en_hilo(app, fn, resultados, clave):
    def run():
        with app.app_context():
            from app.extensions import db

            try:
                resultados[clave] = fn()
            except Exception as exc:  # noqa: BLE001
                resultados[clave] = exc
            finally:
                db.session.remove()

    return threading.Thread(target=run)


@pytest.fixture
def dos_productos(db):
    from app.models.inventory import Stock
    from app.models.product import Product, UnitOfMeasure

    unit = UnitOfMeasure(name="Pieza", abbreviation="pz")
    db.session.add(unit)
    db.session.flush()
    productos = []
    for sku in ("A-001", "B-001"):
        p = Product(sku=sku, name=f"Producto {sku}", unit_id=unit.id, sale_price=Decimal("10.00"),
                    avg_cost=Decimal("4.1234"), tax_rate=Decimal("16.00"))
        db.session.add(p)
        db.session.flush()
        db.session.add(Stock(product_id=p.id, quantity=Decimal("50")))
        productos.append(p)
    db.session.flush()
    return productos


# ── Fechas inválidas → 400 (H-32) ──────────────────────────────────────────

@pytest.mark.parametrize(
    "url",
    [
        "/api/reports/sales?from=2026-13-40",
        "/api/reports/top-products?to=ayer",
        "/api/reports/gross-margin?from=2026-02-30",
        "/api/audit/?from=no-es-fecha",
    ],
)
def test_fecha_invalida_400(client, admin_token, url):
    response = client.get(url, headers={"Authorization": f"Bearer {admin_token}"})
    assert response.status_code == 400
    assert "Fecha inválida" in response.get_json()["error"]


# ── Inactivos con existencias siguen en inventario (H-43) ──────────────────

def test_inactivo_con_existencias_aparece_en_inventario_y_valuacion(client, admin_token, db, dos_productos):
    inactivo = dos_productos[0]
    inactivo.is_active = False
    db.session.commit()
    headers = {"Authorization": f"Bearer {admin_token}"}

    stock = client.get("/api/inventory/stock", headers=headers).get_json()["items"]
    fila = next(s for s in stock if s["product_id"] == inactivo.id)
    assert fila["is_active"] is False

    valuacion = client.get("/api/reports/inventory-valuation", headers=headers).get_json()
    assert inactivo.id in [i["product_id"] for i in valuacion["items"]]


def test_inactivo_sin_existencias_no_aparece(client, admin_token, db, dos_productos):
    from app.models.inventory import Stock

    inactivo = dos_productos[0]
    inactivo.is_active = False
    Stock.query.filter_by(product_id=inactivo.id).one().quantity = Decimal("0")
    db.session.commit()

    stock = client.get("/api/inventory/stock", headers={"Authorization": f"Bearer {admin_token}"}).get_json()["items"]
    assert inactivo.id not in [s["product_id"] for s in stock]


# ── cost_at_sale con 4 decimales ───────────────────────────────────────────

def test_cost_at_sale_conserva_cuatro_decimales(db, seed_admin, seed_open_session, dos_productos):
    from app.models.sale import SaleItem
    from app.services.sale_service import SaleService

    sale = SaleService.create_sale(
        user_id=seed_admin.id, session_id=seed_open_session.id,
        items=[{"product_id": dos_productos[0].id, "quantity": 1}],
        payments=[{"method": "efectivo", "amount": "11.60"}],
    )
    item_id = sale.items[0].id
    db.session.remove()
    assert db.session.get(SaleItem, item_id).cost_at_sale == Decimal("4.1234")


# ── OPS-09: dos ventas con productos en orden inverso no se bloquean ──────

def test_ventas_con_productos_en_orden_inverso_no_hacen_deadlock(
    flask_app, db, seed_admin, seed_open_session, dos_productos, monkeypatch
):
    from app.models.sale import CashRegister, CashRegisterSession, Sale
    from app.services import inventory_service
    from app.services.sale_service import SaleService

    # Dos cajas distintas: el bloqueo de la sesión (4.6) no las serializa
    caja2 = CashRegister(name="Caja 2")
    db.session.add(caja2)
    db.session.flush()
    sesion2 = CashRegisterSession(cash_register_id=caja2.id, user_id=seed_admin.id,
                                  opening_amount=Decimal("0"), status="abierta")
    db.session.add(sesion2)
    db.session.flush()
    a, b = (p.id for p in dos_productos)
    sesiones = {"ab": seed_open_session.id, "ba": sesion2.id}
    admin_id = seed_admin.id
    db.session.commit()

    original = inventory_service.InventoryService.move_stock

    def lento(*args, **kwargs):
        result = original(*args, **kwargs)
        time.sleep(0.4)  # mantiene el primer bloqueo mientras el otro hilo pide el segundo
        return result

    monkeypatch.setattr(inventory_service.InventoryService, "move_stock", staticmethod(lento))

    def vender(orden):
        return SaleService.create_sale(
            user_id=admin_id, session_id=sesiones["ab" if orden == [a, b] else "ba"],
            items=[{"product_id": pid, "quantity": 1} for pid in orden],
            payments=[{"method": "efectivo", "amount": "23.20"}],
        ).id

    resultados = {}
    hilos = [
        _en_hilo(flask_app, lambda: vender([a, b]), resultados, "ab"),
        _en_hilo(flask_app, lambda: vender([b, a]), resultados, "ba"),
    ]
    for h in hilos:
        h.start()
    for h in hilos:
        h.join(timeout=20)

    assert not any(isinstance(r, Exception) for r in resultados.values()), resultados
    db.session.remove()
    assert Sale.query.count() == 2


def test_deadlock_responde_409_reintentable(client, admin_token, seed_open_session, dos_productos, monkeypatch):
    from psycopg2.errors import DeadlockDetected
    from sqlalchemy.exc import OperationalError

    from app.services import sale_service

    def deadlock(**kwargs):
        raise OperationalError("UPDATE stock", {}, DeadlockDetected("deadlock detected"))

    monkeypatch.setattr(sale_service.SaleService, "create_sale", staticmethod(deadlock))
    response = client.post(
        "/api/sales/", headers={"Authorization": f"Bearer {admin_token}"},
        json={"session_id": seed_open_session.id, "items": [{"product_id": dos_productos[0].id, "quantity": 1}],
              "payments": [{"method": "efectivo", "amount": "11.60"}]},
    )
    assert response.status_code == 409
    assert "intenta de nuevo" in response.get_json()["error"]


# ── OPS-10: dos envíos simultáneos con el mismo client_uuid ────────────────

def test_mismo_client_uuid_en_paralelo_crea_una_sola_venta(
    flask_app, db, seed_admin, seed_open_session, dos_productos, monkeypatch
):
    from app.models.sale import Sale
    from app.services import inventory_service
    from app.services.sale_service import SaleService

    session_id, admin_id, pid = seed_open_session.id, seed_admin.id, dos_productos[0].id
    db.session.commit()
    original = inventory_service.InventoryService.move_stock

    def lento(*args, **kwargs):
        time.sleep(0.4)
        return original(*args, **kwargs)

    monkeypatch.setattr(inventory_service.InventoryService, "move_stock", staticmethod(lento))

    def vender():
        return SaleService.create_sale(
            user_id=admin_id, session_id=session_id, client_uuid="aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
            items=[{"product_id": pid, "quantity": 1}],
            payments=[{"method": "efectivo", "amount": "11.60"}],
        ).id

    resultados = {}
    hilos = [_en_hilo(flask_app, vender, resultados, i) for i in range(2)]
    hilos[0].start()
    time.sleep(0.1)
    hilos[1].start()
    for h in hilos:
        h.join(timeout=20)

    assert not any(isinstance(r, Exception) for r in resultados.values()), resultados
    assert resultados[0] == resultados[1]
    db.session.remove()
    assert Sale.query.count() == 1


# ── OPS-12: impresora del servidor colgada ─────────────────────────────────

def test_impresora_colgada_no_acumula_escrituras(tmp_path, monkeypatch):
    from app.services.printer_service import PrinterService

    liberar = threading.Event()
    llamadas = []

    def colgada(self, data):
        llamadas.append(data)
        liberar.wait(5)

    monkeypatch.setattr(PrinterService, "WRITE_TIMEOUT", 0.2)
    monkeypatch.setattr(Path, "write_bytes", colgada)
    destino = tmp_path / "impresora.prn"
    try:
        with pytest.raises(RuntimeError, match="tiempo de espera"):
            PrinterService.send_to_printer("x", destino)
        # Mientras la escritura anterior siga colgada, no se lanza otra (no se acumulan pulsos de cajón)
        with pytest.raises(RuntimeError, match="anterior"):
            PrinterService.send_to_printer("y", destino)
        assert len(llamadas) == 1
    finally:
        liberar.set()
