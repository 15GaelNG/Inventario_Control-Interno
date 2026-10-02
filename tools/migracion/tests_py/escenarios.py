"""Libros de prueba para la paridad. Cada uno es el JSON de tests/fakes/libro-en-memoria.js.

Están armados para pasar por los casos que ya costaron algo (ver los comentarios de
MigracionIds.gs): renglones en blanco intercalados, la llave sin encabezado de CAMBIOS
LINEAS, el NUCO deducido, el cero a la izquierda perdido, padres ambiguos, las llaves que
son dato de negocio, huérfanas, y rejillas justas que obligan a insertar columnas.
"""
import copy


def _h(valores, max_filas=None, max_cols=None):
    return {"valores": valores,
            "maxFilas": max_filas or len(valores) + 5,
            "maxColumnas": max_cols or max(len(f) for f in valores)}


def pre_migracion():
    """Como llega producción: sin columna ID, cada hoja con su llave vieja."""
    hojas = {
        "VEHICULOS": _h([
            ["ID_VEHICULO", "FOLIO", "SERIE VEHICULO", "UBICACION", "PLACA"],
            ["E5818DE5", "CTA0100", "3VW1K1AJ5EM123456", "OFICINA", "AAA111"],
            ["REFWF1", "CTA0101", "1HGCM82633A004352", "OBRA", "BBB222"],
            [],
            ["A1B2C3D4", "CTA0102", "", "", 45],
            ["01092110", "CTA0103", "JH4KA7650MC012345", "OFICINA", "CCC333"],
        ]),
        "CAMBIOS VEHICULOS": _h([
            ["ID_CAMBIO", "FOLIO", "CAMPO"],
            ["d13c9d1d", "CTA0100", "PLACA"],
            ["d13c9d1e", "CTA9999", "PLACA"],
            ["d13c9d1f", " cta0101 ", "COLOR"],
        ]),
        "REASIGNACIONES_VEHICULOS": _h([
            ["ID Reasignacion Vehicular", "Folio Vehiculo"],
            ["R1", "CTA0102"],
        ]),
        "VERIFICACIONES": _h([
            ["ID_VERIFICACION", "FOLIO VEHICULO"],
            ["V1", "CTA0100"],
            ["V2", "CTA0103"],
        ]),
        "INSPECCION VEHICULAR": _h([
            ["ID INSPECCION", "FOLIO", "KM"],
            ["2026_451_1", "CTA0100", 1200],
            ["2026_451_2", "CTA0101", 1300.5],
        ]),
        "INSTALACION DE SENSORES": _h([
            ["ID_SENSOR", "FOLIO"],
            ["S1", "CTA0101"],
            ["S2", "CTA0555"],
        ]),
        "HOLOGRAMAS": _h([
            ["ID_HOLOGRAMA", "SERIE VEHICULO"],
            ["H1", "3VW1K1AJ5EM123456"],
            ["H2", "_VR3EC9ZZZ"],
            ["H3", ""],
        ]),
        "INCIDENCIAS": _h([
            ["ID_INCIDENCIA", "FOLIO"],
            ["I1", "CTA0103"],
        ]),
        "LINEAS TELEFONICAS": _h([
            ["ID", "NUCO", "LINEA"],
            ["873bb085", 10001, "5512345678"],
            ["01092110", 1484, "5587654321"],
            ["DV1SD13", 1080, "5511112222"],
            [],
            ["DG001", 2000, "5533334444"],
        ], max_cols=3),
        "INSPECCIONES LINEAS": _h([
            ["ID", "ID LINEA", "FECHA"],
            ["IL1", "873bb085", 46000],
            ["IL2", 1092110, 46001],
            ["IL3", "NOEXISTE", 46002],
            [],
        ], max_cols=3),
        "RESPONSIVAS LINEAS": _h([
            ["ID", "ID LINEA"],
            ["RL1", "DV1SD13"],
            [],
            [],
            ["RL2", "dg001"],
        ], max_cols=2),
        "CAMBIOS LINEAS TELEFONICAS": _h([
            ["", "ID_LINEA", "", "IMEI"],
            ["ee398840", "873bb085", 10001, "356938035643809"],
            ["4a46be25", "DV1SD13", 1080, "356938035643810"],
            ["4a46be26", "DG001", 2000, ""],
            ["4a46be27", "01092110", 1484, "x"],
        ]),
        "ACCESORIOS CELULARES": _h([
            ["ID_Accesorio", "NOMBRE"],
            ["ACC1", "Funda"],
            ["ACC2", "Cargador"],
        ]),
        "MOVIMIENTOS_ACCESORIOS": _h([
            ["ID_Movimiento", "ID_Accesorio"],
            ["M1", "ACC1"],
            ["M2", "ACC9"],
        ]),
        "ARQUEOS": _h([
            ["ID ARQUEO", "ID CCH"],
            ["2026_225_001", 1],
            ["2026_225_002", 2],
        ]),
        "CAJAS CHICAS": _h([
            ["ID CCH", "RESPONSABLE"],
            [1, "Ana"],
            [2, "Luis"],
            [3, "Eva"],
        ]),
        "INCREMENTOS": _h([
            ["ID", "ID CCH", "MONTO"],
            ["MONX1", 1, 500],
            ["MONX2", "3", 700],
        ], max_cols=3),
        "UBER": _h([["ID", "VIAJE"], ["U1", "a"], ["U2", "b"]], max_cols=2),
        "TICKETS": _h([["ID", "PLACA"], ["T1", "VARIAS"]], max_cols=2),
        "COLABORADORES": _h([["No EMPLEADO", "NOMBRE"], ["CIB01608", "Ana"], ["CIB01609", "Luis"]]),
    }
    return {"id": "LIBRO", "nombre": "Prueba", "sellado": False, "hojas": hojas}


def con_problemas():
    """Lo que `revisar` debe atrapar: repetidos, renglón con datos sin llave, encabezado vacío."""
    d = pre_migracion()
    h = d["hojas"]
    h["UBER"]["valores"].append(["U1", "repetido"])
    h["TICKETS"]["valores"].append(["", "con datos y sin llave"])
    h["VERIFICACIONES"]["valores"][0].append("")
    h["VERIFICACIONES"]["valores"][1].append("algo")
    h["VERIFICACIONES"]["maxColumnas"] = 3
    del h["INCIDENCIAS"]
    return d


def tres_generaciones():
    """LINEAS ya migrada dos veces (como el libro del equipo): ID, ID ANTERIOR e ID APPSHEET."""
    d = pre_migracion()
    h = d["hojas"]
    h["LINEAS TELEFONICAS"] = _h([
        ["ID", "ID ANTERIOR", "ID APPSHEET", "NUCO"],
        ["LIN-00000000AAAAAA", "LIN-00000000ZZZZZZ", "873bb085", 10001],
        ["LIN-00000001AAAAAA", "LIN-00000001ZZZZZZ", "01092110", 1484],
        ["LIN-00000002AAAAAA", "", "DV1SD13", 1080],
        ["LIN-00000003AAAAAA", "", "DUPLICADO", 1],
        ["LIN-00000004AAAAAA", "", "DUPLICADO", 2],
    ])
    h["INSPECCIONES LINEAS"]["valores"] = [
        ["ID", "ID LINEA"],
        ["IL1", "873bb085"],
        ["IL2", "LIN-00000001ZZZZZZ"],
        ["IL3", "LIN-00000002AAAAAA"],
        ["IL4", "DUPLICADO"],
        ["IL5", 1092110],
    ]
    return d


def sellado():
    d = pre_migracion()
    d["sellado"] = True
    return d


def copia(d):
    return copy.deepcopy(d)
