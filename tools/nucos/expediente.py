"""Expediente por NUCO: homologa 1.-DOCUMENTACIÓN de NUCOS VEHICULOS a las 6 carpetas (reglas.py).

    uv run --no-project --with google-auth-oauthlib --with google-api-python-client python tools/nucos/expediente.py <paso>

    leer                      lee (solo lectura) el árbol de DOCUMENTACIÓN de cada NUCO, la hoja VEHICULOS y
                              VEHICULOS_Files_, y lo guarda en tools/nucos/.cache/ (trae datos de unidades: fuera de git)
    excel [archivo.xlsx]      un renglón por vehículo con sus 6 documentos y la liga a cada uno, el detalle por
                              archivo y un resumen (sale de .cache; no toca Drive)
    plan                      con lo leído, qué archivo va a cuál carpeta de cada NUCO; resumen en pantalla y
                              el detalle en .cache/plan.json. No toca Drive
    aplicar <carpeta> [--nucos 1,2,3 | --muestra N]
                              COPIA según el plan dentro de <carpeta> (id o URL). Se puede repetir: lo que ya
                              está (mismo nombre en el mismo lugar) no se vuelve a copiar

    leer-appsheet             cada archivo de VEHICULOS_Files_ (también las versiones viejas) → su NUCO
    ordenar --nucos 1,2,3 | --todos [--hilos 6] [--solo-copias]
                              EN LA CARPETA REAL: mueve cada archivo a su lugar dentro de su NUCO y copia ahí lo de
                              AppSheet y la app. Nada sale de su NUCO; todo queda en .cache/bitacoras/
    deshacer <bitacora.jsonl> regresa lo que hizo un ordenar
    verificar                 solo lectura: que no falte nada de lo de antes ni de AppSheet en su NUCO
    crear-nucos --nucos 643,… EN LA REAL: la carpeta de un NUCO de la hoja que no tiene (luego, ordenar)
    respaldar <carpeta>       copia 1.-DOCUMENTACIÓN de cada NUCO tal como está hoy (leída en vivo) a esa carpeta

Usa el token de tools/migracion (autorizar.py lab, con Drive). Copiar solo LEE el original. Candados: aplicar
(copias de prueba) no escribe dentro de PROHIBIDOS, venga de donde venga el destino; ordenar es lo único que
escribe en NUCOS VEHICULOS, solo dentro de la carpeta de cada NUCO (revisa que el NUCO esté directo en NUCOS y que
cada archivo que mueve esté dentro de él) y MOVIENDO, para conservar IDs, dueño e historial (decidido el 8-oct-2026).
"""
import json
import random
import sys
import time
from pathlib import Path

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parent / "migracion"))
sys.path.insert(0, str(AQUI))

import reglas  # noqa: E402

NUCOS = "1pgEmrDM58FuALsfzBzckC9ROz941HR9P"            # NUCOS VEHICULOS (la real)
RAIZ_APP = "1WPFFd4imLiui6zIpAa3OL62ZEu_a5BJn"        # raíz de la app de producción (VEHICULOS_Files_ está ahí)
LIBRO = "17YrtuMYjGGg5LZm1BxMNrEZyCxTMI2DiUHSVUIldUlc"  # libro de producción de la app (Entornos.gs)
PROHIBIDOS = {NUCOS: "NUCOS VEHICULOS (la real)", RAIZ_APP: "la raíz de la app de producción"}
CACHE = AQUI / ".cache"
CAMPOS = "id,name,mimeType,size,md5Checksum,modifiedTime,parents"


def drive():
    from autorizar import credenciales
    from googleapiclient.discovery import build
    return build("drive", "v3", credentials=credenciales("lab"), cache_discovery=False)


def llamar(peticion):
    """execute() con reintentos cuando Drive pide bajar el ritmo."""
    from googleapiclient.errors import HttpError
    for intento in range(8):
        try:
            return peticion.execute()
        except HttpError as e:
            if e.resp.status in (403, 429, 500, 502, 503) and ("rate" in str(e).lower() or e.resp.status != 403):
                time.sleep(3 * (intento + 1))
                continue
            raise
    raise SystemExit("Drive no contestó después de 8 intentos")


def hijos_de(d, ids):
    """Los hijos de varias carpetas: de 40 en 40 en una sola consulta."""
    por = {i: [] for i in ids}
    ids = list(ids)
    for i in range(0, len(ids), 40):
        grupo = ids[i:i + 40]
        q = "(" + " or ".join("'%s' in parents" % x for x in grupo) + ") and trashed = false"
        token = None
        while True:
            r = llamar(d.files().list(q=q, pageSize=1000, pageToken=token, fields="nextPageToken,files(%s)" % CAMPOS,
                                      supportsAllDrives=True, includeItemsFromAllDrives=True))
            for f in r.get("files", []):
                for p in f.get("parents", []):
                    if p in por:
                        por[p].append(f)
            token = r.get("nextPageToken")
            if not token:
                break
        print("\r  %d/%d carpetas" % (min(i + 40, len(ids)), len(ids)), end="", flush=True)
    print()
    return por


def leer():
    d = drive()
    CACHE.mkdir(exist_ok=True)
    print("NUCOS:")
    nucos = hijos_de(d, [NUCOS])[NUCOS]
    nucos = [n for n in nucos if n["mimeType"] == reglas.CARPETA]
    print("las carpetas de cada NUCO:")
    sub = hijos_de(d, [n["id"] for n in nucos])
    nivel = []
    for n in nucos:
        n["documentacion"] = [h for h in sub[n["id"]] if h["mimeType"] == reglas.CARPETA and reglas.es_documentacion(h["name"])]
        nivel += n["documentacion"]
    profundidad = 0
    while nivel:
        profundidad += 1
        print("DOCUMENTACIÓN, nivel %d:" % profundidad)
        por = hijos_de(d, [c["id"] for c in nivel])
        siguiente = []
        for c in nivel:
            c["hijos"] = por[c["id"]]
            siguiente += [h for h in c["hijos"] if h["mimeType"] == reglas.CARPETA]
        nivel = siguiente
    (CACHE / "arbol.json").write_text(json.dumps(nucos, ensure_ascii=False), encoding="utf-8")

    print("VEHICULOS_Files_:")
    vf = llamar(d.files().list(q="'%s' in parents and name = 'VEHICULOS_Files_' and trashed = false" % RAIZ_APP,
                               fields="files(id)", supportsAllDrives=True, includeItemsFromAllDrives=True))["files"][0]["id"]
    archivos = [f for f in hijos_de(d, [vf])[vf] if f["mimeType"] != reglas.CARPETA]
    (CACHE / "vehiculos_files.json").write_text(json.dumps(archivos, ensure_ascii=False), encoding="utf-8")

    # La hoja: solo las columnas que hacen falta (sin responsable ni número de empleado)
    from autorizar import credenciales
    from googleapiclient.discovery import build
    hojas = build("sheets", "v4", credentials=credenciales("lab"), cache_discovery=False).spreadsheets()
    valores = llamar(hojas.values().get(spreadsheetId=LIBRO, range="'VEHICULOS'!A1:ZZ100000")).get("values", [])
    enc = [h.strip() for h in valores[0]]
    columnas = ["NUCCO", "FOLIO", "ESTATUS", "SEDE", "SEGURO (SI / NO)", "TENENCIA (SI / NO)", "POLIZA SEGURO",
                "ARCHIVO TENENCIA", "RESPONSIVA", "DOCUMENTO BAJA"]
    idx = {c: enc.index(c) for c in columnas}
    vehiculos = [{c: (v[i].strip() if i < len(v) else "") for c, i in idx.items()} for v in valores[1:]]
    vehiculos = [v for v in vehiculos if v["NUCCO"]]
    (CACHE / "vehiculos.json").write_text(json.dumps(vehiculos, ensure_ascii=False), encoding="utf-8")

    # Lo que generó la app (Responsiva y Adherente vehicular): solo lo que su hoja tiene registrado, con su PDF
    import re
    app = []
    for hoja, tipo in (("RESPONSIVA VEHICULAR", "responsiva"), ("ADHERENTE VEHICULAR", "adherente")):
        v = llamar(hojas.values().get(spreadsheetId=LIBRO, range="'%s'!A1:ZZ20000" % hoja)).get("values", [])
        if not v:
            continue
        e = [h.strip() for h in v[0]]
        for fila in v[1:]:
            r = {c: (fila[e.index(c)].strip() if c in e and e.index(c) < len(fila) else "") for c in ("NUCCO", "FECHA", "PDF", "ESTATUS")}
            m = re.search(r"/d/([A-Za-z0-9_-]+)", r["PDF"])
            if not (m and r["NUCCO"]):
                continue
            try:
                f = llamar(d.files().get(fileId=m.group(1), fields=CAMPOS, supportsAllDrives=True))
            except Exception:   # noqa: BLE001 — el PDF ya no existe: no hay nada que llevar
                continue
            app.append(dict(f, tipo=tipo, nucco=r["NUCCO"], estatus=r["ESTATUS"], hoja=hoja))
    (CACHE / "app.json").write_text(json.dumps(app, ensure_ascii=False), encoding="utf-8")
    print("De la app: %d documentos registrados con PDF" % len(app))
    print("Leído: %d NUCO, %d archivos en VEHICULOS_Files_, %d vehículos en la hoja" % (len(nucos), len(archivos), len(vehiculos)))


