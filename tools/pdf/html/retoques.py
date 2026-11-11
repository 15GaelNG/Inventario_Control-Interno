"""La «manita de gato» de cada documento (11-nov-2026): ajustes de FORMA acordados con el usuario sobre la plantilla ya
convertida de Docs. Nunca cambian un texto (desde-docs.py lo revisa al aplicarlos); los cambios de redacción los aprueba
el usuario uno por uno.

Cada función recibe el HTML completo y lo regresa; la usa DOCUMENTOS[<documento>]['retoque'] de desde-docs.py.
"""
import re

from inspeccion_vehicular import cierre, filas, tablas_nivel, texto


def _tabla_con(s, txt):
    """(inicio, fin) de la tabla de primer nivel que contiene txt"""
    i = s.find(txt)
    return next((a, b) for a, b in tablas_nivel(s, s.find('<body')) if a < i < b)


def _cambiar_tabla(s, txt, f):
    a, b = _tabla_con(s, txt)
    return s[:a] + f(s[a:b]) + s[b:]


def _cambiar_filas(t, cuales, f):
    """Aplica f al HTML de las filas (índices) de la tabla t; de atrás hacia adelante para no mover los índices"""
    fs = filas(t)
    for k in sorted(cuales, reverse=True):
        a, b = fs[k]
        t = t[:a] + f(t[a:b]) + t[b:]
    return t


def _alto_fila(r, pt):
    return re.sub(r'^<tr style="height:[\d.]+pt"', '<tr style="height:%gpt"' % pt, r)


def _sin_bordes(t):
    return re.sub(r'border-(top|bottom|left|right)-width:[\d.]+pt', r'border-\1-width:0', t)


# ------------------------------------------------------------------------------------------- responsiva de celular
def responsiva_celular(s):
    """La plantilla «PRUEBA RESPONSABLE 05-nov» (rama LineasResponsivasEinspecciones, 6-nov): una casilla por responsable,
    en tablas de firmas aparte (hoja 1: Flotillas y responsables 1–2, luego 3–5; hoja 2: 1–3, luego 4–5), y sin el pie
    «F-CI04-039». De la manita de gato de la del 19-oct (responsiva_celular_19oct) aplica lo de las firmas:
      - los nombres bajo la firma, abajo en su celda (con un nombre de dos renglones las rayas quedaban desparejas);
      - en la hoja 2 cada firma cuenta entera (sin :linea) y 8 pt de aire bajo la tabla de sanciones"""
    sanciones = _tabla_con(s, 'Sucesos')
    firmas = [(a, b) for a, b in tablas_nivel(s, s.find('<body')) if 'Nombre y firma' in s[a:b]]
    if len(firmas) != 4:
        raise SystemExit(f'responsiva de celular: esperaba 4 tablas de firmas ({len(firmas)})')
    hoja2 = [ab for ab in firmas if ab[0] > sanciones[1]]
    if len(hoja2) != 2:
        raise SystemExit('responsiva de celular: esperaba 2 tablas de firmas después de las sanciones')
    for a, b in reversed(firmas):
        t = _cambiar_filas(s[a:b], [1], lambda r: r.replace('vertical-align:top', 'vertical-align:bottom'))
        if (a, b) in hoja2:
            t = t.replace(':tope:linea}}', ':tope}}')
            if (a, b) == hoja2[0]:
                t = t.replace('style="', 'style="margin-top:8pt;', 1)
        s = s[:a] + t + s[b:]
    return s


def responsiva_celular_19oct(s):
    """La de la plantilla «PRUEBA RESPONSABLE 19-oct» (un solo recuadro de firma por lado); se queda por si se vuelve a
    convertir esa plantilla"""
    # 1. El pie de borde a borde y de una pieza: los bordes blancos de 1 pt entre sus celdas lo partían en dos y empezaba
    #    a 16 pt del borde. La primera columna absorbe el margen del cuerpo (el texto no se mueve) y el código va a la
    #    derecha, como en las cartas vehiculares
    def pie(t):
        t = _sin_bordes(t)
        # El fondo también en la tabla: entre dos celdas pintadas, el visor dejaba una costura clara
        t = t.replace('width:595.50pt;margin-left:1.6pt', 'width:612pt;margin-left:-14.2pt;background-color:#06263a', 1)
        t = t.replace('<col style="width:18.00pt">', '<col style="width:33.80pt">', 1)
        t = t.replace('<col style="width:84.75pt">', '<col style="width:85.45pt">', 1)
        t = t.replace('width:18pt;', 'width:33.8pt;', 1).replace('width:84.8pt;', 'width:85.45pt;', 1)
        t = re.sub(r'(<p style="white-space:nowrap;[^"]*?)text-align:left', r'\1text-align:right', t, count=1)
        return t
    s = _cambiar_tabla(s, 'F-CI04-039', pie)

    # 2. La tabla de la hoja 1: encabezado a la derecha, datos parejos, rayas de firma a la misma altura
    def hoja1(t):
        # Título, fecha y NUCO / Sede alineados a la derecha (al mismo margen que el párrafo)
        t = _cambiar_filas(t, [1, 5, 6], lambda r: re.sub(r'text-align:(left|center)', 'text-align:right', r))
        # Los renglones de datos (Número telefónico … Director de Dpto.) al mismo paso (iban a 0, 9.8, 30.8, 20.2 y 23.2 pt)
        t = _cambiar_filas(t, range(9, 16), lambda r: _alto_fila(r, 18))
        # Los nombres bajo la firma, abajo en su celda: con un nombre de dos renglones las rayas quedaban desparejas
        t = _cambiar_filas(t, [22], lambda r: r.replace('vertical-align:middle', 'vertical-align:bottom'))
        return t
    s = _cambiar_tabla(s, '{{NUCO4}}', hoja1)

    # 3. Hoja 2: la firma del responsable se encimaba sobre el último renglón de las sanciones (con :linea cuenta solo
    #    1/1.211 de su alto); aquí cuenta entera y su renglón crece lo que necesita (hay ~38 pt libres al pie)
    #    Y 8 pt de aire bajo la tabla: pegada a su borde, una firma cortada arriba parecía metida detrás (10-nov)
    def sanciones(t):
        t = t.replace(':tope:linea}}', ':tope}}')
        i = t.find('{{#SI ADICIONALES}}{{IMG:FIRMA RESPONSABLE')
        a = t.rfind('<td ', 0, i)
        return t[:a] + t[a:].replace('style="', 'style="padding-top:8pt;', 1)
    s = _cambiar_tabla(s, 'Sucesos', sanciones)
    return s


