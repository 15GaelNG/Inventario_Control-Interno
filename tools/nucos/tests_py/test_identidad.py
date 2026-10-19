"""identidad.Flota y veredicto: los VIN de la flota con errores de OCR, la basura que no cuenta y la placa."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import identidad  # noqa: E402

FLOTA = identidad.Flota([
    {"NUCCO": "22", "SERIE VEHICULO": "3N6AD33A8LK863007", "PLACA": "UNE-566-E"},
    {"NUCCO": "91", "SERIE VEHICULO": "1N6AA0EJXEN519146", "PLACA": "VF-1234-A"},
    {"NUCCO": "300", "SERIE VEHICULO": "93Y1R4F58RJ625824", "PLACA": "SIN PLACA"},
    {"NUCCO": "111", "SERIE VEHICULO": "3MGN1R756LM000181", "PLACA": ""},
])


def test_vin_exacto_aunque_venga_partido():
    assert identidad.veredicto("22", FLOTA.buscar("No. de Serie: 3N6 AD33A-8LK 863007"))[0] == "CONFIRMADO"


def test_vin_con_errores_tipicos_del_ocr():
    # O por 0, S por 5 y una letra de más
    v = identidad.veredicto("22", FLOTA.buscar("SERIE 3N6AD33A8LKX863OO7"))
    assert v[0] == "CONFIRMADO" and "error" in v[1]


def test_vin_al_que_le_falta_un_caracter():
    assert identidad.veredicto("111", FLOTA.buscar("serie 3MGN1R756LM00181"))[0] == "CONFIRMADO"


def test_documento_de_otra_unidad():
    assert identidad.veredicto("117", FLOTA.buscar("No. de serie 93Y1R4F58RJ625824")) == ("OTRA UNIDAD", "VIN de otro NUCO", "300")


def test_la_basura_con_forma_de_vin_no_cuenta():
    assert identidad.veredicto("22", FLOTA.buscar("CP62029CUERNAVACA 7BVM3W560EKXGLEVA"))[0] == "SIN CONFIRMAR"


def test_placa_propia_y_sin_placa_no_es_placa():
    assert identidad.veredicto("22", FLOTA.buscar("Placas: UNE566E"))[:2] == ("CONFIRMADO", "placa")
    assert "SINPLACA" not in FLOTA.placa


def test_menciona_su_vin_y_el_de_otra():
    v = identidad.veredicto("22", FLOTA.buscar("3N6AD33A8LK863007 y 1N6AA0EJXEN519146"))
    assert v[0] == "CONFIRMADO" and "91" in v[1]
