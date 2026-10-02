"""Abrir un libro con el token de usuario, con la lista blanca de escritura.

El scope `spreadsheets` de Google no se puede acotar a un libro: da acceso a todo lo que la
cuenta ve. El candado real es este archivo. Solo LAB se puede abrir para escribir sin más;
producción pide `permitir_produccion=True`, que solo pone migrar.py con --produccion.
"""
from googleapiclient.discovery import build

from autorizar import LIBROS, credenciales
from libro import LibroApi

ESCRIBIBLES = {"lab"}


def api():
    return build("sheets", "v4", credentials=credenciales("lab"), cache_discovery=False).spreadsheets()


def abrir(destino, nombres=None, puede_escribir=False, permitir_produccion=False):
    if destino not in LIBROS:
        raise SystemExit("No conozco el libro '%s'. Los que hay: %s" % (destino, ", ".join(LIBROS)))
    if puede_escribir and destino not in ESCRIBIBLES and not (destino == "prod" and permitir_produccion):
        raise SystemExit("'%s' no está en la lista blanca de escritura." % destino)
    return LibroApi(api(), LIBROS[destino], nombres, puede_escribir=puede_escribir)
