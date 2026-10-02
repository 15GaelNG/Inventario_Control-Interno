"""El registro de pasos: nombre → función, y cuáles solo leen. Lo usan el motor y las pruebas."""
import pasos_familia
import pasos_ids

PASOS = {
    "revisar": pasos_ids.revisar,
    "renombrar": pasos_ids.renombrar,
    "ids": pasos_ids.asignar,
    "mover": pasos_ids.mover,
    "respaldo": pasos_ids.respaldo,
    "auditar": pasos_ids.auditar,
    "nombres": pasos_familia.nombres,
    "referencias": pasos_familia.referencias,
}

SOLO_LEEN = {"revisar", "auditar"}

# El orden de los pipelines, igual que PASOS_IDS y PASOS_HOMOLOGA de MigracionFamilia.gs
# (sin `sincronizar`, que se queda en Apps Script). La marca mala detiene una corrida que escribe.
PIPELINE_IDS = [
    ("revisar", "PROBLEMAS ("),
    ("renombrar", "PROBLEMAS ("),
    ("ids", None),
    ("mover", None),
    ("respaldo", None),
    ("auditar", "FALLAS ("),
]
PIPELINE_FAMILIA = [
    ("nombres", "PROBLEMAS ("),
    ("referencias", None),
    ("auditar", "FALLAS ("),
]
# Las familias que se homologan aquí. 'otros' no tiene nada que homologar y 'capitalhumano'
# es de Apps Script (CapitalHumano.identificar / revisarLigas).
FAMILIAS_HOMOLOGA = ["vehiculos", "lineas", "cajachica"]


def correr(libro, entrada, escribir, ids):
    """Un paso suelto. `entrada` es 'paso' o 'paso:familia'."""
    paso, _, familia = entrada.partition(":")
    fn = PASOS[paso]
    return fn(libro, {"escribir": escribir and paso not in SOLO_LEEN, "familia": familia or None, "ids": ids})
