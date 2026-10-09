"""ordenar() y deshacer() contra un Drive en memoria: mueven dentro del NUCO, copian lo de AppSheet y regresan todo."""
import itertools
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import expediente  # noqa: E402
import reglas  # noqa: E402

F = reglas.CARPETA


class Peticion:
    def __init__(self, fn):
        self.fn = fn

    def execute(self):
        return self.fn()


class DriveFalso:
    def __init__(self):
        self.archivos = {}
        self.ids = itertools.count(1)

    def nuevo(self, nombre, padre, carpeta=False):
        i = "id%d" % next(self.ids)
        self.archivos[i] = {"id": i, "name": nombre, "mimeType": F if carpeta else "application/pdf", "parents": [padre] if padre else [], "trashed": False}
        return i

    def ruta(self, i):
        partes = []
        while i in self.archivos:
            partes.append(self.archivos[i]["name"])
            i = (self.archivos[i]["parents"] or [None])[0]
        return "/".join(reversed(partes))

    def foto(self):
        return {i: (a["name"], tuple(a["parents"]), a["trashed"]) for i, a in self.archivos.items()}

    def files(self):
        return self

    def get(self, fileId, **_):
        return Peticion(lambda: dict(self.archivos[fileId]))

    def list(self, q, **_):
        padre = re.search(r"'([^']+)' in parents", q).group(1)
        return Peticion(lambda: {"files": [dict(a) for a in self.archivos.values() if padre in a["parents"] and not a["trashed"]]})

    def create(self, body, **_):
        return Peticion(lambda: {"id": self.nuevo(body["name"], body["parents"][0], body.get("mimeType") == F)})

    def copy(self, fileId, body, **_):
        def hacer():
            i = self.nuevo(body["name"], body["parents"][0])
            return {"id": i}
        return Peticion(hacer)

    def update(self, fileId, body=None, addParents=None, removeParents=None, **_):
        def hacer():
            a = self.archivos[fileId]
            if body and "name" in body:
                a["name"] = body["name"]
            if body and body.get("trashed"):
                a["trashed"] = True
            if addParents:
                a["parents"] = [addParents if p == removeParents else p for p in a["parents"]]
            return {"id": fileId}
        return Peticion(hacer)


