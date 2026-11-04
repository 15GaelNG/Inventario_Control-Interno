import json
import os
import sys
import glob

WIN_SCRATCH = sys.argv[1]
MANIFEST = os.path.join(WIN_SCRATCH, "manifest.json")
RESULTADOS = os.path.join(WIN_SCRATCH, "resultados", "*.json")

CLAVES = ['GATO HIDRAULICO', 'GATO MECANICO', 'LLAVE CRUZ', 'MANERAL', 'LLANTA REFACCION',
          'KIT SEGURIDAD', 'PARASOL', 'TAPETES RUDO', 'TAPETES ALFOMBRA', 'CUBRE VOLANTE',
          'CUBRE ASIENTOS', 'BED LINER', 'CUBIERTA BATEA']


def main():
    manifest = json.load(open(MANIFEST, encoding='utf-8'))
    combinado = {}

    for e in manifest:
        if e['tipo'] == 'DIGITAL_LIMPIO':
            combinado[e['archivo']] = {
                'archivo': e['archivo'], 'nuco': e.get('nuco'), 'folio': e.get('folio'),
                'placa': e.get('placa'), 'origen_extraccion': 'CODIGO',
                'plantilla': 'VIEJA_4' if len(e['datos']) == 4 else 'NUEVA_13',
                'datos': e['datos'],
            }
        elif e['tipo'] == 'EXCLUIDO_XLSX':
            combinado[e['archivo']] = {
                'archivo': e['archivo'], 'nuco': e.get('nuco'), 'folio': e.get('folio'),
                'placa': e.get('placa'), 'origen_extraccion': 'EXCLUIDO',
                'plantilla': 'XLSX_NO_RESPONSIVA', 'datos': None,
            }

    faltantes_en_lotes = set()
    for f in glob.glob(RESULTADOS):
        lote = json.load(open(f, encoding='utf-8'))
        for e in lote:
            combinado[e['archivo']] = {
                'archivo': e['archivo'], 'nuco': e.get('nuco'), 'folio': e.get('folio'),
                'placa': None, 'origen_extraccion': 'VISUAL',
                'plantilla': e.get('plantilla'), 'datos': e.get('datos'),
                'nota': e.get('nota'),
            }

    # confirm every manifest entry marked NECESITA_VISUAL got a result back
    for e in manifest:
        if e['tipo'] == 'NECESITA_VISUAL' and e['archivo'] not in combinado:
            faltantes_en_lotes.add(e['archivo'])

    filas = list(combinado.values())

    resumen = {
        'total_archivos': len(filas),
        'con_datos': sum(1 for f in filas if f['datos']),
        'NO_RESPONSIVA': sum(1 for f in filas if f['plantilla'] == 'NO_RESPONSIVA'),
        'EXCLUIDO_XLSX': sum(1 for f in filas if f['plantilla'] == 'XLSX_NO_RESPONSIVA'),
        'sin_datos_ilegible': sum(1 for f in filas if f['datos'] is None and f['plantilla'] not in ('NO_RESPONSIVA', 'XLSX_NO_RESPONSIVA')),
        'VIEJA_4': sum(1 for f in filas if f['plantilla'] == 'VIEJA_4'),
        'NUEVA_13': sum(1 for f in filas if f['plantilla'] == 'NUEVA_13'),
        'faltantes_sin_resultado': sorted(faltantes_en_lotes),
    }

    out = os.path.join(WIN_SCRATCH, 'compilado.json')
    with open(out, 'w', encoding='utf-8') as f:
        json.dump({'resumen': resumen, 'filas': filas}, f, ensure_ascii=False, indent=1)

    print(json.dumps(resumen, ensure_ascii=False, indent=1))
    print('compilado:', out)


if __name__ == '__main__':
    main()
