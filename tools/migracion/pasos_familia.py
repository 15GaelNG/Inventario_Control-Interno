"""Port de los pasos de homologación de src/MigracionIds.gs.

    nombres      homologarNombres
    referencias  reescribirReferencias   (+ migMapaDelPadre_, migBuscar_)

Mismas reglas que pasos_ids.py: traducción renglón por renglón, mismos mensajes, y la
paridad contra el oráculo de JS lo comprueba.

`sincronizar`, `personas` y `ligar` NO están aquí a propósito: son la capa de consistencia
de la app (Relaciones, CapitalHumano) y se quedan en Apps Script (migracionFinalApps).
"""
import catalogo as cat
import ids as ids_mod
from pasos_ids import columna, columna_anterior, columna_o_crear, encabezados, filas_de, leer_columna
from valores import clave, limpio, redondear_js


def nombres(libro, cfg):
    escribir = cfg.get("escribir", False)
    familia = cfg.get("familia")
    lineas = [("HOMOLOGANDO NOMBRES" if escribir else "ENSAYO (no escribe nada)") + " — " + libro.id, ""]
    problemas = []
    por_hacer = hechas = ya_estaban = 0
    for n in cat.NOMBRES:
        if familia and not (cat.existe(n["hoja"]) and cat.familia_de(n["hoja"]) == str(familia).strip().lower()):
            continue
        nombre = n["hoja"] + ': "' + n["de"] + '" → "' + n["a"] + '" (limpieza #' + str(n["limpieza"]) + ")"
        hoja = libro.hoja(n["hoja"])
        if not hoja:
            problemas.append(n["hoja"] + ": no existe la hoja")
            continue
        enc = encabezados(hoja)
        pos_de = columna(enc, n["de"])
        pos_a = columna(enc, n["a"])
        if not pos_de and pos_a:
            ya_estaban += 1
            lineas.append("  " + nombre + ": YA HOMOLOGADA")
            continue
        if pos_de and pos_a:
            problemas.append(nombre + ": existen LAS DOS columnas; hay que decidir cuál se queda")
            continue
        if not pos_de:
            problemas.append(nombre + ": no existe ninguna de las dos")
            continue
        if escribir:
            hoja.poner_valor(1, pos_de, n["a"])
            hechas += 1
            lineas.append("  " + nombre + ": renombrada")
        else:
            por_hacer += 1
            lineas.append("  " + nombre + ": se renombraría")
    lineas.append("")
    if escribir:
        lineas.append(str(hechas) + " columnas renombradas, " + str(ya_estaban) + " ya homologadas")
    else:
        lineas.append(str(por_hacer) + " columnas por renombrar, " + str(ya_estaban) + " ya homologadas")
    if problemas:
        lineas.append("")
        lineas.append("PROBLEMAS (" + str(len(problemas)) + "):")
        for p in problemas:
            lineas.append("  - " + p)
    return "\n".join(lineas)


# ---------------------------------------------------------------- referencias

def mapa_del_padre(libro, nombre_padre, por_llave_negocio):
    """migMapaDelPadre_: valor viejo (en clave) → ID nuevo del padre."""
    hoja = libro.hoja(nombre_padre)
    if not hoja:
        raise RuntimeError('No existe la hoja padre "' + nombre_padre + '"')
    enc = encabezados(hoja)
    filas = filas_de(hoja)
    pos_id = columna(enc, cat.COLUMNA_ID)
    if not pos_id:
        raise RuntimeError('"' + nombre_padre + '" todavía no tiene columna ID: corre asignarIds primero')
    ids_padre = leer_columna(hoja, pos_id, filas)

    if por_llave_negocio:
        d = cat.de(nombre_padre)
        es_la_anterior = bool(d and d["llaveAnterior"] and clave(d["llaveAnterior"]) == clave(por_llave_negocio))
        pos = columna(enc, por_llave_negocio) or (columna_anterior(enc, d) if es_la_anterior else 0)
        if not pos:
            raise RuntimeError('"' + nombre_padre + '" no tiene la columna "' + por_llave_negocio + '"')
        origen = leer_columna(hoja, pos, filas)
        mapa = {}
        for i in range(filas):
            k = clave(origen[i])
            if k:
                mapa[k] = ids_padre[i]
        return mapa

    generaciones = [p for p in (columna(enc, cat.COLUMNA_ID_ANTERIOR), columna(enc, cat.COLUMNA_ID_ANTERIOR_LEGADO)) if p]
    if not generaciones:
        raise RuntimeError('"' + nombre_padre + '" no tiene la columna "' + cat.COLUMNA_ID_ANTERIOR + '"')
    mapa = {}
    ambiguos = set()

    def poner(valor, id_):
        k = clave(valor)
        if not k or not id_ or k in ambiguos:
            return
        if mapa.get(k) and mapa[k] != id_:
            del mapa[k]
            ambiguos.add(k)
            return
        mapa[k] = id_

    for id_ in ids_padre:
        poner(id_, id_)
    for pos in generaciones:
        for i, v in enumerate(leer_columna(hoja, pos, filas)):
            poner(v, ids_padre[i])
    return mapa


