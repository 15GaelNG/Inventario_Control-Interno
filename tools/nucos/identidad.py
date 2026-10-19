"""¿Cada documento de NUCOS es de su unidad? Lee el VIN y la placa de cada archivo y los compara con VEHICULOS.

    uv run --no-project --with google-api-python-client --with google-auth-oauthlib --with pypdfium2 --with pillow \
        --with rapidocr_onnxruntime --with winocr --with rapidfuzz --with openpyxl \
        python tools/nucos/identidad.py --nucos 22,91 | --muestra 20 | --todos  [--procesos 5] [--anteriores]

SOLO LECTURA: baja cada archivo de 1.-DOCUMENTACIÓN (las 7 carpetas; con --anteriores también sus subcarpetas) y no
escribe nada en Drive ni en la hoja. Deja en tools/nucos/.cache/identidad/:

    textos.jsonl          lo leído de cada archivo (por id y md5): repetir la corrida solo lee lo nuevo o cambiado
    <fecha>/revision.xlsx un renglón por archivo con su veredicto, y el resumen

Veredictos: CONFIRMADO (trae el VIN o la placa de su NUCO), OTRA UNIDAD (trae los de otro NUCO y no los suyos: dice
cuál), SIN CONFIRMAR (no se leyó ninguno: ilegible, escrito a mano o el documento no los trae) y NO SE REVISA (relleno,
"NO APLICA", formatos sin lector).

Cómo lee: la capa de texto del PDF si trae algún VIN o placa (exacta e instantánea); si no, OCR local por página (el de
Windows, ~0.3 s; si no confirma, RapidOCR, más lento y más fino) hasta confirmar su unidad (máx. 3). No se busca "algo con forma de VIN" sino los VIN y placas de la flota, con
hasta 2 errores de OCR y las confusiones típicas (O/0, I/1, S/5, B/8…): así la basura del OCR no cuenta como VIN.
"""
import argparse
import io
import json
import re
import sys
import threading
import time
from concurrent.futures import ProcessPoolExecutor, ThreadPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parent / "migracion"))
sys.path.insert(0, str(AQUI))

import reglas  # noqa: E402

CACHE = AQUI / ".cache" / "identidad"
TEXTOS = CACHE / "textos.jsonl"
LIBRO = "17YrtuMYjGGg5LZm1BxMNrEZyCxTMI2DiUHSVUIldUlc"  # producción: solo se LEE VEHICULOS
DPI = 200
MAX_PAGINAS = 3

# Lo que el OCR confunde se vuelve una sola letra en los dos lados de la comparación
CONFUSIONES = str.maketrans("OQDILSBZG", "000115826")


def alnum(texto):
    return re.sub(r"[^A-Z0-9]", "", reglas.normal(texto))


def canon(texto):
    return alnum(texto).translate(CONFUSIONES)


# ---- La flota: VIN y placa de cada NUCO ----

class Flota:
    def __init__(self, vehiculos):
        self.vin, self.placa = {}, {}
        for v in vehiculos:
            n = re.sub(r"\D", "", str(v.get("NUCCO", "")))
            if not n:
                continue
            n = str(int(n))
            vin = alnum(v.get("SERIE VEHICULO", ""))
            if len(vin) >= 11:
                self.vin.setdefault(canon(vin), set()).add(n)
            placa = alnum(v.get("PLACA", ""))
            if len(placa) >= 5 and placa not in ("SINPLACA", "SINPLACAS", "NA"):
                self.placa.setdefault(placa, set()).add(n)
        # Con 2 errores en 17 caracteres siempre queda un tramo limpio de 5: es la semilla para buscar
        self.semillas = {}
        for c in self.vin:
            for k in range(len(c) - 4):
                self.semillas.setdefault(c[k:k + 5], []).append((c, k))
        self.propios = {}
        for c, ns in self.vin.items():
            for n in ns:
                self.propios.setdefault(n, []).append(("VIN", c))
        for p, ns in self.placa.items():
            for n in ns:
                self.propios.setdefault(n, []).append(("PLACA", p))

    def buscar(self, texto):
        """[(tipo, nucos, distancia)]: los VIN (con hasta 2 errores) y las placas (exactas) de la flota en el texto."""
        from rapidfuzz.distance import Levenshtein
        t = canon(texto)
        vistos = {}
        for i in range(len(t) - 4):
            for c, k in self.semillas.get(t[i:i + 5], ()):
                s = i - k
                mejor = min(Levenshtein.distance(c, t[max(0, s + a):max(0, s + a) + len(c) + b])
                            for a in (-1, 0, 1) for b in (-1, 0, 1))
                if mejor <= 2 and mejor < vistos.get(c, 99):
                    vistos[c] = mejor
        hallados = []
        if vistos:
            cerca = min(vistos.values())
            for c, dist in vistos.items():
                if dist <= cerca + 1:        # el más parecido (y los empatados), no todo lo que quedó a 2
                    hallados.append(("VIN", sorted(self.vin[c], key=int), dist))
        crudo = alnum(texto)
        for p, ns in self.placa.items():
            if p in crudo:
                hallados.append(("PLACA", sorted(ns, key=int), 0))
        return hallados


