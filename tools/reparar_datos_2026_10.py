r"""Repara en pos_db los dos registros dañados por pruebas de QA del 2026-10-07 (revisión funcional, RF-02 y RF-04).

Detectados por tools/check_datos.py; ver docs/revision-funcional-2026-10/progreso.md.

1. Devolución duplicada de la venta V-20261007-0011 (RF-04). La devolución #4 registró DOS veces la misma partida
   (TO-001, 2 piezas) y reembolsó $231.54 de una venta de $115.77. El stock de TO-001 ya lo corrigió un ajuste de QA
   ese mismo día (152 → 150) y la devolución no estaba ligada a ninguna caja (no afectó cortes). Reparación: quitar la
   partida duplicada y dejar el reembolso en $115.77.
2. Stock fraccionario de TO-002 "Tuerca hexagonal 1/4 (50pz)" (RF-02). La venta de prueba V-20261007-0003 vendió 0.5
   piezas a $0.01 (su caja ya está cerrada, no se puede cancelar desde el sistema). Reparación: ajuste de inventario de
   +0.500 (79.500 → 80.000) con su movimiento y auditoría. La venta de $0.01 queda como histórico.

Uso (desde la carpeta backend, con su venv):
  venv\Scripts\python.exe ..\tools\reparar_datos_2026_10.py            # solo muestra lo que haría
  venv\Scripts\python.exe ..\tools\reparar_datos_2026_10.py --probar   # aplica en una transacción, revisa y deshace
  venv\Scripts\python.exe ..\tools\reparar_datos_2026_10.py --aplicar  # respaldo previo + reparación

Es idempotente: cada reparación comprueba los valores exactos de antes; si ya se aplicó o los datos cambiaron, la omite.
"""
import os
import sys
from decimal import Decimal
from pathlib import Path

# La consola de Windows (cp1252) no imprime "→" ni otros caracteres: salida siempre en UTF-8
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

BACKEND = Path(__file__).resolve().parents[1] / "backend"
sys.path.insert(0, str(BACKEND))
os.chdir(BACKEND)

from app import create_app  # noqa: E402
from app.extensions import db  # noqa: E402
from app.models.inventory import Stock, StockMovement  # noqa: E402
from app.models.product import Product  # noqa: E402
from app.models.sale import Sale, SaleReturn, SaleReturnItem  # noqa: E402
from app.models.user import Role, User  # noqa: E402
from app.services.audit_service import log_action  # noqa: E402

MOTIVO = "Reparación de datos de prueba QA del 2026-10-07 (revisión funcional 2026-10)"


def _admin() -> User:
    admin = (
        User.query.join(Role, Role.id == User.role_id)
        .filter(Role.name == "admin", User.is_active.is_(True))
        .order_by(User.id)
        .first()
    )
    if admin is None:
        raise SystemExit("No hay un usuario admin activo para registrar la reparación.")
    return admin


def plan_devolucion_duplicada():
    """Devuelve (descripción, función que aplica) o (motivo de omisión, None)."""
    sale = Sale.query.filter_by(folio="V-20261007-0011").first()
    if sale is None:
        return "Venta V-20261007-0011 no encontrada: se omite.", None
    returns = SaleReturn.query.filter_by(sale_id=sale.id).order_by(SaleReturn.id).all()
    objetivo = next((r for r in returns if r.refund_total == Decimal("231.54")), None)
    if objetivo is None:
        total = sum((r.refund_total for r in returns), Decimal("0"))
        return f"V-20261007-0011: reembolsado {total} (ya no es 231.54): ya reparada o cambió; se omite.", None
    items = SaleReturnItem.query.filter_by(sale_return_id=objetivo.id).order_by(SaleReturnItem.id).all()
    if len(items) != 2 or items[0].sale_item_id != items[1].sale_item_id or items[0].quantity != items[1].quantity:
        return f"Devolución #{objetivo.id}: sus partidas no son el duplicado esperado; se omite.", None
    duplicada = items[1]
    nuevo_total = items[0].refund_amount

    def aplicar(admin: User):
        anterior = {"refund_total": str(objetivo.refund_total), "items": len(items)}
        db.session.delete(duplicada)
        objetivo.refund_total = nuevo_total
        log_action(
            action="reparacion_datos",
            entity_type="sale_return",
            entity_id=objetivo.id,
            details={"folio": sale.folio, "motivo": MOTIVO, "rf": "RF-04",
                     "partida_eliminada": duplicada.id, "sale_item_id": duplicada.sale_item_id},
            previous_value=anterior,
            new_value={"refund_total": str(nuevo_total), "items": 1},
            user_id=admin.id,
            username=admin.username,
        )

    desc = (f"V-20261007-0011: devolución #{objetivo.id} tiene la partida {duplicada.sale_item_id} dos veces "
            f"→ quitar la partida #{duplicada.id} y dejar el reembolso en {nuevo_total} (antes 231.54).")
    return desc, aplicar


