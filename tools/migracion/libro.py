"""La única puerta a las hojas. Dos libros con la misma interfaz:

  LibroMemoria  sobre un JSON en disco (el formato de tests/fakes/libro-en-memoria.js). Para
                las pruebas de paridad y para ensayar sobre una foto sin tocar Google.
  LibroApi      sobre la API de Sheets. Lee las hojas de golpe (un batchGet) y acumula lo que
                hay que escribir; `confirmar()` lo manda en UN batchUpdate, que Google aplica
                completo o nada.

Las dos usan la misma `Hoja`, que imita la parte de SpreadsheetApp que usan los pasos
(posiciones base 1, getLastRow/getLastColumn, getMaxRows…), para que el port de cada paso se
lea renglón por renglón contra el .gs original.

Al escribir, una celda que ya tiene el mismo texto NO se manda: así una segunda corrida no
escribe nada, un número se queda número, y una fórmula que no cambia no se pisa.
"""
import json

import catalogo as cat
from valores import texto_js


def _vacio(v):
    return v is None or v == ""


class Hoja:
    def __init__(self, libro, nombre, valores, max_filas, max_cols, sheet_id=None, texto=None):
        self.libro = libro
        self.nombre = nombre
        self.sheet_id = sheet_id
        self.filas = [list(f) for f in valores]
        self.max_filas = max(max_filas or 0, len(self.filas), 1)
        self.max_cols = max(max_cols or 0, max((len(f) for f in self.filas), default=0), 1)
        self.texto = set(texto or [])

    # ------------------------------------------------------------------ lectura

    def celda(self, r, c):
        if r - 1 >= len(self.filas):
            return ""
        f = self.filas[r - 1]
        if c - 1 >= len(f):
            return ""
        v = f[c - 1]
        return "" if _vacio(v) else v

    def ultima_fila(self):
        for r in range(len(self.filas), 0, -1):
            if any(not _vacio(v) for v in self.filas[r - 1]):
                return r
        return 0

    def ultima_columna(self):
        m = 0
        for f in self.filas:
            for c in range(len(f), m, -1):
                if not _vacio(f[c - 1]):
                    m = c
                    break
        return m

    def rango(self, r, c, nr, nc):
        return [[self.celda(r + i, c + j) for j in range(nc)] for i in range(nr)]

    # ---------------------------------------------------------------- escritura

    def _poner(self, r, c, v):
        if r > self.max_filas or c > self.max_cols:
            raise ValueError('Fuera de la rejilla de "%s": fila %d, columna %d (mide %d x %d)'
                             % (self.nombre, r, c, self.max_filas, self.max_cols))
        while len(self.filas) < r:
            self.filas.append([])
        f = self.filas[r - 1]
        while len(f) < c:
            f.append("")
        f[c - 1] = "" if _vacio(v) else v

    def escribir(self, r, c, valores):
        """setValues: solo lo que cambia de texto se pone y se manda a Google."""
        for j in range(len(valores[0]) if valores else 0):
            corrida = []   # renglones seguidos que cambian, en esta columna
            for i, fila in enumerate(valores):
                nuevo = fila[j]
                if texto_js(self.celda(r + i, c + j)) == texto_js(nuevo):
                    self._mandar_corrida(r, c + j, corrida)
                    corrida = []
                    continue
                self._poner(r + i, c + j, nuevo)
                corrida.append((r + i, nuevo))
            self._mandar_corrida(r, c + j, corrida)

    def _mandar_corrida(self, _r, c, corrida):
        if not corrida:
            return
        self.libro.celdas_escritas += len(corrida)
        primera = corrida[0][0]
        self.libro._op({"updateCells": {
            "range": self._rango_api(primera, c, len(corrida), 1),
            "rows": [{"values": [_celda_api(v)]} for _, v in corrida],
            "fields": "userEnteredValue",
        }})

    def poner_valor(self, r, c, v):
        self.escribir(r, c, [[v]])

    def formato_texto(self, c):
        """setNumberFormat('@') de la fila 2 al final de la rejilla."""
        self.texto.add(c)
        self.libro._op({"repeatCell": {
            "range": self._rango_api(2, c, max(1, self.max_filas - 1), 1),
            "cell": {"userEnteredFormat": {"numberFormat": {"type": "TEXT", "pattern": "@"}}},
            "fields": "userEnteredFormat.numberFormat",
        }})

    def insertar_columnas_despues(self, despues_de, cuantas):
        for f in self.filas:
            if len(f) > despues_de:
                f[despues_de:despues_de] = [""] * cuantas
        self.texto = {c + cuantas if c > despues_de else c for c in self.texto}
        if despues_de >= self.max_cols:
            self.libro._op({"appendDimension": {
                "sheetId": self.sheet_id, "dimension": "COLUMNS", "length": cuantas}})
        else:
            self.libro._op({"insertDimension": {
                "range": {"sheetId": self.sheet_id, "dimension": "COLUMNS",
                          "startIndex": despues_de, "endIndex": despues_de + cuantas},
                "inheritFromBefore": True}})
        self.max_cols += cuantas

    def borrar_columna(self, pos):
        for f in self.filas:
            if len(f) >= pos:
                del f[pos - 1]
        self.texto = {c - 1 if c > pos else c for c in self.texto if c != pos}
        self.max_cols -= 1
        self.libro._op({"deleteDimension": {"range": {
            "sheetId": self.sheet_id, "dimension": "COLUMNS",
            "startIndex": pos - 1, "endIndex": pos}}})

    def mover_columna(self, desde, destino):
        """moveColumns: `destino` es la posición ANTES de la cual queda, contada antes de mover."""
        hacia = destino - 1 if destino > desde else destino
        for f in self.filas:
            while len(f) < desde:
                f.append("")
            v = f.pop(desde - 1)
            f.insert(hacia - 1, v)
        tenia = desde in self.texto
        nuevo = set()
        for c in self.texto:
            if c == desde:
                continue
            x = c - 1 if c > desde else c
            nuevo.add(x + 1 if x >= hacia else x)
        if tenia:
            nuevo.add(hacia)
        self.texto = nuevo
        self.libro._op({"moveDimension": {
            "source": {"sheetId": self.sheet_id, "dimension": "COLUMNS",
                       "startIndex": desde - 1, "endIndex": desde},
            "destinationIndex": destino - 1}})

    def _rango_api(self, r, c, nr, nc):
        return {"sheetId": self.sheet_id, "startRowIndex": r - 1, "endRowIndex": r - 1 + nr,
                "startColumnIndex": c - 1, "endColumnIndex": c - 1 + nc}

    def a_json(self):
        ult = self.ultima_fila()
        valores = []
        for f in self.filas[:ult]:
            g = ["" if _vacio(v) else v for v in f]
            while g and g[-1] == "":
                g.pop()
            valores.append(g)
        return {"valores": valores, "maxFilas": self.max_filas, "maxColumnas": self.max_cols,
                "texto": sorted(self.texto)}