def nombre_adjunto(valor):
    """La celda de la hoja: 'VEHICULOS_Files_/x.pdf' o la URL de AppSheet con fileName=…"""
    from urllib.parse import unquote_plus
    import re
    if not valor:
        return None
    m = re.search(r"fileName=([^&]+)", valor)
    ruta = unquote_plus(m.group(1)) if m else valor
    return ruta.split("/")[-1].strip()


def tipo_appsheet(nombre):
    """El documento que dice el nombre de un archivo de VEHICULOS_Files_: AppSheet ("refwf240.RESPONSIVA.192331.pdf") o
    la app nueva ("VEH-000000GXV2XFTK_POLIZA_SEGURO_2026-10-07.Pdf")."""
    import re
    m = re.search(r"[._](RESPONSIVA|ARCHIVO[ _]TENENCIA|POLIZA[ _]SEGURO|DOCUMENTO[ _]BAJA)", nombre.upper())
    return {"RESPONSIVA": "RESPONSIVA", "ARCHIVO TENENCIA": "TENENCIA", "POLIZA SEGURO": "SEGURO",
            "DOCUMENTO BAJA": "ALTA DE PLACAS"}[m.group(1).replace("_", " ")] if m else None


def leer_appsheet():
    """SOLO LECTURA. Cada archivo de VEHICULOS_Files_ → su NUCO, también las versiones VIEJAS que la hoja ya no liga
    (AppSheet guardaba el archivo anterior al subir uno nuevo). Dos pistas: el nombre exacto del archivo en cualquier
    pestaña del libro (la bitácora CAMBIOS VEHICULOS guardaba la ruta junto al folio) y, si no, la clave con la que
    empieza el nombre (ID, ID ANTERIOR o FOLIO del vehículo). Queda en .cache/vf_nuco.json."""
    import re
    from urllib.parse import unquote_plus
    from autorizar import credenciales
    from googleapiclient.discovery import build
    hojas = build("sheets", "v4", credentials=credenciales("lab"), cache_discovery=False).spreadsheets()
    archivos = {f["name"].strip() for f in json.loads((CACHE / "vehiculos_files.json").read_text(encoding="utf-8"))}
    v = llamar(hojas.values().get(spreadsheetId=LIBRO, range="'VEHICULOS'!A1:ZZ100000")).get("values", [])
    e = [x.strip() for x in v[0]]
    col = lambda f, c: f[e.index(c)].strip() if e.index(c) < len(f) else ""
    por_clave, folio_nuco = {}, {}
    for f in v[1:]:
        nuco = col(f, "NUCCO")
        if not nuco:
            continue
        for c in ("ID", "ID ANTERIOR", "FOLIO"):
            if col(f, c):
                por_clave.setdefault(col(f, c).upper(), set()).add(nuco)
        folio_nuco[col(f, "FOLIO").upper()] = nuco
    donde = {}
    titulos = [s["properties"]["title"] for s in llamar(hojas.get(spreadsheetId=LIBRO, fields="sheets.properties.title"))["sheets"]]
    for t in titulos:
        vals = llamar(hojas.values().get(spreadsheetId=LIBRO, range="'%s'!A1:ZZ100000" % t)).get("values", [])
        if not vals:
            continue
        enc = [x.strip().upper() for x in vals[0]]
        i_nuco = next((i for i, x in enumerate(enc) if x in ("NUCCO", "NUCO")), None)
        i_folio = next((i for i, x in enumerate(enc) if x in ("FOLIO", "FOLIO VEHICULO")), None)
        for fila in vals[1:]:
            nuco = fila[i_nuco].strip() if i_nuco is not None and i_nuco < len(fila) else ""
            if not nuco and i_folio is not None and i_folio < len(fila):
                nuco = folio_nuco.get(fila[i_folio].strip().upper(), "")
            if not nuco:
                continue
            for celda in fila:
                if "VEHICULOS_Files_" in celda:
                    for m in re.finditer(r"VEHICULOS_Files_(?:/|%2F)([^&\"\n]+?\.(?:pdf|jpe?g|png))", celda, re.I):
                        n = unquote_plus(m.group(1)).strip()
                        if n in archivos:
                            donde.setdefault(n, set()).add(nuco)
    asignados = {}
    for n in archivos:
        clave = (n.split("_")[0] if n.upper().startswith("VEH-") else n.split(".")[0]).upper()
        if len(donde.get(n, ())) == 1:
            asignados[n] = next(iter(donde[n]))
        elif len(por_clave.get(clave, ())) == 1:
            asignados[n] = next(iter(por_clave[clave]))
    (CACHE / "vf_nuco.json").write_text(json.dumps(asignados, ensure_ascii=False), encoding="utf-8")
    print("VEHICULOS_Files_: %d archivos, %d con su NUCO" % (len(archivos), len(asignados)))


# Las versiones viejas de AppSheet van en una subcarpeta: no compiten con el documento vigente
VERSION_ANTERIOR = {"RESPONSIVA": reglas.RESPONSIVAS_ANTERIORES, "SEGURO": "SEGUROS ANTERIORES", "TENENCIA": "TENENCIAS ANTERIORES",
                    "ALTA DE PLACAS": None}


