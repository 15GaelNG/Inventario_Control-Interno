"""SOLO LECTURA: el árbol completo de la carpeta de inspecciones de cada NUCO (carpetas con ID y archivos)."""
import sys, json, re
sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parent))
import expediente as e, reglas

d = e.drive()
CARP = reglas.CARPETA
nucos = [f for f in e.hijos_de(d, [e.NUCOS])[e.NUCOS] if f["mimeType"] == CARP]
hijos = e.hijos_de(d, [f["id"] for f in nucos])
CLAVE = sys.argv[2] if len(sys.argv) > 2 else "INSPECC"
es_insp = lambda n: CLAVE in re.sub(r"[^A-Z]", "", reglas.normal(n))
carpetas, archivos, raices = [], [], []
nivel = []
for f in nucos:
    for h in hijos[f["id"]]:
        if h["mimeType"] == CARP and es_insp(h["name"]):
            raices.append(dict(nuco=f["name"], nuco_id=f["id"], id=h["id"], name=h["name"]))
            nivel.append((h["id"], f["name"], [h["name"]]))
for prof in range(8):
    if not nivel:
        break
    h = e.hijos_de(d, [i for i, _, _ in nivel])
    sig = []
    for i, nuco, ruta in nivel:
        for x in h[i]:
            r = ruta + [x["name"]]
            base = dict(id=x["id"], name=x["name"], padre=i, nuco=nuco, ruta=r, prof=prof)
            if x["mimeType"] == CARP:
                carpetas.append(base)
                sig.append((x["id"], nuco, r))
            else:
                archivos.append(dict(base, mime=x["mimeType"], md5=x.get("md5Checksum"), size=x.get("size"),
                                     modificado=x.get("modifiedTime")))
    nivel = sig
json.dump(dict(nucos=[dict(id=f["id"], name=f["name"]) for f in nucos], raices=raices, carpetas=carpetas, archivos=archivos),
          open(sys.argv[1], "w", encoding="utf-8"), ensure_ascii=False)
print("NUCO %d | con inspecciones %d | carpetas %d | archivos %d" % (len(nucos), len(raices), len(carpetas), len(archivos)))
