"""Copia las hojas migrables de PRODUCCIÓN (solo lectura) encima de LAB, para ensayar la
migración sobre datos de verdad y en estado PRE-migración. Port de MigracionReplanche.gs.

Las tres guardas de dirección del original, igual:
  1. El destino está FIJO (catalogo.REPLANCHE['destino']); no se configura.
  2. Lista negra: producción y el libro compartido del equipo jamás son destino.
  3. Se comprueba el NOMBRE del destino, no solo su id.

Cómo copia, hoja por hoja (todo del lado de Google):
  - `sheets.copyTo` manda la hoja de producción a LAB como pestaña temporal;
  - en la temporal se QUITA EL FILTRO y se muestran las filas ocultas;
  - la hoja de siempre se vacía, toma el tamaño y las filas congeladas de producción, y
    recibe un `copyPaste PASTE_NORMAL` (valores y formato: una fecha sigue siendo fecha);
  - se compara celda por celda la hoja contra la temporal, y solo entonces se borra la
    temporal. La hoja destino conserva su gid.

Los copyTo van UNO POR UNO a propósito. En paralelo (02/10/2026) Google los formó en fila de
todos modos —escriben en el mismo libro destino— y los clientes se cansaron de esperar: 20
timeouts, con las 20 copias hechas del lado de Google como "Copia de …". Lo que sí va en
paralelo son las dos lecturas del principio.

POR QUÉ LO DEL FILTRO Y LA COMPARACIÓN: el replanchado de Apps Script del 02/10/2026 copió
VEHICULOS y CAJAS CHICAS con el filtro activo de producción. Solo pasaron las filas visibles
(60 de 648 y 98 de 285), repetidas en mosaico, y aun así dijo LISTO. Ver comparar.py.
"""
import time
from concurrent.futures import ThreadPoolExecutor

import catalogo as cat
from bitacora import anotar
from comparar import comparar_hoja
from libro import LibroApi

R = cat.REPLANCHE


def _es_artefacto(hoja, col):
    """replEsArtefacto_: columnas que pone la migración; perderlas al replanchar es el objetivo."""
    c = str(col or "").strip().upper()
    lista = [cat.COLUMNA_ID, cat.COLUMNA_ID_ANTERIOR, cat.COLUMNA_ID_ANTERIOR_LEGADO]
    lista += [r["columna"] for r in cat.REFERENCIAS_ENTIDADES if r["hoja"] == hoja]
    lista += [d["nombre"] for d in cat.ENCABEZADOS_DEDUCIDOS if d["hoja"] == hoja]
    lista += [n["a"] for n in cat.NOMBRES if n["hoja"] == hoja]
    return any(str(x).strip().upper() == c for x in lista)


def _guardas(api, dest, autorizado_equipo=False):
    if dest == R["origen"]:
        raise SystemExit("El destino es el MISMO libro que el origen. Esto no se corre.")
    # El libro del equipo se puede replanchar SOLO con la autorización explícita en el comando
    # (--autorizado-por-el-equipo): borra lo que Jorge y Emmanuel tengan en esas hojas.
    # Producción no tiene bandera: es el origen y está en la lista negra de conexion.py.
    if dest in R["prohibidos"] and not (autorizado_equipo and dest != cat.PRODUCCION):
        raise SystemExit("El destino es %s. Este procedimiento BORRA las hojas del "
                         "destino, así que ahí no se corre nunca." % R["prohibidos"][dest])
    # El nombre se comprueba aquí solo para LAB. Un libro dado con --libro lo confirma la
    # persona escribiendo su nombre (migrar.py), que es la misma guarda hecha a mano.
    if dest == R["destino"]:
        nombre = api.get(spreadsheetId=dest, fields="properties.title").execute()["properties"]["title"]
        if nombre != R["destinoNombre"]:
            raise SystemExit('El libro %s se llama "%s" y se esperaba "%s". No se escribe en un libro que '
                             "no es el de experimentos." % (dest, nombre, R["destinoNombre"]))


def _encabezados(hoja):
    n = hoja.ultima_columna()
    return [hoja.celda(1, c) for c in range(1, n + 1)]


def _props(api, ss_id):
    m = api.get(spreadsheetId=ss_id, fields="sheets(properties(sheetId,title,gridProperties),basicFilter(range))").execute()
    return {s["properties"]["title"]: s for s in m["sheets"]}


