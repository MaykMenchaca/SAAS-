"""Catálogo e inventario (Subfase 4.4, H-26, H-43, H-38)."""
from decimal import Decimal

import pytest


@pytest.fixture
def unidad(db):
    from app.models.product import UnitOfMeasure

    unit = UnitOfMeasure(name="Pieza", abbreviation="pza")
    db.session.add(unit)
    db.session.flush()
    return unit


@pytest.fixture
def catalogo(db, unidad):
    from app.models.inventory import Stock
    from app.models.product import Product

    nombres = [
        "Martillo de uña 16 oz",
        "Martillo de bola",
        'Tornillo para madera 1/2"',
        "Tornillo hexagonal 3/8",
        "Pintura vinílica blanca 19 L",
        "Pintura esmalte rojo",
        "Pinzas de electricista",
        "Foco LED 9W luz blanca",
        "Foco ahorrador 20W",
        "Cinta de aislar",
    ]
    productos = []
    for i, nombre in enumerate(nombres):
        product = Product(sku=f"QA-{i:03d}", name=nombre, unit_id=unidad.id, sale_price=Decimal("10.00"))
        db.session.add(product)
        db.session.flush()
        db.session.add(Stock(product_id=product.id, quantity=Decimal("5")))
        productos.append(product)
    db.session.commit()
    return productos


def _buscar(client, token, texto):
    response = client.get(
        "/api/products/", query_string={"search": texto, "per_page": 50},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 200
    return [p["name"] for p in response.get_json()["items"]]


def test_producto_nuevo_aparece_en_stock_y_low_stock(client, admin_token, unidad):
    headers = {"Authorization": f"Bearer {admin_token}"}
    response = client.post(
        "/api/products/",
        json={
            "sku": "NUEVO-001",
            "name": "Desarmador plano",
            "unit_id": unidad.id,
            "sale_price": "80.00",
            "purchase_price": "50.00",
            "min_stock": "5",
        },
        headers=headers,
    )
    assert response.status_code == 201, response.get_json()
    product = response.get_json()
    assert Decimal(product["avg_cost"]) == Decimal("50.00")

    stock = client.get("/api/inventory/stock", query_string={"search": "Desarmador"}, headers=headers).get_json()
    assert [s["product_id"] for s in stock["items"]] == [product["id"]]
    assert Decimal(stock["items"][0]["quantity"]) == Decimal("0")

    low = client.get("/api/inventory/low-stock", headers=headers).get_json()["items"]  # paginado desde la 6.4
    assert product["id"] in [s["product_id"] for s in low]


def test_avg_cost_del_cliente_se_ignora_al_crear(client, admin_token, unidad):
    response = client.post(
        "/api/products/",
        json={
            "sku": "NUEVO-002",
            "name": "Llave inglesa",
            "unit_id": unidad.id,
            "sale_price": "120.00",
            "purchase_price": "70.00",
            "avg_cost": "1.00",
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 201
    assert Decimal(response.get_json()["avg_cost"]) == Decimal("70.00")


@pytest.mark.parametrize(
    "texto, esperado",
    [
        ("martilo", "Martillo de uña 16 oz"),
        ("tornilo", 'Tornillo para madera 1/2"'),
        ("pintrua", "Pintura vinílica blanca 19 L"),
        ("foko led", "Foco LED 9W luz blanca"),
    ],
)
def test_busqueda_tolera_errores_qa18(client, admin_token, catalogo, texto, esperado):
    assert esperado in _buscar(client, admin_token, texto)


def test_busqueda_ordena_por_relevancia_y_sin_ruido(client, admin_token, catalogo):
    resultados = _buscar(client, admin_token, "martillo")
    assert resultados[:2] == ["Martillo de bola", "Martillo de uña 16 oz"]
    assert not any(nombre.startswith("Tornillo") for nombre in resultados)

    assert _buscar(client, admin_token, "foko led")[0] == "Foco LED 9W luz blanca"


def test_busqueda_por_sku_y_codigo_sigue_funcionando(client, admin_token, catalogo):
    assert _buscar(client, admin_token, "QA-004") == ["Pintura vinílica blanca 19 L"]


def test_reactivar_producto(client, admin_token, catalogo):
    headers = {"Authorization": f"Bearer {admin_token}"}
    product_id = catalogo[0].id
    assert client.delete(f"/api/products/{product_id}", headers=headers).status_code == 200

    activos = client.get("/api/products/", headers=headers).get_json()["items"]
    assert product_id not in [p["id"] for p in activos]
    todos = client.get("/api/products/", query_string={"include_inactive": "true"}, headers=headers).get_json()["items"]
    assert product_id in [p["id"] for p in todos]

    response = client.post(f"/api/products/{product_id}/reactivate", headers=headers)
    assert response.status_code == 200
    assert response.get_json()["is_active"] is True

    from app.models.audit import AuditLog

    assert AuditLog.query.filter_by(entity_type="product", entity_id=product_id, action="reactivar").count() == 1


def test_reactivar_requiere_permiso(client, regular_user_token, catalogo):
    response = client.post(
        f"/api/products/{catalogo[0].id}/reactivate",
        headers={"Authorization": f"Bearer {regular_user_token}"},
    )
    assert response.status_code == 403
