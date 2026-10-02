"""Port de los pasos del pipeline de IDs de src/MigracionIds.gs.

    revisar    revisarAntesDeMigrar      solo lee
    renombrar  renombrarLlaveAnterior    (+ ponerEncabezadosDeducidos_)
    ids        asignarIds
    mover      moverIdsAlInicio
    respaldo   limpiarRespaldoRedundante
    auditar    auditarIds                solo lee

Cada función es el .gs traducido renglón por renglón, con los MISMOS mensajes: las pruebas
de paridad comparan el reporte y las celdas contra el original (tools/migracion/oraculo.js).
Si aquí se cambia algo de lógica, primero se cambia en el .gs, o la paridad truena.

Diferencias a propósito con el original, todas de ambiente:
  - No hay freno de tiempo (LIMITE_MS): fuera de Apps Script no hay límite de 6 minutos.
  - El sello lo dice el libro (`libro.sellado()`), no una Script Property.
"""
import catalogo as cat
import ids as ids_mod
from valores import clave, limpio, redondear_js, numero_js


# ---------------------------------------------------------------- utilidades

def encabezados(hoja):
    """migEncabezados_"""
    n = hoja.ultima_columna()
    if n == 0:
        return []
    return [limpio(v) for v in hoja.rango(1, 1, 1, n)[0]]


def columna(enc, nombre):
    """migColumna_: posición base 1, o 0"""
    buscado = clave(nombre)
    for i, e in enumerate(enc):
        if clave(e) == buscado:
            return i + 1
    return 0


def columna_anterior(enc, h):
    """migColumnaAnterior_"""
    ya = columna(enc, cat.COLUMNA_ID_ANTERIOR)
    if ya:
        return ya
    if h.get("llaveAnterior"):
        por_nombre = columna(enc, h["llaveAnterior"])
        if por_nombre:
            return por_nombre
    return h.get("columnaAnterior") or 0


def columna_o_crear(hoja, nombre, escribir):
    """migColumnaOCrear_: (posición, creada)"""
    enc = encabezados(hoja)
    pos = columna(enc, nombre)
    if pos:
        return pos, False
    if not escribir:
        return 0, True
    destino = len(enc) + 1
    if hoja.max_cols < destino:
        hoja.insertar_columnas_despues(hoja.max_cols, destino - hoja.max_cols)
    hoja.poner_valor(1, destino, nombre)
    hoja.formato_texto(destino)
    return destino, True


def filas_de(hoja):
    """migFilas_"""
    return max(0, hoja.ultima_fila() - 1)


def filas_vacias(hoja, filas):
    """migFilasVacias_"""
    if not filas:
        return []
    cols = max(1, hoja.ultima_columna())
    return [all(limpio(c) == "" for c in f) for f in hoja.rango(2, 1, filas, cols)]


def leer_columna(hoja, col, filas):
    """migLeerColumna_"""
    if not col or not filas:
        return []
    return [limpio(f[0]) for f in hoja.rango(2, col, filas, 1)]


def _familia_ok(nombre_hoja, familia):
    if not familia:
        return True
    return cat.existe(nombre_hoja) and cat.familia_de(nombre_hoja) == str(familia).strip().lower()


def _sin_sello(libro, que):
    """migracionExigirSinSello_"""
    if libro.sellado():
        raise RuntimeError(
            "Este libro está SELLADO: ya tiene referencias escritas contra sus IDs, así que " + que +
            " dejaría huérfana cada una de ellas, en silencio. Si de verdad hace falta, quita el " +
            "sello del libro y vuelve a correr las referencias DESPUÉS.")


# ---------------------------------------------------------------- paso 1: revisar

