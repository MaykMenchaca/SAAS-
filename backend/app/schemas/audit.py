"""Marshmallow schemas for audit log endpoints."""
from marshmallow import Schema, fields


class AuditLogSchema(Schema):
    id = fields.Int(dump_only=True)
    user_id = fields.Int(dump_only=True, allow_none=True)
    username = fields.Str(dump_only=True, allow_none=True)
    action = fields.Str(dump_only=True)
    entity_type = fields.Str(dump_only=True, allow_none=True)
    entity_id = fields.Int(dump_only=True, allow_none=True)
    details = fields.Dict(dump_only=True, allow_none=True)
    ip_address = fields.Str(dump_only=True, allow_none=True)
    created_at = fields.DateTime(dump_only=True)
