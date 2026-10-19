"""Inventory API — stock consultation, adjustments, movement history, and physical counts."""
from decimal import Decimal
from io import BytesIO

from flask import Blueprint, jsonify, request
from flask_jwt_extended import get_jwt_identity
from marshmallow import ValidationError

from app.extensions import db
from app.models.inventory import InventoryCount, Stock
from app.models.product import Product
from app.schemas.inventory import (
    ADJUST_REASONS,
    InventoryCountCaptureSchema,
    InventoryCountCreateSchema,
    InventoryCountItemSchema,
    InventoryCountListSchema,
    InventoryCountSchema,
    StockAdjustSchema,
    StockMovementSchema,
    StockSchema,
)
from app.services.inventory_count_service import (
    KEEP_NOTES,
    CountNegativeStockError,
    CountNotFoundError,
    InventoryCountService,
)
from app.services.inventory_service import InventoryService
from app.services.product_service import ProductService
from app.utils.decorators import require_permission
from app.utils.pagination import paginate
from app.utils.quantities import validate_quantity

inventory_bp = Blueprint("inventory", __name__)


def _qty(value) -> str:
    """Cantidad con 3 decimales, como en la base (para la auditoría)."""
    return str(Decimal(value).quantize(Decimal("0.001")))

stock_schema = StockSchema()
stocks_schema = StockSchema(many=True)
movements_schema = StockMovementSchema(many=True)
adjust_schema = StockAdjustSchema()
count_create_schema = InventoryCountCreateSchema()
count_capture_schema = InventoryCountCaptureSchema()
count_schema = InventoryCountSchema()
count_item_schema = InventoryCountItemSchema()
count_list_schema = InventoryCountListSchema(many=True)


@inventory_bp.route("/stock", methods=["GET"])
@require_permission("inventario:ver")
def list_stock():
    """List all stock records, optionally filtered by product name/SKU."""
    search = request.args.get("search") or request.args.get("q")

    # Un producto desactivado con existencias sigue contando en inventario (H-43)
    query = (
        Stock.query
        .join(Product)
        .filter(db.or_(Product.is_active.is_(True), Stock.quantity != 0))
        .order_by(Product.name)
    )

    if search and search.strip():
        # La misma búsqueda que /products: comodines escapados y tolerante a errores de dedo (RF-35)
        condition, relevance = ProductService.search_condition(search)
        query = query.filter(condition).order_by(None).order_by(relevance.desc(), Product.name)

    return jsonify(paginate(query, stocks_schema)), 200


@inventory_bp.route("/stock/<int:product_id>", methods=["GET"])
@require_permission("inventario:ver")
def get_stock(product_id):
    """Get current stock for a specific product."""
    stock = Stock.query.filter_by(product_id=product_id).first()
    if not stock:
        return jsonify({"error": "Stock no encontrado para este producto"}), 404
    return jsonify(stock_schema.dump(stock)), 200


@inventory_bp.route("/low-stock", methods=["GET"])
@require_permission("inventario:ver")
def low_stock():
    """Productos agotados o bajo su mínimo, paginados (los más escasos primero) (H-45).

    Un agotado cuenta aunque no tenga mínimo, y un stock igual al mínimo ya es bajo (RF-23).
    """
    query = (
        Stock.query
        .join(Product)
        .filter(
            Product.is_active.is_(True),
            db.or_(
                Stock.quantity <= 0,
                db.and_(Product.min_stock > 0, Stock.quantity <= Product.min_stock),
            ),
        )
        .order_by(Stock.quantity.asc(), Product.name)
    )
    return jsonify(paginate(query, stocks_schema)), 200


@inventory_bp.route("/summary", methods=["GET"])
@require_permission("inventario:ver")
def inventory_summary():
    """Conteos exactos para los indicadores de inventario, sin el tope de 100 filas de low-stock (RF-23).

    - total_products: productos activos.
    - out_of_stock: activos con stock <= 0 (con o sin mínimo; sin registro de stock = 0).
    - below_min: activos con mínimo, stock > 0 y stock <= mínimo.
    """
    qty = db.func.coalesce(Stock.quantity, 0)
    total, out_of_stock, below_min = (
        db.session.query(
            db.func.count(Product.id),
            db.func.count(Product.id).filter(qty <= 0),
            db.func.count(Product.id).filter(Product.min_stock > 0, qty > 0, qty <= Product.min_stock),
        )
        .outerjoin(Stock, Stock.product_id == Product.id)
        .filter(Product.is_active.is_(True))
        .one()
    )
    return jsonify({"total_products": total, "out_of_stock": out_of_stock, "below_min": below_min}), 200


