"""Homologar `2.-SERVICIOS` de cada NUCO (docs/nucos-servicios.md). DRY RUN: no mueve nada en Drive.

  foto.py <dir>/foto.json SERVIC        la foto de la carpeta (solo lectura)
  servicios.py xml <dir>                lee cada factura XML de la foto (CFDI: fecha, tipo, emisor, folio fiscal y, en los
                                        complementos de pago, qué facturas pagan) → <dir>/xml.json. Reusa lo ya leído.
  servicios.py dry-run <dir>            el plan de cada archivo → <dir>/plan.json y <dir>/dry-run.xlsx para revisarlo.
                                        Se aplica después con el ejecutor de inspecciones:
                                        inspecciones.py aplicar <dir>/plan.json <dir>/foto.json <foto-doc.json> --raiz 2.-SERVICIOS …

Estructura (15-oct-2026: la que el área ya usa en 453 NUCO, con los nombres parejos):
  2.-SERVICIOS/
     1.-LIBRETA DE SERVICIOS/
        <año>/<MM>.-<MES>/<evento>/          el evento con el nombre que le puso el área (12. SERVICIO 303,000 KMS)
              1.-COTIZACIÓN/ 2.-AUTORIZACIÓN/ 3.-FACTURA/ 4.-GALERÍA/ 5.-ENCUESTA DE SATISFACCIÓN/
              (lo demás del evento, tal cual)
        SIN FECHA/<evento>/                   lo que no se puede fechar con certeza
     2.-MARCAJE DE LLANTAS/                   tal cual
     BITACORA INGRESO A TALLER….xlsx          tal cual, en la raíz
     _POR REVISAR/                            plano: "<de dónde venía> - <nombre>"

La fecha del evento (decidido con el usuario el 15-oct-2026), en este orden:
  1. su factura de Ingreso (CFDI, la fecha que timbró el SAT; si trae dos, la más vieja);
  2. si solo trae complementos de pago: la factura que paga el complemento (por su folio fiscal), esté donde esté;
  3. si no aparece: la fecha del pago;
  4. sin XML: el año y mes de la carpeta del área (<año>/<mes>);
  5. lo demás a SIN FECHA (la carpeta "2024" sola no dice el año: la mitad es de 2022–2023). Las fotos con fecha en el
     nombre (WhatsApp Image 2022-06-30…) salen como sugerencia en el Excel, no deciden solas.
El relleno "¡CARPETA SIN INFORMACIÓN!" (658 copias en meses vacíos) y las carpetas que quedan vacías van a _PAPELERA.
"""
import sys, json, re, collections, threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import reglas

RAIZ = "2.-SERVICIOS"
LIBRETA = "1.-LIBRETA DE SERVICIOS"
MARCAJE = "2.-MARCAJE DE LLANTAS"
SIN_FECHA = "SIN FECHA"
POR_REVISAR = "_POR REVISAR"
MESES = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE",
         "DICIEMBRE"]
SUBS = [("1.-COTIZACIÓN", r"COTIZACI"), ("2.-AUTORIZACIÓN", r"AUTORIZACI"), ("3.-FACTURA", r"FACTURA|XML"),
        ("4.-GALERÍA", r"GALERI|EVIDENCIA|FOTOS?$"), ("5.-ENCUESTA DE SATISFACCIÓN", r"ENCUESTA")]
N = lambda s: re.sub(r"\s+", " ", reglas.normal(s)).strip()
RE_ANIO = re.compile(r"^(20\d\d)$")
RE_MES = re.compile(r"^\d{0,2}\W*(" + "|".join(MESES) + r"|SETIEMBRE)\W*(20\d\d)?$")
RE_CONTENEDOR = re.compile(r"LIBRETA|^\d*\W*SERVICIOS?( VEHICULAR(ES)?)?$|^C\.?\W?I\b|CONTROL INTERNO|^\d*\W*MANTENIMIENTOS( 20\d\d)?$|"
                           r"^NUEVA CARPETA$|^2\W*SERVICIOS$")
