"""Revisión funcional 2026-10, carril Y: catálogo, inventario y compras (RF-12, RF-16 a RF-23)."""
from decimal import Decimal

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


def _producto(db, unidad, sku, barcode=None, precio="10.00", stock="0", min_stock="0", activo=True,
              tax="16.00", category_id=None):
    from app.models.inventory import Stock
    from app.models.product import Product

    p = Product(sku=sku, barcode=barcode, name=f"Producto {sku}", unit_id=unidad.id,
                sale_price=Decimal(precio), tax_rate=Decimal(tax), min_stock=Decimal(min_stock),
                is_active=activo, category_id=category_id)
    db.session.add(p)
    db.session.flush()
    db.session.add(Stock(product_id=p.id, quantity=Decimal(stock)))
    db.session.commit()
    return p


def _alta(unidad, sku, barcode=None, **extra):
    return {"sku": sku, "barcode": barcode, "name": f"Nuevo {sku}", "unit_id": unidad.id,
            "sale_price": "10.00", "tax_rate": "16.00", **extra}


# --- RF-16: la etiqueta muestra el precio con IVA ---


def test_rf16_la_etiqueta_imprime_el_precio_con_iva(db, pieza):
    from app.services.printer_service import PrinterService

    p = _producto(db, pieza, "MART-001", precio="155.00")
    contenido = PrinterService.format_price_label(p, business_name="Ferre")
    assert "$179.80" in contenido
    assert "$155.00" not in contenido


def test_rf16_el_iva_de_la_etiqueta_redondea_como_la_venta(db, pieza):
    # 1.25 × 10 % = 0.125 → HALF_EVEN 0.12 (como price_lines), no 0.13
    from app.services.printer_service import PrinterService

    p = _producto(db, pieza, "CLAVO-1", precio="1.25", tax="10.00")
    assert "$1.37" in PrinterService.format_price_label(p, business_name="Ferre")


def test_rf16_endpoint_de_vista_previa(client, admin_token, db, pieza):
    p = _producto(db, pieza, "MART-002", precio="155.00")
    resp = client.post(f"/api/printing/products/{p.id}/label", json={"send": False}, headers=_auth(admin_token))
    assert resp.status_code == 200
    assert "$179.80" in resp.get_json()["content"]


# --- RF-17: SKU y código de barras únicos sin distinguir mayúsculas ni espacios ---


@pytest.mark.parametrize("sku", ["mart-001", "MART-001 ", "  Mart-001"])
def test_rf17_no_se_aceptan_sku_que_solo_difieren_en_mayusculas_o_espacios(client, admin_token, db, pieza, sku):
    _producto(db, pieza, "MART-001")
    resp = client.post("/api/products/", json=_alta(pieza, sku), headers=_auth(admin_token))
    assert resp.status_code == 422
    assert "sku" in resp.get_json()["details"]


def test_rf17_el_sku_se_guarda_sin_espacios_y_se_puede_escanear(client, admin_token, db, pieza):
    resp = client.post("/api/products/", json=_alta(pieza, "  TOR-9 ", " 7501112223334 "), headers=_auth(admin_token))
    assert resp.status_code == 201
    assert resp.get_json()["sku"] == "TOR-9"
    assert resp.get_json()["barcode"] == "7501112223334"
    escaneo = client.get("/api/products/by-code/tor-9", headers=_auth(admin_token))
    assert escaneo.get_json()["id"] == resp.get_json()["id"]


def test_rf17_sku_solo_espacios_es_invalido(client, admin_token, db, pieza):
    resp = client.post("/api/products/", json=_alta(pieza, "   "), headers=_auth(admin_token))
    assert resp.status_code == 422


@pytest.mark.parametrize("barcode", ["abc123", " ABC123 "])
def test_rf17_codigo_de_barras_unico_sin_distinguir_mayusculas(client, admin_token, db, pieza, barcode):
    _producto(db, pieza, "A-1", barcode="ABC123")
    resp = client.post("/api/products/", json=_alta(pieza, "B-1", barcode), headers=_auth(admin_token))
    assert resp.status_code == 422
    assert "barcode" in resp.get_json()["details"]