@inventory_bp.route("/adjust-reasons", methods=["GET"])
@require_permission("inventario:ver")
def list_adjust_reasons():
    """Catálogo cerrado de motivos para ajustar el stock."""
    return jsonify([{"value": k, "label": v} for k, v in ADJUST_REASONS.items()]), 200


@inventory_bp.route("/adjust", methods=["POST"])
@require_permission("inventario:ajustar")
def adjust_stock():
    """Perform a manual stock adjustment (set to exact quantity)."""
    try:
        data = adjust_schema.load(request.get_json(silent=True) or {})
    except ValidationError as err:
        # Un motivo fuera del catálogo es un error de solicitud (400); el resto sigue el manejo global
        if "reason" in err.messages:
            return jsonify({"error": "; ".join(err.messages["reason"])}), 400
        raise

    product = db.session.get(Product, data["product_id"])
    if not product:
        return jsonify({"error": "Producto no encontrado"}), 404

    # Un producto por pieza no puede quedar con 2.5 pz que nunca se podrán vender (RF-19)
    if data["quantity"] > 0:
        try:
            validate_quantity(data["quantity"], product.unit, product.name)
        except ValueError as e:
            return jsonify({"error": str(e)}), 400

    user_id = int(get_jwt_identity())

    # Un ajuste manual durante un conteo abierto anula la captura de ese producto (RF-32). Va antes del ajuste
    # para bloquear el conteo y luego el stock, en el mismo orden que el cierre del conteo
    reset_item = InventoryCountService.reset_capture_after_adjust(product.id)

    reason = data.get("reason")
    notes = data.get("notes")
    if reason:
        # El motivo queda legible en el movimiento (notes) y como código en la auditoría
        label = ADJUST_REASONS[reason]
        notes = f"Motivo: {label}. {notes}" if notes else f"Motivo: {label}"

    # Stock anterior leído con la fila ya bloqueada, para la auditoría (RF-39)
    InventoryService.lock_stock([product.id])
    current = Stock.query.filter_by(product_id=product.id).populate_existing().first()
    previous_stock = current.quantity if current else Decimal("0")
    stock = InventoryService.move_stock(
        product_id=data["product_id"],
        quantity=data["quantity"],
        movement_type="ajuste",
        reference_type="ajuste_manual",
        reference_id=0,
        user_id=user_id,
        notes=notes,
    )
    capture_reset = None
    if reset_item is not None:
        reset_item.expected_quantity = stock.quantity
        capture_reset = reset_item.inventory_count_id

    # Un solo evento con el stock anterior y el nuevo; antes no quedaba el anterior (RF-39)
    from app.services.audit_service import log_action
    log_action(
        action="adjust",
        entity_type="stock",
        entity_id=stock.id,
        details={
            "product_id": stock.product_id,
            "product_name": product.name,
            "new_stock": _qty(stock.quantity),
            "reason": reason,
            "notes": data.get("notes"),
            "count_capture_reset": capture_reset,
        },
        previous_value={"stock": _qty(previous_stock)},
        new_value={"stock": _qty(stock.quantity)},
        user_id=user_id,
    )

    db.session.commit()

    return jsonify({
        "product_id": stock.product_id,
        "previous_stock": _qty(previous_stock),
        "new_stock": str(stock.quantity),
        "movement_type": "ajuste",
        "reason": reason,
        # Conteo cuya captura de este producto quedó anulada (RF-32); null si no había
        "count_capture_reset": capture_reset,
    }), 200


@inventory_bp.route("/movements/<int:product_id>", methods=["GET"])
@require_permission("inventario:ver")
def list_movements(product_id):
    """List stock movements for a specific product."""
    limit = request.args.get("limit", 50, type=int)
    limit = max(1, min(limit, 200))  # limit=-1 llegaba a SQL y daba 500 (RF-12)

    movements = InventoryService.get_movements(product_id, limit=limit)
    return jsonify(movements_schema.dump(movements)), 200


# --- Physical Inventory Count ---


@inventory_bp.route("/counts", methods=["POST"])
@require_permission("inventario:ajustar")
def create_count():
    """Create a new physical inventory count, pre-populated with all active products."""
    data = count_create_schema.load(request.get_json(silent=True) or {})
    user_id = int(get_jwt_identity())

    try:
        count = InventoryCountService.create_count(
            user_id=user_id,
            notes=data.get("notes"),
        )
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    return jsonify(count_schema.dump(count)), 201


@inventory_bp.route("/counts", methods=["GET"])
@require_permission("inventario:ver")
def list_counts():
    """List inventory counts with pagination."""
    query = InventoryCount.query.order_by(InventoryCount.created_at.desc())
    return jsonify(paginate(query, count_list_schema)), 200