def plan_stock_fraccionario():
    product = Product.query.filter_by(sku="TO-002").first()
    if product is None:
        return "Producto TO-002 no encontrado: se omite.", None
    stock = Stock.query.filter_by(product_id=product.id).first()
    if stock is None or stock.quantity != Decimal("79.500"):
        actual = stock.quantity if stock else "sin registro"
        return f"TO-002: stock {actual} (ya no es 79.500): ya reparado o cambió; se omite.", None
    if product.unit is None or product.unit.allows_fractions:
        return "TO-002: su unidad admite fracciones; no es el caso esperado; se omite.", None
    nuevo = Decimal("80.000")

    def aplicar(admin: User):
        previo = stock.quantity
        stock.quantity = nuevo
        db.session.add(StockMovement(
            product_id=product.id, movement_type="ajuste", quantity=nuevo - previo,
            previous_stock=previo, new_stock=nuevo, reference_type="ajuste_manual", reference_id=0,
            notes=f"{MOTIVO}: se revierte la venta de prueba de 0.5 pz (V-20261007-0003)", user_id=admin.id,
        ))
        log_action(
            action="reparacion_datos",
            entity_type="product",
            entity_id=product.id,
            details={"sku": product.sku, "motivo": MOTIVO, "rf": "RF-02", "venta_origen": "V-20261007-0003"},
            previous_value={"stock": str(previo)},
            new_value={"stock": str(nuevo)},
            user_id=admin.id,
            username=admin.username,
        )

    desc = f"TO-002 \"{product.name}\": stock 79.500 pz → 80.000 (ajuste de +0.500 con movimiento y auditoría)."
    return desc, aplicar


def _chequeos_en_transaccion() -> int:
    """Corre los chequeos de tools/check_datos.py dentro de la transacción actual (sin commit)."""
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from check_datos import CHEQUEOS

    hallados = 0
    for titulo, sql in CHEQUEOS:
        filas = db.session.execute(db.text(sql)).fetchall()
        hallados += len(filas)
        print(f"  [{'OK  ' if not filas else 'HAY '}] {titulo}: {len(filas)}")
    return hallados


def main(aplicar: bool, probar: bool = False) -> int:
    app = create_app()
    with app.app_context():
        base = db.session.execute(db.text("SELECT current_database() || '/' || current_schema()")).scalar()
        print(f"Base: {base}\n")
        planes = [plan_devolucion_duplicada(), plan_stock_fraccionario()]
        pendientes = [(d, f) for d, f in planes if f is not None]
        for desc, f in planes:
            print(("[REPARAR] " if f else "[OMITIR ] ") + desc)

        if not pendientes:
            print("\nNada que reparar.")
            return 0
        if probar:
            admin = _admin()
            for _desc, f in pendientes:
                f(admin)
            db.session.flush()
            print("\nPrueba (cambios aplicados en la transacción, sin guardar):")
            restantes = _chequeos_en_transaccion()
            db.session.rollback()
            print(f"Se deshizo todo (rollback). Registros que quedarían por revisar: {restantes}")
            return 0
        if not aplicar:
            print("\nSolo se mostró el plan. Para probarlo sin guardar: --probar. Para aplicarlo: --aplicar (con respaldo previo).")
            return 0

        from app.services import backup_service
        respaldo = backup_service.create_backup(prefix="pre-reparacion")
        print(f"\nRespaldo previo: {respaldo.get('filename')}")

        admin = _admin()
        try:
            for _desc, f in pendientes:
                f(admin)
            db.session.commit()
        except Exception:
            db.session.rollback()
            print("Falló la reparación; no se cambió nada (rollback).")
            raise
        print(f"Reparación aplicada ({len(pendientes)} cambio(s)). Verifica con tools/check_datos.py.")
        return 0


if __name__ == "__main__":
    sys.exit(main("--aplicar" in sys.argv, probar="--probar" in sys.argv))