def revisar(libro, cfg):
    familia = cfg.get("familia")
    lineas = ["REVISIÓN PREVIA — spreadsheet " + libro.id +
              ('  ·  solo la familia "' + familia + '"' if familia else ""), ""]
    problemas = []

    for h in cat.de_familia(familia):
        hoja = libro.hoja(h["hoja"])
        if not hoja:
            problemas.append('FALTA la hoja "' + h["hoja"] + '"')
            continue
        enc = encabezados(hoja)
        filas = filas_de(hoja)
        pos_id = columna_anterior(enc, h)
        detalles = []

        if not pos_id:
            problemas.append(h["hoja"] + ': no encuentro su columna de ID ("' + str(h["llaveAnterior"]) + '")')
        else:
            valores = leer_columna(hoja, pos_id, filas)
            vacias = filas_vacias(hoja, filas)
            llenos = [v for v in valores if v]
            distintos = set()
            repetidos = 0
            for v in llenos:
                k = clave(v)
                if k in distintos:
                    repetidos += 1
                else:
                    distintos.add(k)
            en_blanco = sum(1 for x in vacias if x)
            sin_id_con_datos = sum(1 for i, v in enumerate(valores) if not v and not vacias[i])
            detalles.append(str(filas) + " filas")
            detalles.append(str(len(llenos)) + " con ID")
            if en_blanco:
                detalles.append(str(en_blanco) + " en blanco (se saltan)")
            if sin_id_con_datos:
                pos_nueva = columna(enc, cat.COLUMNA_ID)
                sin_ninguno = sin_id_con_datos
                if pos_nueva:
                    nuevos = leer_columna(hoja, pos_nueva, filas)
                    sin_ninguno = sum(1 for i, v in enumerate(valores)
                                      if not v and not vacias[i] and not ids_mod.tiene_forma(limpio(nuevos[i])))
                if sin_ninguno:
                    problemas.append(h["hoja"] + ": " + str(sin_ninguno) + " renglones CON DATOS y sin ningún id " +
                                     "(ni el viejo ni el nuevo)")
                else:
                    detalles.append(str(sin_id_con_datos) + " nacidos después de migrar (ya traen el ID nuevo, " +
                                    'su "' + cat.COLUMNA_ID_ANTERIOR + '" se queda vacío)')
            if repetidos:
                problemas.append(h["hoja"] + ": " + str(repetidos) + ' IDs repetidos en "' + str(h["llaveAnterior"]) + '"')

        if columna(enc, cat.COLUMNA_ID) and h["llaveAnterior"] != cat.COLUMNA_ID:
            detalles.append("ya tiene columna ID")
        if columna(enc, cat.COLUMNA_ID_ANTERIOR):
            detalles.append("ya tiene " + cat.COLUMNA_ID_ANTERIOR)
        if h["pisaLlaveAnterior"] and columna(enc, cat.COLUMNA_ID_ANTERIOR_LEGADO):
            detalles.append('OJO: trae "' + cat.COLUMNA_ID_ANTERIOR_LEGADO + '" (nombre viejo del respaldo). ' +
                            'Este código usa "' + cat.COLUMNA_ID_ANTERIOR + '": replancha el libro desde producción, o renombra esa columna.')
        for i, c in enumerate(enc):
            if c:
                continue
            if h.get("columnaAnterior") and (i + 1) == h["columnaAnterior"]:
                detalles.append("su columna " + str(i + 1) + " no tiene encabezado, y el paso " +
                                '"renombrar" le va a poner "' + cat.COLUMNA_ID_ANTERIOR + '"')
                continue
            deducido = next((d for d in cat.ENCABEZADOS_DEDUCIDOS
                             if clave(d["hoja"]) == clave(h["hoja"])
                             and _deducido_donde(enc, d).get("columna") == (i + 1)), None)
            if deducido:
                detalles.append("su columna " + str(i + 1) + " no tiene encabezado, y el paso " +
                                '"renombrar" le va a poner "' + deducido["nombre"] + '" (deducido del contenido)')
                continue
            problemas.append(h["hoja"] + ": la columna " + str(i + 1) + " no tiene encabezado")
        lineas.append("  " + h["hoja"] + " [" + h["prefijo"] + "] — " + ", ".join(detalles))

    lineas.append("")
    lineas.append(("PROBLEMAS (" + str(len(problemas)) + "):") if problemas else "Sin problemas.")
    for p in problemas:
        lineas.append("  - " + p)
    lineas.append("")
    lineas.append("Si truena por tiempo, vuelve a correr lo mismo: sigue donde se quedó.")
    return "\n".join(lineas)


# ---------------------------------------------------------------- paso 2: ids

def _ya_migrada(hoja, prefijo, filas, vacias):
    """migYaMigrada_"""
    pos = columna(encabezados(hoja), cat.COLUMNA_ID)
    if not pos:
        return False
    valores = leer_columna(hoja, pos, filas)
    for i in range(filas):
        if vacias[i]:
            continue
        if not valores[i] or not ids_mod.tiene_forma(valores[i]) or ids_mod.prefijo(valores[i]) != prefijo:
            return False
    return True


