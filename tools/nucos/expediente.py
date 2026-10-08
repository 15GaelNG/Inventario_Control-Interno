"""Expediente por NUCO: homologa 1.-DOCUMENTACIÓN de NUCOS VEHICULOS a las 6 carpetas (reglas.py).

    uv run --no-project --with google-auth-oauthlib --with google-api-python-client python tools/nucos/expediente.py <paso>

    leer                      lee (solo lectura) el árbol de DOCUMENTACIÓN de cada NUCO, la hoja VEHICULOS y
                              VEHICULOS_Files_, y lo guarda en tools/nucos/.cache/ (trae datos de unidades: fuera de git)
    plan                      con lo leído, qué archivo va a cuál carpeta de cada NUCO; resumen en pantalla y
                              el detalle en .cache/plan.json. No toca Drive
    aplicar <carpeta> [--nucos 1,2,3 | --muestra N]
                              COPIA según el plan dentro de <carpeta> (id o URL). Se puede repetir: lo que ya
                              está (mismo nombre en el mismo lugar) no se vuelve a copiar

Usa el token de tools/migracion (autorizar.py lab, con Drive). Copiar solo LEE el original. El candado es
PROHIBIDOS: ninguna escritura cae dentro de esas carpetas, venga de donde venga el destino. NUCOS VEHICULOS
se quita de ahí a propósito, en su propio commit, el día que toque ordenar la real (y entonces moviendo, para
conservar los IDs, no copiando).
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


def plan():
    nucos = json.loads((CACHE / "arbol.json").read_text(encoding="utf-8"))
    archivos = {f["name"].strip(): f for f in json.loads((CACHE / "vehiculos_files.json").read_text(encoding="utf-8"))}
    vehiculos = {str(int(v["NUCCO"])): v for v in json.loads((CACHE / "vehiculos.json").read_text(encoding="utf-8"))
                 if v["NUCCO"].isdigit()}
    COLUMNA = {"SEGURO": "POLIZA SEGURO", "TENENCIA": "ARCHIVO TENENCIA", "RESPONSIVA": "RESPONSIVA", "ALTA DE PLACAS": "DOCUMENTO BAJA"}

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


if __name__ == "__main__":
    args = sys.argv[1:]
    if not args or args[0] not in ("leer", "plan", "aplicar"):
        sys.exit(__doc__)
    if args[0] == "leer":
        leer()
    elif args[0] == "plan":
        plan()
    else:
        if len(args) < 2:
            sys.exit("aplicar <carpeta> [--nucos 1,2,3 | --muestra N]")
        nucos_ = args[args.index("--nucos") + 1].split(",") if "--nucos" in args else None
        muestra_ = int(args[args.index("--muestra") + 1]) if "--muestra" in args else None
        aplicar(args[1], nucos_, muestra_)
