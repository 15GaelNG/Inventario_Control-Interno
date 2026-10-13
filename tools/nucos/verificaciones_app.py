"""Comprobantes de verificación de la APP al expediente del NUCO (Fase 3, corrida 2).

    verificaciones_app.py plan <foto.json> <salida>         SOLO LECTURA → <salida>.json y <salida>.xlsx
    verificaciones_app.py aplicar <plan.json> --nucos …      EN LA REAL (o --todos). Bitácora <fecha>-verif-app.jsonl
    verificaciones_app.py verificar <bitácora> <plan.json>   Solo lectura
    verificaciones_app.py deshacer <bitácora> [--nucos …]    Regresa celdas y archivos

<foto.json>: `foto.py <salida> VERIFIC` (el árbol de 3.-VERIFICACIONES de cada NUCO, con md5), tomada justo antes.

Cada registro de la hoja VERIFICACIONES con su comprobante en VERIFICACIONES_Images:
  - Solo se lleva al NUCO si el CERTIFICADO lo confirma: la serie (NIV) que lee el OCR es la del vehículo de ese NUCO
    (exacta, o una letra mal leída si solo hay un candidato: verificaciones.nucos_por_serie). En la app hubo 152
    registros ligados a otro vehículo (docs/nucos-verificaciones.md): sin esta revisión, su comprobante caería en el NUCO
    equivocado. Serie de otro vehículo, ilegible o ambigua → Revisar, no se toca.
  - Si la fecha del certificado se leyó y no es la capturada → Revisar. Sin fecha legible se usa la capturada (aviso).
  - Si el área ya tiene ese mismo archivo (md5) en el NUCO: LIGA (la celda apunta a esa copia; el original se queda).
  - Si no: MOVER → <NUCO>/3.-VERIFICACIONES/<año>/<1ER|2DO> SEMESTRE/VERIFICACION-<NUCO> <fecha>[ DOBLE CERO][ RECHAZO].ext
    (el nombre de la homologación del 12-oct; (2), (3)… si ya existe). La celda guarda su liga.
Aplicar, verificar y deshacer son los de inspecciones_app.py (misma bitácora, mismas revisiones antes de tocar).
"""
import sys, json, re, collections
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import expediente as e, reglas
import inspecciones_app as ia
import verificaciones as v
from autorizar import credenciales
from googleapiclient.discovery import build

HOJA = "VERIFICACIONES"
COL_ID = "ID"
COL_NUCO = "NUCCO"
COL = "COMPROBANTE VERIFICACION"
IMAGENES = "1iGrxuqmUKKUV9UFIjEOSJ0TEibab3K7C"     # VERIFICACIONES_Images (prod, DRIVE_FOLDER_ID_VERIFICACIONES)
RAIZ_VER = "3.-VERIFICACIONES"
OCR_APP = e.CACHE / "verificaciones" / "ocr-app.json"
N = reglas.normal

# Las funciones de aplicar / verificar / deshacer de inspecciones_app trabajan con esta hoja
ia.HOJA, ia.COL_ID, ia.COL_NUCO, ia.ETIQUETA = HOJA, COL_ID, COL_NUCO, "verif-app"


def semestre(mes):
    return "1ER SEMESTRE" if mes <= 6 else "2DO SEMESTRE"


