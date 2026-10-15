"""Respaldos de firmas de Responsiva y Adherente al expediente del NUCO (Fase 3, corrida 4; docs/nucos-fase3-pendiente.md).

    firmas_app.py plan                     SOLO LECTURA → .cache/firmas/plan.json (y lo muestra)
    firmas_app.py aplicar                  EN LA REAL. Bitácora .cache/bitacoras/<fecha>-firmas-app.jsonl (+ Drive)
    firmas_app.py verificar <bitácora>     SOLO LECTURA: cada archivo donde dice el plan, con su md5
    expediente.py deshacer <bitácora>      regresa todo (mover y carpetas creadas)

Origen: ControlVehicular/RESPONSIVAS VEHICULARES_Images (prod). Ahí la app guardaba, hasta el 12-oct-2026, el respaldo de
cada firma con el nombre `FIRMA <CAMPO> <PERSONA> <PLACA> <fecha>.png`; desde entonces lo guarda en el NUCO
(`ExpedienteNuco.guardar`): `<NUCO>/1.-DOCUMENTACIÓN/5.-RESPONSIVA/FIRMAS/FIRMA <CAMPO>-NNNN <fecha>.png` (Responsiva) o
`ADHERENTE FIRMA <CAMPO>-NNNN <fecha>.png` (Adherente), con (2), (3)… si el nombre ya existe.

  - DE UN REGISTRO: la persona y la placa del nombre son las de un renglón de RESPONSIVA VEHICULAR (RESPONSABLE) o de
    ADHERENTE VEHICULAR (ADHERENTE). El NUCO es el NUCCO de ese renglón (nunca la placa ni el folio) y además debe
    haber, en su expediente, un PDF de ese documento creado el mismo día que la firma (la misma llamada lo generó).
    → FIRMAS del NUCO con el nombre de la app (fecha = la del nombre viejo), en orden de creación.
  - SIN RENGLÓN, CON SU PDF: el renglón ya no está (se reutilizó para otro documento) pero en el expediente del vehículo
    de esa placa hay un PDF del mismo documento creado a los pocos minutos de la firma (la misma llamada; caso del
    NUCO 402, incidente del 14-oct). La placa solo ubica el vehículo; la prueba es el PDF.
  - DE PRUEBA: ningún renglón tiene esa persona con esa placa (capturas de prueba del 6 al 9-oct: placas inventadas,
    folio en lugar de placa, "BAJA VEHICULAR") → NUCOS VEHICULOS/_POR REVISAR/FIRMAS DE PRUEBA, con su nombre.
  - TEMP (`FIRMA … temp <id>`): las usa la firma a distancia mientras el documento está PENDIENTE y la app las borra al
    generar el PDF. No se tocan.
"""
import sys, json, re, time, collections, unicodedata
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import expediente as e, reglas
from religar_verif import hojas, leer

ORIGEN = "12Zkdgdfiqv-jbVy-FPeGnNeucrCdIoPJ"          # ControlVehicular/RESPONSIVAS VEHICULARES_Images (prod)
RUTA = ["1.-DOCUMENTACIÓN", "5.-RESPONSIVA", "FIRMAS"]
PRUEBA = ["_POR REVISAR", "FIRMAS DE PRUEBA"]
C = e.CACHE / "firmas"
PLAN = C / "plan.json"
N = lambda s: re.sub(r"\s+", " ", reglas.normal(s or "")).strip()
nfc = lambda s: unicodedata.normalize("NFC", (s or "").strip())
RE_VIEJO = re.compile(r"^(FIRMA (?:RESPONSABLE|ADHERENTE|JEFE|CI)) (.+) (\S+) (\d{4}-\d{2}-\d{2})\.(png|jpe?g)$", re.I)


def hijos(d, cid):
    """Los hijos de una carpeta, con su fecha de CREACIÓN (la de modificación cambia al mover o renombrar: con ella el plan
    salía distinto después de deshacer, 15-oct-2026)."""
    out, tok = [], None
    while True:
        r = e.llamar(d.files().list(q="'%s' in parents and trashed = false" % cid, pageSize=1000, pageToken=tok,
                                    fields="nextPageToken,files(id,name,mimeType,md5Checksum,modifiedTime,createdTime,parents)"))
        out += r.get("files", [])
        tok = r.get("nextPageToken")
        if not tok:
            return out


