"""Sale service — complete transactional sale logic."""
from decimal import Decimal

from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.extensions import db
from app.models.product import Product
from app.models.sale import CashRegisterSession, Payment, Sale, SaleItem, SaleReturn, SaleReturnItem
from app.models.user import User
from app.services import config_service
from app.services.inventory_service import InventoryService
from app.utils.timeutil import local_today


class SaleService:
    """Handles sale creation with inventory deduction and payment validation."""

    @staticmethod
    def price_lines(items: list, user_id: int | None = None) -> dict:
        """Calculate authoritative pricing lines, taxes, and totals.

        Validates product existence, active status, unit fractions, and discount limits.
        Uses Decimal arithmetic with per-line HALF_EVEN rounding for taxes and discounts.

        Returns dict with:
            lines: list of dicts with calculated pricing per item
            subtotal: Decimal
            discount_total: Decimal
            tax_total: Decimal
            total: Decimal
        """
        user = db.session.get(User, user_id) if user_id else None
        has_discount_perm = (
            user is not None
            and (user.role_name == "admin" or "ventas:descuento" in user.permissions)
        )

        max_disc_str = config_service.get("max_discount_percent") or "0"
        try:
            max_discount_limit = Decimal(str(max_disc_str))
        except Exception:
            max_discount_limit = Decimal("0")

        lines = []
        subtotal = Decimal("0")
        discount_total = Decimal("0")
        tax_total = Decimal("0")

        for item_data in items:
            product = db.session.get(Product, item_data["product_id"])
            if not product:
                raise ValueError(f"Producto {item_data['product_id']} no encontrado")

            if not product.is_active:
                raise ValueError(f"El producto '{product.name}' está inactivo")

            qty = Decimal(str(item_data["quantity"]))
            if qty <= Decimal("0"):
                raise ValueError("La cantidad debe ser mayor a 0")

            if product.unit and not product.unit.allows_fractions:
                if qty % Decimal("1") != Decimal("0"):
                    raise ValueError(
                        f"El producto '{product.name}' no permite cantidades fraccionarias"
                    )

            # Precios e impuestos autoritativos desde el catálogo del servidor
            price = Decimal(str(product.sale_price))
            tax_rate = Decimal(str(product.tax_rate))

            disc_pct = Decimal(str(item_data.get("discount_percent", 0)))
            if disc_pct < Decimal("0") or disc_pct > Decimal("100"):
                raise ValueError("El porcentaje de descuento debe estar entre 0 y 100")

            if disc_pct > max_discount_limit and not has_discount_perm:
                raise ValueError(
                    f"El descuento del {disc_pct}% supera el tope permitido ({max_discount_limit}%) "
                    "y requiere el permiso 'ventas:descuento'"
                )

            line_gross = qty * price
            line_discount = (line_gross * disc_pct / Decimal("100")).quantize(
                Decimal("0.01")
            )
            line_subtotal = line_gross - line_discount
            line_tax = (line_subtotal * tax_rate / Decimal("100")).quantize(
                Decimal("0.01")
            )
            line_total = line_subtotal + line_tax

            lines.append({
                "product_id": product.id,
                "product_name": product.name,
                "product_sku": product.sku,
                "quantity": qty,
                "unit_price": price,
                "discount_percent": disc_pct,
                "discount_amount": line_discount,
                "tax_rate": tax_rate,
                "subtotal": line_subtotal,
                "tax_amount": line_tax,
                "total": line_total,
                "cost_at_sale": product.avg_cost,
            })

            subtotal += line_subtotal
            discount_total += line_discount
            tax_total += line_tax

        return {
            "lines": lines,
            "subtotal": subtotal,
            "discount_total": discount_total,
            "tax_total": tax_total,
            "total": subtotal + tax_total,
        }

    @staticmethod
    def create_sale(
        user_id: int,
        session_id: int,
        items: list,
        payments: list,
        client_uuid: str | None = None,
    ) -> Sale:
        """Create a complete sale atomically.

        1. Validates client_uuid idempotency (returns existing sale if already processed)
        2. Validates cash register session is open and owned (or supervised)
        3. Calculates authoritative pricing via price_lines
        4. Generates folio from PostgreSQL sequence
        5. Creates sale items with discount calculation
        6. Deducts inventory for each item (with row-level locking)
        7. Validates payments and calculates exact change in server

        Args:
            user_id: Cashier performing the sale.
            session_id: Open CashRegisterSession id.
            items: List of dicts with product_id, quantity, and optional discount_percent.
                   (unit_price and tax_rate are ignored if passed; catalog is authoritative).
            payments: List of dicts with method, amount, and optional reference.
            client_uuid: Optional client-generated UUID for idempotency.

        Returns:
            The created (or existing idempotent) Sale object.

        Raises:
            ValueError: If session is closed, stock insufficient, payment insufficient,
                        product inactive, fraction not allowed, or discount exceeds limit.
            PermissionError: If cashier attempts to sell in another user's session without permission.
        """
        if client_uuid:
            existing_sale = Sale.query.filter_by(client_uuid=str(client_uuid)).first()
            if existing_sale:
                return existing_sale

        # Bloqueo de la sesión: si se está cerrando, esperamos y vemos su estado final (H-31)
        session = (
            db.session.query(CashRegisterSession)
            .filter_by(id=session_id)
            .with_for_update()
            .populate_existing()
            .first()
        )
        if not session or session.status != "abierta":
            raise ValueError("La sesión de caja no está abierta")

        # Validar pertenencia de la sesión: el usuario debe ser el dueño o tener 'caja:supervisar' / admin (H-16)
        if session.user_id != user_id:
            user = db.session.get(User, user_id) if user_id else None
            has_supervise = (
                user is not None
                and (user.role_name == "admin" or "caja:supervisar" in user.permissions)
            )
            if not has_supervise:
                raise PermissionError(
                    "No tienes permiso para realizar ventas en la sesión de caja de otro usuario"
                )

        pricing = SaleService.price_lines(items, user_id=user_id)

        folio = SaleService._generate_folio()

        sale = Sale(
            folio=folio,
            session_id=session_id,
            user_id=user_id,
            client_uuid=str(client_uuid) if client_uuid else None,
            subtotal=pricing["subtotal"],
            discount_total=pricing["discount_total"],
            tax_total=pricing["tax_total"],
            total=pricing["total"],
        )
        db.session.add(sale)
        db.session.flush()

        for line in pricing["lines"]:
            sale_item = SaleItem(
                sale_id=sale.id,
                product_id=line["product_id"],
                product_name=line["product_name"],
                product_sku=line["product_sku"],
                quantity=line["quantity"],
                unit_price=line["unit_price"],
                discount_percent=line["discount_percent"],
                discount_amount=line["discount_amount"],
                tax_rate=line["tax_rate"],
                subtotal=line["subtotal"],
                cost_at_sale=line["cost_at_sale"],
            )
            db.session.add(sale_item)

            # Deduct inventory (atomic with SELECT FOR UPDATE)
            InventoryService.move_stock(
                product_id=line["product_id"],
                quantity=line["quantity"],
                movement_type="salida",
                reference_type="venta",
                reference_id=sale.id,
                user_id=user_id,
            )

        # Process payments (H-16: el servidor calcula el cambio exacto e ignora al cliente)
        if not payments:
            raise ValueError("Debe registrar al menos un método de pago")

        cash_total = Decimal("0")
        non_cash_total = Decimal("0")
        normalized_payments = []

        for pay_data in payments:
            amount = Decimal(str(pay_data["amount"]))
            if amount <= Decimal("0"):
                raise ValueError("El monto del pago debe ser mayor a 0")

            method = pay_data.get("method")
            if method == "efectivo":
                cash_total += amount
            else:
                non_cash_total += amount

            normalized_payments.append({
                "method": method,
                "amount": amount,
                "reference": pay_data.get("reference"),
            })

        # Rechazar sobrepagos con métodos distintos a efectivo (tarjeta o transferencia)
        if non_cash_total > sale.total:
            raise ValueError("No se permite sobrepago con tarjeta o transferencia")

        payment_total = cash_total + non_cash_total
        if payment_total < sale.total:
            raise ValueError(
                f"Pago insuficiente: total ${sale.total}, recibido ${payment_total}"
            )

        # El cambio se calcula autoritativamente: total recibido - total venta.
        # Como non_cash_total <= sale.total, el excedente proviene exclusivamente del efectivo.
        total_change = payment_total - sale.total

        # Encontrar el último pago en efectivo para asignarle el cambio
        last_cash_idx = None
        for idx, p in enumerate(normalized_payments):
            if p["method"] == "efectivo":
                last_cash_idx = idx

        for idx, p in enumerate(normalized_payments):
            pay_change = total_change if idx == last_cash_idx else Decimal("0.00")
            payment = Payment(
                sale_id=sale.id,
                method=p["method"],
                amount=p["amount"],
                reference=p["reference"],
                change_amount=pay_change,
            )
            db.session.add(payment)

        from app.services.audit_service import log_action
        log_action(
            action="create",
            entity_type="sale",
            entity_id=sale.id,
            details={"folio": sale.folio, "total": str(sale.total)},
            user_id=user_id,
        )

        try:
            db.session.commit()
        except IntegrityError:
            db.session.rollback()
            if client_uuid:
                existing = Sale.query.filter_by(client_uuid=str(client_uuid)).first()
                if existing:
                    return existing
            raise
        return sale

    @staticmethod
    def cancel_sale(sale_id: int, user_id: int, reason: str) -> Sale:
        """Cancel a sale and return inventory.

        Args:
            sale_id: Sale to cancel.
            user_id: User performing the cancellation.
            reason: Reason for cancellation.

        Returns:
            The cancelled Sale object.

        Raises:
            ValueError: If sale is already cancelled.
        """
        sale = db.session.query(Sale).filter_by(id=sale_id).with_for_update().first()
        if not sale:
            raise ValueError("Venta no encontrada")
        if sale.status == "cancelada":
            raise ValueError("La venta ya está cancelada")
        if sale.status in ("devolucion_parcial", "devolucion_total"):
            raise ValueError("No se puede cancelar una venta que tiene devoluciones asociadas")
        if sale.status != "completada":
            raise ValueError(f"No se puede cancelar una venta en estado '{sale.status}'")

        has_returns = SaleReturn.query.filter_by(sale_id=sale_id).first() is not None
        if has_returns:
            raise ValueError("No se puede cancelar una venta que tiene devoluciones asociadas")

        # Return inventory for each item
        for item in sale.items:
            InventoryService.move_stock(
                product_id=item.product_id,
                quantity=item.quantity,
                movement_type="entrada",
                reference_type="cancelacion",
                reference_id=sale.id,
                user_id=user_id,
            )

        sale.status = "cancelada"
        sale.cancelled_by = user_id
        sale.cancel_reason = reason

        from app.services.audit_service import log_action
        log_action(
            action="cancel",
            entity_type="sale",
            entity_id=sale.id,
            details={"folio": sale.folio, "reason": reason},
            user_id=user_id,
        )

        db.session.commit()
        return sale

    @staticmethod
    def return_sale(
        sale_id: int,
        user_id: int,
        reason: str,
        items: list,
        session_id: int | None = None,
        refund_method: str = "efectivo",
    ) -> SaleReturn:
        """Process a return (partial or full) for a sale.

        Args:
            sale_id: Sale to return items from.
            user_id: User performing the return.
            reason: Reason for the return.
            items: List of dicts with sale_item_id and quantity to return.
            session_id: Optional CashRegisterSession id to track cash refunds.
            refund_method: Refund method ('efectivo', 'tarjeta', 'transferencia').

        Returns:
            The SaleReturn object.

        Raises:
            ValueError: If sale not found, already cancelled, quantity exceeds sold,
                        or session is invalid/closed.
            PermissionError: If cashier attempts return in another's session without permission.
        """
        if refund_method not in ("efectivo", "tarjeta", "transferencia"):
            raise ValueError(f"Método de reembolso inválido: {refund_method}")

        if session_id is not None:
            # Mismo orden de bloqueo que create_sale: sesión y luego venta. Una devolución que
            # coincide con el cierre espera y ve la caja cerrada (OPS-08)
            session = (
                db.session.query(CashRegisterSession)
                .filter_by(id=session_id)
                .with_for_update()
                .populate_existing()
                .first()
            )
            if not session or session.status != "abierta":
                raise ValueError("La sesión de caja no está abierta")

            if session.user_id != user_id:
                user = db.session.get(User, user_id) if user_id else None
                has_supervise = (
                    user is not None
                    and (user.role_name == "admin" or "caja:supervisar" in user.permissions)
                )
                if not has_supervise:
                    raise PermissionError(
                        "No tienes permiso para realizar devoluciones en la sesión de caja de otro usuario"
                    )

        sale = db.session.query(Sale).filter_by(id=sale_id).with_for_update().first()
        if not sale:
            raise ValueError("Venta no encontrada")
        if sale.status == "cancelada":
            raise ValueError("No se puede devolver una venta cancelada")

        if not items:
            raise ValueError("Debe incluir al menos un artículo para la devolución")

        # Build a map of already-returned quantities per sale_item
        already_returned: dict[int, Decimal] = {}
        existing_returns = SaleReturn.query.filter_by(sale_id=sale_id).all()
        for ret in existing_returns:
            for ri in ret.items:
                already_returned[ri.sale_item_id] = (
                    already_returned.get(ri.sale_item_id, Decimal("0")) + ri.quantity
                )

        # Agrupar las cantidades por sale_item_id para evitar sobre-devolución por duplicados (H-06)
        grouped_quantities: dict[int, Decimal] = {}
        for item_data in items:
            si_id = item_data.get("sale_item_id")
            if not si_id:
                raise ValueError("sale_item_id es requerido")
            qty = Decimal(str(item_data.get("quantity", 0)))
            if qty <= Decimal("0"):
                raise ValueError("La cantidad a devolver debe ser mayor a 0")
            grouped_quantities[si_id] = grouped_quantities.get(si_id, Decimal("0")) + qty

        # Validar disponibilidad para cada item agrupado antes de aplicar cambios
        for si_id, total_qty in grouped_quantities.items():
            sale_item = db.session.get(SaleItem, si_id)
            if not sale_item or sale_item.sale_id != sale_id:
                raise ValueError(f"Item {si_id} no pertenece a esta venta")

            prev_returned = already_returned.get(sale_item.id, Decimal("0"))
            available = sale_item.quantity - prev_returned

            if total_qty > available:
                raise ValueError(
                    f"Cantidad a devolver ({total_qty}) excede lo disponible ({available}) "
                    f"para {sale_item.product_name}"
                )

        sale_return = SaleReturn(
            sale_id=sale_id,
            user_id=user_id,
            session_id=session_id,
            refund_method=refund_method,
            reason=reason,
            refund_total=Decimal("0"),
        )
        db.session.add(sale_return)
        db.session.flush()

        refund_total = Decimal("0")

        for si_id, qty in grouped_quantities.items():
            sale_item = db.session.get(SaleItem, si_id)
            # Calculate proportional refund
            price_per_unit = sale_item.subtotal / sale_item.quantity
            tax_per_unit = price_per_unit * sale_item.tax_rate / Decimal("100")
            line_refund = ((price_per_unit + tax_per_unit) * qty).quantize(Decimal("0.01"))

            return_item = SaleReturnItem(
                sale_return_id=sale_return.id,
                sale_item_id=sale_item.id,
                product_id=sale_item.product_id,
                quantity=qty,
                refund_amount=line_refund,
            )
            db.session.add(return_item)

            # Return inventory
            InventoryService.move_stock(
                product_id=sale_item.product_id,
                quantity=qty,
                movement_type="entrada",
                reference_type="devolucion",
                reference_id=sale_return.id,
                user_id=user_id,
            )

            refund_total += line_refund

        sale_return.refund_total = refund_total

        # Determine if the return is partial or total
        total_returned: dict[int, Decimal] = dict(already_returned)
        for si_id, qty in grouped_quantities.items():
            total_returned[si_id] = total_returned.get(si_id, Decimal("0")) + qty

        all_returned = all(
            total_returned.get(si.id, Decimal("0")) >= si.quantity
            for si in sale.items
        )

        sale.status = "devolucion_total" if all_returned else "devolucion_parcial"

        from app.services.audit_service import log_action
        log_action(
            action="return",
            entity_type="sale",
            entity_id=sale.id,
            details={
                "folio": sale.folio,
                "refund_total": str(refund_total),
                "refund_method": refund_method,
                "session_id": session_id,
                "reason": reason,
            },
            user_id=user_id,
        )

        db.session.commit()
        return sale_return

    @staticmethod
    def get_sale(sale_id: int) -> Sale | None:
        """Get a sale by ID."""
        return db.session.get(Sale, sale_id)

    @staticmethod
    def _generate_folio() -> str:
        """Generate a unique sale folio using a PostgreSQL sequence.

        Format: V-YYYYMMDD-NNNN (e.g., V-20260606-0042)
        Thread-safe via database sequence.
        """
        date_str = local_today().strftime("%Y%m%d")
        result = db.session.execute(text("SELECT nextval('sale_folio_seq')"))
        seq = result.scalar()
        return f"V-{date_str}-{seq:04d}"
