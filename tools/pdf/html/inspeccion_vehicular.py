"""La inspección vehicular en HTML: UNA plantilla para los 18 tipos y el catálogo de cada tipo (11-nov-2026).

Lo usa desde-docs.py (DOCUMENTOS['inspeccion-vehicular']) después de bajar las 18 plantillas con
bajar-inspecciones.py:

    uv run --with google-api-python-client --with google-auth --with google-auth-oauthlib --with pillow \
        python tools/pdf/html/desde-docs.py inspeccion-vehicular

Las 18 plantillas de Docs tienen el mismo esqueleto (verificado al generar: si uno cambia, truena):
  encabezado · bloque 1 (izq.: Documentación, Cristalería, Neumáticos, Interiores · der.: Latonería, Inventarios,
  Cerraduras, Limpieza, ícono) · bloque 2 (izq.: Sistemas interiores, Sistema mecánico, Niveles · der.: lo que sigue de
  esas dos, Batería y Voltaje) · Vector (4 diagramas) · Observaciones · firmas.
Lo que cambia por tipo va al catálogo (src/config/InspeccionFormatos.gs): las piezas de cada sección (lo que dice el
formato y su columna), las llantas, el semáforo (vertical en Neumáticos con 4 o más llantas; horizontal bajo Inventarios
en motos y motocarros), el orden de los diagramas, el ícono (con su recorte) y la barra de voltaje.
La plantilla (src/html/pdf/inspeccion-vehicular.html) es la de L200 con cada sección como molde ({{#CADA SECCION}}) y
las piezas de moto de la Honda 150XR dentro de {{#SI SEMAFORO VERTICAL}} / {{#VACIO SEMAFORO VERTICAL}}.
"""
import hashlib
import html as html_mod
import io
import json
import re

import comun

DIR = comun.CACHE / 'inspeccion-vehicular'
BASE, MOTO = 'L200', 'HONDA 150XR'
# Las secciones en el orden en que salen, por bloque y columna: la n-ésima tabla con casillas de esa celda es esa sección
SECCIONES = {
    (1, 0): ['DOCUMENTACION', 'CRISTALERIA', 'NEUMATICOS', 'INTERIORES'],
    (1, 1): ['LATONERIA', 'INVENTARIOS', 'CERRADURAS', 'LIMPIEZA'],
    (2, 0): ['SISTEMAS INTERIORES', 'SISTEMA MECANICO', 'NIVELES'],
    (2, 1): ['SISTEMAS INTERIORES 2', 'SISTEMA MECANICO 2', 'BATERIA'],
}
COLORES = {'#ff0000': 'ROJO', '#fcd618': 'AMARILLO', '#38761d': 'VERDE'}


# ---------------------------------------------------------------- <<…>> de Docs → marcadores de PdfHtml
def regla(m):
    # Un marcador partido en varios tramos («<<PUNTAJE FINAL </span><span…>INSPECCION…>>»): al cambiarlo por uno solo, los
    # tramos de en medio se van y queda uno bien cerrado
    m = re.sub(r'<[^>]+>', '', m).strip()
    if re.match(r'(If:|EndIf)', m, re.I):   # los bloques de color de llantas y voltaje: el color lo pone el molde
        return ''
    x = re.fullmatch(r'IF\(\[([^\]]+)\]\s*=\s*"([^"]+)"\s*,\s*"✓"\s*,\s*""\)', m)
    if x:
        return '{{ES:%s:%s}}' % (x.group(1), x.group(2))
    x = re.fullmatch(r'\[(INS [A-Z]+)\]', m)
    if x:
        return '{{DIAGRAMA:%s}}' % x.group(1)   # su lugar y ancho los pone el molde
    x = re.fullmatch(r'\[(FIRMA [A-Z]+)\]', m)
    if x:   # como PdfService (FIRMA_PDF): a su tamaño, en una caja de 150 × 60
        return '{{IMG:%s:150x60:tope}}' % x.group(1)
    x = re.fullmatch(r'\[?([^\[\]"()&<>=]+?)\]?', m)
    if x:
        return '{{' + x.group(1).strip() + '}}'
    raise SystemExit('Marcador que no sé traducir: <<' + m + '>>')


