"""DRY RUN (sin Drive: trabaja sobre la foto foto.json): homologar <NUCO>/4.- INSPECCIONES.

Reglas (acordadas el 9-oct-2026):
  4.- INSPECCIONES/
     <año>/
        <N> BIMESTRE/          hasta 2025 (1ER … 6TO)
        <N> TRIMESTRE/         2026 en adelante (1ER … 4TO), por la fecha de lo que contiene
        POR <MOTIVO> <fecha>/  inspección extra (baja, renuncia, cambio…), fecha del PDF de dentro
           CRISTALERIA/ DOCUMENTACION/ INTERIORES/ LATONERIA Y PINTURA/ NEUMATICOS/
           OTROS ELEMENTOS/ SISTEMA ELECTRICO/ SISTEMA MECANICO/
           INSPECCION-0267 2025-12-22.pdf
        SIN PERIODO/           lo de ese año que no dice periodo ni trae fecha
     ANTERIORES/AJENO A INSPECCIONES/<año>/…   lo que no es inspección (tenencias, pólizas, verificaciones…)
  Lo que no se reconoce se queda donde está y sale en REVISAR.

Uso: homologar_insp.py foto.json salida   →  salida.xlsx, salida.json, salida-arboles.txt
"""
import sys, json, re, collections, statistics
sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parent))
import reglas

FOTO, SALIDA = sys.argv[1], sys.argv[2]
x = json.load(open(FOTO, encoding="utf-8"))
C, A = x["carpetas"], x["archivos"]
RAIZ = "4.- INSPECCIONES"
AJENO = ["@AJENO"]          # marca: se decide al final (documentación o _POR REVISAR)
SIN_PERIODO = "SIN PERIODO"
ORD = {1: "1ER", 2: "2DO", 3: "3ER", 4: "4TO", 5: "5TO", 6: "6TO"}
SECCIONES = ["CRISTALERIA", "DOCUMENTACION", "INTERIORES", "LATONERIA Y PINTURA", "NEUMATICOS", "OTROS ELEMENTOS",
             "SISTEMA ELECTRICO", "SISTEMA MECANICO"]
MESES = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"]
N = lambda s: re.sub(r"\s+", " ", reglas.normal(s)).strip()

carpeta = {c["id"]: c for c in C}
hijas = collections.defaultdict(list)
for c in C:
    hijas[c["padre"]].append(c)
arch_de = collections.defaultdict(list)
for a in A:
    arch_de[a["padre"]].append(a)
raiz_de = {r["id"]: r for r in x["raices"]}


# ---------- fechas ----------
def fecha_nombre(nombre):
    """'22122025-U46BLX.PDF' → (2025, 12, 22); solo si es una fecha válida ddmmaaaa al inicio."""
    m = re.match(r"\s*(\d{2})(\d{2})(\d{4})(?!\d)", nombre)
    if not m:
        return None
    d, mes, a = int(m.group(1)), int(m.group(2)), int(m.group(3))
    return (a, mes, d) if 1 <= d <= 31 and 1 <= mes <= 12 and 2010 <= a <= 2030 else None


def todos_los_archivos(cid, prof=3):
    out = list(arch_de[cid])
    if prof:
        for h in hijas[cid]:
            out += todos_los_archivos(h["id"], prof - 1)
    return out


