from decimal import Decimal

from marshmallow import EXCLUDE, Schema, ValidationError, fields, post_load, pre_load, validate

from app.utils.quantities import decimals_of, max_qty_decimals

# Topes de las columnas para responder 422 y no 500 por desbordamiento (RF-12). El precio por unidad se
# limita por debajo del Numeric(12, 2) para que el total de una venta con IVA siga cabiendo
MAX_PRICE = Decimal("99999999.99")
MAX_QTY = Decimal("999999999.999")  # Numeric(12, 3)
MONEY_DECIMALS = 2


def max_money_decimals(value) -> None:
    """Validador: máximo 2 decimales en precios, costos e IVA; 10.125 ya no se redondea en silencio (RF-40)."""
    if decimals_of(value) > MONEY_DECIMALS:
        raise ValidationError(f"Admite como máximo {MONEY_DECIMALS} decimales")


# Sin `places` al cargar: redondearía 10.125 a 10.12 antes de validar (RF-40)
PRICE_RANGE = [validate.Range(min=0, max=MAX_PRICE), max_money_decimals]
TAX_RANGE = [validate.Range(min=0, max=100), max_money_decimals]  # porcentaje de IVA
QTY_VALIDATORS = [validate.Range(min=0, max=MAX_QTY), max_qty_decimals]


def quantize_money(data, names):
    """Ya validados (máx. 2 decimales), se dejan con 2: "180" y "180.00" quedan igual en la auditoría (RF-40)."""
    for name in names:
        if data.get(name) is not None:
            data[name] = data[name].quantize(Decimal("0.01"))
    return data


MONEY_FIELDS = ("purchase_price", "sale_price", "tax_rate")


def strip_fields(data, names):
    """Recorta espacios de los campos de texto indicados (RF-17, RF-18)."""
    if not isinstance(data, dict):
        return data
    data = dict(data)
    for name in names:
        if isinstance(data.get(name), str):
            data[name] = data[name].strip()
    return data


class CategorySchema(Schema):
    id = fields.Int(dump_only=True)
    name = fields.Str(required=True, validate=validate.Length(min=1, max=100))
    description = fields.Str(allow_none=True, validate=validate.Length(max=200))
    is_active = fields.Bool(dump_only=True)
    created_at = fields.DateTime(dump_only=True)

    @pre_load
    def _strip(self, data, **kwargs):
        # "   " pasaba la validación de largo y se guardaba como "" (RF-34)
        return strip_fields(data, ("name",))


class CategoryUpdateSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    name = fields.Str(validate=validate.Length(min=1, max=100))
    description = fields.Str(allow_none=True, validate=validate.Length(max=200))
    is_active = fields.Bool()

    @pre_load
    def _strip(self, data, **kwargs):
        return strip_fields(data, ("name",))  # RF-34


class UnitOfMeasureSchema(Schema):
    id = fields.Int(dump_only=True)
    name = fields.Str(required=True, validate=validate.Length(min=1, max=50))
    abbreviation = fields.Str(required=True, validate=validate.Length(min=1, max=10))
    allows_fractions = fields.Bool(load_default=False)

    @pre_load
    def _strip(self, data, **kwargs):
        # "GALÓN " y "   " no son nombres distintos ni válidos (RF-18)
        return strip_fields(data, ("name", "abbreviation"))


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
    stock_qty = fields.Method("get_stock_qty", dump_only=True)

    def get_stock_qty(self, obj):
        return str(obj.stock.quantity) if obj.stock else "0.000"


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
        validate=PRICE_RANGE,
    )
    # Se ignora (lo calcula el sistema) y lleva 4 decimales: solo se valida el rango
    avg_cost = fields.Decimal(
        as_string=True,
        load_default=Decimal("0.00"),
        validate=validate.Range(min=0, max=MAX_PRICE),
    )
    sale_price = fields.Decimal(
        as_string=True,
        required=True,
        validate=PRICE_RANGE,
    )
    tax_rate = fields.Decimal(
        as_string=True,
        load_default=Decimal("16.00"),
        validate=TAX_RANGE,
    )
    # Sin `places`: redondearía en silencio 1.0004 a 1.000 antes de validar los decimales (RF-12)
    min_stock = fields.Decimal(as_string=True, load_default=Decimal("0.000"), validate=QTY_VALIDATORS)
    max_stock = fields.Decimal(as_string=True, load_default=Decimal("0.000"), validate=QTY_VALIDATORS)

    @pre_load
    def _strip(self, data, **kwargs):
        # "MART-001 " es el mismo SKU que "MART-001" (RF-17)
        return strip_fields(data, ("sku", "barcode", "name"))

    @post_load
    def _money(self, data, **kwargs):
        return quantize_money(data, MONEY_FIELDS)


class ProductUpdateSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    sku = fields.Str(validate=validate.Length(min=1, max=50))
    barcode = fields.Str(allow_none=True, validate=validate.Length(max=100))
    name = fields.Str(validate=validate.Length(min=1, max=200))
    description = fields.Str(allow_none=True)
    category_id = fields.Int(allow_none=True, validate=validate.Range(min=1))
    unit_id = fields.Int(validate=validate.Range(min=1))
    purchase_price = fields.Decimal(as_string=True, validate=PRICE_RANGE)
    avg_cost = fields.Decimal(dump_only=True)
    sale_price = fields.Decimal(as_string=True, validate=PRICE_RANGE)
    tax_rate = fields.Decimal(as_string=True, validate=TAX_RANGE)
    min_stock = fields.Decimal(as_string=True, validate=QTY_VALIDATORS)
    max_stock = fields.Decimal(as_string=True, validate=QTY_VALIDATORS)
    is_active = fields.Bool()

    @pre_load
    def _strip(self, data, **kwargs):
        return strip_fields(data, ("sku", "barcode", "name"))

    @post_load
    def _money(self, data, **kwargs):
        return quantize_money(data, MONEY_FIELDS)