def exportacion(tipo):
    p = next((DIR / 'plantillas' / tipo / 'html').glob('*.html'))
    return p.read_text(encoding='utf-8')


def convertida(tipo):
    """La exportación de un tipo con sus <<…>> ya como marcadores (igual que hace desde-docs con el esqueleto)"""
    s = exportacion(tipo).replace('&quot;Century Gothic&quot;', '&quot;CenturyGothic&quot;')
    return re.sub(r'&lt;&lt;(.*?)&gt;&gt;', lambda x: regla(html_mod.unescape(x.group(1))), s)


# ---------------------------------------------------------------- recorrer tablas
def cierre(s, a):
    """El fin de la tabla que abre en a"""
    d = 0
    for m in re.finditer(r'<table\b|</table>', s[a:]):
        d += 1 if m.group(0) == '<table' else -1
        if d == 0:
            return a + m.end()
    raise ValueError('tabla sin cerrar')


def tablas_nivel(s, a=0, b=None):
    """Las tablas de primer nivel dentro de s[a:b] → [(inicio, fin)]"""
    b = len(s) if b is None else b
    out, i = [], a
    while True:
        j = s.find('<table', i, b)
        if j < 0:
            return out
        k = cierre(s, j)
        out.append((j, k))
        i = k


def celdas_nivel(s, a, b):
    """Las celdas de la tabla s[a:b] (sin las de tablas anidadas) → [(inicio del contenido, fin del contenido)]"""
    out, d = [], 0
    for m in re.finditer(r'<table\b|</table>|<td\b[^>]*>|</td>', s[a:b]):
        g = m.group(0)
        if g.startswith('<table'):
            d += 1
        elif g == '</table>':
            d -= 1
        elif d == 1 and g.startswith('<td'):
            ini = a + m.end()
        elif d == 1 and g == '</td>':
            out.append((ini, a + m.start()))
    return out


def filas_vector(s):
    """Los renglones de los diagramas (los que tienen un {{DIAGRAMA:…}}) dentro de la tabla grande del bloque 2 →
    (inicio, fin) en s"""
    i = s.find('{{DIAGRAMA:')
    a, b = [(x, y) for x, y in tablas_nivel(s) if x < i < y][0]
    fs = [(a + x, a + y) for x, y in filas(s[a:b]) if '{{DIAGRAMA:' in s[a + x:a + y]]
    return fs[0][0], fs[-1][1]


def vector_anidado(renglones):
    """Los renglones del Vector en su propia tabla (cada acomodo tiene sus columnas), dentro de un renglón de la grande"""
    return ('<table style="border-spacing:0;border-collapse:collapse;margin-right:auto">' + renglones + '</table>')


def filas(t):
    """Las filas de una tabla sin anidadas → [(inicio, fin)] relativas a t"""
    return [(m.start(), m.end()) for m in re.finditer(r'<tr\b.*?</tr>', t, flags=re.S)]


def texto(t):
    return ' '.join(html_mod.unescape(re.sub(r'<[^>]+>', ' ', t)).split())


def secciones_de(s):
    """{clave: (inicio, fin)} de cada tabla de sección (las que traen casillas {{ES:…}}), por bloque y columna"""
    top = tablas_nivel(s, s.find('<body'))
    out = {}
    for bloque in (1, 2):
        a, b = top[bloque]
        for col, (ca, cb) in enumerate(celdas_nivel(s, a, b)):
            claves = SECCIONES.get((bloque, col))
            if not claves:
                continue
            con = [(x, y) for x, y in tablas_nivel(s, ca, cb) if '{{ES:' in s[x:y]]
            if len(con) != len(claves):
                raise SystemExit(f'bloque {bloque} columna {col}: {len(con)} secciones, esperaba {claves}')
            out.update(zip(claves, con))
    return out


