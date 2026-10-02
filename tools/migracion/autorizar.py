"""Genera el token de usuario con el que la herramienta de migracion ESCRIBE hojas.

Se corre una vez por destino:
    uv run --no-project --with google-auth-oauthlib --with google-api-python-client python tools/migracion/autorizar.py lab
    ... autorizar.py prod        (solo cuando toque produccion)

Abre el navegador: inicia sesion con la cuenta que sea EDITORA del libro y acepta. El
refresh token queda en tools/migracion/.tokens/<destino>.json (fuera de git). Al final hace
una prueba de SOLO LECTURA contra el libro: titulo y numero de pestanas.

El scope `spreadsheets` no se puede acotar a un libro en Google: el candado real es la lista
blanca de IDs del codigo que escriba (LIBROS, abajo), no este token.
"""
import json
import sys
from pathlib import Path

from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

RAIZ = Path(__file__).resolve().parents[2]
CLIENTE = RAIZ / "generic-tool.json"
TOKENS = Path(__file__).resolve().parent / ".tokens"
SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]

LIBROS = {
    "lab": "1-RA6lmh-rZ-OKfsZSLl2Qd9lLyuDZ3dx3fP0M7qL-5o",
    "prod": "1h5ibDsmVtrG27rwMaOvj-lm08QZUHzDv3woPmkfRQrk",
}


def main():
    destino = sys.argv[1] if len(sys.argv) > 1 else ""
    if destino not in LIBROS:
        sys.exit("Uso: autorizar.py lab|prod")
    flujo = InstalledAppFlow.from_client_secrets_file(str(CLIENTE), SCOPES)
    cred = flujo.run_local_server(port=0, prompt="consent", access_type="offline")
    if not cred.refresh_token:
        sys.exit("Google no entrego refresh_token. Revoca el acceso de la app y repite.")
    TOKENS.mkdir(exist_ok=True)
    ruta = TOKENS / (destino + ".json")
    ruta.write_text(json.dumps({"refresh_token": cred.refresh_token}), encoding="utf-8")
    print("Token guardado en", ruta)

    meta = build("sheets", "v4", credentials=cred).spreadsheets().get(
        spreadsheetId=LIBROS[destino], fields="properties.title,sheets.properties.title").execute()
    print("Prueba de lectura OK:", meta["properties"]["title"], "-", len(meta["sheets"]), "pestanas")


def credenciales(destino):
    """Para el resto de la herramienta: credenciales de escritura del destino."""
    datos = json.loads((TOKENS / (destino + ".json")).read_text(encoding="utf-8"))
    c = json.loads(CLIENTE.read_text(encoding="utf-8"))["installed"]
    return Credentials(None, refresh_token=datos["refresh_token"], token_uri=c["token_uri"],
                       client_id=c["client_id"], client_secret=c["client_secret"], scopes=SCOPES)


if __name__ == "__main__":
    main()