def plan():
    C.mkdir(parents=True, exist_ok=True)
    d = e.drive()
    h = hojas()
    _, resp = leer(h, "RESPONSIVA VEHICULAR")
    _, adh = leer(h, "ADHERENTE VEHICULAR")
    _, veh = leer(h, "VEHICULOS")
    por_placa = collections.defaultdict(set)
    for v in veh.values():
        if v.get("PLACA") and v.get("NUCCO"):
            por_placa[re.sub(r"[^A-Z0-9]", "", N(v["PLACA"]))].add(str(v["NUCCO"]).strip())
    registros = [("RESPONSIVA", r["RESPONSABLE"], r["PLACA"], r["NUCCO"]) for r in resp.values()] + \
                [("ADHERENTE", r["ADHERENTE"], r["PLACA"], r["NUCCO"]) for r in adh.values()]
    archivos = sorted((f for f in hijos(d, ORIGEN) if f["mimeType"] != reglas.CARPETA),
                      key=lambda f: (f["createdTime"], f["name"]))
    nucos = {f["name"]: f["id"] for f in hijos(d, e.NUCOS) if f["mimeType"] == reglas.CARPETA}
    exp_cache = {}

    def expediente(nuco):
        """Archivos de 5.-RESPONSIVA del NUCO (para confirmar el PDF y ver los nombres que ya hay en FIRMAS)."""
        if nuco not in exp_cache:
            doc = next(x for x in hijos(d, nucos[nuco]) if N(x["name"]).startswith("1.-DOCUMENTACI"))
            r5 = next(x for x in hijos(d, doc["id"]) if x["name"].startswith("5.-RESPONSIVA"))
            todo, pend = [], [(r5["id"], [])]
            while pend:
                cid, ruta = pend.pop()
                for x in hijos(d, cid):
                    if x["mimeType"] == reglas.CARPETA:
                        pend.append((x["id"], ruta + [x["name"]]))
                    else:
                        todo.append(dict(x, ruta=ruta))
            exp_cache[nuco] = todo
        return exp_cache[nuco]

    def momento(x):
        return x["createdTime"]

    # El tipo de documento de cada llamada (persona + placa + fecha): FIRMA ADHERENTE → adherente, FIRMA RESPONSABLE →
    # responsiva; JEFE y CI toman el de sus hermanas (mismo minuto)
    tipo_de = {}
    for f in archivos:
        m = RE_VIEJO.match(f["name"])
        if m and m.group(1).upper() in ("FIRMA ADHERENTE", "FIRMA RESPONSABLE"):
            tipo_de[(N(m.group(2)), N(m.group(3)), m.group(4), momento(f)[:16])] =                 "ADHERENTE" if m.group(1).upper() == "FIRMA ADHERENTE" else "RESPONSIVA"

    def pdf_de_la_llamada(nuco, tipo, f):
        """Un PDF de ese tipo en el expediente del NUCO, creado entre 0 y 10 min después de la firma."""
        import datetime
        t0 = datetime.datetime.fromisoformat(momento(f)[:19])
        for x in expediente(nuco):
            if x["name"].upper().startswith(tipo) and x["name"].lower().endswith(".pdf"):
                dt = (datetime.datetime.fromisoformat(momento(x)[:19]) - t0).total_seconds()
                if 0 <= dt <= 600:
                    return x
        return None

    p, usados = [], collections.defaultdict(set)
    for f in archivos:
        base = dict(id=f["id"], nombre=f["name"], md5=f.get("md5Checksum"), padre=ORIGEN, creado=f["createdTime"])
        if re.search(r"\btemp\b", f["name"], re.I):
            p.append(dict(base, accion="QUEDA", motivo="TEMP de la firma a distancia: la usa la app"))
            continue
        m = RE_VIEJO.match(f["name"])
        if not m:
            p.append(dict(base, accion="QUEDA", motivo="nombre que no es de un respaldo de firma"))
            continue
        campo, persona, placa, fecha, ext = m.groups()
        tipo_llamada = tipo_de.get((N(persona), N(placa), fecha, momento(f)[:16]))
        candidatos = [r for r in registros if N(r[1]) == N(persona) and N(r[2]) == N(placa)
                      and (tipo_llamada is None or r[0] == tipo_llamada)]
        if candidatos:
            tipos = {r[0] for r in candidatos}
            nucos_r = {str(r[3]).strip() for r in candidatos}
            if len(nucos_r) != 1 or len(tipos) != 1:
                p.append(dict(base, accion="QUEDA", motivo="ambiguo: %s" % candidatos))
                continue
            tipo, nuco = tipos.pop(), nucos_r.pop()
            # El PDF de ese documento en el expediente del NUCO, creado el mismo día que la firma
            dia = momento(f)[:10]
            pdfs = [x for x in expediente(nuco) if x["name"].upper().startswith(tipo) and x["name"].lower().endswith(".pdf")
                    and momento(x)[:10] == dia]
            if not pdfs:
                p.append(dict(base, accion="QUEDA", motivo="no se encontró el PDF de %s del NUCO %s del %s" % (tipo, nuco, dia)))
                continue
            como = "su renglón"
        else:
            # Sin renglón: solo si el vehículo de esa placa (uno solo) tiene el PDF de esa misma llamada
            veh_n = por_placa.get(re.sub(r"[^A-Z0-9]", "", N(placa)), set())
            pdf = pdf_de_la_llamada(next(iter(veh_n)), tipo_llamada, f) if len(veh_n) == 1 and tipo_llamada else None
            if not pdf:
                # Hay pruebas repetidas con el mismo nombre (la misma captura varias veces): (2), (3)…
                nombre_p, k = f["name"], 2
                while nombre_p in usados["PRUEBA"]:
                    base_p, ext_p = re.match(r"(.*?)(\.[^.]+)?$", f["name"]).groups()
                    nombre_p = "%s (%d)%s" % (base_p, k, ext_p or "")
                    k += 1
                usados["PRUEBA"].add(nombre_p)
                p.append(dict(base, accion="MOVER", destino=PRUEBA, nuevo=nombre_p, nuco="",
                              motivo="de prueba: ningún renglón tiene a %s con %s, ni hay PDF de esa llamada" % (persona, placa)))
                continue
            tipo, nuco, pdfs, como = tipo_llamada, next(iter(veh_n)), [pdf], "sin renglón (se reutilizó), la misma llamada"
        prefijo = ("ADHERENTE " if tipo == "ADHERENTE" else "") + campo.upper()
        ext = "." + ext.lower().replace("jpeg", "jpg")
        ocupados = usados[nuco] or {x["name"] for x in expediente(nuco) if x["ruta"] == ["FIRMAS"]}
        usados[nuco] = ocupados
        nombre = "%s-%04d %s%s" % (prefijo, int(nuco), fecha, ext)
        k = 2
        while nombre in ocupados:
            nombre = "%s-%04d %s (%d)%s" % (prefijo, int(nuco), fecha, k, ext)
            k += 1
        ocupados.add(nombre)
        p.append(dict(base, accion="MOVER", destino=[nuco] + RUTA, nuevo=nombre, nuco=nuco, tipo=tipo,
                      motivo="%s de %s (%s), %s: su PDF %s" % (tipo.lower(), persona, placa, como, pdfs[0]["name"])))
    # Nunca dos archivos al mismo nombre en el mismo lugar
    destinos = [("/".join(x["destino"]), x["nuevo"]) for x in p if x["accion"] == "MOVER"]
    assert len(set(destinos)) == len(destinos), "dos archivos llegan al mismo nombre: %s" % [
        d_ for d_, n in collections.Counter(destinos).items() if n > 1]
    json.dump(dict(origen=ORIGEN, plan=p), open(PLAN, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    c = collections.Counter((x["accion"], "PRUEBA" if x.get("destino") == PRUEBA else x.get("nuco", "")) for x in p)
    print("plan:", dict(c))
    for x in p:
        if x["accion"] == "MOVER" and x["nuco"]:
            print("  %-70s → %s/%s" % (x["nombre"], "/".join(x["destino"]), x["nuevo"]))
    for x in p:
        if x["accion"] == "QUEDA" and "TEMP" not in x["motivo"]:
            print("  QUEDA %s: %s" % (x["nombre"], x["motivo"]))


def carpeta(d, raiz, segs, bit, nuco):
    actual = raiz
    for s in segs:
        hay = [x for x in hijos(d, actual) if x["mimeType"] == reglas.CARPETA and nfc(x["name"]) == nfc(s)]
        if hay:
            actual = hay[0]["id"]
        else:
            nuevo = e.llamar(d.files().create(body={"name": s, "mimeType": reglas.CARPETA, "parents": [actual]}, fields="id"))["id"]
            bit.anotar(accion="crear_carpeta", nuco=nuco, id=nuevo, padre=actual, nombre=s)
            actual = nuevo
    return actual


def aplicar():
    d = e.drive()
    p = json.load(open(PLAN, encoding="utf-8"))["plan"]
    vivos = {f["id"]: f for f in hijos(d, ORIGEN)}
    # Drive tiene que seguir como en el plan: cada archivo a mover, todavía en el origen y con su nombre
    distintos = [x["nombre"] for x in p if x["accion"] == "MOVER" and (x["id"] not in vivos or vivos[x["id"]]["name"] != x["nombre"])]
    if distintos:
        sys.exit("No se toca nada: cambió desde el plan: %s" % distintos[:5])
    nucos = {f["name"]: f["id"] for f in hijos(d, e.NUCOS) if f["mimeType"] == reglas.CARPETA}
    bit = e.Bitacora(e.CACHE / "bitacoras" / (time.strftime("%Y%m%d-%H%M%S") + "-firmas-app.jsonl"))
    hechos = collections.Counter()
    for x in p:
        if x["accion"] != "MOVER":
            continue
        if x["destino"] == PRUEBA:
            destino, nuco = carpeta(d, e.NUCOS, PRUEBA, bit, ""), ""
        else:
            nuco = x["nuco"]
            destino = carpeta(d, nucos[nuco], RUTA, bit, nuco)
        ya = {nfc(h["name"]) for h in hijos(d, destino)}
        if nfc(x["nuevo"]) in ya:
            raise RuntimeError("choque inesperado: ya existe %s; se detuvo (la bitácora tiene lo hecho)" % x["nuevo"])
        e.llamar(d.files().update(fileId=x["id"], addParents=destino, removeParents=ORIGEN, fields="id",
                                  body={"name": x["nuevo"], "appProperties": {"origen_padre": ORIGEN,
                                        "origen_nombre": x["nombre"].encode("utf-8")[:80].decode("utf-8", "ignore")}}))
        bit.anotar(accion="mover", nuco=nuco, id=x["id"], de_padre=ORIGEN, de_nombre=x["nombre"], a_padre=destino,
                   a_nombre=x["nuevo"], app=True)
        hechos["prueba" if not nuco else "NUCO " + nuco] += 1
    print("movidos:", dict(hechos))
    e.respaldar_bitacora(bit.ruta)
    print("Bitácora:", bit.ruta)


def verificar(ruta_bit):
    d = e.drive()
    p = {x["id"]: x for x in json.load(open(PLAN, encoding="utf-8"))["plan"]}
    malos, ok = [], 0
    for l in Path(ruta_bit).read_text(encoding="utf-8").splitlines():
        b = json.loads(l)
        if b["accion"] != "mover":
            continue
        f = e.llamar(d.files().get(fileId=b["id"], fields="id,name,parents,md5Checksum,trashed"))
        x = p[b["id"]]
        if f.get("trashed") or f["parents"] != [b["a_padre"]] or nfc(f["name"]) != nfc(x["nuevo"]) or f.get("md5Checksum") != x["md5"]:
            malos.append("%s → %s (%s)" % (x["nombre"], f["name"], f["parents"]))
        else:
            ok += 1
    # Lo que se queda, sigue en el origen
    vivos = {f["id"] for f in hijos(d, ORIGEN)}
    quedan = [x for x in p.values() if x["accion"] == "QUEDA"]
    faltan = [x["nombre"] for x in quedan if x["id"] not in vivos]
    sobran = [x["nombre"] for x in p.values() if x["accion"] == "MOVER" and x["id"] in vivos]
    print("en su lugar: %d | mal: %d | de los que se quedan, faltan en el origen: %d | aún en el origen: %d"
          % (ok, len(malos), len(faltan), len(sobran)))
    for m in malos + faltan + sobran:
        print("   ✘", m)
    return not (malos or faltan or sobran)


if __name__ == "__main__":
    a = sys.argv[1:]
    if not a or a[0] not in ("plan", "aplicar", "verificar"):
        sys.exit(__doc__)
    if a[0] == "plan":
        plan()
    elif a[0] == "aplicar":
        aplicar()
    else:
        sys.exit(0 if verificar(a[1]) else 1)
