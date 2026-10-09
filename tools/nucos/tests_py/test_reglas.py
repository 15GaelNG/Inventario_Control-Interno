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
    assert d["FACTURA 293.pdf"] == "1.-FACTURA/FACTURA-0293.pdf"                  # la factura antes que la carta
    assert d["CARTA FACTURA 293.pdf"] == "1.-FACTURA/FACTURA-0293 2023-06-01.pdf"   # aunque la carta sea más reciente
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


def test_adherentes_van_a_adherentes_con_sus_variantes_y_no_cuentan_como_responsiva():
    doc = carpeta("1.-DOCUMENTACIÓN", carpeta("9.- CARTA RESPONSIVA",
        carpeta("ADHERENTES", archivo("JORGE CASTAÑON GONZALEZ-28.pdf")),
        carpeta("ADHERENTES ANTERIORES", archivo("VICTOR CARDOSO-28.pdf")),
        carpeta("BAJA DE ADHERENTES", archivo("PEDRO-28.pdf"))))
    copias, resumen = reglas.planear_nuco("28", [doc], {})
    d = destinos(copias)
    assert d["JORGE CASTAÑON GONZALEZ-28.pdf"] == "5.-RESPONSIVA/ADHERENTES/ADHERENTE-0028.pdf"
    assert d["VICTOR CARDOSO-28.pdf"] == "5.-RESPONSIVA/ADHERENTES/ADHERENTES ANTERIORES/ADHERENTE-0028.pdf"
    assert d["PEDRO-28.pdf"] == "5.-RESPONSIVA/ADHERENTES/BAJA DE ADHERENTES/ADHERENTE-0028.pdf"
    assert resumen["docs"]["RESPONSIVA"] == 0          # tener adherentes no es tener responsiva
    assert {c["fuente"] for c in copias} == {"nuco"}


def test_lo_de_appsheet_y_la_app_se_marca_para_copiar_y_lo_del_nuco_para_mover():
    doc = carpeta("1.-DOCUMENTACIÓN", carpeta("1.-FACTURA", archivo("f.pdf")))
    adherente_app = dict(archivo("ADHERENTE VEHICULAR X.pdf"), de="ADHERENTE VEHICULAR (app)", fuente="app", sub=["ADHERENTES"])
    copias, _ = reglas.planear_nuco("5", [doc], {"TENENCIA": [archivo("t.pdf")], "RESPONSIVA": [adherente_app]})
    fuentes = {c["de"].split("/")[-1]: (c["fuente"], "/".join(c["destino"][1:])) for c in copias}
    assert fuentes["f.pdf"] == ("nuco", "1.-FACTURA")
    assert fuentes["t.pdf"] == ("hoja", "6.-TENENCIA")
    assert fuentes["ADHERENTE VEHICULAR X.pdf"] == ("app", "5.-RESPONSIVA/ADHERENTES")


def test_repetidos_gana_el_del_nuco_y_el_otro_repetido_del_nuco_sale_a_anteriores():
    doc = carpeta("1.-DOCUMENTACIÓN",
        carpeta("9.- CARTA RESPONSIVA", archivo("JUAN - 100.pdf", "2023-01-01T00:00:00Z", md5="r")),
        archivo("350.- Factura.pdf", "2022-01-01T00:00:00Z", md5="f"),
        carpeta("350.- RESPONSIVA ILEANA", archivo("350.- Factura.pdf", "2024-01-01T00:00:00Z", md5="f")))
    adj = dict(archivo("refwf219.RESPONSIVA.pdf", "2025-01-01T00:00:00Z", md5="r"))
    copias, resumen = reglas.planear_nuco("100", [doc], {"RESPONSIVA": [adj]})
    porfuente = sorted((c["fuente"], "/".join(c["destino"][1:]), c["de"].split("/")[-1]) for c in copias)
    assert ("nuco", "5.-RESPONSIVA", "JUAN - 100.pdf") in porfuente                 # el del NUCO, no la copia de AppSheet
    assert not any(f == "hoja" for f, _, _ in porfuente)
    assert ("nuco", "1.-FACTURA", "350.- Factura.pdf") in porfuente
    assert any(d.startswith("ANTERIORES/REPETIDOS") for f, d, n in porfuente if n == "350.- Factura.pdf")
    assert resumen["duplicados"] == 2 and resumen["repetidos"] == 1


def test_errores_de_dedo_se_reconocen_sin_confundir_palabras_parecidas():
    assert reglas.concepto_archivo("RESPONSVIA 350 ENERO 2025.pdf") == "RESPONSIVA"
    assert reglas.concepto_archivo("TARJETA DE CIRUCLACION 12.pdf") == "TARJETA DE CIRCULACION"
    assert reglas.concepto_archivo("TENENCIAS 2024.pdf") == "TENENCIA"
    assert reglas.concepto("2.- POLIZAS") == "SEGURO"
    assert reglas.es_anterior("RESPONSIVS ANTERIRES") and reglas.es_adherente("ADHERENTS")
    # Lo que se parece pero no es
    assert reglas.concepto_archivo("RESPONSABLE DE UNIDAD.pdf") is None
    assert reglas.concepto_archivo("PERMISO PARA CIRCULAR.pdf") is None
    assert not reglas.es_anterior("FOTOS INTERIOR")
    assert reglas.concepto_archivo("ALTO.pdf") is None                      # las claves cortas se piden exactas


def test_una_subcarpeta_dentro_de_un_documento_se_conserva():
    doc = carpeta("1.-DOCUMENTACIÓN", carpeta("2.-SEGURO",
        archivo("poliza 2026.pdf", "2026-01-01T00:00:00Z"),
        carpeta("SEGURO VENCIDO", archivo("5-SEGURO 2025-4406.pdf", "2026-05-01T00:00:00Z"))))
    d = destinos(reglas.planear_nuco("100", [doc], {})[0])
    assert d["poliza 2026.pdf"] == "2.-SEGURO/SEGURO-0100.pdf"                     # la vigente, aunque la vencida sea más nueva
    assert d["5-SEGURO 2025-4406.pdf"] == "2.-SEGURO/SEGURO VENCIDO/SEGURO-0100.pdf"


def test_falsos_positivos_que_encontro_la_medicion():
    assert reglas.concepto_archivo("SALVADOR SARABIA SEGURA-74.pdf") is None          # apellido, no póliza
    assert reglas.concepto_archivo("FCATURA SERVICIO.pdf") is None
    assert reglas.concepto_archivo("Permiso circulación 165067.pdf") is None
    doc = carpeta("1.-DOCUMENTACIÓN", carpeta("SERVICIO", archivo("ROLJ580205EP0_Factura__106.xml")))
    d = destinos(reglas.planear_nuco("106", [doc], {})[0])
    assert d["ROLJ580205EP0_Factura__106.xml"].startswith("ANTERIORES/SERVICIO/")
