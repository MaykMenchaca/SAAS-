"""Mide el contraste WCAG de los pares texto/fondo del sistema "Industry" en claro y oscuro.

Lee los tokens de frontend/src/index.css (bloques `@theme` y `html.dark`), resuelve var(), hex,
oklch() y color-mix(in srgb, X n%, transparent) y compone las transparencias sobre el fondo
(igual que el navegador, en espacio sRGB). Sale con código 1 si algún par obligatorio falla.

  python tools/contrast_check.py            # tabla completa
  python tools/contrast_check.py --quiet    # solo fallos y resumen (para el hook / CI)
"""
import math
import re
import sys
from pathlib import Path

CSS = Path(__file__).resolve().parents[1] / "frontend" / "src" / "index.css"

# (descripción, token de texto, fondo, mínimo). Un fondo "a/b" = a (con transparencia) sobre b.
TEXT = 4.5
UI = 3.0
PAIRS = [
    ("Texto principal", "text", "bg", TEXT),
    ("Texto principal sobre campo", "text", "surface", TEXT),
    ("Texto secundario", "ink-2", "bg", TEXT),
    ("Texto secundario sobre campo", "ink-2", "surface", TEXT),
    ("Texto de acento", "acc-text", "bg", TEXT),
    ("Texto de acento sobre tinte", "acc-text", "acc-tint/bg", TEXT),
    ("Texto principal sobre tinte de acento", "text", "acc-tint/bg", TEXT),
    # Elementos seleccionados o en hover (producto en el ticket, ítem activo): el texto secundario también va sobre el tinte
    ("Texto secundario sobre tinte de acento", "ink-2", "acc-tint/bg", TEXT),
    ("Texto secundario sobre hover suave", "ink-2", "line-soft/bg", TEXT),
    ("Botón primario (texto sobre acento)", "on-acc", "accent", TEXT),
    ("Botón primario en hover", "on-acc", "accent-hover", TEXT),
    ("Botón de peligro", "on-bad", "bad", TEXT),
    ("Éxito (texto)", "ok", "bg", TEXT),
    ("Éxito sobre su tinte", "ok", "ok-tint/bg", TEXT),
    ("Advertencia (texto)", "warn", "bg", TEXT),
    ("Advertencia sobre su tinte", "warn", "warn-tint/bg", TEXT),
    ("Error (texto)", "bad", "bg", TEXT),
    ("Error sobre su tinte", "bad", "bad-tint/bg", TEXT),
    ("Foco y borde de acento sobre fondo", "accent", "bg", UI),
    ("Borde de acento sobre campo", "accent", "surface", UI),
    ("Borde de campos y controles", "field-border", "bg", UI),
    ("Borde de campos sobre campo relleno", "field-border", "surface", UI),
]
INFO = [  # solo informativo: no hacen fallar la verificación
    ("Texto terciario (SOLO decorativo)", "ink-3", "bg"),
    ("Línea divisoria", "divider", "bg"),
]


def parse_blocks(css):
    css = re.sub(r"/\*.*?\*/", "", css, flags=re.S)

    def body(selector):
        m = re.search(re.escape(selector) + r"\s*\{(.*?)\}", css, flags=re.S)
        return m.group(1) if m else ""

    def decls(text):
        return {n: v.strip() for n, v in re.findall(r"(--[\w-]+)\s*:\s*([^;]+);", text)}

    light = decls(body("@theme"))
    dark = {**light, **decls(body("html.dark"))}
    return {"claro": light, "oscuro": dark}


def oklch_to_rgb(L, C, H):
    h = math.radians(H)
    a, b = C * math.cos(h), C * math.sin(h)
    l_, m_, s_ = L + 0.3963377774 * a + 0.2158037573 * b, L - 0.1055613458 * a - 0.0638541728 * b, L - 0.0894841775 * a - 1.2914855480 * b
    l, m, s = l_ ** 3, m_ ** 3, s_ ** 3
    lin = (4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
           -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
           -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s)
    enc = lambda c: 12.92 * c if c <= 0.0031308 else 1.055 * max(c, 0) ** (1 / 2.4) - 0.055
    return tuple(min(1.0, max(0.0, enc(c))) for c in lin)


