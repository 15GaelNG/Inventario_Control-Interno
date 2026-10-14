"""Lo que quedó en ControlVehicular/VERIFICACIONES_Images después de la corrida 2 bis: a NUCOS VEHICULOS (usuario,
14-oct-2026: "nada ya en donde estaba antes").

    verif_sueltos.py plan          SOLO LECTURA → .cache/verificaciones/sueltos.json y sueltos.xlsx
    verif_sueltos.py aplicar       EN LA REAL. Bitácora .cache/bitacoras/<fecha>-verif-sueltos.jsonl (+ Drive)
    verif_sueltos.py verificar <bitácora>
    verif_sueltos.py deshacer <bitácora>

Cada archivo, según lo que se sabe de él (nunca por folio):
  - Su prefijo es el ID de AppSheet (ID ANTERIOR) de un registro cuya celda ya tiene liga: es una versión anterior del
    comprobante → DUPLICADOS junto al archivo que abre ese registro.
  - Lo cita un registro (la duda con dos archivos del mismo nombre) → _POR REVISAR del NUCO de ese registro; la celda
    apunta al más reciente.
  - Sin registro, y la serie (exacta o con errores de OCR, un solo vehículo) o la placa dicen el NUCO →
    <NUCO>/3.-VERIFICACIONES/_POR REVISAR/SIN REGISTRO. Sin fecha confiable: no va a un semestre.
  - Lo demás → NUCOS VEHICULOS/_POR REVISAR/VERIFICACIONES SIN NUCO.
Se conserva el nombre original (con (2) si ya existe).
"""
import sys, json, re, time, collections
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import expediente as e, reglas
import inspecciones_app as ia
import verificaciones as v
from religar_verif import hojas, leer, letra, num

IMAGENES = "1iGrxuqmUKKUV9UFIjEOSJ0TEibab3K7C"
HOJA, COL = "VERIFICACIONES", "COMPROBANTE VERIFICACION"
C = e.CACHE / "verificaciones"
PLAN = C / "sueltos.json"
N = reglas.normal


