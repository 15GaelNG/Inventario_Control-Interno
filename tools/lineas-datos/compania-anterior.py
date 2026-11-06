"""
tools/lineas-datos/compania-anterior.py — llena COMPAÑIA ANTERIOR en EQUIPOS (usuario, 5-nov).

La tarjeta de un equipo sin línea dice «ÚLTIMA LÍNEA: AT&T» (no todos vienen liberados). Lo del sistema nuevo sale solo de
ASIGNACIONES (LineasLectura, ULTIMA COMPAÑIA); lo que pasó antes de la migración (4-oct) no tiene asignación y se deduce
una vez aquí, para cada equipo sin línea, sin historia en ASIGNACIONES y fuera de un estatus final:
  1) CAMBIOS LINEAS TELEFONICAS (bitácora de AppSheet): el último número que tuvo su NUCO → su compañía en LINEAS, o un
     cambio de COMPAÑIA;
  2) LINEAS.NUCO ANTERIOR, si da una sola compañía;
  3) su última responsiva o inspección con compañía.
Validado en DEV (5-nov): con los equipos que sí tienen ASIGNACIONES, la bitácora dio la misma compañía en 328 de 328.

Uso (cuenta de servicio de la memoria migracion-appsheet, con gspread):
  uv run --with gspread python -I tools/lineas-datos/compania-anterior.py <ID del libro de telefonía> <salida.csv> [--escribir] [--produccion]
Sin --escribir es ensayo: deja la lista (NUCO, compañía, de dónde salió) y no toca nada. Se puede volver a correr. Solo
escribe la columna COMPAÑIA ANTERIOR (la crea al final si falta) y solo en esos equipos. Producción (el libro de
.clasp.prod.json en Entornos.gs) no se escribe sin --produccion, y eso solo con permiso del usuario.
"""
import sys, re, csv, json, os
from datetime import datetime
import gspread

CRED = r"D:\Usuarios\Ciudad Maderas\Documentos\Analisis\herramientas\gt\portal\tool-sheets-api.json"
REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
args = [a for a in sys.argv[1:] if not a.startswith("--")]
ESCRIBIR, PRODUCCION = "--escribir" in sys.argv, "--produccion" in sys.argv
LIBRO, SALIDA = args[0], args[1]
COLUMNA = "COMPAÑIA ANTERIOR"


def libro_produccion():
    sid = json.load(open(os.path.join(REPO, ".clasp.prod.json"), encoding="utf-8"))["scriptId"]
    fuente = open(os.path.join(REPO, "src", "config", "Entornos.gs"), encoding="utf-8").read().replace("\r", "")
    i = fuente.find("'" + sid + "'")
    bloque = fuente[i:fuente.find("\n  },", i)]
    m = re.search(r"SS_ID_TELEFONIA:\s*'([^']*)'", bloque)
    return m.group(1) if i >= 0 and m else ""


if ESCRIBIR and LIBRO == libro_produccion() and not PRODUCCION:
    sys.exit("Ese es el libro de PRODUCCIÓN: no se escribe sin --produccion (y eso solo con permiso del usuario).")

sh = gspread.service_account(filename=CRED).open_by_key(LIBRO)
print("LIBRO ·", sh.title, "· ESCRIBE" if ESCRIBIR else "· ENSAYO (no escribe)")


def tabla(n):
    v = sh.worksheet(n).get_values("A1:ZZ")
    enc = [str(c).strip().upper() for c in v[0]]
    return enc, [{enc[j]: (f[j] if j < len(f) else "") for j in range(len(enc))} for f in v[1:]]


t = lambda x: str(x or "").strip()
nuco = lambda x: re.sub(r"\D", "", t(x)).lstrip("0")
dig = lambda x: re.sub(r"\D", "", t(x))[-10:]


