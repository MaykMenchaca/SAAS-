"""Marshmallow schemas for supplier and purchase order endpoints."""
from marshmallow import EXCLUDE, Schema, fields, validate

from app.schemas.product import MAX_PRICE, MAX_QTY, TAX_RANGE
from app.utils.quantities import max_qty_decimals

# Cantidades de partidas y recepciones: > 0, tope del Numeric(12, 3) y máximo 3 decimales (RF-12)
POSITIVE_QTY = [validate.Range(min=0, min_inclusive=False, max=MAX_QTY), max_qty_decimals]


class SupplierCreateSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    # Largos de las columnas: un teléfono de 25 caracteres daba 500 (RF-12)
    name = fields.Str(required=True, validate=validate.Length(min=1, max=200))
    rfc = fields.Str(load_default=None, allow_none=True, validate=validate.Length(max=13))
    contact_name = fields.Str(load_default=None, allow_none=True, validate=validate.Length(max=150))
    phone = fields.Str(load_default=None, allow_none=True, validate=validate.Length(max=20))
    email = fields.Email(load_default=None, allow_none=True, validate=validate.Length(max=120))
    address = fields.Str(load_default=None, allow_none=True)
    payment_terms = fields.Str(load_default=None, allow_none=True, validate=validate.Length(max=100))
    notes = fields.Str(load_default=None, allow_none=True)


class SupplierUpdateSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    name = fields.Str(validate=validate.Length(min=1, max=200))
    rfc = fields.Str(allow_none=True, validate=validate.Length(max=13))
    contact_name = fields.Str(allow_none=True, validate=validate.Length(max=150))
    phone = fields.Str(allow_none=True, validate=validate.Length(max=20))
    email = fields.Email(allow_none=True, validate=validate.Length(max=120))
    address = fields.Str(allow_none=True)
    payment_terms = fields.Str(allow_none=True, validate=validate.Length(max=100))
    notes = fields.Str(allow_none=True)


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
    unit_cost = fields.Decimal(
        as_string=True, required=True, places=2,
        validate=validate.Range(min=0, min_inclusive=False, max=MAX_PRICE),
    )
    tax_rate = fields.Decimal(as_string=True, load_default="16.00", places=2, validate=TAX_RANGE)


class PurchaseOrderCreateSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    supplier_id = fields.Int(load_default=None, allow_none=True)
    items = fields.List(
        fields.Nested(PurchaseOrderItemInputSchema),
        required=True,
        validate=validate.Length(min=1),
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
        validate=validate.Length(min=1),
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
