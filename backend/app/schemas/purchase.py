"""Marshmallow schemas for supplier and purchase order endpoints."""
from marshmallow import EXCLUDE, Schema, fields, pre_load, validate

from app.schemas.product import MAX_PRICE, MAX_QTY, TAX_RANGE, max_money_decimals, strip_fields
from app.utils.quantities import max_qty_decimals

# Cantidades de partidas y recepciones: > 0, tope del Numeric(12, 3) y máximo 3 decimales (RF-12)
POSITIVE_QTY = [validate.Range(min=0, min_inclusive=False, max=MAX_QTY), max_qty_decimals]


# RFC del SAT: 3 letras (persona moral, 12 caracteres) o 4 (persona física, 13), fecha AAMMDD y homoclave de
# 3 caracteres. "123" o un mes 13 se aceptaban (RF-37)
RFC_REGEX = r"^[A-ZÑ&]{3,4}\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])[A-Z\d]{3}$"
RFC_VALIDATOR = validate.Regexp(
    RFC_REGEX,
    error="RFC no válido: deben ser 12 caracteres (persona moral) o 13 (persona física) con el formato del SAT, "
          "p. ej. ABC010203XY1.",
)


def _normalize_supplier(data):
    """Nombre y RFC sin espacios; RFC en mayúsculas y vacío = sin RFC (RF-21, RF-34, RF-37).

    " adn010101aaa" es el mismo que "ADN010101AAA", y un nombre "   " ya no pasa como válido.
    """
    data = strip_fields(data, ("name",))
    if isinstance(data, dict) and isinstance(data.get("rfc"), str):
        data = dict(data)
        data["rfc"] = data["rfc"].strip().upper() or None
    return data


class SupplierCreateSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    # Largos de las columnas: un teléfono de 25 caracteres daba 500 (RF-12)
    name = fields.Str(required=True, validate=validate.Length(min=1, max=200))
    rfc = fields.Str(load_default=None, allow_none=True, validate=RFC_VALIDATOR)
    contact_name = fields.Str(load_default=None, allow_none=True, validate=validate.Length(max=150))
    phone = fields.Str(load_default=None, allow_none=True, validate=validate.Length(max=20))
    email = fields.Email(load_default=None, allow_none=True, validate=validate.Length(max=120))
    address = fields.Str(load_default=None, allow_none=True)
    payment_terms = fields.Str(load_default=None, allow_none=True, validate=validate.Length(max=100))
    notes = fields.Str(load_default=None, allow_none=True)

    @pre_load
    def _normalize(self, data, **kwargs):
        return _normalize_supplier(data)


class SupplierUpdateSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    name = fields.Str(validate=validate.Length(min=1, max=200))
    rfc = fields.Str(allow_none=True, validate=RFC_VALIDATOR)
    contact_name = fields.Str(allow_none=True, validate=validate.Length(max=150))
    phone = fields.Str(allow_none=True, validate=validate.Length(max=20))
    email = fields.Email(allow_none=True, validate=validate.Length(max=120))
    address = fields.Str(allow_none=True)
    payment_terms = fields.Str(allow_none=True, validate=validate.Length(max=100))
    notes = fields.Str(allow_none=True)

    @pre_load
    def _normalize(self, data, **kwargs):
        return _normalize_supplier(data)


class SupplierSchema(Schema):
    id = fields.Int(dump_only=True)
    name = fields.Str(dump_only=True)
    rfc = fields.Str(dump_only=True, allow_none=True)
    contact_name = fields.Str(dump_only=True, allow_none=True)
    phone = fields.Str(dump_only=True, allow_none=True)
    email = fields.Str(dump_only=True, allow_none=True)
    address = fields.Str(dump_only=True, allow_none=True)
    payment_terms = fields.Str(dump_only=True, allow_none=True)
    notes = fields.Str(dump_only=True, allow_none=True)
    is_active = fields.Bool(dump_only=True)
    created_at = fields.DateTime(dump_only=True)


# --- Purchase Order ---


class PurchaseOrderItemInputSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    product_id = fields.Int(required=True, validate=validate.Range(min=1))
    quantity = fields.Decimal(as_string=True, required=True, validate=POSITIVE_QTY)
    # Sin `places`: un costo de 10.125 se redondeaba en silencio (RF-40)
    unit_cost = fields.Decimal(
        as_string=True, required=True,
        validate=[validate.Range(min=0, min_inclusive=False, max=MAX_PRICE), max_money_decimals],
    )
    tax_rate = fields.Decimal(as_string=True, load_default="16.00", validate=TAX_RANGE)


class PurchaseOrderCreateSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    supplier_id = fields.Int(load_default=None, allow_none=True)
    items = fields.List(
        fields.Nested(PurchaseOrderItemInputSchema),
        required=True,
        # El mensaje genérico decía "Debe tener al menos 1 caracteres" (RF-38)
        validate=validate.Length(min=1, error="La orden debe tener al menos un producto."),
    )
    notes = fields.Str(load_default=None, allow_none=True)
    expected_date = fields.Str(load_default=None, allow_none=True)


class PurchaseOrderItemSchema(Schema):
    id = fields.Int(dump_only=True)
    product_id = fields.Int(dump_only=True)
    product_name = fields.Str(dump_only=True)
    product_sku = fields.Str(dump_only=True)
    quantity = fields.Decimal(as_string=True, places=3, dump_only=True)
    received_quantity = fields.Decimal(as_string=True, places=3, dump_only=True)
    unit_cost = fields.Decimal(as_string=True, places=2, dump_only=True)
    tax_rate = fields.Decimal(as_string=True, places=2, dump_only=True)
    subtotal = fields.Decimal(as_string=True, places=2, dump_only=True)


class PurchaseOrderSchema(Schema):
    id = fields.Int(dump_only=True)
    folio = fields.Str(dump_only=True)
    supplier_id = fields.Int(dump_only=True)
    supplier_name = fields.Method("get_supplier_name")
    user_id = fields.Int(dump_only=True)
    username = fields.Method("get_username")
    status = fields.Str(dump_only=True)
    subtotal = fields.Decimal(as_string=True, places=2, dump_only=True)
    tax_total = fields.Decimal(as_string=True, places=2, dump_only=True)
    total = fields.Decimal(as_string=True, places=2, dump_only=True)
    notes = fields.Str(dump_only=True, allow_none=True)
    expected_date = fields.Date(dump_only=True, allow_none=True)
    created_at = fields.DateTime(dump_only=True)
    items = fields.List(fields.Nested(PurchaseOrderItemSchema), dump_only=True)

    def get_supplier_name(self, obj):
        return obj.supplier.name if obj.supplier else None

    def get_username(self, obj):
        return obj.user.username if obj.user else None


class CloseOrderSchema(Schema):
    """Cierre de una OC parcial: el motivo es opcional (RF-22)."""
    class Meta:
        unknown = EXCLUDE

    notes = fields.Str(load_default=None, allow_none=True, validate=validate.Length(max=500))


class ReceiveItemInputSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    order_item_id = fields.Int(required=True, validate=validate.Range(min=1))
    received_quantity = fields.Decimal(as_string=True, required=True, validate=POSITIVE_QTY)


class ReceiveOrderSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    items = fields.List(
        fields.Nested(ReceiveItemInputSchema),
        required=True,
        validate=validate.Length(min=1, error="Indica al menos un producto recibido."),
    )


class PurchaseOrderListSchema(Schema):
    """Lighter schema for purchase order listings (no items)."""
    id = fields.Int(dump_only=True)
    folio = fields.Str(dump_only=True)
    supplier_name = fields.Method("get_supplier_name")
    status = fields.Str(dump_only=True)
    total = fields.Decimal(as_string=True, places=2, dump_only=True)
    expected_date = fields.Date(dump_only=True, allow_none=True)
    created_at = fields.DateTime(dump_only=True)

    def get_supplier_name(self, obj):
        return obj.supplier.name if obj.supplier else None
