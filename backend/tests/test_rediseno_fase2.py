"""Rediseño Industry, Fase 2: componentes base (docs/rediseno-2026-10/plan.md)."""
import re
from pathlib import Path

ROOT = Path(__file__).parents[2]
UI = ROOT / "frontend" / "src" / "components" / "ui"
COMPONENTES = sorted(p for p in UI.glob("*.tsx"))

# Nombres de color anteriores al rediseño: los componentes base ya usan solo los tokens Industry.
VIEJOS = re.compile(
    r"\b(?:bg|text|border|ring|fill|stroke|from|to|divide|outline|placeholder)-"
    r"(?:neutral-[a-z-]+|primary(?:-[a-z]+)?|success(?:-text)?|warning(?:-text)?|danger(?:-text)?|info(?:-text)?|on-primary|on-danger)\b"
)
REDONDEADAS = re.compile(r"\brounded-(?:sm|md|lg|xl|2xl|3xl)\b")


def test_hay_los_componentes_nuevos():
    nombres = {p.stem for p in COMPONENTES}
    assert {"segmented", "kbd", "corners"} <= nombres
    index = (UI / "index.ts").read_text(encoding="utf-8")
    for exportado in ("Segmented", "Kbd", "Corners", "tableNumClass"):
        assert exportado in index, exportado


def test_componentes_base_sin_nombres_de_color_viejos():
    for ruta in COMPONENTES:
        usos = VIEJOS.findall(ruta.read_text(encoding="utf-8"))
        assert not usos, f"{ruta.name} usa nombres viejos: {sorted(set(usos))}"


def test_componentes_base_sin_esquinas_redondeadas():
    for ruta in COMPONENTES:
        usos = REDONDEADAS.findall(ruta.read_text(encoding="utf-8"))
        assert not usos, f"{ruta.name} redondea esquinas: {sorted(set(usos))} (solo rounded-full para puntos)"


def test_boton_tiene_tamanos_tactiles_y_marco_blueprint():
    boton = (UI / "button.tsx").read_text(encoding="utf-8")
    assert "frame?: boolean" in boton and "<Corners />" in boton
    assert 'md: "min-h-11' in boton, "el tamaño por defecto conserva los 44 px táctiles"
    assert "font-heading" in boton


def test_campos_enlazan_el_error_para_lectores_de_pantalla():
    for nombre in ("input.tsx", "select.tsx"):
        codigo = (UI / nombre).read_text(encoding="utf-8")
        assert "aria-invalid" in codigo and "aria-describedby" in codigo, nombre
        assert "border-field-border" in codigo, f"{nombre}: el borde del campo debe medir ≥3:1"


def test_catalogo_de_componentes_solo_en_desarrollo():
    app = (ROOT / "frontend" / "src" / "App.tsx").read_text(encoding="utf-8")
    assert "import.meta.env.DEV" in app and "ui-catalog" in app and '"/_ui"' in app
    # La ruta solo existe si la constante de desarrollo es verdadera
    assert re.search(r"const UiCatalogPage = import\.meta\.env\.DEV\s*\?\s*lazy\(", app)
    assert (ROOT / "frontend" / "src" / "pages" / "ui-catalog.tsx").exists()


def test_variante_dark_ligada_a_la_clase_del_tema():
    css = (ROOT / "frontend" / "src" / "index.css").read_text(encoding="utf-8")
    assert "@custom-variant dark (&:where(.dark, .dark *));" in css
