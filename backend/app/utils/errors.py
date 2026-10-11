import re
import traceback
import uuid
from flask import jsonify
from marshmallow import ValidationError

# Mensajes por defecto de Marshmallow traducidos al español (H-28)
_EXACT_MESSAGES = {
    "Missing data for required field.": "Este campo es obligatorio.",
    "Field may not be null.": "Este campo no puede ser nulo.",
    "Invalid value.": "Valor no válido.",
    "Not a valid string.": "No es un texto válido.",
    "Not a valid utf-8 string.": "No es un texto UTF-8 válido.",
    "Not a valid integer.": "No es un número entero válido.",
    "Not a valid number.": "No es un número válido.",
    "Number too large.": "El número es demasiado grande.",
    "Special numeric values (nan or infinity) are not permitted.": "No se permiten valores especiales (NaN o infinito).",
    "Not a valid boolean.": "No es un valor verdadero/falso válido.",
    "Not a valid email address.": "No es un correo electrónico válido.",
    "Not a valid date.": "No es una fecha válida.",
    "Not a valid datetime.": "No es una fecha y hora válida.",
    "Not a valid list.": "No es una lista válida.",
    "Not a valid mapping type.": "No es un objeto válido.",
    "Not a valid UUID.": "No es un UUID válido.",
    "Invalid type.": "Tipo de dato no válido.",
    "Invalid input type.": "Tipo de dato no válido.",
    "Unknown field.": "Campo desconocido.",
}

_RANGE_OPS = {
    "greater than or equal to": "mayor o igual a",
    "greater than": "mayor que",
    "less than or equal to": "menor o igual a",
    "less than": "menor que",
}
_OP = "(greater than or equal to|greater than|less than or equal to|less than)"

_PATTERN_MESSAGES = [
    (re.compile(r"^Length must be between (\S+) and (\S+)\.$"), lambda m: f"Debe tener entre {m[1]} y {m[2]} caracteres."),
    (re.compile(r"^Length must be (\S+)\.$"), lambda m: f"Debe tener exactamente {m[1]} caracteres."),
    (re.compile(r"^Shorter than minimum length (\S+)\.$"), lambda m: f"Debe tener al menos {m[1]} caracteres."),
    (re.compile(r"^Longer than maximum length (\S+)\.$"), lambda m: f"Debe tener como máximo {m[1]} caracteres."),
    (
        re.compile(rf"^Must be {_OP} (\S+) and {_OP} (\S+)\.$"),
        lambda m: f"Debe ser {_RANGE_OPS[m[1]]} {m[2]} y {_RANGE_OPS[m[3]]} {m[4]}.",
    ),
    (re.compile(rf"^Must be {_OP} (\S+)\.$"), lambda m: f"Debe ser {_RANGE_OPS[m[1]]} {m[2]}."),
    (re.compile(r"^Must be one of: (.*)\.$"), lambda m: f"Debe ser uno de: {m[1]}."),
    (re.compile(r'^"(.*)" cannot be formatted as a (date|datetime)\.$'), lambda m: f'"{m[1]}" no tiene un formato de fecha válido.'),
]


def _translate_message(message):
    if not isinstance(message, str):
        return message
    if message in _EXACT_MESSAGES:
        return _EXACT_MESSAGES[message]
    for pattern, build in _PATTERN_MESSAGES:
        match = pattern.match(message)
        if match:
            return build(match)
    return message


def translate_messages(messages):
    """Traduce recursivamente los mensajes de error de Marshmallow (dict/list/str)."""
    if isinstance(messages, dict):
        return {key: translate_messages(value) for key, value in messages.items()}
    if isinstance(messages, list):
        return [translate_messages(value) for value in messages]
    return _translate_message(messages)


# Códigos SQLSTATE de conflicto entre transacciones: el cliente puede reintentar (OPS-09)
_RETRYABLE_SQLSTATES = {"40P01", "40001"}  # deadlock_detected, serialization_failure


def register_error_handlers(app):
    from sqlalchemy.exc import IntegrityError, OperationalError

    from app.extensions import db
    from app.utils.timeutil import InvalidDateError

    @app.errorhandler(ValidationError)
    def handle_validation_error(e):
        return jsonify({"error": "Datos inválidos", "details": translate_messages(e.messages)}), 422

    @app.errorhandler(IntegrityError)
    def handle_integrity_error(e):
        # Un UNIQUE, FK o CHECK que la validación previa no atrapó (carrera entre dos peticiones)
        db.session.rollback()
        app.logger.warning("Conflicto de integridad: %s", e.orig)
        return jsonify({
            "error": "Conflicto con datos existentes: el registro ya existe o fue modificado por otra operación.",
            "code": "integrity_conflict",
        }), 409

    @app.errorhandler(InvalidDateError)
    def handle_invalid_date(e):
        return jsonify({"error": str(e)}), 400

    @app.errorhandler(OperationalError)
    def handle_operational_error(e):
        db.session.rollback()
        if getattr(e.orig, "pgcode", None) in _RETRYABLE_SQLSTATES or "deadlock" in str(e.orig).lower():
            app.logger.warning("Conflicto de concurrencia (reintentable): %s", e.orig)
            return jsonify({
                "error": "Otra operación modificó los mismos datos al mismo tiempo; intenta de nuevo.",
                "code": "conflict_retry",
            }), 409
        return handle_internal_error(e)

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
