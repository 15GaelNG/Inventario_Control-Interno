"""LA MIGRACIÓN EN UN COMANDO. Reemplaza al botón migracionTodoLab de Apps Script.

    uv run --no-project --with google-auth-oauthlib --with google-api-python-client \
        python tools/migracion/migrar.py lab [--replanchar] [--escribir]
    ... migrar.py --libro <id o URL> [--replanchar] [--escribir] [--confirmo "Nombre del libro"]
    ... migrar.py --copiar-produccion ["Nombre de la copia"] [--escribir]

--copiar-produccion duplica producción en Drive (con formatos, validaciones y fórmulas) y migra
esa copia: el libro que sale es el que se le da a la app cambiando SS_ID_VEHICULOS. Producción
solo se lee. Sin --escribir no copia nada: simula sobre producción en memoria. A la copia se le
agregan las pestañas que producción no tiene y la migración necesita (PESTANAS_DE_LAB: la lista
de Capital Humano), copiadas de LAB y verificadas celda por celda.

`lab` es el libro de experimentos. Con --libro va a CUALQUIER libro que tu cuenta pueda
editar, salvo la lista negra (producción; ver conexion.py). Para escribir en un libro que no
es LAB se confirma escribiendo su nombre, tal cual (o con --confirmo). Si al libro le faltan
hojas, --replanchar las crea: un libro en blanco queda migrado de una vez.

Sin --escribir es una SIMULACIÓN: lee el libro y corre todo en memoria (si va con
--replanchar, sobre los datos de producción, como quedaría LAB tras replanchar). No toca nada.
Con --escribir:
    1. (--replanchar) copia producción encima de LAB y lo verifica celda por celda;
    2. pipeline de IDs: revisar → renombrar → ids → mover → respaldo → auditar;
    3. homologación de vehiculos, lineas y cajachica: nombres → referencias → auditar.
Se detiene en el primer paso que reporte PROBLEMAS o FALLAS.

Lo que NO hace, a propósito, porque es la capa de consistencia de la app y vive en Apps
Script: sincronizar copias y Capital Humano. Al terminar dice qué correr allá.

El reporte completo de cada corrida queda en tools/migracion/corridas/ (git lo ignora: trae
datos reales). En LOG_MIGRACION queda una fila por pipeline, con PASO `py:…`.

Producción NO: está en la lista negra hasta el día del apagado de AppSheet.
"""
import argparse
import datetime
import sys
import time
from pathlib import Path

import catalogo as cat
from bitacora import anotar
from comparar import comparar_hoja, comparar_libros
from conexion import abrir as abrir_api
from conexion import api, copiar_produccion, exigir_escribible, id_de
from ids import Ids
from libro import LibroApi, LibroMemoria
from motor import correr_pipeline
from pasos import FAMILIAS_HOMOLOGA, PIPELINE_FAMILIA, PIPELINE_IDS
from replanche import replanchar

CORRIDAS = Path(__file__).resolve().parent / "corridas"
HOJAS = [h["hoja"] for h in cat.todas()]

# Pestañas que producción NO tiene y que la migración necesita: se traen de LAB a la copia.
# COLABORADORES ACTUALIZADO es la lista de Capital Humano que se pega a mano; sin ella
# migracionFinalApps se detiene en el paso "personas" y la app no sugiere responsables.
PESTANAS_DE_LAB = ["COLABORADORES ACTUALIZADO"]


def traer_de_lab(s, destino, escribir):
    """Copia (copyTo, la hoja completa) las PESTANAS_DE_LAB al destino y las verifica celda por celda."""
    lab = cat.REPLANCHE["destino"]
    props_lab = {x["properties"]["title"]: x["properties"] for x in
                 s.get(spreadsheetId=lab, fields="sheets.properties(sheetId,title)").execute()["sheets"]}
    en_destino = {x["properties"]["title"] for x in
                  s.get(spreadsheetId=destino, fields="sheets.properties.title").execute()["sheets"]}
    lineas = ["PESTAÑAS QUE NO VIENEN DE PRODUCCIÓN (se copian de LAB)", ""]
    ok = True
    for n in PESTANAS_DE_LAB:
        if n not in props_lab:
            lineas.append("  · %s: LAB no la tiene. migracionFinalApps se detendrá en Capital Humano: "
                          "pégala a mano en la copia antes de correrlo." % n)
            continue
        if n in en_destino:
            lineas.append("  · %s: el destino ya la tiene, no se toca" % n)
            continue
        de_lab = LibroApi(s, lab, [n]).hoja(n)
        filas = max(de_lab.ultima_fila() - 1, 0)
        if not escribir:
            lineas.append("  · %s: se copiaría de LAB (%d filas)" % (n, filas))
            continue
        r = s.sheets().copyTo(spreadsheetId=lab, sheetId=props_lab[n]["sheetId"],
                              body={"destinationSpreadsheetId": destino}).execute()
        s.batchUpdate(spreadsheetId=destino, body={"requests": [{"updateSheetProperties": {
            "properties": {"sheetId": r["sheetId"], "title": n}, "fields": "title"}}]}).execute()
        difs = comparar_hoja(de_lab, LibroApi(s, destino, [n]).hoja(n))
        if difs:
            ok = False
            lineas.append("  · %s: FALLÓ LA VERIFICACIÓN: %s" % (n, "; ".join(difs)))
        else:
            lineas.append("  · %s: copiada de LAB y verificada celda por celda (%d filas)" % (n, filas))
    return "\n".join(lineas), ok