RE_MARCAJE = re.compile(r"MARCAJE|MARCADO DE LLANTAS")
RE_AJENO = re.compile(r"VERIFICACI|TENENCIA|POLIZA|REPUVE|INSPECCI|ALTA DE PLACAS|TARJETA DE CIRCULACI")
RE_BITACORA = re.compile(r"BITACORA.*TALLER")
RE_FOTO_FECHA = re.compile(r"(20[12]\d)[-_]?(0[1-9]|1[0-2])[-_]?(0[1-9]|[12]\d|3[01])")


def sub_de(nombre):
    """FACTURA 2, 3.-FACTURA, COTIZACIONES, ENCUESTA… → su nombre parejo (o None si no es subcarpeta de evento)."""
    n = re.sub(r"^\d+\W*", "", N(nombre))
    n = re.sub(r"\s*\d+$", "", n)
    for nuevo, rx in SUBS:
        if re.match("(" + rx + ")", n) and len(n) <= 30:
            return nuevo
    return None


def clase(nombre):
    n = N(nombre)
    if RE_ANIO.match(n):
        return "ANIO"
    if RE_MES.match(n):
        return "MES"
    if RE_MARCAJE.search(n):
        return "MARCAJE"
    if sub_de(nombre):
        return "SUB"
    if RE_CONTENEDOR.search(n) and not re.search(r"\d{3}|KM|AFINACION|GARANTIA", n):
        return "CONTENEDOR"
    return "EVENTO"


def mes_de(nombre):
    m = RE_MES.match(N(nombre))
    return (MESES.index(m.group(1)) + 1 if m.group(1) in MESES else 9) if m else None


# ---------------------------------------------------------------- XML

def leer_xml(texto):
    attrs = lambda s: dict(re.findall(r'([\w:]+)="([^"]*)"', s or ""))
    comp = re.search(r"<(?:\w+:)?Comprobante\b([^>]*)>", texto)
    if not comp:
        return dict(cfdi=False, fecha="", tipo="")
    c = attrs(comp.group(1))
    emi = re.search(r"<(?:\w+:)?Emisor\b([^>]*)/?>", texto)
    tim = re.search(r"<(?:\w+:)?TimbreFiscalDigital\b([^>]*)/?>", texto)
    em, ti = attrs(emi.group(1) if emi else ""), attrs(tim.group(1) if tim else "")
    pagos = [attrs(p).get("FechaPago", "") for p in re.findall(r"<(?:\w+:)?Pago\b([^>]*)>", texto)]
    rel = [attrs(x).get("IdDocumento", "").upper() for x in re.findall(r"<(?:\w+:)?DoctoRelacionado\b([^>]*)/?>", texto)]
    return dict(cfdi=True, fecha=c.get("Fecha", ""), tipo=c.get("TipoDeComprobante", ""), total=c.get("Total", ""),
                emisor=em.get("Nombre", ""), rfc=em.get("Rfc", ""), uuid=ti.get("UUID", "").upper(),
                fecha_pago=min((p for p in pagos if p), default=""), relacionados=[r for r in rel if r])


def xml(dir_):
    import expediente as e
    d = Path(dir_)
    foto = json.load(open(d / "foto.json", encoding="utf-8"))
    hechos = json.load(open(d / "xml.json", encoding="utf-8")) if (d / "xml.json").exists() else {}
    es_xml = lambda a: a["name"].lower().endswith(".xml") or a["mime"] in ("text/xml", "application/xml")
    faltan = [a for a in foto["archivos"] if es_xml(a) and a["id"] not in hechos]
    print("XML a leer: %d (ya leídos %d)" % (len(faltan), len(hechos)), flush=True)
    candado, local = threading.Lock(), threading.local()

    def uno(a):
        if not hasattr(local, "d"):
            local.d = e.drive()
        try:
            datos = e.llamar(local.d.files().get_media(fileId=a["id"]))
            r = leer_xml(datos.decode("utf-8", "replace"))
        except Exception as err:            # un XML que no se deja leer no detiene a los demás
            r = dict(cfdi=False, fecha="", tipo="", error=str(err)[:200])
        with candado:
            hechos[a["id"]] = r
            if len(hechos) % 200 == 0:
                json.dump(hechos, open(d / "xml.json", "w", encoding="utf-8"), ensure_ascii=False)
                print("  %d" % len(hechos), flush=True)

    with ThreadPoolExecutor(max_workers=6) as pool:
        list(pool.map(uno, faltan))
    json.dump(hechos, open(d / "xml.json", "w", encoding="utf-8"), ensure_ascii=False)
    print("listo: %d XML; %s" % (len(hechos), dict(collections.Counter(v.get("tipo") or "no CFDI" for v in hechos.values()))))


