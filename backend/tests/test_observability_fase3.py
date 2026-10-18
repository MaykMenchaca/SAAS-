"""Tests de Subfase 3.4: Logs, health mejorado y error_id (H-36)."""
from logging.handlers import RotatingFileHandler
from unittest.mock import patch
import pytest
from flask import Flask


def test_blueprint_import_failure_raises():
    """Si un blueprint falla al importarse, no debe silenciarse con pass; debe fallar al arrancar."""
    from app.api import register_blueprints

    test_app = Flask("test_failing_bp")
    with patch("app.api.BLUEPRINTS", [("app.api.non_existent_module_foo", "foo_bp", "/api/foo")]):
        with pytest.raises((ImportError, AttributeError, RuntimeError)):
            register_blueprints(test_app)


def test_health_includes_disk_space(client, db):
    """GET /api/health debe incluir información de espacio en disco."""
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.get_json()
    assert "disk" in data or "disk_free_gb" in data, f"Falta información de disco en /api/health: {data}"
    if "disk" in data:
        disk = data["disk"]
        assert "free_gb" in disk
        assert "total_gb" in disk


def test_500_error_returns_error_id_and_logs():
    """Un error 500 no capturado debe devolver error_id y registrarlo en logs."""
    from app import create_app
    from app.config import TestConfig

    test_app = create_app(TestConfig)

    @test_app.route("/api/test-trigger-500")
    def trigger_500():
        raise RuntimeError("Fallo deliberado para probar error_id")

    test_client = test_app.test_client()
    with patch.object(test_app.logger, "error") as mock_log_error:
        response = test_client.get("/api/test-trigger-500")
        assert response.status_code == 500
        data = response.get_json()
        assert "error_id" in data, f"Falta error_id en respuesta 500: {data}"
        assert data["error"] == "Error interno del servidor"
        assert len(data["error_id"]) >= 8

        assert mock_log_error.called
        log_msg = str(mock_log_error.call_args)
        assert data["error_id"] in log_msg


def test_rotating_file_handler_configured(app):
    """La app debe tener un RotatingFileHandler configurado para logs/pos.log."""
    handlers = app.logger.handlers
    rotating_handlers = [h for h in handlers if isinstance(h, RotatingFileHandler)]
    assert len(rotating_handlers) >= 1, "Falta RotatingFileHandler en app.logger"
    assert "pos.log" in str(rotating_handlers[0].baseFilename)
