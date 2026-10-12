"""Fase 0 del plan "Personas: una sola hoja": la columna ID PERSONA pasa a COLABORADORES ACTUALIZADO (docs/personas-unificar.md).

Cada renglón de COLABORADORES ACTUALIZADO recibe el ID PERSONA de su empleo (No EMPLEADO + NOMBRE COMPLETO), tomado de
PERSONAS. Los empleos que PERSONAS todavía no tiene se identifican con las MISMAS reglas que CapitalHumano.identificar
(src/services/CapitalHumano.gs): mismo número+nombre; mismo nombre + fecha de nacimiento; N. EMPLEADO ANTERIOR (salvo que
ese número sea de otra persona). Un ID dado nunca cambia. Esos empleos nuevos se agregan también a PERSONAS, para que el
código de hoy (que todavía lee PERSONAS) los encuentre mientras sale el nuevo.

  mudar_id_persona.py plan             SOLO LECTURA → .cache/capital_humano/plan.json + reporte
  mudar_id_persona.py aplicar          Escribe la columna (y los empleos nuevos en PERSONAS). Antes revisa que cada
                                       renglón siga siendo el mismo empleo que en el plan. Bitácora en
                                       tools/nucos/.cache/bitacoras/<fecha>-id-persona.jsonl + respaldo en Drive.
  mudar_id_persona.py verificar <bit>  SOLO LECTURA: cada celda contra la bitácora, y cada empleo contra PERSONAS
  mudar_id_persona.py deshacer <bit>   Vacía la columna escrita (y quita los renglones que agregó a PERSONAS)

Correr con: uv run --no-project --python 3.12 --with google-api-python-client --with google-auth-oauthlib python …
"""
import sys, json, re, time, random, collections, datetime
from pathlib import Path
AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parent / "nucos"))
import expediente as e, columna_nucco as c

D = e.CACHE / "capital_humano"
PLAN = D / "plan.json"
HOJA_CH = "COLABORADORES ACTUALIZADO"
HOJA_PER = "PERSONAS"
COL = "ID PERSONA"

norm = lambda v: re.sub(r"\s+", " ", str(v if v is not None else "")).strip().upper()
clave = lambda numero, nombre: norm(numero) + "|" + norm(nombre)

# Uniones a mano (revisadas una por una): el empleo de CH → el ID que ya tenía esa persona en PERSONAS. Solo cuando las
# reglas no pueden verlo porque CH quitó el renglón viejo de su lista.
#   12-oct-2026: CH renumeró a MAGNO ANTONIO CRISTOBAL JACINTO de VALLE01816 a IPQ01570 y el renglón VALLE01816 ya no
#   viene; mismo nombre completo, y ningún registro apunta al ID viejo. Se conserva el suyo en vez de crear otro.
UNIONES_A_MANO = {"IPQ01570|MAGNO ANTONIO CRISTOBAL JACINTO": "PER-66MGQDQHD56NYA"}

# ---- Ids.nuevo (src/utils/Ids.gs): PRE-TTTTTTTTRRRRRR, base32 de Crockford
ALFABETO = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
EPOCA_MS = int(datetime.datetime(2020, 1, 1, tzinfo=datetime.timezone.utc).timestamp() * 1000)


def base32(n, largo):
    s = ""
    while n > 0:
        s = ALFABETO[n % 32] + s
        n //= 32
    return s.rjust(largo, "0")


def id_nuevo(prefijo, usados):
    while True:
        i = prefijo + "-" + base32(int(time.time() * 1000) - EPOCA_MS, 8) + "".join(random.choice(ALFABETO) for _ in range(6))
        if i not in usados:
            usados.add(i)
            return i


def leer(h, nombre):
    """(encabezados, {fila: {col: valor}}) con los valores como se ven (lo mismo que leer_ de CapitalHumano)."""
    v = e.llamar(h.values().get(spreadsheetId=e.LIBRO, range="'%s'!A1:ZZ100000" % nombre)).get("values", [])
    enc = [str(x).strip() for x in v[0]]
    while enc and not enc[-1]:
        enc.pop()
    filas = {}
    for i, f in enumerate(v[1:]):
        if any(str(x).strip() for x in f):
            filas[i + 2] = dict(zip(enc, list(f) + [""] * (len(enc) - len(f))))
    return enc, filas


