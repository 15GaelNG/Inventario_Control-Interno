"""Que la hoja VEHICULOS apunte a los documentos del expediente de cada NUCO (1.-DOCUMENTACIÓN).

  ligas_doc.py plan <foto-doc.json>   SOLO LECTURA → .cache/ligas/plan.json y el resumen
  ligas_doc.py aplicar                 Escribe en la hoja de producción lo del plan. Antes de cada celda revisa que el
                                       renglón siga siendo del mismo NUCO y la celda tenga el mismo valor que en el plan;
                                       si no, no la toca. Bitácora .cache/bitacoras/<fecha>-ligas-doc.jsonl (fila,
                                       columna, antes, después) y respaldo en Drive.
  ligas_doc.py verificar <bitácora>    SOLO LECTURA: cada celda de la bitácora tiene hoy el valor nuevo.
  ligas_doc.py deshacer <bitácora>     Regresa cada celda a su valor de antes (si nadie la cambió después).

Reglas (11/12-oct-2026). El vehículo es el renglón (su NUCCO), nunca el folio:
  - Celda con liga a AppSheet (VEHICULOS_Files_/…, gettablefileurl) o a un archivo de Drive fuera del NUCO: si en
    1.-DOCUMENTACIÓN de ESE NUCO hay un archivo con el mismo contenido (md5), la celda pasa a la liga de ese archivo.
    Si no hay copia idéntica, no se toca.
  - Celda vacía: si la carpeta del documento (p. ej. 2.-SEGURO) tiene un solo archivo vigente (directo en ella, no en
    ANTERIORES), o un solo PDF entre varios, se llena con su liga. Si hay dos o más candidatos, no se adivina.
  - Nunca con una imagen de relleno ("NO APLICA", "SIN INFORMACIÓN"): el 12-oct se llenaron 309 pólizas con
    "SEGURO-…NO APLICA.jpg" y se regresaron a vacías (bitácora …-ligas-doc.NO-APLICA.jsonl).
  - DOCUMENTO BAJA vacío no se llena (su carpeta, ALTA DE PLACAS, es de otro documento).
"""
import sys, json, re, time, collections
from pathlib import Path
from urllib.parse import unquote_plus, urlparse, parse_qs
sys.path.insert(0, str(Path(__file__).resolve().parent))
import expediente as e, reglas

C = e.CACHE / "ligas"
PLAN = C / "plan.json"
HOJA = "VEHICULOS"
COLS = {"ADJUNTAR FACTURA": "1.-FACTURA", "POLIZA SEGURO": "2.-SEGURO", "ALTA PLACAS": "3.-ALTA DE PLACAS",
        "TARJETA CIRCULACION": "4.-TARJETA DE CIRCULACIÓN", "RESPONSIVA": "5.-RESPONSIVA", "ARCHIVO TENENCIA": "6.-TENENCIA",
        "DOCUMENTO BAJA": "3.-ALTA DE PLACAS"}
NO_LLENAR = {"DOCUMENTO BAJA"}
liga = lambda i: "https://drive.google.com/file/d/%s/view?usp=drivesdk" % i
num = lambda s: str(int(re.match(r"\s*(\d+)", s).group(1))) if re.match(r"\s*(\d+)", s or "") else ""
RELLENO = re.compile(r"NO APLICA|SIN INFORMACI|NO TIENE|PENDIENTE")
clave = lambda s: re.sub(r"\s+", "", reglas.normal(s or ""))


def hojas():
    from autorizar import credenciales
    from googleapiclient.discovery import build
    return build("sheets", "v4", credentials=credenciales("lab"), cache_discovery=False).spreadsheets()


def leer_hoja(h):
    v = e.llamar(h.values().get(spreadsheetId=e.LIBRO, range="'%s'!A1:ZZ100000" % HOJA))["values"]
    enc = v[0]
    return enc, [dict(zip(enc, f + [""] * (len(enc) - len(f))), _fila=i + 2) for i, f in enumerate(v[1:])]


def letra(i):
    s, n = "", i + 1
    while n:
        n, r = divmod(n - 1, 26)
        s = chr(65 + r) + s
    return s


