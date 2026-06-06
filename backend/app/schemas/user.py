from marshmallow import EXCLUDE, Schema, fields, validate


class UserSchema(Schema):
    id = fields.Int(dump_only=True)
    username = fields.Str(dump_only=True)
    email = fields.Email(dump_only=True)
    full_name = fields.Str(dump_only=True)
    role_id = fields.Int(dump_only=True)
    role = fields.Method("get_role", dump_only=True)
    permissions = fields.Method("get_permissions", dump_only=True)
    is_active = fields.Bool(dump_only=True)
    last_login_at = fields.DateTime(dump_only=True, allow_none=True)
    created_at = fields.DateTime(dump_only=True)
    updated_at = fields.DateTime(dump_only=True)

    def get_role(self, user):
        return user.role_name

    def get_permissions(self, user):
        return user.permissions


class UserCreateSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    username = fields.Str(required=True, validate=validate.Length(min=3, max=80))
    email = fields.Email(required=True)
    full_name = fields.Str(required=True, validate=validate.Length(min=1, max=150))
    password = fields.Str(required=True, load_only=True, validate=validate.Length(min=8, max=128))
    role_id = fields.Int(required=True, validate=validate.Range(min=1))


class UserUpdateSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    username = fields.Str(validate=validate.Length(min=3, max=80))
    email = fields.Email()
    full_name = fields.Str(validate=validate.Length(min=1, max=150))
    password = fields.Str(load_only=True, validate=validate.Length(min=8, max=128))
    role_id = fields.Int(validate=validate.Range(min=1))
    is_active = fields.Bool()


class RoleSchema(Schema):
    id = fields.Int(dump_only=True)
    name = fields.Str(dump_only=True)
    description = fields.Str(dump_only=True, allow_none=True)
    is_active = fields.Bool(dump_only=True)
