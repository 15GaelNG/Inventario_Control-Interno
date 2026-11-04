import pymupdf
import glob
import json
import sys

OLD_LABELS = [
    'GATO HIDRAULICO', 'LLAVE CRUZ', 'LLANTA REFACCION', 'KIT SEGURIDAD',
]
NEW_LABELS = [
    'GATO HIDRAULICO', 'GATO MECANICO', 'LLAVE CRUZ', 'MANERAL',
    'LLANTA REFACCION', 'KIT SEGURIDAD', 'PARASOL', 'TAPETES RUDO',
    'TAPETES ALFOMBRA', 'CUBRE VOLANTE', 'CUBRE ASIENTOS', 'BED LINER',
    'CUBIERTA BATEA',
]


def extraer(path):
    doc = pymupdf.open(path)
    widgets = [w for w in (doc[0].widgets() or [])
               if w.field_type_string in ('CheckBox', 'Button')]
    n = len(widgets)
    if n not in (10, 26):
        return {'archivo': path, 'plantilla': 'DESCONOCIDA', 'n_casillas': n, 'datos': None}

    # cluster rows by proximity in y: sort ascending and group widgets whose y0
    # is within TOL points of the running row average (SI/NO checkboxes in the
    # same row are not pixel-aligned across the two columns in every template).
    TOL = 6
    ws_sorted = sorted(widgets, key=lambda w: w.rect.y0)
    merged = []
    for w in ws_sorted:
        if merged and w.rect.y0 - merged[-1][0] <= TOL:
            group = merged[-1][1]
            group.append(w)
            merged[-1][0] = sum(x.rect.y0 for x in group) / len(group)
        else:
            merged.append([w.rect.y0, [w]])

    row_list = []
    for y, ws in merged:
        if len(ws) != 2:
            return {'archivo': path, 'plantilla': 'FILA_IRREGULAR', 'n_casillas': n, 'datos': None}
        ws_sorted = sorted(ws, key=lambda w: w.rect.x0)
        si_w, no_w = ws_sorted[0], ws_sorted[1]
        si_val = si_w.field_value not in (None, '', 'Off')
        no_val = no_w.field_value not in (None, '', 'Off')
        if si_val and not no_val:
            estado = 'SI'
        elif no_val and not si_val:
            estado = 'NO'
        elif si_val and no_val:
            estado = 'AMBIGUO'
        else:
            estado = None
        row_list.append(estado)

    if n == 10:
        labels = OLD_LABELS
        filas = row_list[1:]  # la primera fila es "en buenas condiciones", no es un accesorio
    else:
        labels = NEW_LABELS
        filas = row_list

    if len(filas) != len(labels):
        return {'archivo': path, 'plantilla': 'CONTEO_INESPERADO', 'n_casillas': n, 'datos': None}

    datos = dict(zip(labels, filas))
    return {'archivo': path, 'plantilla': 'VIEJA_4' if n == 10 else 'NUEVA_13',
            'n_casillas': n, 'datos': datos}


if __name__ == '__main__':
    import os
    carpeta = sys.argv[1] if len(sys.argv) > 1 else '.'
    resultados = []
    for f in sorted(glob.glob(os.path.join(carpeta, '*.pdf'))):
        try:
            r = extraer(f)
        except Exception as e:
            r = {'archivo': f, 'plantilla': 'ERROR', 'error': str(e)}
        resultados.append(r)
    print(json.dumps(resultados, ensure_ascii=False, indent=1))