def replanchar(api, escribir=False, acepto_perder=False, avisar=print, nueva_api=None, destino=None,
               autorizado_equipo=False):
    """
    destino    id del libro que se sobrescribe; por omisión LAB (catalogo.REPLANCHE['destino'])
    nueva_api  función que crea un cliente nuevo, para leer origen y destino a la vez
    """
    dest = destino or R["destino"]
    _guardas(api, dest, autorizado_equipo)
    hojas = sorted(h["hoja"] for h in cat.migrables())
    with ThreadPoolExecutor(2) as hilos:   # origen y destino se leen a la vez
        f_o = hilos.submit(LibroApi, nueva_api() if nueva_api else api, R["origen"], hojas)
        f_d = hilos.submit(LibroApi, nueva_api() if nueva_api else api, dest, hojas,
                           puede_escribir=escribir) if nueva_api else None
        origen = f_o.result()
        destino = f_d.result() if f_d else LibroApi(api, dest, hojas, puede_escribir=escribir)
    lineas = [("REPLANCHANDO DE VERDAD" if escribir else "ENSAYO (no escribe nada)"), "",
              "  origen:  %s  (%s)  — solo lectura" % (origen.nombre, R["origen"]),
              "  destino: %s  (%s)  — se sobrescribe" % (destino.nombre, dest), ""]

    perdidas_totales = []
    a_copiar = []
    crear = []   # las que el destino no tiene: se crean vacías y siguen el mismo camino
    for n in hojas:
        ho, hd = origen.hoja(n), destino.hoja(n)
        if not ho:
            lineas.append("  · %s: NO existe en producción, se salta" % n)
            continue
        if not hd:
            lineas.append("  · %s: NO existe en el destino, se CREA · %d filas · %d columnas"
                          % (n, max(ho.ultima_fila() - 1, 0), ho.ultima_columna()))
            crear.append(n)
            a_copiar.append(n)
            continue
        en_origen = {str(c).strip().upper() for c in _encabezados(ho)}
        artefactos, perdidas = [], []
        for c in _encabezados(hd):
            t = str(c).strip()
            if not t or t.upper() in en_origen:
                continue
            (artefactos if _es_artefacto(n, t) else perdidas).append(t)
        perdidas_totales += [n + "." + c for c in perdidas]
        enc_o, enc_d = _encabezados(ho), _encabezados(hd)
        detalle = ["%d → %d filas" % (max(hd.ultima_fila() - 1, 0), max(ho.ultima_fila() - 1, 0)),
                   "%d → %d columnas" % (len(enc_d), len(enc_o))]
        if artefactos:
            detalle.append("se va la migración (%s)" % ", ".join(artefactos))
        if perdidas:
            detalle.append("SE PIERDE: " + ", ".join(perdidas))
        lineas.append("  · %s: %s" % (n, " · ".join(detalle)))
        a_copiar.append(n)

    if perdidas_totales:
        lineas += ["", "  OJO — se perderían %d columnas que producción no tiene y que NO son de la migración:"
                   % len(perdidas_totales)] + ["      " + c for c in perdidas_totales]
        if not acepto_perder:
            lineas.append("  Para aceptarlo: --acepto-perder-columnas")
            if escribir:
                lineas += ["", "  NO SE REPLANCHÓ: hay columnas que se perderían (arriba)."]
                return "\n".join(lineas), False
    if not escribir:
        lineas += ["", "  ENSAYO: no se escribió nada. Si el reporte cuadra, corre con --escribir."]
        return "\n".join(lineas), True

    # ----------------------------------------------------------- de verdad
    avisar("  copiando %d hojas de producción a pestañas temporales…" % len(a_copiar))
    props_d = _props(api, dest)
    # Temporales de una corrida que murió a la mitad: renombradas ("__replanche X") o todavía
    # con el nombre que les pone copyTo ("Copia de X"), solo si X es una hoja que se replancha.
    sobrantes = {R["temporal"] + n for n in hojas} | {"Copia de " + n for n in hojas}
    viejas = [s["properties"]["sheetId"] for t, s in props_d.items() if t in sobrantes]
    if viejas:   # temporales de una corrida que murió a la mitad
        api.batchUpdate(spreadsheetId=dest, body={"requests": [
            {"deleteSheet": {"sheetId": i}} for i in viejas]}).execute()
    if crear:
        api.batchUpdate(spreadsheetId=dest, body={"requests": [
            {"addSheet": {"properties": {"title": n}}} for n in crear]}).execute()
    props_o = _props(api, R["origen"])
    def copiar(n, cliente):
        r = cliente.sheets().copyTo(spreadsheetId=R["origen"], sheetId=props_o[n]["properties"]["sheetId"],
                                    body={"destinationSpreadsheetId": dest}).execute()
        return n, r["sheetId"]

    temporales = {}
    for n in a_copiar:
        t = time.time()
        temporales[n] = copiar(n, api)[1]
        avisar("    %-28s %.1f s" % (n, time.time() - t))

    props_d = _props(api, dest)
    por_id = {s["properties"]["sheetId"]: s for s in props_d.values()}
    reqs = []
    for n in a_copiar:
        t, d = por_id[temporales[n]], props_d[n]
        tid, did = temporales[n], d["properties"]["sheetId"]
        g = t["properties"]["gridProperties"]
        reqs.append({"updateSheetProperties": {"properties": {"sheetId": tid, "title": R["temporal"] + n},
                                               "fields": "title"}})
        for s in (t, d):   # sin filtro, ninguna fila se queda fuera del pegado
            if "basicFilter" in s:
                reqs.append({"clearBasicFilter": {"sheetId": s["properties"]["sheetId"]}})
        reqs.append({"updateDimensionProperties": {
            "range": {"sheetId": tid, "dimension": "ROWS", "startIndex": 0, "endIndex": g["rowCount"]},
            "properties": {"hiddenByUser": False}, "fields": "hiddenByUser"}})
        reqs.append({"updateSheetProperties": {"properties": {"sheetId": did, "gridProperties": {
            "rowCount": g["rowCount"], "columnCount": g["columnCount"],
            "frozenRowCount": g.get("frozenRowCount", 0)}},
            "fields": "gridProperties.rowCount,gridProperties.columnCount,gridProperties.frozenRowCount"}})
        reqs.append({"updateCells": {"range": {"sheetId": did}, "fields": "*"}})
        reqs.append({"copyPaste": {
            "source": {"sheetId": tid, "startRowIndex": 0, "endRowIndex": g["rowCount"],
                       "startColumnIndex": 0, "endColumnIndex": g["columnCount"]},
            "destination": {"sheetId": did, "startRowIndex": 0, "startColumnIndex": 0},
            "pasteType": "PASTE_NORMAL", "pasteOrientation": "NORMAL"}})
    avisar("  pegando…")
    api.batchUpdate(spreadsheetId=dest, body={"requests": reqs}).execute()

    # ----------------------------------------------------------- verificar
    avisar("  verificando celda por celda…")
    nombres_tmp = [R["temporal"] + n for n in a_copiar]
    leido = LibroApi(api, dest, a_copiar + nombres_tmp)
    fallas = {}
    celdas = 0
    for n in a_copiar:
        d = comparar_hoja(leido.hoja(R["temporal"] + n), leido.hoja(n))
        if d:
            fallas[n] = d
        celdas += sum(len(f) for f in leido.hoja(n).filas)
    finales = [{"deleteSheet": {"sheetId": temporales[n]}} for n in a_copiar]
    # El libro vuelve a estar SIN migrar: el sello (ver libro.LibroApi.CLAVE_SELLO) ya no aplica
    if not fallas and leido.sellado():
        finales.append({"deleteDeveloperMetadata": {"dataFilter": {"developerMetadataLookup": {
            "metadataKey": LibroApi.CLAVE_SELLO}}}})
    api.batchUpdate(spreadsheetId=dest, body={"requests": finales}).execute()

    lineas.append("")
    lineas.append("  Hojas replanchadas: %d  (%s celdas)" % (len(a_copiar), format(celdas, ",")))
    if fallas:
        lineas += ["", "  FALLÓ LA VERIFICACIÓN: %d hojas no quedaron igual que producción:" % len(fallas)]
        lineas += ["    - %s: %s" % (n, "; ".join(d)) for n, d in fallas.items()]
        lineas += ["  El destino NO está en estado PRE-migración. No sigas con la migración."]
    else:
        lineas += ["  Verificado: cada hoja es idéntica, celda por celda, a la copia de producción.",
                   "", "  LISTO. El destino quedó en estado PRE-migración."]
    texto = "\n".join(lineas)
    anotar(api, dest, "replanche", "ESCRIBIR", "FALLÓ VERIFICACIÓN" if fallas else "OK",
           "%d hojas, %d celdas, verificadas, desde %s" % (len(a_copiar), celdas, R["origen"]))
    return texto, not fallas
