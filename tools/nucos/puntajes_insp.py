"""Rellenar PUNTAJE FINAL INSPECCION (hoja INSPECCION VEHICULAR) con el que trae impreso el PDF de cada inspección.

117 inspecciones de 2026 (casi todas capturadas en AppSheet) tienen la celda vacía: AppSheet calculaba el puntaje para
el PDF y no lo guardaba. El PDF (el formato que se genera al capturar) lo trae: es el primer "NN.NN %" del texto.
Validado el 12-oct-2026 contra las que sí lo tienen en la hoja: 39 de 40 iguales (la otra era 0% y su PDF no trae número).

  puntajes_insp.py plan                SOLO LECTURA → .cache/puntajes/plan.json (fila, ID, puntaje del PDF)
  puntajes_insp.py aplicar             Escribe; antes de cada celda revisa que el renglón sea el mismo ID y la celda siga
                                       vacía. Bitácora .cache/bitacoras/<fecha>-puntajes.jsonl y respaldo en Drive.
  puntajes_insp.py verificar <bit>     SOLO LECTURA: cada celda de la bitácora tiene hoy el puntaje escrito.
  puntajes_insp.py deshacer <bit>      Vacía otra vez las celdas (si nadie las cambió después).
"""
import sys, io, re, json, time, collections
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import expediente as e, reglas

C = e.CACHE / "puntajes"
PLAN = C / "plan.json"
HOJA = "INSPECCION VEHICULAR"
COL = "PUNTAJE FINAL INSPECCION"
COL_PDF = "FORMATO INSPECCION VEHICULAR"
REPORTES = "1EYmA9RNLiPcY4vzZ07j2CC_0CBnutwkp"


def hojas():
    from autorizar import credenciales
    from googleapiclient.discovery import build
    return build("sheets", "v4", credentials=credenciales("lab"), cache_discovery=False).spreadsheets()


def leer(h):
    v = e.llamar(h.values().get(spreadsheetId=e.LIBRO, range="'%s'!A1:ZZ100000" % HOJA))["values"]
    enc = v[0]
    return enc, {i + 2: dict(zip(enc, f + [""] * (len(enc) - len(f)))) for i, f in enumerate(v[1:])}


def letra(i):
    s, n = "", i + 1
    while n:
        n, r = divmod(n - 1, 26)
        s = chr(65 + r) + s
    return s


def puntaje_del_pdf(d, file_id):
    from pypdf import PdfReader
    b = e.llamar(d.files().get_media(fileId=file_id))
    texto = "\n".join((p.extract_text() or "") for p in PdfReader(io.BytesIO(b)).pages)
    m = re.search(r"(\d{1,3}\.\d{2})\s*%", texto)
    return (m.group(1) + "%") if m and float(m.group(1)) <= 100 else None


def plan():
    h, d = hojas(), e.drive()
    enc, filas = leer(h)
    rutas, nivel = {}, [(REPORTES, "")]
    while nivel:
        hs = e.hijos_de(d, [i for i, _ in nivel]); pref = dict(nivel); nivel = []
        for pid, xs in hs.items():
            for x in xs:
                r = (pref[pid] + "/" if pref[pid] else "") + x["name"]
                if x["mimeType"] == reglas.CARPETA: nivel.append((x["id"], r))
                else: rutas[r] = x
    cambios, k = [], collections.Counter()
    for fila, r in filas.items():
        if not r.get("ID") or (r.get(COL) or "").strip():
            continue
        ruta = (r.get(COL_PDF) or "").strip()
        f = rutas.get(ruta) or rutas.get(re.sub(r"^INSPECCIONES VEHICULARES/", "", ruta))
        if not f:
            k["sin PDF en REPORTES"] += 1; continue
        p = puntaje_del_pdf(d, f["id"])
        if not p:
            k["el PDF no trae puntaje"] += 1; continue
        k["se llena con el del PDF"] += 1
        cambios.append(dict(fila=fila, id=r["ID"], fecha=r.get("FECHA", ""), puntaje=p, pdf=f["id"]))
    C.mkdir(parents=True, exist_ok=True)
    json.dump(dict(letra=letra(enc.index(COL)), cambios=cambios), open(PLAN, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(dict(k), "| ejemplos:", [(c["id"], c["puntaje"]) for c in cambios[:5]])


def aplicar():
    h = hojas()
    p = json.load(open(PLAN, encoding="utf-8"))
    enc, filas = leer(h)
    if letra(enc.index(COL)) != p["letra"]:
        raise SystemExit("La columna %s se movió desde el plan" % COL)
    bit = e.Bitacora(e.CACHE / "bitacoras" / (time.strftime("%Y%m%d-%H%M%S") + "-puntajes.jsonl"))
    listos, salt = [], collections.Counter()
    for c in p["cambios"]:
        r = filas.get(c["fila"], {})
        if r.get("ID") != c["id"]: salt["el renglón ya no es esa inspección"] += 1; continue
        if (r.get(COL) or "").strip(): salt["la celda ya tiene puntaje"] += 1; continue
        listos.append(c)
    for i in range(0, len(listos), 200):
        lote = listos[i:i + 200]
        e.llamar(h.values().batchUpdate(spreadsheetId=e.LIBRO, body={"valueInputOption": "RAW", "data": [
            {"range": "'%s'!%s%d" % (HOJA, p["letra"], c["fila"]), "values": [[c["puntaje"]]]} for c in lote]}))
        for c in lote:
            bit.anotar(accion="celda", hoja=HOJA, fila=c["fila"], columna=COL, letra=p["letra"], id=c["id"], antes="", despues=c["puntaje"], pdf=c["pdf"])
    print("escritas:", len(listos), "| saltadas:", dict(salt))
    e.respaldar_bitacora(bit.ruta)
    print("bitácora:", bit.ruta)


def verificar(ruta):
    _, filas = leer(hojas())
    k = collections.Counter()
    for x in (json.loads(l) for l in open(ruta, encoding="utf-8") if l.strip()):
        k["OK" if (filas.get(x["fila"], {}).get(COL) or "").strip() == x["despues"] else "DISTINTA"] += 1
    print(dict(k))


def deshacer(ruta):
    h = hojas()
    _, filas = leer(h)
    data, k = [], collections.Counter()
    for x in (json.loads(l) for l in open(ruta, encoding="utf-8") if l.strip()):
        if (filas.get(x["fila"], {}).get(COL) or "").strip() != x["despues"]:
            k["cambió después: no se toca"] += 1; continue
        data.append({"range": "'%s'!%s%d" % (HOJA, x["letra"], x["fila"]), "values": [[x["antes"]]]}); k["regresada"] += 1
    for i in range(0, len(data), 200):
        e.llamar(h.values().batchUpdate(spreadsheetId=e.LIBRO, body={"valueInputOption": "RAW", "data": data[i:i + 200]}))
    print(dict(k))


if __name__ == "__main__":
    a = sys.argv[1:]
    {"plan": plan, "aplicar": aplicar, "verificar": lambda: verificar(a[1]), "deshacer": lambda: deshacer(a[1])}.get(
        a[0] if a else "", lambda: print(__doc__))()