def asignar(libro, cfg):
    escribir = cfg.get("escribir", False)
    rehacer = cfg.get("rehacer", False)
    solo_hojas = cfg.get("hojas")
    generador = cfg["ids"]
    if rehacer and escribir:
        _sin_sello(libro, "volver a generar los IDs desde cero")
    lineas = [("ASIGNANDO IDs" if escribir else "ENSAYO (no escribe nada)") + " — " + libro.id, ""]
    total = hechas = saltadas = 0

    for h in cat.de_familia(cfg.get("familia")):
        if solo_hojas and h["hoja"] not in solo_hojas:
            continue
        hoja = libro.hoja(h["hoja"])
        if not hoja:
            lineas.append("  " + h["hoja"] + ": NO EXISTE, se salta")
            continue
        filas = filas_de(hoja)
        if not filas:
            lineas.append("  " + h["hoja"] + ": vacía, se salta")
            continue

        enc = encabezados(hoja)
        vacias = filas_vacias(hoja, filas)

        if not rehacer and _ya_migrada(hoja, h["prefijo"], filas, vacias):
            lineas.append("  " + h["hoja"] + " [" + h["prefijo"] + "]: YA MIGRADA, se salta")
            saltadas += 1
            continue

        sobrescribe = h["pisaLlaveAnterior"]
        pos_guardada = columna(enc, cat.COLUMNA_ID_ANTERIOR)
        ya_guardado = leer_columna(hoja, pos_guardada, filas) if pos_guardada else []
        tiene_guardado = any(ya_guardado)
        pos_vieja = columna_anterior(enc, h)
        if not tiene_guardado and not pos_vieja:
            lineas.append("  " + h["hoja"] + ": SIN columna de ID, se salta")
            continue

        pos_id_actual = columna(enc, cat.COLUMNA_ID)
        ids_previos = leer_columna(hoja, pos_id_actual, filas) if pos_id_actual else []
        nuevos = []
        vistos = set()
        conservados = generados = 0
        for i in range(filas):
            if vacias[i]:
                nuevos.append([""])
                continue
            previo = ids_previos[i] if i < len(ids_previos) else ""
            if (not rehacer and previo and ids_mod.tiene_forma(previo)
                    and ids_mod.prefijo(previo) == h["prefijo"] and previo not in vistos):
                vistos.add(previo)
                nuevos.append([previo])
                conservados += 1
                continue
            nuevo = generador.de_legado(h["prefijo"], i)
            intentos = 0
            while nuevo in vistos and intentos < 10:
                nuevo = generador.de_legado(h["prefijo"], i)
                intentos += 1
            if nuevo in vistos:
                raise RuntimeError("No pude generar un ID único en " + h["hoja"] + ", renglón " + str(i + 2))
            vistos.add(nuevo)
            nuevos.append([nuevo])
            generados += 1
        con_id = conservados + generados
        en_blanco = filas - con_id
        resumen = (str(generados) + " IDs nuevos" +
                   (", " + str(conservados) + " que ya tenían se conservan" if conservados else "") +
                   (", " + str(en_blanco) + " en blanco sin tocar" if en_blanco else ""))
        if sobrescribe:
            respaldo = (", " + cat.COLUMNA_ID_ANTERIOR + " ya estaba" if tiene_guardado
                        else ", el viejo se respalda en " + cat.COLUMNA_ID_ANTERIOR)
        else:
            respaldo = ', el viejo se queda en "' + str(h["llaveAnterior"]) + '"'

        if not escribir:
            ejemplo = next((f[0] for f in nuevos if f[0]), "")
            lineas.append("  " + h["hoja"] + " [" + h["prefijo"] + "]: " + resumen +
                          (", ej " + ejemplo if ejemplo else "") + respaldo)
            total += con_id
            hechas += 1
            continue

        if sobrescribe:
            col_vieja = leer_columna(hoja, pos_vieja, filas)
            respaldo_final = []
            respaldados = 0
            for i in range(filas):
                if i < len(ya_guardado) and ya_guardado[i]:
                    respaldo_final.append([ya_guardado[i]])
                    continue
                original = col_vieja[i] or ""
                viejo = "" if ids_mod.tiene_forma(original) else original
                respaldo_final.append([viejo])
                if viejo:
                    respaldados += 1
            if respaldados or not tiene_guardado:
                destino_viejo, _ = columna_o_crear(hoja, cat.COLUMNA_ID_ANTERIOR, True)
                hoja.escribir(2, destino_viejo, respaldo_final)

        destino, _ = columna_o_crear(hoja, cat.COLUMNA_ID, True)
        hoja.escribir(2, destino, nuevos)
        lineas.append("  " + h["hoja"] + " [" + h["prefijo"] + "]: " + resumen +
                      ", en la columna " + str(destino) + respaldo)
        total += con_id
        hechas += 1

    lineas.append("")
    lineas.append(str(hechas) + " hojas procesadas, " + str(saltadas) + " ya migradas, " + str(total) + " renglones.")
    if not escribir:
        lineas.append("Para escribir de verdad, corre: ids2Escribir")
    return "\n".join(lineas)


