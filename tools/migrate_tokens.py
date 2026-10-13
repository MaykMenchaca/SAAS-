"""Migra las clases de color/forma anteriores al rediseño Industry a los tokens nuevos (fases 3-7).

Renombra utilidades de Tailwind en archivos .tsx (bg-neutral-surface -> bg-bg, text-danger -> text-bad,
border-neutral-border -> border-divider ...) y quita las esquinas redondeadas (el sistema es de línea recta;
`rounded-full` se conserva para puntos y avatares circulares).

  python tools/migrate_tokens.py frontend/src/pages/users.tsx          # aplica
  python tools/migrate_tokens.py --dry frontend/src/pages/*.tsx        # solo cuenta, no escribe

La herramienta es mecánica: revisa el resultado en el navegador. Tras migrar una pantalla, el siguiente
`grep` debe dar 0: ver la subfase 8.3 (eliminar los alias de index.css).
"""
import re
import sys
from pathlib import Path

# nombre viejo -> nombre nuevo (se prueban de más largo a más corto)
NAMES = {
    "neutral-text-primary": "text",
    "neutral-text-secondary": "ink-2",
    "neutral-text-muted": "ink-2",
    "neutral-decorative": "ink-3",
    "neutral-border-strong": "field-border",
    "neutral-border": "divider",
    "neutral-surface-raised": "surface",
    "neutral-surface": "bg",
    "neutral-bg": "bg",
    "primary-text": "acc-text",
    "primary-hover": "accent-hover",
    "primary": "accent",
    "on-primary": "on-acc",
    "on-danger": "on-bad",
    "success-text": "ok",
    "success": "ok",
    "warning-text": "warn",
    "warning": "warn",
    "danger-text": "bad",
    "danger": "bad",
    "info-text": "acc-text",
    "info": "accent",
    "outline": "field-border",
}
PREFIXES = r"(?:bg|text|border(?:-[trblxy])?|ring|ring-offset|fill|stroke|from|via|to|divide|outline|placeholder|accent|decoration|caret|shadow)"
ALT = "|".join(sorted((re.escape(n) for n in NAMES), key=len, reverse=True))
COLOR_RE = re.compile(rf"(?<![\w-])({PREFIXES}-)({ALT})(?![\w-])")
# rounded, rounded-md, rounded-t-lg ... (no rounded-full / rounded-none)
_ROUNDED = r"rounded(?:-(?:[trblse]|tl|tr|bl|br|ss|se|es|ee))?(?:-(?:xs|sm|md|lg|xl|2xl|3xl|4xl))?(?![\w-])"
# Si es la primera clase (justo tras la comilla) se come el espacio de DESPUÉS; si no, el de ANTES
ROUND_FIRST_RE = re.compile(rf"(?<=[\"'`])(?<![\w-]){_ROUNDED}[ \t]*")
ROUND_RE = re.compile(rf"[ \t]?(?<![\w-]){_ROUNDED}")


def migrate(text: str) -> tuple[str, int, int]:
    n_color = len(COLOR_RE.findall(text))
    text = COLOR_RE.sub(lambda m: m.group(1) + NAMES[m.group(2)], text)
    # `rounded-full` y `rounded-none` se respetan: el patrón solo captura rounded[-lado][-tamaño] sin "full"/"none"
    n_round = 0

    def drop_round(m):
        nonlocal n_round
        if re.search(r"rounded-(?:full|none)", m.group(0)):
            return m.group(0)
        n_round += 1
        return ""

    text = ROUND_FIRST_RE.sub(drop_round, text)
    text = ROUND_RE.sub(drop_round, text)
    return text, n_color, n_round


def main(argv):
    dry = "--dry" in argv
    files = [Path(a) for a in argv if not a.startswith("--")]
    if not files:
        print(__doc__)
        return 2
    total_c = total_r = 0
    for f in files:
        original = f.read_text(encoding="utf-8")
        migrated, nc, nr = migrate(original)
        total_c += nc
        total_r += nr
        print(f"{'(dry) ' if dry else ''}{f}: {nc} colores, {nr} esquinas")
        if not dry and migrated != original:
            f.write_text(migrated, encoding="utf-8", newline="")
    print(f"Total: {total_c} colores, {total_r} esquinas en {len(files)} archivos")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
