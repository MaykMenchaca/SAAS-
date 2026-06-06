from decimal import Decimal

from marshmallow import EXCLUDE, Schema, fields, validate


class CategorySchema(Schema):
    id = fields.Int(dump_only=True)
    name = fields.Str(required=True, validate=validate.Length(min=1, max=100))
    description = fields.Str(allow_none=True, validate=validate.Length(max=200))
    is_active = fields.Bool(dump_only=True)
    created_at = fields.DateTime(dump_only=True)


class CategoryUpdateSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    name = fields.Str(validate=validate.Length(min=1, max=100))
    description = fields.Str(allow_none=True, validate=validate.Length(max=200))
    is_active = fields.Bool()


class UnitOfMeasureSchema(Schema):
    id = fields.Int(dump_only=True)
    name = fields.Str(dump_only=True)
    abbreviation = fields.Str(dump_only=True)
    allows_fractions = fields.Bool(dump_only=True)


class ProductSchema(Schema):
    id = fields.Int(dump_only=True)
    sku = fields.Str(dump_only=True)
    barcode = fields.Str(dump_only=True, allow_none=True)
    name = fields.Str(dump_only=True)
    description = fields.Str(dump_only=True, allow_none=True)
    category_id = fields.Int(dump_only=True, allow_none=True)
    unit_id = fields.Int(dump_only=True)
    purchase_price = fields.Decimal(as_string=True, dump_only=True, places=2)
    avg_cost = fields.Decimal(as_string=True, dump_only=True, places=2)
    sale_price = fields.Decimal(as_string=True, dump_only=True, places=2)
    tax_rate = fields.Decimal(as_string=True, dump_only=True, places=2)
    min_stock = fields.Decimal(as_string=True, dump_only=True, places=3)
    max_stock = fields.Decimal(as_string=True, dump_only=True, places=3)
    is_active = fields.Bool(dump_only=True)
    created_at = fields.DateTime(dump_only=True)
    updated_at = fields.DateTime(dump_only=True)
    category = fields.Nested(CategorySchema, dump_only=True, allow_none=True)
    unit = fields.Nested(UnitOfMeasureSchema, dump_only=True)


class ProductCreateSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    sku = fields.Str(required=True, validate=validate.Length(min=1, max=50))
    barcode = fields.Str(allow_none=True, validate=validate.Length(max=100))
    name = fields.Str(required=True, validate=validate.Length(min=1, max=200))
    description = fields.Str(allow_none=True)
    category_id = fields.Int(allow_none=True, validate=validate.Range(min=1))
    unit_id = fields.Int(required=True, validate=validate.Range(min=1))
    purchase_price = fields.Decimal(
        as_string=True,
        load_default=Decimal("0.00"),
        places=2,
        validate=validate.Range(min=0),
    )
    avg_cost = fields.Decimal(
        as_string=True,
        load_default=Decimal("0.00"),
        places=2,
        validate=validate.Range(min=0),
    )
    sale_price = fields.Decimal(
        as_string=True,
        required=True,
        places=2,
        validate=validate.Range(min=0),
    )
    tax_rate = fields.Decimal(
        as_string=True,
        load_default=Decimal("16.00"),
        places=2,
        validate=validate.Range(min=0),
    )
    min_stock = fields.Decimal(
        as_string=True,
        load_default=Decimal("0.000"),
        places=3,
        validate=validate.Range(min=0),
    )
    max_stock = fields.Decimal(
        as_string=True,
        load_default=Decimal("0.000"),
        places=3,
        validate=validate.Range(min=0),
    )


class ProductUpdateSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    sku = fields.Str(validate=validate.Length(min=1, max=50))
    barcode = fields.Str(allow_none=True, validate=validate.Length(max=100))
    name = fields.Str(validate=validate.Length(min=1, max=200))
    description = fields.Str(allow_none=True)
    category_id = fields.Int(allow_none=True, validate=validate.Range(min=1))
    unit_id = fields.Int(validate=validate.Range(min=1))
    purchase_price = fields.Decimal(as_string=True, places=2, validate=validate.Range(min=0))
    avg_cost = fields.Decimal(as_string=True, places=2, validate=validate.Range(min=0))
    sale_price = fields.Decimal(as_string=True, places=2, validate=validate.Range(min=0))
    tax_rate = fields.Decimal(as_string=True, places=2, validate=validate.Range(min=0))
    min_stock = fields.Decimal(as_string=True, places=3, validate=validate.Range(min=0))
    max_stock = fields.Decimal(as_string=True, places=3, validate=validate.Range(min=0))
    is_active = fields.Bool()