# ---------------------------------------------------------------- dry run

def dry_run(dir_):
    d = Path(dir_)
    foto = json.load(open(d / "foto.json", encoding="utf-8"))
    xmls = json.load(open(d / "xml.json", encoding="utf-8"))
    C, A = foto["carpetas"], foto["archivos"]
    carpeta = {c["id"]: c for c in C}

    # La raíz buena de cada NUCO (2.-SERVICIOS); las demás que la foto trajo (260 - SERVICIO…) son eventos sueltos
    principal = {}
    for r in foto["raices"]:
        if re.match(r"^2\W*SERVICIOS$", N(r["name"])) and r["nuco"] not in principal:
            principal[r["nuco"]] = r["id"]
    raiz_ids = {r["id"]: r for r in foto["raices"]}

    # El relleno: la imagen "¡CARPETA SIN INFORMACIÓN!" (por md5, venga con el nombre que venga)
    md5s = collections.Counter(a.get("md5") for a in A if a.get("md5"))
    relleno_md5 = {m for m, k in md5s.items() if k >= 50 and any(a.get("md5") == m and a["mime"].startswith("image/") for a in A)}

    # Las facturas de Ingreso por folio fiscal (para los complementos de pago)
    ingreso_por_uuid = {}
    for v in xmls.values():
        if v.get("tipo") == "I" and v.get("uuid") and v.get("fecha"):
            u = v["uuid"]
            if u not in ingreso_por_uuid or v["fecha"] < ingreso_por_uuid[u]:
                ingreso_por_uuid[u] = v["fecha"]

    # Una carpeta que trae años o meses adentro es un contenedor, nunca un evento (copias de otras carpetas pegadas en el
    # NUCO: "CI/Gerente Esteban Ruiz/2024/SERVICIO/<evento>", "GERENCIA SERVICIO VEHICULAR/2025/MARZO/…")
    con_tiempo = set()
    for c in C:
        if clase(c["name"]) in ("ANIO", "MES"):
            p = c["padre"]
            while p in carpeta and p not in con_tiempo:
                con_tiempo.add(p)
                p = carpeta[p]["padre"]

    # 1) Cada archivo: su camino de carpetas desde la raíz (con la clase de cada una)
    def cadena(a):
        """[(id, nombre, clase)] de la raíz hacia abajo, sin la raíz principal (una raíz extra cuenta como evento)."""
        out, cid = [], a["padre"]
        while cid in carpeta:
            c = carpeta[cid]
            k = clase(c["name"])
            out.append((cid, c["name"], "CONTENEDOR" if k == "EVENTO" and cid in con_tiempo else k))
            cid = c["padre"]
        if cid in raiz_ids and cid != principal.get(a["nuco"]):
            out.append((cid, raiz_ids[cid]["name"], "EVENTO"))
        return list(reversed(out))

    eventos = {}            # id de la carpeta del evento → datos
    ubic = {}               # id de archivo → (tipo, evento_id | None, resto de la ruta dentro del evento o del contenedor)
    for a in A:
        cad = cadena(a)
        anio = mes = None
        tipo, ev, resto = "SUELTO", None, []
        for i, (cid, nombre, k) in enumerate(cad):
            if k == "ANIO":
                anio = int(N(nombre))
            elif k == "MES":
                mes = mes_de(nombre)
                y = RE_MES.match(N(nombre)).group(2)
                anio = int(y) if y else anio
            elif k == "MARCAJE":
                tipo, resto = "MARCAJE", [x[1] for x in cad[i + 1:]]
                break
            elif k in ("EVENTO", "SUB"):
                if k == "SUB" and i == 0:
                    # Una subcarpeta (FACTURA…) directo en la raíz: sin evento que la contenga
                    tipo, resto = "SUELTO", [x[1] for x in cad[i:]]
                    break
                if k == "SUB":
                    # FACTURA directo en un mes o un contenedor: el evento es el de arriba, sin nombre
                    cid_ev, nombre_ev, resto_cad = cad[i - 1][0], "SERVICIO SIN NOMBRE", cad[i:]
                else:
                    cid_ev, nombre_ev, resto_cad = cid, nombre.strip(), cad[i + 1:]
                tipo, ev = "EVENTO", cid_ev
                eventos.setdefault(cid_ev, dict(id=cid_ev, nuco=a["nuco"], nombre=nombre_ev, anio=anio, mes=mes,
                                                origen="/".join(x[1] for x in cad[:i + (1 if k == "EVENTO" else 0)]),
                                                archivos=[]))
                resto = [x[1] for x in resto_cad]
                break
        ubic[a["id"]] = (tipo, ev, resto, anio, mes)
        if ev:
            eventos[ev]["archivos"].append(a)

    # Una factura suelta con su XML (T2200 NUCO 28.xml + .pdf, directo en un contenedor): forma su propio evento, con
    # el nombre del archivo, y sus archivos van a 3.-FACTURA
    raiz_tallo = lambda nombre: re.sub(r"\.[^.]+$", "", nombre).strip()
    sueltos = collections.defaultdict(list)
    for a in A:
        if ubic[a["id"]][0] == "SUELTO":
            sueltos[(a["padre"], raiz_tallo(a["name"]))].append(a)
    for (padre, tallo), grupo in sueltos.items():
        if not any(xmls.get(a["id"], {}).get("tipo") == "I" for a in grupo):
            continue
        cid_ev = "suelto:%s:%s" % (padre, tallo)
        a0 = grupo[0]
        eventos[cid_ev] = dict(id=cid_ev, nuco=a0["nuco"], nombre=tallo, anio=ubic[a0["id"]][3], mes=ubic[a0["id"]][4],
                               origen="/".join(a0["ruta"][1:-1]), archivos=list(grupo))
        for a in grupo:
            ubic[a["id"]] = ("EVENTO", cid_ev, ["3.-FACTURA"], ubic[a["id"]][3], ubic[a["id"]][4])

    # 2) La fecha de cada evento
    fuentes = collections.Counter()
    for ev in eventos.values():
        xs = [xmls[a["id"]] for a in ev["archivos"] if a["id"] in xmls]
        ing = sorted(x["fecha"] for x in xs if x.get("tipo") == "I" and x.get("fecha"))
        pagos = [x for x in xs if x.get("tipo") == "P"]
        rel = sorted(ingreso_por_uuid[u] for x in pagos for u in x.get("relacionados", []) if u in ingreso_por_uuid)
        fpago = sorted((x.get("fecha_pago") or x.get("fecha")) for x in pagos if x.get("fecha_pago") or x.get("fecha"))
        if ing:
            f, fuente = ing[0], "factura de ingreso"
        elif rel:
            f, fuente = rel[0], "factura que paga el complemento"
        elif fpago:
            f, fuente = fpago[0], "fecha del pago"
        elif ev["anio"] and ev["mes"]:
            f, fuente = "%04d-%02d" % (ev["anio"], ev["mes"]), "carpeta año/mes del área"
        else:
            f, fuente = "", "sin fecha"
        ev["fecha"], ev["fuente"] = f[:7], fuente
        ev["varias"] = len({x[:7] for x in ing}) > 1
        fotos = sorted({"%s-%s-%s" % m.groups() for a in ev["archivos"] for m in [RE_FOTO_FECHA.search(a["name"])] if m})
        ev["sugerencia"] = (fotos[0] + (" … " + fotos[-1] if len(fotos) > 1 else "")) if fotos and not f else ""
        ev["ajeno"] = bool(RE_AJENO.search(N(ev["nombre"] + " " + ev["origen"])))
        fuentes[fuente] += 1

    def carpeta_evento(ev):
        if ev["fecha"]:
            y, m = int(ev["fecha"][:4]), int(ev["fecha"][5:7])
            return [LIBRETA, str(y), "%02d.-%s" % (m, MESES[m - 1]), ev["nombre"]]
        return [LIBRETA, SIN_FECHA, ev["nombre"]]

    # 3) El plan de cada archivo
    plan = []
    for a in A:
        tipo, ev_id, resto, anio_c, mes_c = ubic[a["id"]]
        antes = "/".join([a["nuco"]] + a["ruta"])
        base = dict(id=a["id"], nuco=a["nuco"], antes=antes, md5=a.get("md5"), mime=a["mime"], aviso="", destino_tipo="",
                    evento="", fecha="", fuente="")
        if a.get("md5") in relleno_md5 or reglas.es_relleno(a["name"]):
            plan.append(dict(base, accion="PAPELERA", despues="", aviso="relleno '¡CARPETA SIN INFORMACIÓN!': no es documento"))
            continue
        if tipo == "MARCAJE":
            # Con el año y mes de la carpeta del área, si los dice
            cuando = [str(anio_c), "%02d.-%s" % (mes_c, MESES[mes_c - 1])] if anio_c and mes_c else []
            plan.append(dict(base, accion="MOVER", despues="/".join([a["nuco"], RAIZ, MARCAJE] + cuando + resto + [a["name"]]),
                             destino_tipo="MARCAJE"))
            continue
        if tipo == "EVENTO":
            ev = eventos[ev_id]
            if ev["ajeno"]:
                plan.append(dict(base, accion="REVISAR", despues="", aviso="no parece de servicios: " + ev["nombre"]))
                continue
            dentro = list(resto)
            if dentro and sub_de(dentro[0]):
                dentro[0] = sub_de(dentro[0])
            plan.append(dict(base, accion="MOVER", despues="/".join([a["nuco"], RAIZ] + carpeta_evento(ev) + dentro + [a["name"]]),
                             destino_tipo="EVENTO" if ev["fecha"] else "SIN FECHA", evento=ev["nombre"], fecha=ev["fecha"],
                             fuente=ev["fuente"]))
            continue
        # Suelto (directo en la raíz, un contenedor, un año o un mes)
        if RE_BITACORA.search(N(a["name"])):
            plan.append(dict(base, accion="MOVER", despues="/".join([a["nuco"], RAIZ, a["name"]]), destino_tipo="BITACORA"))
            continue
        plan.append(dict(base, accion="REVISAR", despues="", aviso="suelto fuera de un evento" + (" (factura)" if a["id"] in xmls else "")))

    # _POR REVISAR plano: el nombre lleva de dónde venía
    for p in plan:
        if p["accion"] == "REVISAR":
            a = por_id(A)[p["id"]]
            origen = next((s.strip() for s in reversed(a["ruta"][1:-1])), "")
            p.update(accion="MOVER", destino_tipo="POR REVISAR",
                     despues="/".join([a["nuco"], RAIZ, POR_REVISAR, (origen + " - " if origen else "") + a["name"]]))

    # Choques de nombre en el destino: idéntico (mismo md5) → papelera; otro contenido → (2)
    por_ruta = collections.defaultdict(list)
    for p in plan:
        if p["accion"] == "MOVER":
            por_ruta[p["despues"]].append(p)
    for ruta, ps in list(por_ruta.items()):
        if len(ps) > 1:
            base_, ext = re.match(r"(.*?)(\.[^./]+)?$", ruta).groups()
            vistos, n = {ps[0]["md5"]}, 2
            for p in ps[1:]:
                if p["md5"] and p["md5"] in vistos:
                    p.update(accion="PAPELERA", despues="", aviso="idéntico a otro que llega al mismo lugar")
                    continue
                vistos.add(p["md5"])
                while "%s (%d)%s" % (base_, n, ext or "") in por_ruta:
                    n += 1
                p["despues"] = "%s (%d)%s" % (base_, n, ext or "")
                p["aviso"] = (p["aviso"] + "; " if p["aviso"] else "") + "mismo nombre, otro contenido: va con (%d)" % n
                n += 1
    for p in plan:
        if p["accion"] == "MOVER" and p["antes"] == p["despues"]:
            p["accion"] = "IGUAL"

    # Revisiones de seguridad
    assert len(plan) == len(A), "cada archivo tiene su destino"
    vivos = [p["despues"] for p in plan if p["accion"] in ("MOVER", "IGUAL")]
    assert len(set(vivos)) == len(vivos), "dos archivos no terminan en la misma ruta"
    for p in plan:
        assert p["accion"] == "PAPELERA" or p["despues"].split("/")[:2] == [p["nuco"], RAIZ], "nada sale de su NUCO ni de 2.-SERVICIOS"
        assert p["accion"] != "PAPELERA" or p["aviso"], "nada va a la papelera sin motivo"

    json.dump(dict(plan=plan, eventos={k: {x: y for x, y in v.items() if x != "archivos"} for k, v in eventos.items()}),
              open(d / "plan.json", "w", encoding="utf-8"), ensure_ascii=False)
    resumen(plan, eventos, fuentes)
    excel(d / "dry-run.xlsx", plan, eventos)