def plan():
    nucos = json.loads((CACHE / "arbol.json").read_text(encoding="utf-8"))
    archivos = {f["name"].strip(): f for f in json.loads((CACHE / "vehiculos_files.json").read_text(encoding="utf-8"))}
    vehiculos = {str(int(v["NUCCO"])): v for v in json.loads((CACHE / "vehiculos.json").read_text(encoding="utf-8"))
                 if v["NUCCO"].isdigit()}
    COLUMNA = {"SEGURO": "POLIZA SEGURO", "TENENCIA": "ARCHIVO TENENCIA", "RESPONSIVA": "RESPONSIVA", "ALTA DE PLACAS": "DOCUMENTO BAJA"}
    viejos_por = {}   # NUCO → archivos de VEHICULOS_Files_ (leer_appsheet), también los que la hoja ya no liga
    if (CACHE / "vf_nuco.json").exists():
        for n, nuco in json.loads((CACHE / "vf_nuco.json").read_text(encoding="utf-8")).items():
            if nuco.isdigit() and n in archivos:
                viejos_por.setdefault(str(int(nuco)), []).append(archivos[n])
    app_por = {}
    if (CACHE / "app.json").exists():
        for a in json.loads((CACHE / "app.json").read_text(encoding="utf-8")):
            if a["nucco"].isdigit():
                app_por.setdefault(str(int(a["nucco"])), []).append(a)

    # La imagen de "inexistente" que ya se usa: una de las "CARPETA SIN INFORMACIÓN.jpg" (todas son la misma)
    def buscar_imagen(nodo):
        for h in nodo.get("hijos") or nodo.get("documentacion") or []:
            if h["mimeType"] == "image/jpeg" and reglas.normal(h["name"]) == reglas.normal("CARPETA SIN INFORMACIÓN.jpg"):
                return h
            if h["mimeType"] == reglas.CARPETA:
                r = buscar_imagen(h)
                if r:
                    return r
        return None
    inexistente = next((r for r in (buscar_imagen(n) for n in nucos) if r), None)
    if not inexistente:
        raise SystemExit('No encontré la imagen "CARPETA SIN INFORMACIÓN.jpg" para los seguros que no aplican')
    salida = []
    for n in sorted(nucos, key=lambda x: int(x["name"]) if x["name"].strip().isdigit() else 10 ** 6):
        clave = str(int(n["name"])) if n["name"].strip().isdigit() else n["name"].strip()
        v = vehiculos.get(clave, {})
        adjuntos = {}
        for c, col in COLUMNA.items():
            a = archivos.get(nombre_adjunto(v.get(col)) or "")
            if a:
                adjuntos.setdefault(c, []).append(a)
        ligados = {a["id"] for lista in adjuntos.values() for a in lista}
        for f in viejos_por.get(clave, []):
            c = tipo_appsheet(f["name"])
            if c and f["id"] not in ligados:
                sub = VERSION_ANTERIOR.get(c)
                adjuntos.setdefault(c, []).append(dict(f, fuente="hoja", sub=[sub] if sub else None,
                                                       de="VEHICULOS_Files_ (versión anterior en AppSheet)"))
        for a in app_por.get(clave, []):
            sub = None
            if a["tipo"] == "adherente":
                sub = [reglas.ADHERENTES] + (["BAJA DE ADHERENTES"] if a["estatus"] == "BAJA" else [])
            adjuntos.setdefault("RESPONSIVA", []).append(dict(a, fuente="app", sub=sub, de=a["hoja"] + " (app)"))
        no_aplica = v.get("SEGURO (SI / NO)") == "NO APLICA"
        copias, resumen = reglas.planear_nuco(clave, n["documentacion"], adjuntos, inexistente if no_aplica else None)
        faltan = [c for c, _, _ in reglas.SEIS if not resumen["docs"][c] and not (c == "SEGURO" and resumen.get("sin_seguro"))]
        salida.append({"nuco": n["name"].strip(), "id": n["id"], "estatus": v.get("ESTATUS", "(no está en la hoja)"),
                       "sede": v.get("SEDE", ""), "copias": copias, "resumen": resumen, "faltan": faltan})
    (CACHE / "plan.json").write_text(json.dumps(salida, ensure_ascii=False, indent=1), encoding="utf-8")

    activos = [p for p in salida if p["estatus"] in ("UTILITARIO", "NO UTILITARIO")]
    print("NUCO: %d (activos %d). Archivos a copiar: %d (%.2f GB), rellenos que no se copian: %d, duplicados que se omiten: %d"
          % (len(salida), len(activos), sum(len(p["copias"]) for p in salida),
             sum(int(c.get("size") or 0) for p in salida for c in p["copias"]) / 1e9, sum(p["resumen"]["rellenos"] for p in salida),
             sum(p["resumen"]["duplicados"] for p in salida)))
    print("A ANTERIORES (no es ninguno de los 6): %d archivos" % sum(p["resumen"]["anteriores"] for p in salida))
    print("\nActivos con el documento, después de homologar:")
    for c, carpeta, _ in reglas.SEIS:
        n = sum(1 for p in activos if p["resumen"]["docs"][c])
        print("  %-26s %3d / %d  (%d%%)" % (carpeta, n, len(activos), round(100 * n / max(1, len(activos)))))
    cinco = [p for p in activos if all(p["resumen"]["docs"][c] or (c == "SEGURO" and p["resumen"].get("sin_seguro"))
                                       for c, _, _ in reglas.SEIS[:5])]
    print("  2.-SEGURO con la imagen de inexistente (NO APLICA en la hoja): %d" % sum(1 for p in activos if p["resumen"].get("sin_seguro")))
    print("  con los 5 obligatorios (seguro NO APLICA con su imagen cuenta): %d / %d" % (len(cinco), len(activos)))


