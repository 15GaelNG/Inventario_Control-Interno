"""La geometría de un PDF real: cada texto (caja, letra, tamaño, color), imagen, rectángulo y línea. Es la base para
escribir src/html/pdf/<documento>.html con las medidas exactas.

    uv run --with pymupdf python tools/pdf/html/geometria.py responsiva-vehicular r06 [--png]

Escribe tools/pdf/.cache/<documento>/<caso>_geometria.txt (y con --png, cada hoja como imagen para verla). En la caja de
un texto, «arriba» es el borde superior de la letra según la tipografía: en la plantilla, un renglón suelto con
line-height 1.43 queda en ese mismo `top`.
"""
import sys

import comun


def main():
    import pymupdf
    comun.salida_utf8()
    documento, caso = sys.argv[1], sys.argv[2]
    dir_ = comun.carpeta(documento)
    d = pymupdf.open(dir_ / f'{caso}.pdf')
    r = lambda b: [round(x, 1) for x in b]
    lineas = []
    for n, p in enumerate(d):
        lineas.append(f'==== hoja {n + 1}  ({p.rect.width:.0f} × {p.rect.height:.0f} pt)')
        for b in p.get_text('dict')['blocks']:
            if b['type'] == 1:
                lineas.append(f'IMG {r(b["bbox"])}')
                continue
            for l in b['lines']:
                for s in l['spans']:
                    if s['text'].strip():
                        lineas.append(f'T {r(s["bbox"])} {s["font"]} {s["size"]:.2f} #{s["color"]:06x} {s["text"]!r}')
        for dib in p.get_drawings():
            color = lambda c: '#%02x%02x%02x' % tuple(int(x * 255) for x in c)
            if dib.get('fill') is not None:
                lineas.append(f'R {r(dib["rect"])} relleno {color(dib["fill"])}')
            elif dib.get('color') is not None:
                lineas.append(f'L {r(dib["rect"])} grosor {dib.get("width")} {color(dib["color"])}')
        if '--png' in sys.argv:
            p.get_pixmap(dpi=80).save(dir_ / f'{caso}_hoja{n + 1}.png')
    (dir_ / f'{caso}_geometria.txt').write_text('\n'.join(lineas), encoding='utf-8')
    print(f'{len(lineas)} renglones en {dir_ / (caso + "_geometria.txt")}')


if __name__ == '__main__':
    main()
