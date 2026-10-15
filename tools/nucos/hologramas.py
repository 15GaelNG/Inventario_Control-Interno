"""Lo de hologramas / OXXO Gas a su carpeta: 1.-DOCUMENTACIÓN/7.-HOLOGRAMAS (usuario, 15-oct-2026).

La reorganización del 8-oct dejó lo de Oxxo Gas en 1.-DOCUMENTACIÓN/ANTERIORES/<ruta de antes> (no era ninguno de los 6
documentos). Desde el 15-oct es el 7.° (ExpedienteNuco.DOCUMENTOS.HOLOGRAMA; la app guarda ahí las solicitudes nuevas).
Esto mueve lo de antes a 7.-HOLOGRAMAS/HOLOGRAMAS ANTERIORES/, sin renombrar nada ni escoger un vigente:
    - cada CARPETA de ANTERIORES cuyo nombre diga OXXO u HOLOGRAMA se mueve completa (con su nombre y lo de adentro);
    - cada ARCHIVO de ANTERIORES que diga OXXO u HOLOGRAMA y no esté dentro de una de esas carpetas, se mueve suelto.
Lo que está en una ruta de VERIFICACIÓN no se toca ("HOLOGRAMA VERIFICACION H100.JPEG" es el engomado de emisiones,
no el de OXXO Gas). No se busca en DUPLICADOS (copias de algo que ya está en las 6) ni en ESTRUCTURA ANTERIOR (carpetas vacías o de relleno).
Todo conserva su ID: las ligas siguen abriendo. Nada sale de su NUCO.

    hologramas.py plan                 SOLO LECTURA → .cache/hologramas/plan.json (y el resumen)
    hologramas.py aplicar [NUCO …]     EN LA REAL: crea 7.-HOLOGRAMAS/HOLOGRAMAS ANTERIORES si falta y mueve.
                                       Bitácora .cache/bitacoras/<fecha>-hologramas.jsonl (+ respaldo en Drive)
    hologramas.py verificar            SOLO LECTURA: cada cosa en su destino, con el mismo contenido
    expediente.py deshacer <bitácora>  lo regresa a ANTERIORES (y tira las carpetas creadas si quedaron vacías)
"""
import sys, json, time, collections
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import expediente as e, reglas

C = e.CACHE / "hologramas"
PLAN = C / "plan.json"
SIETE, ANTERIORES_H = "7.-HOLOGRAMAS", "HOLOGRAMAS ANTERIORES"
NO_BUSCAR = {reglas.REPETIDOS, e.ESTRUCTURA_ANTERIOR}


def clave(nombre):
    return reglas.normal(nombre).replace(" ", "")


def es_holograma(nombre):
    n = reglas.normal(nombre)
    return "OXXO" in n or "HOLOGRAM" in n


def contenido(d, cid):
    """{id: md5} de todo lo que hay debajo (para verificar que no cambió)."""
    out, pend = {}, [cid]
    while pend:
        hs = e.hijos_de(d, pend)
        pend = []
        for l in hs.values():
            for h in l:
                if h["mimeType"] == reglas.CARPETA:
                    pend.append(h["id"])
                else:
                    out[h["id"]] = h.get("md5Checksum")
    return out


def plan():
    C.mkdir(parents=True, exist_ok=True)
    d = e.drive()
    nucos = {f["id"]: f["name"] for f in e.hijos_de(d, [e.NUCOS])[e.NUCOS] if f["mimeType"] == reglas.CARPETA and f["name"].isdigit()}
    docs = {}
    for nid, l in e.hijos_de(d, list(nucos)).items():
        for h in l:
            if h["mimeType"] == reglas.CARPETA and clave(h["name"]).startswith("1.-DOCUMENTACI"):
                docs[h["id"]] = nucos[nid]
    anteriores, siete = {}, {}
    for did, l in e.hijos_de(d, list(docs)).items():
        for h in l:
            if h["mimeType"] != reglas.CARPETA:
                continue
            if h["name"].strip() == reglas.ANTERIORES:
                anteriores[h["id"]] = (docs[did], did)
            elif clave(h["name"]) == clave(SIETE):
                siete[did] = h["id"]
    # Recorrer ANTERIORES por niveles; una carpeta que es de hologramas se toma completa (no se baja a ella)
    items = []
    nivel = {a: (n, doc, []) for a, (n, doc) in anteriores.items()}
    while nivel:
        sig = {}
        for padre, l in e.hijos_de(d, list(nivel)).items():
            nuco, doc, ruta = nivel[padre]
            for h in l:
                carpeta = h["mimeType"] == reglas.CARPETA
                if carpeta and not ruta and h["name"].strip() in NO_BUSCAR:
                    continue
                # El holograma de la VERIFICACIÓN (engomado de emisiones) no es el de OXXO Gas: se queda en su verificación
                if es_holograma(h["name"]) and not any("VERIFIC" in reglas.normal(p) for p in ruta + [h["name"]]):
                    items.append(dict(id=h["id"], nombre=h["name"], carpeta=carpeta, nuco=nuco, doc=doc, padre=padre,
                                      de="ANTERIORES/" + "/".join(ruta + [h["name"]])))
                elif carpeta:
                    sig[h["id"]] = (nuco, doc, ruta + [h["name"]])
        nivel = sig
    # El contenido de cada carpeta, para verificar después
    cont = {x["id"]: contenido(d, x["id"]) for x in items if x["carpeta"]}
    for x in items:
        x["archivos"] = len(cont[x["id"]]) if x["carpeta"] else 1
    # Nombres en el destino sin chocar entre sí (dos "9.-OXXO GAS" de rutas distintas en un NUCO: la segunda lleva (2))
    usados = collections.defaultdict(set)
    for x in items:
        base, n, nombre = x["nombre"].strip(), 2, x["nombre"].strip()
        while nombre.upper() in usados[x["doc"]]:
            nombre, n = "%s (%d)" % (base, n), n + 1
        usados[x["doc"]].add(nombre.upper())
        x["a_nombre"] = nombre
    json.dump(dict(items=items, contenido=cont, siete=siete), open(PLAN, "w", encoding="utf-8"), ensure_ascii=False)
    por = collections.Counter(x["de"].rsplit("/", 1)[0] if not x["carpeta"] else x["de"] for x in items)
    print("NUCO con algo de hologramas: %d | carpetas: %d | archivos sueltos: %d | archivos en total: %d | ya tienen %s: %d"
          % (len({x["nuco"] for x in items}), sum(x["carpeta"] for x in items), sum(not x["carpeta"] for x in items),
             sum(x["archivos"] for x in items), SIETE, len(siete)))
    print("De dónde (lo más común):")
    for k, v in collections.Counter(reglas.normal(x["de"]).split("/", 1)[1] if "/" in x["de"] else x["de"] for x in items).most_common(15):
        print("  %4d  %s" % (v, k))
    renombres = [x for x in items if x["a_nombre"] != x["nombre"].strip()]
    if renombres:
        print("Llevan (2) porque chocan en su NUCO: %s" % ", ".join("%s %s" % (x["nuco"], x["a_nombre"]) for x in renombres[:10]))