def excel(salida):
    """Un renglón por vehículo de la hoja, sus 6 documentos con liga directa al original, el detalle archivo
    por archivo y un resumen con fórmulas. Sin Drive: sale de .cache (leer + plan)."""
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
    from openpyxl.utils import get_column_letter
    from openpyxl.formatting.rule import CellIsRule

    plan_ = {p["nuco"]: p for p in json.loads((CACHE / "plan.json").read_text(encoding="utf-8"))}
    vehiculos = json.loads((CACHE / "vehiculos.json").read_text(encoding="utf-8"))
    vehiculos.sort(key=lambda v: int(v["NUCCO"]) if v["NUCCO"].isdigit() else 10 ** 6)
    liga_archivo = lambda i: "https://drive.google.com/file/d/%s/view" % i
    liga_carpeta = lambda i: "https://drive.google.com/drive/folders/%s" % i

    FUENTE = "Arial"
    base = Font(name=FUENTE, size=10)
    enc = Font(name=FUENTE, size=10, bold=True, color="FFFFFF")
    azul = PatternFill("solid", fgColor="1F4E78")
    gris = PatternFill("solid", fgColor="D9E1F2")
    link = Font(name=FUENTE, size=10, color="0563C1", underline="single")
    fina = Side(style="thin", color="BFBFBF")

    wb = Workbook()
    # ---------------------------------------------------------------- Expediente: un renglón por vehículo
    ws = wb.active
    ws.title = "Expediente"
    fijas = ["NUCO", "FOLIO", "ESTATUS", "SEDE", "SEGURO EN LA HOJA", "TENENCIA EN LA HOJA", "CARPETA DEL NUCO"]
    cab = list(fijas)
    for _, carpeta, _ in reglas.SEIS:
        cab += [carpeta, carpeta + " · documento", carpeta + " · archivos"]
    cab += ["DOCUMENTOS CON SOPORTE (DE 6)", "LOS 5 OBLIGATORIOS", "QUÉ FALTA"]
    ws.append(cab)
    col_estado = {c: len(fijas) + 1 + 3 * i for i, (c, _, _) in enumerate(reglas.SEIS)}
    for fila, v in enumerate(vehiculos, start=2):
        nuco = str(int(v["NUCCO"])) if v["NUCCO"].isdigit() else v["NUCCO"]
        p = plan_.get(nuco)
        valores = [int(nuco) if nuco.isdigit() else nuco, v["FOLIO"], v["ESTATUS"], v["SEDE"], v["SEGURO (SI / NO)"], v["TENENCIA (SI / NO)"],
                   "Abrir carpeta" if p else "SIN CARPETA"]
        ws.append(valores)
        if p:
            ws.cell(fila, 7).hyperlink = liga_carpeta(p["id"])
            ws.cell(fila, 7).font = link
        faltan = []
        for c, carpeta, _ in reglas.SEIS:
            col = col_estado[c]
            copias = [x for x in (p["copias"] if p else []) if len(x["destino"]) > 1 and x["destino"][1] == carpeta]
            reales = [x for x in copias if not x["de"].startswith("imagen de inexistente")]
            if reales:
                estado, principal = "Sí", reales[0]
            elif copias:
                estado, principal = "No aplica", copias[0]
            else:
                estado, principal = "Falta", None
                faltan.append(carpeta.split(".-")[1].title())
            ws.cell(fila, col, estado)
            if principal:
                celda = ws.cell(fila, col + 1, principal["de"].split("/")[-1])
                celda.hyperlink = liga_archivo(principal["origen"])
                celda.font = link
            ws.cell(fila, col + 2, len(reales))
        # Fórmulas: cuentan sobre las celdas de estado del mismo renglón
        estados = [get_column_letter(col_estado[c]) + str(fila) for c, _, _ in reglas.SEIS]
        n = len(cab)
        ws.cell(fila, n - 2, "=" + "+".join('IF(OR(%s="Sí",%s="No aplica"),1,0)' % (e, e) for e in estados))
        ws.cell(fila, n - 1, '=IF(AND(%s),"Completo","Incompleto")' % ",".join('OR(%s="Sí",%s="No aplica")' % (e, e) for e in estados[:5]))
        ws.cell(fila, n, ", ".join(faltan) if faltan else "—")
    ultima = len(vehiculos) + 1
    for fila in ws.iter_rows(min_row=1, max_row=ultima):
        for celda in fila:
            if celda.font != link:
                celda.font = base
            celda.border = Border(bottom=fina)
    for celda in ws[1]:
        celda.font, celda.fill = enc, azul
        celda.alignment = Alignment(wrap_text=True, vertical="center")
    ws.row_dimensions[1].height = 42
    anchos = [7, 10, 16, 16, 12, 12, 13] + [10, 30, 8] * 6 + [12, 13, 40]
    for i, a in enumerate(anchos, start=1):
        ws.column_dimensions[get_column_letter(i)].width = a
    ws.freeze_panes = "B2"
    ws.auto_filter.ref = "A1:%s%d" % (get_column_letter(len(cab)), ultima)
    verde = PatternFill("solid", fgColor="C6EFCE")
    rojo = PatternFill("solid", fgColor="FFC7CE")
    ambar = PatternFill("solid", fgColor="FFEB9C")
    for c in col_estado.values():
        rango = "%s2:%s%d" % (get_column_letter(c), get_column_letter(c), ultima)
        ws.conditional_formatting.add(rango, CellIsRule(operator="equal", formula=['"Sí"'], fill=verde))
        ws.conditional_formatting.add(rango, CellIsRule(operator="equal", formula=['"Falta"'], fill=rojo))
        ws.conditional_formatting.add(rango, CellIsRule(operator="equal", formula=['"No aplica"'], fill=ambar))
    letra_ok = get_column_letter(len(cab) - 1)
    ws.conditional_formatting.add("%s2:%s%d" % (letra_ok, letra_ok, ultima), CellIsRule(operator="equal", formula=['"Completo"'], fill=verde))

    # ---------------------------------------------------------------- Documentos: archivo por archivo
    wd = wb.create_sheet("Documentos")
    wd.append(["NUCO", "VA EN", "NOMBRE NUEVO", "NOMBRE ORIGINAL", "DÓNDE ESTÁ HOY", "ABRIR ORIGINAL"])
    for nuco in sorted(plan_, key=lambda x: int(x) if x.isdigit() else 10 ** 6):
        for x in plan_[nuco]["copias"]:
            partes = x["de"].split("/")
            wd.append([int(nuco) if nuco.isdigit() else nuco, "/".join(x["destino"][1:]), x["nombre"], partes[-1], "/".join(partes[:-1]), "Abrir"])
            c = wd.cell(wd.max_row, 6)
            c.hyperlink, c.font = liga_archivo(x["origen"]), link
    for fila in wd.iter_rows(min_row=2, max_row=wd.max_row, max_col=5):
        for celda in fila:
            celda.font = base
    for celda in wd[1]:
        celda.font, celda.fill = enc, azul
    for i, a in enumerate([7, 42, 32, 40, 60, 9], start=1):
        wd.column_dimensions[get_column_letter(i)].width = a
    wd.freeze_panes = "A2"
    wd.auto_filter.ref = "A1:F%d" % wd.max_row

    # ---------------------------------------------------------------- Resumen: fórmulas sobre Expediente
    wr = wb.create_sheet("Resumen", 0)
    estatus = sorted({v["ESTATUS"] for v in vehiculos})
    wr["A1"] = "Expediente por NUCO — cuántos vehículos tienen cada documento"
    wr["A1"].font = Font(name=FUENTE, size=13, bold=True)
    wr["A2"] = ("Sale de la hoja VEHICULOS y de NUCOS VEHICULOS (lectura del 8-oct-2026). \"Sí\" = hay un archivo real; "
                "\"No aplica\" = seguro NO APLICA en la hoja, con la imagen de inexistente; \"Falta\" = no hay nada.")
    wr["A2"].font = Font(name=FUENTE, size=9, italic=True)
    wr.append([])
    wr.append(["ESTATUS", "VEHÍCULOS"] + [carpeta for _, carpeta, _ in reglas.SEIS] + ["LOS 5 OBLIGATORIOS"])
    fila_enc = wr.max_row
    rango_estatus = "Expediente!$C$2:$C$%d" % ultima
    for e in estatus + ["TOTAL"]:
        r = wr.max_row + 1
        wr.cell(r, 1, e)
        if e == "TOTAL":
            for col in range(2, 4 + len(reglas.SEIS)):
                letra = get_column_letter(col)
                wr.cell(r, col, "=SUM(%s%d:%s%d)" % (letra, fila_enc + 1, letra, r - 1))
            continue
        wr.cell(r, 2, '=COUNTIF(%s,$A%d)' % (rango_estatus, r))
        for i, (c, _, _) in enumerate(reglas.SEIS):
            letra = get_column_letter(col_estado[c])
            rango = "Expediente!$%s$2:$%s$%d" % (letra, letra, ultima)
            wr.cell(r, 3 + i, '=COUNTIFS(%s,$A%d,%s,"Sí")+COUNTIFS(%s,$A%d,%s,"No aplica")' % (rango_estatus, r, rango, rango_estatus, r, rango))
        ok = get_column_letter(len(cab) - 1)
        wr.cell(r, 3 + len(reglas.SEIS), '=COUNTIFS(%s,$A%d,Expediente!$%s$2:$%s$%d,"Completo")' % (rango_estatus, r, ok, ok, ultima))
    for fila in wr.iter_rows(min_row=fila_enc, max_row=wr.max_row):
        for celda in fila:
            celda.font = base
            celda.border = Border(bottom=fina)
    for celda in wr[fila_enc]:
        celda.font, celda.fill = enc, azul
        celda.alignment = Alignment(wrap_text=True)
    for celda in wr[wr.max_row]:
        celda.font = Font(name=FUENTE, size=10, bold=True)
        celda.fill = gris
    wr.column_dimensions["A"].width = 24
    for i in range(2, 11):
        wr.column_dimensions[get_column_letter(i)].width = 14
    wr.row_dimensions[fila_enc].height = 32

    # ---------------------------------------------------------------- Cómo se lee
    wl = wb.create_sheet("Cómo se lee")
    for linea in [
        "Expediente: un renglón por vehículo de la hoja VEHICULOS (los 648). Para cada una de las 6 carpetas: el estado,",
        "  la liga al documento principal (el más reciente) y cuántos archivos hay. Las ligas abren el ARCHIVO ORIGINAL,",
        "  donde está hoy (NUCOS VEHICULOS o el adjunto de la hoja): todavía no se ordena nada.",
        "Documentos: cada archivo, a qué carpeta iría, con qué nombre nuevo, dónde está hoy y su liga.",
        "  \"1.-DOCUMENTACIÓN/ANTERIORES/…\" = no es ninguno de los 6 (Oxxo Gas, verificaciones, permisos…); no se pierde.",
        "Resumen: cuántos vehículos tienen cada documento, por estatus (fórmulas sobre Expediente).",
        "",
        "Estados: Sí = hay un archivo real · No aplica = seguro NO APLICA en la hoja (lleva la imagen de inexistente) · Falta = no hay nada.",
        "No se copian: el relleno \"CARPETA SIN INFORMACIÓN\" ni los archivos repetidos (mismo contenido).",
        "\"Con soporte\" quiere decir que existe un archivo en el lugar correcto; no se abrió ninguno para revisar su contenido.",
        "Generado con tools/nucos/expediente.py (leer → plan → excel).",
    ]:
        wl.append([linea])
    wl.column_dimensions["A"].width = 130
    for fila in wl.iter_rows():
        for celda in fila:
            celda.font = base

    wb.calculation.fullCalcOnLoad = True
    wb.save(salida)
    print("Excel: %s (%d vehículos, %d archivos)" % (salida, len(vehiculos), wd.max_row - 1))


def exigir_destino(d, carpeta):
    """Que ni el destino ni ninguna carpeta de arriba esté en PROHIBIDOS."""
    actual = carpeta
    for _ in range(30):
        if actual in PROHIBIDOS:
            raise SystemExit("NO: el destino está dentro de %s. Esta herramienta no escribe ahí." % PROHIBIDOS[actual])
        padres = llamar(d.files().get(fileId=actual, fields="parents", supportsAllDrives=True)).get("parents")
        if not padres:
            return
        actual = padres[0]