def veredicto(nuco, hallados):
    vin_p = [h for h in hallados if h[0] == "VIN" and nuco in h[1]]
    pla_p = [h for h in hallados if h[0] == "PLACA" and nuco in h[1]]
    vin_o = sorted({n for h in hallados if h[0] == "VIN" and nuco not in h[1] for n in h[1]}, key=int)
    pla_o = sorted({n for h in hallados if h[0] == "PLACA" and nuco not in h[1] for n in h[1]}, key=int)
    if vin_p or pla_p:
        como = "VIN" + (" (%d error%s de OCR)" % (vin_p[0][2], "es" if vin_p[0][2] > 1 else "") if vin_p and vin_p[0][2] else "") \
            if vin_p else "placa"
        otros = vin_o or pla_o
        return "CONFIRMADO", como + (" · también menciona NUCO %s" % ", ".join(otros) if otros else ""), ""
    if vin_o:
        return "OTRA UNIDAD", "VIN de otro NUCO", ", ".join(vin_o)
    if pla_o:
        return "OTRA UNIDAD", "solo la placa de otro NUCO", ", ".join(pla_o)
    return "SIN CONFIRMAR", "", ""


# ---- Leer un archivo (en otro proceso: el OCR es lo caro) ----
#
# Cascada por página (16-oct, medido con documentos reales): el OCR de Windows tarda ~0.3 s y RapidOCR 2–16 s, pero
# RapidOCR encuentra más. Primero Windows; si ya confirma la unidad, listo; si no, RapidOCR. Sin Windows OCR (otra
# máquina), solo RapidOCR.

_rapid = None
_flota = None
VERSION = 3   # sube cuando cambia cómo se lee: lo guardado con otra versión se vuelve a leer


def _iniciar_ocr(vehiculos):
    global _rapid, _flota
    from rapidocr_onnxruntime import RapidOCR
    try:
        # use_cls (la orientación) se queda: sin él no lee una foto de cabeza (ALTA DE PLACAS-0300.jpg, 19-oct)
        _rapid = RapidOCR(intra_op_num_threads=2, inter_op_num_threads=1)
    except TypeError:
        _rapid = RapidOCR()
    _flota = Flota(vehiculos)


def _rapidocr(img):
    r, _ = _rapid(img)
    return "\n".join(x[1] for x in (r or []))


def _windows(img):
    try:
        import asyncio
        import winocr
        r = asyncio.run(winocr.recognize_pil(img, "es"))
        return getattr(r, "text", "") or ""
    except Exception:
        return ""


def ocr_archivo(datos, mime, nuco):
    """OCR página por página (máx. MAX_PAGINAS), en cascada; para en cuanto confirma la unidad de su NUCO."""
    from PIL import Image
    if mime == "application/pdf":
        import pypdfium2 as pdfium
        pdf = pdfium.PdfDocument(datos)
        paginas = len(pdf)
        imagenes = (pdf[i].render(scale=DPI / 72).to_pil() for i in range(min(paginas, MAX_PAGINAS)))
    else:
        img = Image.open(io.BytesIO(datos)).convert("RGB")
        lado = max(img.size)
        if lado > 2600:
            img = img.resize((round(img.width * 2600 / lado), round(img.height * 2600 / lado)))
        paginas, imagenes = 1, iter([img])
    textos, leidas = [], 0
    for img in imagenes:
        leidas += 1
        for nombre, motor in (("WINDOWS", _windows), ("RAPIDOCR", _rapidocr)):
            textos.append(motor(img))
            if veredicto(nuco, _flota.buscar("\n".join(textos)))[0] == "CONFIRMADO":
                return {"metodo": "OCR " + nombre, "texto": "\n".join(textos), "paginas": paginas, "leidas": leidas}
    return {"metodo": "OCR", "texto": "\n".join(textos), "paginas": paginas, "leidas": leidas}


