"""Aplica en la carpeta REAL el plan de homologar 4.- INSPECCIONES (docs/nucos-expediente.md).

El plan sale del dry run (homologar_insp.py → homolog-insp.json, con la foto foto.json). Por cada NUCO:
  1. Revisa que Drive siga como en la foto: cada archivo del plan, en su carpeta y con su nombre. Si algo cambió, ese
     NUCO no se toca (se avisa).
  2. Renombra la raíz a «4.- INSPECCIONES» si hace falta y crea las carpetas que faltan.
  3. Mueve y renombra cada archivo (mover conserva su ID: las ligas siguen sirviendo). Le deja en appProperties de
     dónde venía (padre y nombre), que viaja con él aunque alguien lo mueva después.
  4. Manda a la papelera lo que el plan dice (relleno, idénticos), y las carpetas viejas que quedaron vacías.
Cada paso se anota en la bitácora en el momento (deshacer la regresa: `expediente.py deshacer <bitácora>`), se respalda
en Drive y se agrega a la hoja BITACORA EXPEDIENTES NUCO.

Uso:  inspecciones.py aplicar <plan.json> <foto.json> <foto-doc.json> (--nucos 113[,267,…] | --todos) [--hilos 6]
                             [--continuar <bitácora.jsonl>]
      --todos: cada NUCO del plan con algo que hacer. Los ya hechos se saltan solos (ya no coinciden con la foto).
      --hilos: NUCO en paralelo, cada uno con su conexión a Drive.
      --continuar: el NUCO ya se movió con esa bitácora y se cortó; solo hace la papelera, las carpetas vacías, el
      respaldo y la hoja (lo ya movido no se repite).

Papelera: en Mi unidad solo el dueño puede tirar un archivo. Si Drive no deja, se MUEVE a NUCOS VEHICULOS/_PAPELERA,
plano y con el NUCO al inicio del nombre ("113 - CARPETA SIN INFORMACIÓN.jpg.pdf"); deshacer lo regresa igual.
"""
import sys, json, time, collections, unicodedata, threading
from pathlib import Path

import expediente as e
import reglas

RAIZ = "4.- INSPECCIONES"
DOCUMENTACION = "1.-DOCUMENTACIÓN"
HOJA_BITACORA = "BITACORA EXPEDIENTES NUCO"
PAPELERA = "_PAPELERA"
nfc = lambda s: unicodedata.normalize("NFC", (s or "").strip())


def listar(d, padre):
    out, token = [], None
    while True:
        r = e.llamar(d.files().list(q="'%s' in parents and trashed = false" % padre, pageSize=1000, pageToken=token,
                                    fields="nextPageToken,files(id,name,mimeType,parents)"))
        out += r.get("files", [])
        token = r.get("nextPageToken")
        if not token:
            return out


def arbol_vivo(d, raiz_id):
    """Todo lo que hay hoy bajo una carpeta: {id: (padre, nombre, es_carpeta)}"""
    vivo, pend = {}, [raiz_id]
    while pend:
        hijos = e.hijos_de(d, pend) if len(pend) > 1 else {pend[0]: listar(d, pend[0])}
        pend = []
        for p, hs in hijos.items():
            for h in hs:
                es = h["mimeType"] == reglas.CARPETA
                vivo[h["id"]] = (p, h["name"], es)
                if es:
                    pend.append(h["id"])
    return vivo


