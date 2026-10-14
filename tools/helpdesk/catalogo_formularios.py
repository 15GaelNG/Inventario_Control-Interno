"""
Arma src/config/HelpdeskFormularios.gs desde el Excel "Catalogo_Maestro_HelpDesk_Control_Interno.xlsx"
(hojas FORMULARIOS, CAMPOS y OPCIONES): los formularios del helpdesk de TI que atiende nuestro grupo,
con sus campos y las opciones de sus listas. Es lo que enseña Help Desk > Formularios.

Solo datos: a qué módulo nuestro corresponde cada formulario NO va aquí (se escribe a mano en
HelpdeskService.gs, MODULO_POR_FORMULARIO), así que regenerar no lo borra.

Correr (cuando TI cambie sus formularios y llegue un Excel nuevo):
    uv run --no-project --with openpyxl python tools/helpdesk/catalogo_formularios.py RUTA/AL/EXCEL.xlsx
"""
import json
import sys
from pathlib import Path

import openpyxl

SALIDA = Path(__file__).resolve().parents[2] / 'src' / 'config' / 'HelpdeskFormularios.gs'


def filas(hoja):
    """Los renglones de una hoja como dicts por encabezado (sin los vacíos)."""
    valores = list(hoja.iter_rows(values_only=True))
    encabezados = [str(h).strip() if h is not None else '' for h in valores[0]]
    for renglon in valores[1:]:
        if any(v is not None and str(v).strip() for v in renglon):
            yield dict(zip(encabezados, renglon))


def texto(v):
    return ' '.join(str(v).split()) if v is not None else ''


def entero(v):
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def main(ruta):
    libro = openpyxl.load_workbook(ruta, data_only=True, read_only=True)
    opciones = {}
    for o in filas(libro['OPCIONES']):
        if entero(o.get('status')) == 0:
            continue
        opciones.setdefault((entero(o['idForm']), entero(o['idField'])), []).append(texto(o['option']))

    campos = {}
    for c in filas(libro['CAMPOS']):
        if entero(c.get('status')) == 0:
            continue
        form, campo = entero(c['idForm']), entero(c['idField'])
        campos.setdefault(form, []).append({
            'id': campo,
            'etiqueta': texto(c.get('tagAgent') or c.get('tagCustomer')),
            'tipo': texto(c.get('type')),
            'opciones': opciones.get((form, campo), []),
        })

    formularios = []
    for f in filas(libro['FORMULARIOS']):
        form = entero(f['idForm'])
        formularios.append({'id': form, 'nombre': texto(f['nombre_formulario']), 'campos': campos.get(form, [])})

    datos = json.dumps(formularios, ensure_ascii=False, indent=2)
    SALIDA.write_text(
        '/**\n'
        ' * HelpdeskFormularios.gs: GENERADO por tools/helpdesk/catalogo_formularios.py desde el Excel\n'
        ' * "Catalogo_Maestro_HelpDesk_Control_Interno.xlsx". No se edita a mano: se vuelve a generar.\n'
        ' * Los formularios del helpdesk de TI que atiende nuestro grupo, con sus campos y opciones.\n'
        ' * Algunas listas (Departamento, Oficina) no traen opciones en el Excel: el helpdesk las da\n'
        ' * por ticket (getNewTicketCatalogs, dataComponent4).\n'
        ' */\n\n'
        'const HELPDESK_FORMULARIOS = ' + datos + ';\n',
        encoding='utf-8', newline='\n')
    total_campos = sum(len(f['campos']) for f in formularios)
    print(f'{SALIDA.name}: {len(formularios)} formularios, {total_campos} campos')


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