def texto_directo(datos, mime):
    """La capa de texto del PDF o el texto de un XML; None si hay que hacer OCR."""
    if mime == "application/pdf":
        import pypdfium2 as pdfium
        try:
            pdf = pdfium.PdfDocument(datos)
        except Exception:
            return {"metodo": "PDF DAÑADO", "texto": "", "paginas": 0, "leidas": 0}
        n = len(pdf)
        texto = "\n".join(pdf[i].get_textpage().get_text_range() for i in range(min(n, 6)))
        if len(alnum(texto)) >= 40:
            return {"metodo": "TEXTO", "texto": texto, "paginas": n, "leidas": min(n, 6)}
        return None
    if mime in ("text/xml", "application/xml") or mime.startswith("text/"):
        return {"metodo": "TEXTO", "texto": datos.decode("utf-8", "ignore"), "paginas": 1, "leidas": 1}
    if mime.startswith("image/"):
        return None
    return {"metodo": "SIN LECTOR", "texto": "", "paginas": 0, "leidas": 0}


# ---- El recorrido ----

def archivos_de(d, e, nucos_pedidos, anteriores):
    print("NUCOS:")
    nucos = [n for n in e.hijos_de(d, [e.NUCOS])[e.NUCOS] if n["mimeType"] == reglas.CARPETA and n["name"].strip().isdigit()]
    nucos = {str(int(n["name"].strip())): n["id"] for n in nucos}
    if nucos_pedidos:
        nucos = {n: nucos[n] for n in nucos_pedidos if n in nucos}
    print("1.-DOCUMENTACIÓN de cada NUCO:")
    sub = e.hijos_de(d, list(nucos.values()))
    doc = {}
    for n, nid in nucos.items():
        for h in sub[nid]:
            if h["mimeType"] == reglas.CARPETA and reglas.es_documentacion(h["name"]):
                doc[h["id"]] = n
    print("sus carpetas:")
    nivel = e.hijos_de(d, list(doc))
    carpetas = {}   # id → (nuco, ruta)
    for did, hijos in nivel.items():
        for h in hijos:
            if h["mimeType"] == reglas.CARPETA and (anteriores or reglas.normal(h["name"]) != reglas.ANTERIORES):
                carpetas[h["id"]] = (doc[did], h["name"])
    salida = []
    while carpetas:
        print("archivos:")
        por = e.hijos_de(d, list(carpetas))
        siguiente = {}
        for cid, hijos in por.items():
            n, ruta = carpetas[cid]
            for h in hijos:
                if h["mimeType"] == reglas.CARPETA:
                    if anteriores:
                        siguiente[h["id"]] = (n, ruta + "/" + h["name"])
                else:
                    salida.append(dict(h, nuco=n, ruta=ruta))
        carpetas = siguiente
    return salida


def leer_cache():
    hechos = {}
    if TEXTOS.exists():
        for linea in TEXTOS.read_text(encoding="utf-8").splitlines():
            if linea.strip():
                r = json.loads(linea)
                hechos[r["id"]] = r
    return hechos