def identificar(ch_filas, existentes):
    """Port de CapitalHumano.identificarSinCandado_: → ({clave: id}, nuevos [(id, numero, nombre, motivo)], avisos)."""
    padre, motivo, datos = {}, {}, {}

    def raiz(a):
        padre.setdefault(a, a)
        while padre[a] != a:
            padre[a] = padre[padre[a]]
            a = padre[a]
        return a

    def unir(a, b, porque):
        ra, rb = raiz(a), raiz(b)
        if ra == rb:
            return
        padre[ra] = rb
        motivo.setdefault(a, porque)

    def nodo(numero, nombre):
        k = clave(numero, nombre)
        datos.setdefault(k, (norm(numero), norm(nombre)))
        raiz(k)
        return k

    nombres_por_numero = collections.defaultdict(dict)
    for f in ch_filas:
        numero = norm(f.get("No EMPLEADO"))
        if not numero or not norm(f.get("NOMBRE COMPLETO")):
            continue
        nodo(numero, f["NOMBRE COMPLETO"])
        nombres_por_numero[numero][norm(f["NOMBRE COMPLETO"])] = True
    por_nac = collections.defaultdict(list)
    for f in ch_filas:
        nombre, nac = norm(f.get("NOMBRE COMPLETO")), norm(f.get("FECHA DE NACIMIENTO"))
        if not norm(f.get("No EMPLEADO")) or not nombre or not nac:
            continue
        por_nac[nombre + "|" + nac].append(clave(f["No EMPLEADO"], nombre))
    for ks in por_nac.values():
        for o in ks[1:]:
            unir(o, ks[0], "mismo nombre y fecha de nacimiento que " + datos[ks[0]][0])
    avisos = []
    for f in ch_filas:
        numero, nombre, anterior = norm(f.get("No EMPLEADO")), norm(f.get("NOMBRE COMPLETO")), norm(f.get("N. EMPLEADO ANTERIOR"))
        if not numero or not nombre or not anterior or anterior == numero:
            continue
        otros = nombres_por_numero.get(anterior)
        if otros and nombre not in otros:
            avisos.append("%s (%s) dice que su número anterior es %s, que es de %s: no se juntaron" % (numero, nombre, anterior, " / ".join(otros)))
            continue
        unir(nodo(anterior, nombre), clave(numero, nombre), "número anterior de " + numero)

    grupos = collections.defaultdict(list)
    for k in datos:
        grupos[raiz(k)].append(k)
    usados = set(existentes.values())
    asignado, nuevos, conflictos = {}, [], []
    for ks in grupos.values():
        ids = sorted({existentes[k] for k in ks if k in existentes})
        if len(ids) > 1:
            conflictos.append("Parecen la misma persona pero tienen IDs distintos (%s): %s" % (", ".join(ids), " · ".join(" ".join(datos[k]) for k in ks)))
            for k in ks:
                if k in existentes:
                    asignado[k] = existentes[k]
            continue
        faltan = [k for k in ks if k not in existentes]
        id_ = ids[0] if ids else (id_nuevo("PER", usados) if faltan else None)
        for k in ks:
            asignado[k] = existentes.get(k, id_)
        for k in faltan:
            nuevos.append((id_, datos[k][0], datos[k][1], motivo.get(k) or ("otro empleo de una persona ya identificada" if ids else "persona nueva")))
    return asignado, nuevos, avisos, conflictos


