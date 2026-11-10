"""La inspección vehicular, para replicarla en HTML: las n más recientes de CADA tipo (producción, solo lectura).

    uv run --with google-api-python-client --with google-auth --with google-auth-oauthlib --with pymupdf \
        python tools/pdf/html/bajar-inspecciones.py [2]
        … bajar-inspecciones.py diagramas      (solo los dibujos en blanco)

Cada tipo (hoja MODELOS INSPECCION) tiene su plantilla de Docs, sus piezas y sus diagramas; aquí se bajan, en
tools/pdf/.cache/inspeccion-vehicular/ (fuera de git):
  rNN.pdf                  los PDF reales (los de un tipo, juntos; del más viejo al más nuevo dentro del tipo)
  casos.json               por caso: nombre, tipo, quién hizo el PDF (app = Docs, AppSheet = Chromium), el renglón y
                           las imágenes (diagramas rayados y firmas, de sus ligas o del PDF)
  tipos.json               la fila de MODELOS INSPECCION de cada tipo
  plantillas/<TIPO>/       la exportación HTML de su plantilla (.html + images/), su .docx y su PDF
  diagramas/<TIPO>/        sus 4 dibujos en blanco (FRONTAL, TRASERA, IZQUIERDA, DERECHA)
y sube casos.json a «PRUEBA PDF HTML/inspeccion-vehicular».
"""
import base64
import json
import re
import sys
import zipfile

import comun

DOC = 'inspeccion-vehicular'
HOJA = 'INSPECCION VEHICULAR'
PDF = 'FORMATO INSPECCION VEHICULAR'
IMAGENES = ['INS FRONTAL', 'INS TRASERA', 'INS IZQUIERDA', 'INS DERECHA', 'FIRMA RESPONSABLE', 'FIRMA INSPECTOR']


def leer(sh, hoja):
    v = sh.values().get(spreadsheetId=comun.LIBRO_VEHICULOS, range=f"'{hoja}'!A1:ZZ").execute()['values']
    enc = [x.strip() for x in v[0]]
    return [dict(zip(enc, r + [''] * (len(enc) - len(r)))) for r in v[1:]]


def clave(f):
    m = re.match(r'(\d+)/(\d+)/(\d{4})(?: (\d+):(\d+))?', f.get('FECHA', ''))
    return tuple(int(x or 0) for x in (m.group(3), m.group(2), m.group(1), m.group(4), m.group(5))) if m else (0,)


MODELOS = '1ddRghL8izS63UYWDHn9w_YFHPuRC8bTm'   # MODELOS INSPECCION de prod (Entornos.gs, DRIVE_FOLDER_ID_MODELOS)


def id_de(dr, valor):
    m = re.search(r'/d/([\w-]{20,})', valor or '') or re.search(r'[?&]id=([\w-]{20,})', valor or '')
    if m:
        return m.group(1)
    if '/' in (valor or ''):   # una ruta («MODELOS INSPECCION/AUTOS/FRONTAL.png»): desde la carpeta del libro de prod
        return por_ruta(dr, valor)
    nombre = (valor or '').replace('\\', '/').split('/')[-1].replace("'", "\\'")
    if not nombre:
        return None
    r = dr.files().list(q=f"name='{nombre}' and trashed=false", fields='files(id)', supportsAllDrives=True,
                        includeItemsFromAllDrives=True).execute()['files']
    return r[0]['id'] if r else None


def por_ruta(dr, ruta):
    """El archivo de una ruta «MODELOS INSPECCION/<TIPO>/<VISTA>.png», desde esa carpeta de prod (como
    DriveUtils.archivoDeRutaProfunda); por nombre suelto saldría el de otro tipo: todos se llaman FRONTAL.png"""
    partes = ruta.replace('\\', '/').strip('/').split('/')
    if partes[0].upper() != 'MODELOS INSPECCION':
        return None
    actual = MODELOS
    for parte in partes[1:]:
        nombre = parte.replace("'", "\\'")
        r = dr.files().list(q=f"name='{nombre}' and '{actual}' in parents and trashed=false", fields='files(id)',
                            supportsAllDrives=True, includeItemsFromAllDrives=True).execute()['files']
        if not r:
            return None
        actual = r[0]['id']
    return actual


def b64(dr, fid):
    import io
    from googleapiclient.http import MediaIoBaseDownload
    meta = dr.files().get(fileId=fid, fields='mimeType', supportsAllDrives=True).execute()
    b = io.BytesIO()
    d = MediaIoBaseDownload(b, dr.files().get_media(fileId=fid, supportsAllDrives=True))
    fin = False
    while not fin:
        _, fin = d.next_chunk()
    return {'mimeType': meta['mimeType'], 'base64': base64.b64encode(b.getvalue()).decode()}