def plan():
    d = e.drive()
    h = hojas()
    enc, ver = leer(h, HOJA)
    _, veh = leer(h, "VEHICULOS")
    fs = [f for f in ia.listar(d, IMAGENES) if f["mimeType"] != ia.CARP]
    ocr = json.load(open(C / "ocr-app.json", encoding="utf-8"))
    nds, por_placa = collections.defaultdict(set), collections.defaultdict(set)
    for x in veh.values():
        sr = re.sub(r"[^A-Z0-9]", "", N(x.get("SERIE VEHICULO", "")))
        pl = re.sub(r"[^A-Z0-9]", "", N(x.get("PLACA", "")))
        if num(x.get("NUCCO")):
            if len(sr) == 17:
                nds[sr].add(num(x["NUCCO"]))
            if len(pl) >= 6:
                por_placa[pl].add(num(x["NUCCO"]))
    por_anterior = {r.get("ID ANTERIOR", "").strip(): (n, r) for n, r in ver.items() if r.get("ID ANTERIOR")}
    cita = collections.defaultdict(list)
    for n, r in ver.items():
        if r.get(COL, "").startswith("VERIFICACIONES_Images/"):
            cita[r[COL].split("/", 1)[1]].append((n, r))
    raiz_nuco = {}
    for x in ia.listar(d, e.NUCOS):
        if x["mimeType"] == ia.CARP and num(x["name"]) and x["name"].strip().isdigit():
            raiz_nuco[num(x["name"])] = x["id"]
    ops, k = [], collections.Counter()
    for f in sorted(fs, key=lambda f: f["name"]):
        t = (ocr.get(f["id"]) or {}).get("texto", "")
        base = dict(archivo=f["id"], de_padre=(f.get("parents") or [""])[0], de_nombre=f["name"], modificado=f.get("modifiedTime", ""))
        if not (f.get("capabilities") or {}).get("canMoveItemWithinDrive"):
            ops.append(dict(base, destino="", tipo="NO SE PUEDE MOVER", motivo="la cuenta no puede moverlo")); k["no se puede mover"] += 1; continue
        if f["name"] in cita:
            (n, r), = cita[f["name"]] if len(cita[f["name"]]) == 1 else [(None, None)]
            if r is None:
                ops.append(dict(base, destino="", tipo="NO SE TOCA", motivo="lo citan varios registros")); continue
            ops.append(dict(base, tipo="DUDA", nuco=num(r.get("NUCCO")), ruta=[num(r.get("NUCCO")), "3.-VERIFICACIONES", v.POR_REVISAR],
                            registro=r["ID"], fila=n, celda_antes=r[COL], motivo="la duda %s (dos archivos con el mismo nombre)" % r["ID"]))
            k["duda"] += 1; continue
        pre = f["name"][:8]
        if pre in por_anterior and por_anterior[pre][1].get(COL, "").startswith("http"):
            n, r = por_anterior[pre]
            bueno = re.search(r"/d/([^/?]+)", r[COL]).group(1)
            padre = (e.llamar(d.files().get(fileId=bueno, fields="parents", supportsAllDrives=True)).get("parents") or [""])[0]
            ops.append(dict(base, tipo="VERSIÓN ANTERIOR", nuco=num(r.get("NUCCO")), padre_id=padre, sub="DUPLICADOS", registro=r["ID"],
                            motivo="versión anterior del comprobante de %s (su prefijo es su ID de AppSheet)" % r["ID"]))
            k["versión anterior"] += 1; continue
        sn = v.nucos_por_serie(t, nds) if t else set()
        if not sn and t:
            sn = {n_ for s in v.series_aprox(t, list(nds)) for n_ in nds[s]}
        sp = {n_ for p in v.placas_aprox(t, list(por_placa)) for n_ in por_placa[p]} if t else set()
        nucos = sn or sp
        if len(nucos) == 1 and not (sn and sp and sn != sp) and next(iter(nucos)) in raiz_nuco:
            nuco = next(iter(nucos))
            ops.append(dict(base, tipo="SIN REGISTRO", nuco=nuco, ruta=[nuco, "3.-VERIFICACIONES", v.POR_REVISAR, "SIN REGISTRO"],
                            motivo="ningún registro lo cita; la %s dice NUCO %s" % ("serie" if sn else "placa", nuco)))
            k["sin registro, con NUCO"] += 1; continue
        ops.append(dict(base, tipo="SIN NUCO", nuco="", ruta=["_POR REVISAR", "VERIFICACIONES SIN NUCO"],
                        motivo="ningún registro lo cita y no se lee el vehículo" + (" (serie %s / placa %s)" % (sorted(sn), sorted(sp)) if sn or sp else "")))
        k["sin NUCO"] += 1
    # La duda con dos archivos: la celda apunta al más reciente
    duda = [o for o in ops if o["tipo"] == "DUDA"]
    if duda:
        duda.sort(key=lambda o: o["modificado"], reverse=True)
        duda[0]["celda_nueva"] = ia.liga(duda[0]["archivo"])
    json.dump(dict(letra=letra(enc.index(COL)), ops=ops), open(PLAN, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    from openpyxl import Workbook
    wb = Workbook(); ws = wb.active; ws.title = "Sueltos"
    ws.append(["Archivo", "Qué es", "NUCO", "Va a", "Por qué", "Abrir"])
    for o in ops:
        ws.append([o["de_nombre"], o["tipo"], o.get("nuco", ""), "/".join(o.get("ruta") or [o.get("nuco", ""), "…", o.get("sub", "")]), o["motivo"],
                   "https://drive.google.com/file/d/%s/view" % o["archivo"]])
    wb.save(C / "sueltos.xlsx")
    print(len(fs), "archivos |", dict(k))


def aplicar():
    d = e.drive()
    h = hojas()
    p = json.load(open(PLAN, encoding="utf-8"))
    bit = e.Bitacora(e.CACHE / "bitacoras" / (time.strftime("%Y%m%d-%H%M%S") + "-verif-sueltos.jsonl"))
    k = collections.Counter()
    carpetas = {}

    def carpeta(padre, nombre, nuco):
        if (padre, nombre) in carpetas:
            return carpetas[(padre, nombre)]
        ya = e.llamar(d.files().list(q="'%s' in parents and name = '%s' and mimeType = '%s' and trashed = false" % (padre, nombre, ia.CARP),
                                     fields="files(id)", supportsAllDrives=True, includeItemsFromAllDrives=True))["files"]
        if len(ya) > 1:
            raise RuntimeError("hay %d carpetas %r" % (len(ya), nombre))
        if ya:
            i = ya[0]["id"]
        else:
            i = e.llamar(d.files().create(body={"name": nombre, "mimeType": ia.CARP, "parents": [padre]}, fields="id", supportsAllDrives=True))["id"]
            bit.anotar(accion="crear_carpeta", nuco=nuco, id=i, padre=padre, nombre=nombre)
            k["carpetas creadas"] += 1
        carpetas[(padre, nombre)] = i
        return i

    raiz_nuco = {num(x["name"]): x["id"] for x in ia.listar(d, e.NUCOS) if x["mimeType"] == ia.CARP and x["name"].strip().isdigit()}
    for o in p["ops"]:
        if not o.get("ruta") and not o.get("padre_id"):
            continue
        f = e.llamar(d.files().get(fileId=o["archivo"], fields="name,parents,trashed", supportsAllDrives=True))
        if f.get("trashed") or (f.get("parents") or [""])[0] != o["de_padre"] or f["name"] != o["de_nombre"]:
            bit.anotar(accion="saltado", nuco=o.get("nuco", ""), id=o["archivo"], motivo="ya no está donde lo vio el plan"); k["saltados"] += 1; continue
        if o.get("padre_id"):
            destino = carpeta(o["padre_id"], o["sub"], o["nuco"])
        else:
            ruta = o["ruta"]
            if ruta[0] == "_POR REVISAR":
                destino = e.NUCOS
            else:
                destino = raiz_nuco[ruta[0]]
                ruta = ruta[1:]
                # 3.-VERIFICACIONES: la que ya existe (por su nombre normalizado)
                vs = [x for x in ia.listar(d, destino) if x["mimeType"] == ia.CARP and "VERIFIC" in re.sub(r"[^A-Z]", "", N(x["name"]))]
                if len(vs) != 1:
                    bit.anotar(accion="saltado", nuco=o["nuco"], id=o["archivo"], motivo="%d carpetas de verificaciones" % len(vs)); k["saltados"] += 1; continue
                destino, ruta = vs[0]["id"], ruta[1:]
            for nombre in ruta:
                destino = carpeta(destino, nombre, o.get("nuco", ""))
        nombre, i = o["de_nombre"], 2
        tomados = {x["name"] for x in ia.listar(d, destino)}
        while nombre in tomados:
            nombre, i = "%s (%d)%s" % (Path(o["de_nombre"]).stem, i, Path(o["de_nombre"]).suffix), i + 1
        e.llamar(d.files().update(fileId=o["archivo"], addParents=destino, removeParents=o["de_padre"], fields="id", supportsAllDrives=True,
                                  body={"name": nombre, "appProperties": {"origen_padre": o["de_padre"], "origen_nombre": o["de_nombre"]}}))
        bit.anotar(accion="mover", nuco=o.get("nuco", ""), id=o["archivo"], de_padre=o["de_padre"], de_nombre=o["de_nombre"], a_padre=destino,
                   a_nombre=nombre, app=True)
        k["movidos"] += 1
        if o.get("celda_nueva"):
            _, ver = leer(h, HOJA)
            r = ver.get(o["fila"], {})
            if r.get("ID") == o["registro"] and r.get(COL) == o["celda_antes"]:
                e.llamar(h.values().update(spreadsheetId=e.LIBRO, range="'%s'!%s%d" % (HOJA, p["letra"], o["fila"]), valueInputOption="RAW",
                                           body={"values": [[o["celda_nueva"]]]}))
                bit.anotar(accion="celda", nuco=o["nuco"], hoja=HOJA, fila=o["fila"], letra=p["letra"], id_registro=o["registro"],
                           antes=o["celda_antes"], despues=o["celda_nueva"])
                k["celdas"] += 1
    print(dict(k))
    if bit.ruta.exists():
        e.respaldar_bitacora(bit.ruta)
        print("bitácora:", bit.ruta)


def verificar(ruta):
    d = e.drive()
    _, ver = leer(hojas(), HOJA)
    k = collections.Counter()
    for x in (json.loads(l) for l in open(ruta, encoding="utf-8") if l.strip()):
        if x["accion"] == "mover":
            f = e.llamar(d.files().get(fileId=x["id"], fields="name,parents,trashed", supportsAllDrives=True))
            k["archivo en su lugar" if not f.get("trashed") and (f.get("parents") or [""])[0] == x["a_padre"] and f["name"] == x["a_nombre"] else "DISTINTO"] += 1
        elif x["accion"] == "celda":
            k["celda OK" if ver.get(x["fila"], {}).get(COL) == x["despues"] else "CELDA DISTINTA"] += 1
    print(dict(k))
    print("quedan en VERIFICACIONES_Images:", sum(1 for f in ia.listar(d, IMAGENES) if f["mimeType"] != ia.CARP))


def deshacer(ruta):
    h = hojas()
    _, ver = leer(h, HOJA)
    for x in (json.loads(l) for l in open(ruta, encoding="utf-8") if l.strip()):
        if x["accion"] == "celda" and ver.get(x["fila"], {}).get(COL) == x["despues"]:
            e.llamar(h.values().update(spreadsheetId=e.LIBRO, range="'%s'!%s%d" % (HOJA, x["letra"], x["fila"]), valueInputOption="RAW",
                                       body={"values": [[x["antes"]]]}))
    e.deshacer(ruta)


if __name__ == "__main__":
    a = sys.argv[1:]
    {"plan": plan, "aplicar": aplicar, "verificar": lambda: verificar(a[1]), "deshacer": lambda: deshacer(a[1])}.get(
        a[0] if a else "", lambda: print(__doc__))()
