"""Revisión funcional 2026-10, carril Q (fase 4, hallazgos bajos): productos, inventario y compras.

RF-29 (conteo/OC inexistente → 404), RF-32 (cierre de conteo con stock negativo; captura anulada por un ajuste
manual), RF-33 (el movimiento de ajuste guarda el cambio), RF-34 (nombres en blanco), RF-35 (búsqueda con
comodines y con errores de dedo en stock), RF-36 (recapturar conserva la nota), RF-37 (RFC), RF-38 (detalles de
OC), RF-39 (auditoría sin ruido y con stock/costo previos) y RF-40 (precios con más de 2 decimales).
"""
import json
from decimal import Decimal
from types import SimpleNamespace

import pytest


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def pieza(db):
    from app.models.product import UnitOfMeasure

    unit = UnitOfMeasure(name="Pieza", abbreviation="pz", allows_fractions=False)
    db.session.add(unit)
    db.session.commit()
    return unit


@pytest.fixture
def kilo(db):
    from app.models.product import UnitOfMeasure

    unit = UnitOfMeasure(name="Kilogramo", abbreviation="kg", allows_fractions=True)
    db.session.add(unit)
    db.session.commit()
    return unit


def _producto(db, unidad, sku, name=None, stock="0", activo=True, purchase_price="0.00"):
    from app.models.inventory import Stock
    from app.models.product import Product

    p = Product(sku=sku, name=name or f"Producto {sku}", unit_id=unidad.id, sale_price=Decimal("10.00"),
                tax_rate=Decimal("16.00"), is_active=activo, purchase_price=Decimal(purchase_price),
                avg_cost=Decimal(purchase_price))
    db.session.add(p)
    db.session.flush()
    db.session.add(Stock(product_id=p.id, quantity=Decimal(stock)))
    db.session.commit()
    # Valores simples: el cliente de pruebas cierra la sesión entre peticiones
    return SimpleNamespace(id=p.id, name=p.name)


def _stock(db, product_id):
    from app.models.inventory import Stock

    db.session.expire_all()
    return Stock.query.filter_by(product_id=product_id).first().quantity


def _salida(db, product_id, qty):
    from app.models.user import User
    from app.services.inventory_service import InventoryService

    InventoryService.move_stock(product_id=product_id, quantity=Decimal(qty), movement_type="salida",
                                reference_type="venta", reference_id=1, user_id=User.query.first().id)
    db.session.commit()


def _conteo(client, token):
    resp = client.post("/api/inventory/counts", json={}, headers=_auth(token))
    assert resp.status_code == 201, resp.get_json()
    return resp.get_json()["id"]


def _capturar(client, token, count_id, product_id, qty, **extra):
    return client.patch(f"/api/inventory/counts/{count_id}/items/{product_id}",
                        json={"counted_quantity": str(qty), **extra}, headers=_auth(token))


def _ajustar(client, token, product_id, qty, reason="error_captura"):
    return client.post("/api/inventory/adjust", json={"product_id": product_id, "quantity": str(qty), "reason": reason},
                       headers=_auth(token))


def _proveedor(client, token, **extra):
    body = {"name": "Aceros del Norte", **extra}
    return client.post("/api/purchases/suppliers", json=body, headers=_auth(token))


def _oc(client, token, product_id, qty="2", cost="10.00", **extra):
    body = {"items": [{"product_id": product_id, "quantity": qty, "unit_cost": cost}], **extra}
    return client.post("/api/purchases/orders", json=body, headers=_auth(token))


def _logs(entity_type, entity_id, action=None):
    from app.models.audit import AuditLog

    query = AuditLog.query.filter_by(entity_type=entity_type, entity_id=entity_id)
    if action:
        query = query.filter_by(action=action)
    return query.order_by(AuditLog.id).all()


def _details(log):
    return log.details if isinstance(log.details, dict) else json.loads(log.details)


# --- RF-29: un conteo o una OC inexistente responde 404 ---