def _celda_api(v):
    if _vacio(v):
        return {}
    if isinstance(v, bool):
        return {"userEnteredValue": {"boolValue": v}}
    if isinstance(v, (int, float)):
        return {"userEnteredValue": {"numberValue": v}}
    return {"userEnteredValue": {"stringValue": str(v)}}


class _LibroBase:
    def __init__(self, ss_id, nombre):
        self.id = ss_id
        self.nombre = nombre
        self.hojas = {}
        self.ops = []
        self.celdas_escritas = 0
        self._sellado = False

    def _op(self, req):
        self.ops.append(req)

    def hoja(self, nombre):
        return self.hojas.get(nombre)

    def a_json(self):
        return {"id": self.id, "nombre": self.nombre, "sellado": self._sellado,
                "hojas": {n: h.a_json() for n, h in self.hojas.items()}}

    def sellado(self):
        return self._sellado

    def sellar(self):
        """Devuelve True si lo selló ahora, False si ya estaba (como migracionSellar_)."""
        if self._sellado:
            return False
        self._sellado = True
        self._sellar_pendiente = True
        return True


class LibroMemoria(_LibroBase):
    """Un libro en JSON. `confirmar()` no manda nada: los cambios ya están en memoria."""

    def __init__(self, datos):
        super().__init__(datos.get("id", "LIBRO"), datos.get("nombre", ""))
        self._sellado = bool(datos.get("sellado"))
        for n, h in (datos.get("hojas") or {}).items():
            self.hojas[n] = Hoja(self, n, h.get("valores") or [], h.get("maxFilas"),
                                 h.get("maxColumnas"), texto=h.get("texto"))

    @classmethod
    def de_archivo(cls, ruta):
        with open(ruta, encoding="utf-8") as f:
            return cls(json.load(f))

    def confirmar(self):
        n = len(self.ops)
        self.ops = []
        return n

