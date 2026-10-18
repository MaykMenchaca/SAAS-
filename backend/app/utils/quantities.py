"""Reglas de cantidades de productos (RF-02, RF-03).

Las existencias y las partidas se guardan con 3 decimales (Numeric(12, 3)). Una cantidad con más decimales
se redondeaba en silencio en un lado y no en el otro (precio calculado con 2.0004 y stock con 2.000), así que
se rechaza de entrada. Las unidades sin fracciones (pieza, caja) solo aceptan enteros en todos los flujos.
"""
from decimal import Decimal, InvalidOperation

from marshmallow import ValidationError

QTY_DECIMALS = 3


def decimals_of(value: Decimal) -> int:
    """Número de decimales significativos (2.0010 → 3, 5 → 0)."""
    exponent = value.normalize().as_tuple().exponent
    return -exponent if isinstance(exponent, int) and exponent < 0 else 0


def max_qty_decimals(value) -> None:
    """Validador de marshmallow: máximo 3 decimales en una cantidad."""
    try:
        dec = value if isinstance(value, Decimal) else Decimal(str(value))
    except (InvalidOperation, ValueError) as exc:
        raise ValidationError("Cantidad inválida") from exc
    if not dec.is_finite():
        raise ValidationError("Cantidad inválida")
    if decimals_of(dec) > QTY_DECIMALS:
        raise ValidationError(f"La cantidad admite como máximo {QTY_DECIMALS} decimales")


def validate_quantity(qty: Decimal, unit, product_name: str) -> None:
    """Regla de negocio de una cantidad para un producto. Lanza ValueError (400) si no cumple."""
    if qty <= Decimal("0"):
        raise ValueError("La cantidad debe ser mayor a 0")
    if decimals_of(qty) > QTY_DECIMALS:
        raise ValueError(f"La cantidad admite como máximo {QTY_DECIMALS} decimales")
    if unit is not None and not unit.allows_fractions and qty % Decimal("1") != Decimal("0"):
        raise ValueError(f"El producto '{product_name}' no permite cantidades fraccionarias")