def aplicar(carpeta, nucos_pedidos=None, muestra=None):
    import re
    m = re.search(r"/folders/([A-Za-z0-9_-]+)", carpeta)
    destino = m.group(1) if m else carpeta
    d = drive()
    exigir_destino(d, destino)
    plan_ = json.loads((CACHE / "plan.json").read_text(encoding="utf-8"))
    if nucos_pedidos:
        plan_ = [p for p in plan_ if p["nuco"] in nucos_pedidos]
    elif muestra:
        random.seed(8)
        plan_ = sorted(random.sample(plan_, min(muestra, len(plan_))), key=lambda p: int(p["nuco"]))
    carpetas = {}

    def carpeta_en(padre, nombre):
        clave = (padre, nombre)
        if clave not in carpetas:
            esc = nombre.replace("\\", "\\\\").replace("'", "\\'")
            r = llamar(d.files().list(q="'%s' in parents and name = '%s' and mimeType = '%s' and trashed = false" % (padre, esc, reglas.CARPETA),
                                      fields="files(id)"))["files"]
            carpetas[clave] = r[0]["id"] if r else llamar(d.files().create(
                body={"name": nombre, "mimeType": reglas.CARPETA, "parents": [padre]}, fields="id"))["id"]
        return carpetas[clave]

    existentes = {}
    copiados = saltados = 0
    for i, p in enumerate(plan_, 1):
        raiz = carpeta_en(destino, p["nuco"])
        for _, nombre_carpeta, _ in reglas.SEIS:   # las 6 siempre, aunque queden vacías
            carpeta_en(carpeta_en(raiz, reglas.DOCUMENTACION), nombre_carpeta)
        for c in p["copias"]:
            padre = raiz
            for parte in c["destino"]:
                padre = carpeta_en(padre, parte)
            if padre not in existentes:
                existentes[padre] = {f["name"] for f in llamar(d.files().list(q="'%s' in parents and trashed = false" % padre,
                                                                              fields="files(name)", pageSize=1000))["files"]}
            if c["nombre"] in existentes[padre]:
                saltados += 1
                continue
            llamar(d.files().copy(fileId=c["origen"], supportsAllDrives=True, fields="id",
                                  body={"name": c["nombre"], "parents": [padre], "description": "Original: " + c["de"] + " (" + c["origen"] + ")"}))
            existentes[padre].add(c["nombre"])
            copiados += 1
        print("\r  NUCO %s (%d/%d): %d copiados, %d ya estaban" % (p["nuco"], i, len(plan_), copiados, saltados), end="", flush=True)
    print("\nListo: %d NUCO en https://drive.google.com/drive/folders/%s" % (len(plan_), destino))


def _nfc(s):
    import unicodedata
    return unicodedata.normalize("NFC", (s or "").strip())


class Bitacora:
    """Cada cambio en la carpeta real, una línea JSON, en el momento: con esto deshacer() regresa todo."""

    def __init__(self, ruta):
        import threading
        self.ruta, self.candado = ruta, threading.Lock()
        ruta.parent.mkdir(parents=True, exist_ok=True)

    def anotar(self, **x):
        with self.candado, open(self.ruta, "a", encoding="utf-8") as f:
            f.write(json.dumps(dict(x, cuando=time.strftime("%Y-%m-%dT%H:%M:%S")), ensure_ascii=False) + "\n")


ESTRUCTURA_ANTERIOR = "ESTRUCTURA ANTERIOR"   # dentro de ANTERIORES: las carpetas viejas que quedaron vacías o solo con relleno
RESPALDO = "1dxcRFSgn1SD8KYYLamB3lGcsCmDEe-DB"   # Mi unidad > PRUEBA DE NUCOS VEHICULARES: ahí van las bitácoras


def respaldar_bitacora(ruta):
    """Sube la bitácora a PRUEBA DE NUCOS VEHICULARES/BITACORAS: si se pierde la de esta máquina, el rollback sigue."""
    from googleapiclient.http import MediaFileUpload
    d = drive()
    r = llamar(d.files().list(q="'%s' in parents and name = 'BITACORAS' and mimeType = '%s' and trashed = false" % (RESPALDO, reglas.CARPETA),
                              fields="files(id)"))["files"]
    carpeta = r[0]["id"] if r else llamar(d.files().create(body={"name": "BITACORAS", "mimeType": reglas.CARPETA, "parents": [RESPALDO]},
                                                           fields="id"))["id"]
    llamar(d.files().create(body={"name": Path(ruta).name, "parents": [carpeta]}, fields="id",
                            media_body=MediaFileUpload(str(ruta), mimetype="text/plain")))
    print("Bitácora respaldada en Drive: PRUEBA DE NUCOS VEHICULARES/BITACORAS/%s" % Path(ruta).name)


