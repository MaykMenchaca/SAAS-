"""Usuarios: email opcional y mensajes de validación en español (Subfase 4.5, H-28)."""
import pytest


def _crear(client, token, role_id, **extra):
    payload = {
        "username": "cajero_nuevo",
        "full_name": "Cajero Nuevo",
        "password": "contrasena-segura",
        "role_id": role_id,
    }
    payload.update(extra)
    return client.post("/api/users/", json=payload, headers={"Authorization": f"Bearer {token}"})


def test_crear_usuario_sin_email(client, admin_token, seed_roles):
    response = _crear(client, admin_token, seed_roles["cajero"].id)
    assert response.status_code == 201, response.get_json()
    assert response.get_json()["email"] is None


@pytest.mark.parametrize("email", ["", None])
def test_crear_usuario_con_email_vacio_o_nulo(client, admin_token, seed_roles, email):
    response = _crear(client, admin_token, seed_roles["cajero"].id, email=email)
    assert response.status_code == 201, response.get_json()
    assert response.get_json()["email"] is None


def test_dos_usuarios_sin_email(client, admin_token, seed_roles):
    assert _crear(client, admin_token, seed_roles["cajero"].id).status_code == 201
    response = _crear(client, admin_token, seed_roles["cajero"].id, username="otro_cajero")
    assert response.status_code == 201, response.get_json()


def test_email_invalido_con_mensaje_en_espanol(client, admin_token, seed_roles):
    response = _crear(client, admin_token, seed_roles["cajero"].id, email="no-es-email")
    assert response.status_code == 422
    assert response.get_json()["details"]["email"] == ["No es un correo electrónico válido."]


def test_mensajes_de_validacion_en_espanol(client, admin_token, seed_roles):
    response = client.post(
        "/api/users/",
        json={"username": "ab", "full_name": None, "password": "corta"},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 422
    details = response.get_json()["details"]
    assert details["role_id"] == ["Este campo es obligatorio."]
    assert details["full_name"] == ["Este campo no puede ser nulo."]
    assert details["username"] == ["Debe tener entre 3 y 80 caracteres."]
    assert details["password"] == ["Debe tener entre 8 y 128 caracteres."]


def test_traduccion_de_mensajes_anidados():
    from app.utils.errors import translate_messages

    mensajes = {
        "items": {0: {"quantity": ["Must be greater than or equal to 0.001."]}},
        "method": ["Must be one of: efectivo, tarjeta."],
        "x": ["Not a valid integer."],
        "y": ["Unknown field."],
        "z": ["Mensaje ya en español."],
    }
    traducidos = translate_messages(mensajes)
    assert traducidos["items"][0]["quantity"] == ["Debe ser mayor o igual a 0.001."]
    assert traducidos["method"] == ["Debe ser uno de: efectivo, tarjeta."]
    assert traducidos["x"] == ["No es un número entero válido."]
    assert traducidos["y"] == ["Campo desconocido."]
    assert traducidos["z"] == ["Mensaje ya en español."]
