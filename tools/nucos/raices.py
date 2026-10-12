"""Las 4 carpetas principales de cada NUCO con su nombre fijo, sin espacio después del guion (11-oct-2026):

    1.-DOCUMENTACIÓN   2.-SERVICIOS   3.-VERIFICACIONES   4.-INSPECCIONES

  raices.py dry-run              SOLO LECTURA: lee la raíz de cada NUCO y dice qué renombraría y qué crearía.
  raices.py aplicar [--nucos 1,2]  En la real: renombra las que tienen otro nombre y crea (vacías) las que faltan.
                                  Antes de tocar cada carpeta revisa que siga como la leyó. Bitácora en
                                  .cache/bitacoras/<fecha>-raices.jsonl (renombrar_carpeta / crear_carpeta), respaldo
                                  en Drive; se deshace con `expediente.py deshacer <bitácora>`.

Una carpeta se reconoce por su tipo (DOCUMENTAC, SERVIC, VERIFIC, INSPECC en el nombre sin espacios ni acentos). Si un
NUCO tuviera dos del mismo tipo no se toca (se reporta). La app (ExpedienteNuco.gs) usa los mismos nombres.
"""
import sys, json, re, time, collections
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import expediente as e, reglas

FIJOS = {"DOCUMENTAC": "1.-DOCUMENTACIÓN", "SERVIC": "2.-SERVICIOS", "VERIFIC": "3.-VERIFICACIONES", "INSPECC": "4.-INSPECCIONES"}
nfc = lambda s: __import__("unicodedata").normalize("NFC", s)


def tipo(nombre):
    t = re.sub(r"[^A-Z]", "", reglas.normal(nombre))
    return next((k for k in FIJOS if k in t), None)


def leer(d):
    nucos = [f for f in e.hijos_de(d, [e.NUCOS])[e.NUCOS] if f["mimeType"] == reglas.CARPETA and re.fullmatch(r"\d+", f["name"].strip())]
    hijos = e.hijos_de(d, [f["id"] for f in nucos])
    return nucos, hijos


def plan(nucos, hijos):
    acciones, raros = [], []
    for f in sorted(nucos, key=lambda f: int(f["name"])):
        por_tipo = collections.defaultdict(list)
        for x in hijos[f["id"]]:
            if x["mimeType"] == reglas.CARPETA and tipo(x["name"]):
                por_tipo[tipo(x["name"])].append(x)
        for k, fijo in FIJOS.items():
            xs = por_tipo.get(k, [])
            if len(xs) > 1:
                raros.append((f["name"], [x["name"] for x in xs]))
            elif len(xs) == 1 and nfc(xs[0]["name"]) != nfc(fijo):
                acciones.append(dict(accion="renombrar", nuco=f["name"], nuco_id=f["id"], id=xs[0]["id"], de=xs[0]["name"], a=fijo))
            elif not xs:
                acciones.append(dict(accion="crear", nuco=f["name"], nuco_id=f["id"], a=fijo))
    return acciones, raros


def dry_run():
    d = e.drive()
    nucos, hijos = leer(d)
    acciones, raros = plan(nucos, hijos)
    c = collections.Counter((a["accion"], a.get("de", "(no existe)"), a["a"]) for a in acciones)
    print("NUCO:", len(nucos))
    for (ac, de, a), n in sorted(c.items(), key=lambda x: (x[0][2], x[0][0])):
        print("  %4d  %-9s %-22r → %s" % (n, ac, de, a))
    print("NUCO con dos carpetas del mismo tipo (no se tocan):", raros)
    json.dump(dict(acciones=acciones, raros=raros), open(e.CACHE / "raices-plan.json", "w", encoding="utf-8"), ensure_ascii=False)


def aplicar(nucos_pedidos=None):
    d = e.drive()
    nucos, hijos = leer(d)
    acciones, raros = plan(nucos, hijos)
    if nucos_pedidos:
        acciones = [a for a in acciones if a["nuco"] in nucos_pedidos]
    bit = e.Bitacora(e.CACHE / "bitacoras" / (time.strftime("%Y%m%d-%H%M%S") + "-raices.jsonl"))
    hechos = collections.Counter()
    for a in acciones:
        if a["accion"] == "renombrar":
            vivo = e.llamar(d.files().get(fileId=a["id"], fields="name,parents,trashed"))
            if vivo["trashed"] or vivo["name"] != a["de"] or a["nuco_id"] not in vivo.get("parents", []):
                print("  cambió, no se toca:", a["nuco"], a["de"]); hechos["saltado"] += 1; continue
            e.llamar(d.files().update(fileId=a["id"], body={"name": a["a"]}, fields="id"))
            bit.anotar(accion="renombrar_carpeta", nuco=a["nuco"], id=a["id"], de_nombre=a["de"], a_nombre=a["a"])
            hechos["renombrada"] += 1
        else:
            hay = [x for x in e.hijos_de(d, [a["nuco_id"]])[a["nuco_id"]] if x["mimeType"] == reglas.CARPETA and tipo(x["name"]) == tipo(a["a"])]
            if hay:
                print("  ya existe, no se crea:", a["nuco"], hay[0]["name"]); hechos["saltado"] += 1; continue
            nueva = e.llamar(d.files().create(body={"name": a["a"], "mimeType": reglas.CARPETA, "parents": [a["nuco_id"]]}, fields="id"))
            bit.anotar(accion="crear_carpeta", nuco=a["nuco"], id=nueva["id"], padre=a["nuco_id"], nombre=a["a"])
            hechos["creada"] += 1
    print("hecho:", dict(hechos))
    if hechos["renombrada"] or hechos["creada"]:
        e.respaldar_bitacora(bit.ruta)
    print("bitácora:", bit.ruta)


if __name__ == "__main__":
    a = sys.argv[1:]
    if a[:1] == ["dry-run"]:
        dry_run()
    elif a[:1] == ["aplicar"]:
        aplicar(a[a.index("--nucos") + 1].split(",") if "--nucos" in a else None)
    else:
        print(__doc__)
