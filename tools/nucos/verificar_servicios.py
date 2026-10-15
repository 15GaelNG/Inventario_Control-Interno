"""SOLO LECTURA: ¿quedó cada NUCO como dice el plan de 2.-SERVICIOS? Independiente del ejecutor (inspecciones.py).

Uso: verificar_servicios.py <plan.json> <foto.json> --nucos 221[,…] | --todos [--contra-foto]
     --contra-foto: después de deshacer, que todo (archivos y carpetas) esté otra vez como en la foto.

Por cada NUCO lee en vivo TODO su árbol (con md5) y revisa:
  1. cada archivo del plan que se mueve está en la ruta exacta del plan, con el mismo md5 y dentro de su NUCO;
  2. cada archivo que va a la papelera está en NUCOS VEHICULOS/_PAPELERA (y no en el NUCO);
  3. bajo 2.-SERVICIOS no hay archivos que el plan no conozca, ni carpetas vacías, ni carpetas de la estructura vieja
     (todo cuelga de 1.-LIBRETA DE SERVICIOS, 2.-MARCAJE DE LLANTAS, _POR REVISAR o son las bitácoras de la raíz).
"""
import sys, json, collections, unicodedata
import expediente as e
import reglas

RAIZ = "2.-SERVICIOS"
PERMITIDAS = {"1.-LIBRETA DE SERVICIOS", "2.-MARCAJE DE LLANTAS", "_POR REVISAR"}
nfc = lambda s: unicodedata.normalize("NFC", (s or "").strip())


def arbol(d, raiz_id):
    """{id: dict(padre, nombre, carpeta, md5)} de todo lo que hay bajo raiz_id."""
    out, pend = {}, [raiz_id]
    while pend:
        hijos = e.hijos_de(d, pend)
        pend = []
        for p, hs in hijos.items():
            for h in hs:
                es = h["mimeType"] == reglas.CARPETA
                out[h["id"]] = dict(padre=p, nombre=h["name"], carpeta=es, md5=h.get("md5Checksum"))
                if es:
                    pend.append(h["id"])
    return out


def verificar(plan_json, foto_json, nucos, contra_foto=False):
    d = e.drive()
    plan = json.load(open(plan_json, encoding="utf-8"))["plan"]
    foto = json.load(open(foto_json, encoding="utf-8"))
    nuco_id = {r["nuco"]: r["nuco_id"] for r in foto["raices"] if r["nuco"].isdigit()}
    nuco_nombre = {r["nuco_id"]: r["nuco"] for r in foto["raices"]}
    plan_de = collections.defaultdict(list)
    for p in plan:
        plan_de[p["nuco"]].append(p)
    if nucos == ["*"]:
        nucos = sorted((n for n, ps in plan_de.items() if any(p["accion"] != "IGUAL" for p in ps)), key=int)
    pap = e.llamar(d.files().list(q="'%s' in parents and name = '_PAPELERA' and trashed = false" % e.NUCOS, fields="files(id)"))["files"]
    en_papelera = arbol(d, pap[0]["id"]) if pap else {}
    total, malos = collections.Counter(), []
    for nuco in nucos:
        vivo = arbol(d, nuco_id[nuco])

        def ruta(i):
            partes = []
            while i in vivo:
                partes.insert(0, vivo[i]["nombre"])
                i = vivo[i]["padre"]
            return "/".join([nuco] + partes)

        c, mal = collections.Counter(), []
        conocidos = set()
        if contra_foto:
            # Cada archivo y cada carpeta de la foto, otra vez en su lugar; y nada más bajo la raíz
            fot = [x for x in foto["archivos"] + foto["carpetas"] if x["nuco"] == nuco]
            for x in fot:
                esperada = "/".join([nuco] + x["ruta"])
                if x["id"] not in vivo:
                    mal.append("NO ESTÁ: " + esperada)
                elif nfc(ruta(x["id"])) != nfc(esperada):
                    mal.append("otra ruta: %s  (foto: %s)" % (ruta(x["id"]), esperada))
                else:
                    c["como en la foto"] += 1
            ids = {x["id"] for x in fot}
            raiz = next(r["id"] for r in foto["raices"] if r["nuco"] == nuco)
            mal += ["no estaba en la foto: " + ruta(i) for i in vivo if i not in ids and i != raiz and ruta(i).split("/")[1:2] == [RAIZ]]
            print("NUCO %s: %s | problemas: %d" % (nuco, dict(c), len(mal)))
            for m in mal[:8]:
                print("   ✘ " + m)
            total.update(c)
            total["problemas"] += len(mal)
            malos += mal
            continue
        for p in plan_de[nuco]:
            conocidos.add(p["id"])
            if p["accion"] == "PAPELERA":
                if p["id"] in en_papelera and p["id"] not in vivo:
                    c["en la papelera"] += 1
                else:
                    mal.append("no está en _PAPELERA: " + p["antes"])
                continue
            v = vivo.get(p["id"])
            if not v:
                mal.append("NO ESTÁ en el NUCO: " + p["antes"])
            elif nfc(ruta(p["id"])) != nfc(p["despues"]):
                mal.append("otra ruta: %s  (plan: %s)" % (ruta(p["id"]), p["despues"]))
            elif p.get("md5") and v["md5"] != p["md5"]:
                mal.append("otro contenido (md5): " + p["despues"])
            else:
                c["en su lugar"] += 1
        bajo = {i: v for i, v in vivo.items() if ruta(i).split("/")[1:2] == [RAIZ] and ruta(i).count("/") >= 2}
        nuevos = [ruta(i) for i, v in bajo.items() if not v["carpeta"] and i not in conocidos]
        con_hijos = {v["padre"] for v in vivo.values()}
        vacias = [ruta(i) for i, v in bajo.items() if v["carpeta"] and i not in con_hijos]
        viejas = sorted({ruta(i).split("/")[2] for i, v in bajo.items() if v["carpeta"]} - PERMITIDAS)
        sueltos_raiz = [ruta(i) for i, v in bajo.items() if not v["carpeta"] and ruta(i).count("/") == 2
                        and "BITACORA" not in reglas.normal(v["nombre"])]
        mal += ["archivo que el plan no conoce: " + x for x in nuevos] + ["carpeta vacía: " + x for x in vacias] + \
               ["carpeta fuera de la estructura: %s/%s/%s" % (nuco, RAIZ, x) for x in viejas] + \
               ["archivo suelto en la raíz: " + x for x in sueltos_raiz]
        prof = max((ruta(i).count("/") - 1 for i, v in bajo.items() if not v["carpeta"]), default=0)
        print("NUCO %s: %s | problemas: %d | profundidad máx. bajo %s: %d" % (nuco, dict(c), len(mal), RAIZ, prof))
        for m in mal[:8]:
            print("   ✘ " + m)
        total.update(c)
        total["problemas"] += len(mal)
        malos += mal
    print("\nTOTAL: %s" % dict(total))
    return not malos


if __name__ == "__main__":
    a = sys.argv[1:]
    if len(a) < 3 or ("--nucos" not in a and "--todos" not in a):
        sys.exit(__doc__)
    ok = verificar(a[0], a[1], ["*"] if "--todos" in a else a[a.index("--nucos") + 1].split(","), "--contra-foto" in a)
    sys.exit(0 if ok else 1)