def plan(foto_json, salida):
    d = e.drive()
    s = build("sheets", "v4", credentials=credenciales("lab"), cache_discovery=False).spreadsheets()
    val = e.llamar(s.values().get(spreadsheetId=e.LIBRO, range="'%s'!A1:ZZ100000" % HOJA))["values"]
    H = [x.strip() for x in val[0]]
    filas = []
    for n, r in enumerate(val[1:], start=2):
        r = r + [""] * (len(H) - len(r))
        if any(str(x).strip() for x in r):
            filas.append(dict(fila=n, **{c: r[H.index(c)].strip() for c in [COL_ID, COL_NUCO, "ID VEHICULO", "FECHA VERIFICACION", COL]}))
    celda = lambda fila: "%s%d" % (ia.letra(H.index(COL)), fila)

    # Vehículos: NUCO y serie (nunca el folio)
    vv = e.llamar(s.values().get(spreadsheetId=e.LIBRO, range="'VEHICULOS'!A1:ZZ100000"))["values"]
    VH = vv[0]
    veh = [dict(zip(VH, r + [""] * (len(VH) - len(r)))) for r in vv[1:] if any(r)]
    num = lambda x: str(int(re.match(r"\s*(\d+)", x).group(1))) if re.match(r"\s*(\d+)", x or "") else ""
    nuco_de_id = {x["ID"]: num(x.get("NUCCO")) for x in veh}
    nucos_de_serie = collections.defaultdict(set)
    for x in veh:
        sr = re.sub(r"[^A-Z0-9]", "", N(x.get("SERIE VEHICULO", "")))
        if len(sr) == 17 and num(x.get("NUCCO")):
            nucos_de_serie[sr].add(num(x.get("NUCCO")))

    # Origen: VERIFICACIONES_Images, con dueño y permisos
    img = collections.defaultdict(list)
    for f in ia.listar(d, IMAGENES):
        if f["mimeType"] != ia.CARP:
            img[f["name"]].append(f)
    ocr = json.loads(OCR_APP.read_text(encoding="utf-8"))
    # El OCR de los archivos del área en 3.-VERIFICACIONES (12-oct; mover conserva el ID, así que sigue sirviendo)
    ocr_area = json.loads((e.CACHE / "verificaciones" / "ocr.json").read_text(encoding="utf-8"))
    folios = lambda t: set(re.findall(r"(?<!\d)(2\d\d{8})(?!\d)", t or ""))

    # La foto de 3.-VERIFICACIONES de cada NUCO
    foto = json.loads(Path(foto_json).read_text(encoding="utf-8"))
    nucos = {x["name"].strip(): x for x in foto["nucos"]}
    raices = collections.defaultdict(list)
    for r in foto["raices"]:
        raices[r["nuco"].strip()].append(r)
    hijos = collections.defaultdict(list)
    por_id = {}
    for x in foto["carpetas"]:
        hijos[x["padre"]].append(dict(x, carpeta=True))
        por_id[x["id"]] = x
    por_md5 = collections.defaultdict(list)
    for x in foto["archivos"]:
        hijos[x["padre"]].append(dict(x, carpeta=False))
        if x.get("md5"):
            por_md5[(x["nuco"].strip(), x["md5"])].append(x)

    nuevas, tomados_ = {}, {}

    def tomados(c):
        if c not in tomados_:
            tomados_[c] = set() if c.startswith("nueva:") else {x["name"] for x in hijos.get(c, [])}
        return tomados_[c]

    def ruta_de(c):
        if c.startswith("nueva:"):
            padre, nombre = next(k for k, val_ in nuevas.items() if val_ == c)
            return ruta_de(padre) + "/" + nombre
        if c in por_id:
            return "/".join([por_id[c]["nuco"]] + por_id[c]["ruta"])
        for rs in raices.values():
            for r in rs:
                if r["id"] == c:
                    return r["nuco"] + "/" + r["name"]
        return c

    def subcarpeta(padre, nombre):
        if not padre.startswith("nueva:"):
            dentro = [x for x in hijos.get(padre, []) if x["carpeta"]]
            exacta = [x for x in dentro if x["name"] == nombre]
            if len(exacta) == 1:
                return exacta[0]["id"], ""
            parecidas = [x for x in dentro if ia.clave(x["name"]) == ia.clave(nombre)]
            if len(parecidas) == 1:
                return parecidas[0]["id"], ""
            if exacta or parecidas:
                return None, "hay %d carpetas %r en %s" % (len(exacta) + len(parecidas), nombre, ruta_de(padre))
        k = (padre, nombre)
        if k not in nuevas:
            nuevas[k] = "nueva:%d" % len(nuevas)
        return nuevas[k], ""

    def nombre_libre(c, base, ext):
        ya = tomados(c)
        nombre, i = base + ext, 2
        while nombre in ya:
            nombre, i = "%s (%d)%s" % (base, i, ext), i + 1
        ya.add(nombre)
        return nombre

    usados = collections.Counter(f[COL] for f in filas if f[COL] and not f[COL].startswith("http"))
    ops, revisar = [], []

    def a_revisar(f, motivo, extra=None):
        revisar.append(dict(fila=f["fila"], id=f[COL_ID], nuco=f[COL_NUCO], fecha=f["FECHA VERIFICACION"], columna=COL,
                            celda=celda(f["fila"]), valor=f[COL], motivo=motivo, **(extra or {})))

    for f in filas:
        val_ = f[COL]
        if not val_ or val_.startswith("http"):
            continue
        if not val_.startswith("VERIFICACIONES_Images/"):
            a_revisar(f, "la celda no trae una ruta de VERIFICACIONES_Images: %r" % val_[:60]); continue
        if not f[COL_ID]:
            a_revisar(f, "registro sin ID"); continue
        if usados[val_] > 1:
            a_revisar(f, "ese comprobante lo citan %d registros" % usados[val_]); continue
        nuco = num(f[COL_NUCO])
        if not nuco or nuco not in nucos:
            a_revisar(f, "NUCCO %r sin carpeta en NUCOS VEHICULOS" % f[COL_NUCO]); continue
        if nuco_de_id.get(f["ID VEHICULO"]) != nuco:
            a_revisar(f, "el NUCCO de la hoja (%s) no es el de su ID VEHICULO (%s)" % (nuco, nuco_de_id.get(f["ID VEHICULO"]))); continue
        m = img.get(val_.split("/", 1)[1], [])
        if len(m) != 1:
            a_revisar(f, "%d archivos con ese nombre en VERIFICACIONES_Images" % len(m)); continue
        src = m[0]
        texto = (ocr.get(src["id"]) or {}).get("texto", "")
        if not texto:
            a_revisar(f, "el comprobante no se leyó con OCR"); continue
        # ¿El certificado es de este vehículo?
        de_serie = v.nucos_por_serie(texto, nucos_de_serie)
        if not de_serie:
            a_revisar(f, "no se lee la serie (NIV) del certificado: no se puede confirmar el vehículo"); continue
        if de_serie != {nuco}:
            a_revisar(f, "la serie del certificado es del NUCO %s, no del %s" % (", ".join(sorted(de_serie, key=int)), nuco),
                      dict(nuco_serie=",".join(sorted(de_serie, key=int)))); continue
        cert = v.lee_certificado(texto)
        fh = re.match(r"\s*(\d{1,2})/(\d{1,2})/(\d{4})", f["FECHA VERIFICACION"])
        if not fh:
            a_revisar(f, "fecha capturada ilegible: %r" % f["FECHA VERIFICACION"]); continue
        fecha = (int(fh.group(3)), int(fh.group(2)), int(fh.group(1)))
        aviso = []
        if cert["fecha"]:
            fc = tuple(int(x) for x in cert["fecha"].split("-"))
            if fc != fecha:
                a_revisar(f, "la fecha del certificado (%s) no es la capturada (%04d-%02d-%02d)" % (cert["fecha"], *fecha)); continue
        else:
            aviso.append("el certificado no trae fecha legible: se usa la capturada")
        if not (src.get("capabilities") or {}).get("canMoveItemWithinDrive"):
            a_revisar(f, "la cuenta no puede mover el comprobante (dueño %s)" % ",".join(o.get("emailAddress", "?") for o in src.get("owners", []))); continue
        rs = raices.get(nuco, [])
        if len(rs) != 1:
            a_revisar(f, "el NUCO tiene %d carpetas de verificaciones" % len(rs)); continue
        copias = por_md5.get((nuco, src.get("md5Checksum")), []) if src.get("md5Checksum") else []
        if copias:
            x = sorted(copias, key=lambda z: len(z["ruta"]))[0]
            if len(copias) > 1:
                aviso.append("%d copias iguales en el NUCO; se usa %s" % (len(copias), "/".join(x["ruta"])))
            ops.append(dict(fila=f["fila"], id=f[COL_ID], nuco=nuco, fecha=f["FECHA VERIFICACION"], columna=COL, celda=celda(f["fila"]),
                            accion="LIGA", valor_antes=val_, archivo=x["id"], origen=val_, destino="/".join([nuco] + x["ruta"]),
                            valor_nuevo=ia.liga(x["id"]), aviso="; ".join(aviso)))
            continue
        anio_c, err = subcarpeta(rs[0]["id"], str(fecha[0]))
        sem_c, err2 = subcarpeta(anio_c, semestre(fecha[1])) if anio_c else (None, err)
        if not sem_c:
            a_revisar(f, err2 or err); continue
        base = "VERIFICACION-%04d %04d-%02d-%02d" % (int(nuco), *fecha)
        if cert["doble_cero"]:
            base += " DOBLE CERO"
        if cert["motivo"] == "RECHAZO":
            base += " RECHAZO"
            aviso.append("el certificado es de RECHAZO (capturado como verificación)")
        ext = Path(src["name"]).suffix.lower() or ".png"
        dia = "VERIFICACION-%04d %04d-%02d-%02d" % (int(nuco), *fecha)
        del_area = [x for x in hijos.get(sem_c, []) if not x["carpeta"] and x["name"].startswith(dia)] if not sem_c.startswith("nueva:") else []
        if del_area:
            # El área ya subió un comprobante ese día (otra foto u otro escaneo): el FOLIO del certificado (10 dígitos,
            # único) dice si es el mismo. Mismo folio → la celda apunta al del área (sin duplicar). Otro folio → los dos.
            # Sin folio legible → no se decide.
            fa = folios(texto)
            iguales = [x for x in del_area if fa & folios((ocr_area.get(x["id"]) or {}).get("texto"))]
            sin_folio = [x for x in del_area if not folios((ocr_area.get(x["id"]) or {}).get("texto"))]
            if fa and iguales:
                x = iguales[0]
                ops.append(dict(fila=f["fila"], id=f[COL_ID], nuco=nuco, fecha=f["FECHA VERIFICACION"], columna=COL, celda=celda(f["fila"]),
                                accion="LIGA", valor_antes=val_, archivo=x["id"], origen=val_, destino="/".join([nuco] + x["ruta"]),
                                valor_nuevo=ia.liga(x["id"]), aviso="; ".join(aviso + ["mismo certificado (folio %s) que subió el área: se liga a ese" % sorted(fa)[0]])))
                continue
            if not fa or sin_folio:
                a_revisar(f, "el área ya tiene un comprobante de ese día y no se puede comparar el folio del certificado"); continue
            aviso.append("el área tiene otro certificado de ese día (otro folio): quedan los dos")
        nombre = nombre_libre(sem_c, base, ext)
        ops.append(dict(fila=f["fila"], id=f[COL_ID], nuco=nuco, fecha=f["FECHA VERIFICACION"], columna=COL, celda=celda(f["fila"]),
                        accion="MOVER", valor_antes=val_, archivo=src["id"], de_padre=(src.get("parents") or [""])[0], de_nombre=src["name"],
                        a_padre=sem_c, a_nombre=nombre, origen=val_, destino=ruta_de(sem_c) + "/" + nombre,
                        valor_nuevo=ia.liga(src["id"]), aviso="; ".join(aviso)))

    crear = [dict(clave=val_, padre=k[0], nombre=k[1], ruta=ruta_de(val_)) for k, val_ in sorted(nuevas.items(), key=lambda kv: int(kv[1].split(":")[1]))]
    mov = [o for o in ops if o["accion"] == "MOVER"]
    assert len({o["archivo"] for o in mov}) == len(mov), "un archivo se movería dos veces"
    assert len({(o["a_padre"], o["a_nombre"]) for o in mov}) == len(mov), "dos archivos al mismo nombre"
    assert len({o["celda"] for o in ops}) == len(ops), "una celda se cambiaría dos veces"
    out = dict(hoja=HOJA, libro=e.LIBRO, foto=str(foto_json), crear=crear, ops=ops, revisar=revisar)
    Path(salida + ".json").write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    excel(out, salida + ".xlsx", len(filas))
    print("registros:", len(filas), "| operaciones:", dict(collections.Counter(o["accion"] for o in ops)), "| carpetas a crear:", len(crear),
          "| a revisar:", len(revisar), "| con aviso:", sum(1 for o in ops if o["aviso"]))