def subir_con_blancos(dr, dir_):
    """casos.json a la carpeta de prueba con el dibujo en blanco de su tipo en cada vista sin rayar (como hace
    InspeccionesService con la ruta MODELOS INSPECCION/<TIPO>/<VISTA>.png): así el DEV arma lo mismo que la app"""
    casos = json.load(open(dir_ / 'casos.json', encoding='utf-8'))
    for c in casos['casos']:
        for vista in ('FRONTAL', 'TRASERA', 'IZQUIERDA', 'DERECHA'):
            col = 'INS ' + vista
            blanco = dir_ / 'diagramas' / c['tipo'] / f'{vista}.png'
            if (col not in c['firmas'] or c['datos'].get(col, '').upper().startswith('MODELOS INSPECCION/')) \
                    and blanco.exists():
                c['firmas'][col] = {'mimeType': 'image/png', 'base64': base64.b64encode(blanco.read_bytes()).decode()}
    json.dump(casos, open(dir_ / 'casos.json', 'w', encoding='utf-8'), ensure_ascii=False)
    destino = comun.carpeta_prueba(dr, DOC)
    comun.subir(dr, destino, dir_ / 'casos.json', mime='application/json')
    (dir_ / 'carpeta.txt').write_text(destino)
    print('casos.json (con los dibujos en blanco) en Drive:', destino)


def diagramas(dr, dir_, tipo, t):
    d = dir_ / 'diagramas' / tipo
    d.mkdir(parents=True, exist_ok=True)
    for vista in ('FRONTAL', 'TRASERA', 'IZQUIERDA', 'DERECHA'):
        iid = id_de(dr, t.get(vista, ''))
        if iid:
            (d / f'{vista}.png').write_bytes(base64.b64decode(b64(dr, iid)['base64']))
        else:
            print('  ', tipo, vista, 'sin dibujo:', t.get(vista))


def main():
    import pymupdf
    comun.salida_utf8()
    if sys.argv[1:] == ['diagramas']:   # solo los dibujos en blanco de cada tipo (tipos.json ya bajado)
        dir_ = comun.carpeta(DOC)
        _, dr = comun.servicios()
        for tipo, t in json.load(open(dir_ / 'tipos.json', encoding='utf-8')).items():
            diagramas(dr, dir_, tipo, t)
            print('diagramas:', tipo)
        subir_con_blancos(dr, dir_)
        return
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 2
    dir_ = comun.carpeta(DOC)
    sh, dr = comun.servicios()
    tipos = {t['TIPO'].strip(): t for t in leer(sh, 'MODELOS INSPECCION') if t.get('TIPO', '').strip()}
    json.dump(tipos, open(dir_ / 'tipos.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    filas = leer(sh, HOJA)
    for viejo in dir_.glob('r[0-9][0-9].pdf'):
        viejo.unlink()

    casos, i = [], 0
    for tipo in sorted(tipos):
        con = sorted([f for f in filas if f.get('TIPO', '').strip() == tipo and f.get(PDF)], key=clave)[-n:]
        for f in con:
            fid = id_de(dr, f[PDF])
            if not fid:
                print(tipo, 'sin PDF en Drive:', f[PDF])
                continue
            i += 1
            nombre = f'r{i:02d}'
            comun.bajar(dr, fid, dir_ / f'{nombre}.pdf')
            pdf = pymupdf.open(dir_ / f'{nombre}.pdf')
            hecho = 'app' if 'Google Docs' in (pdf.metadata.get('producer') or '') else 'appsheet'
            imagenes = {}
            for col in IMAGENES:
                if f.get(col, '').upper().startswith('MODELOS INSPECCION/'):
                    continue   # sin rayar: el dibujo en blanco del tipo (diagramas/<TIPO>); por nombre saldría el de otro
                iid = id_de(dr, f.get(col, ''))
                if iid:
                    try:
                        imagenes[col] = b64(dr, iid)
                    except Exception as e:   # sin permiso o borrada: queda sin imagen
                        print('  ', nombre, col, 'no se pudo bajar:', e)
            casos.append({'nombre': nombre, 'tipo': tipo, 'hecho': hecho, 'paginas': pdf.page_count,
                          'datos': f, 'firmas': imagenes})
            print(nombre, tipo, f.get('FECHA'), hecho, pdf.page_count, 'hojas', sorted(imagenes))

    # Las plantillas y los diagramas en blanco de cada tipo
    for tipo, t in tipos.items():
        p = dir_ / 'plantillas' / tipo
        p.mkdir(parents=True, exist_ok=True)
        comun.bajar(dr, t['PLANTILLA'], p / 'plantilla.zip', 'application/zip')
        zipfile.ZipFile(p / 'plantilla.zip').extractall(p / 'html')
        comun.bajar(dr, t['PLANTILLA'], p / 'plantilla.pdf', 'application/pdf')
        comun.bajar(dr, t['PLANTILLA'], p / 'plantilla.docx',
                    'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
        zipfile.ZipFile(p / 'plantilla.docx').extractall(p / 'docx')
        diagramas(dr, dir_, tipo, t)
        print('plantilla y diagramas:', tipo)

    json.dump({'casos': casos}, open(dir_ / 'casos.json', 'w', encoding='utf-8'), ensure_ascii=False)
    destino = comun.carpeta_prueba(dr, DOC)
    comun.subir(dr, destino, dir_ / 'casos.json', mime='application/json')
    (dir_ / 'carpeta.txt').write_text(destino)
    print(len(casos), 'casos; casos.json en Drive:', destino)


if __name__ == '__main__':
    main()
