"""Catálogos sin duplicados por mayúsculas o espacios (Subfase 5.4, H-54)."""
import pytest
from sqlalchemy.exc import IntegrityError


def _crear(client, token, name):
    return client.post("/api/categories/", json={"name": name}, headers={"Authorization": f"Bearer {token}"})


@pytest.mark.parametrize("duplicado", ["herramientas manuales", "HERRAMIENTAS MANUALES", "  Herramientas Manuales "])
def test_no_crea_categoria_que_solo_cambia_mayusculas(client, admin_token, duplicado):
    assert _crear(client, admin_token, "Herramientas manuales").status_code == 201
    response = _crear(client, admin_token, duplicado)
    assert response.status_code == 422
    assert response.get_json()["details"]["name"] == ["Ya existe una categoría con ese nombre"]


def test_no_renombra_a_un_nombre_existente(client, admin_token):
    _crear(client, admin_token, "Pintura")
    otra = _crear(client, admin_token, "Plomería").get_json()
    response = client.patch(
        f"/api/categories/{otra['id']}", json={"name": "PINTURA"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 422


def test_indice_unico_sin_distinguir_mayusculas(db):
    from app.models.product import Category

    db.session.add(Category(name="Tornillería"))
    db.session.add(Category(name="tornillería"))
    with pytest.raises(IntegrityError):
        db.session.flush()
    db.session.rollback()