def test_rf17_al_editar_tambien_y_el_propio_sku_no_choca(client, admin_token, db, pieza):
    _producto(db, pieza, "MART-001")
    b = _producto(db, pieza, "B-001")
    resp = client.patch(f"/api/products/{b.id}", json={"sku": "mart-001"}, headers=_auth(admin_token))
    assert resp.status_code == 422
    # Cambiar solo las mayúsculas de su propio SKU sí se puede
    resp = client.patch(f"/api/products/{b.id}", json={"sku": "b-001 "}, headers=_auth(admin_token))
    assert resp.status_code == 200
    assert resp.get_json()["sku"] == "b-001"


# --- RF-18: unidades únicas, sin nombres en blanco ---


@pytest.mark.parametrize("nombre,abrev", [
    ("galón", "gl"), ("GALÓN ", "GAL2"), ("Galon", "g2"), ("Litro", "GAL"), ("Litro", " gal "),
])
def test_rf18_unidades_duplicadas_por_mayusculas_acentos_o_espacios(client, admin_token, db, nombre, abrev):
    ok = client.post("/api/products/units", json={"name": "Galón", "abbreviation": "gal"}, headers=_auth(admin_token))
    assert ok.status_code == 201
    resp = client.post("/api/products/units", json={"name": nombre, "abbreviation": abrev}, headers=_auth(admin_token))
    assert resp.status_code == 422


@pytest.mark.parametrize("nombre,abrev", [("   ", "x"), ("Caja", "  ")])
def test_rf18_unidad_con_nombre_o_abreviatura_en_blanco(client, admin_token, db, nombre, abrev):
    resp = client.post("/api/products/units", json={"name": nombre, "abbreviation": abrev}, headers=_auth(admin_token))
    assert resp.status_code == 422


def test_rf18_la_unidad_se_guarda_sin_espacios_y_renombrarse_a_si_misma_es_valido(client, admin_token, db):
    resp = client.post("/api/products/units", json={"name": "  Litro ", "abbreviation": " L "}, headers=_auth(admin_token))
    assert resp.status_code == 201
    assert resp.get_json()["name"] == "Litro"
    assert resp.get_json()["abbreviation"] == "L"
    uid = resp.get_json()["id"]
    otra = client.post("/api/products/units", json={"name": "Metro", "abbreviation": "m"}, headers=_auth(admin_token))
    assert client.patch(f"/api/products/units/{uid}", json={"name": "LITRO"}, headers=_auth(admin_token)).status_code == 200
    choque = client.patch(f"/api/products/units/{otra.get_json()['id']}", json={"abbreviation": "l"},
                          headers=_auth(admin_token))
    assert choque.status_code == 422
    blanco = client.patch(f"/api/products/units/{uid}", json={"name": "  "}, headers=_auth(admin_token))
    assert blanco.status_code == 422


# --- RF-19: allows_fractions en ajustes, conteos y compras ---


def test_rf19_ajuste_fraccionario_en_unidad_por_pieza(client, admin_token, db, pieza):
    p = _producto(db, pieza, "P-1", stock="5")
    resp = client.post("/api/inventory/adjust", json={"product_id": p.id, "quantity": "2.5"}, headers=_auth(admin_token))
    assert resp.status_code == 400
    assert "fraccionarias" in resp.get_json()["error"]
    ok = client.post("/api/inventory/adjust", json={"product_id": p.id, "quantity": "3"}, headers=_auth(admin_token))
    assert ok.status_code == 200
    cero = client.post("/api/inventory/adjust", json={"product_id": p.id, "quantity": "0"}, headers=_auth(admin_token))
    assert cero.status_code == 200


def test_rf19_ajuste_fraccionario_en_unidad_por_kilo_si_se_permite(client, admin_token, db, kilo):
    p = _producto(db, kilo, "K-1", stock="5")
    resp = client.post("/api/inventory/adjust", json={"product_id": p.id, "quantity": "2.5"}, headers=_auth(admin_token))
    assert resp.status_code == 200


def test_rf19_captura_de_conteo_fraccionaria(client, admin_token, db, pieza):
    p = _producto(db, pieza, "P-1", stock="5")
    count = client.post("/api/inventory/counts", json={}, headers=_auth(admin_token)).get_json()
    url = f"/api/inventory/counts/{count['id']}/items/{p.id}"
    resp = client.patch(url, json={"counted_quantity": "1.5"}, headers=_auth(admin_token))
    assert resp.status_code == 400
    assert client.patch(url, json={"counted_quantity": "0"}, headers=_auth(admin_token)).status_code == 200