def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--nucos")
    g.add_argument("--muestra", type=int)
    g.add_argument("--todos", action="store_true")
    ap.add_argument("--procesos", type=int, default=5)
    ap.add_argument("--anteriores", action="store_true")
    args = ap.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")

    import expediente as e
    sys.path.insert(0, str(AQUI.parent / "accesorios"))
    from carga_inicial import leer_hoja, sheets
    CACHE.mkdir(parents=True, exist_ok=True)

    _, vehiculos = leer_hoja(sheets(), LIBRO, "VEHICULOS")
    flota = Flota(vehiculos)
    print("Flota: %d VIN, %d placas" % (len(flota.vin), len(flota.placa)))

    d = e.drive()
    pedidos = None
    if args.nucos:
        pedidos = [str(int(x)) for x in args.nucos.split(",")]
    elif args.muestra:
        import random
        todos = sorted(flota.propios, key=int)
        pedidos = sorted(random.Random(16).sample(todos, min(args.muestra, len(todos))), key=int)
    archivos = archivos_de(d, e, pedidos, args.anteriores)
    print("%d archivos en %d NUCO" % (len(archivos), len({a["nuco"] for a in archivos})))

    hechos = leer_cache()
    candado = threading.Lock()
    local = threading.local()
    procesos = ProcessPoolExecutor(args.procesos, initializer=_iniciar_ocr, initargs=(vehiculos,))
    t0 = time.time()
    contador = [0, 0]

    def bajar(fid):
        from googleapiclient.http import MediaIoBaseDownload
        if not hasattr(local, "d"):
            local.d = e.drive()
        for intento in range(5):
            try:
                buf = io.BytesIO()
                dl = MediaIoBaseDownload(buf, local.d.files().get_media(fileId=fid))
                listo = False
                while not listo:
                    _, listo = dl.next_chunk()
                return buf.getvalue()
            except Exception as ex:  # red o cuota: reintenta
                print("  (bajar %s: %s; reintento %d)" % (fid, type(ex).__name__, intento + 1), flush=True)
                time.sleep(4 * (intento + 1))
        raise RuntimeError("no se pudo bajar " + fid)

    def uno(a):
        previo = hechos.get(a["id"])
        if previo and previo.get("v") == VERSION and previo.get("md5") == a.get("md5Checksum") \
                and previo.get("modificado") == a.get("modifiedTime"):
            return previo
        inicio = time.time()
        r = {"metodo": "NO SE REVISA", "texto": "", "paginas": 0, "leidas": 0}
        if not (reglas.es_relleno(a["name"]) or "NO APLICA" in reglas.normal(a["name"])):
            mime = a["mimeType"]
            if mime.startswith("application/vnd.google-apps"):
                r = {"metodo": "SIN LECTOR", "texto": "", "paginas": 0, "leidas": 0}
            else:
                datos = bajar(a["id"])
                r = texto_directo(datos, mime)
                # Un PDF con texto que no trae ningún VIN ni placa suele ser un escaneo sobre el formato impreso
                # (la responsiva): el texto es del formato y lo llenado está en la imagen → también OCR
                capa = r if r and r["metodo"] == "TEXTO" and mime == "application/pdf" and not flota.buscar(r["texto"]) else None
                if r is None or capa:
                    try:
                        r = procesos.submit(ocr_archivo, datos, mime, a["nuco"]).result()
                        if capa:
                            r["metodo"], r["texto"] = "TEXTO + " + r["metodo"], capa["texto"] + "\n" + r["texto"]
                    except Exception as ex:
                        r = {"metodo": "ERROR", "texto": "", "paginas": 0, "leidas": 0, "error": str(ex)[:200]}
        r.update(id=a["id"], v=VERSION, md5=a.get("md5Checksum"), modificado=a.get("modifiedTime"),
                 segundos=round(time.time() - inicio, 1))
        if r["metodo"] == "ERROR":   # no se guarda: la siguiente corrida lo vuelve a intentar
            return r
        with candado:
            with TEXTOS.open("a", encoding="utf-8") as f:
                f.write(json.dumps(r, ensure_ascii=False) + "\n")
        return r

    resultados = {}
    with ThreadPoolExecutor(args.procesos + 3) as hilos:
        futuros = {hilos.submit(uno, a): a for a in archivos}
        for fut in as_completed(futuros):
            a = futuros[fut]
            try:
                resultados[a["id"]] = fut.result()
            except Exception as ex:
                resultados[a["id"]] = {"metodo": "ERROR", "texto": "", "error": str(ex)[:200], "segundos": 0}
            contador[0] += 1
            if "OCR" in resultados[a["id"]]["metodo"]:
                contador[1] += 1
            if contador[0] % 25 == 0 or contador[0] == len(archivos):
                print("[%d/%d] %d con OCR · %.0f s" % (contador[0], len(archivos), contador[1], time.time() - t0), flush=True)
    procesos.shutdown()

    renglones = []
    for a in archivos:
        r = resultados[a["id"]]
        if r["metodo"] in ("NO SE REVISA", "SIN LECTOR", "PDF DAÑADO", "ERROR"):
            v, como, cual = ("NO SE REVISA" if r["metodo"] == "NO SE REVISA" else "SIN CONFIRMAR"), r["metodo"].lower(), ""
        else:
            v, como, cual = veredicto(a["nuco"], flota.buscar(r["texto"]))
            if v == "SIN CONFIRMAR":
                como = "sin texto legible" if len(alnum(r["texto"])) < 40 else "no se encontró su VIN ni su placa"
            if a["nuco"] not in flota.propios:
                como += " · el NUCO no tiene serie ni placa en VEHICULOS"
        renglones.append({"NUCO": int(a["nuco"]), "CARPETA": a["ruta"], "ARCHIVO": a["name"], "VEREDICTO": v,
                          "CÓMO": como, "NUCO QUE DICE": cual, "LECTURA": r["metodo"], "PÁGINAS": r.get("paginas", 0),
                          "SEGUNDOS": r.get("segundos", 0), "LIGA": "https://drive.google.com/file/d/%s/view" % a["id"]})
    renglones.sort(key=lambda x: (x["NUCO"], x["CARPETA"], x["ARCHIVO"]))
    destino = CACHE / datetime.now().strftime("%Y%m%d-%H%M%S")
    destino.mkdir(parents=True)
    excel(destino / "revision.xlsx", renglones)
    resumen(renglones, time.time() - t0)
    print("Excel:", destino / "revision.xlsx")


