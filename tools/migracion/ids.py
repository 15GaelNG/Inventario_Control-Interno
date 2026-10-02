"""Port de src/utils/Ids.gs: la forma de los IDs del sistema. Ver docs/ids-asignacion.md.

    PRE-TTTTTTTTRRRRRR    3 letras · 8 de tiempo (base32) · 6 al azar

Solo lo que usa la migración: `de_legado` (el ID que le toca al renglón i), `tiene_forma` y
`prefijo`. Los IDs de las altas nuevas los sigue generando Apps Script (Ids.nuevo).

El azar sale de una fuente inyectable. En la corrida real es `random.SystemRandom`; en las
pruebas de paridad es `Mulberry32`, el mismo generador con semilla que usa el oráculo de JS
(tests/fakes/libro-en-memoria.js), así que los dos lados sacan exactamente los mismos IDs.
"""
import random
import re

from valores import limpio

ALFABETO = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
LARGO_TIEMPO = 8
LARGO_AZAR = 6
LEGADO_LIMITE_MS = 24 * 60 * 60 * 1000
FORMA = re.compile(r"^[A-Z]{3}-[0-9A-HJKMNP-TV-Z]{14}$")


class Mulberry32:
    """mulberry32, idéntico al de JS (Math.imul y desplazamientos sin signo de 32 bits)."""

    def __init__(self, semilla):
        self.a = semilla & 0xFFFFFFFF

    @staticmethod
    def _imul(x, y):
        r = (x * y) & 0xFFFFFFFF
        return r - 0x100000000 if r & 0x80000000 else r

    def random(self):
        self.a = (self.a + 0x6D2B79F5) & 0xFFFFFFFF
        t = self.a
        t = self._imul(t ^ (t >> 15), (t | 1)) & 0xFFFFFFFF
        t = (t ^ ((t + (self._imul(t ^ (t >> 7), (t | 61)) & 0xFFFFFFFF)) & 0xFFFFFFFF)) & 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296


def a_base32(numero, largo):
    n = int(numero)
    salida = ""
    while n > 0:
        salida = ALFABETO[n % 32] + salida
        n //= 32
    salida = salida.rjust(largo, "0")
    if len(salida) > largo:
        raise ValueError("El número %s no cabe en %d símbolos base32" % (numero, largo))
    return salida


class Ids:
    def __init__(self, azar=None):
        self.azar = azar or random.SystemRandom()

    def _azar(self, largo):
        # Math.floor(Math.random() * 32), un símbolo a la vez, en el mismo orden que JS
        return "".join(ALFABETO[int(self.azar.random() * 32)] for _ in range(largo))

    def de_legado(self, prefijo, indice):
        if not isinstance(indice, int) or indice < 0:
            raise ValueError('El índice del renglón debe ser un entero desde 0, no "%s"' % indice)
        if indice >= LEGADO_LIMITE_MS:
            raise ValueError("Demasiados renglones para el bloque de legado")
        p = limpio(prefijo).upper()
        if not re.match(r"^[A-Z]{3}$", p):
            raise ValueError('El prefijo debe ser 3 letras, no "%s"' % prefijo)
        return p + "-" + a_base32(indice, LARGO_TIEMPO) + self._azar(LARGO_AZAR)


def tiene_forma(v):
    return bool(FORMA.match(limpio(v).upper()))


def prefijo(v):
    return limpio(v).upper()[:3] if tiene_forma(v) else None