# --------------------------------------------------------------------------------------------- inspección de celular
def inspeccion_celular(s):
    """Las dos variantes: el contenido iba de 6 a 842 pt en una hoja de 842 (lo de la derecha tocaba la orilla y se
    cortaba). Al 96 % y corrido, queda con unos 20 pt de margen a cada lado y arriba; nada más cambia"""
    viejo = 'padding:16.7pt 2.8pt 0 12.8pt'
    if s.count(viejo) != 1:
        raise SystemExit('inspección de celular: no encontré el relleno del cuerpo')
    # Medido en Chrome: lo visible va de x = 6.1 a 842.4 y desde y = 17.1 (con el relleno de antes)
    return s.replace(viejo, 'zoom:0.96;padding:20.4pt 4pt 0 27pt')


# ----------------------------------------------------------------------------------------------------------- arqueo
def _tabla_interna(s, txt):
    """(inicio, fin) de la tabla más interna que contiene txt"""
    i = s.find(txt)
    mejor = None
    for m in re.finditer(r'<table\b', s[:i]):
        b = cierre(s, m.start())
        if b > i:
            mejor = (m.start(), b)
    return mejor


def arqueo(s):
    # 1. Hoja 1: los seis cuadros en tres renglones parejos (Datos de la caja | Datos inicio/fin, Método | Observaciones,
    #    Parámetros | Calificación). Antes la columna derecha era otra tabla con un hueco fijo de 95 pt y quedaba 16 pt
    #    más arriba que la izquierda (y más o menos según los datos: un nombre de dos renglones alarga la izquierda)
    ia, ib = _tabla_interna(s, 'DATOS DE LA CAJA CHICA')
    da, db = _tabla_interna(s, 'DATOS INICIO / FIN DEL ARQUEO')
    # La tabla de afuera: la más interna que tiene a las dos
    afuera = None
    for m in re.finditer(r'<table\b', s[:ia]):
        b = cierre(s, m.start())
        if b > db:
            afuera = (m.start(), b)
    fa, fb = afuera
    izq, der = s[ia:ib], s[da:db]
    fi, fd = filas(izq), filas(der)
    if len(fi) != 17 or len(fd) != 8:
        raise SystemExit(f'arqueo: esperaba 17 y 8 renglones en los cuadros de la hoja 1 ({len(fi)} y {len(fd)})')
    abre_i, abre_d = re.match(r'<table[^>]*>', izq).group(0), re.match(r'<table[^>]*>', der).group(0)
    sub = lambda abre, t, f, a, b: abre + ''.join(t[x:y] for x, y in f[a:b + 1]) + '</table>'
    celdas = re.findall(r'<td\b[^>]*>', s[fa:ia] + s[ib:da])
    td_i, td_d = celdas[-2], celdas[-1]
    arriba = lambda td, aire: re.sub(r'vertical-align:\w+', 'vertical-align:top', td).replace('style="', 'style="padding-top:%gpt;' % aire, 1)
    renglones = [((0, 6), (0, 1), 0), ((8, 11), (3, 4), 12.8), ((13, 16), (6, 7), 12.8)]   # 12.8 pt: el aire de antes
    nueva = re.match(r'<table[^>]*>', s[fa:fb]).group(0) + ''.join(
        '<tr>' + arriba(td_i, aire) + sub(abre_i, izq, fi, *ri) + '</td>' + arriba(td_d, aire) + sub(abre_d, der, fd, *rd) +
        '</td></tr>' for ri, rd, aire in renglones) + '</table>'
    s = s[:fa] + nueva + s[fb:]

    # 2. Hoja 3 (el desglose): con los márgenes de las tablas de las hojas 1 y 2 (empezaba 7.4 pt más a la izquierda,
    #    4.6 más a la derecha y 17 pt más arriba)
    i = s.find('DESGLOSE - AUDITORIA CONTROL INTERNO')
    a = s.rfind('<p ', 0, i)
    resto = s[a:]
    resto = resto.replace('style="padding:16pt 0 0 0;margin:0;', 'style="padding:33pt 4.6pt 0 7.4pt;margin:0;', 1)
    resto = resto.replace('<p style="padding:0;margin:0;', '<p style="padding:0 4.6pt 0 7.4pt;margin:0;')
    return s[:a] + resto
