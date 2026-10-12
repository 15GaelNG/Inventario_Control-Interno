"""Re-ligar a su vehículo las verificaciones de la hoja VERIFICACIONES que apuntan a otro (docs/nucos-verificaciones.md).

El vehículo se decide por el certificado (su número de serie, NIV), nunca por el folio. Solo los SEGUROS:
  - la serie del certificado es la de un vehículo (exacta, o con una letra mal leída y la placa del certificado igual),
  - la fecha del certificado es IDÉNTICA a la capturada,
  - ese vehículo no tiene ya otra verificación ese mismo día.
Lo demás no se toca (queda en plan.json como "dudoso" para el área).

  religar_verif.py plan               SOLO LECTURA → .cache/verificaciones/religar/plan.json y Excel
  religar_verif.py aplicar            Escribe ID VEHICULO, FOLIO VEHICULO y PLACA (lo que hoy liga, la copia del
                                      vehículo correcto). Antes de cada renglón revisa que siga igual que en el plan.
                                      Bitácora .cache/bitacoras/<fecha>-religar-verif.jsonl + respaldo en Drive.
  religar_verif.py verificar <bit>    SOLO LECTURA
  religar_verif.py deshacer <bit>     Regresa cada celda (si nadie la cambió después)
"""
import sys, json, re, time, datetime, collections
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import expediente as e, reglas

C = e.CACHE / "verificaciones"
D = C / "religar"
PLAN = D / "plan.json"
HOJA = "VERIFICACIONES"
COLS = ["ID VEHICULO", "FOLIO VEHICULO", "PLACA"]
N = reglas.normal
num = lambda s: str(int(re.match(r"\s*(\d+)", s).group(1))) if re.match(r"\s*(\d+)", s or "") else ""
ser = lambda s: re.sub(r"[^A-Z0-9]", "", N(s or ""))


def hojas():
    from autorizar import credenciales
    from googleapiclient.discovery import build
    return build("sheets", "v4", credentials=credenciales("lab"), cache_discovery=False).spreadsheets()


def leer(h, nombre):
    v = e.llamar(h.values().get(spreadsheetId=e.LIBRO, range="'%s'!A1:ZZ100000" % nombre))["values"]
    enc = v[0]
    return enc, {i + 2: dict(zip(enc, f + [""] * (len(enc) - len(f)))) for i, f in enumerate(v[1:]) if any(f)}


def letra(i):
    s, n = "", i + 1
    while n:
        n, r = divmod(n - 1, 26)
        s = chr(65 + r) + s
    return s


def fecha_hoja(s):
    m = re.match(r"(\d{1,2})/(\d{1,2})/(\d{4})", s or "")
    return datetime.date(int(m.group(3)), int(m.group(2)), int(m.group(1))).isoformat() if m else ""


