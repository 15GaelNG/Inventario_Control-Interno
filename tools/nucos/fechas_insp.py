"""SOLO LECTURA: ¿la fecha del nombre de cada PDF de inspección (INSPECCION-<NUCO> <aaaa-mm-dd>.pdf) es la que trae
impresa? La homologación del 11-oct tomó la fecha del nombre que le puso el área, y a veces el área se equivocó (13-oct:
217, 462, 301, 196, 320).

    fechas_insp.py leer <foto.json> [--muestra N] [--hilos 6]   baja cada PDF, saca su texto (pypdf) y, si es un escaneo
                                                                sin texto, lo pasa por el OCR de Google (copia temporal
                                                                como Documento, se borra). Guarda en .cache/fechas_insp.json
                                                                y se puede cortar y seguir.
    fechas_insp.py reporte <foto.json> <salida.xlsx>            compara y arma el Excel

La fecha impresa: la que sigue a "Fecha" (el formato de la app y el de AppSheet dicen "Fecha: dd/mm/aaaa"). Si no hay
"Fecha", la única fecha del documento; si hay varias y ninguna es "Fecha", no se decide (sin leer).
"""
import sys, io, re, json, time, threading, collections, unicodedata
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import expediente as e

CACHE = e.CACHE / "fechas_insp.json"
TEMPORAL = "INSPECCIONES OCR TEMPORAL"
PAT = re.compile(r"^INSPECCION-(\d+) (\d{4})-(\d{2})-(\d{2})( \(\d+\))?\.pdf$", re.I)
FECHA = r"(\d{1,2})\s*[/\-.]\s*(\d{1,2})\s*[/\-.]\s*(\d{4}|\d{2})\b"


MESES = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"]
# "26 de noviembre de 2025", "02 detulio de 20.24" (OCR), "de Abril de 2025" (sin día)
LARGA = re.compile(r"(?:(\d{1,2})\s*)?\bde\s*([A-Za-zÁÉÍÓÚáéíóú]{3,11})\s*(?:de|del)\s*(2\s*0\s*[.\s]?\s*\d\s*\d)\b", re.I)


def mes_de(palabra):
    """El mes de una palabra con errores del OCR ("Abri", "tulio", "SEPTIMBRE"), solo si uno queda claramente más cerca."""
    import reglas
    p = reglas.normal(palabra)
    p = p[2:] if p.startswith("DE") and len(p) > 5 else p
    ds = sorted((reglas.distancia(p, m if len(p) >= len(m) else m[:max(len(p), 3)]), i + 1) for i, m in enumerate(MESES))
    if ds[0][0] <= (1 if len(p) <= 4 else 2) and (len(ds) < 2 or ds[1][0] > ds[0][0]):
        return ds[0][1]
    return None


def fecha_impresa(texto):
    """(aaaa, mm, dd o None, cómo) o None. En orden: 'Fecha: dd/mm/aaaa' (la app, AppSheet); la primera fecha con letra
    ('26 de noviembre de 2025': el formulario y los escaneos, la de la inspección va antes que la del último servicio);
    la única fecha con números del documento. Sin día ('de Abril de 2025'): solo mes y año."""
    t = unicodedata.normalize("NFKC", texto or "").replace("\xa0", " ")
    m = re.search(r"FECHA\s*(?:DE\s*(?:LA\s*)?INSPECCI[OÓ]N)?\s*[:\-]?\s*" + FECHA, t, re.I)
    if m:
        return norm(m.groups()[-3:], "después de 'Fecha'")
    for m in LARGA.finditer(t):
        mes = mes_de(m.group(2))
        anio = int(re.sub(r"\D", "", m.group(3)))
        if not mes or not 2014 <= anio <= 2027:
            continue
        if m.group(1):
            r = norm((m.group(1), mes, anio), "la primera fecha con letra")
            if r:
                return r
        else:
            return (anio, mes, None, "solo mes y año (sin día)")
    # El OCR desordena la línea: "FECHA: 28 de Abri Vazquez … de 20 25". Día y mes juntos, y el año poco después
    for m in re.finditer(r"FECHA\s*:?\s*(\d{1,2})\s*de\s*([A-Za-zÁÉÍÓÚáéíóú]{3,11})", t, re.I):
        mes = mes_de(m.group(2))
        a = re.search(r"\b(2\s*0\s*[.\s]?\s*[12]\s*\d)\b", t[m.end():m.end() + 150])
        if mes and a:
            r = norm((m.group(1), mes, int(re.sub(r"\D", "", a.group(1)))), "día y mes tras 'FECHA', año más adelante (OCR desordenado)")
            if r:
                return r
    todas = {norm(x, "") for x in re.findall(FECHA, t)}
    todas.discard(None)
    if len(todas) == 1:
        a = todas.pop()
        return a[:3] + ("la única fecha del documento",)
    return None