def ordenar(nucos_pedidos=None, todos=False, hilos=6, solo_copias=False):
    """EN LA CARPETA REAL: cada archivo de un NUCO se MUEVE (y renombra) a su lugar dentro de ese mismo NUCO, y lo
    de AppSheet / la app / la imagen de inexistente se COPIA ahí. Nada sale de su NUCO ni se escribe fuera de
    NUCOS VEHICULOS. Todo queda en una bitácora (.cache/bitacoras/) para deshacer(). Nada se borra: lo que no se
    mueve (el relleno, los repetidos) se queda donde estaba."""
    import threading
    from concurrent.futures import ThreadPoolExecutor
    plan_ = json.loads((CACHE / "plan.json").read_text(encoding="utf-8"))
    if nucos_pedidos:
        plan_ = [p for p in plan_ if p["nuco"] in nucos_pedidos]
    elif not todos:
        raise SystemExit("ordenar pide --nucos 1,2,3 o --todos")
    bit = Bitacora(CACHE / "bitacoras" / (time.strftime("%Y%m%d-%H%M%S") + ".jsonl"))
    local = threading.local()

    def dr():
        if not hasattr(local, "d"):
            local.d = drive()
        return local.d

    totales = {"movidos": 0, "renombrados": 0, "copiados": 0, "ya estaban": 0, "saltados": 0, "carpetas": 0,
               "carpetas viejas apartadas": 0, "carpetas viejas que se quedan": 0, "rellenos apartados": 0}
    candado = threading.Lock()

    def sumar(k):
        with candado:
            totales[k] += 1

    def un_nuco(p):
        d = dr()
        raiz = p["id"]
        info = llamar(d.files().get(fileId=raiz, fields="name,parents", supportsAllDrives=True))
        if NUCOS not in (info.get("parents") or []) or _nfc(info["name"]) != _nfc(p["nuco"]):
            bit.anotar(accion="saltado", nuco=p["nuco"], motivo="la carpeta del NUCO ya no está donde dice el plan")
            sumar("saltados")
            return
        contenido = {}   # carpeta → {(nombre NFC sin espacios de más, es carpeta): id} (lo que hay adentro, leído una vez)
        nombres = {}     # id → nombre tal cual está en Drive
        md5s = {}        # carpeta → contenidos (md5) que ya tiene: una copia idéntica no se vuelve a hacer

        def hijos(padre):
            if padre not in contenido:
                contenido[padre] = {}
                tok = None
                while True:
                    r = llamar(d.files().list(q="'%s' in parents and trashed = false" % padre, pageSize=1000, pageToken=tok,
                                              fields="nextPageToken,files(id,name,mimeType,md5Checksum)", supportsAllDrives=True,
                                              includeItemsFromAllDrives=True))
                    for f in r["files"]:
                        contenido[padre][(_nfc(f["name"]), f["mimeType"] == reglas.CARPETA)] = f["id"]
                        nombres[f["id"]] = f["name"]
                        if f.get("md5Checksum"):
                            md5s.setdefault(padre, set()).add(f["md5Checksum"])
                    tok = r.get("nextPageToken")
                    if not tok:
                        break
            return contenido[padre]

        def carpeta_en(padre, nombre):
            h = hijos(padre)
            clave = (_nfc(nombre), True)
            if clave not in h:
                h[clave] = llamar(d.files().create(body={"name": nombre, "mimeType": reglas.CARPETA, "parents": [padre]},
                                                   fields="id", supportsAllDrives=True))["id"]
                contenido[h[clave]] = {}
                nombres[h[clave]] = nombre
                bit.anotar(accion="crear_carpeta", nuco=p["nuco"], id=h[clave], padre=padre, nombre=nombre)
                sumar("carpetas")
            elif nombres.get(h[clave]) != nombre:
                # Ya existe pero con un espacio de más ("4.-TARJETA DE CIRCULACIÓN "): se deja exacta
                llamar(d.files().update(fileId=h[clave], body={"name": nombre}, fields="id", supportsAllDrives=True))
                bit.anotar(accion="mover", nuco=p["nuco"], id=h[clave], de_padre=padre, de_nombre=nombres[h[clave]],
                           a_padre=padre, a_nombre=nombre)
                nombres[h[clave]] = nombre
                sumar("renombrados")
            return h[clave]

        def dentro_del_nuco(padre):
            actual = padre
            for _ in range(15):
                if actual == raiz:
                    return True
                ps = llamar(d.files().get(fileId=actual, fields="parents", supportsAllDrives=True)).get("parents")
                if not ps:
                    return False
                actual = ps[0]
            return False

        doc = carpeta_en(raiz, reglas.DOCUMENTACION)
        for _, nombre_carpeta, _ in reglas.SEIS:
            carpeta_en(doc, nombre_carpeta)
        for c in p["copias"]:
            if solo_copias and c["fuente"] == "nuco":
                continue
            destino = raiz
            for parte in c["destino"]:
                destino = carpeta_en(destino, parte)
            if c["fuente"] == "nuco":
                try:
                    f = llamar(d.files().get(fileId=c["origen"], fields="name,parents,trashed", supportsAllDrives=True))
                except Exception as e:   # noqa: BLE001
                    bit.anotar(accion="saltado", nuco=p["nuco"], id=c["origen"], motivo="no se encontró: %s" % e)
                    sumar("saltados")
                    continue
                padre = (f.get("parents") or [None])[0]
                if f.get("trashed") or not padre or not dentro_del_nuco(padre):
                    bit.anotar(accion="saltado", nuco=p["nuco"], id=c["origen"], motivo="ya no está dentro de su NUCO")
                    sumar("saltados")
                    continue
                if padre == destino and _nfc(f["name"]) == _nfc(c["nombre"]):
                    sumar("ya estaban")
                    continue
                nombre = c["nombre"]
                if (_nfc(nombre), False) in hijos(destino) and padre != destino:
                    # Ya hay OTRO archivo con ese nombre (dos "image009.png" de correos distintos): no se pisa, va con (2)
                    import re as _re
                    base, ext = _re.match(r"^(.*?)(\.[A-Za-z0-9]{2,4})?$", nombre).groups()
                    n = 2
                    while (_nfc("%s (%d)%s" % (base, n, ext or "")), False) in hijos(destino):
                        n += 1
                    nombre = "%s (%d)%s" % (base, n, ext or "")
                cambios = {"fileId": c["origen"], "body": {"name": nombre}, "fields": "id", "supportsAllDrives": True}
                if padre != destino:
                    cambios.update(addParents=destino, removeParents=padre)
                llamar(d.files().update(**cambios))
                bit.anotar(accion="mover", nuco=p["nuco"], id=c["origen"], de_padre=padre, de_nombre=f["name"],
                           a_padre=destino, a_nombre=nombre)
                hijos(destino)[(_nfc(nombre), False)] = c["origen"]
                sumar("movidos" if padre != destino else "renombrados")
            else:
                h = hijos(destino)
                # Ya está si en esa carpeta hay algo con el mismo contenido; o, sin md5 para comparar, con el mismo nombre
                if (c.get("md5") and c["md5"] in md5s.get(destino, ())) or (not c.get("md5") and (_nfc(c["nombre"]), False) in h):
                    sumar("ya estaban")
                    continue
                nombre = c["nombre"]
                if (_nfc(nombre), False) in h:
                    # Otro archivo, distinto, ya se llama así: no se pisa, va con (2)
                    import re as _re
                    base, ext = _re.match(r"^(.*?)(\.[A-Za-z0-9]{2,4})?$", nombre).groups()
                    n = 2
                    while (_nfc("%s (%d)%s" % (base, n, ext or "")), False) in h:
                        n += 1
                    nombre = "%s (%d)%s" % (base, n, ext or "")
                nuevo = llamar(d.files().copy(fileId=c["origen"], supportsAllDrives=True, fields="id",
                                              body={"name": nombre, "parents": [destino], "description": "Copia de: " + c["de"]}))["id"]
                bit.anotar(accion="copiar", nuco=p["nuco"], origen=c["origen"], id=nuevo, a_padre=destino, a_nombre=nombre)
                h[(_nfc(nombre), False)] = nuevo
                if c.get("md5"):
                    md5s.setdefault(destino, set()).add(c["md5"])
                sumar("copiados")

        # Las carpetas viejas que quedaron vacías o solo con el relleno se apartan a ANTERIORES/ESTRUCTURA ANTERIOR (no
        # son de esta cuenta: no se pueden borrar, solo mover). Una que todavía tenga algo de verdad se queda a la vista.
        def lista(i):
            return llamar(d.files().list(q="'%s' in parents and trashed = false" % i, fields="files(id,name,mimeType)",
                                         pageSize=1000, supportsAllDrives=True, includeItemsFromAllDrives=True))["files"]

        def sin_nada_real(i):
            return all(sin_nada_real(h["id"]) if h["mimeType"] == reglas.CARPETA else reglas.es_relleno(h["name"]) for h in lista(i))

        # El relleno que ya estaba dentro de una de las 6 (una "2.-SEGURO" de antes, reusada) también se aparta: no tiene
        # caso junto a la póliza. La imagen "SEGURO-NNNN NO APLICA" no es relleno (se llama distinto) y se queda.
        for _, nombre_carpeta, _ in reglas.SEIS:
            seis = carpeta_en(doc, nombre_carpeta)
            for h in lista(seis):
                if h["mimeType"] != reglas.CARPETA and reglas.es_relleno(h["name"]):
                    apartado = carpeta_en(carpeta_en(carpeta_en(doc, reglas.ANTERIORES), ESTRUCTURA_ANTERIOR), nombre_carpeta)
                    llamar(d.files().update(fileId=h["id"], addParents=apartado, removeParents=seis, fields="id", supportsAllDrives=True))
                    bit.anotar(accion="mover", nuco=p["nuco"], id=h["id"], de_padre=seis, de_nombre=h["name"], a_padre=apartado, a_nombre=h["name"])
                    sumar("rellenos apartados")

        # Y el relleno suelto en la raíz de 1.-DOCUMENTACIÓN (los NUCO cuya documentación estaba "vacía")
        for h in lista(doc):
            if h["mimeType"] != reglas.CARPETA and reglas.es_relleno(h["name"]):
                apartado = carpeta_en(carpeta_en(doc, reglas.ANTERIORES), ESTRUCTURA_ANTERIOR)
                llamar(d.files().update(fileId=h["id"], addParents=apartado, removeParents=doc, fields="id", supportsAllDrives=True))
                bit.anotar(accion="mover", nuco=p["nuco"], id=h["id"], de_padre=doc, de_nombre=h["name"], a_padre=apartado, a_nombre=h["name"])
                sumar("rellenos apartados")

        nuevas = {_nfc(c) for _, c, _ in reglas.SEIS} | {_nfc(reglas.ANTERIORES)}
        viejas = [(doc, h) for h in lista(doc) if h["mimeType"] == reglas.CARPETA and _nfc(h["name"]) not in nuevas]
        viejas += [(raiz, h) for h in lista(raiz) if h["mimeType"] == reglas.CARPETA and h["id"] != doc and reglas.es_documentacion(h["name"])]
        for padre, h in viejas:
            if not sin_nada_real(h["id"]):
                bit.anotar(accion="queda", nuco=p["nuco"], id=h["id"], nombre=h["name"], motivo="todavía tiene archivos que no son relleno")
                sumar("carpetas viejas que se quedan")
                continue
            apartado = carpeta_en(carpeta_en(doc, reglas.ANTERIORES), ESTRUCTURA_ANTERIOR)
            llamar(d.files().update(fileId=h["id"], addParents=apartado, removeParents=padre, fields="id", supportsAllDrives=True))
            bit.anotar(accion="mover", nuco=p["nuco"], id=h["id"], de_padre=padre, de_nombre=h["name"], a_padre=apartado, a_nombre=h["name"])
            sumar("carpetas viejas apartadas")

    hechos = 0
    with ThreadPoolExecutor(max_workers=hilos) as ex:
        for _ in ex.map(un_nuco, plan_):
            hechos += 1
            print("\r  %d/%d NUCO  %s" % (hechos, len(plan_), totales), end="", flush=True)
    print("\nBitácora: %s" % bit.ruta)
    if bit.ruta.exists():
        respaldar_bitacora(bit.ruta)


