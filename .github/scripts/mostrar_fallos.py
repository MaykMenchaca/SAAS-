"""Publica como anotaciones de GitHub las líneas FAILED/ERROR de un archivo de salida de pytest (o su cola)."""
import re
import sys

lineas = [l.rstrip() for l in open(sys.argv[1], encoding="utf-8", errors="replace")]
fallos = [l for l in lineas if l.startswith(("FAILED", "ERROR"))] or lineas[-25:]
for l in fallos[:30]:
    print("::error title=pytest::" + re.sub(r"[\r\n%]", " ", l)[:380])