def excel(p, archivo, registros):
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment
    wb = Workbook()
    r = wb.active
    r.title = "Resumen"
    c = collections.Counter(o["accion"] for o in p["ops"])
    mot = collections.Counter(x["motivo"].split(" (")[0].split(":")[0][:70] for x in p["revisar"])
    for fila in [("Ensayo: comprobantes de verificación de la app → expediente del NUCO (Fase 3, corrida 2)", ""),
                 ("Solo lectura: no se movió nada ni se cambió ninguna celda.", ""), ("", ""),
                 ("Registros de la hoja", registros),
                 ("Solo cambia la liga (el área ya tenía ese archivo en el NUCO)", c["LIGA"]),
                 ("Se mueven de VERIFICACIONES_Images al NUCO", c["MOVER"]),
                 ("Carpetas a crear", len(p["crear"])), ("Con aviso", sum(1 for o in p["ops"] if o["aviso"])),
                 ("A revisar (no se tocan)", len(p["revisar"])), ("", "")] + [("   " + k, n) for k, n in mot.most_common()]:
        r.append(list(fila))
    r["A1"].font = Font(name="Arial", bold=True, size=13)
    r.column_dimensions["A"].width = 80

    def hoja(titulo, cols, datos, color):
        h = wb.create_sheet(titulo)
        h.append([t for t, _ in cols])
        for x in datos:
            h.append([x.get(k, "") for _, k in cols])
            for cel in h[h.max_row]:
                cel.font = Font(name="Arial", size=10)
                cel.fill = PatternFill("solid", fgColor=color(x))
        for cel in h[1]:
            cel.font = Font(name="Arial", bold=True, color="FFFFFF")
            cel.fill = PatternFill("solid", fgColor="305496")
            cel.alignment = Alignment(wrap_text=True)
        for i in range(len(cols)):
            h.column_dimensions[ia.letra(i)].width = 14 if i < 5 else 50
        h.freeze_panes = "A2"
        h.auto_filter.ref = h.dimensions

    hoja("Plan", [("Fila", "fila"), ("ID", "id"), ("NUCO", "nuco"), ("Fecha", "fecha"), ("Acción", "accion"), ("Hoy en la celda", "valor_antes"),
                  ("Queda en", "destino"), ("Liga nueva", "valor_nuevo"), ("Aviso", "aviso")],
         sorted(p["ops"], key=lambda o: (int(o["nuco"]), o["fila"])), lambda o: "FFF2CC" if o["aviso"] else ("E2EFDA" if o["accion"] == "LIGA" else "DDEBF7"))
    hoja("Carpetas a crear", [("Ruta", "ruta")], p["crear"], lambda o: "FFFFFF")
    hoja("Revisar", [("Fila", "fila"), ("ID", "id"), ("NUCO (hoja)", "nuco"), ("Fecha", "fecha"), ("NUCO según la serie", "nuco_serie"),
                     ("Hoy en la celda", "valor"), ("Por qué no se toca", "motivo")],
         sorted(p["revisar"], key=lambda o: (o["motivo"], o["nuco"])), lambda o: "FCE4D6")
    wb.save(archivo)


if __name__ == "__main__":
    a = sys.argv[1:]
    nucos_ = a[a.index("--nucos") + 1].split(",") if "--nucos" in a else None
    if len(a) == 3 and a[0] == "plan":
        plan(a[1], a[2])
    elif a and a[0] == "aplicar" and (nucos_ or "--todos" in a):
        ia.aplicar(a[1], nucos_)
    elif a and a[0] == "verificar" and len(a) == 3:
        ia.verificar(a[1], a[2])
    elif a and a[0] == "deshacer":
        ia.deshacer(a[1], nucos_)
    else:
        print(__doc__)