def test_ordenar_mueve_dentro_del_nuco_copia_appsheet_y_deshacer_lo_regresa_todo(tmp_path, monkeypatch):
    dr = DriveFalso()
    nucos = dr.nuevo("NUCOS VEHICULOS", None, True)
    vf = dr.nuevo("VEHICULOS_Files_", None, True)
    n293 = dr.nuevo("293", nucos, True)
    doc = dr.nuevo("1.-DOCUMENTACIÓN", n293, True)
    viejos = dr.nuevo("DOCUEMENTOS", doc, True)
    fac = dr.nuevo("FACTURA", viejos, True)
    oxxo = dr.nuevo("OXXO-GAS", viejos, True)
    f1 = dr.nuevo("FACTURA 293.pdf", fac)
    seg = dr.nuevo("2.-SEGURO", doc, True)                       # una de las 6 que ya existía, con su relleno
    rel_seg = dr.nuevo("CARPETA SIN INFORMACIÓN.jpg", seg)
    o1 = dr.nuevo("Carta Recepción Tarjeta.pdf", oxxo)
    rel = dr.nuevo("CARPETA SIN INFORMACIÓN.jpg", viejos)
    ten = dr.nuevo("CTA0293.ARCHIVO TENENCIA.pdf", vf)
    otro = dr.nuevo("999", nucos, True)
    ajeno = dr.nuevo("de otro NUCO.pdf", otro)

    plan = [{"nuco": "293", "id": n293, "copias": [
        {"origen": f1, "destino": ["1.-DOCUMENTACIÓN", "1.-FACTURA"], "nombre": "FACTURA-0293.pdf", "de": "x/FACTURA 293.pdf", "fuente": "nuco"},
        {"origen": o1, "destino": ["1.-DOCUMENTACIÓN", "ANTERIORES", "DOCUEMENTOS", "OXXO-GAS"], "nombre": "Carta Recepción Tarjeta.pdf",
         "de": "x/Carta Recepción Tarjeta.pdf", "fuente": "nuco"},
        {"origen": ten, "destino": ["1.-DOCUMENTACIÓN", "6.-TENENCIA"], "nombre": "TENENCIA-0293.pdf", "de": "VEHICULOS_Files_/t.pdf", "fuente": "hoja"},
        # Un plan viejo que apunta a un archivo que ya está en OTRO NUCO: no se toca
        {"origen": ajeno, "destino": ["1.-DOCUMENTACIÓN", "1.-FACTURA"], "nombre": "FACTURA-0293 (2).pdf", "de": "x", "fuente": "nuco"},
    ]}]
    (tmp_path / "plan.json").write_text(json.dumps(plan), encoding="utf-8")
    monkeypatch.setattr(expediente, "CACHE", tmp_path)
    monkeypatch.setattr(expediente, "NUCOS", nucos)
    monkeypatch.setattr(expediente, "drive", lambda: dr)
    monkeypatch.setattr(expediente, "respaldar_bitacora", lambda ruta: None)
    antes = dr.foto()

    expediente.ordenar(["293"], hilos=1)

    assert dr.ruta(f1) == "NUCOS VEHICULOS/293/1.-DOCUMENTACIÓN/1.-FACTURA/FACTURA-0293.pdf"          # movido, mismo ID
    assert dr.ruta(o1) == "NUCOS VEHICULOS/293/1.-DOCUMENTACIÓN/ANTERIORES/DOCUEMENTOS/OXXO-GAS/Carta Recepción Tarjeta.pdf"
    assert dr.ruta(ten) == "VEHICULOS_Files_/CTA0293.ARCHIVO TENENCIA.pdf"                            # el de AppSheet no se mueve…
    copias = [a for a in dr.archivos.values() if a["name"] == "TENENCIA-0293.pdf"]
    assert len(copias) == 1 and dr.ruta(copias[0]["id"]).endswith("293/1.-DOCUMENTACIÓN/6.-TENENCIA/TENENCIA-0293.pdf")  # …se copia
    assert dr.ruta(ajeno) == "NUCOS VEHICULOS/999/de otro NUCO.pdf"                                   # nunca sale de su NUCO
    # nada se borra: la carpeta vieja (solo quedó el relleno) se aparta entera, con el relleno adentro
    assert dr.ruta(rel) == "NUCOS VEHICULOS/293/1.-DOCUMENTACIÓN/ANTERIORES/ESTRUCTURA ANTERIOR/DOCUEMENTOS/CARPETA SIN INFORMACIÓN.jpg"
    assert dr.ruta(rel_seg).endswith("1.-DOCUMENTACIÓN/ANTERIORES/ESTRUCTURA ANTERIOR/2.-SEGURO/CARPETA SIN INFORMACIÓN.jpg")
    en_doc = {a["name"] for a in dr.archivos.values() if a["parents"] == [doc] and not a["trashed"]}
    assert en_doc == {c for _, c, _ in reglas.SEIS} | {"ANTERIORES"}, en_doc
    seis = {dr.archivos[i]["name"] for i in dr.archivos if dr.archivos[i]["parents"] == [doc] and dr.archivos[i]["mimeType"] == F}
    assert {c for _, c, _ in reglas.SEIS} <= seis

    # Repetirlo no hace nada nuevo
    n = len(dr.archivos)
    expediente.ordenar(["293"], hilos=1)
    assert len(dr.archivos) == n

    for bit in sorted((tmp_path / "bitacoras").glob("*.jsonl"), reverse=True):
        expediente.deshacer(bit)
    despues = dr.foto()
    vivos = {i: v for i, v in despues.items() if not v[2]}
    assert vivos == {i: v for i, v in antes.items()}, "deshacer deja todo como estaba (lo nuevo, a la papelera)"


def test_ordenar_no_trabaja_un_nuco_que_ya_no_esta_en_nucos(tmp_path, monkeypatch):
    dr = DriveFalso()
    nucos = dr.nuevo("NUCOS VEHICULOS", None, True)
    otra = dr.nuevo("OTRA", None, True)
    n5 = dr.nuevo("5", otra, True)
    (tmp_path / "plan.json").write_text(json.dumps([{"nuco": "5", "id": n5, "copias": []}]), encoding="utf-8")
    monkeypatch.setattr(expediente, "CACHE", tmp_path)
    monkeypatch.setattr(expediente, "NUCOS", nucos)
    monkeypatch.setattr(expediente, "drive", lambda: dr)
    monkeypatch.setattr(expediente, "respaldar_bitacora", lambda ruta: None)
    n = len(dr.archivos)
    expediente.ordenar(["5"], hilos=1)
    assert len(dr.archivos) == n