@inventory_bp.route("/counts/<int:count_id>", methods=["GET"])
@require_permission("inventario:ver")
def get_count(count_id):
    """Get inventory count detail including all items."""
    count = InventoryCountService.get_count(count_id)
    if not count:
        return jsonify({"error": "Conteo no encontrado"}), 404
    return jsonify(count_schema.dump(count)), 200


@inventory_bp.route("/counts/<int:count_id>/items/<int:product_id>", methods=["PATCH"])
@require_permission("inventario:ajustar")
def capture_count_item(count_id, product_id):
    """Record the physical count for a specific product in a count."""
    data = count_capture_schema.load(request.get_json(silent=True) or {})
    try:
        item = InventoryCountService.capture_item(
            count_id=count_id,
            product_id=product_id,
            counted_quantity=data["counted_quantity"],
            # Sin "notes" en el cuerpo se conserva la nota anterior del renglón (RF-36)
            notes=data.get("notes", KEEP_NOTES),
        )
    except CountNotFoundError as e:
        return jsonify({"error": str(e)}), 404  # RF-29
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    return jsonify(count_item_schema.dump(item)), 200


@inventory_bp.route("/counts/<int:count_id>/close", methods=["POST"])
@require_permission("inventario:ajustar")
def close_count(count_id):
    """Close a count and auto-adjust stock for items with differences."""
    user_id = int(get_jwt_identity())
    try:
        count = InventoryCountService.close_count(count_id, user_id)
    except CountNotFoundError as e:
        return jsonify({"error": str(e)}), 404  # RF-29
    except CountNegativeStockError as e:
        # Dice qué producto falla en lugar del 409 genérico del CHECK de la base (RF-32)
        return jsonify({"error": str(e), "code": "count_negative_stock", "product_id": e.product_id}), 409
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    return jsonify(count_schema.dump(count)), 200


@inventory_bp.route("/counts/<int:count_id>/cancel", methods=["POST"])
@require_permission("inventario:ajustar")
def cancel_count(count_id):
    """Cancel a count without applying any adjustments."""
    user_id = int(get_jwt_identity())
    try:
        count = InventoryCountService.cancel_count(count_id, user_id)
    except CountNotFoundError as e:
        return jsonify({"error": str(e)}), 404  # RF-29
    except ValueError as e:
        return jsonify({"error": str(e)}), 400

    return jsonify(count_schema.dump(count)), 200


# ── Inventario completo con Excel ───────────────────────────────────────────────────────────────────


@inventory_bp.route("/export", methods=["GET"])
@require_permission("inventario:ver")
def export_inventory():
    """Descarga el inventario activo en Excel (sirve también de plantilla para importar)."""
    from datetime import datetime

    from flask import send_file
    from flask_jwt_extended import current_user

    from app.services import inventory_excel_service

    content = inventory_excel_service.export_workbook(current_user)
    return send_file(
        BytesIO(content),
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        as_attachment=True,
        download_name=f"inventario-{datetime.now():%Y%m%d-%H%M}.xlsx",
    )


def _import_file():
    archivo = request.files.get("archivo")
    if archivo is None:
        return None, None
    return archivo.read(), archivo.filename


@inventory_bp.route("/import/preview", methods=["POST"])
@require_permission("inventario:ajustar")
def import_preview():
    """Revisa un Excel de inventario sin aplicar nada: nuevos, cambios (antes → después), sin cambios y errores."""
    from flask_jwt_extended import current_user

    from app.services import inventory_excel_service as svc

    contenido, nombre = _import_file()
    try:
        return jsonify(svc.preview(contenido, nombre, current_user)), 200
    except svc.ImportFileError as e:
        return jsonify({"error": str(e)}), 400


@inventory_bp.route("/import/apply", methods=["POST"])
@require_permission("inventario:ajustar")
def import_apply():
    """Aplica la importación revisada (todo o nada). `plan_hash` debe ser el de la vista previa."""
    from flask_jwt_extended import current_user

    from app.services import inventory_excel_service as svc

    contenido, nombre = _import_file()
    try:
        result = svc.apply(contenido, nombre, current_user, request.form.get("plan_hash"))
    except svc.ImportFileError as e:
        return jsonify({"error": str(e)}), 400
    except svc.ImportHasErrors as e:
        return jsonify({"error": str(e), "code": "import_has_errors", "preview": e.preview}), 400
    except svc.ImportPlanChanged as e:
        return jsonify({"error": str(e), "code": "import_plan_changed"}), 409
    return jsonify(result), 200
