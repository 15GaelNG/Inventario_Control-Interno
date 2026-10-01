# -*- coding: utf-8 -*-
"""
Verifica una corrida del pipeline de IDs comparando el libro ANTES y DESPUÉS.

Es la red externa del ensayo: el pipeline se audita a sí mismo desde dentro, y esto lo
audita desde fuera, leyendo el spreadsheet directo por API. Si las dos cosas coinciden, la
corrida quedó bien; si no, algo pasó que el pipeline no vio.

    # antes de correr el pipeline
    uv run --no-project --with google-api-python-client --with google-auth \
        python tools/verificar-migracion/verificar.py foto antes.json

    # después de correrlo
    uv run --no-project --with google-api-python-client --with google-auth \
        python tools/verificar-migracion/verificar.py foto despues.json
    uv run --no-project --with google-api-python-client --with google-auth \
        python tools/verificar-migracion/verificar.py comparar antes.json despues.json

El libro se elige con --libro (por omisión, el laboratorio). Todo es SOLO LECTURA.
"""
import io
import json
import re
import sys

from google.oauth2 import service_account
from googleapiclient.discovery import build

CREDENCIALES = (r"D:\Usuarios\Ciudad Maderas\Documentos\Analisis\herramientas\gt"
                r"\portal\tool-sheets-api.json")

LIBROS = {
    "lab": "1-RA6lmh-rZ-OKfsZSLl2Qd9lLyuDZ3dx3fP0M7qL-5o",
    "dev": "1fC77Uu1ePVUySNvhgWXMHqWpLhGhBMTZZMEblU2nUhI",
    "produccion": "1h5ibDsmVtrG27rwMaOvj-lm08QZUHzDv3woPmkfRQrk",
}

# Las hojas migrables que ESPERAMOS. La lista se queda escrita aquí a mano, y no se lee
# de Entidades.gs, a propósito: si este verificador usara el mismo catálogo que el
# pipeline, los dos se equivocarían igual y dejaría de ser una red externa.
#
# Las cuatro últimas ya no existen en el libro del equipo (Líneas las eliminó el
# 30/09/2026) pero SÍ en producción, así que se quedan en la lista: cuáles están y cuáles
# no es justamente uno de los datos de la foto, y se compara entre antes y después.
HOJAS_ESPERADAS = [
    "VEHICULOS", "CAMBIOS VEHICULOS", "REASIGNACIONES_VEHICULOS",
    "VERIFICACIONES", "INSPECCION VEHICULAR",
    "INSTALACION DE SENSORES", "HOLOGRAMAS", "INCIDENCIAS", "LINEAS TELEFONICAS",
    "INSPECCIONES LINEAS", "RESPONSIVAS LINEAS",
    "CAMBIOS LINEAS TELEFONICAS",
    "ACCESORIOS CELULARES", "MOVIMIENTOS_ACCESORIOS", "ARQUEOS", "CAJAS CHICAS",
    "INCREMENTOS", "UBER", "TICKETS", "COLABORADORES",
    # Eliminadas en el libro del equipo, presentes en producción:
    "HISTORIAL_REASIGNACIONES", "REACTIVACION DE LINEAS",
    "SOLICITUD DE LINEAS", "BITACORA DE DESECHO",
]

# Compatibilidad: el nombre viejo, por si alguien lo importa.
HOJAS = HOJAS_ESPERADAS

# Las 4 que conservan el nombre de su llave: no son ids de AppSheet, son datos de la
# empresa. Ver llaveEsDato en src/config/Entidades.gs.
LLAVE_ES_DATO = {
    "INSPECCION VEHICULAR": "ID INSPECCION",
    "ARQUEOS": "ID ARQUEO",
    "CAJAS CHICAS": "ID CCH",
    "COLABORADORES": "No EMPLEADO",
}

FORMA_NUEVA = re.compile(r"^[A-Z]{3}-[0-9A-HJKMNP-TV-Z]{14}$")

norm = lambda v: " ".join(str(v if v is not None else "").upper().split())


def letra(i):
    """Número de columna (base 1) a letra de Sheets."""
    s = ""
    while i:
        i, r = divmod(i - 1, 26)
        s = chr(65 + r) + s
    return s


def api_de():
    cred = service_account.Credentials.from_service_account_file(
        CREDENCIALES, scopes=["https://www.googleapis.com/auth/spreadsheets.readonly"])
    return build("sheets", "v4", credentials=cred).spreadsheets()


