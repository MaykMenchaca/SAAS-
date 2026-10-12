"""Rediseño Industry, Fase 1: tokens, fuentes locales, iconos y primitivas (docs/rediseno-2026-10/plan.md)."""
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).parents[2]


def _read(*parts):
    return ROOT.joinpath(*parts).read_text(encoding="utf-8")


def test_contraste_wcag_de_los_tokens_en_claro_y_oscuro():
    """Todos los pares texto/fondo cumplen 4.5:1 (texto) o 3:1 (bordes y foco) en ambos temas."""
    r = subprocess.run([sys.executable, str(ROOT / "tools" / "contrast_check.py")], capture_output=True, text=True)
    assert r.returncode == 0, r.stdout + r.stderr
    assert "FALLA" not in r.stdout
    assert "pares cumplen" in r.stdout


def test_acento_oscurecido_para_cumplir_contraste():
    css = _read("frontend", "src", "index.css")
    # Decisión 2026-10-12: tono 700, no el #5980a6 del prototipo (3.7:1 con texto claro)
    assert re.search(r"--color-accent:\s*#416180;", css)
    assert not re.search(r"--[\w-]+:\s*#5980a6", css), "ningún token debe usar el acento original del prototipo"


def test_fuentes_barlow_locales_y_sin_google_fonts():
    html = _read("frontend", "index.html")
    assert "fonts.googleapis.com" not in html and "fonts.gstatic.com" not in html, "el POS opera sin internet"
    main = _read("frontend", "src", "main.tsx")
    for face in ("@fontsource/barlow/latin-400.css", "@fontsource/barlow/latin-700.css", "@fontsource/barlow-condensed/latin-600.css"):
        assert face in main, face
    css = _read("frontend", "src", "index.css")
    assert '--font-heading: "Barlow Condensed"' in css and '--font-sans: "Barlow"' in css
    assert "Inter" not in css and "JetBrains" not in css


def test_esquinas_rectas_e_iconos_de_trazo_fino():
    css = _read("frontend", "src", "index.css")
    for token in ("--radius-sm", "--radius-md", "--radius-lg", "--radius-xl", "--radius-2xl"):
        assert re.search(token + r":\s*0px;", css), token
    assert re.search(r"svg\.lucide\s*\{\s*stroke-width:\s*1\.5;", css)


def test_primitiva_blueprint_y_componente_corners():
    css = _read("frontend", "src", "index.css")
    assert ".blueprint" in css and ".blueprint > .corner.tl" in css and ".blueprint > .corner.br" in css
    corners = _read("frontend", "src", "components", "ui", "corners.tsx")
    assert all(f'className="corner {p}"' in corners for p in ("tl", "tr", "bl", "br"))
    assert 'aria-hidden="true"' in corners
    assert "Corners" in _read("frontend", "src", "components", "ui", "index.ts")


def test_alias_de_nombres_viejos_apuntan_a_tokens_nuevos():
    css = _read("frontend", "src", "index.css")
    for old, new in (("--color-primary", "--color-accent"), ("--color-danger", "--color-bad"),
                     ("--color-neutral-border", "--color-divider"), ("--color-neutral-text-secondary", "--color-ink-2")):
        assert re.search(re.escape(old) + r":\s*var\(" + re.escape(new) + r"\)", css), f"{old} debe ser alias de {new}"
