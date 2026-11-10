"""Las tipografías y el logo de un documento, listos para RECURSOS PDF (no van al repo: la tipografía es comercial).

    uv run --with fonttools --with google-api-python-client --with google-auth --with google-auth-oauthlib \
        python tools/pdf/html/recursos.py responsiva-vehicular ciudad-maderas

Toma las tipografías incrustadas en la plantilla (.cache/<documento>/docx/word/fonts, las deja bajar.py), las RECORTA a
los caracteres del español (así caben en la caché de Apps Script) y SIN kerning (el documento de Docs no lo aplica; con
él los renglones cortarían distinto), toma el logo (docx/word/media/image1.png) como logo-<nombre>.png y sube todo a
"PRUEBA PDF HTML/RECURSOS". De ahí lo copia a RECURSOS PDF de cada proyecto pdfRecursosInstalar(<id>) (editor) o, en
un DEV, ?revisar=pdfhtml&instalar=1 (tools/pdf/html/pedir.js instalar).
"""
import sys
from pathlib import Path

import comun

# Español y lo que suele escribirse en un formato: ASCII, Latin-1, comillas, guiones, viñetas, puntos suspensivos, €, ✓
CARACTERES = list(range(0x20, 0x7F)) + list(range(0xA0, 0x100)) + list(range(0x2010, 0x2028)) + [0x20AC, 0x2713, 0x2122]


def recortar(origen, destino):
    from fontTools import subset
    from fontTools.ttLib import TTFont
    f = TTFont(origen)
    op = subset.Options()
    op.layout_features = []          # sin kern ni ligaduras
    op.hinting = False
    op.notdef_outline = True
    op.name_IDs = ['*']
    s = subset.Subsetter(op)
    s.populate(unicodes=CARACTERES)
    s.subset(f)
    f.save(destino)


def main():
    comun.salida_utf8()
    documento, logo = sys.argv[1], sys.argv[2]
    dir_ = comun.carpeta(documento)
    fuentes = sorted((dir_ / 'docx' / 'word' / 'fonts').glob('*.ttf'))
    salida = comun.carpeta('recursos')
    listos = []
    for f in fuentes:
        destino = salida / f.name    # <Familia>-<regular|bold|italic|boldItalic>.ttf, como los nombra Docs
        recortar(f, destino)
        listos.append(destino)
        print(f'{f.name}: {f.stat().st_size // 1024} KB → {destino.stat().st_size // 1024} KB')
    imagen = dir_ / 'docx' / 'word' / 'media' / 'image1.png'
    if imagen.exists():
        destino = salida / f'logo-{logo}.png'
        destino.write_bytes(imagen.read_bytes())
        listos.append(destino)
    _, dr = comun.servicios()
    carpeta = comun.carpeta_prueba(dr, 'RECURSOS')
    for r in listos:
        comun.subir(dr, carpeta, r, mime='font/ttf' if r.suffix == '.ttf' else 'image/png')
    (comun.CACHE / 'recursos' / 'carpeta.txt').write_text(carpeta)
    print('subidos a PRUEBA PDF HTML/RECURSOS:', carpeta)


if __name__ == '__main__':
    main()