_por_id = {}


def por_id(A):
    if not _por_id:
        _por_id.update({a["id"]: a for a in A})
    return _por_id


def resumen(plan, eventos, fuentes):
    acc = collections.Counter(p["accion"] for p in plan)
    print("archivos %d | %s" % (len(plan), dict(acc)))
    print("por destino:", dict(collections.Counter(p["destino_tipo"] or p["accion"] for p in plan)))
    print("eventos %d | fecha por: %s" % (len(eventos), dict(fuentes)))
    print("  con facturas de ingreso de dos meses (se toma la más vieja):", sum(1 for v in eventos.values() if v["varias"]))
    print("  SIN FECHA con sugerencia por fotos:", sum(1 for v in eventos.values() if not v["fecha"] and v["sugerencia"]))
    print("  no parecen de servicios (a _POR REVISAR):", sum(1 for v in eventos.values() if v["ajeno"]))
    print("papelera por motivo:", dict(collections.Counter(p["aviso"] for p in plan if p["accion"] == "PAPELERA")))
    print("choques (2):", sum(1 for p in plan if "mismo nombre" in p["aviso"]))
    prof = collections.Counter(len(p["despues"].split("/")) - 2 for p in plan if p["accion"] in ("MOVER", "IGUAL"))
    print("niveles bajo 2.-SERVICIOS (archivos por profundidad):", sorted(prof.items()))