def plan():
    h = c.hojas_api()
    enc_ch, ch = leer(h, HOJA_CH)
    enc_p, per = leer(h, HOJA_PER)
    if COL in enc_ch:
        raise SystemExit("%s ya tiene la columna %s: repetir solo con un plan nuevo a mano" % (HOJA_CH, COL))
    existentes = {}
    for r in per.values():
        if norm(r.get(COL)):
            existentes[clave(r.get("No EMPLEADO"), r.get("NOMBRE COMPLETO"))] = norm(r.get(COL))
    a_mano = {k: i for k, i in UNIONES_A_MANO.items() if k not in existentes}
    if set(a_mano.values()) - set(existentes.values()):
        raise SystemExit("Una unión a mano apunta a un ID que no está en PERSONAS: revisar UNIONES_A_MANO")
    # Se tratan como si PERSONAS ya los tuviera (el empleo nuevo hereda el ID de esa persona)
    asignado, nuevos, avisos, conflictos = identificar(list(ch.values()), dict(existentes, **a_mano))
    for k, i in a_mano.items():
        n, _, nombre = k.partition("|")
        nuevos.append((i, n, nombre, "unión a mano: mismo nombre, CH le cambió el número"))

    # Fidelidad del port: lo que ya estaba en PERSONAS debe salir igual
    distintos = [k for k, i in existentes.items() if k in asignado and asignado[k] != i]
    celdas, sin_id = [], []
    for fila, r in sorted(ch.items()):
        k = clave(r.get("No EMPLEADO"), r.get("NOMBRE COMPLETO"))
        if not norm(r.get("NOMBRE COMPLETO")) or not norm(r.get("No EMPLEADO")):
            sin_id.append(fila); continue
        celdas.append(dict(fila=fila, clave=k, id=asignado[k], origen="PERSONAS" if k in existentes else "nuevo"))
    claves_ch = {x["clave"] for x in celdas}
    solo_per = [dict(clave=k, id=i) for k, i in existentes.items() if k not in claves_ch]
    anteriores = {clave(r.get("N. EMPLEADO ANTERIOR"), r.get("NOMBRE COMPLETO")) for r in ch.values() if norm(r.get("N. EMPLEADO ANTERIOR"))}
    no_cubiertos = [x for x in solo_per if x["clave"] not in anteriores]

    letra = c.letra(len(enc_ch))
    D.mkdir(parents=True, exist_ok=True)
    json.dump(dict(letra=letra, columnas_ch=len(enc_ch), renglones=len(ch), celdas=celdas, nuevos_personas=nuevos,
                   sin_id=sin_id, conflictos=conflictos, no_cubiertos=no_cubiertos),
              open(PLAN, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    k = collections.Counter(x["origen"] for x in celdas)
    print("COLABORADORES ACTUALIZADO: %d renglones · nueva columna %s (%s)" % (len(ch), letra, COL))
    print("  ID de PERSONAS: %d renglones · ID nuevo/agrupado: %d renglones" % (k["PERSONAS"], k["nuevo"]))
    print("  empleos nuevos para PERSONAS: %d (%d personas nuevas)" % (len(nuevos), len({n[0] for n in nuevos if n[3] == "persona nueva"})))
    for n in nuevos[:40]:
        print("     ", n)
    print("  renglones sin número o nombre (se quedan sin ID): %d" % len(sin_id))
    print("  FIDELIDAD: IDs de PERSONAS que el port asignaría distinto: %d (debe ser 0)" % len(distintos))
    print("  conflictos (personas con dos IDs): %d" % len(conflictos))
    for x in conflictos[:10]:
        print("     ", x)
    print("  empleos de PERSONAS que no son renglón de CH: %d · no cubiertos por N. EMPLEADO ANTERIOR: %d" % (len(solo_per), len(no_cubiertos)))
    for x in no_cubiertos:
        print("     ", x)
    print("  avisos de número anterior: %d" % len(avisos))
    if distintos:
        print("  ¡NO APLICAR! el port no reproduce PERSONAS:", distintos[:10])


def aplicar():
    h = c.hojas_api()
    p = json.load(open(PLAN, encoding="utf-8"))
    if p["conflictos"]:
        raise SystemExit("El plan tiene conflictos: revisar antes de aplicar")
    enc_ch, ch = leer(h, HOJA_CH)
    if COL in enc_ch or len(enc_ch) != p["columnas_ch"] or c.letra(len(enc_ch)) != p["letra"]:
        raise SystemExit("La pestaña cambió de columnas desde el plan: repetir el plan")
    if len(ch) != p["renglones"]:
        raise SystemExit("La pestaña cambió de renglones desde el plan (%d → %d): repetir el plan" % (p["renglones"], len(ch)))
    for x in p["celdas"]:
        r = ch.get(x["fila"], {})
        if clave(r.get("No EMPLEADO"), r.get("NOMBRE COMPLETO")) != x["clave"]:
            raise SystemExit("El renglón %d ya no es %s: repetir el plan" % (x["fila"], x["clave"]))
    meta = {s["properties"]["title"]: s["properties"] for s in e.llamar(h.get(spreadsheetId=e.LIBRO, fields="sheets.properties"))["sheets"]}
    bit = e.Bitacora(e.CACHE / "bitacoras" / (time.strftime("%Y%m%d-%H%M%S") + "-id-persona.jsonl"))

    # 1) La columna en COLABORADORES ACTUALIZADO (una sola escritura: encabezado + todos los renglones)
    props = meta[HOJA_CH]
    falta = len(enc_ch) + 1 - props["gridProperties"]["columnCount"]
    if falta > 0:
        e.llamar(h.batchUpdate(spreadsheetId=e.LIBRO, body={"requests": [{"appendDimension": {
            "sheetId": props["sheetId"], "dimension": "COLUMNS", "length": falta}}]}))
    ultima = max(ch) if ch else 1
    valores = [[COL]] + [[""] for _ in range(ultima - 1)]
    for x in p["celdas"]:
        valores[x["fila"] - 1] = [x["id"]]
    e.llamar(h.values().update(spreadsheetId=e.LIBRO, range="'%s'!%s1:%s%d" % (HOJA_CH, p["letra"], p["letra"], ultima),
                                valueInputOption="RAW", body={"values": valores}))
    bit.anotar(accion="columna", hoja=HOJA_CH, letra=p["letra"], columnas_agregadas=max(falta, 0), renglones=ultima)
    for x in p["celdas"]:
        bit.anotar(accion="celda", hoja=HOJA_CH, fila=x["fila"], letra=p["letra"], clave=x["clave"], antes="", despues=x["id"])

    agregar_personas_(h, p, bit, meta)
    e.respaldar_bitacora(bit.ruta)
    print("Escritos %d IDs en %s (columna %s) y %d empleos en PERSONAS" % (len(p["celdas"]), HOJA_CH, p["letra"], len(p["nuevos_personas"])))
    print("bitácora:", bit.ruta)


def agregar_personas_(h, p, bit, meta):
    """Los empleos nuevos también a PERSONAS (el código de hoy todavía la lee). No repite los que ya estén."""
    if p["nuevos_personas"]:
        _, per = leer(h, HOJA_PER)
        ya = {clave(r.get("No EMPLEADO"), r.get("NOMBRE COMPLETO")) for r in per.values()}
        pendientes = [n for n in p["nuevos_personas"] if clave(n[1], n[2]) not in ya]
        if not pendientes:
            return
        desde = (max(per) if per else 1) + 1
        ahora = datetime.datetime.now().strftime("%d/%m/%Y %H:%M:%S")
        filas = [[n[0], n[1], n[2], n[3], ahora] for n in pendientes]
        props = meta[HOJA_PER]
        falta = desde + len(filas) - 1 - props["gridProperties"]["rowCount"]
        if falta > 0:
            e.llamar(h.batchUpdate(spreadsheetId=e.LIBRO, body={"requests": [{"appendDimension": {
                "sheetId": props["sheetId"], "dimension": "ROWS", "length": falta}}]}))
        e.llamar(h.values().update(spreadsheetId=e.LIBRO, range="'%s'!A%d:E%d" % (HOJA_PER, desde, desde + len(filas) - 1),
                                    valueInputOption="RAW", body={"values": filas}))
        for i, f in enumerate(filas):
            bit.anotar(accion="persona", hoja=HOJA_PER, fila=desde + i, id=f[0], clave=clave(f[1], f[2]), motivo=f[3])
    e.respaldar_bitacora(bit.ruta)
    print("Escritos %d IDs en %s (columna %s) y %d empleos en PERSONAS" % (len(p["celdas"]), HOJA_CH, p["letra"], len(p["nuevos_personas"])))
    print("bitácora:", bit.ruta)


def completar_personas(ruta):
    """Si `aplicar` escribió la columna pero no llegó a PERSONAS: solo ese paso, anotado en la MISMA bitácora."""
    h = c.hojas_api()
    p = json.load(open(PLAN, encoding="utf-8"))
    meta = {s["properties"]["title"]: s["properties"] for s in e.llamar(h.get(spreadsheetId=e.LIBRO, fields="sheets.properties"))["sheets"]}
    bit = e.Bitacora(Path(ruta))
    agregar_personas_(h, p, bit, meta)
    e.respaldar_bitacora(bit.ruta)
    print("PERSONAS completada; bitácora:", bit.ruta)


def verificar(ruta):
    h = c.hojas_api()
    enc_ch, ch = leer(h, HOJA_CH)
    _, per = leer(h, HOJA_PER)
    en_per = {clave(r.get("No EMPLEADO"), r.get("NOMBRE COMPLETO")): norm(r.get(COL)) for r in per.values()}
    k = collections.Counter()
    for x in (json.loads(l) for l in open(ruta, encoding="utf-8") if l.strip()):
        if x["accion"] == "celda":
            r = ch.get(x["fila"], {})
            ok = norm(r.get(COL)) == x["despues"] and clave(r.get("No EMPLEADO"), r.get("NOMBRE COMPLETO")) == x["clave"]
            k["celda OK" if ok else "CELDA DISTINTA"] += 1
            k["igual que PERSONAS" if en_per.get(x["clave"]) == x["despues"] else "DISTINTO DE PERSONAS"] += 1
        elif x["accion"] == "persona":
            k["empleo en PERSONAS OK" if norm(per.get(x["fila"], {}).get(COL)) == x["id"] else "EMPLEO EN PERSONAS FALTA"] += 1
    print(dict(k))


def deshacer(ruta):
    h = c.hojas_api()
    lineas = [json.loads(l) for l in open(ruta, encoding="utf-8") if l.strip()]
    col = next(x for x in lineas if x["accion"] == "columna")
    _, ch = leer(h, HOJA_CH)
    ultima = max(max(ch), col["renglones"])
    e.llamar(h.values().clear(spreadsheetId=e.LIBRO, range="'%s'!%s1:%s%d" % (HOJA_CH, col["letra"], col["letra"], ultima)))
    filas_per = sorted((x["fila"] for x in lineas if x["accion"] == "persona"), reverse=True)
    if filas_per:
        _, per = leer(h, HOJA_PER)
        ids = {x["fila"]: x["id"] for x in lineas if x["accion"] == "persona"}
        for f in filas_per:
            if norm(per.get(f, {}).get(COL)) != ids[f]:
                raise SystemExit("PERSONAS renglón %d ya no es %s: no se borra nada más" % (f, ids[f]))
        e.llamar(h.values().clear(spreadsheetId=e.LIBRO, range="'%s'!A%d:E%d" % (HOJA_PER, min(filas_per), max(filas_per))))
    print("Columna %s vaciada en %s; %d renglones quitados de PERSONAS" % (col["letra"], HOJA_CH, len(filas_per)))


if __name__ == "__main__":
    a = sys.argv[1:]
    {"plan": plan, "aplicar": aplicar, "verificar": lambda: verificar(a[1]), "deshacer": lambda: deshacer(a[1]),
     "completar-personas": lambda: completar_personas(a[1])}.get(
        a[0] if a else "", lambda: print(__doc__))()
