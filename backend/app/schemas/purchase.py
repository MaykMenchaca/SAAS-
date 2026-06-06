"""Marshmallow schemas for supplier and purchase order endpoints."""
from marshmallow import EXCLUDE, Schema, fields, validate


class SupplierCreateSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    name = fields.Str(required=True, validate=validate.Length(min=1, max=200))
    rfc = fields.Str(load_default=None, allow_none=True, validate=validate.Length(max=13))
    contact_name = fields.Str(load_default=None, allow_none=True)
    phone = fields.Str(load_default=None, allow_none=True)
    email = fields.Email(load_default=None, allow_none=True)
    address = fields.Str(load_default=None, allow_none=True)
    payment_terms = fields.Str(load_default=None, allow_none=True)
    notes = fields.Str(load_default=None, allow_none=True)


class SupplierUpdateSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    name = fields.Str(validate=validate.Length(min=1, max=200))
    rfc = fields.Str(allow_none=True, validate=validate.Length(max=13))
    contact_name = fields.Str(allow_none=True)
    phone = fields.Str(allow_none=True)
    email = fields.Email(allow_none=True)
    address = fields.Str(allow_none=True)
    payment_terms = fields.Str(allow_none=True)
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