def id_de(x):
    m = re.search(r"/d/([\w-]{20,})|[?&]id=([\w-]{20,})", x or "")
    return (m.group(1) or m.group(2)) if m else None


def plan(foto_doc):
    h, d = hojas(), e.drive()
    enc, filas = leer_hoja(h)
    faltan = [c for c in COLS if c not in enc]
    if faltan:
        raise SystemExit("La hoja no tiene las columnas: %s" % faltan)
    foto = json.load(open(foto_doc, encoding="utf-8"))
    en_doc = {}                                       # id → archivo, de 1.-DOCUMENTACIÓN de los NUCO (no _PAPELERA)
    md5_nuco = collections.defaultdict(list)          # (nuco, md5) → archivos
    vigentes = collections.defaultdict(list)          # (nuco, clave de la carpeta) → archivos directo en ella
    for a in foto["archivos"]:
        if not re.fullmatch(r"\d+", a["nuco"].strip()) or not reglas.es_documentacion(a["ruta"][0]):
            continue
        n = num(a["nuco"])
        en_doc[a["id"]] = dict(a, n=n)
        md5_nuco[(n, a.get("md5"))].append(a)
        if len(a["ruta"]) == 3:
            vigentes[(n, clave(a["ruta"][1]))].append(a)
    vf = {f["name"].strip(): f for f in json.load(open(e.CACHE / "vehiculos_files.json", encoding="utf-8"))}

    def original(x):
        """→ (md5, de dónde) del archivo al que apunta la celda"""
        if "appsheet.com" in x:
            x = unquote_plus(parse_qs(urlparse(x).query).get("fileName", [""])[0])
        if "/" in x and not x.startswith("http"):
            f = vf.get(x.split("/")[-1].strip())
            return (f.get("md5Checksum"), "AppSheet") if f else (None, "AppSheet: el archivo ya no existe")
        i = id_de(x)
        if not i:
            return None, "valor que no es liga"
        if i in en_doc:
            return "YA", ""
        try:
            f = e.llamar(d.files().get(fileId=i, fields="md5Checksum", supportsAllDrives=True))
            return f.get("md5Checksum"), "Drive fuera del NUCO"
        except Exception:
            return None, "Drive: no se pudo abrir"

    cambios, res = [], collections.defaultdict(collections.Counter)
    for r in filas:
        n = num(r.get("NUCCO"))
        if not n:
            continue
        for col, sub in COLS.items():
            x = (r.get(col) or "").strip()
            if x:
                md5, de = original(x)
                if md5 == "YA":
                    res[col]["ya apunta al NUCO"] += 1
                    continue
                cands = md5_nuco.get((n, md5), []) if md5 else []
                if not cands:
                    res[col]["sin copia idéntica en su NUCO (%s)" % de] += 1
                    continue
                a = sorted(cands, key=lambda a: ("ANTERIOR" in "/".join(a["ruta"]).upper(), len(a["ruta"]), a["name"]))[0]
                tipo = "cambiar liga (%s → copia idéntica%s)" % (de, ", que está en ANTERIORES" if "ANTERIOR" in "/".join(a["ruta"]).upper() else "")
            else:
                if col in NO_LLENAR:
                    continue
                # Las imágenes de relleno del área ("SEGURO-0001 NO APLICA.jpg", "SIN INFORMACIÓN") no son el documento
                vs = [v_ for v_ in vigentes.get((n, clave(sub)), []) if not RELLENO.search(reglas.normal(v_["name"]))]
                pdfs = [a for a in vs if a["mime"] == "application/pdf" or a["name"].lower().endswith(".pdf")]
                if len(vs) == 1:
                    a = vs[0]
                elif len(pdfs) == 1:
                    a = pdfs[0]
                else:
                    res[col]["vacía: " + ("el NUCO no lo tiene" if not vs else "varios candidatos, no se adivina")] += 1
                    continue
                tipo = "llenar vacía (documento vigente del NUCO)"
            res[col][tipo] += 1
            cambios.append(dict(fila=r["_fila"], nuco=n, columna=col, letra=letra(enc.index(col)), antes=x, despues=liga(a["id"]),
                                archivo=a["nuco"] + "/" + "/".join(a["ruta"]), tipo=tipo))
    C.mkdir(parents=True, exist_ok=True)
    json.dump(dict(cambios=cambios), open(PLAN, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    for col in COLS:
        print(col)
        for k, v in sorted(res[col].items()):
            print("   %5d  %s" % (v, k))
    print("CAMBIOS:", len(cambios), dict(collections.Counter(c["tipo"].split(" (")[0] for c in cambios)))


def aplicar():
    h = hojas()
    cambios = json.load(open(PLAN, encoding="utf-8"))["cambios"]
    enc, filas = leer_hoja(h)
    por_fila = {r["_fila"]: r for r in filas}
    bit = e.Bitacora(e.CACHE / "bitacoras" / (time.strftime("%Y%m%d-%H%M%S") + "-ligas-doc.jsonl"))
    listos, saltados = [], collections.Counter()
    for c in cambios:
        r = por_fila.get(c["fila"], {})
        if num(r.get("NUCCO")) != c["nuco"]:
            saltados["el renglón ya no es de ese NUCO"] += 1; continue
        if (r.get(c["columna"]) or "").strip() != c["antes"]:
            saltados["la celda cambió desde el plan"] += 1; continue
        if enc.index(c["columna"]) != ord(c["letra"][-1]) - 65 + (26 * (ord(c["letra"][0]) - 64) if len(c["letra"]) == 2 else 0):
            saltados["la columna se movió"] += 1; continue
        listos.append(c)
    for i in range(0, len(listos), 200):
        lote = listos[i:i + 200]
        e.llamar(h.values().batchUpdate(spreadsheetId=e.LIBRO, body={"valueInputOption": "RAW", "data": [
            {"range": "'%s'!%s%d" % (HOJA, c["letra"], c["fila"]), "values": [[c["despues"]]]} for c in lote]}))
        for c in lote:
            bit.anotar(accion="celda", hoja=HOJA, fila=c["fila"], columna=c["columna"], letra=c["letra"], nuco=c["nuco"],
                       antes=c["antes"], despues=c["despues"], tipo=c["tipo"])
        print("  %d/%d" % (min(i + 200, len(listos)), len(listos)))
    print("escritas:", len(listos), "| saltadas:", dict(saltados))
    e.respaldar_bitacora(bit.ruta)
    print("bitácora:", bit.ruta)


def verificar(ruta):
    h = hojas()
    enc, filas = leer_hoja(h)
    por_fila = {r["_fila"]: r for r in filas}
    k = collections.Counter()
    for x in (json.loads(l) for l in open(ruta, encoding="utf-8") if l.strip()):
        k["OK" if (por_fila.get(x["fila"], {}).get(x["columna"]) or "").strip() == x["despues"] else "DISTINTA"] += 1
    print(dict(k))


def deshacer(ruta):
    h = hojas()
    enc, filas = leer_hoja(h)
    por_fila = {r["_fila"]: r for r in filas}
    data, k = [], collections.Counter()
    for x in (json.loads(l) for l in open(ruta, encoding="utf-8") if l.strip()):
        if (por_fila.get(x["fila"], {}).get(x["columna"]) or "").strip() != x["despues"]:
            k["cambió después: no se toca"] += 1; continue
        data.append({"range": "'%s'!%s%d" % (HOJA, x["letra"], x["fila"]), "values": [[x["antes"]]]}); k["regresada"] += 1
    for i in range(0, len(data), 200):
        e.llamar(h.values().batchUpdate(spreadsheetId=e.LIBRO, body={"valueInputOption": "RAW", "data": data[i:i + 200]}))
    print(dict(k))


if __name__ == "__main__":
    a = sys.argv[1:]
    {"plan": lambda: plan(a[1]), "aplicar": aplicar, "verificar": lambda: verificar(a[1]),
     "deshacer": lambda: deshacer(a[1])}.get(a[0] if a else "", lambda: print(__doc__))()
