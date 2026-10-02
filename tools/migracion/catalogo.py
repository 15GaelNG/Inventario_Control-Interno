"""El catálogo de hojas, leído de catalogo.json (que se GENERA de src/ con exportar-catalogo.js).

Equivale a Entidades.gs más las listas de MigracionIds.gs. No se edita aquí: si una hoja
cambia, se cambia en src/config/Entidades.gs y se vuelve a exportar.
"""
import json
import re
from pathlib import Path

_DATOS = json.loads((Path(__file__).resolve().parent / "catalogo.json").read_text(encoding="utf-8"))

COLUMNA_ID = _DATOS["columnas"]["id"]
COLUMNA_ID_ANTERIOR = _DATOS["columnas"]["idAnterior"]
COLUMNA_ID_ANTERIOR_LEGADO = _DATOS["columnas"]["idAnteriorLegado"]

HOJAS = _DATOS["hojas"]
REFERENCIAS_MIGRACION = _DATOS["referenciasMigracion"]
REFERENCIAS_ENTIDADES = _DATOS["referenciasEntidades"]
NOMBRES = _DATOS["nombres"]
ENCABEZADOS_DEDUCIDOS = _DATOS["encabezadosDeducidos"]
FAMILIAS = _DATOS["familias"]
PRODUCCION = _DATOS["produccion"]
SELLO_METADATO = _DATOS["selloMetadato"]
REPLANCHE = _DATOS["replanche"]


def _clave_hoja(v):
    # Entidades.clave_: espacios repetidos a uno, sin orillas, en mayúsculas
    return re.sub(r"\s+", " ", "" if v is None else str(v)).strip().upper()


_POR_CLAVE = {_clave_hoja(h["hoja"]): h for h in HOJAS}


def de(hoja):
    return _POR_CLAVE.get(_clave_hoja(hoja))


def existe(hoja):
    return de(hoja) is not None


def todas():
    return list(HOJAS)


def migrables():
    return [h for h in HOJAS if h["migrable"]]


def de_familia(nombre=None):
    """Entidades.deFamilia: las migrables, o solo las de una familia."""
    hojas = migrables()
    if not nombre:
        return hojas
    f = str(nombre).strip().lower()
    return [h for h in hojas if (h["familia"] or "otros") == f]


def familia_de(hoja):
    e = de(hoja)
    return (e["familia"] or "otros") if e else None