def fecha(x):
    s = t(x)
    for fmt in ("%d/%m/%Y %H:%M:%S", "%d/%m/%Y %H:%M", "%d/%m/%Y", "%m/%d/%Y %H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            pass
    return datetime.min


encE, E = tabla("EQUIPOS")
_, L = tabla("LINEAS")
_, A = tabla("ASIGNACIONES")
_, C = tabla("CAMBIOS LINEAS TELEFONICAS")
_, R = tabla("RESPONSIVAS LINEAS")
_, I = tabla("INSPECCIONES LINEAS")
lin = {t(l["ID"]): l for l in L}
comp_por_num = {dig(l["NUMERO TELEFONO"]): t(l.get("COMPAÑIA")).upper() for l in L if dig(l.get("NUMERO TELEFONO"))}
vig = {t(a["ID EQUIPO"]): a for a in A if not t(a.get("FECHA FIN")) and t(a.get("ID EQUIPO"))}
con_historia = {t(a["ID EQUIPO"]) for a in A if t(a.get("ID EQUIPO")) and t(a.get("ID LINEA")) in lin}

cambios = {}
for c in C:
    if nuco(c.get("NUCO")):
        cambios.setdefault(nuco(c["NUCO"]), []).append(c)


def de_cambios(k):
    for c in sorted(cambios.get(k, []), key=lambda c: fecha(c.get("FECHA ACTUALIZACION")), reverse=True):
        campo, dia = t(c.get("CAMPO")).upper(), t(c.get("FECHA ACTUALIZACION"))[:10]
        if campo == "NUMERO TELEFONO":
            for x in (c.get("DESPUES"), c.get("ANTES")):
                if comp_por_num.get(dig(x)):
                    return comp_por_num[dig(x)], "bitácora AppSheet: línea " + dig(x) + " (" + dia + ")"
        if "COMPA" in campo:
            for x in (c.get("DESPUES"), c.get("ANTES")):
                if t(x) and t(x) not in ("-", "—"):
                    return t(x).upper(), "bitácora AppSheet: cambio de compañía (" + dia + ")"
    return None


por_nuco_ant = {}
for l in L:
    if nuco(l.get("NUCO ANTERIOR")) and t(l.get("COMPAÑIA")):
        por_nuco_ant.setdefault(nuco(l["NUCO ANTERIOR"]), set()).add(t(l["COMPAÑIA"]).upper())
docs = {}
for nombre, hoja, col in (("responsiva", R, "FECHA RESPONSIVA"), ("inspección", I, "FECHA DE REGISTRO")):
    for r in hoja:
        k, comp = nuco(r.get("NUCO")), t(r.get("COMPAÑIA")).upper()
        if k and comp and comp not in ("-", "N/A", "NA"):
            docs.setdefault(k, []).append((fecha(r.get(col)), comp, nombre, t(r.get(col))[:10]))

FINAL = {"VENDIDO", "DONADO", "DESECHADO", "EXTRAVIO-ROBO", "EXTRAVIADO", "ROBADO", "ROBO"}
filas = []  # [renglón en la hoja, NUCO, estatus, compañía, de dónde, ID]
for n, e in enumerate(E, start=2):
    i = t(e["ID"])
    if (vig.get(i) and t(vig[i].get("ID LINEA"))) or i in con_historia or t(e.get("ESTATUS EQUIPO")).upper() in FINAL:
        continue
    k = nuco(e.get("NUCO"))
    r = de_cambios(k) if k else None
    if not r and k in por_nuco_ant and len(por_nuco_ant[k]) == 1:
        r = (next(iter(por_nuco_ant[k])), "LINEAS: NUCO ANTERIOR")
    if not r and k in docs:
        d = max(docs[k])
        r = (d[1], "última " + d[2] + " (" + d[3] + ")")
    comp, fuente = r if r else ("", "sin dato")
    filas.append([n, t(e.get("NUCO")), t(e.get("ESTATUS EQUIPO")), comp, fuente, i])

with open(SALIDA, "w", newline="", encoding="utf-8-sig") as f:
    w = csv.writer(f)
    w.writerow(["NUCO", "ESTATUS EQUIPO", COLUMNA, "DE DONDE", "ID EQUIPO"])
    w.writerows(sorted(x[1:] for x in filas))
con = [x for x in filas if x[3]]
print("Equipos sin línea y sin historia en ASIGNACIONES:", len(filas), "· con compañía:", len(con))
print("Compañías:", json.dumps({c: sum(1 for x in con if x[3] == c) for c in sorted({x[3] for x in con})}, ensure_ascii=False))
print("Lista:", SALIDA)

if ESCRIBIR and con:
    ws = sh.worksheet("EQUIPOS")
    if COLUMNA in encE:
        j = encE.index(COLUMNA)
    else:
        j = len(encE)
        if ws.col_count <= j:
            ws.add_cols(j + 1 - ws.col_count)
        ws.update_cell(1, j + 1, COLUMNA)
        print("Columna", COLUMNA, "creada en EQUIPOS")
    letra = gspread.utils.rowcol_to_a1(1, j + 1).rstrip("1")
    ws.batch_update([{"range": letra + str(x[0]), "values": [[x[3]]]} for x in con], value_input_option="RAW")
    print("Escritas", len(con), "celdas en EQUIPOS!" + letra + ". Después, «Recargar datos» en la app.")