def norm(g, como):
    d, m, a = int(g[0]), int(g[1]), int(g[2])
    a = a + 2000 if a < 100 else a
    if not (1 <= m <= 12 and 1 <= d <= 31 and 2014 <= a <= 2027):
        return None
    return (a, m, d, como)


def leer(foto_json, muestra=None, hilos=6):
    from pypdf import PdfReader
    from googleapiclient.http import MediaIoBaseDownload
    g = json.loads(Path(foto_json).read_text(encoding="utf-8"))
    pdfs = [x for x in g["archivos"] if PAT.match(x["name"])]
    hechos = json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() else {}
    pend = [x for x in pdfs if x["id"] not in hechos or hechos[x["id"]].get("md5") != x.get("md5")]
    if muestra:
        import random
        random.seed(13)
        pend = random.sample(pend, min(muestra, len(pend)))
    print("PDF: %d | ya leídos: %d | por leer: %d" % (len(pdfs), len(pdfs) - len(pend), len(pend)))
    candado, local = threading.Lock(), threading.local()
    tmp = {}

    def drv():
        if not hasattr(local, "d"):
            local.d = e.drive()
        return local.d

    def carpeta_tmp(d):
        with candado:
            if "id" not in tmp:
                r = e.llamar(d.files().list(q="'%s' in parents and name = '%s' and trashed = false" % (e.RESPALDO, TEMPORAL),
                                            fields="files(id)"))["files"]
                tmp["id"] = r[0]["id"] if r else e.llamar(d.files().create(body={"name": TEMPORAL, "parents": [e.RESPALDO],
                                                          "mimeType": "application/vnd.google-apps.folder"}, fields="id"))["id"]
        return tmp["id"]

    def ocr(d, x, datos):
        """El OCR de Google: la página 1 como imagen, subida como Documento (los escaneos traen una capa de texto vacía)."""
        from googleapiclient.http import MediaIoBaseUpload
        try:
            import pypdfium2 as pdfium
        except ImportError:
            return "", "falta pypdfium2"
        pagina = pdfium.PdfDocument(datos)[0]
        img = pagina.render(scale=2).to_pil()
        buf = io.BytesIO()
        img.save(buf, "PNG")
        doc = e.llamar(d.files().create(body={"name": "OCR " + x["id"], "mimeType": "application/vnd.google-apps.document",
                                              "parents": [carpeta_tmp(d)]}, ocrLanguage="es", fields="id",
                                        media_body=MediaIoBaseUpload(io.BytesIO(buf.getvalue()), mimetype="image/png")))
        try:
            texto = e.llamar(d.files().export(fileId=doc["id"], mimeType="text/plain")).decode("utf-8", "ignore")
        finally:
            e.llamar(d.files().delete(fileId=doc["id"]))
        return texto, ""

    def uno(x):
        d = drv()
        buf = io.BytesIO()
        dl = MediaIoBaseDownload(buf, d.files().get_media(fileId=x["id"]), chunksize=8 * 1024 * 1024)
        hecho = False
        while not hecho:
            _, hecho = dl.next_chunk()
        datos = buf.getvalue()
        texto, metodo, error = "", "texto", ""
        try:
            lector = PdfReader(io.BytesIO(datos))
            texto = "\n".join((p.extract_text() or "") for p in lector.pages[:2])
        except Exception as err:   # noqa: BLE001
            error = "pypdf: %s" % err
        if len(re.sub(r"\s", "", texto)) < 40:
            metodo = "OCR"
            try:
                texto, error = ocr(d, x, datos)
            except Exception as err:   # noqa: BLE001
                error = "OCR: %s" % err
        f = fecha_impresa(texto)
        return x["id"], dict(md5=x.get("md5"), metodo=metodo, error=error, fecha=list(f) if f else None,
                             muestra=re.sub(r"\s+", " ", texto)[:300], texto=texto[:8000])

    from concurrent.futures import ThreadPoolExecutor, as_completed
    with ThreadPoolExecutor(max_workers=hilos) as pool:
        futuros = [pool.submit(uno, x) for x in pend]
        for k, fu in enumerate(as_completed(futuros), start=1):
            try:
                i, r = fu.result()
                hechos[i] = r
            except Exception as err:   # noqa: BLE001
                print("  falló uno: %s" % err)
            if k % 25 == 0 or k == len(futuros):
                CACHE.write_text(json.dumps(hechos, ensure_ascii=False), encoding="utf-8")
                print("  %d/%d" % (k, len(futuros)), flush=True)
    CACHE.write_text(json.dumps(hechos, ensure_ascii=False), encoding="utf-8")