@pytest.mark.parametrize("metodo,ruta,body", [
    ("patch", "/api/inventory/counts/99999/items/1", {"counted_quantity": "1"}),
    ("post", "/api/inventory/counts/99999/close", None),
    ("post", "/api/inventory/counts/99999/cancel", None),
])
def test_rf29_conteo_inexistente_responde_404(client, admin_token, db, metodo, ruta, body):
    resp = getattr(client, metodo)(ruta, json=body, headers=_auth(admin_token))
    assert resp.status_code == 404
    assert resp.get_json()["error"] == "Conteo no encontrado"


@pytest.mark.parametrize("ruta,body", [
    ("/api/purchases/orders/99999/send", None),
    ("/api/purchases/orders/99999/cancel", None),
    ("/api/purchases/orders/99999/close", {}),
    ("/api/purchases/orders/99999/receive", {"items": [{"order_item_id": 1, "received_quantity": "1"}]}),
])
def test_rf29_oc_inexistente_responde_404(client, admin_token, db, ruta, body):
    resp = client.post(ruta, json=body, headers=_auth(admin_token))
    assert resp.status_code == 404
    assert resp.get_json()["error"] == "Orden de compra no encontrada"


def test_rf29_un_conteo_cerrado_sigue_en_400(client, admin_token, db, pieza):
    _producto(db, pieza, "P-1", stock="3")
    count_id = _conteo(client, admin_token)
    client.post(f"/api/inventory/counts/{count_id}/cancel", headers=_auth(admin_token))
    resp = client.post(f"/api/inventory/counts/{count_id}/close", headers=_auth(admin_token))
    assert resp.status_code == 400


# --- RF-32: cierre de conteo con stock negativo y captura anulada por un ajuste manual ---


def test_rf32_cierre_que_dejaria_stock_negativo_dice_que_producto(client, admin_token, db, pieza):
    p = _producto(db, pieza, "P-17", name="Taladro rojo", stock="5")
    count_id = _conteo(client, admin_token)
    assert _capturar(client, admin_token, count_id, p.id, 0).status_code == 200  # diferencia −5
    _salida(db, p.id, "3")  # una venta deja el stock en 2: aplicar −5 daría −3

    resp = client.post(f"/api/inventory/counts/{count_id}/close", headers=_auth(admin_token))
    assert resp.status_code == 409
    body = resp.get_json()
    assert body["code"] == "count_negative_stock"
    assert "Taladro rojo" in body["error"]
    assert body["product_id"] == p.id
    # Nada se aplicó y el conteo sigue abierto
    assert _stock(db, p.id) == Decimal("2")
    detalle = client.get(f"/api/inventory/counts/{count_id}", headers=_auth(admin_token)).get_json()
    assert detalle["status"] == "en_proceso"


def test_rf32_un_ajuste_manual_despues_de_capturar_anula_la_captura(client, admin_token, db, pieza):
    # QA-B-13: contado 8 con sistema en 10, luego ajuste absoluto a 7; antes cerraba en 5 (7 − 2)
    p = _producto(db, pieza, "P-16", stock="10")
    count_id = _conteo(client, admin_token)
    assert _capturar(client, admin_token, count_id, p.id, 8, notes="caja abierta").status_code == 200
    resp = _ajustar(client, admin_token, p.id, 7)
    assert resp.status_code == 200
    assert resp.get_json()["count_capture_reset"] == count_id

    item = [i for i in client.get(f"/api/inventory/counts/{count_id}", headers=_auth(admin_token)).get_json()["items"]
            if i["product_id"] == p.id][0]
    assert item["counted_quantity"] is None
    assert item["difference"] is None
    assert "caja abierta" in item["notes"]
    assert "ajuste manual" in item["notes"]

    assert client.post(f"/api/inventory/counts/{count_id}/close", headers=_auth(admin_token)).status_code == 200
    assert _stock(db, p.id) == Decimal("7")


def test_rf32_recapturar_despues_del_ajuste_cuenta_contra_el_stock_nuevo(client, admin_token, db, pieza):
    p = _producto(db, pieza, "P-16", stock="10")
    count_id = _conteo(client, admin_token)
    _capturar(client, admin_token, count_id, p.id, 8)
    _ajustar(client, admin_token, p.id, 7)
    _capturar(client, admin_token, count_id, p.id, 6)
    client.post(f"/api/inventory/counts/{count_id}/close", headers=_auth(admin_token))
    assert _stock(db, p.id) == Decimal("6")


