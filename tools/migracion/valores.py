"""Cómo se ve una celda como texto, IGUAL que en el código de Apps Script.

Los pasos de la migración comparan llaves como texto: `migLimpio_ = String(v).trim()` y
`migClave_ = migLimpio_(v).toUpperCase()`. Si aquí un 45 saliera "45.0", o un `true` saliera
"True", el port dejaría de emparejar lo que Apps Script sí emparejaba, sin tronar. Por eso
todo pasa por estas funciones, y tienen pruebas propias (tests_py/test_valores.py).

Los valores llegan de la API con UNFORMATTED_VALUE: texto, número (int o float) o booleano.
Las fechas llegan como número de serie; en Apps Script serían Date, pero ninguna llave ni
ID de la migración es una fecha, y para saber si una celda está vacía da lo mismo.
"""
import math

# Lo que String.prototype.trim() de JS considera espacio: los de Unicode (Zs), los saltos de
# línea y el BOM. str.strip() de Python no quita el BOM (U+FEFF), y una celda pegada desde
# Excel puede traerlo.
_ESPACIOS_JS = (
    "\t\n\v\f\r            "
    "      　﻿"
)


def numero_js(n):
    """Un número como lo escribe JS (`String(45)` → '45', `String(1.5)` → '1.5')."""
    if isinstance(n, bool):
        return "true" if n else "false"
    if isinstance(n, int):
        return str(n)
    if math.isnan(n):
        return "NaN"
    if math.isinf(n):
        return "Infinity" if n > 0 else "-Infinity"
    if n == int(n) and abs(n) < 1e21:
        return str(int(n))
    # repr da el decimal más corto que regresa al mismo float, igual que JS. Solo difiere
    # en la notación científica (1e-07 contra 1e-7), que se normaliza.
    r = repr(n)
    if "e" in r:
        mant, exp = r.split("e")
        signo = "-" if exp.startswith("-") else "+"
        r = mant + "e" + signo + exp.lstrip("+-").lstrip("0")
    return r


def texto_js(v):
    """`String(v == null ? '' : v)` de JS."""
    if v is None:
        return ""
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return numero_js(v)
    return str(v)


def limpio(v):
    """migLimpio_: el texto sin espacios a los lados."""
    return texto_js(v).strip(_ESPACIOS_JS)


def clave(v):
    """migClave_: limpio y en mayúsculas, para comparar llaves."""
    return limpio(v).upper()


def redondear_js(x):
    """Math.round de JS: .5 sube siempre (round() de Python redondea al par)."""
    return math.floor(x + 0.5)
