"""Modelo de datos: constraints, índices y errores de integridad (Subfase 6.5, H-33, H-32, H-52)."""
from decimal import Decimal

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError


def _indices(db, table):
    return {
        row[0]
        for row in db.session.execute(
            text("SELECT indexname FROM pg_indexes WHERE tablename = :t AND schemaname = current_schema()"),
            {"t": table},
        )
    }


@pytest.mark.parametrize(
    "table, index",
    [
        ("sales", "ix_sales_created_at"),
        ("stock_movements", "ix_stock_movements_created_at"),
        ("audit_logs", "ix_audit_logs_created_at"),
        ("audit_logs", "ix_audit_logs_user_id"),
        ("audit_logs", "ix_audit_logs_entity"),
        ("sale_return_items", "ix_sale_return_items_sale_item_id"),
        ("products", "idx_products_name_trgm"),
    ],
)
def test_indices_declarados_en_el_modelo(db, table, index):
    assert index in _indices(db, table)


def test_stock_no_puede_ser_negativo(db, seed_product_for_sale):
    with pytest.raises(IntegrityError):
        db.session.execute(text("UPDATE stock SET quantity = -1 WHERE product_id = :p"), {"p": seed_product_for_sale.id})
    db.session.rollback()


@pytest.mark.parametrize("amount, change", [("0", "0"), ("-5", "0"), ("10", "-1")])
def test_pagos_con_montos_validos(db, seed_admin, seed_open_session, seed_product_for_sale, amount, change):
    from app.services.sale_service import SaleService

    sale = SaleService.create_sale(
        user_id=seed_admin.id, session_id=seed_open_session.id,
        items=[{"product_id": seed_product_for_sale.id, "quantity": 1}],
        payments=[{"method": "efectivo", "amount": "116.00"}],
    )
    with pytest.raises(IntegrityError):
        db.session.execute(
            text("INSERT INTO payments (sale_id, method, amount, change_amount) VALUES (:s, 'efectivo', :a, :c)"),
            {"s": sale.id, "a": Decimal(amount), "c": Decimal(change)},
        )
    db.session.rollback()


def test_integrity_error_responde_409(client, admin_token, monkeypatch):
    from app.services.product_service import CategoryService

    def choca(*args, **kwargs):
        raise IntegrityError("INSERT INTO categories", {}, Exception("duplicate key value violates unique constraint"))

    monkeypatch.setattr(CategoryService, "create_category", staticmethod(choca))
    response = client.post("/api/categories/", json={"name": "Duplicada"},
                           headers={"Authorization": f"Bearer {admin_token}"})
    assert response.status_code == 409
    assert "conflicto" in response.get_json()["error"].lower()
