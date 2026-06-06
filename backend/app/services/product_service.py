from marshmallow import ValidationError
from sqlalchemy import or_

from app.extensions import db
from app.models.product import Category, Product, UnitOfMeasure


class ProductService:
    @staticmethod
    def list_products(include_inactive=False, search=None, category_id=None):
        query = Product.query

        if not include_inactive:
            query = query.filter_by(is_active=True)

        if category_id:
            query = query.filter_by(category_id=category_id)

        if search:
            pattern = f"%{search}%"
            query = query.filter(
                or_(
                    Product.sku.ilike(pattern),
                    Product.barcode.ilike(pattern),
                    Product.name.ilike(pattern),
                )
            )

        return query.order_by(Product.name.asc())

    @staticmethod
    def list_units():
        return UnitOfMeasure.query.order_by(UnitOfMeasure.name.asc()).all()

    @staticmethod
    def get_product(product_id, include_inactive=True):
        query = Product.query.filter_by(id=product_id)
        if not include_inactive:
            query = query.filter_by(is_active=True)
        return query.first()

    @staticmethod
    def create_product(data):
        data = ProductService._clean_optional_fields(data)
        ProductService._validate_references(data)
        ProductService._validate_unique_product(
            sku=data["sku"],
            barcode=data.get("barcode"),
        )

        product = Product(**data)
        db.session.add(product)
        db.session.commit()
        return product

    @staticmethod
    def update_product(product, data):
        data = ProductService._clean_optional_fields(data)
        ProductService._validate_references(data)
        ProductService._validate_unique_product(
            sku=data.get("sku"),
            barcode=data.get("barcode"),
            exclude_product_id=product.id,
        )

        for field, value in data.items():
            setattr(product, field, value)

        db.session.commit()
        return product

    @staticmethod
    def deactivate_product(product):
        product.is_active = False
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
    def create_category(data):
        CategoryService._validate_unique_category(data["name"])
        category = Category(**data)
        db.session.add(category)
        db.session.commit()
        return category

    @staticmethod
    def update_category(category, data):
        if "name" in data:
            CategoryService._validate_unique_category(data["name"], exclude_category_id=category.id)

        for field, value in data.items():
            setattr(category, field, value)

        db.session.commit()
        return category

    @staticmethod
    def deactivate_category(category):
        category.is_active = False
        db.session.commit()
        return category

    @staticmethod
    def _validate_unique_category(name, exclude_category_id=None):
        query = Category.query.filter_by(name=name)
        if exclude_category_id is not None:
            query = query.filter(Category.id != exclude_category_id)
        if query.first():
            raise ValidationError({"name": ["Categoria ya existe"]})
