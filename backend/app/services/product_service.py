import unicodedata

from marshmallow import ValidationError
from sqlalchemy import or_, func

from app.extensions import db
from app.models.inventory import Stock
from app.models.product import Category, Product, UnitOfMeasure
from app.utils.decorators import with_rollback

# Umbral de word_similarity calibrado con QA-18: "martilo", "tornilo", "pintrua" y "foko led"
# quedan >= 0.5, y el ruido ("martillo" contra "Tornillo") queda en 0.36.
SEARCH_SIMILARITY_THRESHOLD = 0.4


def escape_like(text: str) -> str:
    """Escapa los comodines de LIKE: buscar "%" o "_" devolvía todos los productos (RF-35)."""
    return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def changed_fields(obj, data: dict) -> dict:
    """Solo los campos cuyo valor cambia: un PATCH sin cambios no se audita (RF-39)."""
    return {field: value for field, value in data.items() if getattr(obj, field) != value}


class ProductService:
    @staticmethod
    def search_condition(search: str):
        """Condición y relevancia de la búsqueda de productos, compartida con /inventory/stock (RF-35).

        SKU, código de barras y nombre por subcadena (con los comodines escapados), más similitud de trigramas
        sobre el nombre para tolerar errores de dedo ("tornilo" encuentra "Tornillo").
        """
        search = search.strip()
        pattern = f"%{escape_like(search)}%"
        relevance = func.word_similarity(search, Product.name)
        condition = or_(
            Product.sku.ilike(pattern, escape="\\"),
            Product.barcode.ilike(pattern, escape="\\"),
            Product.name.ilike(pattern, escape="\\"),
            relevance > SEARCH_SIMILARITY_THRESHOLD,
        )
        return condition, relevance

    @staticmethod
    def list_products(include_inactive=False, search=None, category_id=None):
        query = Product.query

        if not include_inactive:
            query = query.filter_by(is_active=True)

        if category_id:
            query = query.filter_by(category_id=category_id)

        if search and search.strip():
            condition, relevance = ProductService.search_condition(search)
            return query.filter(condition).order_by(relevance.desc(), Product.name.asc())

        return query.order_by(Product.name.asc())

    @staticmethod
    def find_by_code(code):
        """Producto activo cuyo código de barras o SKU coincide exactamente (sin distinguir mayúsculas)."""
        code = (code or "").strip()
        if not code:
            return None
        return (
            Product.query.filter(
                Product.is_active.is_(True),
                or_(func.lower(Product.barcode) == code.lower(), func.lower(Product.sku) == code.lower()),
            )
            # El código de barras gana sobre el SKU si ambos coinciden con productos distintos. coalesce: sin él, un
            # producto SIN código de barras da NULL y PostgreSQL pone los NULL primero en DESC (RF-01)
            .order_by(func.coalesce(func.lower(Product.barcode) == code.lower(), False).desc(), Product.id)
            .first()
        )

    @staticmethod
    def pos_catalog():
        """Catálogo compacto de productos activos para la copia local del POS (OPS-02)."""
        rows = (
            db.session.query(Product, UnitOfMeasure)
            .join(UnitOfMeasure, UnitOfMeasure.id == Product.unit_id)
            .filter(Product.is_active.is_(True))
            .order_by(Product.name)
            .all()
        )
        return [
            {
                "id": product.id,
                "sku": product.sku,
                "barcode": product.barcode,
                "name": product.name,
                "sale_price": str(product.sale_price),
                "tax_rate": str(product.tax_rate),
                "category_id": product.category_id,
                "unit": {"abbreviation": unit.abbreviation, "allows_fractions": unit.allows_fractions},
            }
            for product, unit in rows
        ]

    @staticmethod
    def list_units():
        return UnitOfMeasure.query.order_by(UnitOfMeasure.name.asc()).all()

    @staticmethod
    def get_unit(unit_id):
        return UnitOfMeasure.query.filter_by(id=unit_id).first()

    @staticmethod
    @with_rollback
    def create_unit(data):
        ProductService._validate_unique_unit(data.get("name"), data.get("abbreviation"))
        unit = UnitOfMeasure(**data)
        db.session.add(unit)
        db.session.flush()

        from app.services.audit_service import log_action
        log_action(
            action="crear",
            entity_type="unit_of_measure",
            entity_id=unit.id,
            details={"name": unit.name, "abbreviation": unit.abbreviation},
            new_value={"name": unit.name, "abbreviation": unit.abbreviation},
        )

        db.session.commit()
        return unit

    @staticmethod
    @with_rollback
    def update_unit(unit, data):
        if data.get("allows_fractions") is False and unit.allows_fractions:
            ProductService._validate_no_fractional_stock(unit)
        if "name" in data or "abbreviation" in data:
            ProductService._validate_unique_unit(
                data.get("name", unit.name),
                data.get("abbreviation", unit.abbreviation),
                exclude_unit_id=unit.id
            )

        data = changed_fields(unit, data)
        if not data:
            return unit  # sin cambios: no se audita (RF-39)
        previous_value = {field: getattr(unit, field) for field in data.keys()}
        for field, value in data.items():
            setattr(unit, field, value)
        new_value = {field: getattr(unit, field) for field in data.keys()}

        from app.services.audit_service import log_action
        log_action(
            action="editar",
            entity_type="unit_of_measure",
            entity_id=unit.id,
            details={"name": unit.name},
            previous_value=previous_value,
            new_value=new_value,
        )

        db.session.commit()
        return unit

    @staticmethod
    @with_rollback
    def delete_unit(unit):
        associated_products = Product.query.filter_by(unit_id=unit.id).first()
        if associated_products:
            raise ValidationError({"error": ["No se puede eliminar la unidad porque esta asociada a productos"]})

        unit_id = unit.id
        unit_name = unit.name
        previous_value = {"name": unit.name, "abbreviation": unit.abbreviation}

        from app.services.audit_service import log_action
        log_action(
            action="eliminar",
            entity_type="unit_of_measure",
            entity_id=unit_id,
            details={"name": unit_name},
            previous_value=previous_value,
        )

        db.session.delete(unit)
        db.session.commit()
        return True

    @staticmethod
    def _validate_no_fractional_stock(unit):
        """Una unidad no deja de admitir fracciones si un producto suyo tiene stock fraccionario (RF-19)."""
        fraccionario = (
            db.session.query(Product.name, Stock.quantity)
            .join(Stock, Stock.product_id == Product.id)
            .filter(Product.unit_id == unit.id, Stock.quantity != func.trunc(Stock.quantity))
            .order_by(Product.name)
            .first()
        )
        if fraccionario:
            nombre, cantidad = fraccionario
            raise ValueError(
                f"No se puede quitar 'permite fracciones' a la unidad '{unit.name}': el producto '{nombre}' "
                f"tiene stock fraccionario ({cantidad.normalize():f}). Ajusta su stock a un entero primero."
            )

    @staticmethod
    def _normalize_unit_text(value):
        """Forma de comparación de unidades: sin espacios, mayúsculas ni acentos ("GALÓN " == "galon") (RF-18)."""
        text = unicodedata.normalize("NFKD", (value or "").strip().lower())
        return "".join(ch for ch in text if not unicodedata.combining(ch))

    @staticmethod
    def _validate_unique_unit(name, abbreviation, exclude_unit_id=None):
        # El catálogo de unidades es pequeño: se compara en Python para ignorar también los acentos (RF-18)
        errors = {}
        others = [u for u in UnitOfMeasure.query.all() if u.id != exclude_unit_id]
        norm = ProductService._normalize_unit_text
        if name and any(norm(u.name) == norm(name) for u in others):
            errors["name"] = ["Ya existe una unidad con ese nombre"]
        if abbreviation and any(norm(u.abbreviation) == norm(abbreviation) for u in others):
            errors["abbreviation"] = ["Ya existe una unidad con esa abreviatura"]
        if errors:
            raise ValidationError(errors)

    @staticmethod
    def get_product(product_id, include_inactive=True):
        query = Product.query.filter_by(id=product_id)
        if not include_inactive:
            query = query.filter_by(is_active=True)
        return query.first()

    @staticmethod
    @with_rollback
    def create_product(data):
        data = ProductService._clean_optional_fields(data)
        ProductService._validate_references(data)
        ProductService._validate_unique_product(
            sku=data["sku"],
            barcode=data.get("barcode"),
        )

        # El costo promedio lo calcula el sistema: arranca en el precio de compra (H-26)
        data.pop("avg_cost", None)
        product = Product(**data)
        product.avg_cost = product.purchase_price or 0
        db.session.add(product)
        db.session.flush()
        # Registro de stock en 0 para que aparezca en inventario y alertas desde el alta (H-26)
        db.session.add(Stock(product_id=product.id, quantity=0))

        from app.services.audit_service import log_action
        log_action(
            action="crear",
            entity_type="product",
            entity_id=product.id,
            details={"sku": product.sku, "name": product.name},
            new_value={
                "sku": product.sku,
                "name": product.name,
                "sale_price": str(product.sale_price) if product.sale_price is not None else None,
                "category_id": product.category_id,
                "unit_id": product.unit_id,
            },
        )

        db.session.commit()
        return product

    @staticmethod
    @with_rollback
    def update_product(product, data):
        data = ProductService._clean_optional_fields(data)
        data.pop("avg_cost", None)
        ProductService._validate_references(data, current_category_id=product.category_id)
        ProductService._validate_unique_product(
            sku=data.get("sku"),
            barcode=data.get("barcode"),
            exclude_product_id=product.id,
        )

        data = changed_fields(product, data)
        if not data:
            return product  # un PATCH sin cambios no registra "editar" (RF-39)
        previous_value = {
            field: str(getattr(product, field)) if getattr(product, field) is not None else None
            for field in data.keys()
        }
        for field, value in data.items():
            setattr(product, field, value)
        # Un producto dado de alta sin precio de compra quedaba con costo promedio 0 para siempre (RF-07):
        # el primer precio de compra que se captura lo fija. Si ya hay un promedio calculado, no se toca
        if data.get("purchase_price") and not (product.avg_cost or 0):
            product.avg_cost = data["purchase_price"]
        new_value = {
            field: str(getattr(product, field)) if getattr(product, field) is not None else None
            for field in data.keys()
        }

        from app.services.audit_service import log_action
        log_action(
            action="editar",
            entity_type="product",
            entity_id=product.id,
            details={"sku": product.sku, "name": product.name},
            previous_value=previous_value,
            new_value=new_value,
        )

        db.session.commit()
        return product

    @staticmethod
    @with_rollback
    def deactivate_product(product):
        if not product.is_active:
            return product  # ya estaba desactivado: no se registra otro evento (RF-39)
        prev_active = product.is_active
        product.is_active = False

        from app.services.audit_service import log_action
        log_action(
            action="desactivar",
            entity_type="product",
            entity_id=product.id,
            details={"sku": product.sku, "name": product.name},
            previous_value={"is_active": prev_active},
            new_value={"is_active": False},
        )

        db.session.commit()
        return product

    @staticmethod
    @with_rollback
    def reactivate_product(product):
        if product.is_active:
            return product  # ya estaba activo (RF-39)
        prev_active = product.is_active
        product.is_active = True

        from app.services.audit_service import log_action
        log_action(
            action="reactivar",
            entity_type="product",
            entity_id=product.id,
            details={"sku": product.sku, "name": product.name},
            previous_value={"is_active": prev_active},
            new_value={"is_active": True},
        )

        db.session.commit()
        return product

    @staticmethod
    def _clean_optional_fields(data):
        cleaned = dict(data)
        if cleaned.get("barcode") == "":
            cleaned["barcode"] = None
        if cleaned.get("description") == "":
            cleaned["description"] = None
        return cleaned

    @staticmethod
    def _validate_references(data, current_category_id=None):
        errors = {}

        category_id = data.get("category_id")
        # El formulario reenvía la categoría actual: si no cambia, no se exige que siga activa (RF-20)
        if category_id is not None and category_id != current_category_id:
            category = Category.query.filter_by(id=category_id, is_active=True).first()
            if not category:
                errors["category_id"] = ["Categoria no encontrada"]

        unit_id = data.get("unit_id")
        if unit_id is not None:
            unit = UnitOfMeasure.query.filter_by(id=unit_id).first()
            if not unit:
                errors["unit_id"] = ["Unidad no encontrada"]

        if errors:
            raise ValidationError(errors)

    @staticmethod
    def _validate_unique_product(sku=None, barcode=None, exclude_product_id=None):
        errors = {}

        # Sin distinguir mayúsculas ni espacios, igual que la búsqueda por código del escáner (RF-17)
        def _existe(column, value):
            query = Product.query.filter(func.lower(func.trim(column)) == value.strip().lower())
            if exclude_product_id is not None:
                query = query.filter(Product.id != exclude_product_id)
            return query.first()

        if sku and _existe(Product.sku, sku):
            errors["sku"] = ["Ya existe un producto con ese SKU"]
        if barcode and _existe(Product.barcode, barcode):
            errors["barcode"] = ["Ya existe un producto con ese código de barras"]

        # RF-01: un SKU no puede ser el código de barras de OTRO producto (ni al revés): el escáner no sabría cuál es
        if sku and "sku" not in errors and _existe(Product.barcode, sku):
            errors["sku"] = ["El SKU coincide con el código de barras de otro producto"]
        if barcode and "barcode" not in errors and _existe(Product.sku, barcode):
            errors["barcode"] = ["El código de barras coincide con el SKU de otro producto"]

        if errors:
            raise ValidationError(errors)


