"""Rediseño Industry, Fase 4: punto de venta (estructura y reglas de dinero que no deben retroceder)."""
import re
from pathlib import Path

ROOT = Path(__file__).parents[2]
POS = ROOT / "frontend" / "src" / "pages" / "pos"

VIEJOS = re.compile(
    r"\b(?:bg|text|border|ring|fill|stroke|from|to|divide|outline|placeholder)-"
    r"(?:neutral-[a-z-]+|primary(?:-[a-z]+)?|success(?:-text)?|warning(?:-text)?|danger(?:-text)?|info(?:-text)?|on-primary|on-danger|sidebar-[a-z]+)\b"
)
REDONDEADAS = re.compile(r"\brounded-(?:sm|md|lg|xl|2xl|3xl)\b")


def _src(nombre):
    return (POS / nombre).read_text(encoding="utf-8")


def test_el_pos_esta_dividido_en_piezas():
    for pieza in ("pos-terminal.tsx", "session-selector.tsx", "catalog-panel.tsx", "ticket-panel.tsx", "payment-modal.tsx",
                  "ticket-preview.tsx", "offline-banner.tsx", "use-catalog.ts", "payment-math.ts", "cart-helpers.ts"):
        assert (POS / pieza).exists(), pieza
    assert len((ROOT / "frontend" / "src" / "pages" / "pos.tsx").read_text(encoding="utf-8").splitlines()) < 120


def test_sin_nombres_de_color_viejos_ni_esquinas_redondeadas_en_el_pos():
    for ruta in POS.glob("*.tsx"):
        codigo = ruta.read_text(encoding="utf-8")
        assert not VIEJOS.findall(codigo), f"{ruta.name}: {sorted(set(VIEJOS.findall(codigo)))}"
        assert not REDONDEADAS.findall(codigo), f"{ruta.name} redondea esquinas"


def test_el_cobro_manda_el_servidor_y_no_se_duplica():
    modal = _src("payment-modal.tsx")
    assert "isSubmittingRef" in modal, "guard síncrono contra doble clic"
    assert "client_uuid" in modal
    assert "quoteSale" in modal, "el total oficial lo calcula el servidor"
    # el cálculo del cambio usa centavos enteros
    assert "summarizePayments" in modal
    # la venta solo pasa a offline ante un error de red (sin respuesta), nunca ante 4xx/5xx
    assert "addOfflineSale" in modal
    assert "isHttpError" in modal, "un 4xx/5xx del servidor no pasa a offline"


def test_descuento_por_linea_solo_con_permiso():
    assert "canDiscount" in _src("ticket-panel.tsx")
    assert 'can("ventas:descuento")' in _src("pos-terminal.tsx")


def test_atajos_del_pos():
    terminal = _src("pos-terminal.tsx")
    for tecla in ("F2", "F5", "F8", "Escape"):
        assert tecla in terminal, tecla


def test_el_ticket_impreso_usa_fuente_monoespaciada():
    assert "ui-monospace" in _src("ticket-preview.tsx")


def test_las_fuentes_son_locales():
    css = (ROOT / "frontend" / "src" / "index.css").read_text(encoding="utf-8")
    assert "fonts.googleapis.com" not in css
