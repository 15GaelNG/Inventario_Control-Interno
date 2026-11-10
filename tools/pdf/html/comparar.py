"""Compara los PDF que armó el DEV en HTML ("HTML rNN.pdf") con los reales (rNN.pdf).

    uv run --with pymupdf --with pillow --with google-api-python-client --with google-auth --with google-auth-oauthlib \
        python tools/pdf/html/comparar.py responsiva-vehicular [--imagenes] [--anchos]

Por cada caso, renglón por renglón (mismas palabras en el mismo renglón) y cuánto se mueve el inicio, el fin y el alto.
Criterio de "igual" (docs/pdf-motor.md): 0 renglones distintos y 0.5 pt o menos de desfase. Ojo: un renglón justificado
con pocas palabras, pymupdf lo parte en pedazos y sale "distinto" sin serlo; esos se revisan con --imagenes.
  --imagenes   lado a lado (real | HTML) de cada hoja en .cache/<documento>/lado-a-lado/
  --local      los PDF que armó local.js (sin bajar nada del DEV)
  --todos      todos los renglones distintos (si no, los primeros 5)
  --anchos     de los PDF reales, el renglón más largo que aceptó cada párrafo y el más corto que rechazó (para calibrar
               el ancho de un párrafo justificado: el bueno está entre los dos)
"""
import sys

import comun


def bajar_generados(documento):
    _, dr = comun.servicios()
    dir_ = comun.carpeta(documento)
    carpeta = (dir_ / 'carpeta.txt').read_text().strip()
    fs = dr.files().list(q=f"'{carpeta}' in parents and trashed=false and name contains 'HTML '", fields='files(id,name)').execute()['files']
    for f in fs:
        comun.bajar(dr, f['id'], dir_ / f['name'].replace('HTML ', 'H'))
    return sorted(f['name'].replace('HTML ', '').replace('.pdf', '') for f in fs)


def renglones(ruta):
    import pymupdf
    out = []
    for n, p in enumerate(pymupdf.open(ruta)):
        ls = {}
        for w in p.get_text('words'):
            if w[4] == '​':
                continue
            ls.setdefault((n, w[5], w[6]), []).append(w)
        for ws in ls.values():
            ws.sort(key=lambda w: w[0])
            # un espacio duro (&nbsp; de la exportación de Docs) cuenta como espacio
            texto = ' '.join(w[4].replace('​', '').replace(' ', ' ') for w in ws)
            out.append((n, round(ws[0][1], 2), ws[0][0], ws[-1][2], ' '.join(texto.split())))
    return sorted(out)


def comparar(real, html):
    R, A = renglones(real), renglones(html)
    por_texto = {}
    for r in A:
        por_texto.setdefault((r[0], r[4]), []).append(r)
    distintos, dx, dy, dfin = [], 0, 0, 0
    for r in R:
        c = por_texto.get((r[0], r[4]))
        if not c:
            distintos.append(r)
            continue
        a = min(c, key=lambda a: abs(a[1] - r[1]) + abs(a[2] - r[2]))
        dx, dy, dfin = max(dx, abs(a[2] - r[2])), max(dy, abs(a[1] - r[1])), max(dfin, abs(a[3] - r[3]))
    return len(R), len(A), distintos, dx, dy, dfin


def lado_a_lado(documento, caso):
    import pymupdf
    from PIL import Image, ImageDraw
    dir_ = comun.carpeta(documento)
    (dir_ / 'lado-a-lado').mkdir(exist_ok=True)
    a, b = pymupdf.open(dir_ / f'{caso}.pdf'), pymupdf.open(dir_ / f'H{caso}.pdf')
    for pg in range(min(a.page_count, b.page_count)):
        ims = []
        for d in (a, b):
            p = d[pg].get_pixmap(dpi=100)
            ims.append(Image.frombytes('RGB', (p.width, p.height), p.samples))
        w, h = ims[0].size
        out = Image.new('RGB', (w * 2 + 30, h + 40), 'white')
        out.paste(ims[0], (0, 40))
        out.paste(ims[1].resize((w, h)), (w + 30, 40))
        dib = ImageDraw.Draw(out)
        dib.text((10, 12), 'ORIGINAL (Google Doc)', fill='black')
        dib.text((w + 40, 12), 'NUEVO (HTML en Apps Script)', fill='black')
        out.save(dir_ / 'lado-a-lado' / f'{caso}_p{pg + 1}.png')


def anchos(documento):
    """Por cada x de inicio de renglón (un párrafo o lista), el renglón más largo aceptado y el más corto rechazado"""
    import pymupdf
    dir_ = comun.carpeta(documento)
    res = {}
    for ruta in sorted(dir_.glob('r[0-9][0-9].pdf')):
        for n, p in enumerate(pymupdf.open(ruta)):
            ls = {}
            palabras = [w for w in p.get_text('words') if w[4] != '​']
            for w in palabras:
                ls.setdefault(round(w[1]), []).append(w)
            ys = sorted(ls)
            for k, y in enumerate(ys):
                l = sorted(ls[y], key=lambda w: w[0])
                x0 = round(l[0][0], 1)
                esp = 0.2768 * (l[0][3] - l[0][1]) / 1.43   # el espacio de Century Gothic según el alto del renglón
                nat = l[-1][2] - l[0][0] - sum(max(0, (b[0] - a[2]) - esp) for a, b in zip(l, l[1:]))
                r = res.setdefault((n + 1, x0), [0, 1e9])
                r[0] = max(r[0], nat)
                if k + 1 < len(ys):
                    sig = sorted(ls[ys[k + 1]], key=lambda w: w[0])
                    if sig and abs(sig[0][0] - l[0][0]) < 0.6 and ys[k + 1] - y < 20:
                        r[1] = min(r[1], nat + esp + (sig[0][2] - sig[0][0]))
    for (pag, x0), (ac, re_) in sorted(res.items()):
        if re_ < 1e9:
            print(f'hoja {pag}, renglones desde x={x0}: aceptado máx {ac:.2f} pt · rechazado mín {re_:.2f} pt')


def main():
    comun.salida_utf8()
    documento = sys.argv[1]
    if '--anchos' in sys.argv:
        anchos(documento)
        return
    dir_ = comun.carpeta(documento)
    if '--local' in sys.argv:   # los que armó tools/pdf/html/local.js en esta máquina (no se baja nada)
        casos = sorted(p.stem[1:] for p in dir_.glob('Hr[0-9][0-9].pdf'))
    else:
        casos = bajar_generados(documento)
    total = 0
    for caso in casos:
        if not (dir_ / f'{caso}.pdf').exists():
            continue
        nR, nA, dist, dx, dy, dfin = comparar(dir_ / f'{caso}.pdf', dir_ / f'H{caso}.pdf')
        total += len(dist)
        print(f'{caso}: renglones {nR}/{nA} · distintos {len(dist)} · desfase máx inicio {dx:.2f} fin {dfin:.2f} alto {dy:.2f} pt')
        for r in (dist if "--todos" in sys.argv else dist[:5]):
            print(f'    real hoja {r[0] + 1} y{r[1]:.1f}: {r[4][:100]}')
        if '--imagenes' in sys.argv:
            lado_a_lado(documento, caso)
    print('renglones distintos en total:', total)


if __name__ == '__main__':
    main()