class Hoja:
    """La bitácora en una hoja de cálculo (PRUEBA DE NUCOS VEHICULARES): lo que el área consulta y resuelve."""
    ENC = ["Cuándo", "NUCO", "Acción", "Nombre antes", "Nombre después", "Liga", "Ruta antes", "Ruta después", "Motivo",
           "Bitácora"]

    def __init__(self, d):
        from autorizar import credenciales
        from googleapiclient.discovery import build
        self.s = build("sheets", "v4", credentials=credenciales("lab"), cache_discovery=False).spreadsheets()
        r = e.llamar(d.files().list(q="'%s' in parents and name = '%s' and trashed = false" % (e.RESPALDO, HOJA_BITACORA),
                                    fields="files(id)"))["files"]
        if r:
            self.id = r[0]["id"]
        else:
            self.id = e.llamar(d.files().create(body={"name": HOJA_BITACORA, "parents": [e.RESPALDO],
                                                      "mimeType": "application/vnd.google-apps.spreadsheet"}, fields="id"))["id"]
            self.agregar([self.ENC])

    def agregar(self, filas):
        for i in range(0, len(filas), 500):
            e.llamar(self.s.values().append(spreadsheetId=self.id, range="A1", valueInputOption="RAW",
                                            body={"values": filas[i:i + 500]}))


_CANDADO_PAPELERA = threading.Lock()


def a_papelera(d, item_id, padre, nombre, nuco, bit, es_carpeta, cache={}):
    """Papelera; si Drive no deja (no es de la cuenta), se mueve a NUCOS VEHICULOS/_PAPELERA con el NUCO en el nombre."""
    from googleapiclient.errors import HttpError
    try:
        e.llamar(d.files().update(fileId=item_id, body={"trashed": True}, fields="id"))
        bit.anotar(accion="papelera_carpeta" if es_carpeta else "papelera", nuco=nuco, id=item_id, nombre=nombre)
        return "papelera"
    except HttpError as err:
        if err.resp.status != 403:
            raise
    with _CANDADO_PAPELERA:
        if "id" not in cache:
            r = e.llamar(d.files().list(q="'%s' in parents and name = '%s' and mimeType = '%s' and trashed = false"
                                          % (e.NUCOS, PAPELERA, reglas.CARPETA), fields="files(id)"))["files"]
            cache["id"] = r[0]["id"] if r else e.llamar(d.files().create(
                body={"name": PAPELERA, "mimeType": reglas.CARPETA, "parents": [e.NUCOS]}, fields="id"))["id"]
            if not r:
                bit.anotar(accion="crear_carpeta", nuco="", id=cache["id"], padre=e.NUCOS, nombre=PAPELERA)
    nuevo = "%s - %s" % (nuco, nombre)
    e.llamar(d.files().update(fileId=item_id, addParents=cache["id"], removeParents=padre, body={"name": nuevo}, fields="id"))
    bit.anotar(accion="mover", nuco=nuco, id=item_id, de_padre=padre, de_nombre=nombre, a_padre=cache["id"], a_nombre=nuevo)
    return "_PAPELERA"


def filas_de_bitacora(ruta, plan_por_id):
    filas = []
    for x in (json.loads(l) for l in Path(ruta).read_text(encoding="utf-8").splitlines() if l.strip()):
        p = plan_por_id.get(x.get("id"), {})
        liga = "https://drive.google.com/file/d/%s/view" % x["id"] if x["accion"] in ("mover", "papelera") else ""
        filas.append([x.get("cuando", "").replace("T", " "), x.get("nuco", ""), x["accion"].upper().replace("_", " "),
                      x.get("de_nombre") or x.get("nombre", ""), x.get("a_nombre", ""), liga, p.get("antes", ""),
                      p.get("despues", ""), p.get("aviso", ""), Path(ruta).name])
    return filas


