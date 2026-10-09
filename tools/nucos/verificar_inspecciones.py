"""SOLO LECTURA: ¿cada archivo del plan está hoy en Drive donde el plan dice? (homologar 4.- INSPECCIONES)

Uso: verificar_inspecciones.py <plan.json> <foto.json> (--nucos 113[,…] | --todos) [--arbol]
     verificar_inspecciones.py x x --contra-foto <foto.json> --nucos 482   (después de deshacer)
"""
import sys, json, collections, unicodedata
import expediente as e
from inspecciones import arbol_vivo, RAIZ, PAPELERA

nfc = lambda s: unicodedata.normalize("NFC", (s or "").strip())


def verificar(plan_json, foto_json, nucos, arbol=False):
    d = e.drive()
    plan = json.load(open(plan_json, encoding="utf-8"))["plan"]
    foto = json.load(open(foto_json, encoding="utf-8"))
    raiz_de = {r["nuco"]: r for r in foto["raices"]}
    pap = e.llamar(d.files().list(q="'%s' in parents and name = '%s' and trashed = false" % (e.NUCOS, PAPELERA),
                                  fields="files(id)"))["files"]
    en_papelera = {f["id"] for f in arbol_vivo_plano(d, pap[0]["id"])} if pap else set()
    total = collections.Counter()
    for nuco in nucos:
        nuco_id = raiz_de[nuco]["nuco_id"]
        vivo = arbol_vivo(d, nuco_id)              # todo el NUCO: 4.- INSPECCIONES y 1.-DOCUMENTACIÓN

        def ruta(i):
            partes = []
            while i in vivo:
                padre, nombre, _ = vivo[i]
                partes.insert(0, nombre)
                i = padre
            return "/".join([nuco] + partes)

        mal = []
        for p in (p for p in plan if p["nuco"] == nuco):
            if p["accion"] == "PAPELERA":
                ok = p["id"] not in vivo and (p["id"] in en_papelera or True)
                total["papelera ok" if ok else "papelera MAL"] += 1
                if not ok:
                    mal.append(("sigue en el NUCO", p["antes"]))
                continue
            if p["id"] not in vivo:
                mal.append(("NO ESTÁ", p["despues"]))
                total["falta"] += 1
                continue
            if nfc(ruta(p["id"])) != nfc(p["despues"]):
                mal.append(("en otro lugar", ruta(p["id"]) + "   (esperado: " + p["despues"] + ")"))
                total["en otro lugar"] += 1
            else:
                total["en su lugar"] += 1
        # Carpetas que quedaron vacías dentro de 4.- INSPECCIONES
        con_hijos = {v[0] for v in vivo.values()}
        vacias = [ruta(i) for i, v in vivo.items() if v[2] and i not in con_hijos and ruta(i).split("/")[1] == RAIZ]
        nombres_n2 = sorted({ruta(i).split("/")[3] for i, v in vivo.items() if v[2] and len(ruta(i).split("/")) == 4
                             and ruta(i).split("/")[1] == RAIZ})
        profundidad = max((len(ruta(i).split("/")) - 2 for i, v in vivo.items() if not v[2] and ruta(i).split("/")[1] == RAIZ),
                          default=0)
        print("NUCO %s: %s | carpetas vacías: %d | profundidad máx. (carpetas) bajo 4.- INSPECCIONES: %d"
              % (nuco, dict(total), len(vacias), profundidad - 1))
        print("  nivel 2:", nombres_n2)
        for m in mal[:20]:
            print("  ✗", *m)
        for v in vacias[:10]:
            print("  carpeta vacía:", v)
        if arbol:
            for linea in sorted(ruta(i) + ("/" if v[2] else "") for i, v in vivo.items()
                                if v[2] or ruta(i).split("/")[-1].upper().endswith(".PDF")):
                if linea.count("/") <= 5:
                    print("   ", linea)
        total.clear()


def contra_foto(foto_json, nucos):
    """Después de deshacer: ¿la carpeta de inspecciones quedó idéntica a la foto de antes? Cada archivo y carpeta en la
    misma carpeta y con el mismo nombre, nada de más y sin las appProperties de origen."""
    d = e.drive()
    foto = json.load(open(foto_json, encoding="utf-8"))
    for nuco in nucos:
        r = next(x for x in foto["raices"] if x["nuco"] == nuco)
        vivo = arbol_vivo(d, r["id"])
        antes = {c["id"]: (c["padre"], c["name"]) for c in foto["carpetas"] + foto["archivos"] if c["nuco"] == nuco}
        raiz = e.llamar(d.files().get(fileId=r["id"], fields="name,trashed"))
        mal = []
        if nfc(raiz["name"]) != nfc(r["name"]) or raiz.get("trashed"):
            mal.append("la raíz se llama %r (antes %r)" % (raiz["name"], r["name"]))
        for i, (padre, nombre) in antes.items():
            v = vivo.get(i)
            if not v:
                mal.append("falta: " + nombre)
            elif v[0] != padre or nfc(v[1]) != nfc(nombre):
                mal.append("distinto: %s (ahora %s)" % (nombre, v[1]))
        sobran = [v[1] for i, v in vivo.items() if i not in antes]
        con_app = 0
        for i in [i for i, v in vivo.items() if not v[2]][:400]:
            if e.llamar(d.files().get(fileId=i, fields="appProperties")).get("appProperties", {}).get("origen_padre"):
                con_app += 1
        print("NUCO %s: %d de %d como en la foto | sobran %d | con appProperties de origen %d (de %d revisados)"
              % (nuco, len(antes) - len(mal), len(antes), len(sobran), con_app, min(400, sum(1 for v in vivo.values() if not v[2]))))
        for m in (mal + ["sobra: " + s for s in sobran])[:15]:
            print("  ✗", m)


def arbol_vivo_plano(d, raiz):
    return [{"id": i} for i in arbol_vivo(d, raiz)]


if __name__ == "__main__":
    a = sys.argv[1:]
    if "--contra-foto" in a:
        contra_foto(a[a.index("--contra-foto") + 1], a[a.index("--nucos") + 1].split(","))
    else:
        if "--todos" in a:
            nucos = sorted({p["nuco"] for p in json.load(open(a[0], encoding="utf-8"))["plan"]}, key=int)
        else:
            nucos = a[a.index("--nucos") + 1].split(",")
        verificar(a[0], a[1], nucos, "--arbol" in a)
