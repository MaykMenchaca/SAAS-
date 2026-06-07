"""Marshmallow schemas for inventory endpoints."""
from marshmallow import EXCLUDE, Schema, fields, validate


class StockSchema(Schema):
    """Schema for stock listing/detail responses."""
    id = fields.Int(dump_only=True)
    product_id = fields.Int(dump_only=True)
    product_name = fields.Method("get_product_name")
    sku = fields.Method("get_sku")
    quantity = fields.Decimal(as_string=True, places=3, dump_only=True)
    unit_abbreviation = fields.Method("get_unit_abbreviation")
    min_stock = fields.Method("get_min_stock")
    max_stock = fields.Method("get_max_stock")
    last_updated = fields.DateTime(dump_only=True)

    def get_product_name(self, obj):
        return obj.product.name if obj.product else None

    def get_sku(self, obj):
        return obj.product.sku if obj.product else None

    def get_unit_abbreviation(self, obj):
        if obj.product and obj.product.unit:
            return obj.product.unit.abbreviation
        return None

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


# --- Inventory Count ---


class InventoryCountCreateSchema(Schema):
    """Schema for creating a new inventory count."""
    class Meta:
        unknown = EXCLUDE

    notes = fields.Str(load_default=None, allow_none=True)


class InventoryCountCaptureSchema(Schema):
    """Schema for capturing a counted quantity for one item."""
    class Meta:
        unknown = EXCLUDE

    counted_quantity = fields.Decimal(
        as_string=True,
        required=True,
        places=3,
        validate=validate.Range(min=0),
    )
    notes = fields.Str(load_default=None, allow_none=True)


class InventoryCountItemSchema(Schema):
    """Schema for inventory count item responses."""
    id = fields.Int(dump_only=True)
    product_id = fields.Int(dump_only=True)
    product_name = fields.Method("get_product_name")
    product_sku = fields.Method("get_product_sku")
    expected_quantity = fields.Decimal(as_string=True, places=3, dump_only=True)
    counted_quantity = fields.Decimal(as_string=True, places=3, dump_only=True, allow_none=True)
    difference = fields.Decimal(as_string=True, places=3, dump_only=True, allow_none=True)
    notes = fields.Str(dump_only=True, allow_none=True)

    def get_product_name(self, obj):
        return obj.product.name if obj.product else None

    def get_product_sku(self, obj):
        return obj.product.sku if obj.product else None


class InventoryCountSchema(Schema):
    """Schema for inventory count detail responses."""
    id = fields.Int(dump_only=True)
    user_id = fields.Int(dump_only=True)
    username = fields.Method("get_username")
    status = fields.Str(dump_only=True)
    notes = fields.Str(dump_only=True, allow_none=True)
    created_at = fields.DateTime(dump_only=True)
    closed_at = fields.DateTime(dump_only=True, allow_none=True)
    closed_by = fields.Int(dump_only=True, allow_none=True)
    closed_by_username = fields.Method("get_closer_name")
    items = fields.List(fields.Nested(InventoryCountItemSchema), dump_only=True)
    total_items = fields.Method("get_total_items")
    counted_items = fields.Method("get_counted_items")

    def get_username(self, obj):
        return obj.user.username if obj.user else None

    def get_closer_name(self, obj):
        return obj.closer.username if obj.closer else None

    def get_total_items(self, obj):
        return len(obj.items) if obj.items else 0

    def get_counted_items(self, obj):
        if not obj.items:
            return 0
        return sum(1 for i in obj.items if i.counted_quantity is not None)


class InventoryCountListSchema(Schema):
    """Lighter schema for inventory count listings (no items)."""
    id = fields.Int(dump_only=True)
    username = fields.Method("get_username")
    status = fields.Str(dump_only=True)
    notes = fields.Str(dump_only=True, allow_none=True)
    created_at = fields.DateTime(dump_only=True)
    closed_at = fields.DateTime(dump_only=True, allow_none=True)
    total_items = fields.Method("get_total_items")
    counted_items = fields.Method("get_counted_items")

    def get_username(self, obj):
        return obj.user.username if obj.user else None

    def get_total_items(self, obj):
        return len(obj.items) if obj.items else 0

    def get_counted_items(self, obj):
        if not obj.items:
            return 0
        return sum(1 for i in obj.items if i.counted_quantity is not None)
