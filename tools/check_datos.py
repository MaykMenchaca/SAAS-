r"""Busca en la base datos dañados por los hallazgos Críticos de la revisión funcional (RF-01…04).

SOLO LECTURA: no modifica nada. Usa DATABASE_URL de backend/.env (o la del entorno).

  backend\venv\Scripts\python.exe tools\check_datos.py
Sale con código 1 si encuentra algo.
"""
import os
import sys
from pathlib import Path

import sqlalchemy as sa
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / "backend" / ".env")

CHEQUEOS = [
    (
        "RF-02/03 Stock fraccionario en unidades que no admiten fracciones",
        """SELECT p.sku, p.name, s.quantity FROM stock s JOIN products p ON p.id = s.product_id
           JOIN units_of_measure u ON u.id = p.unit_id
           WHERE NOT u.allows_fractions AND s.quantity <> trunc(s.quantity)""",
    ),
    (
        "RF-02 Partidas o devoluciones fraccionarias en unidades sin fracciones",
        """SELECT 'venta' AS tipo, si.sale_id AS ref, si.product_sku, si.quantity FROM sale_items si
           JOIN products p ON p.id = si.product_id JOIN units_of_measure u ON u.id = p.unit_id
           WHERE NOT u.allows_fractions AND si.quantity <> trunc(si.quantity)
           UNION ALL
           SELECT 'devolución', sri.sale_return_id, si.product_sku, sri.quantity FROM sale_return_items sri
           JOIN sale_items si ON si.id = sri.sale_item_id JOIN products p ON p.id = si.product_id
           JOIN units_of_measure u ON u.id = p.unit_id
           WHERE NOT u.allows_fractions AND sri.quantity <> trunc(sri.quantity)""",
    ),
    (
        "RF-03 Partidas con cantidad 0 (cantidades de más de 3 decimales redondeadas a 0)",
        "SELECT sale_id, product_sku, quantity FROM sale_items WHERE quantity <= 0",
    ),
    (
        "RF-04 Ventas con reembolsos acumulados mayores al total",
        """SELECT s.folio, s.total, sum(r.refund_total) AS reembolsado FROM sales s
           JOIN sale_returns r ON r.sale_id = s.id GROUP BY s.id, s.folio, s.total
           HAVING sum(r.refund_total) > s.total""",
    ),
    (
        "RF-01 SKU igual al código de barras de otro producto",
        """SELECT a.sku AS sku_de, a.name, b.sku AS barcode_de, b.name FROM products a JOIN products b
           ON a.id <> b.id AND lower(a.sku) = lower(b.barcode)""",
    ),
    (
        "RF-07 Productos con stock y costo promedio 0",
        """SELECT p.sku, p.name, s.quantity, p.avg_cost FROM products p JOIN stock s ON s.product_id = p.id
           WHERE s.quantity > 0 AND coalesce(p.avg_cost, 0) = 0""",
    ),
]


def main() -> int:
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("Falta DATABASE_URL")
        return 2
    engine = sa.create_engine(url)
    hallados = 0
    with engine.connect() as conn:
        conn.execute(sa.text("SET TRANSACTION READ ONLY"))
        db = conn.execute(sa.text("SELECT current_database() || '/' || current_schema()")).scalar()
        print(f"Base: {db}\n")
        for titulo, sql in CHEQUEOS:
            filas = conn.execute(sa.text(sql)).fetchall()
            hallados += len(filas)
            print(f"[{'OK  ' if not filas else 'HAY '}] {titulo}: {len(filas)}")
            for fila in filas[:20]:
                print("       ", tuple(fila))
    print(f"\nTotal de registros a revisar: {hallados}")
    return 1 if hallados else 0


if __name__ == "__main__":
    sys.exit(main())
