"""Reglas del expediente por NUCO: a qué carpeta va cada archivo y cómo se llama. Sin Drive ni red.

La estructura que pide el área (junta, 8-oct-2026), dentro de 1.-DOCUMENTACIÓN de cada NUCO:

    1.-FACTURA                  la factura (el original electrónico, XML, si existe)
    2.-SEGURO                   la póliza; si no tiene, una imagen de que no tiene
    3.-ALTA DE PLACAS           el documento estatal: alta, baja, canje o sustitución
    4.-TARJETA DE CIRCULACIÓN
    5.-RESPONSIVA               la vigente directo ahí; las demás en RESPONSIVAS ANTERIORES
    6.-TENENCIA                 ya no se carga; sirve para mostrar que no debe tenencia

Hoy conviven tres generaciones de carpetas (la de 13 dentro de DOCUMENTOS, la de 10-11 y la
de 6), así que a cada archivo se le reconoce el documento por el nombre de la carpeta más
cercana que diga cuál es, no por su número. Lo que no es ninguno de los 6 (permiso, Oxxo Gas,
evidencia, contrato, carta factura…) no se pierde: va a ANTERIORES con su ruta de antes.
"""
import re
import unicodedata

DOCUMENTACION = "1.-DOCUMENTACIÓN"
ANTERIORES = "ANTERIORES"
RESPONSIVAS_ANTERIORES = "RESPONSIVAS ANTERIORES"
ADHERENTES = "ADHERENTES"
CARPETA = "application/vnd.google-apps.folder"

# (clave, carpeta, prefijo del archivo)
SEIS = [
    ("FACTURA", "1.-FACTURA", "FACTURA"),
    ("SEGURO", "2.-SEGURO", "SEGURO"),
    ("ALTA DE PLACAS", "3.-ALTA DE PLACAS", "ALTA DE PLACAS"),
    ("TARJETA DE CIRCULACION", "4.-TARJETA DE CIRCULACIÓN", "TARJETA DE CIRCULACION"),
    ("RESPONSIVA", "5.-RESPONSIVA", "RESPONSIVA"),
    ("TENENCIA", "6.-TENENCIA", "TENENCIA"),
]
CARPETA_DE = {c: carpeta for c, carpeta, _ in SEIS}
PREFIJO_DE = {c: p for c, _, p in SEIS}

# El relleno que se ponía en las carpetas vacías: no es un documento, no se copia
RELLENO = re.compile(r"SIN INFORMACI")


def normal(texto):
    s = unicodedata.normalize("NFD", texto or "")
    return "".join(ch for ch in s if unicodedata.category(ch) != "Mn").upper().strip()


def concepto(nombre):
    """El documento que dice el nombre de una carpeta (o None si no es ninguno de los 6).

    "CARTA FACTURA" cuenta como factura: en la generación más vieja (DOCUMENTOS/2.-CARTA FACTURA)
    es donde están las facturas ("3-FACTURA 4886.pdf").
    """
    n = normal(nombre)
    if "SOLICITUD" in n:
        return None
    if "FACTURA" in n:
        return "FACTURA"
    if re.search(r"SEGURO|POLIZA", n):
        return "SEGURO"
    if "ALTA" in n or re.search(r"(^|\W)PLACAS?$", n):
        return "ALTA DE PLACAS"
    if re.search(r"TARJETA|CIRCULACION|CIRUCLACION", n):
        return "TARJETA DE CIRCULACION"
    if re.search(r"RESPONS", n):
        return "RESPONSIVA"
    if "TENENCIA" in n:
        return "TENENCIA"
    return None


def concepto_archivo(nombre):
    """El documento que dice el nombre de un ARCHIVO. Manda sobre la carpeta: un "348.- Factura.pdf"
    guardado en CARTA RESPONSIVA es una factura (homologar también es acomodar lo mal archivado), y
    sirve para los sueltos ("DOCUMENTOS/ALTA.pdf"). Más estricto que concepto(): "Tarjeta corp.jpg"
    (de Oxxo Gas) no es una tarjeta de circulación."""
    n = normal(nombre)
    if re.search(r"\bFACTURA\b", n) and "SOLICITUD" not in n:
        return "FACTURA"
    if re.search(r"\bPOLIZA\b|\bSEGURO\b", n):
        return "SEGURO"
    if re.search(r"TARJETA\s*(DE\s*)?CIRCUL|\bTC\b|\bT\.C\.", n):
        return "TARJETA DE CIRCULACION"
    if re.search(r"\bALTA\b|BAJA DE PLACA", n):
        return "ALTA DE PLACAS"
    if re.search(r"\bRESPONSIVA\b", n):
        return "RESPONSIVA"
    if re.search(r"\bTENENCIA", n):
        return "TENENCIA"
    return None