def _oc(client, token, product_id, qty="3", **extra):
    item = {"product_id": product_id, "quantity": qty, "unit_cost": "10.00", **extra}
    return client.post("/api/purchases/orders", json={"items": [item]}, headers=_auth(token))


def test_rf19_partida_de_oc_fraccionaria(client, admin_token, db, pieza, kilo):
    p = _producto(db, pieza, "P-1")
    k = _producto(db, kilo, "K-1")
    resp = _oc(client, admin_token, p.id, qty="1.5")
    assert resp.status_code == 400
    assert "fraccionarias" in resp.get_json()["error"]
    assert _oc(client, admin_token, k.id, qty="1.5").status_code == 201


def test_rf19_recepcion_fraccionaria(client, admin_token, db, pieza):
    p = _producto(db, pieza, "P-1")
    oc = _oc(client, admin_token, p.id, qty="3").get_json()
    client.post(f"/api/purchases/orders/{oc['id']}/send", headers=_auth(admin_token))
    resp = client.post(f"/api/purchases/orders/{oc['id']}/receive",
                       json={"items": [{"order_item_id": oc["items"][0]["id"], "received_quantity": "1.5"}]},
                       headers=_auth(admin_token))
    assert resp.status_code == 400
    from app.models.inventory import Stock
    assert Stock.query.filter_by(product_id=p.id).first().quantity == Decimal("0")


def test_rf19_no_se_apaga_allows_fractions_con_stock_fraccionario(client, admin_token, db, kilo):
    kilo_id = kilo.id
    _producto(db, kilo, "K-1", stock="22.5")
    resp = client.patch(f"/api/products/units/{kilo.id}", json={"allows_fractions": False}, headers=_auth(admin_token))
    assert resp.status_code == 400
    assert "fraccionario" in resp.get_json()["error"]
    from app.models.product import UnitOfMeasure
    assert db.session.get(UnitOfMeasure, kilo_id).allows_fractions is True


def test_rf19_si_se_apaga_allows_fractions_con_stock_entero(client, admin_token, db, kilo):
    _producto(db, kilo, "K-1", stock="22")
    resp = client.patch(f"/api/products/units/{kilo.id}", json={"allows_fractions": False}, headers=_auth(admin_token))
    assert resp.status_code == 200
    assert resp.get_json()["allows_fractions"] is False


# --- RF-20: categorías desactivadas con productos ---


@pytest.fixture
def categoria(db):
    from app.models.product import Category

    c = Category(name="Pinturas")
    db.session.add(c)
    db.session.commit()
    return c


@pytest.mark.parametrize("via", ["delete", "patch"])
def test_rf20_no_se_desactiva_una_categoria_con_productos_activos(client, admin_token, db, pieza, categoria, via):
    _producto(db, pieza, "P-1", category_id=categoria.id)
    cat_id = categoria.id
    if via == "delete":
        resp = client.delete(f"/api/categories/{categoria.id}", headers=_auth(admin_token))
    else:
        resp = client.patch(f"/api/categories/{categoria.id}", json={"is_active": False}, headers=_auth(admin_token))
    assert resp.status_code == 400
    assert "1 producto activo" in resp.get_json()["error"]
    from app.models.product import Category
    assert db.session.get(Category, cat_id).is_active is True


def test_rf20_si_se_desactiva_si_solo_tiene_productos_inactivos(client, admin_token, db, pieza, categoria):
    _producto(db, pieza, "P-1", category_id=categoria.id, activo=False)
    resp = client.delete(f"/api/categories/{categoria.id}", headers=_auth(admin_token))
    assert resp.status_code == 200
    assert resp.get_json()["is_active"] is False


def test_rf20_editar_un_producto_de_categoria_inactiva_sin_cambiarla(client, admin_token, db, pieza, categoria):
    from app.models.product import Category

    p = _producto(db, pieza, "P-1", category_id=categoria.id)
    categoria.is_active = False  # datos previos a la corrección
    otra = Category(name="Inactiva", is_active=False)
    db.session.add(otra)
    db.session.commit()
    resp = client.patch(f"/api/products/{p.id}", json={"name": "Renombrado", "category_id": categoria.id},
                        headers=_auth(admin_token))
    assert resp.status_code == 200
    # Cambiar A una categoría inactiva sigue sin poderse
    resp = client.patch(f"/api/products/{p.id}", json={"category_id": otra.id}, headers=_auth(admin_token))
    assert resp.status_code == 422