def resumen(renglones, segundos):
    from collections import Counter
    c = Counter(r["VEREDICTO"] for r in renglones)
    print("\n== %d archivos en %.0f s" % (len(renglones), segundos))
    for v in ("CONFIRMADO", "OTRA UNIDAD", "SIN CONFIRMAR", "NO SE REVISA"):
        print("  %-14s %d" % (v, c[v]))
    por = Counter((r["CARPETA"], r["VEREDICTO"]) for r in renglones)
    print("\n  por carpeta (confirmado / otra / sin confirmar):")
    for carpeta in sorted({r["CARPETA"] for r in renglones}):
        print("    %-30s %4d %4d %4d" % (carpeta[:30], por[(carpeta, "CONFIRMADO")], por[(carpeta, "OTRA UNIDAD")], por[(carpeta, "SIN CONFIRMAR")]))
    for r in renglones:
        if r["VEREDICTO"] == "OTRA UNIDAD":
            print("  OTRA UNIDAD: NUCO %s %s/%s → NUCO %s (%s)" % (r["NUCO"], r["CARPETA"], r["ARCHIVO"], r["NUCO QUE DICE"], r["CÓMO"]))


def excel(ruta, renglones):
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill
    colores = {"CONFIRMADO": "D9EAD3", "OTRA UNIDAD": "F4CCCC", "SIN CONFIRMAR": "FFF2CC"}
    wb = Workbook()
    ws = wb.active
    ws.title = "Por archivo"
    columnas = list(renglones[0]) if renglones else ["NUCO"]
    ws.append(columnas)
    for c in ws[1]:
        c.font = Font(bold=True)
    for r in renglones:
        ws.append([r[k] for k in columnas])
        fila = ws.max_row
        liga = ws.cell(fila, columnas.index("LIGA") + 1)
        liga.hyperlink, liga.value, liga.font = r["LIGA"], "abrir", Font(color="1155CC", underline="single")
        if r["VEREDICTO"] in colores:
            ws.cell(fila, columnas.index("VEREDICTO") + 1).fill = PatternFill("solid", fgColor=colores[r["VEREDICTO"]])
    ws.freeze_panes = "A2"
    ws.auto_filter.ref = ws.dimensions
    for letra, ancho in zip("ABCDEFGHIJ", (7, 26, 44, 15, 40, 14, 12, 9, 10, 8)):
        ws.column_dimensions[letra].width = ancho
    wb.save(ruta)


if __name__ == "__main__":
    main()
