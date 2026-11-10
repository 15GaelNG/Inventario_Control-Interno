"""Una plantilla HTML a partir de la exportación HTML de su Google Doc (para los documentos hechos de tablas).

    uv run --with google-api-python-client --with google-auth --with google-auth-oauthlib \
        python tools/pdf/html/desde-docs.py arqueo

AppSheet generaba estos documentos justo así: la plantilla exportada a HTML e impresa con Chromium. Aquí se exporta
la plantilla (.cache/<documento>/html/), se limpia y se escribe src/html/pdf/<documento>.html:
  - se quita el @import de fuentes (una URL: el convertidor no la carga y en un .html del repo un `//` rompe la app);
  - "Century Gothic" pasa a ser la familia incrustada (CenturyGothic, de RECURSOS PDF);
  - cada <<…>> de AppSheet pasa a un marcador de PdfHtml según las REGLAS del documento (abajo);
  - la imagen del logo pasa a {{LOGO:<nombre>}};
  - se agrega lo que exige el convertidor (geometricPrecision, la hoja) y los saltos de hoja del documento.
Después: npm run push, pedir.js y comparar.py, y ajustar a mano lo que haga falta (el archivo ya es del repo).
"""
import html as html_mod
import re
import sys
import zipfile

import comun


def regla_arqueo(m):
    """<<…>> de la plantilla del arqueo → marcador de PdfHtml (los valores los arma ArqueosService.datosHtml_)"""
    x = re.fullmatch(r'\[([^\]]+)\] \* [\d.]+', m)            # <<[M 0,50] * 0.50>>: el subtotal de la denominación
    if x:
        return '{{SUBTOTAL ' + x.group(1) + '}}'
    x = re.fullmatch(r'UPPER\(\[([^\]]+)\]\)', m)              # <<UPPER([X])>>: ya en mayúsculas
    if x:
        return '{{' + x.group(1) + '}}'
    x = re.fullmatch(r'\[(FIRMA [A-Z]+)\]', m)                 # firmas: 100 pt de ancho, como en la app
    if x:
        return '{{IMG:' + x.group(1) + ':100x100}}{{' + x.group(1) + ' TEXTO}}'
    x = re.fullmatch(r'\[([^\]]+)\]', m)
    if x:
        return '{{' + x.group(1) + '}}'
    raise SystemExit('Marcador que no sé traducir: <<' + m + '>>')


def regla_responsiva_celular(m):
    """<<…>> de la responsiva de celular → marcador de PdfHtml (los valores los arma LineasCaptura.datosHtml_). Las
    imágenes, como las metía LineasPdf: a su tamaño natural y solo se achican (:tope), el patrón a 56 px y centrado, las
    firmas a 160 × 70 px (90 × 40 la del principal si hay responsables adicionales: los demás firman el impreso)"""
    if m == 'RIGHT("000" & [NUCO], 4)':
        return '{{NUCO4}}'
    if m == 'FIRMA RESPONSABLE':
        return ('{{#SI ADICIONALES}}{{IMG:FIRMA RESPONSABLE:67.5x30:tope:linea}}{{/SI}}'
                '{{#VACIO ADICIONALES}}{{IMG:FIRMA RESPONSABLE:120x52.5:tope:linea}}{{/VACIO}}')
    if m == 'FIRMA CI':
        return '{{IMG:FIRMA CI:120x52.5:tope:linea}}'
    if m == '[CONTRASEÑA]':
        return '<span style="display:block;text-align:center">{{IMG:CONTRASEÑA:42x42:tope}}</span>'
    x = re.fullmatch(r'\[?([^\[\]"()&]+?)\]?', m)
    if x:
        return '{{' + x.group(1) + '}}'
    raise SystemExit('Marcador que no sé traducir: <<' + m + '>>')