def color(value, vars_, depth=0):
    """Devuelve (r, g, b, a) con r,g,b en 0..1."""
    if depth > 12:
        raise ValueError("var() circular: " + value)
    v = value.strip()
    m = re.fullmatch(r"var\((--[\w-]+)\)", v)
    if m:
        return color(vars_[m.group(1)], vars_, depth + 1)
    m = re.fullmatch(r"#([0-9a-fA-F]{6})", v)
    if m:
        h = m.group(1)
        return (int(h[0:2], 16) / 255, int(h[2:4], 16) / 255, int(h[4:6], 16) / 255, 1.0)
    m = re.fullmatch(r"#([0-9a-fA-F]{3})", v)
    if m:
        return tuple(int(c * 2, 16) / 255 for c in m.group(1)) + (1.0,)
    m = re.fullmatch(r"rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)", v)
    if m:
        return (int(m.group(1)) / 255, int(m.group(2)) / 255, int(m.group(3)) / 255, float(m.group(4) or 1))
    m = re.fullmatch(r"oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)(?:\s*/\s*([\d.]+))?\s*\)", v)
    if m:
        L = float(m.group(1)) / (100 if m.group(2) else 1)
        r, g, b = oklch_to_rgb(L, float(m.group(3)), float(m.group(4)))
        return (r, g, b, float(m.group(5) or 1))
    m = re.fullmatch(r"color-mix\(\s*in\s+srgb\s*,\s*(.+?)\s+([\d.]+)%\s*,\s*transparent\s*\)", v)
    if m:
        r, g, b, a = color(m.group(1), vars_, depth + 1)
        return (r, g, b, a * float(m.group(2)) / 100)
    raise ValueError("valor de color no soportado por contrast_check.py: " + v)


def over(fg, bg):
    r, g, b, a = fg
    return tuple(c * a + k * (1 - a) for c, k in zip((r, g, b), bg[:3])) + (1.0,)


def lum(rgb):
    f = lambda c: c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (f(c) for c in rgb[:3])
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def ratio(a, b):
    la, lb = lum(a), lum(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def resolve_bg(spec, vars_):
    """'a/b' = a sobre b; 'a' = a (opaco o sobre el fondo de la página)."""
    layers = [color(vars_["--color-" + t], vars_) for t in spec.split("/")]
    page = color(vars_["--color-bg"], vars_)
    out = over(layers[-1], page)
    for layer in reversed(layers[:-1]):
        out = over(layer, out)
    return out


def main(quiet):
    themes = parse_blocks(CSS.read_text(encoding="utf-8"))
    failures = 0
    for name, vars_ in themes.items():
        if not quiet:
            print(f"\n== Tema {name} ==")
        for label, fg, bg, minimum in PAIRS:
            back = resolve_bg(bg, vars_)
            front = over(color(vars_["--color-" + fg], vars_), back)
            r = ratio(front, back)
            ok = r >= minimum
            failures += not ok
            if not ok or not quiet:
                print(f"  [{'OK  ' if ok else 'FALLA'}] {r:5.2f}:1 (mín {minimum})  {label}  [{fg} sobre {bg}]")
        if not quiet:
            for label, fg, bg in INFO:
                back = resolve_bg(bg, vars_)
                r = ratio(over(color(vars_["--color-" + fg], vars_), back), back)
                print(f"  [info] {r:5.2f}:1  {label}")
    total = len(PAIRS) * len(themes)
    print(f"\nContraste: {total - failures}/{total} pares cumplen" + ("" if not failures else f" — {failures} FALLAN"))
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main("--quiet" in sys.argv))
