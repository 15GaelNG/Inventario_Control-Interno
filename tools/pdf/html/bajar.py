"""Baja los registros más recientes de un documento (producción, solo lectura) para replicarlo en HTML.

    uv run --with google-api-python-client --with google-auth --with google-auth-oauthlib --with pymupdf \
        python tools/pdf/html/bajar.py responsiva-vehicular [10]

Deja en tools/pdf/.cache/<documento>/ (fuera de git):
  r01.pdf … r10.pdf     los PDF reales, del más viejo al más nuevo
  filas.json            sus renglones de la hoja
  plantilla.pdf/.docx   la plantilla de Docs (del .docx salen medidas, tipografía y logo: docx/word/...)
  casos.json            datos + firmas (sacadas de cada PDF) de cada caso
y sube casos.json a "PRUEBA PDF HTML/<documento>" en Drive, de donde lo lee ?revisar=pdfhtml (src/pruebas/PruebasPdfHtml.gs).
"""
import base64
import json
import re
import sys
import zipfile

import comun

MESES = 'Enero|Febrero|Marzo|Abril|Mayo|Junio|Julio|Agosto|Septiembre|Octubre|Noviembre|Diciembre'


def clave_fecha(f, col):
    m = re.match(r'(\d+)/(\d+)/(\d{4})', f.get(col, ''))
    return (m.group(3), m.group(2).zfill(2), m.group(1).zfill(2)) if m else ('0',)


def id_del_pdf(dr, valor):
    m = re.search(r'/d/([\w-]{20,})', valor)
    if m:
        return m.group(1)
    nombre = valor.replace('\\', '/').split('/')[-1].replace("'", "\\'")
    r = dr.files().list(q=f"name='{nombre}' and trashed=false", fields='files(id)', supportsAllDrives=True,
                        includeItemsFromAllDrives=True).execute()['files']
    return r[0]['id'] if r else None


def firmas_de(pdf, pagina, campos):
    """Las imágenes de la hoja de firmas, de izquierda a derecha, con su transparencia"""
    import pymupdf
    salida = {}
    imgs = sorted(pdf[pagina].get_image_info(xrefs=True), key=lambda x: x['bbox'][0])
    for campo, im in zip(campos, imgs):
        x = pdf.extract_image(im['xref'])
        if x.get('smask'):
            pix = pymupdf.Pixmap(pymupdf.Pixmap(pdf, im['xref']), pymupdf.Pixmap(pdf, x['smask']))
            salida[campo] = {'mimeType': 'image/png', 'base64': base64.b64encode(pix.tobytes('png')).decode()}
        else:
            salida[campo] = {'mimeType': 'image/' + x['ext'], 'base64': base64.b64encode(x['image']).decode()}
    return salida


def main():
    import pymupdf
    comun.salida_utf8()
    documento = sys.argv[1]
    n = int(sys.argv[2]) if len(sys.argv) > 2 else 10
    cfg = comun.DOCUMENTOS[documento]
    dir_ = comun.carpeta(documento)
    sh, dr = comun.servicios()
    v = sh.values().get(spreadsheetId=cfg['libro'], range=f"'{cfg['hoja']}'!A1:ZZ",
                        valueRenderOption='UNFORMATTED_VALUE' if cfg.get('crudo') else 'FORMATTED_VALUE',
                        dateTimeRenderOption='FORMATTED_STRING').execute()['values']
    enc = [x.strip() for x in v[0]]
    filas = [dict(zip(enc, [x if isinstance(x, (int, float)) else str(x) for x in r] + [''] * (len(enc) - len(r)))) for r in v[1:]]
    # El PDF: una liga de Drive (lo que guarda la app) o la ruta de AppSheet ("ARQUEOS/2026/ARQUEO….pdf"), que se busca
    # por el nombre del archivo
    tiene_pdf = lambda f: re.search(r'/d/([\w-]{20,})', f.get(cfg['pdf'], '')) or re.search(r'\.pdf$', f.get(cfg['pdf'], ''), re.I)
    con = sorted([f for f in filas if tiene_pdf(f)], key=lambda f: clave_fecha(f, cfg['fecha']))
    sel = con[-n:]
    print(f'{len(filas)} renglones, {len(con)} con PDF; se toman {len(sel)}')
    json.dump(sel, open(dir_ / 'filas.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=1)

    casos = []
    for i, f in enumerate(sel, 1):
        nombre = f'r{i:02d}'
        fid = id_del_pdf(dr, f[cfg['pdf']])
        if not fid:
            print(nombre, 'no se encontró el PDF', f[cfg['pdf']])
            continue
        comun.bajar(dr, fid, dir_ / f'{nombre}.pdf')
        pdf = pymupdf.open(dir_ / f'{nombre}.pdf')
        datos = dict(f)
        if cfg.get('fecha_en_pdf'):
            m = re.search(r'a\s+(\d+)\s+de\s+(' + MESES + r')\s+de\s+(\d{4})', pdf[0].get_text())
            if m:
                datos.update({'DIA': m.group(1), 'MES': m.group(2), 'AÑO': m.group(3)})
        casos.append({'nombre': nombre, 'datos': datos, 'firmas': firmas_de(pdf, cfg['pagina_firmas'], cfg['firmas'])})
        print(nombre, f[cfg['fecha']], 'páginas', pdf.page_count)

    comun.bajar(dr, cfg['plantilla'], dir_ / 'plantilla.pdf', 'application/pdf')
    comun.bajar(dr, cfg['plantilla'], dir_ / 'plantilla.docx',
                'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    zipfile.ZipFile(dir_ / 'plantilla.docx').extractall(dir_ / 'docx')
    json.dump({'casos': casos}, open(dir_ / 'casos.json', 'w', encoding='utf-8'), ensure_ascii=False)
    destino = comun.carpeta_prueba(dr, documento)
    comun.subir(dr, destino, dir_ / 'casos.json', mime='application/json')
    (dir_ / 'carpeta.txt').write_text(destino)
    print('casos.json en Drive:', destino)


if __name__ == '__main__':
    main()