DOCUMENTOS = {
    'arqueo': {
        'regla': regla_arqueo, 'logo': 'arqueo', 'hoja': 'size: 595.3pt 841.9pt',
        # Cada hoja empieza donde la deja la plantilla; en AppSheet el título del desglose se quedaba solo al pie de la
        # hoja 2 (error obvio): aquí va con su contenido
        # (texto, cuánto baja en la hoja nueva, en pt)
        'saltos': [('MONTO DISPONIBLE EFECTIVO', 45.8), ('DESGLOSE - AUDITORIA CONTROL INTERNO', 16)],
        # AppSheet encogía a 498 pt (el área de la hoja, desde x = 48.8) la tabla que envuelve el documento y cada tabla
        # que ya no le cabía, sin achicar la letra (por eso ahí un puesto largo parte en dos renglones); las que cabían
        # se quedaban de su tamaño
        'area': 498.0, 'cuerpo': 'padding:16.5pt 48.5pt 0 48.8pt',
        # El Chromium de AppSheet redondeaba el avance de cada letra: a 8 pt (los datos) le salía 0.11 pt más ancha por
        # letra (comparar.py, mediana de 213 renglones); sin esto un nombre o las observaciones parten distinto
        'espaciado': {8: 0.11},
    },
    'responsiva-celular': {
        'regla': regla_responsiva_celular, 'logo': 'ciudad-maderas-celular', 'hoja': 'size: 612pt 792pt',
        # Como la imprimía AppSheet (y la imita LineasPdf.COMO_APPSHEET): todo interlineado se mide sobre la letra del
        # texto y un párrafo vacío mide 11 pt; la hoja 2 empieza en las sanciones
        'interlineado': 'letra', 'vacio': 11,
        'saltos': [('SANCIONES POR MAL MANEJO', 11.5)],
        # Si la hoja 1 no alcanza, LineasPdf quita el salto: aquí su clase es un marcador ({{SALTO}} = 'salto' o '')
        'salto_marcador': 'SALTO',
        # Con varios responsables, sus nombres bajo la firma van a 8 pt (LineasPdf.NOMBRES_BAJO_FIRMA)
        'chica': ('{{RESPONSABLE}}', 'ADICIONALES', 8),
        # Las columnas de cada tabla, las de Docs (la cuadrícula del .docx): la exportación no las trae y el convertidor
        # repartía las celdas combinadas a su modo (la columna derecha caía 44 pt a la izquierda)
        'columnas_docx': True,
        # Las celdas de las sanciones no traen relleno en la exportación: Docs las pinta sin relleno a los lados y 1.3 pt más altas
        'css': 'td { padding: 0.65pt 0; }',
        # El código del pie trae 8 espacios duros antes y ya no cabe en su celda: Docs lo deja salir sin partirlo
        'sin_cortar': ['F-CI04-039'],
        # El texto ocupa 591 pt desde x = 14.2 (como en los PDF reales; la exportación dice 583.7) y empieza 12 pt más abajo
        'cuerpo': 'padding:26pt 0 0 14.2pt;width:591pt',
    },
}


def tablas(s):
    """(profundidad, inicio, fin) de cada <table>, de afuera hacia adentro"""
    pila, res = [], []
    for m in re.finditer(r'<table\b|</table>', s):
        if m.group(0) == '<table':
            pila.append(m.start())
        else:
            res.append((len(pila) - 1, pila.pop(), m.end()))
    return sorted(res, key=lambda r: r[1])


def relleno(td):
    """El relleno izquierdo + derecho de una celda (Docs exporta negativos en las de acomodo: CSS los ignora)"""
    p = re.search(r'padding:([-\d.]+)pt ([-\d.]+)pt ([-\d.]+)pt ([-\d.]+)pt', td)
    return max(float(p.group(2)), 0) + max(float(p.group(4)), 0) if p else 0.0


def ancho_tabla(t):
    """Lo que ocupa una tabla: sus celdas de la primera fila (sin las de tablas anidadas), con su relleno (el width de
    CSS no lo cuenta), y su sangría"""
    d, w = 0, 0.0
    for m in re.finditer(r'<table\b|</table>|<td[^>]*>|</tr>', t[t.find('<tr'):]):
        g = m.group(0)
        if g == '<table':
            d += 1
        elif g == '</table>':
            d -= 1
        elif d == 0 and g == '</tr>':
            break
        elif d == 0:
            x = re.search(r'(?<![-\w])width:([\d.]+)pt', g)
            w += (float(x.group(1)) if x else 0) + relleno(g)
    ml = re.match(r'<table style="[^"]*margin-left:([\d.]+)pt', t)
    return w + (float(ml.group(1)) if ml else 0)


def encoger(s, area):
    """La tabla que envuelve todo y las de su primer nivel que pasan de `area` se encogen a `area`: cada celda en
    proporción con todo y su relleno (así lo hacía AppSheet), con sus tablas anidadas y sangrías; las que caben no se
    tocan"""
    def celda(td, k):
        r = relleno(td)
        return re.sub(r'((?<![-\w])width:)([\d.]+)pt', lambda x: '%s%.2fpt' % (x.group(1), (float(x.group(2)) + r) * k - r), td)

    def escalar(t, k):
        t = re.sub(r'<td[^>]*>', lambda x: celda(x.group(0), k), t)
        return re.sub(r'(margin-left:)([\d.]+)pt', lambda x: '%s%.2fpt' % (x.group(1), float(x.group(2)) * k), t)
    todas = tablas(s)
    envoltura = [r for r in todas if r[0] == 0]
    nivel = 1 if len(envoltura) == 1 else 0
    cambios = [(a, b) for d, a, b in todas if d == nivel and ancho_tabla(s[a:b]) > area + 0.5]
    for a, b in reversed(cambios):
        s = s[:a] + escalar(s[a:b], area / ancho_tabla(s[a:b])) + s[b:]
    if nivel == 1:
        d, a, b = envoltura[0]
        celda = re.search(r'<td[^>]*?(?<![-\w])width:([\d.]+)pt', s[a:b])
        if celda and float(celda.group(1)) > area:
            i = a + celda.start(1)
            s = s[:i] + '%g' % area + s[i + len(celda.group(1)):]
    return s


