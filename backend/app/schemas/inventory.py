"""Marshmallow schemas for inventory endpoints."""
from marshmallow import EXCLUDE, Schema, fields, validate


class StockSchema(Schema):
    """Schema for stock listing/detail responses."""
    id = fields.Int(dump_only=True)
    product_id = fields.Int(dump_only=True)
    product_name = fields.Method("get_product_name")
    sku = fields.Method("get_sku")
    quantity = fields.Decimal(as_string=True, places=3, dump_only=True)
    min_stock = fields.Method("get_min_stock")
    max_stock = fields.Method("get_max_stock")
    last_updated = fields.DateTime(dump_only=True)

    def get_product_name(self, obj):
        return obj.product.name if obj.product else None

    def get_sku(self, obj):
        return obj.product.sku if obj.product else None

    def get_min_stock(self, obj):
        if obj.product:
            return str(obj.product.min_stock)
        return None

    def get_max_stock(self, obj):
        if obj.product:
            return str(obj.product.max_stock)
        return None


class StockMovementSchema(Schema):
    """Schema for stock movement history responses."""
    id = fields.Int(dump_only=True)
    product_id = fields.Int(dump_only=True)
    movement_type = fields.Str(dump_only=True)
    quantity = fields.Decimal(as_string=True, places=3, dump_only=True)
    previous_stock = fields.Decimal(as_string=True, places=3, dump_only=True)
    new_stock = fields.Decimal(as_string=True, places=3, dump_only=True)
    reference_type = fields.Str(dump_only=True, allow_none=True)
    reference_id = fields.Int(dump_only=True, allow_none=True)
    notes = fields.Str(dump_only=True, allow_none=True)
    user_id = fields.Int(dump_only=True)
    username = fields.Method("get_username")
    created_at = fields.DateTime(dump_only=True)

    def get_username(self, obj):
        return obj.user.username if obj.user else None


class StockAdjustSchema(Schema):
    """Schema for manual stock adjustment input."""
    class Meta:
        unknown = EXCLUDE

    product_id = fields.Int(required=True, validate=validate.Range(min=1))
    quantity = fields.Decimal(
        as_string=True,
        required=True,
        places=3,
        validate=validate.Range(min=0),
    )
    notes = fields.Str(load_default=None, allow_none=True)