# --- RF-12 (carril Y): topes para no responder 500 ---


@pytest.mark.parametrize("campo,valor", [
    ("sale_price", "99999999999"), ("purchase_price", "99999999999"), ("tax_rate", "1000"),
    ("tax_rate", "100.01"), ("tax_rate", "-1"), ("min_stock", "10000000000"), ("max_stock", "1.0004"),
])
def test_rf12_alta_de_producto_con_valores_fuera_de_rango(client, admin_token, db, pieza, campo, valor):
    resp = client.post("/api/products/", json=_alta(pieza, "X-1", **{campo: valor}), headers=_auth(admin_token))
    assert resp.status_code == 422
    assert campo in resp.get_json()["details"]


def test_rf12_editar_iva_fuera_de_rango(client, admin_token, db, pieza):
    p = _producto(db, pieza, "P-1")
    resp = client.patch(f"/api/products/{p.id}", json={"tax_rate": "1000"}, headers=_auth(admin_token))
    assert resp.status_code == 422


@pytest.mark.parametrize("cantidad", ["1000000000", "1.0004"])
def test_rf12_ajuste_fuera_de_rango(client, admin_token, db, kilo, cantidad):
    p = _producto(db, kilo, "K-1")
    resp = client.post("/api/inventory/adjust", json={"product_id": p.id, "quantity": cantidad}, headers=_auth(admin_token))
    assert resp.status_code == 422


@pytest.mark.parametrize("cantidad", ["10000000000", "1.0004"])
def test_rf12_conteo_fuera_de_rango(client, admin_token, db, kilo, cantidad):
    p = _producto(db, kilo, "K-1", stock="5")
    count = client.post("/api/inventory/counts", json={}, headers=_auth(admin_token)).get_json()
    resp = client.patch(f"/api/inventory/counts/{count['id']}/items/{p.id}", json={"counted_quantity": cantidad},
                        headers=_auth(admin_token))
    assert resp.status_code == 422


@pytest.mark.parametrize("extra", [
    {"tax_rate": "1000"}, {"quantity": "1e10"}, {"quantity": "1.0004"}, {"unit_cost": "99999999999"},
])
def test_rf12_oc_fuera_de_rango(client, admin_token, db, kilo, extra):
    p = _producto(db, kilo, "K-1")
    resp = _oc(client, admin_token, p.id, **extra)
    assert resp.status_code == 422


def test_rf12_oc_cuyo_total_desborda(client, admin_token, db, kilo):
    p = _producto(db, kilo, "K-1")
    resp = _oc(client, admin_token, p.id, qty="999999999", unit_cost="99999999.00")
    assert resp.status_code == 400
    assert "máximo" in resp.get_json()["error"]


def test_rf12_telefono_de_proveedor_largo(client, admin_token, db):
    resp = client.post("/api/purchases/suppliers", json={"name": "Prov", "phone": "1" * 25}, headers=_auth(admin_token))
    assert resp.status_code == 422
    assert "phone" in resp.get_json()["details"]


@pytest.mark.parametrize("url", [
    "/api/inventory/movements/1?limit=-1", "/api/inventory/movements/1?limit=0",
    "/api/inventory/low-stock?per_page=0", "/api/inventory/stock?per_page=-1",
    "/api/purchases/suppliers?per_page=-5", "/api/purchases/orders?per_page=0",
])
def test_rf12_limites_negativos_o_cero_no_dan_500(client, admin_token, db, url):
    resp = client.get(url, headers=_auth(admin_token))
    assert resp.status_code == 200


# --- RF-21: proveedores desactivados ---


def _proveedor(client, token, **datos):
    return client.post("/api/purchases/suppliers", json={"name": "Aceros del Norte", **datos}, headers=_auth(token))