def plan():
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    import verificaciones as v
    h = hojas()
    encV, ver = leer(h, HOJA)
    _, veh = leer(h, "VEHICULOS")
    veh = list(veh.values())
    por_id = {x["ID"]: x for x in veh}
    por_serie = collections.defaultdict(list)
    for x in veh:
        if len(ser(x.get("SERIE VEHICULO"))) == 17:
            por_serie[ser(x["SERIE VEHICULO"])].append(x)
    ocra = json.load(open(C / "ocr-app.json", encoding="utf-8"))
    arch = {x["name"]: x for x in json.load(open(C / "app.json", encoding="utf-8"))["app"]}
    plan_, k = [], collections.Counter()
    for fila, r in ver.items():
        nombre = (r.get("COMPROBANTE VERIFICACION") or "").split("/")[-1]
        if nombre not in arch:
            k["sin comprobante"] += 1; continue
        t = ocra.get(arch[nombre]["id"], {}).get("texto", "")
        T = N(t)
        toks = set(re.findall(r"(?<![A-Z0-9])[A-HJ-NPR-Z0-9]{17}(?![A-Z0-9])", T))
        exactos = {x["ID"]: x for s in toks for x in por_serie.get(s, [])}
        tol = {}
        if not exactos:
            for s in toks:
                cerca = [kk for kk in por_serie if sum(a != b for a, b in zip(kk, s)) == 1]
                if len(cerca) == 1:
                    for x in por_serie[cerca[0]]:
                        tol[x["ID"]] = x
        cand = exactos or tol
        if len(cand) != 1:
            k["serie ilegible o ambigua"] += 1; continue
        real = next(iter(cand.values()))
        if r.get("ID VEHICULO") == real["ID"]:
            k["ya bien ligada"] += 1; continue
        cert = v.lee_certificado(t)
        placas = set(re.findall(r"\b[A-Z]{2,3}\d{3,4}[A-Z]\b|\b[A-Z]\d{2}[A-Z]{3}\b", T))
        placa_ok = N(real.get("PLACA", "")).replace(" ", "") in placas
        mismo_dia = [r2["ID"] for r2 in ver.values() if r2.get("ID VEHICULO") == real["ID"] and r2.get("FECHA VERIFICACION") == r.get("FECHA VERIFICACION")]
        f_hoja, f_cert = fecha_hoja(r.get("FECHA VERIFICACION")), cert["fecha"]
        motivos = []
        if not (exactos or placa_ok): motivos.append("serie con una letra dudosa y sin placa que la confirme")
        if not f_cert: motivos.append("el certificado no trae fecha legible")
        elif f_cert != f_hoja: motivos.append("la fecha del certificado (%s) no es la capturada (%s)" % (f_cert, f_hoja))
        if mismo_dia: motivos.append("el vehículo correcto ya tiene una verificación ese día (%s)" % ", ".join(mismo_dia))
        hoy = por_id.get(r.get("ID VEHICULO"), {})
        x = dict(fila=fila, id=r["ID"], fecha=r.get("FECHA VERIFICACION"), comprobante="https://drive.google.com/file/d/%s/view" % arch[nombre]["id"],
                 hoy_nuco=num(hoy.get("NUCCO")), real_nuco=num(real.get("NUCCO")), real_serie=real.get("SERIE VEHICULO"),
                 antes={c: r.get(c, "") for c in COLS}, despues={"ID VEHICULO": real["ID"], "FOLIO VEHICULO": real.get("FOLIO", ""), "PLACA": real.get("PLACA", "")},
                 seguro=not motivos, motivo="; ".join(motivos))
        plan_.append(x)
        k["SEGURO: se re-liga" if x["seguro"] else "dudoso: para el área"] += 1
    D.mkdir(parents=True, exist_ok=True)
    json.dump(dict(letras={c: letra(encV.index(c)) for c in COLS}, plan=plan_), open(PLAN, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    from openpyxl import Workbook
    wb = Workbook(); ws = wb.active; ws.title = "Re-ligar"
    ws.append(["Fila", "ID", "Fecha", "NUCO hoy", "NUCO correcto (serie)", "Serie", "¿Se re-liga?", "Por qué no", "Comprobante"])
    for x in sorted(plan_, key=lambda x: (not x["seguro"], int(x["real_nuco"] or 0))):
        ws.append([x["fila"], x["id"], x["fecha"], x["hoy_nuco"], x["real_nuco"], x["real_serie"], "SÍ" if x["seguro"] else "NO", x["motivo"], x["comprobante"]])
    wb.save(D / "religar-verificaciones.xlsx")
    print(dict(k))


def aplicar():
    h = hojas()
    p = json.load(open(PLAN, encoding="utf-8"))
    enc, ver = leer(h, HOJA)
    if any(letra(enc.index(c)) != p["letras"][c] for c in COLS):
        raise SystemExit("Una columna se movió desde el plan")
    bit = e.Bitacora(e.CACHE / "bitacoras" / (time.strftime("%Y%m%d-%H%M%S") + "-religar-verif.jsonl"))
    data, k = [], collections.Counter()
    for x in p["plan"]:
        if not x["seguro"]:
            continue
        r = ver.get(x["fila"], {})
        if r.get("ID") != x["id"] or any((r.get(c) or "") != x["antes"][c] for c in COLS):
            k["cambió desde el plan: no se toca"] += 1; continue
        for c in COLS:
            data.append({"range": "'%s'!%s%d" % (HOJA, p["letras"][c], x["fila"]), "values": [[x["despues"][c]]]})
            bit.anotar(accion="celda", hoja=HOJA, fila=x["fila"], columna=c, letra=p["letras"][c], id=x["id"], antes=x["antes"][c], despues=x["despues"][c],
                       motivo="serie del certificado = NUCO %s (antes NUCO %s)" % (x["real_nuco"], x["hoy_nuco"]))
        k["re-ligada"] += 1
    for i in range(0, len(data), 300):
        e.llamar(h.values().batchUpdate(spreadsheetId=e.LIBRO, body={"valueInputOption": "RAW", "data": data[i:i + 300]}))
    print(dict(k))
    if bit.ruta.exists():
        e.respaldar_bitacora(bit.ruta)
        print("bitácora:", bit.ruta)


def verificar(ruta):
    _, ver = leer(hojas(), HOJA)
    k = collections.Counter()
    for x in (json.loads(l) for l in open(ruta, encoding="utf-8") if l.strip()):
        k["OK" if (ver.get(x["fila"], {}).get(x["columna"]) or "") == x["despues"] else "DISTINTA"] += 1
    print(dict(k))


def deshacer(ruta):
    h = hojas()
    _, ver = leer(h, HOJA)
    data, k = [], collections.Counter()
    for x in (json.loads(l) for l in open(ruta, encoding="utf-8") if l.strip()):
        if (ver.get(x["fila"], {}).get(x["columna"]) or "") != x["despues"]:
            k["cambió después: no se toca"] += 1; continue
        data.append({"range": "'%s'!%s%d" % (HOJA, x["letra"], x["fila"]), "values": [[x["antes"]]]}); k["regresada"] += 1
    for i in range(0, len(data), 300):
        e.llamar(h.values().batchUpdate(spreadsheetId=e.LIBRO, body={"valueInputOption": "RAW", "data": data[i:i + 300]}))
    print(dict(k))


if __name__ == "__main__":
    a = sys.argv[1:]
    {"plan": plan, "aplicar": aplicar, "verificar": lambda: verificar(a[1]), "deshacer": lambda: deshacer(a[1])}.get(
        a[0] if a else "", lambda: print(__doc__))()
