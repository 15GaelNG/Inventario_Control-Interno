"""DRY RUN (solo lectura) de las inspecciones de la APP (hoja INSPECCION VEHICULAR, PDF en REPORTES): cada inspección de la hoja → qué se haría para que su PDF quede en el expediente de su NUCO.

  - Si el área ya copió ese PDF (mismo md5) a 4.- INSPECCIONES de su NUCO: solo se cambiaría la liga de la hoja.
  - Si solo está en REPORTES: se movería a <NUCO>/<carpeta de inspecciones>/<año>/<N> TRIMESTRE/ddmmaaaa-<VEHICULO> <PLACA>.pdf
    y la hoja guardaría su liga (mover conserva el ID).
No escribe nada en Drive ni en la hoja. Sale un Excel para revisar y un JSON con el plan.
"""
import sys, json, re, collections
sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parent))
import expediente as e, reglas
from autorizar import credenciales
from googleapiclient.discovery import build

SALIDA = sys.argv[1]
d = e.drive()
s = build("sheets", "v4", credentials=credenciales("lab"), cache_discovery=False).spreadsheets()
REPORTES = "1EYmA9RNLiPcY4vzZ07j2CC_0CBnutwkp"
CARP = reglas.CARPETA
HOJA = "INSPECCION VEHICULAR"
COL_PDF = "FORMATO INSPECCION VEHICULAR"
ORDINAL = {1: "1ER", 2: "2DO", 3: "3ER", 4: "4TO"}
liga = lambda i: "https://drive.google.com/file/d/%s/view?usp=drivesdk" % i


def letra(n):
    s = ""
    n += 1
    while n:
        n, r = divmod(n - 1, 26)
        s = chr(65 + r) + s
    return s


# ---- la hoja ----
v = e.llamar(s.values().get(spreadsheetId=e.LIBRO, range="'%s'!A1:ZZ100000" % HOJA)).get("values", [])
H = [x.strip() for x in v[0]]
c = lambda r, k: (r[H.index(k)].strip() if H.index(k) < len(r) else "")
filas = []
for n, r in enumerate(v[1:], start=2):
    if c(r, "ID INSPECCION"):
        filas.append(dict(fila=n, id=c(r, "ID INSPECCION"), nuco=c(r, "NUCO"), fecha=c(r, "FECHA"), vehiculo=c(r, "VEHICULO"),
                          placas=c(r, "PLACAS"), tipo=c(r, "TIPO"), pdf=c(r, COL_PDF)))
celda = lambda f: "%s%d" % (letra(H.index(COL_PDF)), f["fila"])

# ---- los PDF de REPORTES ----
rep = []
def bajar(pid, ruta, n=0):
    for f in e.hijos_de(d, [pid])[pid]:
        r = ruta + "/" + f["name"]
        if f["mimeType"] == CARP:
            if n < 3:
                bajar(f["id"], r, n + 1)
        elif "INSPECCION" in r.upper():
            rep.append(dict(f, ruta=r))
bajar(REPORTES, "REPORTES")
rep_por_nombre = collections.defaultdict(list)
for p in rep:
    rep_por_nombre[p["name"]].append(p)

# ---- NUCO → carpeta de inspecciones → año → trimestre ----
nucos = {f["name"]: f for f in e.hijos_de(d, [e.NUCOS])[e.NUCOS] if f["mimeType"] == CARP}
pedidos = sorted({str(int(f["nuco"])) for f in filas if f["nuco"].isdigit()}, key=int)
hijos = e.hijos_de(d, [nucos[n]["id"] for n in pedidos if n in nucos])
es_insp = lambda nombre: "INSPECC" in re.sub(r"[^A-Z]", "", reglas.normal(nombre))
insp = {}
for n in pedidos:
    if n in nucos:
        insp[n] = [h for h in hijos[nucos[n]["id"]] if h["mimeType"] == CARP and es_insp(h["name"])]
dentro_insp = e.hijos_de(d, [x["id"] for xs in insp.values() for x in xs])


def es_trimestre(nombre, k):
    """'2DO TRIMESTRE', '2DO TRIMESTRES', '2DO TRMESTRE', '1ER TRIMIESTRE' sí; '3ER BIMESTRE', '2DO TRIMESTRE POR BAJA' no."""
    p = reglas.normal(nombre).split()
    # Empieza con TR: BIMESTRE también queda a 2 letras de TRIMESTRE y no es lo mismo
    return len(p) == 2 and p[0] == ORDINAL[k] and p[1].startswith("TR") and reglas.distancia(p[1].rstrip("S"), "TRIMESTRE") <= 2


anios = {}
for xs in insp.values():
    for x in xs:
        anios[x["id"]] = [h for h in dentro_insp[x["id"]] if h["mimeType"] == CARP and h["name"].strip() == "2026"]