def test_rf32_ventas_despues_de_capturar_siguen_aplicando_la_diferencia(client, admin_token, db, pieza):
    # La diferencia es contra lo esperado AL CAPTURAR: las ventas posteriores ya salieron del stock (BE-103)
    p = _producto(db, pieza, "P-20", stock="10")
    count_id = _conteo(client, admin_token)
    _capturar(client, admin_token, count_id, p.id, 8)  # faltan 2
    _salida(db, p.id, "1")
    client.post(f"/api/inventory/counts/{count_id}/close", headers=_auth(admin_token))
    assert _stock(db, p.id) == Decimal("7")


def test_rf32_el_conteo_incluye_inactivos_con_existencias(client, admin_token, db, pieza):
    # QA-B-21: un inactivo con stock sale en /inventory/stock; sin esto nunca se podía conciliar por conteo
    inactivo = _producto(db, pieza, "INA-1", stock="3", activo=False)
    vacio = _producto(db, pieza, "INA-2", stock="0", activo=False)
    count_id = _conteo(client, admin_token)
    items = client.get(f"/api/inventory/counts/{count_id}", headers=_auth(admin_token)).get_json()["items"]
    ids = {i["product_id"] for i in items}
    assert inactivo.id in ids
    assert vacio.id not in ids


# --- RF-33: el movimiento de ajuste guarda el cambio con signo ---


@pytest.mark.parametrize("antes,despues,cambio", [("1", "20", "19"), ("2.5", "1", "-1.5"), ("4", "4", "0")])
def test_rf33_ajuste_manual_guarda_la_diferencia(client, admin_token, db, kilo, antes, despues, cambio):
    from app.models.inventory import StockMovement

    p = _producto(db, kilo, "K-1", stock=antes)
    assert _ajustar(client, admin_token, p.id, despues).status_code == 200
    m = StockMovement.query.filter_by(product_id=p.id).order_by(StockMovement.id.desc()).first()
    assert m.movement_type == "ajuste"
    assert m.quantity == Decimal(cambio)
    assert m.previous_stock == Decimal(antes)
    assert m.new_stock == Decimal(despues)
    movs = client.get(f"/api/inventory/movements/{p.id}", headers=_auth(admin_token)).get_json()
    assert Decimal(movs[0]["quantity"]) == Decimal(cambio)


def test_rf33_ajuste_por_conteo_guarda_la_diferencia_con_signo(client, admin_token, db, pieza):
    from app.models.inventory import StockMovement

    p = _producto(db, pieza, "P-1", stock="9")
    count_id = _conteo(client, admin_token)
    _capturar(client, admin_token, count_id, p.id, 4)
    client.post(f"/api/inventory/counts/{count_id}/close", headers=_auth(admin_token))
    m = StockMovement.query.filter_by(product_id=p.id, reference_type="conteo").one()
    assert (m.quantity, m.previous_stock, m.new_stock) == (Decimal("-5"), Decimal("9"), Decimal("4"))


# --- RF-34: nombres en blanco ---


def test_rf34_categoria_con_nombre_en_blanco(client, admin_token, db):
    resp = client.post("/api/categories/", json={"name": "   "}, headers=_auth(admin_token))
    assert resp.status_code == 422
    assert "name" in resp.get_json()["details"]
    ok = client.post("/api/categories/", json={"name": "  Pinturas "}, headers=_auth(admin_token))
    assert ok.status_code == 201
    assert ok.get_json()["name"] == "Pinturas"
    resp = client.patch(f"/api/categories/{ok.get_json()['id']}", json={"name": " "}, headers=_auth(admin_token))
    assert resp.status_code == 422