def test_rf21_reactivar_un_proveedor(client, admin_token, db):
    prov = _proveedor(client, admin_token, rfc="ADN010101AAA").get_json()
    client.delete(f"/api/purchases/suppliers/{prov['id']}", headers=_auth(admin_token))
    activos = client.get("/api/purchases/suppliers", headers=_auth(admin_token)).get_json()["items"]
    assert prov["id"] not in [s["id"] for s in activos]
    todos = client.get("/api/purchases/suppliers?include_inactive=true", headers=_auth(admin_token)).get_json()["items"]
    assert [s["is_active"] for s in todos if s["id"] == prov["id"]] == [False]

    resp = client.post(f"/api/purchases/suppliers/{prov['id']}/reactivate", headers=_auth(admin_token))
    assert resp.status_code == 200
    assert resp.get_json()["is_active"] is True
    activos = client.get("/api/purchases/suppliers", headers=_auth(admin_token)).get_json()["items"]
    assert prov["id"] in [s["id"] for s in activos]
    assert client.post("/api/purchases/suppliers/9999/reactivate", headers=_auth(admin_token)).status_code == 404


def test_rf21_reactivar_exige_permiso(client, regular_user_token, admin_token, db):
    prov = _proveedor(client, admin_token).get_json()
    resp = client.post(f"/api/purchases/suppliers/{prov['id']}/reactivate", headers=_auth(regular_user_token))
    assert resp.status_code == 403


def test_rf21_rfc_de_proveedor_inactivo_sugiere_reactivarlo(client, admin_token, db):
    prov = _proveedor(client, admin_token, rfc="ADN010101AAA").get_json()
    client.delete(f"/api/purchases/suppliers/{prov['id']}", headers=_auth(admin_token))
    resp = _proveedor(client, admin_token, name="Otro nombre", rfc="adn010101aaa ")
    assert resp.status_code == 409
    body = resp.get_json()
    assert body["code"] == "supplier_inactive"
    assert body["supplier_id"] == prov["id"]
    assert "Reactívalo" in body["error"]


def test_rf21_rfc_de_proveedor_activo_da_409_claro(client, admin_token, db):
    _proveedor(client, admin_token, rfc="ADN010101AAA")
    resp = _proveedor(client, admin_token, name="Otro", rfc="ADN010101AAA")
    assert resp.status_code == 409
    assert resp.get_json()["code"] == "supplier_rfc_exists"
    assert "Aceros del Norte" in resp.get_json()["error"]
    otro = _proveedor(client, admin_token, name="Otro", rfc="OTR010101BBB").get_json()
    resp = client.patch(f"/api/purchases/suppliers/{otro['id']}", json={"rfc": "adn010101aaa"}, headers=_auth(admin_token))
    assert resp.status_code == 409


def test_rf21_el_rfc_se_guarda_normalizado(client, admin_token, db):
    resp = _proveedor(client, admin_token, rfc=" adn010101aaa ")
    assert resp.status_code == 201
    assert resp.get_json()["rfc"] == "ADN010101AAA"


def test_rf21_sin_proveedor_inactivo_no_se_usa_en_silencio(client, admin_token, db, kilo):
    from app.models.purchase import Supplier

    db.session.add(Supplier(name="Sin Proveedor", is_active=False))
    db.session.commit()
    p = _producto(db, kilo, "K-1")
    resp = _oc(client, admin_token, p.id)
    assert resp.status_code == 400
    assert "Sin Proveedor" in resp.get_json()["error"]


# --- RF-22: cerrar una OC parcial ---


def _oc_parcial(client, token, product_id):
    oc = _oc(client, token, product_id, qty="10").get_json()
    client.post(f"/api/purchases/orders/{oc['id']}/send", headers=_auth(token))
    resp = client.post(f"/api/purchases/orders/{oc['id']}/receive",
                       json={"items": [{"order_item_id": oc["items"][0]["id"], "received_quantity": "4"}]},
                       headers=_auth(token))
    assert resp.get_json()["status"] == "parcial"
    return oc