def aplicar(plan_json, foto_json, foto_doc_json, nucos, continuar=None, hilos=1):
    plan = json.load(open(plan_json, encoding="utf-8"))["plan"]
    foto = json.load(open(foto_json, encoding="utf-8"))
    fdoc = json.load(open(foto_doc_json, encoding="utf-8"))
    raiz_de = {r["nuco"]: r for r in foto["raices"]}
    doc_de = {r["nuco"]: r for r in fdoc["raices"]}
    nombre_arch = {a["id"]: a for a in foto["archivos"]}
    plan_de = collections.defaultdict(list)
    for p in plan:
        plan_de[p["nuco"]].append(p)
    carpetas_de = collections.defaultdict(list)
    for c in foto["carpetas"]:
        carpetas_de[c["nuco"]].append(c)
    if nucos == ["*"]:
        # Todos los que tienen algo que hacer
        nucos = sorted((n for n, ps in plan_de.items() if any(p["accion"] != "IGUAL" for p in ps)), key=int)
    bit = e.Bitacora(Path(continuar) if continuar else e.CACHE / "bitacoras" / (time.strftime("%Y%m%d-%H%M%S") + "-inspecciones.jsonl"))
    ya_movidos = set()
    if continuar:
        ya_movidos = {json.loads(l)["id"] for l in Path(continuar).read_text(encoding="utf-8").splitlines() if l.strip()}

    def uno(nuco):
        """Un NUCO completo, con su propia conexión a Drive (el cliente no se comparte entre hilos). → (texto, estado)"""
        d = e.drive()
        log = []
        if nuco not in raiz_de:
            return "%s: no tiene carpeta de inspecciones; nada que hacer" % nuco, "sin carpeta"
        r = raiz_de[nuco]
        ps = plan_de[nuco]
        log.append("== NUCO %s: %d archivos (%s)" % (nuco, len(ps), dict(collections.Counter(p["accion"] for p in ps))))

        # 1) ¿Drive sigue como en la foto? (al continuar, lo movido ya no está donde la foto: no se revisa)
        vivo = arbol_vivo(d, r["id"]) if not continuar else {}
        distintos = []
        for p in ([] if continuar else ps):
            a = nombre_arch[p["id"]]
            v = vivo.get(p["id"])
            if not v or v[0] != a["padre"] or nfc(v[1]) != nfc(a["name"]):
                distintos.append(p["antes"])
        nuevos = [v[1] for i, v in vivo.items() if not v[2] and i not in nombre_arch and i not in ya_movidos]
        if distintos or nuevos:
            log.append("  NO SE TOCA: cambió desde la foto (o ya se hizo). Movidos/renombrados: %d, nuevos: %d"
                       % (len(distintos), len(nuevos)))
            log += ["    " + x for x in (distintos + nuevos)[:5]]
            return "\n".join(log), "no se tocó"

        # 2) Raíz y carpetas
        if r["name"] != RAIZ and not continuar:
            e.llamar(d.files().update(fileId=r["id"], body={"name": RAIZ}, fields="id"))
            bit.anotar(accion="renombrar_carpeta", nuco=nuco, id=r["id"], de_nombre=r["name"], a_nombre=RAIZ)
        base = {RAIZ: r["id"], DOCUMENTACION: doc_de[nuco]["id"]}
        hijos_cache = {}

        def carpeta(segs):
            """La carpeta bajo el NUCO (segs[0] es 4.- INSPECCIONES o 1.-DOCUMENTACIÓN); crea la que falte."""
            actual = base[segs[0]]
            for s_ in segs[1:]:
                if actual not in hijos_cache:
                    hijos_cache[actual] = {nfc(h["name"]): h["id"] for h in listar(d, actual) if h["mimeType"] == reglas.CARPETA}
                hay = hijos_cache[actual].get(nfc(s_))
                if not hay:
                    hay = e.llamar(d.files().create(body={"name": s_, "mimeType": reglas.CARPETA, "parents": [actual]},
                                                    fields="id"))["id"]
                    bit.anotar(accion="crear_carpeta", nuco=nuco, id=hay, padre=actual, nombre=s_)
                    hijos_cache[actual][nfc(s_)] = hay
                    hijos_cache[hay] = {}
                actual = hay
            return actual

        # Los nombres que ya hay en cada carpeta destino: si uno choca, no se pisa
        ocupados = {}

        # 3) Mover y renombrar
        hechos = collections.Counter()
        for p in ps:
            if p["accion"] != "MOVER" or p["id"] in ya_movidos:
                continue
            a = nombre_arch[p["id"]]
            segs = p["despues"].split("/")[1:]
            destino = carpeta(segs[:-1])
            nombre = segs[-1]
            if destino not in ocupados:
                ocupados[destino] = {nfc(h["name"]) for h in listar(d, destino)}
            if nfc(nombre) in ocupados[destino] and not (destino == a["padre"] and nfc(nombre) == nfc(a["name"])):
                raise RuntimeError("choque inesperado: ya existe %s en %s; se detuvo este NUCO (la bitácora tiene lo hecho)"
                                   % (nombre, "/".join(segs[:-1])))
            cambios = dict(fileId=p["id"], fields="id",
                           body={"name": nombre, "appProperties": {"origen_padre": a["padre"],
                                                                   "origen_nombre": a["name"].encode("utf-8")[:80].decode("utf-8", "ignore")}})
            if destino != a["padre"]:
                cambios.update(addParents=destino, removeParents=a["padre"])
            e.llamar(d.files().update(**cambios))
            bit.anotar(accion="mover", nuco=nuco, id=p["id"], de_padre=a["padre"], de_nombre=a["name"], a_padre=destino,
                       a_nombre=nombre, app=True)
            ocupados[destino].add(nfc(nombre))
            hechos["movidos"] += 1

        # 4) Papelera: lo que dice el plan
        for p in ps:
            if p["accion"] == "PAPELERA" and p["id"] not in ya_movidos:
                a = nombre_arch[p["id"]]
                hechos[a_papelera(d, p["id"], a["padre"], a["name"], nuco, bit, False)] += 1

        # …y las carpetas viejas que quedaron vacías, de la más honda a la más alta (nunca la raíz)
        viejas = sorted((c for c in carpetas_de[nuco] if c["ruta"][0] == r["name"]), key=lambda c: -len(c["ruta"]))
        for c in viejas:
            if listar(d, c["id"]):
                continue
            hechos["carpeta vacía → " + a_papelera(d, c["id"], c["padre"], c["name"], nuco, bit, True)] += 1
        log.append("  listo: %s" % dict(hechos))
        return "\n".join(log), "hecho"

    from concurrent.futures import ThreadPoolExecutor, as_completed
    resumen = collections.Counter()
    print("%d NUCO, %d hilos" % (len(nucos), hilos))
    with ThreadPoolExecutor(max_workers=hilos) as pool:
        futuros = {pool.submit(uno, n): n for n in nucos}
        for k, f in enumerate(as_completed(futuros), start=1):
            n = futuros[f]
            try:
                texto, estado = f.result()
            except Exception as err:            # un NUCO que falla no detiene a los demás
                texto, estado = "== NUCO %s: FALLÓ: %s" % (n, err), "falló"
            resumen[estado] += 1
            print("[%d/%d] %s" % (k, len(nucos), texto), flush=True)
    print("\nResumen: %s" % dict(resumen))

    if bit.ruta.exists():
        d = e.drive()
        e.respaldar_bitacora(bit.ruta)
        filas = filas_de_bitacora(bit.ruta, {p["id"]: p for p in plan})
        Hoja(d).agregar(filas)
        print("Hoja %s: %d renglones" % (HOJA_BITACORA, len(filas)))
        print("Bitácora: %s" % bit.ruta)


if __name__ == "__main__":
    a = sys.argv[1:]
    if len(a) < 4 or a[0] != "aplicar" or ("--nucos" not in a and "--todos" not in a):
        sys.exit(__doc__)
    aplicar(a[1], a[2], a[3], ["*"] if "--todos" in a else a[a.index("--nucos") + 1].split(","),
            a[a.index("--continuar") + 1] if "--continuar" in a else None,
            int(a[a.index("--hilos") + 1]) if "--hilos" in a else 1)
