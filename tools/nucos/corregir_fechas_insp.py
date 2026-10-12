"""Corrige las inspecciones cuyo año en el nombre del PDF no es el de su carpeta (12-oct-2026; docs/nucos-inspecciones.md).

El área nombraba el PDF ddmmaaaa y en enero tecleaba el año anterior ("16012024-SU2825C.pdf" dentro de 2025/1ER
BIMESTRE, subido en enero de 2025). La homologación toma la fecha del nombre, así que el error pasó al nombre nuevo.

  corregir_fechas_insp.py ensayo     SOLO LECTURA: qué se haría
  corregir_fechas_insp.py aplicar    En la real, con bitácora (.cache/bitacoras/<fecha>-fechas-insp.jsonl), respaldo en
                                     Drive y renglones en la hoja BITACORA EXPEDIENTES NUCO. Deshacer:
                                     expediente.py deshacer <bitácora>

Decisiones (con la fecha de subida como prueba; los PDF son escaneos, no traen texto):
  - El año del nombre pasa al de su carpeta: 16 de enero (2025 con nombre 2024) y el
    101 (2024/5TO BIMESTRE con nombre 03/10/2025: el mes cuadra con la carpeta y se subió en mayo de 2025).
  - El 399 está en la carpeta equivocada: 2024/1ER BIMESTRE con PDF del 19/03/2025 y sus fotos subidas en marzo de 2025
    → la carpeta completa pasa a 2025/2DO BIMESTRE.
  - No se tocan: el 42 (su lugar, 2025/2DO BIMESTRE, ya tiene otra inspección), el 176 (no hay cómo saberlo) y el 371
    (con el año corregido, julio, tampoco cuadra su 2DO TRIMESTRE).
"""
import sys, re, json, time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import expediente as e, reglas
import inspecciones as ins

FOTO = e.CACHE / "inspecciones" / "20261011-despues" / "foto.json"
RENOMBRAR = ["69", "62", "162", "93", "185", "95", "88", "121", "77", "124", "338", "341", "342", "213", "216", "116", "101"]
MOVER = {"399": ("2024", "1ER BIMESTRE", "2025", "2DO BIMESTRE")}
NO_SE_TOCAN = {"42": "su lugar (2025/2DO BIMESTRE) ya tiene otra inspección", "176": "no hay cómo saber el año correcto",
               "371": "con el año corregido (11/07/2026) tampoco cuadra su periodo (2DO TRIMESTRE)"}


def plan():
    foto = json.load(open(FOTO, encoding="utf-8"))
    acciones = []
    for a in foto["archivos"]:
        n, r = a["nuco"], a["ruta"]
        m = re.match(r"(INSPECCION-\d{4}) (20\d\d)(-\d\d-\d\d.*)$", a["name"])
        if n in RENOMBRAR and m and len(r) >= 3 and re.fullmatch(r"20\d\d", r[1]) and m.group(2) != r[1]:
            acciones.append(dict(tipo="renombrar", nuco=n, id=a["id"], padre=a["padre"], de=a["name"],
                                 a=m.group(1) + " " + r[1] + m.group(3), ruta="/".join(r).replace("4.- INSPECCIONES", "4.-INSPECCIONES"),
                                 motivo="año del nombre corregido al de su carpeta (error de dedo del área al nombrar el PDF)"))
    for n, (a0, p0, a1, p1) in MOVER.items():
        c = next(c for c in foto["carpetas"] if c["nuco"] == n and c["ruta"] == ["4.- INSPECCIONES", a0, p0] or
                 c["nuco"] == n and c["ruta"] == ["4.-INSPECCIONES", a0, p0])
        destino = next(x for x in foto["carpetas"] if x["nuco"] == n and x["ruta"][1:] == [a1])
        acciones.append(dict(tipo="mover_carpeta", nuco=n, id=c["id"], padre=c["padre"], destino=destino["id"], de=p0, a=p1,
                             ruta="/".join(c["ruta"]).replace("4.- INSPECCIONES", "4.-INSPECCIONES"), ruta_nueva="/".join(destino["ruta"] + [p1]).replace("4.- INSPECCIONES", "4.-INSPECCIONES"),
                             motivo="inspección de marzo de 2025 guardada en %s/%s (PDF y fotos de 2025)" % (a0, p0)))
    return acciones


def ensayo():
    for x in plan():
        print(x["nuco"], x["tipo"], "|", x["ruta"], "→", x.get("ruta_nueva") or x["a"])
    print("no se tocan:", NO_SE_TOCAN)


def aplicar():
    d = e.drive()
    bit = e.Bitacora(e.CACHE / "bitacoras" / (time.strftime("%Y%m%d-%H%M%S") + "-fechas-insp.jsonl"))
    info = {}
    for x in plan():
        vivo = e.llamar(d.files().get(fileId=x["id"], fields="name,parents,trashed"))
        if vivo["trashed"] or vivo["name"] != (x["de"] if x["tipo"] == "renombrar" else x["de"]) or x["padre"] not in vivo["parents"]:
            print("  cambió desde la foto, no se toca:", x["nuco"], x["ruta"]); continue
        if x["tipo"] == "renombrar":
            hermanos = {h["name"] for h in e.hijos_de(d, [x["padre"]])[x["padre"]]}
            nombre = x["a"]
            if nombre in hermanos:
                b, ext = nombre.rsplit(".", 1)
                k = 2
                while "%s (%d).%s" % (b, k, ext) in hermanos: k += 1
                nombre = "%s (%d).%s" % (b, k, ext)
            e.llamar(d.files().update(fileId=x["id"], body={"name": nombre}, fields="id"))
            bit.anotar(accion="mover", nuco=x["nuco"], id=x["id"], de_padre=x["padre"], de_nombre=x["de"], a_padre=x["padre"], a_nombre=nombre)
            info[x["id"]] = dict(antes=x["ruta"], despues=x["ruta"].rsplit("/", 1)[0] + "/" + nombre, aviso=x["motivo"])
        else:
            ya = [h for h in e.hijos_de(d, [x["destino"]])[x["destino"]] if reglas.normal(h["name"]) == reglas.normal(x["a"])]
            if ya:
                print("  el destino ya existe, no se toca:", x["nuco"], x["ruta_nueva"]); continue
            e.llamar(d.files().update(fileId=x["id"], addParents=x["destino"], removeParents=x["padre"], body={"name": x["a"]}, fields="id"))
            bit.anotar(accion="mover", nuco=x["nuco"], id=x["id"], de_padre=x["padre"], de_nombre=x["de"], a_padre=x["destino"], a_nombre=x["a"])
            info[x["id"]] = dict(antes=x["ruta"], despues=x["ruta_nueva"], aviso=x["motivo"])
        print("  hecho:", x["nuco"], info[x["id"]]["antes"], "→", info[x["id"]]["despues"])
    if bit.ruta.exists():
        e.respaldar_bitacora(bit.ruta)
        filas = ins.filas_de_bitacora(bit.ruta, info)
        ins.Hoja(d).agregar(filas)
        print("Hoja %s: %d renglones | bitácora %s" % (ins.HOJA_BITACORA, len(filas), bit.ruta))


if __name__ == "__main__":
    {"ensayo": ensayo, "aplicar": aplicar}.get(sys.argv[1] if len(sys.argv) > 1 else "", lambda: print(__doc__))()