class CategoryService:
    @staticmethod
    def list_categories(include_inactive=False):
        query = Category.query
        if not include_inactive:
            query = query.filter_by(is_active=True)
        return query.order_by(Category.name.asc())

    @staticmethod
    def get_category(category_id, include_inactive=True):
        query = Category.query.filter_by(id=category_id)
        if not include_inactive:
            query = query.filter_by(is_active=True)
        return query.first()

    @staticmethod
    @with_rollback
    def create_category(data):
        data = {**data, "name": data["name"].strip()}
        CategoryService._validate_unique_category(data["name"])
        category = Category(**data)
        db.session.add(category)
        db.session.flush()

        from app.services.audit_service import log_action
        log_action(
            action="crear",
            entity_type="category",
            entity_id=category.id,
            details={"name": category.name},
            new_value={"name": category.name},
        )

        db.session.commit()
        return category

    @staticmethod
    @with_rollback
    def update_category(category, data):
        if "name" in data:
            data = {**data, "name": data["name"].strip()}
            CategoryService._validate_unique_category(data["name"], exclude_category_id=category.id)

        data = changed_fields(category, data)
        if not data:
            return category  # sin cambios: no se audita (RF-39)
        previous_value = {field: getattr(category, field) for field in data.keys()}
        for field, value in data.items():
            setattr(category, field, value)
        new_value = {field: getattr(category, field) for field in data.keys()}

        from app.services.audit_service import log_action
        log_action(
            action="editar",
            entity_type="category",
            entity_id=category.id,
            details={"name": category.name},
            previous_value=previous_value,
            new_value=new_value,
        )

        db.session.commit()
        return category

    @staticmethod
    @with_rollback
    def deactivate_category(category):
        # Desactivarla dejaba productos activos en una categoría que ya no se puede elegir (RF-20)
        activos = Product.query.filter_by(category_id=category.id, is_active=True).count()
        if activos:
            texto = "1 producto activo" if activos == 1 else f"{activos} productos activos"
            raise ValueError(
                f"No se puede desactivar la categoría '{category.name}': tiene {texto}. "
                "Muévelos a otra categoría o desactívalos primero."
            )
        if not category.is_active:
            return category  # ya estaba desactivada (RF-39)
        prev_active = category.is_active
        category.is_active = False

        from app.services.audit_service import log_action
        log_action(
            action="desactivar",
            entity_type="category",
            entity_id=category.id,
            details={"name": category.name},
            previous_value={"is_active": prev_active},
            new_value={"is_active": False},
        )

        db.session.commit()
        return category

    @staticmethod
    def _validate_unique_category(name, exclude_category_id=None):
        # Sin distinguir mayúsculas ni espacios: "Herramientas manuales" == "HERRAMIENTAS MANUALES " (H-54)
        normalized = (name or "").strip().lower()
        query = Category.query.filter(func.lower(func.trim(Category.name)) == normalized)
        if exclude_category_id is not None:
            query = query.filter(Category.id != exclude_category_id)
        if query.first():
            raise ValidationError({"name": ["Ya existe una categoría con ese nombre"]})
