"""Printing API - sale tickets and product labels."""
from flask import Blueprint, jsonify, request

from app.extensions import db
from app.models.product import Product
from app.models.sale import Sale
from app.services.printer_service import PrinterService
from app.utils.decorators import require_permission

printing_bp = Blueprint("printing", __name__)


def _print_options():
    data = request.get_json(silent=True) or {}
    return bool(data.get("send", False)), data.get("printer_path")


@printing_bp.route("/sales/<int:sale_id>/ticket", methods=["POST"])
@require_permission("ventas:ver")
def print_sale_ticket(sale_id):
    """Preview or print a sale ticket."""
    sale = db.session.get(Sale, sale_id)
    if not sale:
        return jsonify({"error": "Venta no encontrada"}), 404

    send, printer_path = _print_options()
    content = PrinterService.format_sale_ticket(sale)
    sent = False

    if send:
        try:
            sent = PrinterService.send_to_printer(content, printer_path)
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400

    return jsonify({
        "sale_id": sale.id,
        "folio": sale.folio,
        "sent": sent,
        "content": content,
    }), 200


@printing_bp.route("/products/<int:product_id>/label", methods=["POST"])
@require_permission("productos:ver")
def print_product_label(product_id):
    """Preview or print a product price label."""
    product = db.session.get(Product, product_id)
    if not product:
        return jsonify({"error": "Producto no encontrado"}), 404

    send, printer_path = _print_options()
    content = PrinterService.format_price_label(product)
    sent = False

    if send:
        try:
            sent = PrinterService.send_to_printer(content, printer_path)
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400

    return jsonify({
        "product_id": product.id,
        "sku": product.sku,
        "sent": sent,
        "content": content,
    }), 200