def respaldar(carpeta, hilos=6):
    """Copia 1.-DOCUMENTACIÓN de cada NUCO TAL COMO ESTÁ (leída en vivo, sin homologar) a <carpeta>/RESPALDO NUCOS
    VEHICULOS <fecha>/<NUCO>/. Solo lee NUCOS; el destino pasa por el candado de las copias. Se puede repetir: lo que
    ya está (mismo nombre en el mismo lugar) no se vuelve a copiar."""
    import re
    import threading
    from concurrent.futures import ThreadPoolExecutor
    m = re.search(r"/folders/([A-Za-z0-9_-]+)", carpeta)
    destino = m.group(1) if m else carpeta
    d0 = drive()
    exigir_destino(d0, destino)
    nombre = "RESPALDO NUCOS VEHICULOS " + time.strftime("%Y-%m-%d")
    r = llamar(d0.files().list(q="'%s' in parents and name = '%s' and trashed = false" % (destino, nombre), fields="files(id)"))["files"]
    raiz = r[0]["id"] if r else llamar(d0.files().create(body={"name": nombre, "mimeType": reglas.CARPETA, "parents": [destino],
                                                                "description": "Respaldo de 1.-DOCUMENTACIÓN de cada NUCO antes de ordenar NUCOS VEHICULOS."},
                                                          fields="id"))["id"]
    nucos = [n for n in json.loads((CACHE / "arbol.json").read_text(encoding="utf-8"))]
    local = threading.local()
    totales = {"copiados": 0, "ya estaban": 0, "NUCO": 0}
    candado = threading.Lock()

    def dr():
        if not hasattr(local, "d"):
            local.d = drive()
        return local.d

    def lista(d, i):
        out, tok = [], None
        while True:
            r = llamar(d.files().list(q="'%s' in parents and trashed = false" % i, pageSize=1000, pageToken=tok,
                                      fields="nextPageToken,files(id,name,mimeType)", supportsAllDrives=True, includeItemsFromAllDrives=True))
            out += r["files"]
            tok = r.get("nextPageToken")
            if not tok:
                return out

    def espejo(d, origen, copia):
        ya = {(_nfc(h["name"]), h["mimeType"] == reglas.CARPETA): h["id"] for h in lista(d, copia)}
        for h in lista(d, origen):
            es_carpeta = h["mimeType"] == reglas.CARPETA
            clave = (_nfc(h["name"]), es_carpeta)
            if es_carpeta:
                sub = ya.get(clave) or llamar(d.files().create(body={"name": h["name"], "mimeType": reglas.CARPETA, "parents": [copia]},
                                                               fields="id"))["id"]
                espejo(d, h["id"], sub)
            elif clave in ya:
                with candado:
                    totales["ya estaban"] += 1
            else:
                llamar(d.files().copy(fileId=h["id"], supportsAllDrives=True, fields="id",
                                      body={"name": h["name"], "parents": [copia], "description": "Respaldo de: " + h["id"]}))
                with candado:
                    totales["copiados"] += 1

    def un_nuco(n):
        d = dr()
        hay = {(_nfc(h["name"]), True): h["id"] for h in lista(d, raiz) if h["mimeType"] == reglas.CARPETA}
        en_respaldo = hay.get((_nfc(n["name"]), True)) or llamar(d.files().create(
            body={"name": n["name"], "mimeType": reglas.CARPETA, "parents": [raiz]}, fields="id"))["id"]
        for doc in [h for h in lista(d, n["id"]) if h["mimeType"] == reglas.CARPETA and reglas.es_documentacion(h["name"])]:
            ya = {(_nfc(h["name"]), True): h["id"] for h in lista(d, en_respaldo) if h["mimeType"] == reglas.CARPETA}
            copia = ya.get((_nfc(doc["name"]), True)) or llamar(d.files().create(
                body={"name": doc["name"], "mimeType": reglas.CARPETA, "parents": [en_respaldo]}, fields="id"))["id"]
            espejo(d, doc["id"], copia)
        with candado:
            totales["NUCO"] += 1

    with ThreadPoolExecutor(max_workers=hilos) as ex:
        for _ in ex.map(un_nuco, nucos):
            print("\r  %s de %d" % (totales, len(nucos)), end="", flush=True)
    print("\nRespaldo: https://drive.google.com/drive/folders/%s" % raiz)


OTRAS_CARPETAS = ["2.- SERVICIOS", "3.- VERIFICACIONES", "4.- INSPECCIONES"]   # los nombres que más se usan en NUCOS


def crear_nucos(pedidos):
    """EN LA REAL: la carpeta de un NUCO que está en la hoja VEHICULOS pero no en NUCOS VEHICULOS (643–647 se dieron de
    alta sin carpeta), con 2.-/3.-/4.-; 1.-DOCUMENTACIÓN y sus 6 las arma después `ordenar`. Se anota en una bitácora
    (deshacer la manda a la papelera si sigue vacía) y se agrega a arbol.json, para que el plan lo incluya."""
    d = drive()
    vehiculos = {str(int(v["NUCCO"])) for v in json.loads((CACHE / "vehiculos.json").read_text(encoding="utf-8")) if v["NUCCO"].isdigit()}
    existentes = {_nfc(h["name"]) for h in hijos_de(d, [NUCOS])[NUCOS] if h["mimeType"] == reglas.CARPETA}
    arbol = json.loads((CACHE / "arbol.json").read_text(encoding="utf-8"))
    bit = Bitacora(CACHE / "bitacoras" / (time.strftime("%Y%m%d-%H%M%S") + "-crear.jsonl"))
    for n in pedidos:
        if n not in vehiculos:
            print("  %s: no está en la hoja VEHICULOS; no se crea" % n)
            continue
        if _nfc(n) in existentes:
            print("  %s: ya tiene carpeta" % n)
            continue
        i = llamar(d.files().create(body={"name": n, "mimeType": reglas.CARPETA, "parents": [NUCOS]}, fields="id"))["id"]
        bit.anotar(accion="crear_carpeta", nuco=n, id=i, padre=NUCOS, nombre=n)
        for otra in OTRAS_CARPETAS:
            j = llamar(d.files().create(body={"name": otra, "mimeType": reglas.CARPETA, "parents": [i]}, fields="id"))["id"]
            bit.anotar(accion="crear_carpeta", nuco=n, id=j, padre=i, nombre=otra)
        arbol.append({"id": i, "name": n, "mimeType": reglas.CARPETA, "documentacion": []})
        print("  %s: creada" % n)
    (CACHE / "arbol.json").write_text(json.dumps(arbol, ensure_ascii=False), encoding="utf-8")
    if bit.ruta.exists():
        respaldar_bitacora(bit.ruta)