# ---------------------------------------------------------------- acomodo: mover

def mover(libro, cfg):
    escribir = cfg.get("escribir", False)
    familia = cfg.get("familia")
    lineas = [("MOVIENDO LA COLUMNA ID AL INICIO" if escribir else "ENSAYO (no mueve nada)") + " — " + libro.id, ""]
    movidas = 0
    for h in cat.todas():
        if familia and (h["familia"] or "otros") != str(familia).strip().lower():
            continue
        hoja = libro.hoja(h["hoja"])
        if not hoja:
            continue
        enc = encabezados(hoja)
        pos = columna(enc, cat.COLUMNA_ID)
        if not pos:
            lineas.append("  " + h["hoja"] + ": todavía no tiene columna ID, se salta")
            continue
        if pos == 1:
            lineas.append("  " + h["hoja"] + ": ya está al inicio")
            continue
        if not h["llaveAnterior"] and h.get("columnaAnterior"):
            lineas.append("  " + h["hoja"] + ": NO se mueve — su llave vieja va por posición (columna " +
                          str(h["columnaAnterior"]) + ") porque no tiene encabezado. Ponle nombre primero.")
            continue
        lineas.append("  " + h["hoja"] + ": de la columna " + str(pos) + " a la 1" + ("  MOVIDA" if escribir else ""))
        if escribir:
            hoja.mover_columna(pos, 1)
        movidas += 1
    lineas.append("")
    lineas.append(str(movidas) + " hojas por mover.")
    if not escribir and movidas:
        lineas.append("Para moverlas, corre: ids2Escribir")
    return "\n".join(lineas)


# ---------------------------------------------------------------- renombrar

def _deducido_donde(enc, d):
    """migDeducidoDonde_"""
    izq = columna(enc, d["entre"][0])
    der = columna(enc, d["entre"][1])
    if not izq or not der:
        return {"error": 'no encuentro sus vecinos "' + d["entre"][0] + '" y "' + d["entre"][1] +
                         '" para ubicar "' + d["nombre"] + '"'}
    if der - izq != 2:
        return {"error": 'entre "' + d["entre"][0] + '" (columna ' + str(izq) + ') y "' + d["entre"][1] +
                         '" (columna ' + str(der) + ") hay " + str(max(0, der - izq - 1)) + " columnas, y se " +
                         'esperaba exactamente 1 para poner "' + d["nombre"] + '". La hoja cambió de forma: ' +
                         "revisa la deducción antes de seguir (ver ENCABEZADOS_DEDUCIDOS)."}
    return {"columna": izq + 1}


def _deducido_comprueba(libro, hoja, col, d):
    """migDeducidoComprueba_"""
    c = d["comprueba"]
    catalogo = libro.hoja(c["hoja"])
    if not catalogo:
        return {"error": 'no existe "' + c["hoja"] + '", no puedo comprobar la deducción'}
    pos_cat = columna(encabezados(catalogo), c["columna"])
    if not pos_cat:
        return {"error": '"' + c["hoja"] + '" no tiene columna "' + c["columna"] + '", no puedo comprobar la deducción'}
    filas_cat = filas_de(catalogo)
    if not filas_cat:
        return {"error": '"' + c["hoja"] + '" está vacía'}
    validos = set()
    for v in leer_columna(catalogo, pos_cat, filas_cat):
        x = limpio(v)
        if x:
            validos.add(x.upper())
    filas = filas_de(hoja)
    if not filas:
        return {"error": "la hoja está vacía"}
    con_dato = [limpio(v) for v in leer_columna(hoja, col, filas)]
    con_dato = [v for v in con_dato if v]
    if not con_dato:
        return {"error": "esa columna no tiene ni un valor"}
    dentro = sum(1 for v in con_dato if v.upper() in validos)
    return {"tasa": dentro / len(con_dato), "valores": len(con_dato), "dentro": dentro}