class LibroApi(_LibroBase):
    """Un libro de Google Sheets. Se lee al crearlo; se escribe solo con `confirmar()`."""

    CLAVE_SELLO = cat.SELLO_METADATO   # el mismo que lee migracionSellado_ en Apps Script

    def __init__(self, api, ss_id, nombres=None, puede_escribir=False):
        """`api` es build('sheets','v4').spreadsheets(). `nombres`: qué hojas leer (None = todas)."""
        meta = api.get(spreadsheetId=ss_id,
                       fields="properties.title,sheets.properties(sheetId,title,gridProperties)").execute()
        super().__init__(ss_id, meta["properties"]["title"])
        self.api = api
        self.puede_escribir = puede_escribir
        props = {s["properties"]["title"]: s["properties"] for s in meta["sheets"]}
        self.pestanas = list(props)
        a_leer = [n for n in (nombres if nombres is not None else props) if n in props]
        valores = {}
        if a_leer:
            r = api.values().batchGet(
                spreadsheetId=ss_id, ranges=["'%s'" % n.replace("'", "''") for n in a_leer],
                valueRenderOption="UNFORMATTED_VALUE", majorDimension="ROWS").execute()
            for n, vr in zip(a_leer, r.get("valueRanges", [])):
                valores[n] = vr.get("values", [])
        for n in a_leer:
            g = props[n].get("gridProperties", {})
            self.hojas[n] = Hoja(self, n, valores.get(n, []), g.get("rowCount"),
                                 g.get("columnCount"), sheet_id=props[n]["sheetId"])
        self._sellado = self._leer_sello()

    def _leer_sello(self):
        r = self.api.developerMetadata().search(spreadsheetId=self.id, body={"dataFilters": [
            {"developerMetadataLookup": {"metadataKey": self.CLAVE_SELLO}}]}).execute()
        return bool(r.get("matchedDeveloperMetadata"))

    def confirmar(self):
        """Manda todo lo acumulado en un solo batchUpdate. Devuelve cuántas operaciones."""
        if getattr(self, "_sellar_pendiente", False):
            self.ops.append({"createDeveloperMetadata": {"developerMetadata": {
                "metadataKey": self.CLAVE_SELLO, "metadataValue": "referencias escritas",
                "location": {"spreadsheet": True}, "visibility": "DOCUMENT"}}})
            self._sellar_pendiente = False
        if not self.ops:
            return 0
        if self.id == cat.PRODUCCION:   # la lista negra, otra vez, en el último punto antes de Google
            raise RuntimeError("Se iba a escribir en PRODUCCIÓN; no se mandó nada (ver conexion.py).")
        if not self.puede_escribir:
            raise RuntimeError("Este libro se abrió de solo lectura y un paso quiso escribir: "
                               "no se mandó nada.")
        n = len(self.ops)
        self.api.batchUpdate(spreadsheetId=self.id, body={"requests": self.ops}).execute()
        self.ops = []
        return n
