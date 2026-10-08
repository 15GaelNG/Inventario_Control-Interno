"""Reglas del expediente por NUCO (tools/nucos/reglas.py), con los casos reales que las formaron (8-oct-2026)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import reglas  # noqa: E402

F = reglas.CARPETA


def carpeta(nombre, *hijos):
    return {"id": "c-" + nombre, "name": nombre, "mimeType": F, "hijos": list(hijos)}


def archivo(nombre, fecha="2025-01-01T00:00:00Z", md5=None):
    return {"id": "a-" + nombre + fecha, "name": nombre, "mimeType": "application/pdf", "modifiedTime": fecha, "md5Checksum": md5}


def destinos(copias):
    return {c["de"].split("/")[-1]: "/".join(c["destino"][1:]) + "/" + c["nombre"] for c in copias}


def test_las_tres_generaciones_reconocen_cada_documento():
    for nombre, esperado in [("1.-FACTURA", "FACTURA"), ("2.-CARTA FACTURA", "FACTURA"), ("3.-POLIZA DE SEGURO", "SEGURO"),
                             ("4.- ALTA DE PLACAS", "ALTA DE PLACAS"), ("PLACAS", "ALTA DE PLACAS"),
                             ("4.-TARJETA DE CIRUCLACIÓN", "TARJETA DE CIRCULACION"), ("5.- CARTA RESPONSIVA", "RESPONSIVA"),
                             ("12.-TENENCIAS", "TENENCIA"), ("9.-OXXO GAS", None), ("3.- PERMISO", None)]:
        assert reglas.concepto(nombre) == esperado, nombre


def test_el_nombre_del_archivo_manda_y_no_confunde_la_tarjeta_de_oxxo():
    assert reglas.concepto_archivo("348.- Factura.pdf") == "FACTURA"
    assert reglas.concepto_archivo("334.- Tarjeta circulación.pdf") == "TARJETA DE CIRCULACION"
    assert reglas.concepto_archivo("ALTA.pdf") == "ALTA DE PLACAS"
    assert reglas.concepto_archivo("Carta Recepción Tarjeta T05752 ticket 1470.pdf") is None
    assert reglas.concepto_archivo("Tarjeta corp.jpg") is None
    assert reglas.concepto_archivo("solicitud de factura.pdf") is None


def test_un_nuco_de_la_generacion_vieja_queda_en_las_seis():
    doc = carpeta("1.-DOCUMENTACIÓN", carpeta("DOCUEMENTOS",
        carpeta("FACTURA", archivo("FACTURA 293.pdf", "2023-05-17T00:00:00Z"), archivo("CARTA FACTURA 293.pdf", "2023-06-01T00:00:00Z")),
        carpeta("PLACAS", archivo("ALTA 293.pdf")),
        carpeta("OXXO-GAS", archivo("Carta Recepción Tarjeta T05752.pdf")),
        carpeta("CARTA RESPONSIVA", archivo("348.- Factura.pdf", "2022-01-01T00:00:00Z"))),
        archivo("CARPETA SIN INFORMACIÓN.jpg"))
    copias, resumen = reglas.planear_nuco("293", [doc], {"TENENCIA": [archivo("CTA0293.ARCHIVO TENENCIA.235043.pdf")]})
    d = destinos(copias)
    assert d["CARTA FACTURA 293.pdf"] == "1.-FACTURA/FACTURA-0293.pdf"            # la más reciente sin fecha
    assert d["FACTURA 293.pdf"] == "1.-FACTURA/FACTURA-0293 2023-05-17.pdf"
    assert d["348.- Factura.pdf"].startswith("1.-FACTURA/")                       # mal archivada: se acomoda
    assert d["ALTA 293.pdf"] == "3.-ALTA DE PLACAS/ALTA DE PLACAS-0293.pdf"
    assert d["CTA0293.ARCHIVO TENENCIA.235043.pdf"] == "6.-TENENCIA/TENENCIA-0293.pdf"   # el adjunto de la hoja
    assert d["Carta Recepción Tarjeta T05752.pdf"] == "ANTERIORES/DOCUEMENTOS/OXXO-GAS/Carta Recepción Tarjeta T05752.pdf"
    assert "CARPETA SIN INFORMACIÓN.jpg" not in d and resumen["rellenos"] == 1


def test_responsiva_la_vigente_en_la_raiz_y_las_demas_en_anteriores():
    doc = carpeta("1.-DOCUMENTACIÓN", carpeta("5.- CARTA RESPONSIVA",
        archivo("resp 2024.pdf", "2024-01-01T00:00:00Z"), archivo("resp 2025.pdf", "2025-03-01T00:00:00Z"),
        carpeta("RESPONSVIAS ANTERIORES", archivo("resp 2020.pdf", "2020-01-01T00:00:00Z")),
        carpeta("ADHERENTES", archivo("adherente.pdf"))))
    d = destinos(reglas.planear_nuco("7", [doc], {})[0])
    assert d["resp 2025.pdf"] == "5.-RESPONSIVA/RESPONSIVA-0007.pdf"
    assert d["resp 2024.pdf"].startswith("5.-RESPONSIVA/RESPONSIVAS ANTERIORES/")
    assert d["resp 2020.pdf"].startswith("5.-RESPONSIVA/RESPONSIVAS ANTERIORES/")
    assert d["adherente.pdf"].startswith("5.-RESPONSIVA/ADHERENTES/")


def test_el_mismo_archivo_dos_veces_se_copia_una():
    doc = carpeta("1.-DOCUMENTACIÓN", carpeta("2.-SEGURO", archivo("poliza.pdf", md5="abc")))
    copias, resumen = reglas.planear_nuco("9", [doc], {"SEGURO": [archivo("refwf.POLIZA SEGURO.pdf", md5="abc")]})
    assert len([c for c in copias if c["destino"][1] == "2.-SEGURO"]) == 1 and resumen["duplicados"] == 1


def test_el_candado_no_deja_escribir_dentro_de_nucos_real_ni_en_subcarpetas():
    """exigir_destino sube por los padres del destino: nada dentro de PROHIBIDOS (sin tocar Drive)."""
    import pytest
    import expediente

    padres = {"sub-de-nucos": expediente.NUCOS, expediente.NUCOS: "raiz-x", "prueba": "mi-unidad", "mi-unidad": None}

    class Peticion:
        def __init__(self, padre):
            self.padre = padre

        def execute(self):
            return {"parents": [self.padre]} if self.padre else {}

    class Archivos:
        def get(self, fileId, **_):
            return Peticion(padres.get(fileId))

    class Drive:
        def files(self):
            return Archivos()

    for destino in (expediente.NUCOS, "sub-de-nucos"):
        with pytest.raises(SystemExit, match="NUCOS VEHICULOS"):
            expediente.exigir_destino(Drive(), destino)
    expediente.exigir_destino(Drive(), "prueba")   # la carpeta de prueba sí


def test_seguro_no_aplica_lleva_la_imagen_de_inexistente_solo_si_no_hay_poliza():
    imagen = {"id": "img", "name": "CARPETA SIN INFORMACIÓN.jpg", "mimeType": "image/jpeg"}
    vacio = carpeta("1.-DOCUMENTACIÓN", carpeta("2.-SEGURO"))
    copias, resumen = reglas.planear_nuco("45", [vacio], {}, imagen)
    assert [("/".join(c["destino"][1:]), c["nombre"]) for c in copias] == [("2.-SEGURO", "SEGURO-0045 NO APLICA.jpg")]
    assert resumen["sin_seguro"]
    con_poliza = carpeta("1.-DOCUMENTACIÓN", carpeta("2.-SEGURO", archivo("poliza.pdf")))
    copias, resumen = reglas.planear_nuco("45", [con_poliza], {}, imagen)
    assert [c["nombre"] for c in copias] == ["SEGURO-0045.pdf"] and not resumen.get("sin_seguro")