def comparar(foto_json):
    g = json.loads(Path(foto_json).read_text(encoding="utf-8"))
    hechos = json.loads(CACHE.read_text(encoding="utf-8")) if CACHE.exists() else {}
    out = []
    for x in g["archivos"]:
        m = PAT.match(x["name"])
        if not m:
            continue
        h = hechos.get(x["id"])
        if h and "texto" in h:
            h = dict(h, fecha=list(fecha_impresa(h["texto"]) or []) or None)   # las reglas de hoy, sin volver a bajar
        nombre = (int(m.group(2)), int(m.group(3)), int(m.group(4)))
        if not h:
            estado = "SIN LEER"
        elif not h["fecha"]:
            estado = "NO SE ENCONTRÓ LA FECHA"
        elif h["fecha"][2] is None:
            estado = "COINCIDE (mes)" if tuple(h["fecha"][:2]) == nombre[:2] else "DISTINTA"
        elif tuple(h["fecha"][:3]) == nombre:
            estado = "COINCIDE"
        else:
            estado = "DISTINTA"
        f = h["fecha"] if h else None
        out.append(dict(nuco=x["nuco"], ruta="/".join(x["ruta"]), id=x["id"], nombre="%04d-%02d-%02d" % nombre,
                        impresa=("%04d-%02d-%02d" % tuple(f[:3]) if f[2] else "%04d-%02d-??" % tuple(f[:2])) if f else "",
                        como=(h["fecha"][3] if h and h["fecha"] else ""), metodo=h["metodo"] if h else "",
                        error=h.get("error", "") if h else "", texto=h.get("muestra", "") if h else "", estado=estado))
    return out


def reporte(foto_json, salida):
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill
    out = comparar(foto_json)
    c = collections.Counter(x["estado"] for x in out)
    print(dict(c), "| por método:", dict(collections.Counter(x["metodo"] for x in out)))
    wb = Workbook()
    h = wb.active
    h.title = "Fechas"
    cols = ["estado", "nuco", "ruta", "nombre", "impresa", "como", "metodo", "error", "texto", "id"]
    h.append(cols)
    orden = ["DISTINTA", "NO SE ENCONTRÓ LA FECHA", "SIN LEER", "COINCIDE (mes)", "COINCIDE"]
    color = {"DISTINTA": "FCE4D6", "NO SE ENCONTRÓ LA FECHA": "FFF2CC", "SIN LEER": "EDEDED", "COINCIDE (mes)": "E2EFDA", "COINCIDE": "E2EFDA"}
    for x in sorted(out, key=lambda z: (orden.index(z["estado"]), int(z["nuco"]))):
        h.append([x[k] for k in cols])
        for cel in h[h.max_row]:
            cel.font = Font(name="Arial", size=10)
            cel.fill = PatternFill("solid", fgColor=color[x["estado"]])
    for cel in h[1]:
        cel.font = Font(name="Arial", bold=True)
    h.freeze_panes = "A2"
    h.auto_filter.ref = h.dimensions
    wb.save(salida)


if __name__ == "__main__":
    a = sys.argv[1:]
    if a and a[0] == "leer":
        leer(a[1], int(a[a.index("--muestra") + 1]) if "--muestra" in a else None, int(a[a.index("--hilos") + 1]) if "--hilos" in a else 6)
    elif a and a[0] == "reporte":
        reporte(a[1], a[2])
    else:
        print(__doc__)
