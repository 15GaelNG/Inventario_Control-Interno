"""Una copia idéntica se llama igual en todo NUCOS VEHICULOS: ANTERIORES/REPETIDOS → ANTERIORES/DUPLICADOS (15-oct-2026).

    repetidos_a_duplicados.py plan                 SOLO LECTURA → .cache/duplicados/plan.json
    repetidos_a_duplicados.py aplicar              EN LA REAL: solo RENOMBRA cada carpeta (no mueve archivos; todo conserva
                                                   su ID). Bitácora .cache/bitacoras/<fecha>-duplicados.jsonl (+ Drive)
    repetidos_a_duplicados.py verificar            SOLO LECTURA: cada carpeta con su nombre nuevo y el mismo contenido
    expediente.py deshacer <bitácora>              les regresa el nombre

Solo se toca una carpeta llamada exactamente REPETIDOS que esté en <NUCO>/1.-DOCUMENTACIÓN/ANTERIORES/ y que no tenga ya
una DUPLICADOS al lado (esa se reporta y no se toca). En verificaciones ya se llaman DUPLICADOS.
"""
import sys, json, time, collections
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import expediente as e, reglas

C = e.CACHE / "duplicados"
PLAN = C / "plan.json"
VIEJO, NUEVO = "REPETIDOS", "DUPLICADOS"


def hijos(d, cid):
    return e.hijos_de(d, [cid])[cid]


def contenido(d, cid):
    """{id: md5} de todo lo que hay debajo (para verificar que el contenido no cambió)."""
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
    nucos = {f["id"]: f["name"] for f in hijos(d, e.NUCOS) if f["mimeType"] == reglas.CARPETA and f["name"].isdigit()}
    docs = {}
    for nid, l in e.hijos_de(d, list(nucos)).items():
        for h in l:
            if h["mimeType"] == reglas.CARPETA and reglas.normal(h["name"]).replace(" ", "").startswith("1.-DOCUMENTACI"):
                docs[h["id"]] = nucos[nid]
    anteriores = {}
    for did, l in e.hijos_de(d, list(docs)).items():
        for h in l:
            if h["mimeType"] == reglas.CARPETA and h["name"] == "ANTERIORES":
                anteriores[h["id"]] = docs[did]
    p, saltados = [], []
    for aid, l in e.hijos_de(d, list(anteriores)).items():
        nombres = collections.Counter(h["name"] for h in l if h["mimeType"] == reglas.CARPETA)
        for h in l:
            if h["mimeType"] == reglas.CARPETA and h["name"] == VIEJO:
                if nombres[NUEVO] or nombres[VIEJO] > 1:
                    saltados.append((anteriores[aid], dict(nombres)))
                    continue
                p.append(dict(id=h["id"], nuco=anteriores[aid], padre=aid))
    # Sin un conteo del contenido no se puede verificar después
    todo = {}
    for x in p:
        todo[x["id"]] = contenido(d, x["id"])
        x["archivos"] = len(todo[x["id"]])
    json.dump(dict(plan=p, saltados=saltados, contenido=todo), open(PLAN, "w", encoding="utf-8"), ensure_ascii=False)
    print("carpetas %s a renombrar: %d (NUCO %d) con %d archivos | saltadas: %d %s"
          % (VIEJO, len(p), len({x["nuco"] for x in p}), sum(x["archivos"] for x in p), len(saltados), saltados[:5]))


def aplicar():
    d = e.drive()
    datos = json.load(open(PLAN, encoding="utf-8"))
    bit = e.Bitacora(e.CACHE / "bitacoras" / (time.strftime("%Y%m%d-%H%M%S") + "-duplicados.jsonl"))
    hechos = collections.Counter()
    for x in datos["plan"]:
        f = e.llamar(d.files().get(fileId=x["id"], fields="id,name,parents,trashed"))
        hermanas = {h["name"] for h in hijos(d, x["padre"]) if h["mimeType"] == reglas.CARPETA}
        if f.get("trashed") or f["name"] != VIEJO or f["parents"] != [x["padre"]] or NUEVO in hermanas:
            hechos["no se tocó (cambió desde el plan)"] += 1
            continue
        e.llamar(d.files().update(fileId=x["id"], body={"name": NUEVO}, fields="id"))
        bit.anotar(accion="renombrar_carpeta", nuco=x["nuco"], id=x["id"], de_nombre=VIEJO, a_nombre=NUEVO)
        hechos["renombradas"] += 1
    print(dict(hechos))
    if bit.ruta.exists():
        e.respaldar_bitacora(bit.ruta)
        print("Bitácora:", bit.ruta)


def verificar():
    d = e.drive()
    datos = json.load(open(PLAN, encoding="utf-8"))
    ok, malos = 0, []
    for x in datos["plan"]:
        f = e.llamar(d.files().get(fileId=x["id"], fields="id,name,parents,trashed"))
        ahora = contenido(d, x["id"])
        antes = datos["contenido"][x["id"]]
        if f.get("trashed") or f["name"] != NUEVO or f["parents"] != [x["padre"]]:
            malos.append("%s: %s" % (x["nuco"], f["name"]))
        elif ahora != antes:
            malos.append("%s: el contenido cambió (%d → %d archivos)" % (x["nuco"], len(antes), len(ahora)))
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
        aplicar()
    elif paso == "verificar":
        sys.exit(0 if verificar() else 1)
    else:
        sys.exit(__doc__)