# ---------------------------------------------------------------- el catálogo de un tipo
def piezas_de(t):
    """[[lo que dice el formato, columna]] de los renglones con casillas de una tabla de sección"""
    out = []
    for a, b in filas(t):
        r = t[a:b]
        m = re.search(r'\{\{ES:([^:{}]+):', r)
        if not m:
            continue
        primera = re.search(r'<td\b[^>]*>(.*?)</td>', r, re.S).group(1)
        out.append([texto(primera), m.group(1)])
    return out


def llantas_de(t):
    out = []
    for a, b in filas(t):
        r = t[a:b]
        m = re.search(r'\{\{(LLANTA [A-Z]+)\}\}', r)
        if m:
            tds = [x for x in re.findall(r'<td\b[^>]*>(.*?)</td>', r, re.S) if '<img' not in x]
            out.append([texto(tds[0]), m.group(1)])
    return out


def recorte(span):
    """El recorte que Docs le hace a una imagen: el span (caja) y la imagen (tamaño y corrimiento), en px"""
    n = lambda pat, t: float(re.search(pat, t).group(1))
    img = re.search(r'<img[^>]*>', span).group(0)
    return {'w': n(r'width: ([\d.]+)px', span), 'h': n(r'height: ([\d.]+)px', span),
            'iw': n(r'width: ([\d.]+)px', img), 'ih': n(r'height: ([\d.]+)px', img),
            'x': n(r'margin-left: (-?[\d.]+)px', img), 'y': n(r'margin-top: (-?[\d.]+)px', img)}


def imagen_png(tipo, src):
    """Los bytes PNG de una imagen de la exportación (Docs exporta algunas en JPG)"""
    from PIL import Image
    p = DIR / 'plantillas' / tipo / 'html' / 'images' / src
    b = p.read_bytes()
    if p.suffix.lower() == '.png':
        return b
    out = io.BytesIO()
    Image.open(io.BytesIO(b)).save(out, 'PNG')
    return out.getvalue()


# Imágenes del Doc que tienen una versión mejor en el repo: el logo de Flotillas CM Inspecciones del Doc es un JPG con
# fondo gris claro (247, 247, 247); el de assets/ (Marca CI/FT) es el mismo, transparente y a mayor resolución
# El alto máximo (pt) de cada lugar de diagrama, para que el bloque 2, el Vector y las firmas quepan en la hoja 2:
# 1–4 el Vector 2 × 2; 5–8 el de moto (frontal y trasera altas, de dos renglones; izquierda y derecha, uno cada una)
ALTO_DIAGRAMA = {1: 135, 2: 135, 3: 135, 4: 135, 5: 280, 6: 280, 7: 135, 8: 135}

MEJORES = {'inspeccion-d75ffa': comun.RAIZ / 'assets' / 'logo-ft-inspecciones-light.png'}


def guardar_logo(nombre, png):
    if nombre in MEJORES:   # a 1000 px de ancho: sobra para imprimirlo a 300 dpi (va a 180 pt) y no infla cada PDF
        from PIL import Image
        im = Image.open(MEJORES[nombre])
        im = im.resize((1000, round(im.height * 1000 / im.width)), Image.LANCZOS)
        b = io.BytesIO()
        im.save(b, 'PNG', optimize=True)
        png = b.getvalue()
    (comun.carpeta('recursos') / f'logo-{nombre}.png').write_bytes(png)


