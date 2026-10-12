"""Columna NUCCO en las hojas de la familia Vehículos que no la tienen (plan "Vehículos: todo por NUCO", fase 0).

Se llena con el NUCCO del vehículo al que apunta cada renglón por su ID VEHICULO (VEHICULOS.ID → NUCCO), NUNCA por
folio. Un renglón sin ID VEHICULO (o con uno que no existe) se queda vacío y se reporta.

  columna_nucco.py plan               SOLO LECTURA → .cache/nucco/plan.json
  columna_nucco.py aplicar            Agrega el encabezado NUCCO al final si falta y escribe los valores; antes de
                                      cada celda revisa que el renglón sea el mismo (ID) y la celda siga vacía.
                                      Bitácora .cache/bitacoras/<fecha>-columna-nucco.jsonl + respaldo en Drive.
  columna_nucco.py verificar <bit>    SOLO LECTURA
  columna_nucco.py deshacer <bit>     Vacía las celdas escritas (y el encabezado si lo agregó esta corrida)
"""
import sys, json, re, time, collections
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import expediente as e

D = e.CACHE / "nucco"
PLAN = D / "plan.json"
HOJAS = ["VERIFICACIONES", "INSTALACION DE SENSORES", "INCIDENCIAS", "CAMBIOS VEHICULOS"]
COL = "NUCCO"


def hojas_api():
    from autorizar import credenciales
    from googleapiclient.discovery import build
    return build("sheets", "v4", credentials=credenciales("lab"), cache_discovery=False).spreadsheets()


def leer(h, nombre):
    v = e.llamar(h.values().get(spreadsheetId=e.LIBRO, range="'%s'!A1:ZZ100000" % nombre))["values"]
    enc = v[0]
    while enc and not str(enc[-1]).strip():
        enc.pop()
    return enc, {i + 2: dict(zip(enc, f + [""] * (len(enc) - len(f)))) for i, f in enumerate(v[1:]) if any(f)}


def letra(i):
    s, n = "", i + 1
    while n:
        n, r = divmod(n - 1, 26)
        s = chr(65 + r) + s
    return s


def plan():
    h = hojas_api()
    _, veh = leer(h, "VEHICULOS")
    nucco_de = {x["ID"]: x.get("NUCCO", "") for x in veh.values() if x.get("ID")}
    out = {}
    for hoja in HOJAS:
        enc, filas = leer(h, hoja)
        tiene = COL in enc
        col = enc.index(COL) if tiene else len(enc)
        k = collections.Counter()
        celdas = []
        for fila, r in filas.items():
            idv = (r.get("ID VEHICULO") or "").strip()
            if tiene and (r.get(COL) or "").strip():
                k["ya tiene NUCCO"] += 1; continue
            if not idv:
                k["sin ID VEHICULO: se queda vacío"] += 1; continue
            if idv not in nucco_de or not str(nucco_de[idv]).strip():
                k["ID VEHICULO que no está en VEHICULOS (o sin NUCCO): vacío"] += 1; continue
            celdas.append(dict(fila=fila, id=r.get("ID") or r.get("ID_INCIDENCIA") or "", idv=idv, valor=str(nucco_de[idv])))
            k["se llena"] += 1
        out[hoja] = dict(tiene_columna=tiene, letra=letra(col), celdas=celdas, conteo=dict(k))
        print("%-26s columna %s%s | %s" % (hoja, letra(col), "" if tiene else " (nueva)", dict(k)))
    D.mkdir(parents=True, exist_ok=True)
    json.dump(out, open(PLAN, "w", encoding="utf-8"), ensure_ascii=False, indent=1)