def _poner_deducidos(libro, cfg, lineas, problemas):
    """ponerEncabezadosDeducidos_"""
    puestos = 0
    familia = cfg.get("familia")
    for d in cat.ENCABEZADOS_DEDUCIDOS:
        if familia and cat.existe(d["hoja"]) and cat.de(d["hoja"])["familia"] != str(familia).strip().lower():
            continue
        hoja = libro.hoja(d["hoja"])
        if not hoja:
            continue
        enc = encabezados(hoja)
        donde = _deducido_donde(enc, d)
        if "error" in donde:
            problemas.append(d["hoja"] + ": " + donde["error"])
            continue
        actual = limpio(enc[donde["columna"] - 1])
        if actual and clave(actual) == clave(d["nombre"]):
            lineas.append("  " + d["hoja"] + ": la columna " + str(donde["columna"]) + ' ya se llama "' + d["nombre"] + '"')
            continue
        if actual:
            problemas.append(d["hoja"] + ": la columna " + str(donde["columna"]) + ' se llama "' + actual +
                             '" y se esperaba vacía para ponerle "' + d["nombre"] + '". La hoja cambió de forma: ' +
                             "revisa la deducción antes de seguir (ver ENCABEZADOS_DEDUCIDOS).")
            continue
        if d.get("comprueba"):
            c = _deducido_comprueba(libro, hoja, donde["columna"], d)
            if "error" in c:
                problemas.append(d["hoja"] + ": " + c["error"] + " para la columna " + str(donde["columna"]) +
                                 ' ("' + d["nombre"] + '")')
                continue
            if c["tasa"] < d["comprueba"]["minimo"]:
                problemas.append(d["hoja"] + ": la columna " + str(donde["columna"]) + ' NO parece "' + d["nombre"] +
                                 '": solo ' + numero_js(redondear_js(c["tasa"] * 1000) / 10) + "% de sus " + str(c["valores"]) +
                                 " valores están en " + d["comprueba"]["hoja"] + "." + d["comprueba"]["columna"] +
                                 ", y se esperaba al menos " + numero_js(redondear_js(d["comprueba"]["minimo"] * 100)) + "%. " +
                                 "La hoja cambió de forma: revisa la deducción (ver ENCABEZADOS_DEDUCIDOS).")
                continue
            lineas.append("  " + d["hoja"] + ": columna " + str(donde["columna"]) + '  "(sin encabezado)"  ->  "' +
                          d["nombre"] + '"   (' + numero_js(redondear_js(c["tasa"] * 1000) / 10) + "% de sus " +
                          str(c["valores"]) + " valores son " + d["comprueba"]["hoja"] + "." + d["comprueba"]["columna"] + ")")
            if cfg.get("escribir"):
                hoja.poner_valor(1, donde["columna"], d["nombre"])
            puestos += 1
            continue
        lineas.append("  " + d["hoja"] + ": columna " + str(donde["columna"]) + '  "(sin encabezado)"  ->  "' +
                      d["nombre"] + '"   (deducido del contenido, ubicada entre "' + d["entre"][0] + '" y "' +
                      d["entre"][1] + '")')
        if cfg.get("escribir"):
            hoja.poner_valor(1, donde["columna"], d["nombre"])
        puestos += 1
    return puestos