def test_rf34_producto_y_proveedor_con_nombre_en_blanco(client, admin_token, db, pieza):
    resp = client.post("/api/products/", json={"sku": "X-1", "name": "   ", "unit_id": pieza.id, "sale_price": "1.00"},
                       headers=_auth(admin_token))
    assert resp.status_code == 422
    assert "name" in resp.get_json()["details"]

    resp = _proveedor(client, admin_token, name="   ")
    assert resp.status_code == 422
    assert "name" in resp.get_json()["details"]
    prov = _proveedor(client, admin_token, name=" Truper ").get_json()
    assert prov["name"] == "Truper"
    resp = client.patch(f"/api/purchases/suppliers/{prov['id']}", json={"name": "  "}, headers=_auth(admin_token))
    assert resp.status_code == 422


# --- RF-35: comodines en la búsqueda y errores de dedo en stock ---


@pytest.mark.parametrize("comodin", ["%", "_", "%%", "a_c"])
def test_rf35_los_comodines_se_buscan_literalmente(client, admin_token, db, pieza, comodin):
    _producto(db, pieza, "MART-1", name="Martillo")
    _producto(db, pieza, "TOR-1", name="Tornillo")
    for url in ("/api/products/", "/api/inventory/stock"):
        resp = client.get(f"{url}?search={comodin.replace('%', '%25')}", headers=_auth(admin_token))
        assert resp.status_code == 200
        assert resp.get_json()["items"] == [], url


def test_rf35_el_comodin_literal_si_encuentra_su_texto(client, admin_token, db, pieza):
    _producto(db, pieza, "DESC-1", name="Descuento 50% pintura")
    _producto(db, pieza, "MART-1", name="Martillo")
    for url in ("/api/products/", "/api/inventory/stock"):
        items = client.get(f"{url}?search=50%25", headers=_auth(admin_token)).get_json()["items"]
        nombres = [i.get("name") or i.get("product_name") for i in items]
        assert nombres == ["Descuento 50% pintura"], url


def test_rf35_la_busqueda_de_stock_tolera_errores_de_dedo(client, admin_token, db, pieza):
    _producto(db, pieza, "TOR-1", name="Tornillo")
    _producto(db, pieza, "MART-1", name="Martillo")
    items = client.get("/api/inventory/stock?search=tornilo", headers=_auth(admin_token)).get_json()["items"]
    assert [i["product_name"] for i in items] == ["Tornillo"]


def test_rf35_categoria_invalida_responde_400(client, admin_token, db):
    resp = client.get("/api/products/?category_id=abc", headers=_auth(admin_token))
    assert resp.status_code == 400


# --- RF-36: recapturar sin notas conserva la nota ---


def test_rf36_recapturar_sin_notas_conserva_la_nota(client, admin_token, db, pieza):
    p = _producto(db, pieza, "P-1", stock="10")
    count_id = _conteo(client, admin_token)
    _capturar(client, admin_token, count_id, p.id, 7, notes="faltan 3")
    resp = _capturar(client, admin_token, count_id, p.id, 8)
    assert resp.status_code == 200
    assert resp.get_json()["notes"] == "faltan 3"
    # Mandar la nota explícitamente vacía sí la borra
    resp = _capturar(client, admin_token, count_id, p.id, 8, notes=None)
    assert resp.get_json()["notes"] is None


# --- RF-37: RFC del proveedor ---


def test_rf37_rfc_vacio_es_sin_rfc(client, admin_token, db):
    assert _proveedor(client, admin_token, name="Uno", rfc="").status_code == 201
    resp = _proveedor(client, admin_token, name="Dos", rfc="  ")
    assert resp.status_code == 201
    assert resp.get_json()["rfc"] is None


@pytest.mark.parametrize("rfc", ["123", "ADN010101", "ADN0101011AAA", "AD1010101AAA", "ADN011301AAA", "ADNX0101011AAA"])
def test_rf37_rfc_con_formato_invalido(client, admin_token, db, rfc):
    resp = _proveedor(client, admin_token, rfc=rfc)
    assert resp.status_code == 422
    assert "RFC" in resp.get_json()["details"]["rfc"][0]


@pytest.mark.parametrize("rfc,guardado", [("adn010101aa1", "ADN010101AA1"), ("GOMJ800101AB3", "GOMJ800101AB3"),
                                          ("XAXX010101000", "XAXX010101000"), ("ÑAN010101AAA", "ÑAN010101AAA"),
                                          ("A&B010101AAA", "A&B010101AAA")])