dentro_anio = e.hijos_de(d, [a["id"] for aa in anios.values() for a in aa])

# Los PDF que ya están en la carpeta de inspecciones de cada NUCO (todo lo hondo), por md5
arch = json.load(open(sys.argv[2], encoding="utf-8"))
ya = collections.defaultdict(list)
for f in arch:
    if f["mimeType"].endswith("pdf"):
        ya[(f["ruta"].split("/")[0], f.get("md5Checksum"))].append(f)


def fecha(texto):
    m = re.match(r"(\d{1,2})/(\d{1,2})/(\d{4})", texto)
    return (int(m.group(1)), int(m.group(2)), int(m.group(3))) if m else None


plan, nombres_usados = [], collections.defaultdict(set)
for f in filas:
    x = dict(f, celda=celda(f), accion="", origen="", origen_id="", destino="", nombre="", crear="", nueva_liga="", aviso="")
    plan.append(x)
    if not f["pdf"]:
        x["accion"] = "NADA"; x["aviso"] = "la inspección no tiene PDF"; continue
    if f["pdf"].startswith("http"):
        x["accion"] = "NADA"; x["aviso"] = "ya guarda una liga"; continue
    m = rep_por_nombre.get(f["pdf"].split("/")[-1], [])
    if len(m) != 1:
        x["accion"] = "REVISAR"; x["aviso"] = "%d PDF en REPORTES con ese nombre" % len(m); continue
    p = m[0]
    x["origen"], x["origen_id"] = p["ruta"], p["id"]
    if not f["nuco"].isdigit() or str(int(f["nuco"])) not in nucos:
        x["accion"] = "REVISAR"; x["aviso"] = "NUCO %r sin carpeta en NUCOS VEHICULOS" % f["nuco"]; continue
    n = str(int(f["nuco"]))
    copias = ya.get((n, p.get("md5Checksum")), [])
    if copias:
        # La que esté en una carpeta de 2026 primero; si hay varias, se avisa
        copias.sort(key=lambda z: ("/2026/" not in z["ruta"], len(z["ruta"])))
        x["accion"] = "SOLO LIGA"
        x["destino"] = copias[0]["ruta"]
        x["nueva_liga"] = liga(copias[0]["id"])
        if len(copias) > 1:
            x["aviso"] = "%d copias iguales en el NUCO; se toma la primera" % len(copias)
        continue
    # Mover
    fe = fecha(f["fecha"])
    if not fe:
        x["accion"] = "REVISAR"; x["aviso"] = "fecha ilegible: %r" % f["fecha"]; continue
    dia, mes, anio = fe
    k = (mes - 1) // 3 + 1
    trimestre = "%s TRIMESTRE" % ORDINAL[k]
    crear = []
    ci = insp.get(n, [])
    if len(ci) > 1:
        x["accion"] = "REVISAR"; x["aviso"] = "el NUCO tiene %d carpetas de inspecciones" % len(ci); continue
    ruta = [n]
    if ci:
        ruta.append(ci[0]["name"])
        aa = anios.get(ci[0]["id"], [])
    else:
        ruta.append("4.- INSPECCIONES"); crear.append("4.- INSPECCIONES"); aa = []
    if str(anio) != "2026":
        x["accion"] = "REVISAR"; x["aviso"] = "año %d (solo se miró 2026)" % anio; continue
    if len(aa) > 1:
        x["accion"] = "REVISAR"; x["aviso"] = "%d carpetas 2026" % len(aa); continue
    ruta.append("2026")
    if aa:
        tt = [h for h in dentro_anio[aa[0]["id"]] if h["mimeType"] == CARP and es_trimestre(h["name"], k)]
        if len(tt) > 1:
            exactas = [h for h in tt if h["name"].strip() == trimestre]
            if len(exactas) == 1:
                tt = exactas
            else:
                x["accion"] = "REVISAR"; x["aviso"] = "varias carpetas de %s: %s" % (trimestre, [h["name"] for h in tt]); continue
        if tt:
            ruta.append(tt[0]["name"])
            if tt[0]["name"] != trimestre:
                x["aviso"] = "se usa la carpeta existente %r" % tt[0]["name"]
            existentes = {h["name"] for h in dentro_anio.get(tt[0]["id"], [])} if tt[0]["id"] in dentro_anio else None
        else:
            ruta.append(trimestre); crear.append(trimestre)
    else:
        crear.append("2026"); ruta.append(trimestre); crear.append(trimestre)
    base = "%02d%02d%04d-%s %s" % (dia, mes, anio, reglas.normal(f["vehiculo"]) or f["tipo"], reglas.normal(f["placas"]))
    base = re.sub(r"\s+", " ", re.sub(r'[\\/:*?"<>|]', "", base)).strip()
    destino = "/".join(ruta)
    nombre, i = base + ".pdf", 2
    while nombre in nombres_usados[destino]:
        nombre = "%s (%d).pdf" % (base, i); i += 1
    nombres_usados[destino].add(nombre)
    x.update(accion="MOVER", destino=destino, nombre=nombre, crear=" / ".join(crear), nueva_liga=liga(p["id"]))

