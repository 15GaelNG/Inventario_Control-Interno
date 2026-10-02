"""Una fila en LOG_MIGRACION, con las mismas columnas que pipeLog_ (MigracionPipeline.gs):

    FECHA · PASO · SPREADSHEET · MODO · RESULTADO · RESUMEN · QUIEN

PASO lleva el prefijo `py:` para distinguir las corridas de Python de las de Apps Script.
La bitácora nunca tumba una corrida: si falla, lo dice y sigue.
"""
import datetime
import getpass
import subprocess

HOJA = "LOG_MIGRACION"
ENCABEZADOS = ["FECHA", "PASO", "SPREADSHEET", "MODO", "RESULTADO", "RESUMEN", "QUIEN"]
_EPOCA_SHEETS = datetime.datetime(1899, 12, 30)


def quien():
    try:
        correo = subprocess.run(["git", "config", "user.email"], capture_output=True, text=True).stdout.strip()
    except OSError:
        correo = ""
    return "python · " + (correo or getpass.getuser())


def _serial(momento):
    return (momento - _EPOCA_SHEETS).total_seconds() / 86400


def anotar(api, ss_id, paso, modo, resultado, resumen):
    try:
        meta = api.get(spreadsheetId=ss_id, fields="sheets.properties(sheetId,title)").execute()
        hoja = next((s["properties"]["sheetId"] for s in meta["sheets"] if s["properties"]["title"] == HOJA), None)
        reqs = []
        if hoja is None:
            hoja = 987654321
            reqs.append({"addSheet": {"properties": {"sheetId": hoja, "title": HOJA,
                                                     "gridProperties": {"frozenRowCount": 1}}}})
            reqs.append({"appendCells": {"sheetId": hoja, "fields": "userEnteredValue",
                                         "rows": [{"values": [{"userEnteredValue": {"stringValue": e}} for e in ENCABEZADOS]}]}})
        fila = [{"userEnteredValue": {"numberValue": _serial(datetime.datetime.now())},
                 "userEnteredFormat": {"numberFormat": {"type": "DATE_TIME", "pattern": "d/m/yyyy H:mm:ss"}}}]
        for v in ["py:" + paso, ss_id, modo, resultado, str(resumen or "")[:2000], quien()]:
            fila.append({"userEnteredValue": {"stringValue": v}})
        reqs.append({"appendCells": {"sheetId": hoja, "fields": "userEnteredValue,userEnteredFormat.numberFormat",
                                     "rows": [{"values": fila}]}})
        api.batchUpdate(spreadsheetId=ss_id, body={"requests": reqs}).execute()
    except Exception as e:  # noqa: BLE001 — la bitácora no puede tumbar la corrida
        print("  (no se pudo anotar en %s: %s)" % (HOJA, e))