def columnas_docx(s, dir_):
    """Cada tabla de primer nivel con las columnas de su cuadrícula en el .docx (w:tblGrid, en vigésimos de punto), en
    el mismo orden; con table-layout fijo el convertidor ya no las reparte"""
    xml = (dir_ / 'docx' / 'word' / 'document.xml').read_text(encoding='utf-8')
    xml = re.sub(r'<w:tblGridChange[ >].*?</w:tblGridChange>', '', xml, flags=re.S)   # la cuadrícula de antes del cambio
    rejillas = [[int(w) / 20 for w in re.findall(r'<w:gridCol w:w="(\d+)"', g)]
                for g in re.findall(r'<w:tblGrid>(.*?)</w:tblGrid>', xml, flags=re.S)]
    primeras = [(a, b) for d, a, b in tablas(s) if d == 0]
    if len(primeras) != len(rejillas):
        raise SystemExit(f'{len(primeras)} tablas en el HTML y {len(rejillas)} en el .docx: no sé emparejarlas')
    for (a, b), cols in reversed(list(zip(primeras, rejillas))):
        t = s[a:b]
        abre = re.match(r'<table[^>]*>', t).group(0)
        nueva = abre.replace('style="', 'style="table-layout:fixed;width:%.2fpt;' % sum(cols), 1)
        grupo = '<colgroup>' + ''.join('<col style="width:%.2fpt">' % c for c in cols) + '</colgroup>'
        s = s[:a] + nueva + grupo + t[len(abre):] + s[b:]
    return s


