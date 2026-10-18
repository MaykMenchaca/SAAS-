"""Printing API - sale tickets and product labels."""
from flask import Blueprint, current_app, jsonify, request

from app.extensions import db
from app.models.product import Product
from app.models.sale import Sale
from app.services.printer_service import PrinterService
from app.utils.decorators import require_permission

printing_bp = Blueprint("printing", __name__)


def _printer_unavailable(exc: Exception):
    """503 con un mensaje genérico: el error del sistema operativo (con la ruta del servidor) solo va al log (RF-31)."""
    current_app.logger.warning("Impresora no disponible: %s", exc)
    return jsonify({
        "error": "Impresora no disponible. Revisa que esté encendida y conectada e inténtalo de nuevo.",
        "code": "printer_unavailable",
    }), 503


def _print_options():
    data = request.get_json(silent=True) or {}
    return bool(data.get("send", False))


@printing_bp.route("/sales/<int:sale_id>/ticket", methods=["POST"])
@require_permission("ventas:ver")
def print_sale_ticket(sale_id):
    """Preview or print a sale ticket."""
    sale = db.session.get(Sale, sale_id)
    if not sale:
        return jsonify({"error": "Venta no encontrada"}), 404

    send = _print_options()
    content = PrinterService.format_sale_ticket(sale)
    sent = False
    queued = False
    agent_online = None

    if send:
        # Impresora de la caja de la venta (directa o vía agente). El cajón se abre al cobrar, no al reimprimir.
        try:
            queued = PrinterService.dispatch_sale_ticket(sale, content) == "queued"
            sent = True
            if queued:
                from app.services import print_queue_service

                # El POS avisa si la caja no tiene su agente conectado (OPS-17)
                agent_online = print_queue_service.agent_online(sale.session.cash_register)
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400
        except RuntimeError as exc:
            return _printer_unavailable(exc)

    return jsonify({
        "sale_id": sale.id,
        "folio": sale.folio,
        "sent": sent,
        "queued": queued,
        "agent_online": agent_online,
        "content": content,
    }), 200


@printing_bp.route("/products/<int:product_id>/label", methods=["POST"])
@require_permission("productos:ver")
def print_product_label(product_id):
    """Preview or print a product price label."""
    product = db.session.get(Product, product_id)
    if not product:
        return jsonify({"error": "Producto no encontrado"}), 404

    send = _print_options()
    content = PrinterService.format_price_label(product)
    sent = False

    if send:
        try:
            sent = PrinterService.send_to_printer(content)
        except ValueError as exc:
            return jsonify({"error": str(exc)}), 400
        except RuntimeError as exc:
            return _printer_unavailable(exc)

    return jsonify({
        "product_id": product.id,
        "sku": product.sku,
        "sent": sent,
        "content": content,
    }), 200
