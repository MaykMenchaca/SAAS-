"""Marshmallow schemas for sale and cash register endpoints."""
from marshmallow import EXCLUDE, Schema, fields, validate


# --- Cash Register ---


class CashRegisterSessionOpenSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    cash_register_id = fields.Int(required=True, validate=validate.Range(min=1))
    opening_amount = fields.Decimal(
        as_string=True, required=True, places=2, validate=validate.Range(min=0)
    )


class CashRegisterSessionCloseSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    closing_amount = fields.Decimal(
        as_string=True, required=True, places=2, validate=validate.Range(min=0)
    )
    close_notes = fields.Str(load_default=None, allow_none=True)


class CashRegisterSessionSchema(Schema):
    id = fields.Int(dump_only=True)
    cash_register_id = fields.Int(dump_only=True)
    cash_register_name = fields.Method("get_register_name")
    user_id = fields.Int(dump_only=True)
    username = fields.Method("get_username")
    opening_amount = fields.Decimal(as_string=True, places=2, dump_only=True)
    closing_amount = fields.Decimal(as_string=True, places=2, dump_only=True, allow_none=True)
    expected_cash = fields.Decimal(as_string=True, places=2, dump_only=True, allow_none=True)
    difference = fields.Decimal(as_string=True, places=2, dump_only=True, allow_none=True)
    status = fields.Str(dump_only=True)
    opened_at = fields.DateTime(dump_only=True)
    closed_at = fields.DateTime(dump_only=True, allow_none=True)
    close_notes = fields.Str(dump_only=True, allow_none=True)

    def get_register_name(self, obj):
        return obj.cash_register.name if obj.cash_register else None

    def get_username(self, obj):
        return obj.user.username if obj.user else None


# --- Sale ---


class SaleItemInputSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    product_id = fields.Int(required=True, validate=validate.Range(min=1))
    quantity = fields.Decimal(as_string=True, required=True, validate=validate.Range(min=0, min_inclusive=False))
    unit_price = fields.Decimal(as_string=True, required=False, load_default=None, places=2, validate=validate.Range(min=0))
    tax_rate = fields.Decimal(as_string=True, required=False, load_default=None, places=2, validate=validate.Range(min=0))
    discount_percent = fields.Decimal(
        as_string=True, load_default="0", places=2, validate=validate.Range(min=0, max=100)
    )


class PaymentInputSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    method = fields.Str(required=True, validate=validate.OneOf(["efectivo", "tarjeta", "transferencia"]))
    amount = fields.Decimal(as_string=True, required=True, places=2, validate=validate.Range(min=0, min_inclusive=False))
    reference = fields.Str(load_default=None, allow_none=True)
    change_amount = fields.Decimal(as_string=True, load_default="0", places=2, validate=validate.Range(min=0))


class SaleCreateSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    session_id = fields.Int(required=True, validate=validate.Range(min=1))
    items = fields.List(fields.Nested(SaleItemInputSchema), required=True, validate=validate.Length(min=1))
    payments = fields.List(fields.Nested(PaymentInputSchema), required=True, validate=validate.Length(min=1))


class SaleCancelSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    reason = fields.Str(required=True, validate=validate.Length(min=1))


# --- Output schemas ---


class SaleItemSchema(Schema):
    id = fields.Int(dump_only=True)
    product_id = fields.Int(dump_only=True)
    product_name = fields.Str(dump_only=True)
    product_sku = fields.Str(dump_only=True)
    quantity = fields.Decimal(as_string=True, places=3, dump_only=True)
    unit_price = fields.Decimal(as_string=True, places=2, dump_only=True)
    discount_percent = fields.Decimal(as_string=True, places=2, dump_only=True)
    discount_amount = fields.Decimal(as_string=True, places=2, dump_only=True)
    tax_rate = fields.Decimal(as_string=True, places=2, dump_only=True)
    subtotal = fields.Decimal(as_string=True, places=2, dump_only=True)
    cost_at_sale = fields.Decimal(as_string=True, places=2, dump_only=True)


class PaymentSchema(Schema):
    id = fields.Int(dump_only=True)
    method = fields.Str(dump_only=True)
    amount = fields.Decimal(as_string=True, places=2, dump_only=True)
    reference = fields.Str(dump_only=True, allow_none=True)
    change_amount = fields.Decimal(as_string=True, places=2, dump_only=True)


class SaleSchema(Schema):
    id = fields.Int(dump_only=True)
    folio = fields.Str(dump_only=True)
    session_id = fields.Int(dump_only=True)
    user_id = fields.Int(dump_only=True)
    username = fields.Method("get_username")
    subtotal = fields.Decimal(as_string=True, places=2, dump_only=True)
    discount_total = fields.Decimal(as_string=True, places=2, dump_only=True)
    tax_total = fields.Decimal(as_string=True, places=2, dump_only=True)
    total = fields.Decimal(as_string=True, places=2, dump_only=True)
    status = fields.Str(dump_only=True)
    cancel_reason = fields.Str(dump_only=True, allow_none=True)
    created_at = fields.DateTime(dump_only=True)
    items = fields.List(fields.Nested(SaleItemSchema), dump_only=True)
    payments = fields.List(fields.Nested(PaymentSchema), dump_only=True)

    def get_username(self, obj):
        return obj.user.username if obj.user else None


class SaleReturnItemInputSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    sale_item_id = fields.Int(required=True, validate=validate.Range(min=1))
    quantity = fields.Decimal(as_string=True, required=True, validate=validate.Range(min=0, min_inclusive=False))


class SaleReturnCreateSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    reason = fields.Str(required=True, validate=validate.Length(min=1))
    items = fields.List(
        fields.Nested(SaleReturnItemInputSchema), required=True, validate=validate.Length(min=1)
    )


class SaleReturnItemSchema(Schema):
    id = fields.Int(dump_only=True)
    sale_item_id = fields.Int(dump_only=True)
    product_id = fields.Int(dump_only=True)
    quantity = fields.Decimal(as_string=True, places=3, dump_only=True)
    refund_amount = fields.Decimal(as_string=True, places=2, dump_only=True)


class SaleReturnSchema(Schema):
    id = fields.Int(dump_only=True)
    sale_id = fields.Int(dump_only=True)
    status = fields.Method("get_sale_status")
    reason = fields.Str(dump_only=True)
    refund_total = fields.Decimal(as_string=True, places=2, dump_only=True)
    created_at = fields.DateTime(dump_only=True)
    returned_items = fields.List(fields.Nested(SaleReturnItemSchema), attribute="items", dump_only=True)

    def get_sale_status(self, obj):
        return obj.sale.status if obj.sale else None


class SaleListSchema(Schema):
    """Lighter schema for sale listings (no items/payments)."""
    id = fields.Int(dump_only=True)
    folio = fields.Str(dump_only=True)
    total = fields.Decimal(as_string=True, places=2, dump_only=True)
    status = fields.Str(dump_only=True)
    created_at = fields.DateTime(dump_only=True)
    username = fields.Method("get_username")

    def get_username(self, obj):
        return obj.user.username if obj.user else None