def excel(ruta, plan, eventos):
    from openpyxl import Workbook
    from openpyxl.styles import Font
    wb = Workbook()
    ws = wb.active
    ws.title = "EVENTOS"
    ws.append(["NUCO", "Evento", "Dónde estaba", "Va a", "Fecha", "De dónde sale la fecha", "Archivos", "Sugerencia (fotos)",
               "Aviso"])
    for v in sorted(eventos.values(), key=lambda v: (int(v["nuco"]), v["fecha"] or "9", v["nombre"])):
        destino = "/".join([LIBRETA, v["fecha"][:4], "%s.-%s" % (v["fecha"][5:7], MESES[int(v["fecha"][5:7]) - 1])] if v["fecha"]
                           else [LIBRETA, SIN_FECHA])
        ws.append([int(v["nuco"]), v["nombre"], v["origen"], "_POR REVISAR" if v["ajeno"] else destino, v["fecha"], v["fuente"],
                   len(v["archivos"]), v["sugerencia"],
                   ("no parece de servicios" if v["ajeno"] else "") + ("facturas de dos meses" if v["varias"] else "")])
    ws2 = wb.create_sheet("ARCHIVOS")
    ws2.append(["NUCO", "Acción", "Antes", "Después", "Tipo", "Fecha", "Fuente", "Aviso", "Liga"])
    for p in sorted(plan, key=lambda p: (int(p["nuco"]), p["despues"] or p["antes"])):
        ws2.append([int(p["nuco"]), p["accion"], p["antes"], p["despues"], p["destino_tipo"], p["fecha"], p["fuente"], p["aviso"],
                    "https://drive.google.com/file/d/%s/view" % p["id"]])
    ws3 = wb.create_sheet("RESUMEN")
    for k, v in collections.Counter(p["destino_tipo"] or p["accion"] for p in plan).most_common():
        ws3.append([k, v])
    ws3.append([])
    for k, v in collections.Counter(v["fuente"] for v in eventos.values()).most_common():
        ws3.append(["eventos: " + k, v])
    for w in (ws, ws2, ws3):
        for c in w[1]:
            c.font = Font(bold=True)
        w.freeze_panes = "A2"
    wb.move_sheet("RESUMEN", offset=-2)
    wb.save(ruta)
    print("Excel:", ruta)


if __name__ == "__main__":
    paso, dir_ = sys.argv[1], sys.argv[2]
    {"xml": xml, "dry-run": dry_run}[paso](dir_)