def catalogo_de(tipo):
    s = convertida(tipo)
    sec = secciones_de(s)
    c = {'secciones': {k: piezas_de(s[a:b]) for k, (a, b) in sec.items()}}
    a, b = sec['NEUMATICOS']
    c['llantas'] = llantas_de(s[a:b])
    c['semaforoVertical'] = '<img' in s[a:b]
    c['diagramas'] = re.findall(r'\{\{DIAGRAMA:(INS [A-Z]+)\}\}', s)
    va, vb = filas_vector(s)
    if ('rowspan="2"' in s[va:vb]) == c['semaforoVertical']:
        raise SystemExit(f'{tipo}: su Vector no es el que va con su semáforo')
    # El ícono: la imagen de la última tabla de la columna derecha del bloque 1
    top = tablas_nivel(s, s.find('<body'))
    ca, cb = celdas_nivel(s, *top[1])[1]
    ultima = s[slice(*tablas_nivel(s, ca, cb)[-1])]
    span = re.search(r'<span style="overflow: hidden[^"]*"><img[^>]*></span>', ultima).group(0)
    src = re.search(r'src="images/([^"]+)"', span).group(1)
    png = imagen_png(tipo, src)
    nombre = 'inspeccion-icono-' + hashlib.md5(png).hexdigest()[:6]
    guardar_logo(nombre, png)
    c['icono'] = dict(recorte(span), logo=nombre)
    # La barra de voltaje (Batería): la misma imagen, en dos tamaños según el formato
    a, b = sec['BATERIA']
    resto = s[b:]
    span = re.search(r'<span style="overflow: hidden[^"]*"><img[^>]*></span>', resto).group(0)
    c['bateria'] = recorte(span)
    return c


# ---------------------------------------------------------------- moldes
def molde_renglon(r):
    """Un renglón de piezas como molde: la etiqueta y las casillas salen de cada pieza ({{etiqueta}}, {{valor}})"""
    m = re.search(r'(<td\b[^>]*>)(.*?)(</td>)', r, re.S)
    primera = m.group(2)
    hecho = [False]

    def una(x):   # el primer tramo con texto es la etiqueta; los demás tramos con texto se vacían
        if not x.group(2).strip():
            return x.group(0)
        if hecho[0]:
            return x.group(1) + x.group(3)
        hecho[0] = True
        return x.group(1) + '{{etiqueta}}' + x.group(3)
    primera = re.sub(r'(<span[^>]*>)([^<]*)(</span>)', una, primera)
    r = r[:m.start(2)] + primera + r[m.end(2):]
    return re.sub(r'\{\{ES:[^:{}]+:([^{}]+)\}\}', r'{{ES:valor:\1}}', r)


def con_moldes(t, clave):
    """La tabla de una sección con sus renglones de piezas (seguidos) cambiados por {{#CADA clave}} molde {{/CADA}}"""
    fs = filas(t)
    con = [i for i, (a, b) in enumerate(fs) if '{{ES:' in t[a:b]]
    if con != list(range(con[0], con[-1] + 1)):
        raise SystemExit(f'{clave}: renglones de piezas no seguidos')
    a, b = fs[con[0]][0], fs[con[-1]][1]
    molde = molde_renglon(t[fs[con[0]][0]:fs[con[0]][1]])
    return t[:a] + '{{#CADA %s}}' % clave + molde + '{{/CADA}}' + t[b:]


def un_color(t, campo, color_marcador):
    """Los tres tramos de color de una llanta o del voltaje → uno solo, con el color como dato"""
    pat = r'<span style="([^"]*?)color:(#[0-9a-f]{6})([^"]*)">\s*\{\{%s\}\}\s*</span>' % re.escape(campo)
    tramos = list(re.finditer(pat, t))
    if len(tramos) != 3:
        raise SystemExit(f'{campo}: {len(tramos)} tramos de color, esperaba 3')
    primero = tramos[0]
    nuevo = '<span style="%scolor:{{%s}}%s">{{%s}}</span>' % (primero.group(1), color_marcador, primero.group(3), campo)
    return t[:primero.start()] + nuevo + t[tramos[-1].end():]