def test_rf37_rfc_valido_de_persona_moral_y_fisica(client, admin_token, db, rfc, guardado):
    resp = _proveedor(client, admin_token, rfc=rfc)
    assert resp.status_code == 201, resp.get_json()
    assert resp.get_json()["rfc"] == guardado


def test_rf37_rfc_invalido_tambien_al_editar(client, admin_token, db):
    prov = _proveedor(client, admin_token).get_json()
    resp = client.patch(f"/api/purchases/suppliers/{prov['id']}", json={"rfc": "123"}, headers=_auth(admin_token))
    assert resp.status_code == 422
    resp = client.patch(f"/api/purchases/suppliers/{prov['id']}", json={"rfc": ""}, headers=_auth(admin_token))
    assert resp.status_code == 200
    assert resp.get_json()["rfc"] is None


# --- RF-38: detalles de las órdenes de compra ---


def test_rf38_oc_rechaza_productos_inactivos(client, admin_token, db, pieza):
    p = _producto(db, pieza, "INA-1", name="Llave vieja", activo=False)
    resp = _oc(client, admin_token, p.id)
    assert resp.status_code == 400
    assert "Llave vieja" in resp.get_json()["error"]


def test_rf38_cantidad_menor_a_un_milesimo_se_rechaza(client, admin_token, db, kilo):
    p = _producto(db, kilo, "K-1")
    resp = _oc(client, admin_token, p.id, qty="0.0004")
    assert resp.status_code == 422
    assert _oc(client, admin_token, p.id, qty="0.001").status_code == 201


def test_rf38_oc_sin_partidas_tiene_mensaje_claro(client, admin_token, db):
    resp = client.post("/api/purchases/orders", json={"items": []}, headers=_auth(admin_token))
    assert resp.status_code == 422
    assert resp.get_json()["details"]["items"] == ["La orden debe tener al menos un producto."]


def test_rf38_una_oc_rechazada_no_consume_folio(client, admin_token, db, pieza):
    activo = _producto(db, pieza, "P-1")
    inactivo = _producto(db, pieza, "P-2", activo=False)

    def consecutivo(folio):
        return int(folio.rsplit("-", 1)[1])

    primera = _oc(client, admin_token, activo.id).get_json()["folio"]
    assert _oc(client, admin_token, inactivo.id).status_code == 400
    assert _oc(client, admin_token, 999999).status_code == 400
    assert _oc(client, admin_token, activo.id, qty="1.5").status_code == 400  # pieza sin fracciones
    segunda = _oc(client, admin_token, activo.id).get_json()["folio"]
    assert consecutivo(segunda) == consecutivo(primera) + 1


# --- RF-39: auditoría de productos, proveedores e inventario ---


def test_rf39_desactivar_dos_veces_registra_un_solo_evento(client, admin_token, db, pieza):
    p = _producto(db, pieza, "P-1")
    assert client.delete(f"/api/products/{p.id}", headers=_auth(admin_token)).status_code == 200
    assert client.delete(f"/api/products/{p.id}", headers=_auth(admin_token)).status_code == 200
    assert len(_logs("product", p.id, "desactivar")) == 1

    prov = _proveedor(client, admin_token).get_json()
    client.delete(f"/api/purchases/suppliers/{prov['id']}", headers=_auth(admin_token))
    client.delete(f"/api/purchases/suppliers/{prov['id']}", headers=_auth(admin_token))
    assert len(_logs("supplier", prov["id"], "desactivar")) == 1
    client.post(f"/api/purchases/suppliers/{prov['id']}/reactivate", headers=_auth(admin_token))
    client.post(f"/api/purchases/suppliers/{prov['id']}/reactivate", headers=_auth(admin_token))
    assert len(_logs("supplier", prov["id"], "reactivar")) == 1