def renombrar(libro, cfg):
    escribir = cfg.get("escribir", False)
    lineas = [('RENOMBRANDO LA LLAVE VIEJA A "' + cat.COLUMNA_ID_ANTERIOR + '"' if escribir
               else "ENSAYO (no renombra nada)") + " — " + libro.id, ""]
    renombradas = ya_estaban = respetadas = 0
    problemas = []

    for h in cat.de_familia(cfg.get("familia")):
        hoja = libro.hoja(h["hoja"])
        if not hoja:
            lineas.append("  " + h["hoja"] + ": NO EXISTE, se salta")
            continue
        enc = encabezados(hoja)
        if h["llaveEsDato"]:
            respetadas += 1
            lineas.append("  " + h["hoja"] + ': "' + str(h["llaveAnterior"]) + '" se QUEDA como está — no es un ' +
                          "id de AppSheet, es un dato de negocio (ver llaveEsDato en Entidades.gs)")
            continue
        ya_tiene = columna(enc, cat.COLUMNA_ID_ANTERIOR)
        if ya_tiene:
            ya_estaban += 1
            lineas.append("  " + h["hoja"] + ': ya tiene "' + cat.COLUMNA_ID_ANTERIOR +
                          '" en la columna ' + str(ya_tiene) + ", nada que hacer")
            continue
        pos = columna(enc, h["llaveAnterior"]) if h["llaveAnterior"] else 0
        como = "por su nombre"
        if not pos and h.get("columnaAnterior"):
            pos = h["columnaAnterior"]
            como = "por POSICION (columna " + str(h["columnaAnterior"]) + ", no tiene encabezado)"
        if not pos:
            problemas.append(h["hoja"] + ': no encuentro su llave vieja ("' +
                             (h["llaveAnterior"] or "columna " + str(h["columnaAnterior"])) + '")')
            lineas.append("  " + h["hoja"] + ": NO encuentro su llave vieja, se salta")
            continue
        como_se_llama = limpio(enc[pos - 1]) if pos - 1 < len(enc) else ""
        lineas.append("  " + h["hoja"] + ": columna " + str(pos) + '  "' + (como_se_llama or "(sin encabezado)") +
                      '"  ->  "' + cat.COLUMNA_ID_ANTERIOR + '"   (' + como + ")")
        if escribir:
            hoja.poner_valor(1, pos, cat.COLUMNA_ID_ANTERIOR)
        renombradas += 1

    deducidos = _poner_deducidos(libro, cfg, lineas, problemas)

    lineas.append("")
    if deducidos:
        lineas.append("  " + str(deducidos) + " encabezado(s) " + ("puestos" if escribir else "por poner") +
                      " deducidos del contenido")
    lineas.append("  " + str(renombradas) + " columnas " + ("renombradas" if escribir else "por renombrar") +
                  (", " + str(ya_estaban) + " ya estaban" if ya_estaban else "") +
                  (", " + str(respetadas) + " respetadas por ser dato de negocio" if respetadas else ""))
    if problemas:
        lineas.append("")
        lineas.append("PROBLEMAS (" + str(len(problemas)) + "):")
        for p in problemas:
            lineas.append("  - " + p)
    if escribir and renombradas:
        lineas.append("")
        lineas.append("  OJO: la app busca renglones por los nombres VIEJOS (ID_HOLOGRAMA,")
        lineas.append("  ID_SENSOR...). Si este libro lo lee la app, hay que actualizar esos")
        lineas.append("  nombres en el código. Ver docs/ids-asignacion.md.")
    return "\n".join(lineas)


# ---------------------------------------------------------------- respaldo

def respaldo(libro, cfg):
    escribir = cfg.get("escribir", False)
    lineas = [("QUITANDO RESPALDOS QUE SOBRAN" if escribir else "ENSAYO (no borra nada)") + " — " + libro.id, ""]
    quitadas = 0
    for h in cat.de_familia(cfg.get("familia")):
        hoja = libro.hoja(h["hoja"])
        if not hoja:
            continue
        filas = filas_de(hoja)
        if not filas:
            continue
        enc = encabezados(hoja)
        pos_guardada = columna(enc, cat.COLUMNA_ID_ANTERIOR)
        if not pos_guardada:
            continue
        if h["pisaLlaveAnterior"]:
            lineas.append("  " + h["hoja"] + ": el respaldo SÍ hace falta (su columna se llama ID), se deja")
            continue
        pos_vieja = columna_anterior(enc, h)
        if not pos_vieja:
            lineas.append("  " + h["hoja"] + ": ya no encuentro su llave anterior, NO se toca el respaldo")
            continue
        if pos_vieja == pos_guardada:
            lineas.append("  " + h["hoja"] + ": su llave anterior ES la columna " +
                          cat.COLUMNA_ID_ANTERIOR + ", no es un respaldo de más. NO se toca.")
            continue
        guardado = leer_columna(hoja, pos_guardada, filas)
        original = leer_columna(hoja, pos_vieja, filas)
        distintos = vacios = 0
        for i in range(filas):
            if not guardado[i]:
                if original[i]:
                    vacios += 1
                continue
            if clave(guardado[i]) != clave(original[i]):
                distintos += 1
        if distintos:
            lineas.append("  " + h["hoja"] + ': el respaldo guarda algo DISTINTO de "' + str(h["llaveAnterior"]) +
                          '" en ' + str(distintos) + " renglones, NO se toca")
            continue
        nota = (" (" + str(vacios) + " filas más nuevas que el respaldo, su valor sigue en su columna)") if vacios else ""
        nombre_vieja = h["llaveAnterior"] or ("la columna " + str(h["columnaAnterior"]) + ", que no tiene encabezado")
        lineas.append("  " + h["hoja"] + ': sobra (idéntico a "' + nombre_vieja + '")' + nota +
                      (", columna " + str(pos_guardada) + " BORRADA" if escribir else ""))
        if escribir:
            hoja.borrar_columna(pos_guardada)
        quitadas += 1
    lineas.append("")
    lineas.append(str(quitadas) + " hojas con respaldo de más.")
    if not escribir and quitadas:
        lineas.append("Para borrarlas, corre: ids2Escribir")
    return "\n".join(lineas)