def verificar():
    """SOLO LECTURA. Que no falte ningún pedazo de documentación, comparando contra la lectura de ANTES (arbol.json):
    1. cada archivo que había en 1.-DOCUMENTACIÓN de un NUCO sigue existiendo, fuera de la papelera, dentro de ESE NUCO;
    2. cada archivo de VEHICULOS_Files_ asignado a un NUCO (vf_nuco.json) tiene su contenido (md5) en ese NUCO;
    3. igual con lo que registró la app (app.json).
    El detalle queda en .cache/verificacion.json."""
    d = drive()
    nucos = [n for n in hijos_de(d, [NUCOS])[NUCOS] if n["mimeType"] == reglas.CARPETA]
    nuco_de = {n["id"]: n["name"].strip() for n in nucos}
    sub = hijos_de(d, list(nuco_de))
    ahora = {}        # id → (NUCO, md5, nombre)
    md5_de = {}       # NUCO → contenidos
    nivel = []
    for n in nucos:
        for h in sub[n["id"]]:
            if h["mimeType"] == reglas.CARPETA and reglas.es_documentacion(h["name"]):
                h["_nuco"] = n["name"].strip()
                nivel.append(h)
    while nivel:
        por = hijos_de(d, [c["id"] for c in nivel])
        siguiente = []
        for c in nivel:
            for h in por[c["id"]]:
                h["_nuco"] = c["_nuco"]
                if h["mimeType"] == reglas.CARPETA:
                    siguiente.append(h)
                else:
                    ahora[h["id"]] = (h["_nuco"], h.get("md5Checksum"), h["name"])
                    if h.get("md5Checksum"):
                        md5_de.setdefault(str(int(h["_nuco"])) if h["_nuco"].isdigit() else h["_nuco"], set()).add(h["md5Checksum"])
        nivel = siguiente

    # 1. Lo que había en cada NUCO
    antes = {}
    def juntar(nodo, nuco):
        for h in nodo.get("hijos") or []:
            if h["mimeType"] == reglas.CARPETA:
                juntar(h, nuco)
            else:
                antes[h["id"]] = (nuco, h["name"])
    for n in json.loads((CACHE / "arbol.json").read_text(encoding="utf-8")):
        for doc in n["documentacion"]:
            juntar(doc, n["name"].strip())
    faltan, otro_nuco = [], []
    for i, (nuco, nombre) in antes.items():
        if i not in ahora:
            try:
                f = llamar(d.files().get(fileId=i, fields="name,trashed,parents", supportsAllDrives=True))
                donde = "en la papelera" if f.get("trashed") else "fuera de 1.-DOCUMENTACIÓN"
            except Exception:   # noqa: BLE001
                donde = "ya no existe"
            faltan.append({"nuco": nuco, "id": i, "nombre": nombre, "donde": donde})
        elif ahora[i][0] != nuco:
            otro_nuco.append({"nuco": nuco, "id": i, "nombre": nombre, "ahora_en": ahora[i][0]})

    # 2 y 3. AppSheet y la app: el contenido en su NUCO
    vf = {f["name"].strip(): f for f in json.loads((CACHE / "vehiculos_files.json").read_text(encoding="utf-8"))}
    asignados = json.loads((CACHE / "vf_nuco.json").read_text(encoding="utf-8")) if (CACHE / "vf_nuco.json").exists() else {}
    sin_appsheet, sin_carpeta = [], []
    hay_nuco = set(md5_de) | {str(int(x)) for x in nuco_de.values() if x.isdigit()}
    for nombre, nuco in asignados.items():
        f, k = vf.get(nombre), str(int(nuco)) if nuco.isdigit() else nuco
        if not f:
            continue
        if k not in hay_nuco:
            sin_carpeta.append({"nuco": nuco, "archivo": nombre})
        elif f.get("md5Checksum") and f["md5Checksum"] not in md5_de.get(k, ()):
            sin_appsheet.append({"nuco": nuco, "archivo": nombre, "id": f["id"]})
    no_asignados = sorted(set(vf) - set(asignados))
    sin_app = []
    if (CACHE / "app.json").exists():
        for a in json.loads((CACHE / "app.json").read_text(encoding="utf-8")):
            if a.get("md5Checksum") and a["md5Checksum"] not in md5_de.get(str(int(a["nucco"])), ()):
                sin_app.append({"nuco": a["nucco"], "archivo": a["name"]})

    r = {"archivos_antes": len(antes), "archivos_ahora": len(ahora), "faltan": faltan, "en_otro_nuco": otro_nuco,
         "appsheet_sin_su_contenido_en_el_nuco": sin_appsheet, "appsheet_de_vehiculos_sin_carpeta": sin_carpeta,
         "appsheet_sin_vehiculo": no_asignados, "app_sin_su_contenido_en_el_nuco": sin_app}
    (CACHE / "verificacion.json").write_text(json.dumps(r, ensure_ascii=False, indent=1), encoding="utf-8")
    print("Archivos en 1.-DOCUMENTACIÓN: antes %d, ahora %d" % (len(antes), len(ahora)))
    print("1. De los de antes, faltan: %d   en otro NUCO: %d" % (len(faltan), len(otro_nuco)))
    print("2. AppSheet asignados (%d): sin su contenido en el NUCO: %d · de vehículos sin carpeta: %d · sin vehículo: %d"
          % (len(asignados), len(sin_appsheet), len(sin_carpeta), len(no_asignados)))
    print("3. De la app: sin su contenido en el NUCO: %d" % len(sin_app))
    print("Detalle: %s" % (CACHE / "verificacion.json"))


def deshacer(ruta):
    """Regresa lo que hizo ordenar() o inspecciones.py, de la última línea a la primera: lo movido vuelve a su carpeta y
    nombre (y sin las appProperties de origen), lo copiado y las carpetas creadas (si quedaron vacías) van a la papelera,
    lo que se mandó a la papelera sale de ella y la carpeta renombrada recupera su nombre."""
    d = drive()
    lineas = [json.loads(x) for x in Path(ruta).read_text(encoding="utf-8").splitlines() if x.strip()]
    hechos = 0
    for x in reversed(lineas):
        if x["accion"] == "mover":
            body = {"name": x["de_nombre"]}
            if x.get("app"):
                body["appProperties"] = {"origen_padre": None, "origen_nombre": None}
            cambios = {"fileId": x["id"], "body": body, "fields": "id", "supportsAllDrives": True}
            if x["de_padre"] != x["a_padre"]:
                cambios.update(addParents=x["de_padre"], removeParents=x["a_padre"])
            llamar(d.files().update(**cambios))
        elif x["accion"] in ("papelera", "papelera_carpeta"):
            llamar(d.files().update(fileId=x["id"], body={"trashed": False}, supportsAllDrives=True))
        elif x["accion"] == "renombrar_carpeta":
            llamar(d.files().update(fileId=x["id"], body={"name": x["de_nombre"]}, supportsAllDrives=True))
        elif x["accion"] == "copiar":
            llamar(d.files().update(fileId=x["id"], body={"trashed": True}, supportsAllDrives=True))
        elif x["accion"] == "crear_carpeta":
            dentro = llamar(d.files().list(q="'%s' in parents and trashed = false" % x["id"], fields="files(id)", pageSize=1))["files"]
            if dentro:
                print("\n  la carpeta %s (%s) no quedó vacía: se deja" % (x["nombre"], x["id"]))
                continue
            llamar(d.files().update(fileId=x["id"], body={"trashed": True}, supportsAllDrives=True))
        else:
            continue
        hechos += 1
        print("\r  %d deshechos" % hechos, end="", flush=True)
    print("\nListo: %s deshecha" % ruta)


if __name__ == "__main__":
    args = sys.argv[1:]
    if not args or args[0] not in ("leer", "leer-appsheet", "plan", "aplicar", "excel", "ordenar", "deshacer", "respaldar", "verificar", "crear-nucos"):
        sys.exit(__doc__)
    if args[0] == "leer":
        leer()
    elif args[0] == "plan":
        plan()
    elif args[0] == "ordenar":
        ordenar(args[args.index("--nucos") + 1].split(",") if "--nucos" in args else None, "--todos" in args,
                int(args[args.index("--hilos") + 1]) if "--hilos" in args else 6, "--solo-copias" in args)
    elif args[0] == "leer-appsheet":
        leer_appsheet()
    elif args[0] == "verificar":
        verificar()
    elif args[0] == "crear-nucos":
        crear_nucos(args[args.index("--nucos") + 1].split(","))
    elif args[0] == "respaldar":
        respaldar(args[1], int(args[args.index("--hilos") + 1]) if "--hilos" in args else 6)
    elif args[0] == "deshacer":
        deshacer(args[1])
    elif args[0] == "excel":
        excel(args[1] if len(args) > 1 else str(CACHE / "expediente.xlsx"))
    else:
        if len(args) < 2:
            sys.exit("aplicar <carpeta> [--nucos 1,2,3 | --muestra N]")
        nucos_ = args[args.index("--nucos") + 1].split(",") if "--nucos" in args else None
        muestra_ = int(args[args.index("--muestra") + 1]) if "--muestra" in args else None
        aplicar(args[1], nucos_, muestra_)
