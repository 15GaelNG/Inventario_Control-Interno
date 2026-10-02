"""PARIDAD: el port de Python hace exactamente lo que hacía Apps Script.

Para cada escenario se corre la misma lista de pasos dos veces:
  - con el código de Apps Script (tools/migracion/oraculo.js, sobre el libro falso de JS),
  - con el port (pasos.py, sobre LibroMemoria),
con el mismo generador y la misma semilla. Se exige que el reporte de cada paso sea idéntico
letra por letra, y que cada celda de cada hoja diga lo mismo.

Las celdas se comparan como texto (texto_js): Apps Script escribe "45" y Sheets lo guarda
como 45, mientras que el port deja el 45 que ya estaba porque no cambió. En la hoja real
quedan iguales.
"""
import json
import subprocess

import pytest

import escenarios
from ids import Ids, Mulberry32
from jsnode import RAIZ
from libro import LibroMemoria
from pasos import FAMILIAS_HOMOLOGA, PIPELINE_FAMILIA, PIPELINE_IDS, correr
from valores import texto_js

SEMILLA = 1234

TODO = ([p for p, _ in PIPELINE_IDS] +
        [p + ":" + f for f in FAMILIAS_HOMOLOGA for p, _ in PIPELINE_FAMILIA])


def oraculo(datos, pasos, escribir, tmp_path):
    entrada, salida = tmp_path / "entrada.json", tmp_path / "salida.json"
    entrada.write_text(json.dumps(datos), encoding="utf-8")
    cmd = ["node", "tools/migracion/oraculo.js", str(entrada), str(salida),
           "--pasos", ",".join(pasos), "--semilla", str(SEMILLA)]
    if escribir:
        cmd.append("--escribir")
    r = subprocess.run(cmd, cwd=RAIZ, capture_output=True, text=True, encoding="utf-8")
    assert r.returncode == 0, r.stderr
    return json.loads(salida.read_text(encoding="utf-8"))


def port(datos, pasos, escribir):
    libro = LibroMemoria(json.loads(json.dumps(datos)))
    generador = Ids(Mulberry32(SEMILLA))
    reportes = []
    for p in pasos:
        try:
            texto = correr(libro, p, escribir, generador)
        except Exception as e:   # el oráculo hace lo mismo: el error es parte del reporte
            texto = "TRONÓ: " + str(e)
        reportes.append({"paso": p, "texto": texto})
    return {"libro": libro.a_json(), "reportes": reportes}


def _rejilla(h):
    return [[texto_js(v) for v in f] for f in h["valores"]]


def comparar(js, py):
    for a, b in zip(js["reportes"], py["reportes"]):
        assert a["paso"] == b["paso"]
        assert b["texto"] == a["texto"], "El reporte de '%s' difiere" % a["paso"]
    assert len(js["reportes"]) == len(py["reportes"])
    assert py["libro"]["sellado"] == js["libro"]["sellado"]
    assert set(py["libro"]["hojas"]) == set(js["libro"]["hojas"])
    for n, a in js["libro"]["hojas"].items():
        b = py["libro"]["hojas"][n]
        assert _rejilla(b) == _rejilla(a), "Las celdas de %s difieren" % n
        assert (b["maxFilas"], b["maxColumnas"]) == (a["maxFilas"], a["maxColumnas"]), n
        assert b["texto"] == a["texto"], "El formato de texto de %s difiere" % n


CASOS = [
    ("pre-migracion, ensayo", escenarios.pre_migracion, TODO, False),
    ("pre-migracion, escribiendo", escenarios.pre_migracion, TODO, True),
    ("con problemas, ensayo", escenarios.con_problemas, TODO, False),
    ("con problemas, escribiendo", escenarios.con_problemas, TODO, True),
    ("tres generaciones de ID", escenarios.tres_generaciones, TODO, True),
    ("sellado", escenarios.sellado, TODO, True),
]


@pytest.mark.parametrize("nombre,armar,pasos,escribir", CASOS, ids=[c[0] for c in CASOS])
def test_paridad(nombre, armar, pasos, escribir, tmp_path):
    datos = armar()
    comparar(oraculo(datos, pasos, escribir, tmp_path), port(datos, pasos, escribir))


def test_paridad_segunda_corrida(tmp_path):
    """Idempotencia: sobre el libro YA migrado por el oráculo, los dos dicen lo mismo."""
    primera = oraculo(escenarios.pre_migracion(), TODO, True, tmp_path)["libro"]
    comparar(oraculo(primera, TODO, True, tmp_path), port(primera, TODO, True))


def test_segunda_corrida_no_escribe_nada():
    libro = LibroMemoria(escenarios.pre_migracion())
    generador = Ids(Mulberry32(SEMILLA))
    for p in TODO:
        correr(libro, p, True, generador)
    libro.confirmar()
    libro.celdas_escritas = 0
    for p in TODO:
        correr(libro, p, True, generador)
    assert libro.ops == [] and libro.celdas_escritas == 0


# ------------------------------------------------------------------ sobre datos reales
#
# Con FOTO=ruta/al.json corre la paridad sobre una foto real (tools/migracion/foto.py). No
# corre por omisión: la foto trae datos personales y no vive en el repo.
import os  # noqa: E402

FOTO = os.environ.get("FOTO")


@pytest.mark.skipif(not FOTO, reason="sin FOTO=ruta (foto real de un libro)")
@pytest.mark.parametrize("escribir", [False, True], ids=["ensayo", "escribiendo"])
def test_paridad_foto_real(escribir, tmp_path):
    datos = json.loads(open(FOTO, encoding="utf-8").read())
    js = oraculo(datos, TODO, escribir, tmp_path)
    py = port(datos, TODO, escribir)
    (tmp_path.parent / ("reportes-%s.txt" % ("escribir" if escribir else "ensayo"))).write_text(
        "\n\n".join("##### " + r["paso"] + "\n" + r["texto"] for r in py["reportes"]), encoding="utf-8")
    comparar(js, py)