def neumaticos_vertical(t):
    """La tabla de Neumáticos con el semáforo vertical (4 o más llantas): la primera llanta comparte renglón con el
    semáforo (que baja {{FILAS SEMAFORO}} renglones); las demás, molde"""
    fs = filas(t)
    ll = [i for i, (a, b) in enumerate(fs) if re.search(r'\{\{LLANTA [A-Z]+\}\}', t[a:b])]
    primera = t[fs[ll[0]][0]:fs[ll[0]][1]]
    campo = re.search(r'\{\{(LLANTA [A-Z]+)\}\}', primera).group(1)
    primera = un_color(primera, campo, 'LLANTA1 COLOR').replace('{{%s}}' % campo, '{{LLANTA1 VALOR}}')
    primera = re.sub(r'rowspan="\d+"', 'rowspan="{{FILAS SEMAFORO}}"', primera, count=1)
    primera = molde_renglon_llanta(primera, '{{LLANTA1 ETIQUETA}}')
    segunda = t[fs[ll[1]][0]:fs[ll[1]][1]]
    c2 = re.search(r'\{\{(LLANTA [A-Z]+)\}\}', segunda).group(1)
    segunda = un_color(segunda, c2, 'color').replace('{{%s}}' % c2, '{{valor}}')
    segunda = molde_renglon_llanta(segunda)
    a, b = fs[ll[0]][0], fs[ll[-1]][1]
    t = t[:a] + primera + '{{#CADA LLANTAS RESTO}}' + segunda + '{{/CADA}}' + t[b:]
    return con_moldes(t, 'NEUMATICOS')


def molde_renglon_llanta(r, marcador='{{etiqueta}}'):
    """El renglón de una llanta: su etiqueta (la primera celda con texto, sin imagen ni marcadores) → marcador"""
    hecho = [False]

    def celda(x):
        cuerpo = x.group(2)
        if hecho[0] or '{{' in cuerpo or '<img' in cuerpo or not texto(cuerpo):
            return x.group(0)
        hecho[0] = True
        return x.group(1) + re.sub(r'(<span[^>]*>)([^<]+)(</span>)', lambda y: y.group(1) + marcador + y.group(3), cuerpo, count=1) + x.group(3)
    return re.sub(r'(<td\b[^>]*>)(.*?)(</td>)', celda, r, flags=re.S)


def neumaticos_moto(t):
    """La tabla de Neumáticos de moto y motocarro (sin semáforo): cada llanta, un renglón molde"""
    fs = filas(t)
    ll = [i for i, (a, b) in enumerate(fs) if re.search(r'\{\{LLANTA [A-Z]+\}\}', t[a:b])]
    r = t[fs[ll[0]][0]:fs[ll[0]][1]]
    campo = re.search(r'\{\{(LLANTA [A-Z]+)\}\}', r).group(1)
    r = molde_renglon_llanta(un_color(r, campo, 'color').replace('{{%s}}' % campo, '{{valor}}'))
    a, b = fs[ll[0]][0], fs[ll[-1]][1]
    t = t[:a] + '{{#CADA LLANTAS}}' + r + '{{/CADA}}' + t[b:]
    return con_moldes(t, 'NEUMATICOS')


def logos_fijos(s, tipo):
    """Las imágenes fijas del esqueleto (encabezado, semáforo, barra de voltaje) → {{LOGO:inspeccion-…}}"""
    def una(x):
        src = x.group(2)
        png = imagen_png(tipo, src)
        nombre = 'inspeccion-' + hashlib.md5(png).hexdigest()[:6]
        guardar_logo(nombre, png)
        return x.group(1) + 'src="{{LOGO:%s}}"' % nombre
    return re.sub(r'(<img [^>]*)src="images/([^"]+)"', una, s)


