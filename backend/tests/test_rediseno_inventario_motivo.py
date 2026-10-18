"""Motivo del ajuste de inventario (rediseño 6.2): catálogo cerrado, opcional por compatibilidad."""
import json
from decimal import Decimal

from tests.test_inventory_api import _seed_product_with_stock

MOTIVOS = {
    "merma_dano": "Merma o daño",
    "error_captura": "Error de captura",
    "devolucion_proveedor": "Devolución a proveedor",
    "uso_interno": "Uso interno",
    "otro": "Otro",
}


def _adjust(client, token, product_id, **extra):
    return client.post(
        "/api/inventory/adjust",
        headers={"Authorization": f"Bearer {token}"},
        json={"product_id": product_id, "quantity": "40.000", **extra},
    )


def test_motivo_valido_queda_en_movimiento_respuesta_y_auditoria(client, admin_token, db):
    from app.models.audit import AuditLog
    from app.models.inventory import StockMovement

    product = _seed_product_with_stock(db)
    response = _adjust(client, admin_token, product.id, reason="merma_dano", notes="Se cayó el lote")
    assert response.status_code == 200
    assert response.get_json()["reason"] == "merma_dano"

    movement = StockMovement.query.filter_by(product_id=product.id).order_by(StockMovement.id.desc()).first()
    assert "Merma o daño" in movement.notes
    assert "Se cayó el lote" in movement.notes

    log = AuditLog.query.filter_by(entity_type="stock", action="adjust").order_by(AuditLog.id.desc()).first()
    details = log.details if isinstance(log.details, dict) else json.loads(log.details)
    assert details["reason"] == "merma_dano"


def test_todos_los_motivos_del_catalogo_son_validos(client, admin_token, db):
    product = _seed_product_with_stock(db)
    for code in MOTIVOS:
        assert _adjust(client, admin_token, product.id, reason=code).status_code == 200


def test_motivo_invalido_responde_400(client, admin_token, db):
    product = _seed_product_with_stock(db)
    response = _adjust(client, admin_token, product.id, reason="porque_si")
    assert response.status_code == 400
    # El stock no cambió
    from app.models.inventory import Stock
    assert Stock.query.filter_by(product_id=product.id).first().quantity == Decimal("75.000")


def test_sin_motivo_sigue_funcionando(client, admin_token, db):
    product = _seed_product_with_stock(db)
    response = _adjust(client, admin_token, product.id, notes="Solo nota")
    assert response.status_code == 200
    assert response.get_json()["new_stock"] == "40.000"
    assert response.get_json()["reason"] is None


def test_catalogo_de_motivos_se_expone(client, admin_token, db):
    response = client.get("/api/inventory/adjust-reasons", headers={"Authorization": f"Bearer {admin_token}"})
    assert response.status_code == 200
    assert {r["value"]: r["label"] for r in response.get_json()} == MOTIVOS
