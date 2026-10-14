"""Rediseño Industry, Fase 8: cierre (sin tokens viejos, guía de diseño documentada)."""
import re
from pathlib import Path

ROOT = Path(__file__).parents[2]
SRC = ROOT / "frontend" / "src"
VIEJOS = re.compile(
    r"\b(?:bg|text|border|ring|fill|stroke|from|to|divide|outline|placeholder)-"
    r"(?:neutral-[a-z-]+|primary(?:-[a-z]+)?|success(?:-text)?|warning(?:-text)?|danger(?:-text)?|info(?:-text)?|on-primary|on-danger|sidebar-[a-z]+)\b"
)


def test_ningun_archivo_del_frontend_usa_nombres_de_color_viejos():
    for ruta in SRC.rglob("*.ts*"):
        if "__tests__" in ruta.parts or ruta.name.endswith((".test.ts", ".test.tsx")):
            continue
        assert not VIEJOS.findall(ruta.read_text(encoding="utf-8-sig")), str(ruta.relative_to(ROOT))


def test_la_guia_de_diseno_existe_y_el_readme_la_enlaza():
    assert (ROOT / "docs" / "sistema-de-diseno.md").exists()
    assert "docs/sistema-de-diseno.md" in (ROOT / "README.md").read_text(encoding="utf-8")


def test_las_paginas_no_se_ensanchan_con_tablas_anchas():
    for nombre in ("purchases.tsx", "sales-history.tsx", "inventory.tsx", "users.tsx", "reports.tsx"):
        assert "grid-cols-[minmax(0,1fr)]" in (SRC / "pages" / nombre).read_text(encoding="utf-8"), nombre
