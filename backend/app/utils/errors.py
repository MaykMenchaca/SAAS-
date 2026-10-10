import traceback
import uuid
from flask import jsonify
from marshmallow import ValidationError


def register_error_handlers(app):
    @app.errorhandler(ValidationError)
    def handle_validation_error(e):
        return jsonify({"error": "Datos inválidos", "details": e.messages}), 422

    @app.errorhandler(404)
    def handle_not_found(e):
        return jsonify({"error": "Recurso no encontrado"}), 404

    @app.errorhandler(500)
    @app.errorhandler(Exception)
    def handle_internal_error(e):
        error_id = uuid.uuid4().hex[:12]
        tb = traceback.format_exc()
        app.logger.error(f"[ERROR_ID: {error_id}] Excepción no manejada: {e}\n{tb}")
        return jsonify({
            "error": "Error interno del servidor",
            "error_id": error_id,
        }), 500