def despues_regla(s):
    """El esqueleto de L200 → la plantilla de los 18 tipos; de paso escribe el catálogo"""
    # 1. El catálogo (y los íconos) de los 18 tipos
    tipos = json.loads((DIR / 'tipos.json').read_text(encoding='utf-8'))
    cat = {t: catalogo_de(t) for t in sorted(tipos)}
    escribir_catalogo(cat)

    # 2. Las piezas de moto, de la Honda: su tabla de Neumáticos y el renglón del semáforo horizontal (Inventarios)
    m = convertida(MOTO)
    sm = secciones_de(m)
    neum_moto = neumaticos_moto(logos_fijos(m[slice(*sm['NEUMATICOS'])], MOTO))
    inv = logos_fijos(m[slice(*sm['INVENTARIOS'])], MOTO)
    fila_semaforo = [inv[a:b] for a, b in filas(inv) if '<img' in inv[a:b]][0]
    vector_moto = m[slice(*filas_vector(m))]

    # 3. El esqueleto: cada sección con su molde (de atrás hacia adelante, así no se mueven los índices)
    s = logos_fijos(s, BASE)
    sec = secciones_de(s)
    for clave, (a, b) in sorted(sec.items(), key=lambda kv: -kv[1][0]):
        t = s[a:b]
        if clave == 'NEUMATICOS':
            t = '{{#SI SEMAFORO VERTICAL}}' + neumaticos_vertical(t) + '{{/SI}}{{#VACIO SEMAFORO VERTICAL}}' + neum_moto + '{{/VACIO}}'
        else:
            t = con_moldes(t, clave)
            if clave == 'INVENTARIOS':
                t = t.replace('{{/CADA}}', '{{/CADA}}{{#VACIO SEMAFORO VERTICAL}}' + fila_semaforo + '{{/VACIO}}', 1)
        s = s[:a] + t + s[b:]

    # 3b. El Vector: 2 × 2 (autos y camionetas) o el de moto y motocarro (frontal y trasera altas lado a lado,
    # izquierda y derecha una sobre otra): van con el semáforo, verificado en catalogo_de
    va, vb = filas_vector(s)
    s = (s[:va] + '<tr><td colspan="6" style="padding:0">{{#SI SEMAFORO VERTICAL}}' + vector_anidado(s[va:vb]) +
         '{{/SI}}{{#VACIO SEMAFORO VERTICAL}}' + vector_anidado(vector_moto) + '{{/VACIO}}</td></tr>' + s[vb:])

    # 4. El voltaje: un tramo, con su color como dato
    i = s.find('{{VOLTAJE}}')
    a, b = s.rfind('<td', 0, i), s.find('</td>', i)
    s = s[:a] + un_color(s[a:b], 'VOLTAJE', 'VOLTAJE COLOR') + s[b:]

    # 5. El ícono y la barra de voltaje: su imagen y su recorte, del catálogo
    def recortada(prefijo, logo):
        return ('<span style="overflow:hidden;display:inline-block;width:{{%s W}}px;height:{{%s H}}px">'
                '<img alt="" src="{{LOGO:%s}}" style="width:{{%s IW}}px;height:{{%s IH}}px;margin-left:{{%s X}}px;'
                'margin-top:{{%s Y}}px"></span>' % (prefijo, prefijo, logo, prefijo, prefijo, prefijo, prefijo))
    top = tablas_nivel(s, s.find('<body'))
    ca, cb = celdas_nivel(s, *top[1])[1]
    ua, ub = tablas_nivel(s, ca, cb)[-1]
    t = re.sub(r'<span style="overflow: hidden[^"]*"><img[^>]*></span>', recortada('ICONO', '=ICONO LOGO'), s[ua:ub], count=1)
    s = s[:ua] + t + s[ub:]
    i = s.find('{{VOLTAJE COLOR}}')
    j = s.find('<span style="overflow: hidden', i)
    k = s.find('</span>', j) + len('</span>')
    logo = re.search(r'\{\{LOGO:([^}]+)\}\}', s[j:k]).group(1)
    s = s[:j] + recortada('BATERIA', logo) + s[k:]

    # 6. Los diagramas: el n-ésimo lugar del esqueleto (el tipo dice cuál vista va ahí), a lo más el ancho de su celda
    n = [0]

    def lugar(x):
        n[0] += 1
        return '{{DIAGRAMA LUGAR %d}}' % n[0]
    s = re.sub(r'\{\{DIAGRAMA:INS [A-Z]+\}\}', lugar, s)
    if n[0] != 8:
        raise SystemExit(f'{n[0]} lugares de diagrama, esperaba 8 (4 del Vector 2 × 2 y 4 del de moto)')
    for k in range(1, 9):   # el k-ésimo lugar de cada Vector lleva el k-ésimo diagrama del tipo
        i = s.find('{{DIAGRAMA LUGAR %d}}' % k)
        td = s[s.rfind('<td', 0, i):s.find('>', s.rfind('<td', 0, i)) + 1]
        w = float(re.search(r'(?<![-\w])width:([\d.]+)pt', td).group(1))
        p = re.search(r'padding:([-\d.]+)pt ([-\d.]+)pt ([-\d.]+)pt ([-\d.]+)pt', td)
        w -= (max(float(p.group(2)), 0) + max(float(p.group(4)), 0)) if p else 0
        s = s.replace('{{DIAGRAMA LUGAR %d}}' % k, '{{IMG:=DIAGRAMA %d:%.1fx%d:tope}}' % ((k - 1) % 4 + 1, w, ALTO_DIAGRAMA[k]))

    # 7. Siempre dos hojas, sin renglones sueltos (11-nov, lo pidió el usuario): la hoja 1 es el encabezado y el bloque 1;
    # la hoja 2, el bloque 2 entero (antes se partía donde cayera: «Intermitentes» solo en la hoja siguiente, o en la moto
    # el bloque 2 pegado bajo el ícono), el Vector, las observaciones y las firmas
    i = s.find('{{#CADA SISTEMAS INTERIORES}}')
    a = [x for x, y in tablas_nivel(s) if x < i < y][0]
    s = s[:a] + '<table style="break-before:page;page-break-before:always;' + s[a + len('<table style="'):]
    # El encabezado: los dos logos y la calificación centrados a la misma altura
    a, b = tablas_nivel(s, s.find('<body'))[0]
    fila = re.search(r'<tr\b.*?</tr>', s[a:b], re.S)
    s = s[:a + fila.start()] + fila.group(0).replace('vertical-align:top', 'vertical-align:middle') + s[a + fila.end():]
    return s