# ---------------------------------------------------------------- auditar

def auditar(libro, cfg):
    familia = cfg.get("familia")
    lineas = ["AUDITORÍA — " + libro.id + ('  ·  solo la familia "' + familia + '"' if familia else ""), ""]
    fallas = []
    for h in cat.de_familia(familia):
        hoja = libro.hoja(h["hoja"])
        if not hoja:
            continue
        filas = filas_de(hoja)
        if not filas:
            continue
        enc = encabezados(hoja)
        pos = columna(enc, cat.COLUMNA_ID)
        if not pos:
            fallas.append(h["hoja"] + ": no tiene columna " + cat.COLUMNA_ID)
            continue
        valores = leer_columna(hoja, pos, filas)
        en_blanco = filas_vacias(hoja, filas)
        vacios = sum(1 for i, v in enumerate(valores) if not v and not en_blanco[i])
        con_dato = [v for v in valores if v]
        if con_dato and not any(ids_mod.tiene_forma(v) for v in con_dato):
            lineas.append("  " + h["hoja"] + " [" + h["prefijo"] + "]: " + str(filas) + " renglones" +
                          "  <-- SIN MIGRAR (su columna " + cat.COLUMNA_ID +
                          " todavia trae los valores de antes)")
            continue
        malos = sum(1 for v in valores if v and not ids_mod.tiene_forma(v))
        ajenos = sum(1 for v in valores if v and ids_mod.tiene_forma(v) and ids_mod.prefijo(v) != h["prefijo"])
        vistos = set()
        repetidos = 0
        for v in valores:
            if v:
                if v in vistos:
                    repetidos += 1
                else:
                    vistos.add(v)

        def tiempo(v):
            return str(v).split("-")[1][:8]

        desordenados = 0
        for i in range(1, len(valores)):
            if not valores[i] or not valores[i - 1]:
                continue
            if not ids_mod.tiene_forma(valores[i]) or not ids_mod.tiene_forma(valores[i - 1]):
                continue
            if tiempo(valores[i]) < tiempo(valores[i - 1]):
                desordenados += 1
        if vacios:
            fallas.append(h["hoja"] + ": " + str(vacios) + " renglones CON DATOS y sin ID")
        if malos:
            fallas.append(h["hoja"] + ": " + str(malos) + " IDs con forma inválida")
        if ajenos:
            fallas.append(h["hoja"] + ": " + str(ajenos) + " IDs con el prefijo de otra hoja")
        if repetidos:
            fallas.append(h["hoja"] + ": " + str(repetidos) + " IDs repetidos")
        if desordenados:
            fallas.append(h["hoja"] + ": " + str(desordenados) + " IDs fuera del orden de la hoja")
        lineas.append("  " + h["hoja"] + " [" + h["prefijo"] + "]: " + str(filas) + " renglones" +
                      ("  <-- CON PROBLEMAS" if (vacios + malos + ajenos + repetidos + desordenados) else "  ok"))
    lineas.append("")
    lineas.append(("FALLAS (" + str(len(fallas)) + "):") if fallas else "Todo cuadra.")
    for f in fallas:
        lineas.append("  - " + f)
    return "\n".join(lineas)
