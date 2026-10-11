from marshmallow import ValidationError
from sqlalchemy import or_, func

from app.extensions import db
from app.models.inventory import Stock
from app.models.product import Category, Product, UnitOfMeasure
from app.utils.decorators import with_rollback

# Umbral de word_similarity calibrado con QA-18: "martilo", "tornilo", "pintrua" y "foko led"
# quedan >= 0.5, y el ruido ("martillo" contra "Tornillo") queda en 0.36.
SEARCH_SIMILARITY_THRESHOLD = 0.4


class ProductService:
    @staticmethod
    def list_products(include_inactive=False, search=None, category_id=None):
        query = Product.query

        if not include_inactive:
            query = query.filter_by(is_active=True)

        if category_id:
            query = query.filter_by(category_id=category_id)

        if search:
            search = search.strip()
            pattern = f"%{search}%"
            relevance = func.word_similarity(search, Product.name)
            query = query.filter(
                or_(
                    Product.sku.ilike(pattern),
                    Product.barcode.ilike(pattern),
                    Product.name.ilike(pattern),
                    relevance > SEARCH_SIMILARITY_THRESHOLD,
                )
            )
            return query.order_by(relevance.desc(), Product.name.asc())

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
            # El código de barras gana sobre el SKU si ambos coinciden con productos distintos
            .order_by((func.lower(Product.barcode) == code.lower()).desc(), Product.id)
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
        if "name" in data or "abbreviation" in data:
            ProductService._validate_unique_unit(
                data.get("name", unit.name),
                data.get("abbreviation", unit.abbreviation),
                exclude_unit_id=unit.id
            )

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
    def _validate_unique_unit(name, abbreviation, exclude_unit_id=None):
        errors = {}
        if name:
            query = UnitOfMeasure.query.filter_by(name=name)
            if exclude_unit_id is not None:
                query = query.filter(UnitOfMeasure.id != exclude_unit_id)
            if query.first():
                errors["name"] = ["Unidad con este nombre ya existe"]
        if abbreviation:
            query = UnitOfMeasure.query.filter_by(abbreviation=abbreviation)
            if exclude_unit_id is not None:
                query = query.filter(UnitOfMeasure.id != exclude_unit_id)
            if query.first():
                errors["abbreviation"] = ["Unidad con esta abreviatura ya existe"]
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
        ProductService._validate_references(data)
        ProductService._validate_unique_product(
            sku=data.get("sku"),
            barcode=data.get("barcode"),
            exclude_product_id=product.id,
        )

        previous_value = {
            field: str(getattr(product, field)) if getattr(product, field) is not None else None
            for field in data.keys()
        }
        for field, value in data.items():
            setattr(product, field, value)
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
    def _validate_references(data):
        errors = {}

        category_id = data.get("category_id")
        if category_id is not None:
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

        if sku:
            query = Product.query.filter_by(sku=sku)
            if exclude_product_id is not None:
                query = query.filter(Product.id != exclude_product_id)
            if query.first():
                errors["sku"] = ["SKU ya existe"]

        if barcode:
            query = Product.query.filter_by(barcode=barcode)
            if exclude_product_id is not None:
                query = query.filter(Product.id != exclude_product_id)
            if query.first():
                errors["barcode"] = ["Codigo de barras ya existe"]

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