# ---------------------------------------------------------------- src/config/InspeccionFormatos.gs
def escribir_catalogo(cat):
    js = json.dumps(cat, ensure_ascii=False, indent=1)
    destino = comun.RAIZ / 'src' / 'config' / 'InspeccionFormatos.gs'
    destino.write_text(
        '/**\n'
        ' * InspeccionFormatos.gs — el formato de inspección vehicular de cada tipo de unidad (11-nov-2026).\n'
        ' *\n'
        ' * GENERADO por tools/pdf/html/desde-docs.py inspeccion-vehicular desde las 18 plantillas de Docs (hoja MODELOS\n'
        ' * INSPECCION): no se edita a mano. Lo usa InspeccionHtml.gs para llenar src/html/pdf/inspeccion-vehicular.html,\n'
        ' * la plantilla única. Por tipo:\n'
        ' *   secciones   { SECCION: [[lo que dice el formato, columna de la hoja]] } en el orden del formato; «… 2» es lo\n'
        ' *               que sigue de esa sección en la columna derecha\n'
        ' *   llantas     [[lo que dice el formato, columna]]   semaforoVertical  con 4 o más llantas (si no, horizontal)\n'
        ' *   diagramas   qué vista va en cada lugar del Vector (1 y 2 arriba, 3 y 4 abajo)\n'
        ' *   icono       la imagen del vehículo (logo-<logo>.png de RECURSOS PDF) y su recorte en px; bateria: el de la barra\n'
        ' */\n'
        'const InspeccionFormatos = (function () {\n'
        '  const TIPOS = ' + js.replace('\n', '\n  ') + ';\n\n'
        '  /** El formato de un tipo (sin distinguir mayúsculas ni espacios de más), o null */\n'
        '  function de(tipo) {\n'
        "    const b = String(tipo || '').toUpperCase().replace(/\\s+/g, ' ').trim();\n"
        '    return TIPOS[b] || null;\n'
        '  }\n\n'
        '  return { de, tipos: () => Object.keys(TIPOS) };\n'
        '})();\n', encoding='utf-8', newline='\n')
    print('catálogo:', destino, f'({len(cat)} tipos)')
