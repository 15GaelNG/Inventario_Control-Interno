"""Baja un libro a JSON (el formato de LibroMemoria) para ensayar o comparar sin tocar Google.

    uv run ... python tools/migracion/foto.py lab            -> fotos/lab_AAAA-MM-DD_HHMM.json

Solo lee. Trae las hojas del catálogo que existan en el libro. Las fotos traen datos
personales: viven en tools/migracion/fotos/, que git ignora.
"""
import datetime
import json
import sys
from pathlib import Path

import catalogo as cat
from conexion import abrir

FOTOS = Path(__file__).resolve().parent / "fotos"


def main():
    destino = sys.argv[1] if len(sys.argv) > 1 else "lab"
    libro = abrir(destino, [h["hoja"] for h in cat.todas()], puede_escribir=False)
    FOTOS.mkdir(exist_ok=True)
    ruta = FOTOS / ("%s_%s.json" % (destino, datetime.datetime.now().strftime("%Y-%m-%d_%H%M")))
    ruta.write_text(json.dumps(libro.a_json(), ensure_ascii=False), encoding="utf-8")
    celdas = sum(sum(len(f) for f in h.filas) for h in libro.hojas.values())
    print("Foto de %s: %d hojas, %d celdas -> %s" % (libro.nombre, len(libro.hojas), celdas, ruta))


if __name__ == "__main__":
    main()
