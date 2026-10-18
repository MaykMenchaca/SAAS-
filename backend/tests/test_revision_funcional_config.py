"""Revisión funcional 2026-10, configuración: RF-06 (PUT /config sin validar; incluye QA-C-13 y QA-A-12)."""
import pytest

from app.models.config import SystemConfig


def _h(token):
    return {"Authorization": f"Bearer {token}"}


def _put(client, token, body):
    return client.put("/api/config/", headers=_h(token), json=body)


@pytest.mark.parametrize("valor", ["NaN", "Infinity", "-5", "150", "abc", "", None])
def test_rf06_tope_de_descuento_invalido_se_rechaza(client, admin_token, db, valor):
    resp = _put(client, admin_token, {"max_discount_percent": valor})
    assert resp.status_code == 400, resp.get_json()
    assert "max_discount_percent" in resp.get_json()["details"]
    assert db.session.get(SystemConfig, "max_discount_percent") is None or \
        db.session.get(SystemConfig, "max_discount_percent").value == "0"


@pytest.mark.parametrize("clave, valor", [
    ("default_tax_rate", "abc"), ("default_tax_rate", "101"), ("default_tax_rate", "-1"),
    ("allow_negative_stock", "quizas"), ("low_stock_threshold", "-3"),
    ("company_name", ""), ("company_name", "x" * 300), ("ticket_footer", "y" * 2000),
])
def test_rf06_valores_invalidos_por_clave(client, admin_token, clave, valor):
    resp = _put(client, admin_token, {clave: valor})
    assert resp.status_code == 400
    assert clave in resp.get_json()["details"]


@pytest.mark.parametrize("body", [["no", "es", "objeto"], {"company_name": {"a": 1}}, {"company_name": [1]}])
def test_rf06_cuerpo_con_forma_invalida_da_400_y_no_500(client, admin_token, body):
    assert _put(client, admin_token, body).status_code == 400


def test_rf06_clave_desconocida_nueva_se_rechaza(client, admin_token, db):
    resp = _put(client, admin_token, {"clave_inventada": "x"})
    assert resp.status_code == 400
    assert db.session.get(SystemConfig, "clave_inventada") is None
    assert _put(client, admin_token, {"k" * 150: "x"}).status_code == 400


def test_rf06_clave_desconocida_que_ya_existe_y_no_cambia_se_ignora(client, admin_token, db):
    # La pestaña General reenvía todas las claves que recibió: guardar no debe fallar por una clave heredada
    db.session.add(SystemConfig(key="clave_heredada", value="v1"))
    db.session.commit()
    resp = _put(client, admin_token, {"clave_heredada": "v1", "company_name": "Ferretería López"})
    assert resp.status_code == 200
    assert resp.get_json()["company_name"] == "Ferretería López"
    assert _put(client, admin_token, {"clave_heredada": "v2"}).status_code == 400


def test_rf06_valores_validos_se_normalizan(client, admin_token):
    resp = _put(client, admin_token, {
        "max_discount_percent": "12.5", "default_tax_rate": 16, "allow_negative_stock": False,
        "company_name": "  Ferretería López  ", "company_rfc": "XAXX010101000",
        "company_subtitle": "Sucursal Centro", "company_logo_icon": "Wrench", "company_logo_color": "amber",
    })
    assert resp.status_code == 200, resp.get_json()
    data = resp.get_json()
    assert data["max_discount_percent"] == "12.50"
    assert data["default_tax_rate"] == "16.00"
    assert data["allow_negative_stock"] == "false"
    assert data["company_name"] == "Ferretería López"


def test_rf06_un_tope_corrupto_ya_guardado_no_detiene_las_ventas(client, admin_token, regular_user_token, db,
                                                                  seed_open_session, seed_product_for_sale):
    # Simula un valor dañado que entró antes de la validación: la venta sigue y el tope se toma como 0
    db.session.add(SystemConfig(key="max_discount_percent", value="NaN"))
    db.session.commit()
    sin_descuento = {"session_id": seed_open_session.id, "items": [{"product_id": seed_product_for_sale.id, "quantity": 1}]}
    assert client.post("/api/sales/quote", headers=_h(admin_token), json=sin_descuento).status_code == 200

    con_descuento = {"session_id": seed_open_session.id,
                     "items": [{"product_id": seed_product_for_sale.id, "quantity": 1, "discount_percent": "100"}]}
    resp = client.post("/api/sales/quote", headers=_h(regular_user_token), json=con_descuento)
    assert resp.status_code in (400, 403), resp.get_json()  # el cajero sin permiso no puede regalar
