"""SOLO LECTURA: ¿cada archivo del plan está hoy en Drive donde el plan dice? (homologar 4.- INSPECCIONES)

Uso: verificar_inspecciones.py <plan.json> <foto.json> --nucos 113[,…] [--arbol]
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


def arbol_vivo_plano(d, raiz):
    return [{"id": i} for i in arbol_vivo(d, raiz)]


if __name__ == "__main__":
    a = sys.argv[1:]
    verificar(a[0], a[1], a[a.index("--nucos") + 1].split(","), "--arbol" in a)
