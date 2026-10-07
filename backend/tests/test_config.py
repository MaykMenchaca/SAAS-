"""Tests for system configuration module."""
from app.services import config_service


# --- Service tests ---


def test_get_all_returns_defaults(app, db):
    """get_all should return default values for unconfigured keys."""
    result = config_service.get_all()
    assert result["company_name"] == "Mi Negocio"
    assert result["default_tax_rate"] == "16.00"
    assert result["currency_symbol"] == "$"


def test_get_single_key(app, db):
    """get should return a single config value."""
    assert config_service.get("company_name") == "Mi Negocio"
    assert config_service.get("nonexistent_key") is None


def test_set_value_creates(app, db):
    """set_value should create a new config entry."""
    config_service.set_value("company_name", "Ferreteria Lopez")
    assert config_service.get("company_name") == "Ferreteria Lopez"


def test_set_value_updates(app, db):
    """set_value should update existing config entry."""
    config_service.set_value("company_name", "Tienda A")
    config_service.set_value("company_name", "Tienda B")
    assert config_service.get("company_name") == "Tienda B"


def test_set_bulk(app, db):
    """set_bulk should update multiple keys at once."""
    result = config_service.set_bulk({
        "company_name": "Negocio X",
        "company_phone": "555-1234",
    })
    assert result["company_name"] == "Negocio X"
    assert result["company_phone"] == "555-1234"
    # Other defaults should still be present
    assert result["default_tax_rate"] == "16.00"


def test_seed_defaults(app, db):
    """seed_defaults should insert default config entries."""
    config_service.seed_defaults()
    result = config_service.get_all()
    assert len(result) >= 8
    assert result["company_name"] == "Mi Negocio"


def test_seed_defaults_preserves_existing(app, db):
    """seed_defaults should not overwrite existing values."""
    config_service.set_value("company_name", "Ya Existe")
    db.session.commit()
    config_service.seed_defaults()
    assert config_service.get("company_name") == "Ya Existe"


# --- API tests ---


def test_get_config_requires_admin(client, db):
    """GET /api/config/ should require admin role."""
    response = client.get("/api/config/")
    assert response.status_code == 401


def test_get_config_non_admin_forbidden(client, regular_user_token, db):
    """GET /api/config/ should reject non-admin users."""
    response = client.get(
        "/api/config/",
        headers={"Authorization": f"Bearer {regular_user_token}"},
    )
    assert response.status_code == 403


def test_get_config_returns_all(client, admin_token, db):
    """GET /api/config/ should return all config values."""
    response = client.get(
        "/api/config/",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 200
    data = response.get_json()
    assert "company_name" in data
    assert "default_tax_rate" in data


def test_get_config_single_key(client, admin_token, db):
    """GET /api/config/<key> should return a specific config value."""
    response = client.get(
        "/api/config/company_name",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 200
    data = response.get_json()
    assert data["key"] == "company_name"
    assert data["value"] == "Mi Negocio"


def test_get_config_key_not_found(client, admin_token, db):
    """GET /api/config/<key> should return 404 for unknown key."""
    response = client.get(
        "/api/config/nonexistent_key",
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert response.status_code == 404


def test_update_config(client, admin_token, db):
    """PUT /api/config/ should update config values."""
    response = client.put(
        "/api/config/",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={"company_name": "Updated Name", "ticket_footer": "Vuelva pronto!"},
    )
    assert response.status_code == 200
    data = response.get_json()
    assert data["company_name"] == "Updated Name"
    assert data["ticket_footer"] == "Vuelva pronto!"


def test_update_config_empty_body(client, admin_token, db):
    """PUT /api/config/ with empty body should return 400."""
    response = client.put(
        "/api/config/",
        headers={"Authorization": f"Bearer {admin_token}"},
        json={},
    )
    assert response.status_code == 400


def test_config_rechaza_secretos_debiles():
    import pytest
    from app import create_app
    from app.config import Config

    class ShortSecretConfig(Config):
        SECRET_KEY = "corta"
        JWT_SECRET_KEY = "clave-suficientemente-larga-pero-la-otra-es-corta"

    with pytest.raises((ValueError, RuntimeError)):
        create_app(ShortSecretConfig)

    class EqualSecretConfig(Config):
        SECRET_KEY = "clave-super-secreta-larga-y-aleatoria-12345"
        JWT_SECRET_KEY = "clave-super-secreta-larga-y-aleatoria-12345"

    with pytest.raises((ValueError, RuntimeError)):
        create_app(EqualSecretConfig)

    class DefaultSecretConfig(Config):
        SECRET_KEY = "cambiar-en-produccion-usar-valor-aleatorio"
        JWT_SECRET_KEY = "clave-jwt-super-secreta-larga-y-aleatoria-12345"

    with pytest.raises((ValueError, RuntimeError)):
        create_app(DefaultSecretConfig)

    class MissingSecretConfig(Config):
        SECRET_KEY = None
        JWT_SECRET_KEY = "clave-jwt-super-secreta-larga-y-aleatoria-12345"

    with pytest.raises((ValueError, RuntimeError)):
        create_app(MissingSecretConfig)


def test_install_scripts_no_usan_credenciales_hardcodeadas():
    from pathlib import Path
    root = Path(__file__).resolve().parents[2]
    setup_db = (root / "setup-db.ps1").read_text(encoding="utf-8")
    install_prod = (root / "install-production.ps1").read_text(encoding="utf-8")

    assert 'pos_pass' not in setup_db
    assert 'secrets' in install_prod.lower()