def es_documentacion(nombre):
    return bool(re.match(r"^1\W*DOCUMENT", normal(nombre)))


def es_relleno(nombre):
    return bool(RELLENO.search(normal(nombre)))


def es_anterior(nombre):
    """Subcarpeta de responsivas viejas, con cualquiera de sus nombres (ANTERIORES, ANTIGUAS, RESPONSVIAS…)."""
    return bool(re.search(r"ANTERIOR|ANTIGU", normal(nombre)))


def es_adherente(nombre):
    return "ADHERENTE" in normal(nombre)


def extension(nombre, mime):
    m = re.search(r"\.([A-Za-z0-9]{2,4})$", nombre or "")
    if m:
        return "." + m.group(1).lower()
    return {"application/pdf": ".pdf", "image/jpeg": ".jpg", "image/png": ".png", "text/xml": ".xml",
            "application/xml": ".xml"}.get(mime, "")


def nombre_final(prefijo, nuco, fecha, ext, usados):
    """FACTURA-0648.pdf; si ya hay uno con ese nombre en la carpeta, con la fecha y luego (2), (3)…"""
    base = "%s-%04d" % (prefijo, int(nuco))
    for intento in [base, base + " " + (fecha or "")[:10]]:
        if intento.strip() and (intento + ext) not in usados:
            usados.add(intento + ext)
            return intento + ext
    n = 2
    while "%s (%d)%s" % (base, n, ext) in usados:
        n += 1
    usados.add("%s (%d)%s" % (base, n, ext))
    return "%s (%d)%s" % (base, n, ext)