# Choque con lo que ya hay en la carpeta destino (la del trimestre si existe): se lista y se revisa
trimestres = {}
for xs in insp.values():
    for ci in xs:
        for a in anios.get(ci["id"], []):
            for h in dentro_anio[a["id"]]:
                if h["mimeType"] == CARP:
                    trimestres["/".join([ci["name"], "2026", h["name"]])] = h["id"]
contenido = e.hijos_de(d, list(set(trimestres.values())))
for x in plan:
    if x["accion"] == "MOVER":
        clave = "/".join(x["destino"].split("/")[1:])
        tid = None
        for ci in insp.get(x["destino"].split("/")[0], []):
            for a in anios.get(ci["id"], []):
                for h in dentro_anio[a["id"]]:
                    if "/".join([ci["name"], "2026", h["name"]]) == clave:
                        tid = h["id"]
        if tid and x["nombre"] in {h["name"] for h in contenido.get(tid, [])}:
            b = x["nombre"][:-4]; i = 2
            while "%s (%d).pdf" % (b, i) in {h["name"] for h in contenido[tid]}:
                i += 1
            x["aviso"] = (x["aviso"] + "; " if x["aviso"] else "") + "ya hay un archivo con ese nombre (otro contenido): va como (%d)" % i
            x["nombre"] = "%s (%d).pdf" % (b, i)

json.dump(plan, open(SALIDA + ".json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)

# ---- Excel ----
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
wb = Workbook()
r = wb.active; r.title = "Resumen"
cuenta = collections.Counter(x["accion"] for x in plan)
filas_resumen = [("Dry run: inspecciones → expediente del NUCO", ""), ("Solo lectura: no se escribió nada en Drive ni en la hoja.", ""), ("", ""),
                 ("Inspecciones en la hoja", len(plan))] + [(k, n) for k, n in cuenta.most_common()] + [
                 ("", ""), ("Carpetas a crear (MOVER)", sum(1 for x in plan if x["crear"])),
                 ("Con aviso", sum(1 for x in plan if x["aviso"]))]
for fila in filas_resumen:
    r.append(list(fila))
r["A1"].font = Font(name="Arial", bold=True, size=13)
for row in r.iter_rows():
    for cel in row:
        if cel.row != 1:
            cel.font = Font(name="Arial")
r.column_dimensions["A"].width = 48
p = wb.create_sheet("Plan")
cols = [("Fila hoja", "fila"), ("Celda", "celda"), ("ID inspección", "id"), ("NUCO", "nuco"), ("Fecha", "fecha"), ("Tipo", "tipo"),
        ("Vehículo", "vehiculo"), ("Placas", "placas"), ("Acción", "accion"), ("Valor actual en la hoja", "pdf"), ("PDF hoy (REPORTES)", "origen"),
        ("Destino en el NUCO", "destino"), ("Nombre nuevo", "nombre"), ("Carpetas a crear", "crear"), ("Liga nueva en la hoja", "nueva_liga"),
        ("Aviso", "aviso")]
p.append([t for t, _ in cols])
color = {"SOLO LIGA": "E2EFDA", "MOVER": "DDEBF7", "REVISAR": "FCE4D6", "NADA": "EDEDED"}
for x in sorted(plan, key=lambda z: (["REVISAR", "MOVER", "SOLO LIGA", "NADA"].index(z["accion"]), int(z["nuco"] or 0))):
    p.append([x[k] for _, k in cols])
    fill = PatternFill("solid", fgColor=color.get(x["accion"], "FFFFFF"))
    for cel in p[p.max_row]:
        cel.font = Font(name="Arial", size=10); cel.fill = fill
    if x["origen_id"]:
        p.cell(p.max_row, 11).hyperlink = liga(x["origen_id"])
    if x["nueva_liga"]:
        p.cell(p.max_row, 15).hyperlink = x["nueva_liga"]
for cel in p[1]:
    cel.font = Font(name="Arial", bold=True, color="FFFFFF"); cel.fill = PatternFill("solid", fgColor="305496")
    cel.alignment = Alignment(wrap_text=True, vertical="center")
for i, w in enumerate([8, 8, 16, 6, 18, 18, 16, 11, 11, 50, 50, 50, 34, 26, 30, 50], start=1):
    p.column_dimensions[letra(i - 1)].width = w
p.freeze_panes = "A2"
p.auto_filter.ref = p.dimensions
wb.save(SALIDA + ".xlsx")
print(cuenta, "| crear:", sum(1 for x in plan if x["crear"]), "| avisos:", sum(1 for x in plan if x["aviso"]))