def test_rf39_editar_sin_cambios_no_registra_evento(client, admin_token, db, pieza):
    p = _producto(db, pieza, "P-1")
    resp = client.patch(f"/api/products/{p.id}", json={"name": p.name, "sale_price": "10.00"}, headers=_auth(admin_token))
    assert resp.status_code == 200
    assert _logs("product", p.id, "editar") == []
    client.patch(f"/api/products/{p.id}", json={"name": "Otro nombre", "sale_price": "10.00"}, headers=_auth(admin_token))
    logs = _logs("product", p.id, "editar")
    assert len(logs) == 1
    # Solo los campos que cambiaron
    assert _details(logs[0])["previous_value"] == {"name": p.name}
    assert _details(logs[0])["new_value"] == {"name": "Otro nombre"}

    prov = _proveedor(client, admin_token, phone="555").get_json()
    client.patch(f"/api/purchases/suppliers/{prov['id']}", json={"phone": "555"}, headers=_auth(admin_token))
    assert _logs("supplier", prov["id"], "editar") == []

    cat = client.post("/api/categories/", json={"name": "Pinturas"}, headers=_auth(admin_token)).get_json()
    client.patch(f"/api/categories/{cat['id']}", json={"name": "Pinturas"}, headers=_auth(admin_token))
    assert _logs("category", cat["id"], "editar") == []


def test_rf39_ajuste_registra_stock_anterior_y_nuevo(client, admin_token, db, kilo):
    from app.models.audit import AuditLog

    p = _producto(db, kilo, "K-1", stock="2.5")
    _ajustar(client, admin_token, p.id, "1")
    logs = AuditLog.query.filter_by(entity_type="stock", action="adjust").all()
    assert len(logs) == 1
    d = _details(logs[0])
    assert d["previous_value"] == {"stock": "2.500"}
    assert d["new_value"] == {"stock": "1.000"}
    assert d["product_id"] == p.id


def test_rf39_recepcion_registra_el_cambio_de_costo_promedio(client, admin_token, db, pieza):
    p = _producto(db, pieza, "P-1", stock="4", purchase_price="50.00")
    oc = _oc(client, admin_token, p.id, qty="4", cost="60.00").get_json()
    client.post(f"/api/purchases/orders/{oc['id']}/send", headers=_auth(admin_token))
    resp = client.post(f"/api/purchases/orders/{oc['id']}/receive",
                       json={"items": [{"order_item_id": oc["items"][0]["id"], "received_quantity": "4"}]},
                       headers=_auth(admin_token))
    assert resp.status_code == 200
    logs = _logs("purchase_order", oc["id"], "recibir")
    assert len(logs) == 1
    partidas = _details(logs[0])["items"]
    assert partidas == [{
        "product_id": p.id, "product_name": p.name, "received_quantity": "4",
        "previous_stock": "4.000", "new_stock": "8.000",
        "previous_avg_cost": "50.0000", "new_avg_cost": "55.0000",
    }]


# --- RF-40: precios y costos con más de 2 decimales ---


@pytest.mark.parametrize("campo", ["sale_price", "purchase_price"])
def test_rf40_precio_con_tres_decimales_se_rechaza(client, admin_token, db, pieza, campo):
    body = {"sku": "X-1", "name": "Algo", "unit_id": pieza.id, "sale_price": "10.00", campo: "10.125"}
    resp = client.post("/api/products/", json=body, headers=_auth(admin_token))
    assert resp.status_code == 422
    assert campo in resp.get_json()["details"]

    p = _producto(db, pieza, "P-1")
    resp = client.patch(f"/api/products/{p.id}", json={campo: "10.125"}, headers=_auth(admin_token))
    assert resp.status_code == 422


def test_rf40_precio_con_dos_decimales_o_ceros_extra_se_acepta(client, admin_token, db, pieza):
    body = {"sku": "X-1", "name": "Algo", "unit_id": pieza.id, "sale_price": "10.120", "purchase_price": "7.5"}
    resp = client.post("/api/products/", json=body, headers=_auth(admin_token))
    assert resp.status_code == 201
    assert resp.get_json()["sale_price"] == "10.12"
    assert resp.get_json()["purchase_price"] == "7.50"


def test_rf40_costo_de_oc_con_tres_decimales_se_rechaza(client, admin_token, db, pieza):
    p = _producto(db, pieza, "P-1")
    resp = _oc(client, admin_token, p.id, cost="10.125")
    assert resp.status_code == 422
    assert _oc(client, admin_token, p.id, cost="10.12").status_code == 201