def buscar(mapa, valor):
    """migBuscar_: tolera el cero a la izquierda que Sheets se comió (01092110 → 1092110)."""
    k = clave(valor)
    if not k:
        return None
    if mapa.get(k):
        return mapa[k]
    if k.isdigit() and k.isascii() and len(k) < 8:
        con = k
        while len(con) < 8:
            con = "0" + con
            if mapa.get(con):
                return mapa[con]
    return None


def referencias(libro, cfg):
    escribir = cfg.get("escribir", False)
    familia = cfg.get("familia")
    lineas = [("REESCRIBIENDO REFERENCIAS" if escribir else "ENSAYO (no escribe nada)") + " — " + libro.id, ""]
    huerfanas = []

    refs = [r for r in cat.REFERENCIAS_MIGRACION
            if not familia or (cat.existe(r["hoja"]) and cat.familia_de(r["hoja"]) == str(familia).strip().lower())]
    for ref in refs:
        hoja = libro.hoja(ref["hoja"])
        if not hoja:
            lineas.append("  " + ref["hoja"] + ": NO EXISTE, se salta")
            continue
        filas = filas_de(hoja)
        if not filas:
            continue
        enc = encabezados(hoja)
        pos = columna(enc, ref["columna"])
        if not pos:
            lineas.append("  " + ref["hoja"] + "." + ref["columna"] + ": no existe la columna")
            continue
        padre = cat.de(ref["padre"])
        en_sitio = bool(padre and padre["pisaLlaveAnterior"])
        if not en_sitio and not ref.get("destino"):
            lineas.append("  " + ref["hoja"] + "." + ref["columna"] + ': le falta "destino" en el catálogo, se salta')
            continue
        nombre_destino = ref["columna"] if en_sitio else ref["destino"]
        pos_destino = pos if en_sitio else columna_o_crear(hoja, nombre_destino, escribir)[0]
        if not en_sitio and not pos_destino and escribir:
            lineas.append("  " + ref["hoja"] + ': no pude crear la columna "' + nombre_destino + '"')
            continue

        mapa = mapa_del_padre(libro, ref["padre"], ref.get("porLlaveNegocio"))
        valores = leer_columna(hoja, pos, filas)
        ya_en_destino = leer_columna(hoja, pos_destino, filas) if (not en_sitio and pos_destino) else valores
        salida = []
        cambiadas = sueltas = vacias = ya_estaban = 0
        for i, v in enumerate(valores):
            puesto = ya_en_destino[i] if i < len(ya_en_destino) else ""
            hecho = bool(puesto and ids_mod.tiene_forma(puesto) and
                         (not en_sitio or buscar(mapa, puesto) == limpio(puesto)))
            if hecho:
                salida.append([puesto])
                ya_estaban += 1
                continue
            if not v:
                salida.append([""])
                vacias += 1
                continue
            nuevo = buscar(mapa, v)
            if nuevo:
                salida.append([nuevo])
                cambiadas += 1
            else:
                salida.append([v if en_sitio else ""])
                sueltas += 1
                if len(huerfanas) < 40:
                    huerfanas.append(ref["hoja"] + "." + ref["columna"] + " fila " + str(i + 2) + ": " + v)

        if ya_estaban and not cambiadas and not sueltas:
            lineas.append("  " + ref["hoja"] + "." + ref["columna"] + " -> " + ref["padre"] + ": YA MIGRADA (" +
                          str(ya_estaban) + " referencias), se salta")
            continue
        tasa = cambiadas / max(1, cambiadas + sueltas)
        nota = ""
        if ref.get("esperado") and abs(tasa - ref["esperado"]) > 0.05:
            nota = "  <-- OJO: esperaba " + str(redondear_js(ref["esperado"] * 100)) + "%"
        if ref.get("revisar"):
            nota += "  (columna marcada para revisar con Emmanuel)"
        donde = ("sobre la misma columna" if en_sitio
                 else 'en la columna nueva "' + nombre_destino + '" (se respeta "' + ref["columna"] + '")')
        lineas.append("  " + ref["hoja"] + "." + ref["columna"] + " -> " + ref["padre"] + ": " +
                      str(cambiadas) + " cambiadas, " + str(sueltas) + " huérfanas, " + str(vacias) + " vacías" +
                      (", " + str(ya_estaban) + " ya migradas" if ya_estaban else "") +
                      " (" + str(redondear_js(tasa * 100)) + "%), " + donde + nota)
        if escribir:
            hoja.escribir(2, pos_destino, salida)

    if huerfanas:
        lineas.append("")
        lineas.append("HUÉRFANAS (se dejaron intactas, primeras " + str(len(huerfanas)) + "):")
        for h in huerfanas:
            lineas.append("  - " + h)
    if escribir and libro.sellar():
        lineas.append("")
        lineas.append("  Este libro queda SELLADO: desde ahora hay referencias colgando de sus")
        lineas.append("  IDs, así que regenerarlos o deshacerlos los dejaría huérfanos. Las")
        lineas.append("  funciones que lo harían se van a negar. Ver migracionEstadoSello.")
    if not escribir and not familia:
        lineas.append("")
        lineas.append("Para escribir de verdad, corre el …2Escribir de la familia")
    return "\n".join(lineas)