def main():
    # La consola de Windows usa cp1252 si la salida va a un archivo o a otro programa, y no
    # sabe escribir "═" ni "━": la corrida terminaba bien y tronaba al imprimir el cierre
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass
    p = argparse.ArgumentParser(description="La migración de IDs y referencias, en un comando.")
    p.add_argument("lab", nargs="?", choices=["lab"], help="el libro de experimentos")
    p.add_argument("--libro", help="cualquier otro libro: su id o su URL (producción está en la lista negra)")
    p.add_argument("--confirmo", help="el nombre del libro, para no preguntarlo (solo con --libro)")
    p.add_argument("--replanchar", action="store_true", help="copiar producción encima del libro primero")
    p.add_argument("--escribir", action="store_true", help="sin esto es una simulación en memoria")
    p.add_argument("--acepto-perder-columnas", action="store_true")
    p.add_argument("--autorizado-por-el-equipo", action="store_true",
                   help="permite replanchar el libro compartido del equipo (borra lo que tengan en esas hojas)")
    p.add_argument("--copiar-produccion", nargs="?", const="", metavar="NOMBRE", dest="copiar",
                   help="duplicar producción en Drive y migrar la copia (nombre opcional)")
    a = p.parse_args()
    copiar = a.copiar is not None
    if [bool(a.lab), bool(a.libro), copiar].count(True) != 1:
        p.error("di a qué libro: 'lab', --libro <id o URL> o --copiar-produccion (solo uno)")
    if copiar and a.replanchar:
        p.error("--copiar-produccion ya parte de producción: --replanchar sobra")

    arranque = time.time()
    s = api()
    if copiar and a.escribir:
        nombre = a.copiar or "%s — migrado %s" % (
            s.get(spreadsheetId=cat.PRODUCCION, fields="properties.title").execute()["properties"]["title"],
            datetime.datetime.now().strftime("%Y-%m-%d %H:%M"))
        print("Copiando producción en Drive como «%s»…" % nombre, flush=True)
        destino = copiar_produccion(nombre)
        print("Copia: https://docs.google.com/spreadsheets/d/%s" % destino, flush=True)
    else:
        # Sin --escribir, --copiar-produccion simula sobre producción (solo lectura).
        destino = cat.PRODUCCION if copiar else id_de(a.libro or "lab")
        nombre = s.get(spreadsheetId=destino, fields="properties.title").execute()["properties"]["title"]
    a.libro = destino
    print("Libro destino: %s  (%s)" % (nombre, destino), flush=True)
    if a.escribir:
        exigir_escribible(destino)
        # La copia la acabamos de crear: no hay nada que confirmar.
        if destino != cat.REPLANCHE["destino"] and not copiar:
            dicho = a.confirmo if a.confirmo is not None else input(
                "Vas a ESCRIBIR en «%s». Escribe su nombre tal cual para seguir: " % nombre)
            if dicho.strip() != nombre:
                raise SystemExit("El nombre no coincide: no se escribió nada.")
    reporte = []
    ok = True

    def avisar(t):
        print(t, flush=True)

    # ------------------------------------------------------------- lo que producción no trae
    if copiar:
        avisar("PESTAÑAS DE LAB")
        texto, ok = traer_de_lab(s, destino if a.escribir else cat.PRODUCCION, a.escribir)
        reporte.append(texto)
        avisar(texto)

    # ------------------------------------------------------------- replanchado
    if a.replanchar:
        avisar("REPLANCHADO")
        texto, ok = replanchar(s, escribir=a.escribir, acepto_perder=a.acepto_perder_columnas, avisar=avisar,
                               nueva_api=api, destino=destino, autorizado_equipo=a.autorizado_por_el_equipo)
        reporte.append(texto)

    # ------------------------------------------------------------- el libro
    if a.escribir:
        # UNA lectura. Los pasos corren sobre este modelo, que refleja cada escritura en cuanto
        # se manda a Google; releer antes de cada paso costaba ~4 s x 15 pasos. A cambio, al
        # final se relee TODO y se compara con el modelo (abajo): si Google no quedó igual, falla.
        modelo = abrir_api(a.libro, HOJAS, puede_escribir=True) if ok else None

        def abrir():
            return modelo
    else:
        # Simulación: una sola lectura a memoria. Con --replanchar se simula sobre PRODUCCIÓN,
        # que es como quedaría LAB después de replanchar.
        fuente = cat.REPLANCHE["origen"] if a.replanchar else None
        base = LibroApi(s, fuente, HOJAS) if fuente else abrir_api(a.libro, HOJAS)
        memoria = LibroMemoria(base.a_json())
        memoria.id = destino

        def abrir():
            return memoria

    # ------------------------------------------------------------- pipelines
    generador = Ids()
    pipelines = [("PIPELINE 1 — IDS DE TODAS LAS HOJAS", "pipelineIds", PIPELINE_IDS, None)]
    pipelines += [('HOMOLOGACIÓN DE LA FAMILIA "%s"' % f.upper(), "homologarFamilia:" + f, PIPELINE_FAMILIA, f)
                  for f in FAMILIAS_HOMOLOGA]
    for titulo, etiqueta, pasos, familia in pipelines:
        if not ok:
            break
        avisar(titulo)
        texto, detenido = correr_pipeline(titulo, pasos, familia, a.escribir, abrir, generador, avisar)
        reporte.append(texto)
        if a.escribir:
            anotar(s, destino, etiqueta, "ESCRIBIR",
                   "DETENIDO EN " + detenido if detenido else "OK",
                   "%d pasos, %s" % (len(pasos), "familia " + familia if familia else "todas las hojas"))
        ok = not detenido

    # ------------------------------------------------------------- verificación
    if a.escribir and modelo is not None:
        avisar("VERIFICACIÓN: releyendo el libro y comparándolo, celda por celda, con lo escrito…")
        real = abrir_api(a.libro, list(modelo.hojas))
        difs = comparar_libros(modelo, real, list(modelo.hojas))
        if difs:
            ok = False
            reporte.append("\n".join(["", "FALLÓ LA VERIFICACIÓN: Google no quedó como lo calculó la migración:"] +
                                     ["  - %s: %s" % (n, "; ".join(d)) for n, d in difs.items()]))
        else:
            reporte.append("\nVerificado: las %d hojas en Google son idénticas, celda por celda, a lo calculado."
                           % len(modelo.hojas))
        avisar(reporte[-1].strip())

    # ------------------------------------------------------------- cierre
    minutos = (time.time() - arranque) / 60
    if ok:
        cierre = ["", "═" * 60,
                  "LISTO en %.1f minutos." % minutos if a.escribir else
                  "SIMULACIÓN COMPLETA en %.1f minutos: si el reporte cuadra, corre con --escribir." % minutos]
        if a.escribir:
            cierre += ["Falta lo de Apps Script: migracionFinalApps (sincroniza copias y liga Capital Humano),",
                       "en el editor de un proyecto cuyo SS_ID_VEHICULOS y SS_ID_TELEFONIA sean " + destino + "."]
            if copiar:
                cierre += ["La copia migrada: https://docs.google.com/spreadsheets/d/" + destino]
    else:
        cierre = ["", "═" * 60, "SE DETUVO (%.1f min). Lee el último pipeline del reporte." % minutos]
    reporte.append("\n".join(cierre))

    CORRIDAS.mkdir(exist_ok=True)
    etiqueta_libro = ("copia-prod" if copiar else
                      "lab" if destino == cat.REPLANCHE["destino"] else destino[:10])
    ruta = CORRIDAS / ("%s_%s_%s.txt" % (datetime.datetime.now().strftime("%Y-%m-%d_%H%M"), etiqueta_libro,
                                          "escribir" if a.escribir else "simulacion"))
    ruta.write_text("\n\n".join(reporte), encoding="utf-8")
    avisar("\n".join(cierre))
    avisar("Reporte completo: " + str(ruta))
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
