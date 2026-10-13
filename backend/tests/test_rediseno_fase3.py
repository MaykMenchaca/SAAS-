"""Rediseño Industry, Fase 3: shell (menú lateral, encabezado, paleta y drawer)."""
import importlib.util
import re
from pathlib import Path

ROOT = Path(__file__).parents[2]
LAYOUT = ROOT / "frontend" / "src" / "components" / "layout"

VIEJOS = re.compile(
    r"\b(?:bg|text|border|ring|fill|stroke|from|to|divide|outline|placeholder)-"
    r"(?:neutral-[a-z-]+|primary(?:-[a-z]+)?|success(?:-text)?|warning(?:-text)?|danger(?:-text)?|info(?:-text)?|on-primary|on-danger|sidebar-[a-z]+)\b"
)
REDONDEADAS = re.compile(r"\brounded-(?:sm|md|lg|xl|2xl|3xl)\b")


def _read(*parts):
    return ROOT.joinpath(*parts).read_text(encoding="utf-8-sig")


def test_el_shell_esta_dividido_en_piezas_pequenas():
    shell = (LAYOUT / "app-shell.tsx").read_text(encoding="utf-8")
    assert len(shell.splitlines()) < 150, "app-shell.tsx debe solo componer (antes tenía 921 líneas)"
    for pieza in ("sidebar", "topbar", "mobile-drawer", "nav-list", "nav-config", "brand-mark", "brand-customizer", "shift-card", "user-card", "use-brand"):
        assert any((LAYOUT / f"{pieza}{ext}").exists() for ext in (".tsx", ".ts")), pieza


def test_el_menu_se_colapsa_solo_en_el_pos_y_se_puede_colapsar_a_mano():
    shell = (LAYOUT / "app-shell.tsx").read_text(encoding="utf-8")
    assert "isPosRoute || manualCollapsed" in shell
    assert "lg:grid-cols-[64px_minmax(0,1fr)]" in shell and "lg:grid-cols-[236px_minmax(0,1fr)]" in shell
    assert '"sidebar-collapsed"' in shell, "la preferencia manual se recuerda"


def test_archivos_del_layout_sin_nombres_de_color_viejos_ni_esquinas_redondeadas():
    for ruta in LAYOUT.glob("*.tsx"):
        if ruta.name == "error-boundary.tsx":  # fuera del alcance del shell
            continue
        codigo = ruta.read_text(encoding="utf-8-sig")
        assert not VIEJOS.findall(codigo), f"{ruta.name}: {sorted(set(VIEJOS.findall(codigo)))}"
        assert not REDONDEADAS.findall(codigo), f"{ruta.name} redondea esquinas"


def test_la_navegacion_filtra_por_permisos_y_configuracion_es_solo_admin():
    cfg = (LAYOUT / "nav-config.ts").read_text(encoding="utf-8")
    assert "adminOnly: true" in cfg and "if (item.adminOnly && !opts.isAdmin) return false;" in cfg
    assert "filterNav(navSections" in (LAYOUT / "app-shell.tsx").read_text(encoding="utf-8")


def test_el_turno_viene_de_la_api_y_no_se_consulta_sin_permiso():
    codigo = (LAYOUT / "shift-card.tsx").read_text(encoding="utf-8")
    assert "getActiveSession" in codigo and 'qk.activePosSession("mia")' in codigo
    assert 'can("caja:ver")' in codigo
    assert "Sin turno abierto" in codigo


def test_encabezado_replica_el_corte_de_1200px_y_no_oculta_el_estado_sin_conexion():
    topbar = (LAYOUT / "topbar.tsx").read_text(encoding="utf-8")
    assert "min-[1200px]" in topbar, "el diseño pasa a buscador de icono por debajo de 1200 px"
    # sin conexión la etiqueta es visible en cualquier ancho
    assert re.search(r'online \? "hidden[^"]*sm:flex" : "flex ', topbar)
    assert "useServerStatus" in topbar


def test_cn_resuelve_conflictos_de_tailwind():
    cn = (ROOT / "frontend" / "src" / "lib" / "cn.ts").read_text(encoding="utf-8")
    assert "extendTailwindMerge" in cn and 'text: ["page"]' in cn
    assert '"tailwind-merge"' in (ROOT / "frontend" / "package.json").read_text(encoding="utf-8")


def test_herramienta_de_migracion_de_tokens():
    spec = importlib.util.spec_from_file_location("migrate_tokens", ROOT / "tools" / "migrate_tokens.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    out, n_color, n_round = mod.migrate('className="rounded-md border border-neutral-border bg-neutral-surface text-danger rounded-full"')
    assert out == 'className="border border-divider bg-bg text-bad rounded-full"'
    assert n_color == 3 and n_round == 1
    # no toca nombres que no son utilidades de color
    assert mod.migrate("const primary = 1; // danger zone")[0] == "const primary = 1; // danger zone"
