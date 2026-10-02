"""Abrir un libro con el token de usuario, con la LISTA NEGRA de escritura.

El scope `spreadsheets` de Google no se puede acotar a un libro: da acceso a todo lo que la
cuenta ve. El candado real es este archivo: PRODUCCIÓN no se abre para escribir, venga de
donde venga el id (--libro, una URL, un alias). Se puede LEER siempre, porque es el origen
del replanchado.
"""
import re

from googleapiclient.discovery import build

import catalogo as cat
from autorizar import credenciales, tiene_drive
from libro import LibroApi

ALIAS = {"lab": cat.REPLANCHE["destino"], "prod": cat.PRODUCCION}   # prod: solo para LEER

# Jamás destino de una escritura de esta herramienta. Producción se migra el día del apagado
# de AppSheet, y para eso esta línea se cambia a propósito, en su propio commit.
PROHIBIDOS_ESCRITURA = {cat.PRODUCCION: "PRODUCCIÓN (ControlVehicular)"}


def api():
    return build("sheets", "v4", credentials=credenciales("lab"), cache_discovery=False).spreadsheets()


def copiar_produccion(nombre):
    """Duplica producción en Drive (Archivo → Crear una copia) y devuelve el id de la copia.

    La copia trae formatos, validaciones, fórmulas y anchos de columna: el pipeline solo toca
    lo que migra. Queda en la misma carpeta que producción. Solo LEE producción.
    """
    if not tiene_drive("lab"):
        raise SystemExit("El token no tiene permiso de Drive. Corre una vez:\n"
                         "  uv run --no-project --with google-auth-oauthlib --with google-api-python-client "
                         "python tools/migracion/autorizar.py lab")
    drive = build("drive", "v3", credentials=credenciales("lab"), cache_discovery=False)
    copia = drive.files().copy(fileId=cat.PRODUCCION, body={"name": nombre},
                               supportsAllDrives=True, fields="id").execute()
    return copia["id"]


def id_de(texto):
    """'lab', un id o una URL de Google Sheets → el id del libro."""
    t = (texto or "").strip()
    if t in ALIAS:
        return ALIAS[t]
    m = re.search(r"/spreadsheets/d/([A-Za-z0-9_-]+)", t)
    if m:
        return m.group(1)
    if re.fullmatch(r"[A-Za-z0-9_-]{25,}", t):
        return t
    raise SystemExit("No entiendo '%s' como libro: pasa 'lab', el id o la URL del libro." % texto)


def exigir_escribible(ss_id):
    if ss_id in PROHIBIDOS_ESCRITURA:
        raise SystemExit("El libro %s es %s: está en la lista negra y esta herramienta no escribe "
                         "ahí. Ver tools/migracion/conexion.py." % (ss_id, PROHIBIDOS_ESCRITURA[ss_id]))


def abrir(libro, nombres=None, puede_escribir=False):
    ss_id = id_de(libro)
    if puede_escribir:
        exigir_escribible(ss_id)
    return LibroApi(api(), ss_id, nombres, puede_escribir=puede_escribir)