def aplicar(pedidos=None):
    d = e.drive()
    datos = json.load(open(PLAN, encoding="utf-8"))
    items = [x for x in datos["items"] if not pedidos or x["nuco"] in pedidos]
    bit = e.Bitacora(e.CACHE / "bitacoras" / (time.strftime("%Y%m%d-%H%M%S") + "-hologramas.jsonl"))
    hechos = collections.Counter()
    destino = {}

    def carpeta_en(padre, nombre, nuco):
        for h in e.hijos_de(d, [padre])[padre]:
            if h["mimeType"] == reglas.CARPETA and clave(h["name"]) == clave(nombre):
                return h["id"]
        nuevo = e.llamar(d.files().create(body={"name": nombre, "mimeType": reglas.CARPETA, "parents": [padre]},
                                          fields="id", supportsAllDrives=True))["id"]
        bit.anotar(accion="crear_carpeta", nuco=nuco, id=nuevo, padre=padre, nombre=nombre)
        hechos["carpetas creadas"] += 1
        return nuevo

    for x in items:
        if x["doc"] not in destino:
            destino[x["doc"]] = carpeta_en(carpeta_en(x["doc"], SIETE, x["nuco"]), ANTERIORES_H, x["nuco"])
        f = e.llamar(d.files().get(fileId=x["id"], fields="id,name,parents,trashed", supportsAllDrives=True))
        if f.get("trashed") or f.get("parents") != [x["padre"]]:
            hechos["no se tocó (cambió desde el plan)"] += 1
            bit.anotar(accion="saltado", nuco=x["nuco"], id=x["id"], motivo="cambió desde el plan")
            continue
        cambios = dict(fileId=x["id"], addParents=destino[x["doc"]], removeParents=x["padre"], fields="id", supportsAllDrives=True,
                       body={"name": x["a_nombre"]} if x["a_nombre"] != f["name"] else {})
        e.llamar(d.files().update(**cambios))
        bit.anotar(accion="mover", nuco=x["nuco"], id=x["id"], de_padre=x["padre"], de_nombre=f["name"],
                   a_padre=destino[x["doc"]], a_nombre=x["a_nombre"])
        hechos["carpetas movidas" if x["carpeta"] else "archivos movidos"] += 1
    print(dict(hechos))
    if bit.ruta.exists():
        e.respaldar_bitacora(bit.ruta)
        print("Bitácora:", bit.ruta)


def verificar():
    d = e.drive()
    datos = json.load(open(PLAN, encoding="utf-8"))
    ok, malos = 0, []
    padres = {}
    for x in datos["items"]:
        f = e.llamar(d.files().get(fileId=x["id"], fields="id,name,parents,trashed", supportsAllDrives=True))
        p = (f.get("parents") or [""])[0]
        if p not in padres:
            pf = e.llamar(d.files().get(fileId=p, fields="name,parents", supportsAllDrives=True))
            ab = e.llamar(d.files().get(fileId=pf["parents"][0], fields="name,parents", supportsAllDrives=True))
            padres[p] = (pf["name"], ab["name"], ab["parents"][0])
        nombre_p, nombre_ab, doc = padres[p]
        if f.get("trashed") or nombre_p != ANTERIORES_H or clave(nombre_ab) != clave(SIETE) or doc != x["doc"]:
            malos.append("%s %s: está en %s/%s" % (x["nuco"], x["nombre"], nombre_ab, nombre_p))
        elif x["carpeta"] and contenido(d, x["id"]) != datos["contenido"][x["id"]]:
            malos.append("%s %s: el contenido cambió" % (x["nuco"], x["nombre"]))
        else:
            ok += 1
    print("bien: %d | mal: %d" % (ok, len(malos)))
    for m in malos:
        print("   ✘", m)
    return not malos


if __name__ == "__main__":
    paso = sys.argv[1] if len(sys.argv) > 1 else ""
    if paso == "plan":
        plan()
    elif paso == "aplicar":
        aplicar(set(sys.argv[2:]) or None)
    elif paso == "verificar":
        sys.exit(0 if verificar() else 1)
    else:
        sys.exit(__doc__)