def tomar_foto(libro):
    api = api_de()

    # Se le pregunta al LIBRO qué pestañas tiene, en vez de dar por hecho las esperadas.
    # Sin esto, batchGet truena entero con "Unable to parse range" en cuanto falta una, y
    # la foto no se puede tomar — que es lo que pasaba con el libro del equipo, al que
    # Líneas le eliminó cuatro.
    meta = api.get(spreadsheetId=libro, includeGridData=False).execute()
    presentes = set(h["properties"]["title"] for h in meta["sheets"])
    hojas = [h for h in HOJAS_ESPERADAS if h in presentes]
    ausentes = [h for h in HOJAS_ESPERADAS if h not in presentes]
    if ausentes:
        print("Aviso: %d de las %d hojas esperadas no están en este libro:"
              % (len(ausentes), len(HOJAS_ESPERADAS)))
        for h in ausentes:
            print("   - %s" % h)
        print("   (queda anotado en la foto; comparar avisa si eso cambia)\n")

    got = api.values().batchGet(
        spreadsheetId=libro,
        ranges=["'%s'!1:1" % h.replace("'", "''") for h in hojas]).execute()["valueRanges"]
    foto = {}
    for h, vr in zip(hojas, got):
        v = vr.get("values", [[]])
        enc = [str(c).strip() for c in (v[0] if v else [])]
        arriba = [norm(c) for c in enc]
        r = api.values().get(spreadsheetId=libro, range="'%s'!A:A" % h.replace("'", "''")).execute()
        d = {
            "filas": len(r.get("values", [])) - 1,
            "columnas": len(enc),
            "encabezados": enc,
            "pos_ID": arriba.index("ID") + 1 if "ID" in arriba else 0,
            "pos_ID_ANTERIOR": arriba.index("ID ANTERIOR") + 1 if "ID ANTERIOR" in arriba else 0,
        }
        if d["pos_ID"]:
            col = letra(d["pos_ID"])
            vals = [x[0] for x in api.values().get(
                spreadsheetId=libro,
                range="'%s'!%s2:%s" % (h.replace("'", "''"), col, col)
            ).execute().get("values", []) if x]
            conDato = [norm(x) for x in vals if str(x).strip()]
            d["ids_con_dato"] = len(conDato)
            d["ids_unicos"] = len(set(conDato))
            d["ids_forma_nueva"] = len([x for x in conDato if FORMA_NUEVA.match(x)])
            d["ids_prefijo_ok"] = len([x for x in conDato if FORMA_NUEVA.match(x)
                                       and x.split("-")[0] == PREFIJO.get(h, "")])
        foto[h] = d
    return foto


# Prefijo esperado por hoja (src/config/Entidades.gs)
PREFIJO = {
    "VEHICULOS": "VEH", "CAMBIOS VEHICULOS": "CVE", "REASIGNACIONES_VEHICULOS": "RVE",
    "HISTORIAL_REASIGNACIONES": "HIS", "VERIFICACIONES": "VER",
    "INSPECCION VEHICULAR": "INS", "INSTALACION DE SENSORES": "SEN", "HOLOGRAMAS": "HOL",
    "INCIDENCIAS": "INC", "LINEAS TELEFONICAS": "LIN", "INSPECCIONES LINEAS": "ILI",
    "RESPONSIVAS LINEAS": "RLI", "REACTIVACION DE LINEAS": "REA",
    "SOLICITUD DE LINEAS": "SOL", "CAMBIOS LINEAS TELEFONICAS": "CLI",
    "BITACORA DE DESECHO": "DES", "ACCESORIOS CELULARES": "ACC",
    "MOVIMIENTOS_ACCESORIOS": "MAC", "ARQUEOS": "ARQ", "CAJAS CHICAS": "CCH",
    "INCREMENTOS": "MON", "UBER": "UBE", "TICKETS": "TCK", "COLABORADORES": "COL",
}


def imprimir_foto(foto):
    print("%-28s %6s %5s %4s %7s %8s %9s %8s" % (
        "HOJA", "filas", "cols", "ID", "ID ANT", "c/dato", "fmt nuevo", "unicos"))
    print("-" * 88)
    for h in [x for x in HOJAS_ESPERADAS if x in foto]:
        d = foto[h]
        print("%-28s %6d %5d %4s %7s %8s %9s %8s" % (
            h, d["filas"], d["columnas"],
            d["pos_ID"] or "-", d["pos_ID_ANTERIOR"] or "-",
            d.get("ids_con_dato", "-"), d.get("ids_forma_nueva", "-"),
            d.get("ids_unicos", "-")))
    print("-" * 88)
    print("%-28s %6d filas  en %d hojas" % (
        "TOTAL", sum(d["filas"] for d in foto.values()), len(foto)))