def fecha_carpeta(cid):
    """La fecha de una inspección: la de su PDF (ddmmaaaa); si hay varios, la más repetida. Si no hay, la mediana de
    cuándo se subieron sus archivos. → ((año, mes, día), 'pdf' | 'archivos') o (None, None)"""
    pdfs = [fecha_nombre(a["name"]) for a in arch_de[cid] if a["mime"].endswith("pdf")]
    pdfs = [f for f in pdfs if f]
    if pdfs:
        return collections.Counter(pdfs).most_common(1)[0][0], "pdf"
    mods = sorted(a["modificado"][:10] for a in todos_los_archivos(cid) if a.get("modificado"))
    if mods:
        y, m, d = mods[len(mods) // 2].split("-")
        return (int(y), int(m), int(d)), "archivos"
    return None, None


# ---------- clasificar un nombre de carpeta ----------
MOTIVOS = [  # (patrón sobre el nombre normalizado, nombre fijo) — el orden importa
    (r"RE[AS]{0,2}SIGNAC|RESIGNAC", "POR REASIGNACION"),
    (r"ASIGNAC", "POR ASIGNACION"),
    (r"RENUNCIA", "POR RENUNCIA"),
    (r"CAMBIO DE (RESPONSABLE|COLABORADOR|USUARIO|RESGUARDANTE)", "POR CAMBIO DE RESPONSABLE"),
    (r"CAMBIO DE (DEPTO|DEPARTAMENTO|AREA)", "POR CAMBIO DE DEPTO"),
    (r"CAMBIO", "POR CAMBIO"),
    (r"\bBAJA\b", "POR BAJA"),
    (r"SOLICITUD", "POR SOLICITUD"),
    (r"SINIESTRO", "POR SINIESTRO"),
    (r"ACCIDENTE", "POR ACCIDENTE"),
    (r"INCIDENTE", "POR INCIDENTE"),
    (r"\bENTREGA\b", "POR ENTREGA"),
]
AJENOS = (r"TENENCIA|VERIFICAC|TRAMITE|SEGURO|POLIZA|EXPEDIENTE|PERDIDA DE PLACA|REPUVE|FACTURA|RESPONSIVA|SERVICIO|COTIZAC|"
          r"AUTORIZAC|GALERIA|ENCUESTA|COMBUSTIBLE|REFRENDO|REPOSICION|^DOCUMENTOS$|^\d*\.?-?\s*DOCUMENTOS")
GENERICO = r"INSPEC|INSECC|INPECC|PRIMER|^1ER INSPEC|REVISION"
SIN_CLASIFICAR = ["@REVISAR"]   # marca: va plano a _POR REVISAR


def es_vehiculo(nombre):
    """Carpetas que solo dicen de qué unidad son (las fotos de una inspección de 2022-2023, antes de las secciones):
    'Folio 01 Nuco 62', 'SV5384C', 'NUCO 110 OROCH', 'KWID', '0111', 'SP 0111', 'MOTOCARRO 0057'."""
    n = N(nombre)
    return bool(re.match(r"FOLIO \d+ NUCO \d+$|NUCO \d+\b|SP \d+$|\d{2,4}$|MOTOCARRO \d+$", n)
                or re.fullmatch(r"(?=[A-Z0-9]*\d)[A-Z0-9]{5,8}( TALLER)?", n)
                or re.fullmatch(r"(KWID|L200|H100|RIFTER|NP300|PEUGEOT RIFTER.*)", n))


def seccion(nombre):
    n = re.sub(r"\(\d+\)|\d+$", "", N(nombre)).strip()
    if n in ("DOCUMENTOS", "DOCUMENTO"):
        return "DOCUMENTACION"
    if n == "OTROS":
        return "OTROS ELEMENTOS"
    mejor = min(SECCIONES, key=lambda s: reglas.distancia(n, s))
    return mejor if reglas.distancia(n, mejor) <= 2 else None


def periodo_por_nombre(nombre):
    """→ ('BI'|'TRI', n) si el nombre dice el periodo ('3ER BIMESTRE', '4TO DIMESTRE', '5TO BIMESTR', '1ER TRIMIESTRE',
    'SEPTIEMBRE-OCTUBRE', 'DICIEMBRE')"""
    n = N(nombre)
    m = re.search(r"\b([1-6])\s*(ER|DO|RO|TO|O)?\b\.?\s*([A-Z]+)", n)
    if m:
        w = m.group(3).rstrip("S")
        if w.startswith("TR") and reglas.distancia(w, "TRIMESTRE") <= 2:
            return ("TRI", int(m.group(1)))
        if w[:1] in ("B", "D", "V") and reglas.distancia(w, "BIMESTRE") <= 2:
            return ("BI", int(m.group(1)))
    meses = [i + 1 for i, mes in enumerate(MESES) if re.search(r"\b" + mes, n) or re.search(r"\b" + mes[:3] + r"\b", n)]
    if meses:
        return ("MES", min(meses))
    return None


def tipo(nombre):
    n = N(nombre)
    for pat, fijo in MOTIVOS:
        if re.search(pat, n):
            return ("MOTIVO", fijo)
    if re.search(AJENOS, n):
        return ("AJENO", None)
    p = periodo_por_nombre(nombre)
    if p:
        return ("PERIODO", p)
    if seccion(nombre):
        return ("SECCION", seccion(nombre))
    if re.search(GENERICO, n):
        return ("GENERICO", None)
    return ("DESCONOCIDO", None)


def periodo_final(anio, p, fecha):
    """Nombre fijo del periodo según el año: hasta 2025 bimestre, 2026 trimestre (manda la fecha de lo que contiene)."""
    if anio >= 2026:
        mes = fecha[1] if fecha and fecha[0] == anio else (p[1] * 3 - 2 if p and p[0] == "TRI" else
                                                        (p[1] * 2 - 1 if p and p[0] == "BI" else (p[1] if p else None)))
        return ("%s TRIMESTRE" % ORD[(mes - 1) // 3 + 1]) if mes else None
    if p and p[0] == "BI":
        return "%s BIMESTRE" % ORD[p[1]]
    if p and p[0] == "MES":
        return "%s BIMESTRE" % ORD[(p[1] - 1) // 2 + 1]
    if p and p[0] == "TRI":
        return None   # un trimestre antes de 2026: no se adivina
    if fecha and fecha[0] == anio:
        return "%s BIMESTRE" % ORD[(fecha[1] - 1) // 2 + 1]
    return None


# ---------- el plan: a cada carpeta, su ruta nueva (relativa a la raíz) ----------
destino = {}        # id carpeta → lista de segmentos nuevos (relativa a 4.- INSPECCIONES)
nota = {}           # id carpeta → (clasificación, aviso)
destino_arch = {}   # id archivo → segmentos nuevos (carpeta) + nombre
avisos = []


def es_anio(nombre):
    return bool(re.fullmatch(r"(19|20)\d\d", nombre.strip()))


def seccion_de_inspeccion(cid, base_insp, sec):
    """Una sección de una inspección. Si trae otra sección dentro (NEUMATICOS/NEUMATICOS, LATONERIA/INTERIORES), lo de
    esa va a su sección hermana: nunca un cuarto nivel."""
    destino[cid] = base_insp + [sec]
    for h in hijas[cid]:
        s2 = seccion(h["name"])
        if s2:
            seccion_de_inspeccion(h["id"], base_insp, s2)
        else:
            destino[h["id"]] = base_insp + [sec, h["name"].strip()]
            bajo_igual(h["id"], destino[h["id"]])


def ajeno(cid, anio, base):
    """Una carpeta que no es inspección. Si trae una inspección dentro (EXPEDIENTE UNIDAD 2023/1ER INSPECCION 2023), esa
    va a su lugar como inspección; lo demás sigue marcado como ajeno."""
    destino[cid] = base
    for h in hijas[cid]:
        t = tipo(h["name"])
        if t[0] in ("PERIODO", "MOTIVO", "GENERICO"):
            colocar(h, anio, "ajeno > " + h["name"])
        else:
            ajeno(h["id"], anio, base + [h["name"].strip()])


def bajo_igual(cid, base):
    """Toda la subcarpeta va tal cual bajo `base` (solo se homologan los nombres de sección)."""
    for h in hijas[cid]:
        s = seccion(h["name"]) if len(base) >= 3 else None
        destino[h["id"]] = base + [s or h["name"].strip()]
        bajo_igual(h["id"], destino[h["id"]])


def inspeccion(cid, anio, nombre_nuevo, ctx):
    """Una carpeta que ES una inspección (periodo o motivo): sus hijas son secciones."""
    base = [str(anio)] + (nombre_nuevo if isinstance(nombre_nuevo, list) else [nombre_nuevo])
    destino[cid] = base
    hijas_de_inspeccion(cid, base, anio, ctx)


def hijas_de_inspeccion(cid, base, anio, ctx):
    for h in hijas[cid]:
        # Dentro de una inspección, primero si es sección: "DOCUMENTOS" aquí es la sección DOCUMENTACION, no algo ajeno
        t = ("SECCION", seccion(h["name"])) if seccion(h["name"]) else tipo(h["name"])
        hijas_h = [tipo(z["name"])[0] for z in hijas[h["id"]]]
        if t[0] == "SECCION":
            seccion_de_inspeccion(h["id"], base, t[1])
        elif t[0] in ("PERIODO", "MOTIVO"):
            colocar(h, anio, ctx + " > " + h["name"])          # otra inspección metida dentro: va a su lugar
        elif t[0] == "AJENO":
            nota[h["id"]] = ("AJENO", "estaba dentro de una inspección")
            ajeno(h["id"], anio, AJENO + [str(anio), h["name"].strip()])
        elif es_vehiculo(h["name"]) or "SECCION" in hijas_h or re.fullmatch(r"(19|20)\d\d", h["name"].strip()):
            # 'Folio 01 Nuco 62/', 'SV5384C/', '0111/' (con o sin secciones dentro): se quita ese nivel
            destino[h["id"]] = None
            nota[h["id"]] = ("ENVOLTORIO", "nivel de unidad dentro de la inspección: se integra")
            for a in arch_de[h["id"]]:
                destino_arch[a["id"]] = base, a["name"]
            hijas_de_inspeccion(h["id"], base, anio, ctx)
        else:
            # Evidencia con nombre propio (FOTOS DE RECUPERACION, REMOLQUE…): se queda dentro de la inspección
            destino[h["id"]] = base + [h["name"].strip()]
            nota[h["id"]] = ("EXTRA", "subcarpeta propia dentro de la inspección")
            bajo_igual(h["id"], destino[h["id"]])


def colocar(c, anio, ctx):
    """Decide la ruta nueva de una carpeta que cuelga de un año (o de la raíz, con el año sacado de su fecha)."""
    t = tipo(c["name"])
    fecha, fuente = fecha_carpeta(c["id"])
    if anio is None:
        anio = fecha[0] if fecha else None
        if anio is None:
            destino[c["id"]] = SIN_CLASIFICAR + [c["name"].strip()]
            nota[c["id"]] = ("SIN CLASIFICAR", "sin año ni fecha")
            bajo_igual(c["id"], destino[c["id"]])
            return
    # El periodo y la fecha del motivo solo los decide la fecha del PDF de la inspección: cuándo se subieron las fotos
    # no es confiable (se suben semanas después, o se copian de otra carpeta). Para el año de algo suelto sí sirve.
    if fuente != "pdf":
        fecha = None
    if t[0] == "AJENO":
        nota[c["id"]] = ("AJENO", "")
        ajeno(c["id"], anio, AJENO + [str(anio), c["name"].strip()])
        return
    if t[0] == "MOTIVO":
        f = fecha if fecha and fecha[0] == anio else None
        nombre = t[1] + (" %04d-%02d-%02d" % f if f else "")
        nota[c["id"]] = ("MOTIVO", "" if f else "sin fecha: va sin fecha")
        if f and fuente == "archivos":
            nota[c["id"]] = ("MOTIVO", "fecha tomada de cuándo se subieron los archivos (no hay PDF con fecha)")
        inspeccion(c["id"], anio, nombre, ctx)
        return
    # ¿Es un envoltorio (INSPECCIONES/, INSPECCION VEHICULAR 2022/) con periodos o motivos dentro? Se quita ese nivel
    tipos_hijas = [tipo(h["name"])[0] for h in hijas[c["id"]]]
    if t[0] in ("GENERICO", "DESCONOCIDO", "PERIODO") and any(k in ("PERIODO", "MOTIVO") for k in tipos_hijas) \
            and not any(k == "SECCION" for k in tipos_hijas):
        destino[c["id"]] = None
        nota[c["id"]] = ("ENVOLTORIO", "se quita este nivel")
        for h in hijas[c["id"]]:
            colocar(h, anio, ctx + " > " + h["name"])
        for a in arch_de[c["id"]]:
            archivo_suelto(a, anio)
        return
    if t[0] == "SECCION":
        # Una sección colgando directo del año: la inspección no tiene periodo
        destino[c["id"]] = [str(anio), SIN_PERIODO, t[1]]
        nota[c["id"]] = ("SECCION SUELTA", "")
        bajo_igual(c["id"], destino[c["id"]])
        return
    if t[0] == "DESCONOCIDO" and es_vehiculo(c["name"]):
        t = ("GENERICO", None)       # 'NUCO 110 OROCH/' colgando del año: una inspección sin periodo en el nombre
    if t[0] in ("PERIODO", "GENERICO"):
        p = t[1] if t[0] == "PERIODO" else None
        nombre = periodo_final(anio, p, fecha)
        if nombre:
            av = ""
            if t[0] == "GENERICO":
                av = "periodo sacado de la fecha (%s)" % fuente
            elif anio >= 2026 and fecha and fecha[0] == anio and p and p[0] != "TRI":
                av = "en 2026 se pasa a trimestre por la fecha (%s)" % fuente
            nota[c["id"]] = ("PERIODO", av)
            inspeccion(c["id"], anio, nombre, ctx)
        else:
            nota[c["id"]] = ("PERIODO", "no se supo el periodo: SIN PERIODO")
            # Cada inspección sin periodo conserva su carpeta dentro de SIN PERIODO (no se revuelven dos)
            inspeccion(c["id"], anio, SIN_PERIODO + " - " + c["name"].strip(), ctx)
        return
    destino[c["id"]] = SIN_CLASIFICAR + [str(anio), c["name"].strip()]
    nota[c["id"]] = ("SIN CLASIFICAR", "no es periodo, motivo ni sección: se aparta con su nombre")
    bajo_igual(c["id"], destino[c["id"]])


def archivo_suelto(a, anio):
    """Un archivo colgando de la raíz o de un año: un PDF con fecha va a su periodo; lo demás a SIN PERIODO del año."""
    f = fecha_nombre(a["name"])
    y = anio or (f[0] if f else (int(a["modificado"][:4]) if a.get("modificado") else None))
    if y is None:
        destino_arch[a["id"]] = [], a["name"]
        return
    # Un documento del vehículo (alta, tarjeta, tenencia, responsiva… con errores de dedo, como en documentación)
    if re.search(AJENOS, N(a["name"])) or reglas.concepto_archivo(a["name"]):
        destino_arch[a["id"]] = AJENO + [str(y)], a["name"]
        return
    nombre = periodo_final(y, None, f) if f and f[0] == y else None
    destino_arch[a["id"]] = [str(y), nombre or SIN_PERIODO], a["name"]


for r in x["raices"]:
    for c in hijas[r["id"]]:
        if es_anio(c["name"]):
            anio = int(c["name"].strip())
            destino[c["id"]] = [str(anio)]
            nota[c["id"]] = ("AÑO", "")
            for h in hijas[c["id"]]:
                colocar(h, anio, r["nuco"] + "/" + c["name"] + "/" + h["name"])
            for a in arch_de[c["id"]]:
                archivo_suelto(a, anio)
        elif "INSPECC" in N(c["name"]).replace(" ", "") and re.match(r"\d", c["name"]):
            # Una carpeta de inspecciones metida dentro de otra: se funde con la de arriba
            destino[c["id"]] = None
            nota[c["id"]] = ("ENVOLTORIO", "carpeta de inspecciones repetida dentro de la raíz")
            for h in hijas[c["id"]]:
                if es_anio(h["name"]):
                    anio = int(h["name"].strip())
                    destino[h["id"]] = [str(anio)]
                    for hh in hijas[h["id"]]:
                        colocar(hh, anio, r["nuco"])
                    for a in arch_de[h["id"]]:
                        archivo_suelto(a, anio)
                else:
                    colocar(h, None, r["nuco"])
            for a in arch_de[c["id"]]:
                archivo_suelto(a, None)
        else:
            colocar(c, None, r["nuco"] + "/" + c["name"])
    for a in arch_de[r["id"]]:
        archivo_suelto(a, None)


# ---------- cada archivo: su ruta nueva ----------
def ruta_nueva_carpeta(cid):
    return destino.get(cid)


plan = []
for a in A:
    raiz = raiz_de.get(a["padre"]) or None
    if a["id"] in destino_arch:
        segs, nombre = destino_arch[a["id"]]
    else:
        segs = ruta_nueva_carpeta(a["padre"])
        nombre = a["name"]
        if segs is None:
            # su carpeta era un envoltorio que se quitó: el archivo se trata como suelto del año (o de la raíz)
            anio = next((int(s) for s in a["ruta"][1:-1] if es_anio(s)), None)
            archivo_suelto(a, anio)
            segs, nombre = destino_arch[a["id"]]
    antes = "/".join([a["nuco"]] + a["ruta"])
    base = dict(id=a["id"], nuco=a["nuco"], antes=antes, md5=a.get("md5"), mime=a["mime"], aviso="", destino_tipo="")
    if reglas.es_relleno(a["name"]):
        plan.append(dict(base, accion="PAPELERA", despues="", aviso="relleno ('SIN INFORMACIÓN'): no es documento"))
        continue
    if segs and segs[0] == "@AJENO":
        plan.append(dict(base, accion="DOC", despues=""))           # se resuelve abajo, contra 1.-DOCUMENTACIÓN
        continue
    if segs and segs[0] == "@REVISAR":
        plan.append(dict(base, accion="REVISAR", despues=""))
        continue
    # El PDF de la inspección (directo en el periodo o motivo) con fecha → INSPECCION-0267 2025-12-22.pdf
    if es_anio(segs[0] if segs else "") and len(segs) == 2 and a["mime"].endswith("pdf"):
        f = fecha_nombre(a["name"])
        if f:
            nombre = "INSPECCION-%04d %04d-%02d-%02d.pdf" % (int(a["nuco"]), *f)
    plan.append(dict(base, accion="MOVER", despues="/".join([a["nuco"], RAIZ] + segs + [nombre])))

# ---------- lo ajeno: a su carpeta de 1.-DOCUMENTACIÓN (mismas reglas que el orden de documentación) ----------
DOC = json.load(open(FOTO.replace("foto.json", "foto-doc.json"), encoding="utf-8"))
DOCUMENTACION = "1.-DOCUMENTACIÓN"
VERSION_ANTERIOR = {"RESPONSIVA": "RESPONSIVAS ANTERIORES", "SEGURO": "SEGUROS ANTERIORES", "TENENCIA": "TENENCIAS ANTERIORES"}
md5_doc = collections.defaultdict(set)
usados = collections.defaultdict(set)           # (nuco, carpeta relativa) → nombres que ya hay
for d in DOC["archivos"]:
    md5_doc[d["nuco"]].add(d.get("md5"))
    usados[(d["nuco"], "/".join(d["ruta"][1:-1]))].add(d["name"])
por_id = {a["id"]: a for a in A}
for p in plan:
    if p["accion"] != "DOC":
        continue
    a = por_id[p["id"]]
    de_servicio = any(re.search(r"SERVICIO|COTIZAC|AUTORIZAC|GALERIA|ENCUESTA|TALLER", N(s)) for s in a["ruta"][1:-1])
    conc = None if de_servicio else (reglas.concepto_archivo(a["name"]) or next(
        (reglas.concepto(s) for s in reversed(a["ruta"][1:-1]) if reglas.concepto(s)), None))
    if conc == "FACTURA":
        # La factura de un trámite (pago de tenencia, cambio de placas, verificación) no es la del vehículo
        texto = N(" ".join(a["ruta"][1:]))
        if "CARTA FACTURA" not in texto:
            if reglas.parecida(texto, "TENENCIA"):
                conc = "TENENCIA"
            elif re.search(r"ALTA|PLACA", texto):
                conc = "ALTA DE PLACAS"
            elif re.search(r"VERIFICAC", texto):
                conc = None
                p["aviso"] = "factura de una verificación: le toca a 3.- VERIFICACIONES"
    if de_servicio:
        p["accion"] = "REVISAR"
        p["aviso"] = "es de un servicio (factura/cotización del taller), no del vehículo: le toca a 2.- SERVICIOS"
        continue
    if not conc:
        p["accion"] = "REVISAR"
        p["aviso"] = p["aviso"] or "no es inspección y no se reconoce qué documento es"
        continue
    if p["md5"] and p["md5"] in md5_doc[a["nuco"]]:
        p.update(accion="PAPELERA", aviso="ya está igual (mismo md5) en %s del NUCO" % DOCUMENTACION)
        continue
    carpeta = reglas.CARPETA_DE[conc]
    rel = "/".join([carpeta] + ([VERSION_ANTERIOR[conc]] if conc in VERSION_ANTERIOR else []))
    m = re.search(r"(?<!\d)(20[0-2]\d|201\d)(?!\d)", a["name"]) or next(
        (re.fullmatch(r"\s*(20\d\d)\s*", s) for s in a["ruta"] if re.fullmatch(r"\s*(20\d\d)\s*", s)), None)
    anio_doc = m.group(1) if m else ""
    ext_doc = reglas.extension(a["name"], a["mime"])
    if conc in VERSION_ANTERIOR and anio_doc:
        # En "anteriores" siempre con el año: TENENCIA-0080 2015.pdf (y (2), (3)… si hay dos del mismo año)
        b_ = "%s-%04d %s" % (reglas.PREFIJO_DE[conc], int(a["nuco"]), anio_doc)
        nombre, k = b_ + ext_doc, 2
        while nombre in usados[(a["nuco"], rel)]:
            nombre, k = "%s (%d)%s" % (b_, k, ext_doc), k + 1
        usados[(a["nuco"], rel)].add(nombre)
    else:
        nombre = reglas.nombre_final(reglas.PREFIJO_DE[conc], a["nuco"], anio_doc, ext_doc, usados[(a["nuco"], rel)])
    md5_doc[a["nuco"]].add(p["md5"])            # dos copias iguales que vienen de inspecciones: la segunda a la papelera
    p.update(accion="MOVER", despues="/".join([a["nuco"], DOCUMENTACION, rel, nombre]), destino_tipo="DOCUMENTACION",
             aviso="documento %s guardado en inspecciones" % conc)

# ---------- _POR REVISAR: plano, el nombre lleva de dónde venía ----------
POR_REVISAR = "_POR REVISAR"
for p in plan:
    if p["accion"] == "REVISAR":
        a = por_id[p["id"]]
        origen = next((s.strip() for s in reversed(a["ruta"][1:-1]) if not es_anio(s)), "") or             next((s.strip() for s in reversed(a["ruta"][1:-1]) if es_anio(s)), "")
        nombre = (origen + " - " if origen else "") + a["name"]
        p.update(accion="MOVER", despues="/".join([a["nuco"], RAIZ, POR_REVISAR, nombre]), destino_tipo="POR REVISAR",
                 aviso=p["aviso"] or "no es periodo, motivo ni sección")

# Choques de nombre en el destino: idéntico (mismo md5) → papelera; otro contenido → (2)
por_ruta = collections.defaultdict(list)
for p in plan:
    if p["accion"] == "MOVER":
        por_ruta[p["despues"]].append(p)
for ruta, ps in list(por_ruta.items()):
    if len(ps) > 1:
        base_, ext = re.match(r"(.*?)(\.[^./]+)?$", ruta).groups()
        vistos, n = {ps[0]["md5"]}, 2
        for p in ps[1:]:
            if p["md5"] and p["md5"] in vistos:
                p.update(accion="PAPELERA", despues="", aviso="idéntico a otro que llega al mismo lugar")
                continue
            vistos.add(p["md5"])
            while "%s (%d)%s" % (base_, n, ext or "") in por_ruta:
                n += 1
            p["despues"] = "%s (%d)%s" % (base_, n, ext or "")
            p["aviso"] = (p["aviso"] + "; " if p["aviso"] else "") + "mismo nombre, otro contenido: va con (%d)" % n
            n += 1
for p in plan:
    if p["accion"] == "MOVER" and p["antes"] == p["despues"]:
        p["accion"] = "IGUAL"
choques = sum(1 for p in plan if "mismo nombre" in p["aviso"])
repetidos = sum(1 for p in plan if p["accion"] == "PAPELERA")

# Revisiones de seguridad
assert len(plan) == len(A), "cada archivo tiene su destino"
vivos = [p["despues"] for p in plan if p["accion"] in ("MOVER", "IGUAL")]
assert len(set(vivos)) == len(vivos), "dos archivos no terminan en la misma ruta"
for p in plan:
    assert p["accion"] == "PAPELERA" or p["despues"].split("/")[0] == p["nuco"], "nada cambia de NUCO"
    assert p["accion"] != "PAPELERA" or p["aviso"], "nada va a la papelera sin motivo"
    assert "@" not in p["despues"], "ninguna marca se queda en la ruta"

json.dump(dict(plan=plan, nota={k: v for k, v in nota.items()}, destino=destino), open(SALIDA + ".json", "w", encoding="utf-8"),
          ensure_ascii=False)

# ---------- resumen ----------
acc = collections.Counter(p["accion"] for p in plan)
clas = collections.Counter(v[0] for v in nota.values())
print("archivos %d | %s" % (len(plan), dict(acc)))
print("carpetas clasificadas:", dict(clas))
print("PDF renombrados a INSPECCION-…:", sum(1 for p in plan if "/INSPECCION-" in p["despues"]))
print("a 1.-DOCUMENTACIÓN:", sum(1 for p in plan if p["destino_tipo"] == "DOCUMENTACION"),
      "| a _POR REVISAR:", sum(1 for p in plan if p["destino_tipo"] == "POR REVISAR"),
      "| a SIN PERIODO:", sum(1 for p in plan if "/SIN PERIODO" in p["despues"]),
      "| choques (2):", choques)
print("papelera por motivo:", collections.Counter(re.sub(r" del NUCO.*", "", p["aviso"]) for p in plan if p["accion"] == "PAPELERA"))
prof = collections.Counter(len(p["despues"].split("/")) - 3 for p in plan
                           if p["accion"] in ("MOVER", "IGUAL") and p["despues"].split("/")[1] == RAIZ)
print("niveles de carpeta bajo 4.- INSPECCIONES (archivos por profundidad):", sorted(prof.items()))
segundo = {p["despues"].split("/")[3] for p in plan if p["accion"] in ("MOVER", "IGUAL") and len(p["despues"].split("/")) > 4
           and es_anio(p["despues"].split("/")[2])}
print("nombres de nivel 2 después:", sorted({re.sub(r"\d{4}-\d{2}-\d{2}", "<fecha>", re.sub(r"^SIN PERIODO - .*", "SIN PERIODO - <nombre>", k)) for k in segundo}))