def main():
    comun.salida_utf8()
    documento = sys.argv[1]
    cfg = DOCUMENTOS[documento]
    dir_ = comun.carpeta(documento)
    if not (dir_ / 'html').exists():
        _, dr = comun.servicios()
        comun.bajar(dr, comun.DOCUMENTOS[documento]['plantilla'], dir_ / 'plantilla_html.zip', 'application/zip')
        zipfile.ZipFile(dir_ / 'plantilla_html.zip').extractall(dir_ / 'html')
    s = next((dir_ / 'html').glob('*.html')).read_text(encoding='utf-8')

    s = re.sub(r'<style type="text/css">\s*@import url\([^)]*\);\s*</style>', '', s)
    s = s.replace('&quot;Century Gothic&quot;', '&quot;CenturyGothic&quot;')
    s = re.sub(r'&lt;&lt;(.*?)&gt;&gt;', lambda x: cfg['regla'](html_mod.unescape(x.group(1))), s)
    s = re.sub(r'<img [^>]*src="images/image1\.png"([^>]*)>', lambda x: '<img src="{{LOGO:' + cfg['logo'] + '}}"' + x.group(1) + '>', s)
    # El transform de cada imagen (rotate 0 + translateZ) la subía a su propia capa, encima del texto: el logo tapaba
    # «NU» de «NUCO» (en Docs el texto va encima)
    s = re.sub(r' ?(?:-webkit-)?transform: rotate\([^)]*\) translateZ\([^)]*\);', '', s)
    if cfg.get('columnas_docx'):
        s = columnas_docx(s, dir_)
    if cfg.get('area'):
        s = encoger(s, cfg['area'])
    if cfg.get('chica'):
        solo, campo, letra = cfg['chica']
        def chica(x):
            if re.sub(r'<[^>]+>', '', x.group(0)).strip() != solo:
                return x.group(0)
            copia = re.sub(r'font-size:[\d.]+pt', 'font-size:%gpt' % letra, x.group(0))
            return '{{#SI %s}}%s{{/SI}}{{#VACIO %s}}%s{{/VACIO}}' % (campo, copia, campo, x.group(0))
        s = re.sub(r'<p [^>]*>.*?</p>', chica, s, flags=re.S)
    # Docs exporta cada párrafo a 11 pt (Arial) aunque su texto vaya a 9 u 8 pt: ese "puntal" invisible le da al
    # convertidor renglones de 11.3 pt; en AppSheet el renglón mide lo de su letra. El párrafo toma el tamaño de su texto.
    def parrafo(x):
        tams = [float(t) for t in re.findall(r'<span[^>]*font-size:([\d.]+)pt', x.group(0))]
        if not tams:
            return x.group(0)
        original = float(re.search(r'font-size:([\d.]+)pt', x.group(0)).group(1))
        t = re.sub(r'font-size:[\d.]+pt', 'font-size:%gpt' % max(tams), x.group(0), count=1)
        # Un interlineado de 1.0 mide lo de su letra; uno mayor (1.15, 1.5) sí se mide sobre los 11 pt del párrafo
        base = lambda m: original if float(m.group(1)) > 1 and cfg.get('interlineado') != 'letra' else max(tams)
        if cfg.get('vacio') and not re.sub(r'<[^>]+>|&nbsp;|\s', '', x.group(0)):
            return re.sub(r'line-height:([\d.]+)(?=[;"])', 'line-height:%gpt' % cfg['vacio'], t, count=1)
        return re.sub(r'line-height:([\d.]+)(?=[;"])', lambda m: 'line-height:%.2fpt' % (float(m.group(1)) * base(m)), t, count=1)
    s = re.sub(r'<p [^>]*>.*?</p>', parrafo, s, flags=re.S)
    for tam, extra in cfg.get('espaciado', {}).items():
        s = re.sub(r'(<span style="[^"]*font-size:%gpt[^"]*)"' % tam, lambda x: x.group(1) + ';letter-spacing:%gpt"' % extra, s)
    for texto in cfg.get('sin_cortar', []):
        i = s.find(texto)
        p = s.rfind('<p ', 0, i)
        s = s[:p] + s[p:].replace('style="', 'style="white-space:nowrap;', 1)
    if cfg.get('cuerpo'):
        s = re.sub(r'(<body class="doc-content" style=")[^"]*"', lambda x: x.group(1) + 'background-color:#ffffff;' + cfg['cuerpo'] + '"', s)
    for texto, baja in cfg['saltos']:
        i = s.find(texto)
        if i < 0:
            raise SystemExit('No encontré el salto: ' + texto)
        p = s.rfind('<p ', 0, i)
        # Los párrafos vacíos justo antes del salto solo empujarían una hoja en blanco
        antes = re.sub(r'(?:<p [^>]*>(?:<span[^>]*>(?:&nbsp;)?</span>)*</p>)+$', '', s[:p])
        s, p = antes + s[p:], len(antes)
        clase = '{{%s}}' % cfg['salto_marcador'] if cfg.get('salto_marcador') else 'salto'
        s = s[:p] + '<p class="' + clase + '" ' + s[p + 3:].replace('padding:0;', 'padding:%gpt 0 0 0;' % baja, 1)
    cabeza = ('<!DOCTYPE html>\n<html lang="es">\n<head>\n<meta charset="utf-8">\n'
              '<!-- ' + documento + ': exportación HTML de su plantilla de Docs (tools/pdf/html/desde-docs.py, 10-nov-2026) -->\n'
              '<style>\n'
              '  @page { ' + cfg['hoja'] + '; margin: 0; }\n'
              '  html, body { margin: 0; }\n'
              '  body { color: #000; font-kerning: none; font-variant-ligatures: none; text-rendering: geometricPrecision;'
              ' -webkit-print-color-adjust: exact; print-color-adjust: exact; }\n'
              '  .salto { page-break-before: always; break-before: page; }\n'
              + ('  ' + cfg['css'] + '\n' if cfg.get('css') else '') +
              '</style>\n</head>\n')
    s = re.sub(r'^<html><head>.*?</head>', '', s, flags=re.S)
    # Los párrafos vacíos al final no se ven y, con la última hoja llena, empujaban una hoja en blanco
    s = re.sub(r'(?:<p [^>]*>(?:<span[^>]*>(?:&nbsp;)?</span>)*</p>)+(?=</body>)', '', s)
    s = cabeza + s.replace('</body></html>', '\n</body>\n</html>\n')
    for prohibido in ('//', '/*', '<?', '?>'):
        if prohibido in s:
            raise SystemExit(f'La plantilla quedó con "{prohibido}": en un .html del repo rompe la app (CLAUDE.md)')
    destino = comun.RAIZ / 'src' / 'html' / 'pdf' / f'{documento}.html'
    destino.write_text(s, encoding='utf-8', newline='\n')
    imagen = dir_ / 'html' / 'images' / 'image1.png'
    if imagen.exists():
        (comun.carpeta('recursos') / f'logo-{cfg["logo"]}.png').write_bytes(imagen.read_bytes())
    print(f'{destino} ({len(s) // 1024} KB); marcadores:', len(re.findall(r'\{\{', s)))


if __name__ == '__main__':
    main()