def comparar(antes, despues):
    """Las siete cosas que tienen que ser verdad después de correr el pipeline de IDs."""
    problemas = []
    avisos = []
    print("=" * 88)
    print("COMPARACIÓN antes → después")
    print("=" * 88)
    print("%-28s %-16s %-16s %s" % ("HOJA", "filas", "columnas", "veredicto"))
    print("-" * 88)

    for h in HOJAS_ESPERADAS:
        a, d = antes.get(h), despues.get(h)

        # Una hoja que no está en NINGUNA de las dos fotos simplemente no existe en este
        # libro, y eso no es un problema: el libro del equipo tiene 20 de las 24 esperadas.
        # Lo que sí es problema es que estuviera antes y ya no: eso significa que la
        # corrida se llevó una pestaña, y es de las cosas que este verificador existe para
        # no dejar pasar.
        if not a and not d:
            avisos.append("%s: no existe en este libro (ni antes ni después)" % h)
            continue
        if a and not d:
            problemas.append("%s: ESTABA antes de la corrida y ya NO está" % h)
            continue
        if d and not a:
            avisos.append("%s: apareció durante la corrida, no estaba en la foto de antes" % h)
            continue
        veredicto = []

        # 1. No se perdió ni se inventó un renglón
        if a["filas"] != d["filas"]:
            problemas.append("%s: las filas cambiaron, %d -> %d" % (h, a["filas"], d["filas"]))
            veredicto.append("FILAS CAMBIARON")

        # 2. Tiene columna ID
        if not d["pos_ID"]:
            problemas.append("%s: quedó SIN columna ID" % h)
            veredicto.append("SIN ID")

        # 3. La columna ID quedó al inicio (paso "mover")
        elif d["pos_ID"] != 1:
            avisos.append("%s: su ID está en la columna %d, no en la 1" % (h, d["pos_ID"]))
            veredicto.append("ID en col %d" % d["pos_ID"])

        # 4. Todos los ids tienen la forma nueva y el prefijo de su hoja
        if d.get("ids_con_dato"):
            malos = d["ids_con_dato"] - d.get("ids_forma_nueva", 0)
            if malos:
                problemas.append("%s: %d ids no tienen la forma nueva" % (h, malos))
                veredicto.append("%d con forma mala" % malos)
            ajenos = d.get("ids_forma_nueva", 0) - d.get("ids_prefijo_ok", 0)
            if ajenos:
                problemas.append("%s: %d ids con un prefijo que no es %s"
                                 % (h, ajenos, PREFIJO.get(h, "?")))
                veredicto.append("%d prefijo ajeno" % ajenos)

            # 5. Sin repetidos
            if d["ids_unicos"] != d["ids_con_dato"]:
                problemas.append("%s: %d ids REPETIDOS"
                                 % (h, d["ids_con_dato"] - d["ids_unicos"]))
                veredicto.append("REPETIDOS")

        # 6. ID ANTERIOR: existe donde toca, y no donde no toca
        if h in LLAVE_ES_DATO:
            if d["pos_ID_ANTERIOR"]:
                problemas.append("%s: le pusieron ID ANTERIOR, y su llave es un dato de "
                                 "negocio (%s) que debía conservarse" % (h, LLAVE_ES_DATO[h]))
                veredicto.append("ID ANTERIOR DE MAS")
            if LLAVE_ES_DATO[h] not in d["encabezados"]:
                problemas.append("%s: PERDIÓ su columna de negocio \"%s\""
                                 % (h, LLAVE_ES_DATO[h]))
                veredicto.append("PERDIO SU LLAVE")
        elif not d["pos_ID_ANTERIOR"]:
            problemas.append("%s: no tiene ID ANTERIOR" % h)
            veredicto.append("SIN ID ANTERIOR")

        # 7. No se perdieron columnas (salvo la que se renombró)
        perdidas = [c for c in a["encabezados"]
                    if c and c not in d["encabezados"] and norm(c) != "ID"]
        if h not in LLAVE_ES_DATO:
            # la llave vieja se renombró: esa "pérdida" es esperada
            perdidas = [c for c in perdidas if norm(c) != norm(a["encabezados"][0] if a["encabezados"] else "")]
        if perdidas:
            problemas.append("%s: desaparecieron columnas %s" % (h, perdidas))
            veredicto.append("COLUMNAS PERDIDAS")

        print("%-28s %-16s %-16s %s" % (
            h, "%d = %d" % (a["filas"], d["filas"]) if a["filas"] == d["filas"]
               else "%d -> %d" % (a["filas"], d["filas"]),
            "%d -> %d" % (a["columnas"], d["columnas"]),
            " · ".join(veredicto) if veredicto else "ok"))

    print("-" * 88)
    print()
    if problemas:
        print("PROBLEMAS (%d) — hay que revisar antes de seguir:" % len(problemas))
        for p in problemas:
            print("   - " + p)
    else:
        print("SIN PROBLEMAS: las 24 hojas cuadran.")
    if avisos:
        print()
        print("Avisos (%d), no detienen nada:" % len(avisos))
        for a in avisos:
            print("   - " + a)
    return 1 if problemas else 0


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    libro = "lab"
    for a in sys.argv[1:]:
        if a.startswith("--libro="):
            libro = a.split("=", 1)[1]
    if not args:
        print(__doc__)
        return 2
    if args[0] == "foto":
        destino = args[1] if len(args) > 1 else "foto.json"
        foto = tomar_foto(LIBROS.get(libro, libro))
        io.open(destino, "w", encoding="utf-8").write(
            json.dumps(foto, ensure_ascii=False, indent=1))
        print("Foto de \"%s\" guardada en %s\n" % (libro, destino))
        imprimir_foto(foto)
        return 0
    if args[0] == "comparar":
        if len(args) < 3:
            print("Faltan los dos archivos: comparar antes.json despues.json")
            return 2
        antes = json.loads(io.open(args[1], encoding="utf-8").read())
        despues = json.loads(io.open(args[2], encoding="utf-8").read())
        return comparar(antes, despues)
    print("No conozco el comando \"%s\". Usa foto o comparar." % args[0])
    return 2


if __name__ == "__main__":
    sys.exit(main())