def test_rf22_cerrar_una_oc_parcial(client, admin_token, db, pieza):
    from app.models.inventory import Stock

    p = _producto(db, pieza, "P-1")
    oc = _oc_parcial(client, admin_token, p.id)
    resp = client.post(f"/api/purchases/orders/{oc['id']}/close", json={"notes": "El proveedor ya no surte"},
                       headers=_auth(admin_token))
    assert resp.status_code == 200
    assert resp.get_json()["status"] == "cerrada"
    # Lo recibido se queda en inventario y ya no se puede recibir más
    assert Stock.query.filter_by(product_id=p.id).first().quantity == Decimal("4")
    otra = client.post(f"/api/purchases/orders/{oc['id']}/receive",
                       json={"items": [{"order_item_id": oc["items"][0]["id"], "received_quantity": "1"}]},
                       headers=_auth(admin_token))
    assert otra.status_code == 400
    # Sale de las pendientes (campana)
    pendientes = client.get("/api/purchases/orders?status=borrador,enviada,parcial", headers=_auth(admin_token))
    assert pendientes.get_json()["total"] == 0


def test_rf22_solo_se_cierran_ordenes_parciales(client, admin_token, db, pieza):
    p = _producto(db, pieza, "P-1")
    oc = _oc(client, admin_token, p.id).get_json()
    resp = client.post(f"/api/purchases/orders/{oc['id']}/close", headers=_auth(admin_token))
    assert resp.status_code == 400
    assert "cancélala" in resp.get_json()["error"].lower()


def test_rf22_cancelar_una_parcial_explica_que_pasa_con_lo_recibido(client, admin_token, db, pieza):
    p = _producto(db, pieza, "P-1")
    oc = _oc_parcial(client, admin_token, p.id)
    resp = client.post(f"/api/purchases/orders/{oc['id']}/cancel", headers=_auth(admin_token))
    assert resp.status_code == 400
    error = resp.get_json()["error"]
    assert "no se revierte" in error
    assert "Cerrar orden" in error


# --- RF-23: resumen de inventario y low-stock ---


def test_rf23_resumen_de_inventario_con_conteos_exactos(client, regular_user_token, db, pieza):
    _producto(db, pieza, "A", stock="0")                    # agotado sin mínimo
    _producto(db, pieza, "B", stock="0", min_stock="5")     # agotado con mínimo
    _producto(db, pieza, "C", stock="0", min_stock="1")     # agotado con mínimo
    _producto(db, pieza, "D", stock="2", min_stock="2")     # igual al mínimo: bajo
    _producto(db, pieza, "E", stock="3", min_stock="5")     # bajo
    _producto(db, pieza, "F", stock="10")                   # normal sin mínimo
    _producto(db, pieza, "G", stock="0", activo=False)      # inactivo: no cuenta
    resp = client.get("/api/inventory/summary", headers=_auth(regular_user_token))
    assert resp.status_code == 200
    assert resp.get_json() == {"total_products": 6, "out_of_stock": 3, "below_min": 2}


def test_rf23_el_resumen_no_se_limita_a_100(client, admin_token, db, pieza):
    from app.models.inventory import Stock
    from app.models.product import Product

    productos = [Product(sku=f"AG-{i}", name=f"Agotado {i}", unit_id=pieza.id, sale_price=Decimal("1")) for i in range(105)]
    db.session.add_all(productos)
    db.session.flush()
    db.session.add_all([Stock(product_id=p.id, quantity=Decimal("0")) for p in productos])
    db.session.commit()
    assert client.get("/api/inventory/summary", headers=_auth(admin_token)).get_json()["out_of_stock"] == 105


def test_rf23_producto_sin_registro_de_stock_cuenta_como_agotado(client, admin_token, db, pieza):
    from app.models.product import Product

    db.session.add(Product(sku="SIN-STOCK", name="Sin stock", unit_id=pieza.id, sale_price=Decimal("1")))
    db.session.commit()
    assert client.get("/api/inventory/summary", headers=_auth(admin_token)).get_json()["out_of_stock"] == 1


def test_rf23_low_stock_incluye_agotados_sin_minimo_y_stock_igual_al_minimo(client, admin_token, db, pieza):
    a = _producto(db, pieza, "A", stock="0")
    d = _producto(db, pieza, "D", stock="2", min_stock="2")
    _producto(db, pieza, "F", stock="10")
    _producto(db, pieza, "H", stock="3", min_stock="2")
    resp = client.get("/api/inventory/low-stock", headers=_auth(admin_token)).get_json()
    assert sorted(i["product_id"] for i in resp["items"]) == sorted([a.id, d.id])
    assert resp["total"] == 2


def test_rf23_resumen_exige_sesion(client, db):
    assert client.get("/api/inventory/summary").status_code == 401
