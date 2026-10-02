"""¿Dos libros dicen lo mismo, hoja por hoja y celda por celda? Solo lee.

Existe por el replanchado del 02/10/2026: copió VEHICULOS y CAJAS CHICAS con un filtro activo
de producción, así que solo pasaron las filas visibles —60 de 648 y 98 de 285—, repetidas en
mosaico hasta llenar el rango. Reportó «LISTO» y la bitácora dijo OK. Nadie lo notó hasta que
`revisar` encontró 539 IDs repetidos. Una copia que no se verifica no está hecha: el
replanchado de Python termina SIEMPRE con esta comparación, y si no cuadra, falla.

    uv run ... python tools/migracion/comparar.py prod lab
"""
import sys

import catalogo as cat
from valores import texto_js


def comparar_hoja(a, b):
    """Diferencias entre dos Hoja, como lista de textos (vacía si son iguales)."""
    fa, fb = a.ultima_fila(), b.ultima_fila()
    ca, cb = a.ultima_columna(), b.ultima_columna()
    difs = []
    if (fa, ca) != (fb, cb):
        difs.append("tamaño %d x %d contra %d x %d" % (fa, ca, fb, cb))
    distintas = 0
    ejemplos = []
    for r in range(1, max(fa, fb) + 1):
        for c in range(1, max(ca, cb) + 1):
            x, y = texto_js(a.celda(r, c)), texto_js(b.celda(r, c))
            if x != y:
                distintas += 1
                if len(ejemplos) < 3:
                    ejemplos.append("fila %d col %d: %r contra %r" % (r, c, x[:30], y[:30]))
    if distintas:
        difs.append("%d celdas distintas (%s)" % (distintas, "; ".join(ejemplos)))
    return difs


def comparar_libros(origen, destino, nombres, quitar_columnas=None):
    """{hoja: [diferencias]} solo de las que no cuadran. `quitar_columnas` no se usa aún."""
    salida = {}
    for n in nombres:
        a, b = origen.hoja(n), destino.hoja(n)
        if a is None or b is None:
            salida[n] = ["no existe en " + ("el origen" if a is None else "el destino")]
            continue
        d = comparar_hoja(a, b)
        if d:
            salida[n] = d
    return salida


def main():
    from conexion import abrir
    o, d = (sys.argv[1:3] + ["prod", "lab"])[:2] if len(sys.argv) < 3 else sys.argv[1:3]
    nombres = sorted(h["hoja"] for h in cat.migrables())
    origen, destino = abrir(o, nombres), abrir(d, nombres)
    difs = comparar_libros(origen, destino, nombres)
    for n in nombres:
        print("  %-28s %s" % (n, "; ".join(difs[n]) if n in difs else "idéntica"))
    print("\n%d de %d hojas con diferencias." % (len(difs), len(nombres)))


if __name__ == "__main__":
    main()