def planear_nuco(nuco, documentacion, adjuntos, sin_seguro=None):
    """Lo que va en cada carpeta de un NUCO.

    documentacion: lista de nodos {id, name, mimeType, modifiedTime, md5Checksum, hijos} (las
    carpetas 1.-DOCUMENTACIÓN de ese NUCO, en cualquier generación).
    adjuntos: {clave: [archivo de VEHICULOS_Files_ que la hoja liga a esa clave]}.
    sin_seguro: la imagen de "inexistente" (la misma "CARPETA SIN INFORMACIÓN.jpg" de siempre) si la hoja
    dice que el seguro NO APLICA; se pone en 2.-SEGURO solo cuando no hay ninguna póliza.

    Devuelve (copias, resumen): copias = [{origen, md5, destino: [carpetas…], nombre, de, fuente}]. fuente: "nuco" (ya
    está en la carpeta del NUCO: en la real se MUEVE), "hoja" / "app" (adjunto de AppSheet o documento de la app: se
    COPIA, porque la hoja y la app lo siguen abriendo de ahí) o "imagen" (la de inexistente: se copia).
    """
    candidatos = {c: [] for c, _, _ in SEIS}
    anteriores = []
    rellenos = 0

    def visitar(nodo, ruta, actual, sub):
        nonlocal rellenos
        for h in nodo.get("hijos") or []:
            if h["mimeType"] == CARPETA:
                c = concepto(h["name"]) or actual
                s = sub
                nombre = h["name"].strip()
                if c == "RESPONSIVA" and sub and sub[0] == ADHERENTES:
                    s = sub + [nombre]                       # ADHERENTES/ADHERENTES ANTERIORES/…: se conserva
                elif c == "RESPONSIVA" and es_adherente(nombre):
                    # Antes que "anteriores": "ADHERENTES ANTERIORES" son adherentes, no responsivas viejas
                    s = [ADHERENTES] + ([nombre] if normal(nombre) != ADHERENTES else [])
                elif c == "RESPONSIVA" and es_anterior(nombre):
                    s = [RESPONSIVAS_ANTERIORES]
                visitar(h, ruta + [nombre], c, s)
            elif es_relleno(h["name"]):
                rellenos += 1
            elif concepto_archivo(h["name"]) or actual:
                c = concepto_archivo(h["name"]) or actual
                candidatos[c].append(dict(h, de="/".join(ruta), sub=sub if c == actual else None, fuente="nuco"))
            else:
                anteriores.append(dict(h, de="/".join(ruta), fuente="nuco"))

    for d in documentacion:
        visitar(d, [d["name"].strip()], None, None)
    for c, lista in (adjuntos or {}).items():
        for a in lista:
            # Adjunto de AppSheet o documento de la app: puede traer su propia subcarpeta (un adherente)
            candidatos[c].append(dict(a, de=a.get("de") or "VEHICULOS_Files_ (adjunto de la hoja)", sub=a.get("sub"),
                                      fuente=a.get("fuente") or "hoja"))

    copias = []
    resumen = {"rellenos": rellenos, "duplicados": 0, "docs": {}}
    for c, carpeta, prefijo in SEIS:
        vistos = set()
        unicos = []
        # La más reciente primero (se queda con el nombre sin fecha); en factura, la factura antes que la carta factura
        ordenados = sorted(candidatos[c], key=lambda x: x.get("modifiedTime") or "", reverse=True)
        if c == "FACTURA":
            ordenados.sort(key=lambda x: "CARTA" in normal(x["name"]))
        for a in ordenados:
            clave = a.get("md5Checksum") or a["id"]
            if clave in vistos:
                resumen["duplicados"] += 1
                continue
            vistos.add(clave)
            unicos.append(a)
        # Responsiva: la más reciente (que no esté ya en anteriores ni sea adherente) va a la raíz
        if c == "RESPONSIVA":
            vigente = next((a for a in unicos if not a["sub"]), None)
            for a in unicos:
                if not a["sub"] and a is not vigente:
                    a["sub"] = [RESPONSIVAS_ANTERIORES]
        usados = {}
        for a in unicos:
            destino = [DOCUMENTACION, carpeta] + list(a["sub"] or [])
            ruta = "/".join(destino)
            usados.setdefault(ruta, set())
            ext = extension(a["name"], a.get("mimeType"))
            adherente = bool(a["sub"]) and a["sub"][0] == ADHERENTES
            copias.append({"origen": a["id"], "md5": a.get("md5Checksum"), "destino": destino, "de": a["de"] + "/" + a["name"],
                           "nombre": nombre_final("ADHERENTE" if adherente else prefijo, nuco, a.get("modifiedTime"), ext, usados[ruta]),
                           "mime": a.get("mimeType"), "size": a.get("size"), "fuente": a["fuente"]})
        # Un adherente no es la responsiva del vehículo: no cuenta para "tiene responsiva"
        resumen["docs"][c] = len([a for a in unicos if not (a["sub"] and a["sub"][0] == ADHERENTES)])
        if c == "SEGURO" and not unicos and sin_seguro:
            copias.append({"origen": sin_seguro["id"], "md5": sin_seguro.get("md5Checksum"), "destino": [DOCUMENTACION, carpeta],
                           "de": "imagen de inexistente (seguro NO APLICA en la hoja)/" + sin_seguro["name"],
                           "nombre": "%s-%04d NO APLICA%s" % (prefijo, int(nuco), extension(sin_seguro["name"], sin_seguro.get("mimeType"))),
                           "mime": sin_seguro.get("mimeType"), "size": sin_seguro.get("size"), "fuente": "imagen"})
            resumen["sin_seguro"] = True
    for a in anteriores:
        partes = a["de"].split("/")[1:]   # sin la carpeta 1.-DOCUMENTACIÓN
        copias.append({"origen": a["id"], "md5": a.get("md5Checksum"), "destino": [DOCUMENTACION, ANTERIORES] + partes,
                       "de": a["de"] + "/" + a["name"], "nombre": a["name"], "mime": a.get("mimeType"), "size": a.get("size"),
                       "fuente": "nuco"})
    resumen["anteriores"] = len(anteriores)
    return copias, resumen