def aplicar():
    h = hojas_api()
    p = json.load(open(PLAN, encoding="utf-8"))
    meta = {s["properties"]["title"]: s["properties"] for s in e.llamar(h.get(spreadsheetId=e.LIBRO, fields="sheets.properties"))["sheets"]}
    bit = e.Bitacora(e.CACHE / "bitacoras" / (time.strftime("%Y%m%d-%H%M%S") + "-columna-nucco.jsonl"))
    for hoja, x in p.items():
        enc, filas = leer(h, hoja)
        if not x["tiene_columna"]:
            if COL in enc:
                raise SystemExit("%s ya tiene NUCCO: repetir el plan" % hoja)
            if letra(len(enc)) != x["letra"]:
                raise SystemExit("%s cambió de columnas desde el plan" % hoja)
            falta = len(enc) + 1 - meta[hoja]["gridProperties"]["columnCount"]
            if falta > 0:
                e.llamar(h.batchUpdate(spreadsheetId=e.LIBRO, body={"requests": [{"appendDimension": {
                    "sheetId": meta[hoja]["sheetId"], "dimension": "COLUMNS", "length": falta}}]}))
            e.llamar(h.values().update(spreadsheetId=e.LIBRO, range="'%s'!%s1" % (hoja, x["letra"]), valueInputOption="RAW", body={"values": [[COL]]}))
            bit.anotar(accion="encabezado", hoja=hoja, letra=x["letra"], valor=COL, columnas_agregadas=max(falta, 0))
            enc.append(COL)
        data, k = [], collections.Counter()
        for c in x["celdas"]:
            r = filas.get(c["fila"], {})
            if (r.get("ID VEHICULO") or "").strip() != c["idv"] or (r.get(COL) or "").strip():
                k["cambió desde el plan: no se toca"] += 1; continue
            data.append({"range": "'%s'!%s%d" % (hoja, x["letra"], c["fila"]), "values": [[c["valor"]]]})
            bit.anotar(accion="celda", hoja=hoja, fila=c["fila"], columna=COL, letra=x["letra"], id=c["id"], antes="", despues=c["valor"])
            k["escrita"] += 1
        for i in range(0, len(data), 400):
            e.llamar(h.values().batchUpdate(spreadsheetId=e.LIBRO, body={"valueInputOption": "RAW", "data": data[i:i + 400]}))
        print(hoja, dict(k))
    e.respaldar_bitacora(bit.ruta)
    print("bitácora:", bit.ruta)


def verificar(ruta):
    h = hojas_api()
    cache, k = {}, collections.Counter()
    for x in (json.loads(l) for l in open(ruta, encoding="utf-8") if l.strip()):
        if x["hoja"] not in cache:
            cache[x["hoja"]] = leer(h, x["hoja"])
        enc, filas = cache[x["hoja"]]
        if x["accion"] == "encabezado":
            k["encabezado OK" if COL in enc else "ENCABEZADO FALTA"] += 1
        else:
            k["OK" if (filas.get(x["fila"], {}).get(COL) or "") == x["despues"] else "DISTINTA"] += 1
    print(dict(k))


def deshacer(ruta):
    h = hojas_api()
    data, k = [], collections.Counter()
    lineas = [json.loads(l) for l in open(ruta, encoding="utf-8") if l.strip()]
    cache = {}
    for x in reversed(lineas):
        if x["hoja"] not in cache:
            cache[x["hoja"]] = leer(h, x["hoja"])
        _, filas = cache[x["hoja"]]
        if x["accion"] == "celda":
            if (filas.get(x["fila"], {}).get(COL) or "") != x["despues"]:
                k["cambió después: no se toca"] += 1; continue
            data.append({"range": "'%s'!%s%d" % (x["hoja"], x["letra"], x["fila"]), "values": [[""]]}); k["vaciada"] += 1
        else:
            data.append({"range": "'%s'!%s1" % (x["hoja"], x["letra"]), "values": [[""]]}); k["encabezado quitado"] += 1
    for i in range(0, len(data), 400):
        e.llamar(h.values().batchUpdate(spreadsheetId=e.LIBRO, body={"valueInputOption": "RAW", "data": data[i:i + 400]}))
    print(dict(k))


if __name__ == "__main__":
    a = sys.argv[1:]
    {"plan": plan, "aplicar": aplicar, "verificar": lambda: verificar(a[1]), "deshacer": lambda: deshacer(a[1])}.get(
        a[0] if a else "", lambda: print(__doc__))()