def test_una_carpeta_con_espacio_de_mas_se_reusa_y_se_deja_exacta(tmp_path, monkeypatch):
    dr = DriveFalso()
    nucos = dr.nuevo("NUCOS VEHICULOS", None, True)
    n24 = dr.nuevo("24", nucos, True)
    doc = dr.nuevo("1.-DOCUMENTACIÓN", n24, True)
    tc = dr.nuevo("4.-TARJETA DE CIRCULACIÓN ", doc, True)
    f = dr.nuevo("TC.pdf", tc)
    (tmp_path / "plan.json").write_text(json.dumps([{"nuco": "24", "id": n24, "copias": [
        {"origen": f, "destino": ["1.-DOCUMENTACIÓN", "4.-TARJETA DE CIRCULACIÓN"], "nombre": "TARJETA DE CIRCULACION-0024.pdf", "de": "x", "fuente": "nuco"}]}]),
        encoding="utf-8")
    monkeypatch.setattr(expediente, "CACHE", tmp_path)
    monkeypatch.setattr(expediente, "NUCOS", nucos)
    monkeypatch.setattr(expediente, "drive", lambda: dr)
    monkeypatch.setattr(expediente, "respaldar_bitacora", lambda ruta: None)
    antes = dr.foto()
    expediente.ordenar(["24"], hilos=1)
    assert dr.archivos[tc]["name"] == "4.-TARJETA DE CIRCULACIÓN"          # la misma carpeta, ya sin el espacio
    assert dr.ruta(f).endswith("1.-DOCUMENTACIÓN/4.-TARJETA DE CIRCULACIÓN/TARJETA DE CIRCULACION-0024.pdf")
    for bit in (tmp_path / "bitacoras").glob("*.jsonl"):
        expediente.deshacer(bit)
    assert {i: v for i, v in dr.foto().items() if not v[2]} == antes


def test_una_carpeta_vieja_con_algo_real_no_se_aparta(tmp_path, monkeypatch):
    dr = DriveFalso()
    nucos = dr.nuevo("NUCOS VEHICULOS", None, True)
    n7 = dr.nuevo("7", nucos, True)
    doc = dr.nuevo("1.-DOCUMENTACIÓN", n7, True)
    rara = dr.nuevo("COSAS", doc, True)
    dr.nuevo("algo que el plan no conoce.pdf", rara)
    (tmp_path / "plan.json").write_text(json.dumps([{"nuco": "7", "id": n7, "copias": []}]), encoding="utf-8")
    monkeypatch.setattr(expediente, "CACHE", tmp_path)
    monkeypatch.setattr(expediente, "NUCOS", nucos)
    monkeypatch.setattr(expediente, "drive", lambda: dr)
    monkeypatch.setattr(expediente, "respaldar_bitacora", lambda ruta: None)
    expediente.ordenar(["7"], hilos=1)
    assert dr.archivos[rara]["parents"] == [doc]


def test_nombre_que_choca_va_con_2_y_el_relleno_suelto_se_aparta(tmp_path, monkeypatch):
    dr = DriveFalso()
    nucos = dr.nuevo("NUCOS VEHICULOS", None, True)
    n235 = dr.nuevo("235", nucos, True)
    doc = dr.nuevo("1.-DOCUMENTACIÓN", n235, True)
    vieja = dr.nuevo("4.- ALTA DE PLACAS", doc, True)
    img = dr.nuevo("image009.png", vieja)
    destino = dr.nuevo("ANTERIORES", doc, True)
    ya = dr.nuevo("image009.png", destino)                       # otra imagen, mismo nombre
    rel = dr.nuevo("CARPETA SIN INFORMACIÓN.jpg", doc)           # relleno suelto en la raíz
    (tmp_path / "plan.json").write_text(json.dumps([{"nuco": "235", "id": n235, "copias": [
        {"origen": img, "destino": ["1.-DOCUMENTACIÓN", "ANTERIORES"], "nombre": "image009.png", "de": "x", "fuente": "nuco"}]}]),
        encoding="utf-8")
    monkeypatch.setattr(expediente, "CACHE", tmp_path)
    monkeypatch.setattr(expediente, "NUCOS", nucos)
    monkeypatch.setattr(expediente, "drive", lambda: dr)
    monkeypatch.setattr(expediente, "respaldar_bitacora", lambda ruta: None)
    expediente.ordenar(["235"], hilos=1)
    assert dr.ruta(img).endswith("1.-DOCUMENTACIÓN/ANTERIORES/image009 (2).png")
    assert dr.ruta(ya).endswith("1.-DOCUMENTACIÓN/ANTERIORES/image009.png")
    assert dr.ruta(rel).endswith("ANTERIORES/ESTRUCTURA ANTERIOR/CARPETA SIN INFORMACIÓN.jpg")
    assert dr.ruta(vieja).endswith("ANTERIORES/ESTRUCTURA ANTERIOR/4.- ALTA DE PLACAS")      # ya vacía, se aparta
